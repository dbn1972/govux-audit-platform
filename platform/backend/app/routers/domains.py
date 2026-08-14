"""Domain registration & ownership verification (restricted to gov.in/nic.in)."""
import re
import secrets
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, desc
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from ..database import get_db
from .. import models
from ..deps import current_user, require_role
from ..services import verification, url_validate, cache, settings_store, audit_log

router = APIRouter(prefix="/v1/domains", tags=["domains"])
GOV = re.compile(r"(\.gov\.in|\.nic\.in)$", re.I)


def _domains_key(org_id) -> str:
    return cache.cache_key("domains", str(org_id))


class DomainCreate(BaseModel):
    url: str
    service_category: str | None = None
    size_class: str | None = None


class VerifyRequest(BaseModel):
    # Constrained, not a free string. It used to be `str`, and `verification.verify`
    # treated the undelivered `sso_mapping` method as out-of-band success — so any
    # signed-in user could register any unclaimed .gov.in domain and self-verify it
    # with {"method": "sso_mapping"}, bypassing ownership proof entirely and then
    # auditing a domain they do not control. Only the two real, checkable proofs
    # are accepted; anything else is a 422 before it reaches the service.
    method: Literal["dns_txt", "file_upload"] = "dns_txt"


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
                        # The DNS-TXT value was previously returned ONLY by the
                        # registration response, so leaving the page lost it for
                        # good — and since DNS can take 30 minutes to propagate,
                        # leaving is the normal case. A pending domain could then
                        # never be verified (re-registering 409s), and an
                        # unverified domain can never be audited. Returned for
                        # pending rows only; a verified domain has no use for it.
                        "verify_token": d.verify_token if d.verify_status != "verified" else None,
                        # lets the UI distinguish a proven domain from one a
                        # steward vouched for
                        "verify_method": d.verify_method,
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
    # Registration is a CLAIM, not ownership. Several organisations may hold a
    # pending claim on the same host and race to prove control — previously the
    # first registration won globally and could never be released, so anyone
    # could permanently block a domain they did not own by registering and never
    # verifying it.
    claims = db.query(models.Domain).filter(models.Domain.url == url).all()
    if any(c.verify_status == "verified" for c in claims):
        owner = next(c for c in claims if c.verify_status == "verified")
        if owner.org_id == user.org_id:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "Your organisation has already verified this domain")
        # don't name the other organisation — that is not this caller's business
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This domain has already been verified by another organisation. "
                            "If that is wrong, ask a programme admin to review the claim.")
    if any(c.org_id == user.org_id for c in claims):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Your organisation already has a pending claim on this domain")

    # Auto-provision an organisation for an org-less account on its first domain.
    # This is the CHOSEN onboarding path, not a leftover shortcut: self-service
    # signup stands until Parichay SSO lands, at which point org assignment moves
    # to the SSO claim and this branch becomes the fallback for invite-less
    # accounts. Consequence to keep in view: two colleagues from one department
    # who both self-serve end up in two separate organisations, and then contend
    # for the same domain through the claim-race path below.
    if not user.org_id:
        org = models.Organisation(name=f"{user.email.split('@')[0]}'s Organisation",
                                  org_type="department")
        db.add(org)
        db.flush()
        user.org_id = org.id

    tld = "nic.in" if url.endswith("nic.in") else "gov.in"
    d = models.Domain(org_id=user.org_id, url=url, tld=tld,
                      service_category=body.service_category, size_class=body.size_class,
                      verify_status="pending", verify_token="govux-verify=" + secrets.token_hex(8),
                      created_by=user.id)
    db.add(d)
    db.commit()
    cache.invalidate(_domains_key(user.org_id))   # the list changed
    return {"id": str(d.id), "url": d.url, "verify_token": d.verify_token, "verify_status": d.verify_status}


@router.get("/claims", tags=["admin-registry"])
def list_claims(contested_only: bool = False, db: Session = Depends(get_db),
                user=Depends(require_role("programme_admin", "super_admin"))):
    """Every unverified domain claim, with the organisation behind it.

    Stewards need this because proof alone can't settle everything: a squatter
    who registers a domain and never verifies it still occupies a claim, and the
    real owner has no way to see who holds it. `contested_only` narrows to hosts
    where more than one organisation is claiming."""
    rows = (db.query(models.Domain, models.Organisation.name)
              .join(models.Organisation, models.Organisation.id == models.Domain.org_id)
              .filter(models.Domain.verify_status != "verified")
              .order_by(models.Domain.url, models.Domain.created_at).all())
    by_host: dict[str, list] = {}
    for d, org_name in rows:
        by_host.setdefault(d.url, []).append(
            {"id": str(d.id), "org_id": str(d.org_id), "org_name": org_name,
             "verify_status": d.verify_status, "created_at": d.created_at})
    # a host is "contested" when two organisations are both still claiming it
    items = [{"url": host, "contested": len(cs) > 1, "claims": cs}
             for host, cs in by_host.items()
             if not contested_only or len(cs) > 1]
    items.sort(key=lambda i: (not i["contested"], i["url"]))
    return {"total": len(items), "items": items}


@router.delete("/claims/{domain_id}", status_code=204)
def release_claim(domain_id: str, db: Session = Depends(get_db),
                  user=Depends(require_role("programme_admin", "super_admin"))):
    """Release an unverified claim so the host is free to be claimed again.

    Refuses to touch a verified domain: ownership that has been proven is not a
    steward's to revoke, and deleting it would orphan its audit history."""
    d = db.get(models.Domain, domain_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
    if d.verify_status == "verified":
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This domain is verified — ownership was proven and cannot be "
                            "released here.")
    org_id, url = d.org_id, d.url
    db.delete(d)
    db.commit()
    cache.invalidate(_domains_key(org_id))
    audit_log.record(db, user.id, "domain_claim_released", target=url,
                     detail={"org_id": str(org_id)})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class ForceVerifyRequest(BaseModel):
    # Mandatory and substantive: the whole value of an override is that someone
    # is on record for it. A blank or one-word justification defeats the point.
    reason: str = Field(..., min_length=10, max_length=500)


@router.post("/{domain_id}/force-verify")
def force_verify_domain(domain_id: str, body: ForceVerifyRequest,
                        db: Session = Depends(get_db),
                        user=Depends(require_role("programme_admin", "super_admin"))):
    """Steward override: mark a domain verified WITHOUT ownership proof.

    Real cases exist — a ministry owns the site but DNS sits with a third party
    and the paperwork outlasts the audit. What must not exist is a silent
    bypass: this used to ride on `sso_mapping`, which `verification.verify`
    returned True for unconditionally, so ANY signed-in user could self-verify
    any unclaimed .gov.in domain by naming that method.

    So the override is now: steward-only, requires a written reason, recorded as
    `verify_method='steward_override'` (never mistakable for a DNS/file proof)
    and written to the audit log with the actor.
    """
    d = db.get(models.Domain, domain_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domain not found")
    if d.verify_status == "verified":
        raise HTTPException(status.HTTP_409_CONFLICT, "This domain is already verified")

    # a competing claim may already have PROVEN ownership of this host
    proven = (db.query(models.Domain)
                .filter(models.Domain.url == d.url, models.Domain.id != d.id,
                        models.Domain.verify_status == "verified").first())
    if proven:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Another organisation has already proven ownership of this domain. "
                            "Release their claim first if that is wrong.")

    d.verify_status = "verified"
    d.verify_method = "steward_override"
    # settle the race exactly as a real proof does — an override still decides the host
    losers = (db.query(models.Domain)
                .filter(models.Domain.url == d.url, models.Domain.id != d.id,
                        models.Domain.verify_status != "verified").all())
    for loser in losers:
        loser.verify_status = "superseded"
    db.commit()

    cache.invalidate(_domains_key(d.org_id))
    for org_id in {l.org_id for l in losers}:
        cache.invalidate(_domains_key(org_id))
    audit_log.record(db, user.id, "domain_force_verified", target=d.url,
                     detail={"org_id": str(d.org_id), "reason": body.reason,
                             "superseded_claims": len(losers)})
    db.commit()
    return {"id": str(d.id), "url": d.url, "verify_status": d.verify_status,
            "verify_method": d.verify_method, "superseded_claims": len(losers),
            "detail": "Verified by steward override — ownership was not proven."}


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

    superseded = 0
    if verified:
        # Proof settles the race: every competing claim on this host loses. They
        # are marked `superseded` (not `failed` — their own token was never the
        # problem) so they drop out of uq_domain_verified_url and the claimant
        # sees an honest reason.
        losers = (db.query(models.Domain)
                    .filter(models.Domain.url == d.url, models.Domain.id != d.id,
                            models.Domain.verify_status != "verified").all())
        for loser in losers:
            loser.verify_status = "superseded"
        superseded = len(losers)
    db.commit()

    cache.invalidate(_domains_key(d.org_id))      # verify_status changed
    if verified:
        for org_id in {l.org_id for l in losers}:  # their lists changed too
            cache.invalidate(_domains_key(org_id))
    return {"id": str(d.id), "verify_status": d.verify_status,
            "superseded_claims": superseded,
            "detail": ("ownership proven" if verified else
                       "verification token not found via " + body.method)}
