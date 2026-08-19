"""National roll-up & segmented rankings (steward view)."""
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..deps import require_role
from ..services import cache, settings_store, audit_log, national_brief
from ..services.scoring import band_for
from ..config import settings

router = APIRouter(prefix="/v1", tags=["national"])


def _ttl() -> int:
    # admin-configurable dashboard cache TTL; invalidated by the worker on completion
    return settings_store.get_int("cache_ttl_seconds", 120)


@router.get("/national")
def national(db: Session = Depends(get_db),
             user=Depends(require_role("programme_admin", "super_admin"))):
    # read-heavy aggregate -> cache-aside via Redis, DB only on miss (docs/DATA_ACCESS.md)
    return cache.get_or_set(cache.cache_key("national"), _ttl(), lambda: _national(db))


def _latest_completed_subq(db: Session):
    """One row per domain: its MOST RECENT completed audit (window row_number=1).

    Roll-ups must count each domain once by its latest result — otherwise a domain
    audited weekly for a year contributes ~50 rows, skewing national averages and
    letting the same domain appear repeatedly in the league table.
    """
    rn = func.row_number().over(
        partition_by=models.Audit.domain_id,
        # id breaks a created_at tie: two audits stamped in the same instant
        # would otherwise make the national roll-ups nondeterministic
        order_by=(desc(models.Audit.created_at), desc(models.Audit.id))).label("rn")
    ranked = (db.query(
                models.Audit.domain_id.label("did"),
                models.Audit.overall_score.label("score"),
                models.Audit.band.label("band"),
                rn)
              # a "completed" audit can still lack a score (e.g. legacy rows); a
              # roll-up/league must rank on a real number, not a NULL that sorts
              # NULLS-FIRST to the top of a DESC order.
              .filter(models.Audit.status == "completed",
                      models.Audit.overall_score.isnot(None)).subquery())
    return db.query(ranked).filter(ranked.c.rn == 1).subquery()


def _national(db: Session):
    domains_total = db.query(func.count(models.Domain.id)).scalar() or 0
    latest = _latest_completed_subq(db)
    audited = db.query(func.count(latest.c.did)).scalar() or 0
    avg_score = db.query(func.avg(latest.c.score)).scalar()

    dist = dict(db.query(latest.c.band, func.count(latest.c.did))
                  .group_by(latest.c.band).all())
    band_distribution = {b: int(dist.get(b, 0)) for b in "ABCDE"}

    league = (db.query(models.Domain.url, latest.c.score, latest.c.band)
                .join(latest, latest.c.did == models.Domain.id)
                .order_by(desc(latest.c.score)).limit(10).all())

    return {
        "domains_total": domains_total,
        "audited": audited,
        "coverage_pct": round(100 * audited / domains_total, 1) if domains_total else 0,
        "avg_score": round(float(avg_score), 1) if avg_score else None,
        "band_distribution": band_distribution,
        "league": [{"url": u, "score": float(s) if s else None, "band": b} for u, s, b in league],
    }


@router.get("/national/brief.pdf")
def national_brief_pdf(db: Session = Depends(get_db),
                       user=Depends(require_role("programme_admin", "super_admin"))):
    """The dashboard as a one-page PDF a steward can circulate.

    Built from the same cached payload the screen renders, so the brief and the
    dashboard can never disagree — and stamped with the generation time and
    engine version, which a screen can leave implicit and a document passed
    around a ministry cannot.
    """
    data = cache.get_or_set(cache.cache_key("national"), _ttl(), lambda: _national(db))
    pdf = national_brief.build(data, engine_version=settings.engine_version)
    audit_log.record(db, actor_id=getattr(user, "id", None), action="national.brief.export",
                     target="national", detail={"audited": data.get("audited"),
                                                "coverage_pct": data.get("coverage_pct")})
    db.commit()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="govux-national-brief-{stamp}.pdf"'})


@router.get("/rankings")
def rankings(category: str | None = None, size_class: str | None = None,
             db: Session = Depends(get_db),
             user=Depends(require_role("programme_admin", "super_admin"))):
    """Segmented, like-for-like ranking (by category / size)."""
    key = cache.cache_key("rankings", category or "-", size_class or "-")
    return cache.get_or_set(key, _ttl(), lambda: _rankings(db, category, size_class))


def _rankings(db: Session, category: str | None, size_class: str | None):
    latest = _latest_completed_subq(db)   # latest audit per domain only (no history double-count)
    q = (db.query(models.Domain.url, models.Domain.service_category,
                  latest.c.score, latest.c.band)
           .join(latest, latest.c.did == models.Domain.id))
    if category:
        q = q.filter(models.Domain.service_category == category)
    if size_class:
        q = q.filter(models.Domain.size_class == size_class)
    rows = q.order_by(desc(latest.c.score)).limit(50).all()
    return {"segment": {"category": category, "size_class": size_class},
            "ranking": [{"url": u, "category": c, "score": float(s) if s else None, "band": b}
                        for u, c, s, b in rows]}


@router.get("/ministries")
def ministries(db: Session = Depends(get_db),
               user=Depends(require_role("programme_admin", "super_admin"))):
    """Quality grouped by organisation (ministry / department), latest audit per domain."""
    return cache.get_or_set(cache.cache_key("ministries"), _ttl(), lambda: _ministries(db))


def _ministries(db: Session):
    latest = _latest_completed_subq(db)
    rows = (db.query(models.Organisation.name, func.count(latest.c.did), func.avg(latest.c.score))
              .join(models.Domain, models.Domain.org_id == models.Organisation.id)
              .join(latest, latest.c.did == models.Domain.id)
              .group_by(models.Organisation.name)
              .order_by(desc(func.avg(latest.c.score))).all())
    return {"ministries": [{"name": n, "domains": int(c), "avg_score": round(float(a), 1),
                            "band": band_for(float(a))} for n, c, a in rows]}


@router.get("/states")
def states(db: Session = Depends(get_db),
           user=Depends(require_role("programme_admin", "super_admin"))):
    """Average GovUX Score by state / UT (organisations.state_code)."""
    return cache.get_or_set(cache.cache_key("states"), _ttl(), lambda: _states(db))


def _states(db: Session):
    latest = _latest_completed_subq(db)
    rows = (db.query(models.Organisation.state_code, func.count(latest.c.did), func.avg(latest.c.score))
              .join(models.Domain, models.Domain.org_id == models.Organisation.id)
              .join(latest, latest.c.did == models.Domain.id)
              .filter(models.Organisation.state_code.isnot(None))
              .group_by(models.Organisation.state_code)
              .order_by(desc(func.avg(latest.c.score))).all())
    return {"states": [{"code": sc, "avg_score": round(float(a), 1), "domains": int(c)}
                       for sc, c, a in rows]}


@router.get("/alerts")
def alerts(db: Session = Depends(get_db),
          user=Depends(require_role("programme_admin", "super_admin"))):
    """Exception alerts — where quality is at risk, for early intervention.
    Was illustrative placeholder data; now computed from real audits."""
    return cache.get_or_set(cache.cache_key("alerts"), _ttl(), lambda: _alerts(db))


def _alerts(db: Session):
    now = datetime.now(timezone.utc)
    month_ago = now - timedelta(days=30)

    # like _latest_completed_subq, but ranks EVERY completed audit per domain (not
    # just rn==1) so rn==2 gives us "the one before the latest" for regressions,
    # and carries guardrail_active/created_at which the shared helper doesn't.
    rn = func.row_number().over(
        partition_by=models.Audit.domain_id,
        order_by=desc(models.Audit.created_at)).label("rn")
    ranked = (db.query(
                models.Audit.domain_id.label("did"),
                models.Audit.overall_score.label("score"),
                models.Audit.band.label("band"),
                models.Audit.guardrail_active.label("guardrail_active"),
                models.Audit.created_at.label("created_at"),
                rn)
              .filter(models.Audit.status == "completed",
                      models.Audit.overall_score.isnot(None)).subquery())
    latest = db.query(ranked).filter(ranked.c.rn == 1).subquery()
    previous = db.query(ranked).filter(ranked.c.rn == 2).subquery()

    domains_total = db.query(func.count(models.Domain.id)).scalar() or 0
    band_e_count = db.query(func.count(latest.c.did)).filter(latest.c.band == "E").scalar() or 0
    never_audited_count = (db.query(func.count(models.Domain.id))
                             .filter(~models.Domain.id.in_(db.query(latest.c.did))).scalar() or 0)
    spike_count = (db.query(func.count(latest.c.did))
                    .filter(latest.c.guardrail_active.is_(True)).scalar() or 0)

    drop = (previous.c.score - latest.c.score)
    regressed = (db.query(models.Domain.url, latest.c.score, previous.c.score)
                   .join(latest, latest.c.did == models.Domain.id)
                   .join(previous, previous.c.did == models.Domain.id)
                   .filter(latest.c.created_at >= month_ago, drop >= 5)
                   .order_by(desc(drop)).all())
    worst = regressed[0] if regressed else None

    items = []
    if band_e_count:
        top_org = (db.query(models.Organisation.name, func.avg(latest.c.score))
                     .join(models.Domain, models.Domain.org_id == models.Organisation.id)
                     .join(latest, latest.c.did == models.Domain.id)
                     .filter(latest.c.band == "E")
                     .group_by(models.Organisation.name)
                     .order_by(func.count(latest.c.did).desc()).first())
        detail = (f"Highest concentration in {top_org[0]} · avg {round(float(top_org[1]))}"
                  if top_org else "See the League Table for detail.")
        items.append({"severity": "critical",
                      "title": f"{band_e_count} domain{'s' if band_e_count != 1 else ''} "
                               "fell into Band E (critical risk)", "detail": detail})
    if worst:
        items.append({"severity": "high",
                      "title": f"{worst[0]} dropped {float(worst[2]) - float(worst[1]):.0f} points",
                      "detail": "Since its previous audit"})
    if regressed:
        n = len(regressed)
        items.append({"severity": "high",
                      "title": f"{n} domain{'s' if n != 1 else ''} regressed ≥ 5 points this month",
                      "detail": "Likely unreviewed content/template changes"})
    if never_audited_count:
        pct = round(100 * never_audited_count / domains_total) if domains_total else 0
        one = never_audited_count == 1
        items.append({"severity": "medium",
                      "title": f"{never_audited_count} known domain{'' if one else 's'} "
                               f"{'has' if one else 'have'} never been audited",
                      "detail": f"{pct}% of the national register"})
    if spike_count:
        one = spike_count == 1
        items.append({"severity": "critical",
                      "title": f"{spike_count} domain{'' if one else 's'} "
                               f"{'shows' if one else 'show'} a spike "
                               "in critical accessibility failures",
                      "detail": "Guard-rail triggered — capped at Band C"})

    return {
        "band_e_count": band_e_count,
        "regressed_count": len(regressed),
        "never_audited_count": never_audited_count,
        "critical_spike_count": spike_count,
        "alerts": items,
    }


@router.get("/organisations")
def organisations(q: str | None = None, org_type: str | None = None,
                  limit: int = 50, offset: int = 0,
                  db: Session = Depends(get_db),
                  user=Depends(require_role("programme_admin", "super_admin"))):
    """Searchable, paginated directory of every organisation on the platform.
    Previously the only place this data was reachable at all was as a side
    effect of the Studio-access (tenants) screen — not a real directory, and
    restricted to super_admin only. Not cached: search/pagination gives too
    many distinct query shapes for cache-aside to pay off, and an indexed
    ILIKE + join over ~1-2k rows is already fast."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    base = db.query(models.Organisation)
    if q:
        base = base.filter(models.Organisation.name.ilike(f"%{q}%"))
    if org_type:
        base = base.filter(models.Organisation.org_type == org_type)
    total = base.count()

    orgs = (base.order_by(models.Organisation.name).offset(offset).limit(limit).all())
    ids = [o.id for o in orgs]
    if not ids:
        return {"total": total, "items": []}

    # Aggregate over THIS PAGE only. Joining page-wide aggregates onto the full
    # table would scan every org and audit to render 25 rows.
    def _counts(col, model, extra=None):
        qy = db.query(col, func.count(model.id)).filter(col.in_(ids))
        if extra is not None:
            qy = qy.filter(extra)
        return dict(qy.group_by(col).all())

    domains = _counts(models.Domain.org_id, models.Domain)
    users = _counts(models.User.org_id, models.User, models.User.is_active.is_(True))

    # audit activity: count every completed audit, but average only the LATEST
    # per domain, so a domain audited weekly doesn't dominate its org's average
    # (same rule as the national roll-up in _latest_completed_subq)
    latest = _latest_completed_subq(db)
    activity = dict()
    rows = (db.query(models.Domain.org_id,
                     func.count(latest.c.did),
                     func.avg(latest.c.score))
              .join(latest, latest.c.did == models.Domain.id)
              .filter(models.Domain.org_id.in_(ids))
              .group_by(models.Domain.org_id).all())
    for org_id, audited, avg in rows:
        activity[org_id] = (int(audited), round(float(avg), 1) if avg is not None else None)

    total_audits = dict(
        db.query(models.Domain.org_id, func.count(models.Audit.id))
          .join(models.Audit, models.Audit.domain_id == models.Domain.id)
          .filter(models.Domain.org_id.in_(ids), models.Audit.status == "completed")
          .group_by(models.Domain.org_id).all())
    last_seen = dict(
        db.query(models.Domain.org_id, func.max(models.Audit.created_at))
          .join(models.Audit, models.Audit.domain_id == models.Domain.id)
          .filter(models.Domain.org_id.in_(ids), models.Audit.status == "completed")
          .group_by(models.Domain.org_id).all())

    return {
        "total": total,
        "items": [{"id": str(o.id), "name": o.name, "org_type": o.org_type,
                   "state_code": o.state_code,
                   "domain_count": int(domains.get(o.id, 0)),
                   "user_count": int(users.get(o.id, 0)),
                   "audited_domains": activity.get(o.id, (0, None))[0],
                   "audit_count": int(total_audits.get(o.id, 0)),
                   "avg_score": activity.get(o.id, (0, None))[1],
                   "last_audited_at": last_seen.get(o.id),
                   "studio_enabled": bool(o.studio_enabled),
                   "created_at": o.created_at} for o in orgs],
    }


class OrganisationCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    org_type: Literal["ministry", "department", "state", "ut", "psu", "other"] = "department"
    state_code: str | None = Field(None, max_length=8)


class OrganisationPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    org_type: Literal["ministry", "department", "state", "ut", "psu", "other"] | None = None
    state_code: str | None = Field(None, max_length=8)


@router.post("/organisations", status_code=201)
def create_organisation(body: OrganisationCreate, db: Session = Depends(get_db),
                        user=Depends(require_role("programme_admin", "super_admin"))):
    """Onboard an organisation directly.

    Until now an organisation could only appear as a side effect: auto-provisioned
    on someone's first domain registration (producing names like
    "aman's Organisation"), via CSV registry import, or from the seed script. A
    steward had no way to set one up ahead of the ministry's own users arriving.
    Same roles as the registry import, which already creates organisations."""
    if db.query(models.Organisation).filter(
            func.lower(models.Organisation.name) == body.name.strip().lower()).first():
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "An organisation with that name already exists")
    org = models.Organisation(name=body.name.strip(), org_type=body.org_type,
                              state_code=(body.state_code or None))
    db.add(org)
    db.commit()
    for pfx in ("ministries", "states"):
        cache.invalidate_prefix(pfx)
    audit_log.record(db, user.id, "organisation_created", target=str(org.id),
                     detail={"name": org.name, "org_type": org.org_type})
    db.commit()
    return {"id": str(org.id), "name": org.name, "org_type": org.org_type,
            "state_code": org.state_code}


@router.patch("/organisations/{org_id}")
def update_any_organisation(org_id: str, body: OrganisationPatch, db: Session = Depends(get_db),
                            user=Depends(require_role("programme_admin", "super_admin"))):
    """Steward-level edit of ANY organisation.

    `PATCH /v1/auth/organisation` only ever edits the caller's own, so nobody
    could correct the auto-provisioned names the platform generates for itself."""
    org = db.get(models.Organisation, org_id)
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    if body.name is not None:
        clash = (db.query(models.Organisation)
                   .filter(func.lower(models.Organisation.name) == body.name.strip().lower(),
                           models.Organisation.id != org.id).first())
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "An organisation with that name already exists")
        org.name = body.name.strip()
    if body.org_type is not None:
        org.org_type = body.org_type
    if body.state_code is not None:
        org.state_code = body.state_code or None      # "" clears the tag
    db.commit()
    for pfx in ("ministries", "states", "national"):
        cache.invalidate_prefix(pfx)
    audit_log.record(db, user.id, "organisation_updated", target=str(org.id),
                     detail={"name": org.name})
    db.commit()
    return {"id": str(org.id), "name": org.name, "org_type": org.org_type,
            "state_code": org.state_code}
