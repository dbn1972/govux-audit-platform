"""Free public URL scanner — anonymous scan, queue, PDF, scan count."""


def test_reject_non_gov_url(client):
    r = client.post("/v1/public/scan", json={"url": "https://example.com"})
    assert r.status_code == 400


def test_public_scan_lifecycle(client, db, monkeypatch):
    from app import worker, public_worker
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
        "url": url, "categories": {k: 70 for k in
            ["accessibility", "usability", "gigw", "design", "performance", "responsiveness", "content", "trust"]},
        "cwv": {"lcp_ms": 3000},
        "findings": [{"category": "accessibility", "severity": "high", "title": "Buttons need names"}]})

    r = client.post("/v1/public/scan", json={"url": "testscan.gov.in"})
    assert r.status_code == 202
    body = r.json()
    sid = body["scan_id"]
    assert "queue_position" in body and body["status"] == "queued"

    public_worker.process(sid)   # single-concurrency worker, run inline

    st = client.get(f"/v1/public/scan/{sid}").json()
    assert st["status"] == "completed" and st["overall_score"] == 70.0
    assert st["url_scan_count"] >= 1 and st["pdf_ready"] is True

    pdf = client.get(f"/v1/public/scan/{sid}/pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content[:4] == b"%PDF"        # a real PDF


def test_public_queue_and_stats(client):
    q = client.get("/v1/public/queue")
    assert q.status_code == 200 and "waiting" in q.json()
    s = client.get("/v1/public/stats", params={"url": "abc.gov.in"})
    assert s.status_code == 200 and "scan_count" in s.json()


def test_scan_status_missing(client):
    import uuid
    assert client.get(f"/v1/public/scan/{uuid.uuid4()}").status_code == 404


# ---------- crash-recovery / orphan reconciliation (mirrors worker.py) ------

def test_public_handle_acks_only_on_success(monkeypatch):
    import json
    from app import public_worker
    from app.services import queue
    acked = []
    monkeypatch.setattr(queue, "ack_public", lambda eid: acked.append(eid))
    monkeypatch.setattr(public_worker, "process", lambda sid: None)

    public_worker._handle("9-0", {"scan_id": "S-1", "payload": json.dumps({"url": "x.gov.in"})})

    assert acked == ["9-0"]


def test_public_handle_does_not_ack_a_failed_job_so_it_stays_pending(monkeypatch):
    from app import public_worker
    from app.services import queue
    acked = []
    monkeypatch.setattr(queue, "ack_public", lambda eid: acked.append(eid))

    def boom(sid):
        raise RuntimeError("engine crashed mid-scan")
    monkeypatch.setattr(public_worker, "process", boom)

    # swallowed (logged), not acked — stays in the PEL for reclaim_stale_public/DLQ
    public_worker._handle("10-0", {"scan_id": "S-2", "payload": "{}"})

    assert acked == []


def test_reconcile_stale_scans_fails_scans_stuck_past_the_threshold(db, monkeypatch):
    from datetime import datetime, timedelta, timezone
    from app import models, public_worker
    from app.config import settings
    monkeypatch.setattr(settings, "public_scan_stale_minutes", 30)

    old_cutoff = datetime.now(timezone.utc) - timedelta(minutes=45)
    stuck = models.PublicScan(url="https://stuck.gov.in", host="stuck.gov.in", status="queued")
    db.add(stuck); db.commit()
    # created_at has a server default (now); backdate it directly past the threshold
    db.query(models.PublicScan).filter(models.PublicScan.id == stuck.id).update(
        {models.PublicScan.created_at: old_cutoff})
    db.commit()

    fresh = models.PublicScan(url="https://fresh.gov.in", host="fresh.gov.in", status="queued")
    db.add(fresh); db.commit()

    public_worker.reconcile_stale_scans(db)
    db.refresh(stuck); db.refresh(fresh)

    assert stuck.status == "failed" and stuck.error and stuck.finished_at is not None
    assert fresh.status == "queued"   # not stale — untouched
