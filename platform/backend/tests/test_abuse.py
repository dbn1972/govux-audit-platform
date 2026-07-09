"""Abuse controls: per-IP rate limiting, CAPTCHA, and escalating sign-in lock-out."""
from app.services import ratelimit, captcha, authguard, queue
from app.config import settings


# ---------- rate limiter ----------
def test_ratelimit_counts():
    assert ratelimit.count("k1") == 0
    assert ratelimit.hit("k1", 60) == 1
    assert ratelimit.hit("k1", 60) == 2
    assert ratelimit.count("k1") == 2
    assert ratelimit.retry_after("k1") >= 0


# ---------- captcha (built-in challenge) ----------
def test_captcha_roundtrip_single_use():
    ch = captcha.issue()
    ans = queue._r.get(f"govux:captcha:{ch['captcha_id']}")
    assert captcha.verify(f"{ch['captcha_id']}:{ans}") is True
    assert captcha.verify(f"{ch['captcha_id']}:{ans}") is False   # single use
    assert captcha.verify("bad:0") is False
    assert captcha.verify(None) is False


# ---------- escalating lock-out ----------
def test_authguard_escalation():
    email = "lock@nic.in"
    authguard.reset(email)
    for _ in range(settings.otp_fail_threshold - 1):
        assert authguard.record_failure(email).get("locked") is not True
    r = authguard.record_failure(email)                       # threshold-th failure
    assert r["locked"] and r["retry_after"] == settings.otp_lock_seconds
    assert authguard.status(email)["locked"] is True

    for _ in range(settings.otp_fail_threshold):              # escalate -> 20 min + CAPTCHA
        r = authguard.record_failure(email)
    assert r["retry_after"] == settings.otp_lock_seconds_2 and r["captcha_required"] is True
    assert authguard.status(email)["captcha_required"] is True

    authguard.reset(email)
    assert authguard.status(email) == {"locked": False, "retry_after": 0, "captcha_required": False}


# ---------- integration: free-scan quota -> CAPTCHA ----------
def test_scan_quota_then_captcha(client):
    for _ in range(settings.scan_ip_limit):
        assert client.post("/v1/public/scan", json={"url": "x.gov.in"}).status_code == 202
    blocked = client.post("/v1/public/scan", json={"url": "x.gov.in"})
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["captcha_required"] is True

    ch = client.get("/v1/public/captcha").json()
    ans = queue._r.get(f"govux:captcha:{ch['captcha_id']}")
    ok = client.post("/v1/public/scan", json={"url": "x.gov.in", "captcha": f"{ch['captcha_id']}:{ans}"})
    assert ok.status_code == 202


# ---------- integration: sign-in lock-out ----------
def test_otp_verify_lockout(client):
    email = "brute@nic.in"
    client.post("/v1/auth/otp/request", json={"email": email})
    bad = {"email": email, "code": "000000", "device_pubkey": "pk"}
    assert client.post("/v1/auth/otp/verify", json=bad).status_code == 400   # 1
    assert client.post("/v1/auth/otp/verify", json=bad).status_code == 400   # 2
    assert client.post("/v1/auth/otp/verify", json=bad).status_code == 429   # 3 -> locked
    assert client.post("/v1/auth/otp/verify", json=bad).status_code == 429   # still locked
