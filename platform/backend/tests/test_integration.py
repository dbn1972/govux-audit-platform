"""Deep cross-module integration tests — fill the gaps the unit/API tests miss:

  * the queue reliability path (XAUTOCLAIM reclaim + DLQ) against REAL Redis Streams
  * cache graceful degradation when the cache backend errors
  * admin config change propagating across the module boundary into the scanner
  * the audit→cache→review journey: cached report is invalidated when the verdict changes
  * a response-schema contract test for the report endpoint

These exercise real production reliability code that is monkeypatched everywhere else.
"""
import uuid

import pytest

from app import models, security
from app.config import settings
from app.services import queue, cache


# ── helpers ──────────────────────────────────────────────────────────────────
def _completed_audit(db, org, user, a11y=95):
    dom = models.Domain(org_id=org.id, url=f"i{uuid.uuid4().hex[:6]}.gov.in", tld="gov.in",
                        verify_status="verified", created_by=user.id)
    db.add(dom); db.flush()
    a = models.Audit(domain_id=dom.id, engine_version="v3.2", status="completed",
                     overall_score=91, band="A", compliance_status="partially_compliant",
                     method="automated", confidence="automated_only")
    db.add(a); db.flush()
    db.add(models.AuditScore(audit_id=a.id, category="accessibility", weight=22, score=a11y))
    db.commit()
    return a


# ── 1. QUEUE: reclaim + DLQ against real Redis Streams ───────────────────────
def test_queue_reclaim_routes_poison_to_dlq_real_redis(monkeypatch):
    """A job whose worker dies is reclaimed; once it exceeds MAX_DELIVERIES it is
    routed to the DLQ and acked — verified against a real Redis Streams broker."""
    redis = pytest.importorskip("redis")
    r = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        r.ping()
    except Exception:
        pytest.skip("real Redis not reachable")

    stream = f"test:audits:{uuid.uuid4().hex[:8]}"
    dlq = stream + ":dlq"
    monkeypatch.setattr(settings, "audit_stream", stream)
    monkeypatch.setattr(settings, "consumer_group", "workers")
    monkeypatch.setattr(queue, "_r", r)
    monkeypatch.setattr(queue, "DLQ_STREAM", dlq)
    try:
        # set up via raw Redis (the enqueue/read wrappers are no-op'd by the test
        # fixture; reclaim_stale — the code under test — is the real thing)
        r.xgroup_create(stream, "workers", id="0", mkstream=True)
        r.xadd(stream, {"task_id": "task-xyz", "payload": "{}"})

        # worker "A" picks it up (delivery 1) then crashes without acking
        r.xreadgroup("workers", "A", {stream: ">"}, count=1)

        # simulate repeated redelivery past the poison cutoff
        for _ in range(queue.MAX_DELIVERIES + 1):
            r.xautoclaim(stream, "workers", "B", min_idle_time=0, start_id="0-0", count=10)

        live = queue.reclaim_stale("B", min_idle_ms=0)
        assert live == [], "poison job must NOT be returned for reprocessing"
        assert r.xlen(dlq) == 1, "poison job should be parked in the DLQ"

        pend = r.xpending(stream, "workers")
        pending = pend.get("pending", 0) if isinstance(pend, dict) else pend[0]
        assert pending == 0, "poison job should be acked out of the pending list"
    finally:
        r.delete(stream); r.delete(dlq)


def test_queue_healthy_job_is_reclaimable_not_dlq(monkeypatch):
    """A job that has NOT exceeded the delivery cap is returned for reprocessing,
    not dead-lettered."""
    redis = pytest.importorskip("redis")
    r = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        r.ping()
    except Exception:
        pytest.skip("real Redis not reachable")
    stream = f"test:audits:{uuid.uuid4().hex[:8]}"
    dlq = stream + ":dlq"
    monkeypatch.setattr(settings, "audit_stream", stream)
    monkeypatch.setattr(settings, "consumer_group", "workers")
    monkeypatch.setattr(queue, "_r", r)
    monkeypatch.setattr(queue, "DLQ_STREAM", dlq)
    try:
        r.xgroup_create(stream, "workers", id="0", mkstream=True)
        r.xadd(stream, {"task_id": "task-1", "payload": "{}"})
        r.xreadgroup("workers", "A", {stream: ">"}, count=1)      # delivery 1, unacked
        live = queue.reclaim_stale("B", min_idle_ms=0)           # delivery 2 (< cap)
        assert len(live) == 1 and live[0][1]["task_id"] == "task-1"
        assert r.xlen(dlq) == 0, "healthy job must not be dead-lettered"
    finally:
        r.delete(stream); r.delete(dlq)


# ── 2. CACHE: graceful degradation on backend failure ────────────────────────
def test_cache_degrades_to_db_when_backend_errors(monkeypatch):
    class Boom:
        def get(self, k): raise RuntimeError("redis down")
        def set(self, *a, **k): raise RuntimeError()
        def setex(self, *a, **k): raise RuntimeError()
        def delete(self, *a, **k): raise RuntimeError()
    monkeypatch.setattr(cache, "_r", Boom())
    calls = {"n": 0}
    def producer():
        calls["n"] += 1
        return {"ok": 1}
    v = cache.get_or_set(cache.cache_key("x"), 60, producer)
    assert v == {"ok": 1} and calls["n"] == 1     # served from source, never raised


# ── 3. ADMIN → module: config change propagates into the public scanner ──────
def test_admin_disabling_captcha_hard_blocks_over_quota(client, db):
    """Turning captcha_enabled OFF in admin config must make the public scanner
    hard-block (429, no captcha) once the per-IP free quota is spent — proving the
    admin setting propagates across the module boundary."""
    db.add(models.AppSetting(key="captcha_enabled", value="false"))
    db.add(models.AppSetting(key="scan_ip_limit", value="2"))
    db.commit()
    url = f"scanme{uuid.uuid4().hex[:6]}.gov.in"
    codes = [client.post("/v1/public/scan", json={"url": url}).status_code for _ in range(3)]
    assert codes[:2] == [202, 202], f"first 2 free scans allowed, got {codes}"
    assert codes[2] == 429, "over-quota scan must be hard-blocked when captcha is disabled"


# ── 4. JOURNEY: cached report is invalidated when a review changes the verdict ─
def test_report_cache_invalidated_after_review(client, db, ctx):
    audit = _completed_audit(db, ctx["org"], ctx["user"])
    aid = str(audit.id)
    r1 = client.get(f"/v1/audits/{aid}/report", headers=ctx["headers"])   # warms the cache
    assert r1.status_code == 200
    assert r1.json()["compliance"]["status"] == "partially_compliant"
    # assessor certifies -> verdict changes -> cached report MUST be dropped
    assert client.post(f"/v1/audits/{aid}/review", json={"approved": True},
                       headers=ctx["headers"]).status_code == 200
    r2 = client.get(f"/v1/audits/{aid}/report", headers=ctx["headers"])
    assert r2.json()["compliance"]["status"] == "compliant", "stale cached report served"


# ── 5. CONTRACT: report response schema ──────────────────────────────────────
def test_report_response_contract(client, db, ctx):
    audit = _completed_audit(db, ctx["org"], ctx["user"])
    r = client.get(f"/v1/audits/{audit.id}/report", headers=ctx["headers"])
    assert r.status_code == 200
    body = r.json()
    for key in ("task_id", "overall_score", "band", "compliance", "categories",
                "contributions", "findings", "documents", "browsers"):
        assert key in body, f"report contract missing '{key}'"
    assert isinstance(body["overall_score"], (int, float))
    assert isinstance(body["categories"], list)
    assert set(body["compliance"]) >= {"status", "method", "confidence"}
