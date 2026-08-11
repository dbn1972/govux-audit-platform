"""Invitation flow — joining an EXISTING organisation.

Before this existed, `users.org_id` started NULL and `POST /v1/domains`
auto-provisioned a one-person org, so a ministry's second user was permanently
stranded in their own org. These tests pin the sharing path and the two
privilege rules that guard it.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from app import models, security


def _gov(prefix):
    return f"{prefix}.{uuid.uuid4().hex[:8]}@nic.in"


def _user(db, org, role, email=None):
    u = models.User(email=email or _gov(role), org_id=org.id if org else None, role=role)
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    return u, {"Authorization": f"Bearer {security.issue_access_token(str(u.id), role, str(dev.id))}"}


def _accept(client, db, email, monkeypatch):
    """Drive a real OTP sign-in for `email` so the invite is consumed the way
    production consumes it (verify_otp), not by poking the row directly."""
    code = "123456"
    otp = models.OtpCode(email=email, code_hash=security.hash_secret(code),
                         expires_at=datetime.now(timezone.utc) + timedelta(minutes=5))
    db.add(otp); db.commit()
    r = client.post("/v1/auth/otp/verify",
                    json={"email": email, "code": code, "device_pubkey": "pk-new"})
    assert r.status_code == 200, r.text
    db.expire_all()
    return db.query(models.User).filter(models.User.email == email).first()


# ---------- the core win: two people, one organisation ----------------------
def test_invited_user_joins_the_inviting_org_on_first_sign_in(client, ctx, db, monkeypatch):
    invitee = _gov("colleague")
    r = client.post("/v1/auth/invitations", headers=ctx["headers"],
                    json={"email": invitee, "role": "contributor"})
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "contributor"

    user = _accept(client, db, invitee, monkeypatch)
    # THE regression this whole feature exists to prevent: a brand-new account
    # used to land org-less and default to owner, then mint its own org.
    assert user.org_id == ctx["org"].id
    assert user.role == "contributor"

    inv = db.query(models.Invitation).filter(models.Invitation.email == invitee).first()
    assert inv.status == "accepted" and inv.accepted_by == user.id
    # and it no longer shows as pending to the inviter
    assert client.get("/v1/auth/invitations", headers=ctx["headers"]).json() == []


def test_existing_org_less_user_joins_on_next_sign_in(client, ctx, db, monkeypatch):
    """Someone who signed in BEFORE being invited still gets adopted."""
    email = _gov("early")
    db.add(models.User(email=email, role="owner")); db.commit()
    client.post("/v1/auth/invitations", headers=ctx["headers"],
                json={"email": email, "role": "assessor"})
    user = _accept(client, db, email, monkeypatch)
    assert user.org_id == ctx["org"].id and user.role == "assessor"


def test_user_already_in_another_org_is_never_moved(client, ctx, db, monkeypatch):
    """An invite must not silently relocate someone who already belongs somewhere."""
    other = models.Organisation(name=f"Other {uuid.uuid4().hex[:6]}", org_type="department")
    db.add(other); db.flush()
    settled, _ = _user(db, other, "owner")
    # force a pending invite past the endpoint's own 409 guard
    db.add(models.Invitation(org_id=ctx["org"].id, email=settled.email, role="contributor",
                             status="pending",
                             expires_at=datetime.now(timezone.utc) + timedelta(days=7)))
    db.commit()

    _accept(client, db, settled.email, monkeypatch)
    db.refresh(settled)
    assert settled.org_id == other.id and settled.role == "owner"


def test_expired_invitation_is_not_honoured(client, ctx, db, monkeypatch):
    email = _gov("late")
    db.add(models.Invitation(org_id=ctx["org"].id, email=email, role="contributor",
                             status="pending",
                             expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
    db.commit()
    user = _accept(client, db, email, monkeypatch)
    assert user.org_id is None and user.role == "owner"


# ---------- privilege rules -------------------------------------------------
def test_contributor_cannot_invite(client, ctx, db):
    _, headers = _user(db, ctx["org"], "contributor")
    r = client.post("/v1/auth/invitations", headers=headers,
                    json={"email": _gov("x"), "role": "contributor"})
    assert r.status_code == 403


@pytest.mark.parametrize("role", ["programme_admin", "super_admin"])
def test_owner_cannot_mint_a_steward_via_invite(client, ctx, db, role):
    """Steward roles are platform-wide oversight — an org owner escalating one
    through the invite path would bypass update_team_role's same restriction."""
    _, headers = _user(db, ctx["org"], "owner")
    r = client.post("/v1/auth/invitations", headers=headers,
                    json={"email": _gov("s"), "role": role})
    assert r.status_code == 403

    su, su_headers = _user(db, ctx["org"], "super_admin")
    assert client.post("/v1/auth/invitations", headers=su_headers,
                       json={"email": _gov("s"), "role": role}).status_code == 201


def test_non_gov_email_and_unknown_role_rejected(client, ctx):
    assert client.post("/v1/auth/invitations", headers=ctx["headers"],
                       json={"email": "someone@gmail.com"}).status_code == 400
    assert client.post("/v1/auth/invitations", headers=ctx["headers"],
                       json={"email": _gov("r"), "role": "wizard"}).status_code == 422


# ---------- duplicate / conflict handling -----------------------------------
def test_reinvite_same_org_updates_role_instead_of_duplicating(client, ctx, db):
    email = _gov("twice")
    client.post("/v1/auth/invitations", headers=ctx["headers"],
                json={"email": email, "role": "contributor"})
    r = client.post("/v1/auth/invitations", headers=ctx["headers"],
                    json={"email": email, "role": "assessor"})
    assert r.status_code == 201 and r.json()["role"] == "assessor"
    # the partial unique index only permits one live invite; make sure we
    # corrected the existing row rather than leaving two behind
    assert db.query(models.Invitation).filter(
        models.Invitation.email == email, models.Invitation.status == "pending").count() == 1


def test_existing_member_and_cross_org_pending_both_conflict(client, ctx, db):
    member, _ = _user(db, ctx["org"], "contributor")
    assert client.post("/v1/auth/invitations", headers=ctx["headers"],
                       json={"email": member.email}).status_code == 409

    other = models.Organisation(name=f"Rival {uuid.uuid4().hex[:6]}", org_type="department")
    db.add(other); db.flush()
    contested = _gov("contested")
    db.add(models.Invitation(org_id=other.id, email=contested, role="contributor",
                             status="pending",
                             expires_at=datetime.now(timezone.utc) + timedelta(days=7)))
    db.commit()
    assert client.post("/v1/auth/invitations", headers=ctx["headers"],
                       json={"email": contested}).status_code == 409


# ---------- listing & revocation --------------------------------------------
def test_list_is_org_scoped_and_revoke_stops_acceptance(client, ctx, db, monkeypatch):
    email = _gov("revoked")
    inv_id = client.post("/v1/auth/invitations", headers=ctx["headers"],
                         json={"email": email}).json()["id"]

    listed = client.get("/v1/auth/invitations", headers=ctx["headers"]).json()
    assert [i["email"] for i in listed] == [email]

    # another org can neither see nor revoke it
    other = models.Organisation(name=f"Nosy {uuid.uuid4().hex[:6]}", org_type="department")
    db.add(other); db.flush()
    _, outsider = _user(db, other, "owner")
    assert client.get("/v1/auth/invitations", headers=outsider).json() == []
    assert client.delete(f"/v1/auth/invitations/{inv_id}", headers=outsider).status_code == 404

    assert client.delete(f"/v1/auth/invitations/{inv_id}", headers=ctx["headers"]).status_code == 204
    user = _accept(client, db, email, monkeypatch)
    assert user.org_id is None      # revoked invite grants nothing
