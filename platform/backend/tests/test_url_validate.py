"""Pre-scan URL validation + SSRF guard."""
from app.services import url_validate


def _pub(host):   # a public resolver (8.8.8.8 is genuinely global)
    return lambda h: ["8.8.8.8"]


def test_accepts_gov_domain(monkeypatch):
    monkeypatch.setattr(url_validate, "_resolve", _pub("x"))
    r = url_validate.validate("digilocker.gov.in")
    assert r["ok"] and r["url"] == "https://digilocker.gov.in" and r["host"] == "digilocker.gov.in"


def test_rejects_non_gov(monkeypatch):
    monkeypatch.setattr(url_validate, "_resolve", _pub("x"))
    assert url_validate.validate("https://example.com")["ok"] is False


def test_rejects_empty_and_malformed():
    assert url_validate.validate("")["ok"] is False
    assert url_validate.validate("not a url")["ok"] is False


def test_rejects_non_http_scheme():
    assert url_validate.validate("ftp://data.gov.in")["ok"] is False
    assert url_validate.validate("file:///etc/passwd")["ok"] is False


def test_rejects_ip_literal():
    assert url_validate.validate("http://127.0.0.1")["ok"] is False
    assert url_validate.validate("http://169.254.169.254")["ok"] is False   # cloud metadata


def test_ssrf_blocks_internal_resolution(monkeypatch):
    for internal in ["127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "::1"]:
        monkeypatch.setattr(url_validate, "_resolve", lambda h, ip=internal: [ip])
        r = url_validate.validate("internal.gov.in")
        assert r["ok"] is False and "internal" in r["error"].lower()


def test_malformed_never_crashes():
    # AI fuzz regression: malformed inputs must reject cleanly, never raise (→ 500)
    for bad in ["http://[::1", "http://[", "https://[::]:99999x", "http://]["]:
        r = url_validate.validate(bad)
        assert r["ok"] is False


def test_rejects_unresolvable(monkeypatch):
    def boom(h):
        raise OSError("NXDOMAIN")
    monkeypatch.setattr(url_validate, "_resolve", boom)
    assert url_validate.validate("nope.gov.in")["ok"] is False


def test_public_scan_rejects_bad_url(client):
    # the endpoint surfaces the validator's message
    assert client.post("/v1/public/scan", json={"url": "http://10.0.0.1"}).status_code == 400
    assert client.post("/v1/public/scan", json={"url": "example.com"}).status_code == 400
