"""Continuous monitoring (schedules) + estate auto-discovery (gap G2)."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..deps import current_user, require_role, owned_domain
from ..schemas import ScheduleCreate, DiscoveryScan
from ..services import discovery

router = APIRouter(prefix="/v1", tags=["monitoring"])


# ---------- scheduled continuous monitoring ----------
@router.post("/schedules", status_code=201)
def create_schedule(body: ScheduleCreate, user: models.User = Depends(current_user),
                    db: Session = Depends(get_db)):
    # Ownership, not just existence: this used to load the domain by id alone, so
    # anyone could put a recurring depth-50 crawl on another department's site.
    domain = owned_domain(db, body.domain_id, user)
    if body.cadence not in ("daily", "weekly", "monthly"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cadence must be daily|weekly|monthly")
    sch = models.Schedule(domain_id=domain.id, cadence=body.cadence,
                          next_run_at=datetime.now(timezone.utc), created_by=user.id)
    db.add(sch)
    db.commit()
    return {"id": str(sch.id), "domain_id": str(domain.id), "cadence": sch.cadence,
            "enabled": sch.enabled, "next_run_at": sch.next_run_at}


@router.get("/schedules")
def list_schedules(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = (db.query(models.Schedule, models.Domain.url)
              .join(models.Domain, models.Domain.id == models.Schedule.domain_id)
              .filter(models.Domain.org_id == user.org_id).all())
    return [{"id": str(s.id), "domain": url, "cadence": s.cadence, "enabled": s.enabled,
             "next_run_at": s.next_run_at, "last_run_at": s.last_run_at} for s, url in rows]


@router.delete("/schedules/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: str, user: models.User = Depends(current_user),
                    db: Session = Depends(get_db)):
    sch = db.get(models.Schedule, schedule_id)
    if not sch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    # This checked nothing but existence, so any signed-in user could delete any
    # schedule by id and silently switch off another ministry's monitoring. The
    # listing above was already org-fenced — only the delete was open.
    owned_domain(db, sch.domain_id, user)
    db.delete(sch)
    db.commit()


# ---------- estate auto-discovery ----------
@router.post("/discovery/scan")
def discovery_scan(body: DiscoveryScan, db: Session = Depends(get_db),
                   user=Depends(require_role("programme_admin", "super_admin"))):
    """Parse sitemaps / robots / HTML for .gov.in/.nic.in hosts and record any
    not already known. Samples are supplied by the caller (fetched upstream), so
    this is deterministic and side-effect-isolated."""
    found: set[str] = set()
    for s in body.samples:
        for host in discovery.discover(s.seed, s.body, s.kind):
            found.add(host)
    known = {d.url for d in db.query(models.Domain.url).all()} \
        | {d.url for d in db.query(models.DiscoveredDomain.url).all()}
    new = 0
    for host in sorted(found):
        if host in known:
            continue
        db.add(models.DiscoveredDomain(url=host, source="scan", seed="samples"))
        new += 1
    db.commit()
    return {"discovered": sorted(found), "new": new, "total_found": len(found)}


@router.get("/discovery")
def list_discovered(db: Session = Depends(get_db),
                    user=Depends(require_role("programme_admin", "super_admin"))):
    rows = db.query(models.DiscoveredDomain).order_by(
        models.DiscoveredDomain.discovered_at.desc()).limit(500).all()
    return [{"url": d.url, "source": d.source, "imported": d.imported,
             "discovered_at": d.discovered_at} for d in rows]
