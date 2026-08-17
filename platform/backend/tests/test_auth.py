import uuid

from app import security
from app.config import settings
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


def test_concurrent_refresh_with_the_same_token_does_not_kill_the_family(client, monkeypatch):
    """Two components racing off one stale cookie (e.g. right after a page
    reload) both present the SAME original refresh token. Both must succeed —
    this used to cascade-revoke the whole session family instead."""
    monkeypatch.setattr(security, "new_otp", lambda: "123456")
    email = f"race.{uuid.uuid4().hex[:8]}@nic.in"
    client.post("/v1/auth/otp/request", json={"email": email})
    ok = client.post("/v1/auth/otp/verify",
                     json={"email": email, "code": "123456", "device_pubkey": "pk", "trust_device": True})
    rt = ok.cookies["govux_rt"]

    client.cookies.set("govux_rt", rt)
    r1 = client.post("/v1/auth/refresh")
    client.cookies.set("govux_rt", rt)   # present the SAME (now superseded) token again
    r2 = client.post("/v1/auth/refresh")

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["access_token"] and r2.json()["access_token"]

    # the session minted by the second (losing) racer must still be usable
    client.cookies.set("govux_rt", r2.cookies["govux_rt"])
    r3 = client.post("/v1/auth/refresh")
    assert r3.status_code == 200


def test_reuse_outside_the_grace_window_still_kills_the_family(client, monkeypatch):
    """A token replayed well after its own rotation is a real theft signal —
    the grace window must not blanket-forgive every reuse, only near-simultaneous
    ones. Zeroing the grace window makes any reuse count as 'outside' it."""
    monkeypatch.setattr(security, "new_otp", lambda: "123456")
    monkeypatch.setattr(settings, "refresh_reuse_grace_seconds", 0)
    email = f"reuse.{uuid.uuid4().hex[:8]}@nic.in"
    client.post("/v1/auth/otp/request", json={"email": email})
    ok = client.post("/v1/auth/otp/verify",
                     json={"email": email, "code": "123456", "device_pubkey": "pk", "trust_device": True})
    rt = ok.cookies["govux_rt"]

    client.cookies.set("govux_rt", rt)
    r1 = client.post("/v1/auth/refresh")
    assert r1.status_code == 200
    new_rt = r1.cookies["govux_rt"]

    client.cookies.set("govux_rt", rt)   # replay the already-rotated token
    r2 = client.post("/v1/auth/refresh")
    assert r2.status_code == 401

    # the legitimately-rotated sibling must be dead too — the whole family
    client.cookies.set("govux_rt", new_rt)
    r3 = client.post("/v1/auth/refresh")
    assert r3.status_code == 401


def test_logout_revokes_session_so_the_cookie_can_no_longer_refresh(client, monkeypatch):
    monkeypatch.setattr(security, "new_otp", lambda: "123456")
    email = f"logout.{uuid.uuid4().hex[:8]}@nic.in"
    client.post("/v1/auth/otp/request", json={"email": email})
    ok = client.post("/v1/auth/otp/verify",
                     json={"email": email, "code": "123456", "device_pubkey": "pk", "trust_device": True})
    client.cookies.set("govux_rt", ok.cookies["govux_rt"])

    out = client.post("/v1/auth/logout")
    assert out.status_code == 204

    # whether the cookie was dropped client-side or the session was revoked
    # server-side, the old refresh token must never mint a new access token
    ref = client.post("/v1/auth/refresh")
    assert ref.status_code == 401


def test_logout_without_a_cookie_is_a_harmless_noop(client):
    client.cookies.clear()
    assert client.post("/v1/auth/logout").status_code == 204


def test_devices_list_and_revoke(client, ctx):
    r = client.get("/v1/auth/devices", headers=ctx["headers"])
    assert r.status_code == 200
    assert any(d["id"] == str(ctx["device"].id) for d in r.json())
    rev = client.delete(f"/v1/auth/devices/{ctx['device'].id}", headers=ctx["headers"])
    assert rev.status_code == 204


def test_devices_list_orders_most_recently_active_first(client, ctx, db):
    from datetime import datetime, timedelta, timezone
    from app import models
    older = models.Device(user_id=ctx["user"].id, device_pubkey="pk-older",
                          last_active_at=datetime.now(timezone.utc) - timedelta(days=5))
    newer = models.Device(user_id=ctx["user"].id, device_pubkey="pk-newer",
                          last_active_at=datetime.now(timezone.utc) - timedelta(minutes=1))
    db.add_all([older, newer]); db.commit()

    r = client.get("/v1/auth/devices", headers=ctx["headers"])
    ids = [d["id"] for d in r.json()]
    assert ids.index(str(newer.id)) < ids.index(str(older.id))


def test_revoked_device_session_cannot_refresh_even_inside_the_grace_window(client, monkeypatch):
    """Same class of bug as logout: a device-revoked session only sets
    revoked_at, exactly like a rotation does moments before its grace window
    check — it must not be mistaken for a benign rotation race."""
    monkeypatch.setattr(security, "new_otp", lambda: "123456")
    email = f"devrevoke.{uuid.uuid4().hex[:8]}@nic.in"
    client.post("/v1/auth/otp/request", json={"email": email})
    ok = client.post("/v1/auth/otp/verify",
                     json={"email": email, "code": "123456", "device_pubkey": "pk", "trust_device": True})
    access = ok.json()["access_token"]
    devices = client.get("/v1/auth/devices", headers={"Authorization": f"Bearer {access}"}).json()
    device_id = devices[0]["id"]

    client.cookies.set("govux_rt", ok.cookies["govux_rt"])
    rev = client.delete(f"/v1/auth/devices/{device_id}", headers={"Authorization": f"Bearer {access}"})
    assert rev.status_code == 204

    ref = client.post("/v1/auth/refresh")
    assert ref.status_code == 401


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


def test_owner_can_update_their_own_organisation(client, ctx):
    """Gap fix: nothing ever set state_code before, so /v1/states could never
    populate. An owner-ish role can now tag their own org with a state/UT."""
    r = client.patch("/v1/auth/organisation", headers=ctx["headers"],
                     json={"name": "Renamed Dept", "state_code": "KA"})
    assert r.status_code == 200
    body = r.json()
    assert body["org_name"] == "Renamed Dept" and body["org_state_code"] == "KA"

    m = client.get("/v1/auth/me", headers=ctx["headers"]).json()
    assert m["org_name"] == "Renamed Dept" and m["org_state_code"] == "KA"


def test_assessor_cannot_update_organisation(client, db):
    import uuid
    from app import models, security
    org = models.Organisation(name="Org Y", org_type="department")
    db.add(org); db.flush()
    u = models.User(email=f"assessor.{uuid.uuid4().hex[:8]}@nic.in", org_id=org.id, role="assessor")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    tok = security.issue_access_token(str(u.id), u.role, str(dev.id))
    r = client.patch("/v1/auth/organisation", headers={"Authorization": f"Bearer {tok}"},
                     json={"state_code": "MH"})
    assert r.status_code == 403


def test_state_code_populates_the_national_states_rollup(client, ctx, verified_domain, monkeypatch):
    from app import worker
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
        "url": url, "categories": {k: 70 for k in
            ["accessibility", "usability", "gigw", "design", "performance", "responsiveness", "content", "trust"]},
        "cwv": {}, "findings": []})
    sub = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)}).json()
    worker.process(sub["task_id"], {"domain": verified_domain.url})

    client.patch("/v1/auth/organisation", headers=ctx["headers"], json={"state_code": "TN"})

    r = client.get("/v1/states", headers=ctx["headers"])
    assert r.status_code == 200
    codes = {s["code"] for s in r.json()["states"]}
    assert "TN" in codes


def test_dpdp_export_returns_pii_and_is_logged(client, ctx, db):
    from app import models
    r = client.get("/v1/auth/me/export", headers=ctx["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["profile"]["email"] == ctx["user"].email
    assert "devices" in body and "activity" in body and "audits_requested" in body
    db.expire_all()
    assert db.query(models.AuditLog).filter(models.AuditLog.action == "dpdp_export").count() >= 1


def test_dpdp_erase_anonymises_and_deletes_devices(client, ctx, db):
    from app import models
    uid = ctx["user"].id
    r = client.delete("/v1/auth/me", headers=ctx["headers"])
    assert r.status_code == 200 and r.json()["status"] == "erased"
    db.expire_all()
    u = db.get(models.User, uid)
    assert u.email.startswith("erased-") and u.email.endswith("@erased.nic.in")
    assert u.is_active is False and u.display_name is None
    assert db.query(models.Device).filter(models.Device.user_id == uid).count() == 0
    assert db.query(models.Session).filter(models.Session.user_id == uid).count() == 0


# ---------- team / role management ------------------------------------------
def _team_user(db, org, role, prefix):
    from app import models, security
    u = models.User(email=f"{prefix}.{uuid.uuid4().hex[:8]}@nic.in", org_id=org.id, role=role)
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    tok = security.issue_access_token(str(u.id), role, str(dev.id))
    return u, {"Authorization": f"Bearer {tok}"}


def test_owner_can_list_and_promote_a_colleague_to_assessor(client, db):
    from app import models
    org = models.Organisation(name="Team Org 1", org_type="department"); db.add(org); db.flush()
    owner, owner_hdrs = _team_user(db, org, "owner", "owner")
    colleague, _ = _team_user(db, org, "contributor", "colleague")

    lst = client.get("/v1/auth/team", headers=owner_hdrs)
    assert lst.status_code == 200
    emails = {m["email"] for m in lst.json()}
    assert owner.email in emails and colleague.email in emails

    r = client.patch(f"/v1/auth/team/{colleague.id}/role", headers=owner_hdrs, json={"role": "assessor"})
    assert r.status_code == 200 and r.json()["role"] == "assessor"


def test_owner_cannot_grant_a_steward_role(client, db):
    from app import models
    org = models.Organisation(name="Team Org 2", org_type="department"); db.add(org); db.flush()
    owner, owner_hdrs = _team_user(db, org, "owner", "owner")
    colleague, _ = _team_user(db, org, "contributor", "colleague")

    r = client.patch(f"/v1/auth/team/{colleague.id}/role", headers=owner_hdrs,
                     json={"role": "programme_admin"})
    assert r.status_code == 403


def test_super_admin_can_grant_a_steward_role(client, db):
    from app import models
    org = models.Organisation(name="Team Org 3", org_type="department"); db.add(org); db.flush()
    admin, admin_hdrs = _team_user(db, org, "super_admin", "admin")
    colleague, _ = _team_user(db, org, "owner", "colleague")

    r = client.patch(f"/v1/auth/team/{colleague.id}/role", headers=admin_hdrs,
                     json={"role": "programme_admin"})
    assert r.status_code == 200 and r.json()["role"] == "programme_admin"


def test_cannot_change_your_own_role(client, db):
    from app import models
    org = models.Organisation(name="Team Org 4", org_type="department"); db.add(org); db.flush()
    owner, owner_hdrs = _team_user(db, org, "owner", "owner")

    r = client.patch(f"/v1/auth/team/{owner.id}/role", headers=owner_hdrs, json={"role": "assessor"})
    assert r.status_code == 400


def test_cannot_change_a_role_across_organisations(client, db):
    from app import models
    org_a = models.Organisation(name="Team Org 5a", org_type="department"); db.add(org_a); db.flush()
    org_b = models.Organisation(name="Team Org 5b", org_type="department"); db.add(org_b); db.flush()
    owner, owner_hdrs = _team_user(db, org_a, "owner", "owner")
    outsider, _ = _team_user(db, org_b, "owner", "outsider")

    r = client.patch(f"/v1/auth/team/{outsider.id}/role", headers=owner_hdrs, json={"role": "assessor"})
    assert r.status_code == 404


def test_contributor_cannot_manage_team_roles(client, db):
    from app import models
    org = models.Organisation(name="Team Org 6", org_type="department"); db.add(org); db.flush()
    contrib, contrib_hdrs = _team_user(db, org, "contributor", "contrib")
    colleague, _ = _team_user(db, org, "owner", "colleague")

    r = client.patch(f"/v1/auth/team/{colleague.id}/role", headers=contrib_hdrs, json={"role": "assessor"})
    assert r.status_code == 403


def test_unknown_role_is_rejected(client, db):
    from app import models
    org = models.Organisation(name="Team Org 7", org_type="department"); db.add(org); db.flush()
    owner, owner_hdrs = _team_user(db, org, "owner", "owner")
    colleague, _ = _team_user(db, org, "owner", "colleague")

    r = client.patch(f"/v1/auth/team/{colleague.id}/role", headers=owner_hdrs, json={"role": "wizard"})
    assert r.status_code == 422


# ── self-service signup (Route A) ────────────────────────────────────────────
# The chosen onboarding path until Parichay SSO lands: there is no sign-up page,
# so first sign-in IS account creation, and the first domain registration is what
# creates the organisation. Both were exercised only by hand before this.

def _signup(client, monkeypatch, email: str, code: str = "123456"):
    """Run a brand-new address through the real OTP flow; return auth headers."""
    monkeypatch.setattr(security, "new_otp", lambda: code)
    assert client.post("/v1/auth/otp/request", json={"email": email}).status_code == 202
    r = client.post("/v1/auth/otp/verify",
                    json={"email": email, "code": code, "device_pubkey": "pk-signup"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_first_sign_in_creates_an_owner_with_no_organisation(client, db, monkeypatch):
    from app import models
    email = "newjoiner@meity.gov.in"
    assert db.query(models.User).filter(models.User.email == email).first() is None

    _signup(client, monkeypatch, email)

    user = db.query(models.User).filter(models.User.email == email).first()
    assert user is not None
    assert user.role == "owner"
    assert user.org_id is None          # org-less until the first domain
    assert user.display_name == "newjoiner"
    assert user.last_login_at is not None


def test_signing_in_again_reuses_the_account_rather_than_creating_a_second(client, db, monkeypatch):
    from app import models
    email = "returning@meity.gov.in"
    _signup(client, monkeypatch, email)
    first = db.query(models.User).filter(models.User.email == email).one()
    first_id = first.id

    _signup(client, monkeypatch, email, code="654321")

    rows = db.query(models.User).filter(models.User.email == email).all()
    assert len(rows) == 1 and rows[0].id == first_id


def test_registering_the_first_domain_provisions_an_organisation(client, db, monkeypatch):
    from app import models
    email = "provisioner@meity.gov.in"
    hdrs = _signup(client, monkeypatch, email)

    r = client.post("/v1/domains", headers=hdrs, json={"url": "provision-test.gov.in"})
    assert r.status_code in (200, 201)

    db.expire_all()
    user = db.query(models.User).filter(models.User.email == email).one()
    assert user.org_id is not None
    org = db.get(models.Organisation, user.org_id)
    assert org.name == "provisioner's Organisation"
    assert org.org_type == "department"


def test_a_second_domain_joins_the_same_organisation(client, db, monkeypatch):
    from app import models
    email = "twodomains@meity.gov.in"
    hdrs = _signup(client, monkeypatch, email)

    client.post("/v1/domains", headers=hdrs, json={"url": "first-domain.gov.in"})
    db.expire_all()
    org_id = db.query(models.User).filter(models.User.email == email).one().org_id

    client.post("/v1/domains", headers=hdrs, json={"url": "second-domain.gov.in"})
    db.expire_all()
    assert db.query(models.User).filter(models.User.email == email).one().org_id == org_id
    assert db.query(models.Domain).filter(models.Domain.org_id == org_id).count() == 2


def test_a_self_served_owner_cannot_audit_a_domain_it_has_not_proven(client, db, monkeypatch):
    # Signup is deliberately open, so domain verification — not the sign-up step —
    # is what gates every capability that matters.
    email = "unproven@meity.gov.in"
    hdrs = _signup(client, monkeypatch, email)
    dom = client.post("/v1/domains", headers=hdrs, json={"url": "unproven-site.gov.in"}).json()

    r = client.post("/v1/audits", headers=hdrs, json={"domain_id": dom["id"], "depth": 3})
    assert r.status_code == 403
    assert "not verified" in r.json()["detail"].lower()


def test_a_self_served_owner_cannot_force_verify_its_own_domain(client, db, monkeypatch):
    # Otherwise self-service signup would be a self-service route to "verified".
    email = "selfapprove@meity.gov.in"
    hdrs = _signup(client, monkeypatch, email)
    dom = client.post("/v1/domains", headers=hdrs, json={"url": "selfapprove-site.gov.in"}).json()

    r = client.post(f"/v1/domains/{dom['id']}/force-verify", headers=hdrs,
                    json={"reason": "trying to approve my own domain without proof"})
    assert r.status_code == 403


def test_a_new_account_sees_only_its_own_estate(client, db, monkeypatch):
    from app import models
    other = models.Organisation(name="Someone Else's Dept", org_type="department")
    db.add(other); db.flush()
    db.add(models.Domain(org_id=other.id, url="not-yours.gov.in", tld="gov.in",
                         verify_status="verified"))
    db.commit()

    hdrs = _signup(client, monkeypatch, "fenced@meity.gov.in")
    client.post("/v1/domains", headers=hdrs, json={"url": "mine-only.gov.in"})

    urls = {d["url"] for d in client.get("/v1/domains", headers=hdrs).json()}
    assert urls == {"mine-only.gov.in"}


# ── server-side idle timeout ─────────────────────────────────────────────────
# The 30-minute timer in AppShell is client-side only: it stops when the tab
# closes, and disabling JS bypassed it entirely, leaving the 60-day refresh
# cookie free to mint a new session hours later. These pin the server half.

def _age_session(db, cookie_holder, seconds: int):
    """Backdate the live session's last rotation to simulate idleness."""
    from app import models
    from datetime import datetime, timezone, timedelta
    s = (db.query(models.Session).filter(models.Session.revoked_at.is_(None))
           .order_by(models.Session.created_at.desc()).first())
    s.rotated_at = datetime.now(timezone.utc) - timedelta(seconds=seconds)
    db.commit()
    return s


def _signed_in(client, monkeypatch, email="idle.user@nic.in"):
    monkeypatch.setattr(security, "new_otp", lambda: "123456")
    client.post("/v1/auth/otp/request", json={"email": email})
    r = client.post("/v1/auth/otp/verify",
                    json={"email": email, "code": "123456", "device_pubkey": "pk", "trust_device": True})
    assert r.status_code == 200
    client.cookies.set("govux_rt", r.cookies["govux_rt"])
    return r


def test_refresh_is_refused_after_the_idle_window(client, db, monkeypatch):
    _signed_in(client, monkeypatch, "idle.expired@nic.in")
    _age_session(db, client, settings.idle_timeout_seconds + 60)

    r = client.post("/v1/auth/refresh")
    assert r.status_code == 401
    assert "inactivity" in r.json()["detail"].lower()


def test_refresh_still_works_inside_the_idle_window(client, db, monkeypatch):
    _signed_in(client, monkeypatch, "idle.active@nic.in")
    # idle for most of the window, but not past it
    _age_session(db, client, settings.idle_timeout_seconds - 120)

    r = client.post("/v1/auth/refresh")
    assert r.status_code == 200 and r.json()["access_token"]


def test_the_idle_window_exceeds_the_access_token_lifetime(client):
    # An active browser only refreshes when its access token expires. If the
    # idle window were shorter than that, a user who is still working would be
    # signed out purely for not having crossed a token boundary.
    assert settings.idle_timeout_seconds >= settings.access_ttl_seconds


def test_an_idle_timeout_does_not_kill_the_whole_session_family(client, db, monkeypatch):
    # Timing out is not theft: the family must survive so a fresh sign-in on the
    # same device works normally, rather than the user hitting "session revoked".
    from app import models
    _signed_in(client, monkeypatch, "idle.family@nic.in")
    sess = _age_session(db, client, settings.idle_timeout_seconds + 60)
    family = sess.family_id

    assert client.post("/v1/auth/refresh").status_code == 401

    killed = (db.query(models.Session)
                .filter(models.Session.family_id == family,
                        models.Session.revoked_at.isnot(None)).count())
    assert killed == 1, "only the idle session should be revoked, not the family"


# ── seed reconciliation ──────────────────────────────────────────────────────
# The seed used to bail out the moment steward@indiapost.gov.in existed, so the
# one case worth fixing — a deployment where that address had already been
# created by self-service sign-in, in its own auto-provisioned org — was the
# exact case it refused to touch. Local and deployed drifted apart as a result.

def test_seed_reconciles_a_self_service_account_into_the_demo_org(db):
    from app import models, seed as demo_seed
    demo_seed.seed()

    # simulate the deployed state: same address, self-service defaults, own org
    stray = models.Organisation(name="stray org", org_type="department")
    db.add(stray); db.flush()
    u = db.query(models.User).filter(models.User.email == demo_seed.STEWARD_EMAIL).one()
    u.org_id, u.role, u.display_name = stray.id, "owner", "steward"
    db.commit()

    stats = demo_seed.seed()

    db.expire_all()
    u = db.query(models.User).filter(models.User.email == demo_seed.STEWARD_EMAIL).one()
    org = db.get(models.Organisation, u.org_id)
    assert org.name == demo_seed.ORG_NAME
    assert u.role == "programme_admin"
    assert u.display_name == "MeitY/NIC Steward"
    assert stats["users_updated"] >= 1


def test_seeding_twice_creates_nothing_the_second_time(db):
    from app import seed as demo_seed
    demo_seed.seed()
    again = demo_seed.seed()
    assert again["users_created"] == 0
    assert again["domains_created"] == 0
    assert again["schedules_created"] == 0
    assert again["discovered_created"] == 0
    assert again["org"] == "existing"


def test_seed_never_steals_a_domain_another_org_has_proven(db):
    from app import models, seed as demo_seed
    # DOMAINS[1], not [0]: the seed hangs a monitoring schedule off the first
    # domain, and clearing it would trip that foreign key rather than test this.
    url = demo_seed.DOMAINS[1][0]
    # Start from no claim on this URL, whatever earlier tests in this file did:
    # a verified row already exists once the seed has run, and uq_domain_verified_url
    # (correctly) forbids a second verified claim on the same host.
    db.query(models.Domain).filter(models.Domain.url == url).delete()
    other = models.Organisation(name="Someone Else", org_type="department")
    db.add(other); db.flush()
    db.add(models.Domain(org_id=other.id, url=url, tld="gov.in",
                         verify_status="verified"))
    db.commit()

    demo_seed.seed()

    db.expire_all()
    d = db.query(models.Domain).filter(models.Domain.url == url).one()
    assert d.org_id == other.id, "a verified claim must never be reassigned by a seed"
