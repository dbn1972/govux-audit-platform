"""National domain register — bulk CSV import (steward only).

The National Dashboard, League Table, Ministries and States & UTs screens are all
built to report on the whole `.gov.in` estate, but there was no way to get more
than a handful of domains into the platform: `POST /v1/domains` registers one at
a time and is scoped to the caller's own organisation. So the entire steward tier
had nothing meaningful to show.

This imports a registry extract in one call: each row maps a domain to an
organisation (created on first sight), so `coverage_pct`, the band distribution
and the per-ministry / per-state roll-ups have real denominators.

Imported domains land as `verify_status='pending'` on purpose — being listed in
the national register is NOT proof of ownership. DNS-TXT verification stays the
only route to `verified`, and only a verified domain can be audited by its owner.
"""
import csv
import io
import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..deps import require_role
from ..services import audit_log, cache

router = APIRouter(prefix="/v1/admin/registry", tags=["admin-registry"])

MAX_ROWS = 5000          # one request; larger extracts are imported in batches
ORG_TYPES = ("ministry", "department", "state", "ut", "psu", "other")

# Format-only check. Deliberately NOT url_validate.validate(): that resolves DNS
# for SSRF safety, which is right for a user-submitted single domain but would
# mean thousands of lookups here — and a register legitimately lists domains that
# are down, parked or internal-only. The gov-suffix invariant is still enforced,
# here and again by the chk_gov_domain CHECK constraint.
_HOST = re.compile(r"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+(gov|nic)\.in$")


class RegistryImport(BaseModel):
    csv: str = Field(..., max_length=2_000_000)
    dry_run: bool = True          # preview by default; writing is the explicit choice


def _clean_host(raw: str) -> str:
    h = (raw or "").strip().lower()
    h = re.sub(r"^[a-z]+://", "", h)      # tolerate a full URL in the column
    h = h.split("/")[0].split("?")[0]
    return h.rstrip(".")


@router.post("/import")
def import_registry(body: RegistryImport, db: Session = Depends(get_db),
                    user=Depends(require_role("programme_admin", "super_admin"))):
    """Import a CSV extract of the national register.

    Columns (header row required, order-independent, extra columns ignored):
        url            required   e.g. indiapost.gov.in
        organisation   required   owning body; created if not already present
        org_type       optional   ministry|department|state|ut|psu|other (default department)
        state_code     optional   feeds the States & UTs roll-up
        category       optional   service_category, feeds segmented rankings
    """
    try:
        reader = csv.DictReader(io.StringIO(body.csv))
        rows = list(reader)
    except csv.Error as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not parse the CSV: {exc}")
    if not rows:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The CSV has a header but no rows.")
    if len(rows) > MAX_ROWS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"{len(rows)} rows exceeds the {MAX_ROWS}-row limit — split the file.")
    field_map = {(f or "").strip().lower(): f for f in (reader.fieldnames or [])}
    for required in ("url", "organisation"):
        if required not in field_map:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"Missing required column '{required}'.")

    def col(row, name):
        f = field_map.get(name)
        return (row.get(f) or "").strip() if f else ""

    existing = {u for (u,) in db.query(models.Domain.url).all()}
    orgs = {o.name.lower(): o for o in db.query(models.Organisation).all()}
    new_orgs: dict[str, models.Organisation] = {}

    imported = duplicates = 0
    errors: list[dict] = []
    seen: set[str] = set()          # duplicates WITHIN the file

    for i, row in enumerate(rows, start=2):        # row 1 is the header
        host = _clean_host(col(row, "url"))
        org_name = col(row, "organisation")
        if not host or not org_name:
            errors.append({"row": i, "url": host, "error": "url and organisation are both required"})
            continue
        if not _HOST.match(host):
            errors.append({"row": i, "url": host,
                           "error": "not a valid .gov.in / .nic.in domain"})
            continue
        if host in existing or host in seen:
            duplicates += 1
            continue

        org_type = (col(row, "org_type") or "department").lower()
        if org_type not in ORG_TYPES:
            errors.append({"row": i, "url": host, "error": f"unknown org_type '{org_type}'"})
            continue

        key = org_name.lower()
        org = orgs.get(key) or new_orgs.get(key)
        if org is None:
            org = models.Organisation(name=org_name, org_type=org_type,
                                      state_code=col(row, "state_code") or None)
            new_orgs[key] = org
            if not body.dry_run:
                db.add(org)
                db.flush()

        seen.add(host)
        imported += 1
        if not body.dry_run:
            db.add(models.Domain(
                org_id=org.id, url=host,
                tld="nic.in" if host.endswith("nic.in") else "gov.in",
                service_category=col(row, "category") or None,
                verify_status="pending", created_by=user.id))

    if not body.dry_run:
        db.commit()
        # the register size changes coverage %, the band denominators and every
        # per-org / per-state roll-up
        for pfx in ("national", "rankings", "ministries", "states", "domains", "alerts"):
            cache.invalidate_prefix(pfx)
        audit_log.record(db, user.id, "registry_import",
                         detail={"domains": imported, "organisations": len(new_orgs),
                                 "duplicates": duplicates, "errors": len(errors)})
        db.commit()

    return {
        "dry_run": body.dry_run,
        "total_rows": len(rows),
        "imported": imported,
        "duplicates": duplicates,
        "invalid": len(errors),
        "new_organisations": sorted(o.name for o in new_orgs.values()),
        # capped: a malformed 5,000-row file shouldn't return a 5,000-item payload
        "errors": errors[:50],
        "errors_truncated": max(0, len(errors) - 50),
    }
