def test_readyz_reports_dependencies(client):
    r = client.get("/readyz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready"
    assert body["checks"]["db"] == "ok" and body["checks"]["redis"] == "ok"


def test_baseline_security_headers_present(client):
    h = client.get("/healthz").headers
    assert h["X-Content-Type-Options"] == "nosniff"
    assert h["X-Frame-Options"] == "DENY"
    assert "Referrer-Policy" in h and "Permissions-Policy" in h
