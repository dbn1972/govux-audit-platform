import uuid
from datetime import datetime, timedelta, timezone

from app import models
from app.services import scheduler


def _past():
    return datetime.now(timezone.utc) - timedelta(hours=1)


def test_next_run_advances_by_cadence():
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert scheduler.next_run("daily", base) == base + timedelta(days=1)
    assert scheduler.next_run("weekly", base) == base + timedelta(weeks=1)
    assert scheduler.next_run("bogus", base) == base + timedelta(weeks=1)  # default


def test_enqueue_due_runs_verified_and_advances(db, ctx, verified_domain):
    sch = models.Schedule(domain_id=verified_domain.id, cadence="weekly",
                          next_run_at=_past(), created_by=ctx["user"].id)
    db.add(sch); db.commit()
    ids = scheduler.enqueue_due(db, now=datetime.now(timezone.utc))
    assert len(ids) == 1
    db.refresh(sch)
    assert sch.last_run_at is not None
    assert sch.next_run_at > datetime.now(timezone.utc)


def test_enqueue_due_skips_unverified(db, ctx):
    d = models.Domain(org_id=ctx["org"].id, url=f"sch{uuid.uuid4().hex[:6]}.gov.in",
                      tld="gov.in", verify_status="pending", created_by=ctx["user"].id)
    db.add(d); db.flush()
    sch = models.Schedule(domain_id=d.id, cadence="daily", next_run_at=_past(),
                          created_by=ctx["user"].id)
    db.add(sch); db.commit()
    ids = scheduler.enqueue_due(db, now=datetime.now(timezone.utc))
    assert ids == []
    db.refresh(sch)
    assert sch.next_run_at > datetime.now(timezone.utc)   # advanced, not stuck


def test_enqueue_due_ignores_future_schedules(db, ctx, verified_domain):
    future = datetime.now(timezone.utc) + timedelta(days=2)
    sch = models.Schedule(domain_id=verified_domain.id, cadence="weekly",
                          next_run_at=future, created_by=ctx["user"].id)
    db.add(sch); db.commit()
    assert scheduler.enqueue_due(db, now=datetime.now(timezone.utc)) == []
