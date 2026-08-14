"""Continuous, scheduled monitoring (gap G2).

Incumbents and the GSA programme monitor the whole estate on a cadence rather
than waiting for an owner to click 'audit'. `enqueue_due` is the pure engine:
it finds schedules whose next_run_at has passed, submits an audit for each
(reusing the same async job path + idempotency guard), and advances the clock.
`run()` is the long-lived loop, mirroring app.worker.
"""
from __future__ import annotations
import time
from datetime import datetime, timedelta, timezone

from ..database import SessionLocal
from ..config import settings
from ..logging import configure_logging, get_logger
from .. import models
from . import queue

logger = get_logger("scheduler")

CADENCE = {"daily": timedelta(days=1), "weekly": timedelta(weeks=1),
           "monthly": timedelta(days=30)}


def next_run(cadence: str, frm: datetime) -> datetime:
    return frm + CADENCE.get(cadence, CADENCE["weekly"])


def _has_active_run(db, domain_id) -> bool:
    return db.query(models.Audit).filter(
        models.Audit.domain_id == domain_id,
        models.Audit.status.in_(["queued", "crawling", "analyzing", "scoring"]),
    ).first() is not None


def enqueue_due(db, now: datetime | None = None) -> list[str]:
    """Submit audits for every due, enabled schedule. Returns task_ids enqueued."""
    now = now or datetime.now(timezone.utc)
    due = (db.query(models.Schedule)
             .filter(models.Schedule.enabled.is_(True),
                     models.Schedule.next_run_at <= now).all())
    queue.ensure_group()
    task_ids: list[str] = []
    for sch in due:
        domain = db.get(models.Domain, sch.domain_id)
        if not domain or domain.verify_status != "verified" or _has_active_run(db, domain.id):
            sch.next_run_at = next_run(sch.cadence, now)   # skip this tick, don't fall behind
            continue
        audit = models.Audit(domain_id=domain.id, engine_version=settings.engine_version,
                             requested_by=sch.created_by, status="queued",
                             scope={"depth": 50, "scheduled": True})
        db.add(audit)
        db.flush()
        queue.enqueue_audit(str(audit.id), {"domain": domain.url, "scope": audit.scope})
        sch.last_run_at = now
        sch.next_run_at = next_run(sch.cadence, now)
        task_ids.append(str(audit.id))
    db.commit()
    return task_ids


def run(poll_seconds: int = 60):  # pragma: no cover - long-lived loop
    configure_logging()
    logger.info("scheduler_started", poll_seconds=poll_seconds)
    while True:
        db = SessionLocal()
        try:
            ids = enqueue_due(db)
            if ids:
                # task_ids, not just a count: this is the only record linking a
                # scheduled run back to the audits it created.
                logger.info("scheduler_enqueued", count=len(ids), task_ids=ids)
        except Exception as exc:
            # exc_info so the traceback survives — a bare str() of the exception
            # loses which query or enqueue actually failed.
            logger.error("scheduler_error", error=str(exc), exc_info=True)
        finally:
            db.close()
        time.sleep(poll_seconds)


if __name__ == "__main__":  # pragma: no cover
    run()
