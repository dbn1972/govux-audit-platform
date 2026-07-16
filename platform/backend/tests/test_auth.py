from app import security
from app.services import queue


def test_health(client):
    r = client.get("/healthz")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_otp_request_rejects_non_gov(client):
    r = client.post("/v1/auth/otp/request", json={"email": "user@gmail.com"})
    assert r.status_code == 403


def test_otp_request_accepts_gov(client):
    r = client.post("/v1/auth/otp/request", json={"email": "n.officer@nic.in"})
    assert r.status_code == 202


def test_full_otp_login_flow(client, monkeypatch):
    monkeypatch.setattr(security, "new_otp", lambda: "123456")
    email = "flow.user@nic.in"
    assert client.post("/v1/auth/otp/request", json={"email": email}).status_code == 202

    # wrong code
    bad = client.post("/v1/auth/otp/verify",
                      json={"email": email, "code": "000000", "device_pubkey": "pk"})
    assert bad.status_code == 400

    # correct code -> token + refresh cookie
    ok = client.post("/v1/auth/otp/verify",
                     json={"email": email, "code": "123456", "device_pubkey": "pk", "trust_device": True})
    assert ok.status_code == 200
    body = ok.json()
    assert body["access_token"] and body["expires_in"] > 0
    assert "govux_rt" in ok.cookies

    # refresh rotates the token
    client.cookies.set("govux_rt", ok.cookies["govux_rt"])
    ref = client.post("/v1/auth/refresh")
    assert ref.status_code == 200 and ref.json()["access_token"]


def test_refresh_without_cookie(client):
    client.cookies.clear()
    assert client.post("/v1/auth/refresh").status_code == 401


def test_devices_list_and_revoke(client, ctx):
    r = client.get("/v1/auth/devices", headers=ctx["headers"])
    assert r.status_code == 200
    assert any(d["id"] == str(ctx["device"].id) for d in r.json())
    rev = client.delete(f"/v1/auth/devices/{ctx['device'].id}", headers=ctx["headers"])
    assert rev.status_code == 204


def test_protected_requires_token(client):
    assert client.get("/v1/auth/devices").status_code == 401


def test_bad_token_rejected(client):
    r = client.get("/v1/auth/devices", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401


def test_me_returns_role_and_entitlements(client, ctx):
    r = client.get("/v1/auth/me", headers=ctx["headers"])
    assert r.status_code == 200
    m = r.json()
    assert m["email"] == ctx["user"].email
    assert m["role"] == "programme_admin" and m["is_steward"] is True
    assert m["entitlements"]["free_pages_per_audit"] >= 1
    assert m["entitlements"]["unlimited_audits"] is True


def test_me_owner_is_not_steward(client, db):
    import uuid
    from app import models, security
    org = models.Organisation(name="Min X", org_type="ministry")
    db.add(org); db.flush()
    u = models.User(email=f"owner.{uuid.uuid4().hex[:8]}@nic.in", org_id=org.id, display_name="Owner X", role="owner")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    tok = security.issue_access_token(str(u.id), u.role, str(dev.id))
    m = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {tok}"}).json()
    assert m["role"] == "owner" and m["is_steward"] is False
