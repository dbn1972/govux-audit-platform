"""Worker/queue reliability integration tests (Volume-14 gaps).

Covers three cross-module seams the happy-path `worker.process` tests miss:
  1. `_handle`'s ack contract — the reliability guarantee that a job is acked
     ONLY on success, so a crash/exception leaves it pending for reclaim/DLQ.
  2. Cache invalidation across modules — a completed audit must drop the cached
     national/rankings/ministries/states aggregates so leaderboards don't serve
     stale numbers.
  3. Scheduler → broker handoff — the scheduled path actually enqueues the audit
     it created (the enqueue is no-op'd in the default fixture, so assert it here).
"""
import json
from datetime import datetime, timedelta, timezone

from app import models, worker
from app.services import queue, cache, scheduler


# ---------- 1. _handle ack contract -----------------------------------------

def test_handle_acks_the_entry_only_after_a_successful_process(monkeypatch):
    acked, seen = [], {}
    monkeypatch.setattr(queue, "ack", lambda eid: acked.append(eid))
    monkeypatch.setattr(worker, "process",
                        lambda tid, payload: seen.update(tid=tid, payload=payload))

    worker._handle("42-0", {"task_id": "T-1", "payload": json.dumps({"domain": "x.gov.in"})})

    assert seen == {"tid": "T-1", "payload": {"domain": "x.gov.in"}}
    assert acked == ["42-0"]           # acked exactly once, on success


def test_handle_does_not_ack_a_failed_job_so_it_stays_pending(monkeypatch):
    acked = []
    monkeypatch.setattr(queue, "ack", lambda eid: acked.append(eid))

    def boom(tid, payload):
        raise RuntimeError("engine crashed mid-run")
    monkeypatch.setattr(worker, "process", boom)

    # _handle swallows the error (logs it) and must NOT ack — the entry remains
    # in the PEL for reclaim_stale/DLQ to pick up. It must not propagate either.
    worker._handle("43-0", {"task_id": "T-2", "payload": "{}"})

    assert acked == []                 # left pending on failure — the core contract


# ---------- 2. cache invalidation after a completed audit -------------------

def _reachable_engine(url, screenshot_path=None, depth=None):
    return {
        "url": url,
        "categories": {"accessibility": 80, "usability": 70, "gigw": 75, "design": 70,
                       "performance": 65, "responsiveness": 60, "content": 62, "trust": 90},
        "cwv": {"lcp_ms": 2500, "cls": 0.05}, "findings": [],
        "pages": [{"url": url, "status": "analysed", "page_score": 80, "issue_count": 0}],
        "pages_total": 1,
        "evidence": {"home_reachable": True, "pages_analysed": 1, "pages_total": 1},
    }


def test_completed_audit_drops_the_cached_aggregates(client, ctx, verified_domain, monkeypatch):
    # warm the aggregates a prior /national + /rankings + /alerts read would have cached
    nat = cache.cache_key("national", "summary")
    rnk = cache.cache_key("rankings", "gov.in", "large")
    alt = cache.cache_key("alerts")
    cache._r.setex(nat, 300, json.dumps({"stale": True}))
    cache._r.setex(rnk, 300, json.dumps({"stale": True}))
    cache._r.setex(alt, 300, json.dumps({"stale": True}))
    assert cache._r.get(nat) is not None and cache._r.get(rnk) is not None and cache._r.get(alt) is not None

    monkeypatch.setattr(worker, "run_engine", _reachable_engine)
    sub = client.post("/v1/audits", headers=ctx["headers"],
                      json={"domain_id": str(verified_domain.id)})
    worker.process(sub.json()["task_id"], {"domain": verified_domain.url})

    # a newly-scored audit changes the leaderboards -> their cache must be gone
    assert cache._r.get(nat) is None
    assert cache._r.get(rnk) is None
    assert cache._r.get(alt) is None


# ---------- 3. scheduler hands the created audit to the broker --------------

def test_scheduler_enqueues_the_audit_it_created(db, ctx, verified_domain, monkeypatch):
    handed = []
    monkeypatch.setattr(queue, "enqueue_audit",
                        lambda tid, payload: handed.append((tid, payload)) or "1-0")

    sch = models.Schedule(domain_id=verified_domain.id, cadence="weekly",
                          next_run_at=datetime.now(timezone.utc) - timedelta(hours=1),
                          created_by=ctx["user"].id)
    db.add(sch); db.commit()

    ids = scheduler.enqueue_due(db, now=datetime.now(timezone.utc))

    assert len(ids) == 1
    # the broker handoff carried the SAME id the scheduler persisted, with a
    # payload the worker can act on (domain url present)
    assert len(handed) == 1
    handed_id, handed_payload = handed[0]
    assert handed_id == ids[0]
    assert handed_payload.get("domain") == verified_domain.url
