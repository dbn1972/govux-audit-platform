"""National roll-up & segmented rankings (steward view)."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..deps import require_role
from ..services import cache, settings_store
from ..services.scoring import band_for

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
        order_by=desc(models.Audit.created_at)).label("rn")
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
        items.append({"severity": "medium",
                      "title": f"{never_audited_count} known domain"
                               f"{'s' if never_audited_count != 1 else ''} have never been audited",
                      "detail": f"{pct}% of the national register"})
    if spike_count:
        items.append({"severity": "critical",
                      "title": f"{spike_count} domain{'s' if spike_count != 1 else ''} show a spike "
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

    domain_counts = (db.query(models.Domain.org_id, func.count(models.Domain.id).label("n"))
                       .group_by(models.Domain.org_id).subquery())
    rows = (base.outerjoin(domain_counts, domain_counts.c.org_id == models.Organisation.id)
                .add_columns(func.coalesce(domain_counts.c.n, 0).label("domain_count"))
                .order_by(models.Organisation.name)
                .offset(offset).limit(limit).all())

    return {
        "total": total,
        "items": [{"id": str(o.id), "name": o.name, "org_type": o.org_type,
                   "state_code": o.state_code, "domain_count": int(n),
                   "studio_enabled": bool(o.studio_enabled),
                   "created_at": o.created_at} for o, n in rows],
    }
