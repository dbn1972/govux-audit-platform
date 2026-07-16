"""National roll-up & segmented rankings (steward view)."""
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
