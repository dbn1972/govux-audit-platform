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
