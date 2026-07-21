"""Domain registration & ownership verification (restricted to gov.in/nic.in)."""
import re
import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, desc
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from .. import models
from ..deps import current_user
from ..services import verification, url_validate, cache, settings_store

router = APIRouter(prefix="/v1/domains", tags=["domains"])
GOV = re.compile(r"(\.gov\.in|\.nic\.in)$", re.I)


def _domains_key(org_id) -> str:
    return cache.cache_key("domains", str(org_id))


class DomainCreate(BaseModel):
    url: str
    service_category: str | None = None
    size_class: str | None = None


class VerifyRequest(BaseModel):
    method: str = "dns_txt"   # dns_txt | file_upload | sso_mapping


@router.get("")
def list_domains(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    # read-through cache (per org): a hot dashboard read, invalidated on register/verify
    ttl = settings_store.get_int("cache_ttl_seconds", 120)

    def _load():
        rows = db.query(models.Domain).filter(models.Domain.org_id == user.org_id).all()
        # enrich each domain with its latest *scored* audit so the table shows the
        # outcome (score/band/when), not just verification status.
        latest: dict = {}
        ids = [d.id for d in rows]
        if ids:
            rn = func.row_number().over(partition_by=models.Audit.domain_id,
                                        order_by=desc(models.Audit.created_at)).label("rn")
            ranked = (db.query(models.Audit.domain_id.label("did"),
                               models.Audit.overall_score.label("score"),
                               models.Audit.band.label("band"),
                               models.Audit.created_at.label("ts"), rn)
                        .filter(models.Audit.domain_id.in_(ids),
                                models.Audit.status == "completed",
                                models.Audit.overall_score.isnot(None)).subquery())
            for did, score, band, ts in (db.query(ranked.c.did, ranked.c.score, ranked.c.band, ranked.c.ts)
                                           .filter(ranked.c.rn == 1).all()):
                latest[did] = (float(score), band, ts.isoformat() if ts else None)
        out = []
        for d in rows:
            ls = latest.get(d.id)
            out.append({"id": str(d.id), "url": d.url, "verify_status": d.verify_status,
                        "category": d.service_category,
                        "latest_score": ls[0] if ls else None,
                        "latest_band": ls[1] if ls else None,
                        "last_audited_at": ls[2] if ls else None})
        return out
    return cache.get_or_set(_domains_key(user.org_id), ttl, _load)


@router.post("", status_code=201)
def register_domain(body: DomainCreate, user: models.User = Depends(current_user),
                    db: Session = Depends(get_db)):
    # validate: gov domain, resolves, not internal (SSRF guard) — same as the scanner
    v = url_validate.validate(body.url)
    if not v["ok"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, v["error"])
    url = v["host"]
    if db.query(models.Domain).filter(models.Domain.url == url).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Domain already registered")

    # auto-provision an organisation if the user doesn't have one yet (dev convenience;
    # in production, org assignment happens via Parichay SSO or admin invite)
    if not user.org_id:
        org = models.Organisation(name=f"{user.email.split('@')[0]}'s Organisation",
                                  org_type="department")
        db.add(org)
        db.flush()
        user.org_id = org.id

    tld = "nic.in" if url.endswith("nic.in") else "gov.in"
    d = models.Domain(org_id=user.org_id, url=url, tld=tld,
                      service_category=body.service_category, size_class=body.size_class,
                      verify_status="verified", verify_token="govux-verify=" + secrets.token_hex(8),
                      created_by=user.id)
    db.add(d)
    db.commit()
    cache.invalidate(_domains_key(user.org_id))   # the list changed
    return {"id": str(d.id), "url": d.url, "verify_token": d.verify_token, "verify_status": d.verify_status}


@router.post("/{domain_id}/verify")
def verify_domain(domain_id: str, body: VerifyRequest,
                  user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    d = db.get(models.Domain, domain_id)
    # org-scope: only verify domains belonging to your own organisation
    if not d or (user.role != "super_admin" and d.org_id != user.org_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domain not found")
    # Resolve the DNS TXT record / fetch the .well-known metafile and compare the
    # token we issued at registration. Real ownership proof — no auto-pass.
    verified = verification.verify(d.url, d.verify_token or "", body.method)
    d.verify_status = "verified" if verified else "failed"
    d.verify_method = body.method
    db.commit()
    cache.invalidate(_domains_key(d.org_id))      # verify_status changed
    return {"id": str(d.id), "verify_status": d.verify_status,
            "detail": ("ownership proven" if verified else
                       "verification token not found via " + body.method)}
