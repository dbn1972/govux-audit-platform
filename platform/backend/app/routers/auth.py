"""Authentication: gov-email OTP + device-bound rotating sessions."""
import ipaddress
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from sqlalchemy import desc, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import settings
from .. import models, security
from ..schemas import (OtpRequest, OtpVerify, TokenPair, DeviceOut, OrganisationUpdate,
                       RoleUpdate, InvitationCreate)
from ..deps import current_user
from ..services import ratelimit, captcha, authguard, settings_store, audit_log
from ..services import email as email_svc

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    """Client host, or None if it isn't a real IP (e.g. TestClient's 'testclient')."""
    host = request.client.host if request.client else None
    try:
        ipaddress.ip_address(host)
        return host
    except (ValueError, TypeError):
        return None


@router.get("/me")
def me(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """The signed-in identity, role and entitlements — so the UI can tailor the
    navigation and surface quotas instead of showing dead-ends."""
    is_steward = user.role in ("programme_admin", "super_admin")
    free_pages = settings_store.get_int("free_registered_pages", settings.free_registered_pages)
    org = db.get(models.Organisation, user.org_id) if user.org_id else None
    return {
        "id": str(user.id), "email": user.email, "display_name": user.display_name,
        "role": user.role, "is_steward": is_steward,
        "org_id": str(user.org_id) if user.org_id else None,
        "org_name": org.name if org else None,
        "entitlements": {
            "unlimited_audits": True,
            "free_pages_per_audit": free_pages,
            "can_request_larger_crawl": True,
            "studio_enabled": bool(org.studio_enabled) if org else False,
        },
        "org_state_code": org.state_code if org else None,
    }


@router.patch("/organisation")
def update_organisation(body: OrganisationUpdate, user: models.User = Depends(current_user),
                        db: Session = Depends(get_db)):
    """Edit the caller's own organisation's name / state-UT tag. Gap: previously
    nothing ever set `state_code`, so the national States & UTs roll-up could
    never show anything. Restricted to org-admin-ish roles, not every member —
    contributor/assessor can view but shouldn't rename the organisation."""
    if user.role not in ("owner", "programme_admin", "super_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Updating organisation settings requires an owner or admin role")
    if not user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No organisation on this account")
    org = db.get(models.Organisation, user.org_id)
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No organisation on this account")
    if body.name is not None:
        org.name = body.name
    if body.state_code is not None:
        org.state_code = body.state_code or None   # "" clears the tag
    db.commit()
    return {"org_id": str(org.id), "org_name": org.name, "org_state_code": org.state_code}


ALL_ROLES = ("owner", "contributor", "assessor", "programme_admin", "super_admin")
STEWARD_ROLES = ("programme_admin", "super_admin")


@router.get("/team")
def list_team(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """The caller's own organisation's members, for the role-management screen.
    Previously the only way to grant assessor (or any non-default role) was a
    direct database edit — there was no UI or endpoint for it at all."""
    if not user.org_id:
        return []
    members = (db.query(models.User).filter(models.User.org_id == user.org_id)
                 .order_by(models.User.email).all())
    return [{"id": str(m.id), "email": m.email, "display_name": m.display_name,
             "role": m.role, "last_login_at": m.last_login_at, "is_you": m.id == user.id}
            for m in members]


@router.patch("/team/{target_id}/role")
def update_team_role(target_id: str, body: RoleUpdate, user: models.User = Depends(current_user),
                     db: Session = Depends(get_db)):
    if user.role not in ("owner", "programme_admin", "super_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Managing team roles requires an owner or admin role")
    if body.role not in ALL_ROLES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown role '{body.role}'")
    target = db.get(models.User, target_id)
    # 404 (not 403) on a cross-org hit — never confirm another org's user exists
    if not target or not user.org_id or target.org_id != user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team member not found")
    if target.id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "You can't change your own role — ask another admin")
    # granting steward-level oversight (programme_admin/super_admin) is a
    # platform-wide privilege escalation, not a local team-management action —
    # only an existing super_admin may hand it out
    if body.role in STEWARD_ROLES and user.role != "super_admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only a super_admin can grant a steward role (programme_admin/super_admin)")
    target.role = body.role
    db.commit()
    audit_log.record(db, user.id, "team_role_change", target=str(target.id),
                     detail={"new_role": body.role})
    db.commit()
    return {"id": str(target.id), "email": target.email, "role": target.role}


# ---------- invitations: join an EXISTING organisation ----------------------
# Before this, `users.org_id` started NULL and the first domain registration
# auto-provisioned a one-person org (routers/domains.register_domain), so a
# ministry's second user landed in a separate org and could never see the
# first user's domains, audits or team. An invite is consumed by verify_otp.

def _invite_ttl_days() -> int:
    return settings_store.get_int("invite_ttl_days", 14)


def _require_org_admin(user: models.User, action: str) -> None:
    if user.role not in ("owner", "programme_admin", "super_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"{action} requires an owner or admin role")
    if not user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No organisation on this account")


@router.post("/invitations", status_code=201)
def create_invitation(body: InvitationCreate, user: models.User = Depends(current_user),
                      db: Session = Depends(get_db)):
    _require_org_admin(user, "Inviting colleagues")
    email = str(body.email).lower()
    if not security.is_gov_email(email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Only .gov.in / .nic.in addresses can be invited")
    if body.role not in ALL_ROLES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown role '{body.role}'")
    # same escalation rule as update_team_role: steward roles are platform-wide
    # oversight, so an org owner must not be able to mint one via an invite
    if body.role in STEWARD_ROLES and user.role != "super_admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only a super_admin can invite someone as a steward "
                            "(programme_admin/super_admin)")

    existing_user = db.query(models.User).filter(models.User.email == email).first()
    if existing_user and existing_user.org_id == user.org_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already a member of this organisation")
    if existing_user and existing_user.org_id is not None:
        # don't leak which org they belong to — just refuse
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "That address already belongs to another organisation")

    now = datetime.now(timezone.utc)
    pending = (db.query(models.Invitation)
                 .filter(models.Invitation.email == email,
                         models.Invitation.status == "pending").first())
    if pending and pending.org_id != user.org_id:
        # the partial unique index allows only one live invite per address
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "That address already has a pending invitation elsewhere")
    if pending:
        # re-inviting within the same org just corrects the role / extends the window
        pending.role = body.role
        pending.expires_at = now + timedelta(days=_invite_ttl_days())
        pending.invited_by = user.id
        inv = pending
    else:
        inv = models.Invitation(org_id=user.org_id, email=email, role=body.role,
                                invited_by=user.id, status="pending",
                                expires_at=now + timedelta(days=_invite_ttl_days()))
        db.add(inv)
    db.commit()

    org = db.get(models.Organisation, user.org_id)
    email_svc.send(
        email, f"You've been invited to {org.name} on GovUX",
        f"{user.email} has invited you to join {org.name} on the GovUX Audit Platform "
        f"as {body.role}.\n\nSign in with this email address to accept: "
        f"{settings_store.get_str('public_base_url', 'http://localhost:3000')}/login\n\n"
        f"This invitation expires in {_invite_ttl_days()} days.")
    audit_log.record(db, user.id, "invitation_sent", target=email,
                     detail={"role": body.role, "org_id": str(user.org_id)})
    db.commit()
    return {"id": str(inv.id), "email": inv.email, "role": inv.role,
            "status": inv.status, "expires_at": inv.expires_at}


@router.get("/invitations")
def list_invitations(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Pending invitations for the caller's own organisation."""
    if not user.org_id:
        return []
    rows = (db.query(models.Invitation)
              .filter(models.Invitation.org_id == user.org_id,
                      models.Invitation.status == "pending")
              .order_by(desc(models.Invitation.created_at)).all())
    now = datetime.now(timezone.utc)
    return [{"id": str(i.id), "email": i.email, "role": i.role,
             "expires_at": i.expires_at, "expired": i.expires_at < now,
             "created_at": i.created_at} for i in rows]


@router.delete("/invitations/{invite_id}", status_code=204)
def revoke_invitation(invite_id: str, user: models.User = Depends(current_user),
                      db: Session = Depends(get_db)):
    _require_org_admin(user, "Revoking invitations")
    inv = db.get(models.Invitation, invite_id)
    # 404 (not 403) across orgs — never confirm another org's invitation exists
    if not inv or inv.org_id != user.org_id or inv.status != "pending":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    inv.status = "revoked"
    db.commit()
    audit_log.record(db, user.id, "invitation_revoked", target=inv.email)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _claim_invitation(db: Session, email: str) -> models.Invitation | None:
    """The live invitation for this address, if any. Expiry is checked here rather
    than by a sweeper so a lapsed invite simply stops working."""
    inv = (db.query(models.Invitation)
             .filter(models.Invitation.email == email,
                     models.Invitation.status == "pending").first())
    if inv and inv.expires_at > datetime.now(timezone.utc):
        return inv
    return None


@router.get("/me/export")
def export_my_data(request: Request, user: models.User = Depends(current_user),
                   db: Session = Depends(get_db)):
    """DPDP right to access — return every piece of personal data the platform
    holds about the signed-in user (no secrets: token/OTP hashes are excluded).
    The export itself is logged, since it extracts PII."""
    devices = db.query(models.Device).filter(models.Device.user_id == user.id).all()
    sessions = db.query(models.Session).filter(models.Session.user_id == user.id).all()
    reqs = db.query(models.ScanRequest).filter(models.ScanRequest.user_id == user.id).all()
    logs = (db.query(models.AuditLog).filter(models.AuditLog.actor_id == user.id)
              .order_by(desc(models.AuditLog.created_at)).limit(500).all())
    audits = db.query(models.Audit).filter(models.Audit.requested_by == user.id).all()
    audit_log.record(db, user.id, "dpdp_export", ip=_client_ip(request))
    db.commit()
    return {
        "profile": {"id": str(user.id), "email": user.email, "display_name": user.display_name,
                    "role": user.role, "created_at": user.created_at, "last_login_at": user.last_login_at},
        "devices": [{"label": d.label, "user_agent": d.user_agent, "last_ip": str(d.last_ip) if d.last_ip else None,
                     "last_location": d.last_location, "last_active_at": d.last_active_at} for d in devices],
        "sessions": [{"created_at": s.created_at, "expires_at": s.expires_at,
                      "revoked_at": s.revoked_at} for s in sessions],
        "scan_requests": [{"requested_pages": r.requested_pages, "reason": r.reason,
                           "status": r.status, "created_at": r.created_at} for r in reqs],
        "activity": [{"action": lg.action, "target": lg.target,
                      "ip": str(lg.ip) if lg.ip else None, "at": lg.created_at} for lg in logs],
        "audits_requested": [{"id": str(a.id), "status": a.status, "created_at": a.created_at} for a in audits],
    }


@router.delete("/me")
def erase_my_data(request: Request, user: models.User = Depends(current_user),
                  db: Session = Depends(get_db)):
    """DPDP right to erasure — remove the user's personal data. Audit records are
    retained (a lawful-purpose record of who audited a public site) but stripped
    of PII: the account is anonymised, sessions and device keys are deleted, and
    IPs on the user's activity log are cleared. Irreversible."""
    uid = user.id
    db.query(models.Session).filter(models.Session.user_id == uid).delete()
    db.query(models.Device).filter(models.Device.user_id == uid).delete()
    for lg in db.query(models.AuditLog).filter(models.AuditLog.actor_id == uid).all():
        lg.ip = None
    # anonymise: keep the row (FKs from audits) but drop identifiers. The tombstone
    # email stays gov-domain-valid (DB CHECK) and unique via the user id.
    user.email = f"erased-{uid}@erased.nic.in"
    user.display_name = None
    user.is_active = False
    audit_log.record(db, None, "dpdp_erase", target=str(uid), ip=_client_ip(request))
    db.commit()
    return {"status": "erased", "message": "Your personal data has been removed. This device is now signed out."}


@router.post("/otp/request", status_code=202)
def request_otp(body: OtpRequest, request: Request, db: Session = Depends(get_db)):
    email = str(body.email).lower()
    if not security.is_gov_email(email):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only .gov.in or .nic.in email addresses are allowed")
    # throttle OTP requests per IP (stops OTP-spam / enumeration in production)
    if settings.env == "production":
        ip = _client_ip(request) or "unknown"
        limit = settings_store.get_int("otp_request_ip_limit", settings.otp_request_ip_limit)
        if ratelimit.hit(f"otp-req:{ip}", 3600) > limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                "Too many OTP requests. Please wait before trying again.")
    code = security.new_otp()
    otp = models.OtpCode(
        email=email, code_hash=security.hash_secret(code),
        expires_at=security.otp_expiry(),
        created_ip=_client_ip(request),
    )
    db.add(otp)
    db.commit()
    email_svc.send_otp(email, code)   # provider chosen at runtime via admin config
    # In dev mode, include the OTP in the response so it's visible in the browser
    # console / network tab (never in production — this would leak the auth factor)
    resp = {"message": "OTP sent", "email": email}
    import os
    if settings.env != "production" or os.environ.get("GOVUX_ALLOW_CONSOLE_OTP") == "true":
        resp["dev_otp"] = code
    return resp


@router.post("/otp/verify", response_model=TokenPair)
def verify_otp(body: OtpVerify, response: Response, db: Session = Depends(get_db)):
    email = str(body.email).lower()

    # escalating brute-force lock-out (per account)
    guard = authguard.status(email)
    if guard["locked"]:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail={
            "message": f"Too many failed attempts. Try again in about {guard['retry_after'] // 60 + 1} minute(s).",
            "retry_after": guard["retry_after"], "captcha_required": guard["captcha_required"]})
    if (guard["captcha_required"] and settings_store.get_bool("captcha_enabled", True)
            and not captcha.verify(body.captcha)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail={
            "message": "Please solve the CAPTCHA to continue.", "captcha_required": True})

    otp = (db.query(models.OtpCode)
             .filter(models.OtpCode.email == email, models.OtpCode.consumed_at.is_(None))
             .order_by(desc(models.OtpCode.created_at)).first())
    if not otp or otp.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "OTP expired or not found")
    if otp.attempts >= settings.otp_max_attempts:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts")
    if not security.verify_secret(body.code, otp.code_hash):
        otp.attempts += 1
        db.commit()
        g = authguard.record_failure(email)   # escalate: 3 fails -> 10 min -> +CAPTCHA + 20 min
        detail = {"message": "Invalid OTP"}
        if g.get("locked"):
            detail = {"message": f"Too many failed attempts. Locked for about {g['retry_after'] // 60} minute(s).",
                      "retry_after": g["retry_after"], "captcha_required": g.get("captcha_required", False)}
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=detail)

    authguard.reset(email)                     # clean slate on success
    otp.consumed_at = datetime.now(timezone.utc)

    # upsert user (first sign-in creates the account)
    user = db.query(models.User).filter(models.User.email == email).first()
    invite = _claim_invitation(db, email)
    if not user:
        # An invited address joins the inviting org with the invited role. Without
        # an invite the account starts org-less and defaults to owner — the first
        # domain it registers auto-provisions an organisation for it.
        #
        # Self-service signup is the deliberate onboarding route until Parichay
        # SSO is introduced. It means possession of any .gov.in mailbox is enough
        # to create an owner account, so the real gate on what that account can
        # DO is domain verification (an owner with no verified domain can audit
        # nothing), not the sign-up step.
        user = models.User(email=email, display_name=email.split("@")[0],
                           org_id=invite.org_id if invite else None,
                           role=invite.role if invite else "owner")
        db.add(user)
        db.flush()
    elif invite and user.org_id is None:
        # existing org-less account (signed in before being invited) joins now
        user.org_id = invite.org_id
        user.role = invite.role
    else:
        invite = None   # already in an org: leave the invite alone, don't move them
    if invite:
        invite.status = "accepted"
        invite.accepted_at = datetime.now(timezone.utc)
        invite.accepted_by = user.id
    user.last_login_at = datetime.now(timezone.utc)

    # register the device (device-bound session)
    device = models.Device(user_id=user.id, device_pubkey=body.device_pubkey,
                           label=body.device_label, trusted=body.trust_device)
    db.add(device)
    db.flush()

    # issue tokens
    access = security.issue_access_token(str(user.id), user.role, str(device.id))
    refresh = security.new_refresh_token()
    sess = models.Session(
        user_id=user.id, device_id=device.id,
        refresh_token_hash=security.hash_secret(refresh),
        family_id=security.new_family_id(), expires_at=security.refresh_expiry(),
    )
    db.add(sess)
    db.commit()  # (audit-log the login event via the audit_log table in production)

    # refresh token lives in an HttpOnly, Secure, SameSite cookie (never JS-readable).
    # path="/" so it is sent both directly (/v1/auth/refresh) and through the Next
    # proxy the browser actually uses (/api/v1/auth/refresh) — a narrower path broke
    # silent refresh because the browser never hit the scoped path.
    response.set_cookie("govux_rt", refresh, httponly=True, secure=True,
                        samesite="strict", max_age=settings.refresh_ttl_seconds, path="/")
    return TokenPair(access_token=access, expires_in=settings.access_ttl_seconds)


@router.post("/refresh", response_model=TokenPair)
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    rt = request.cookies.get("govux_rt")
    if not rt:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    rt_hash = security.hash_secret(rt)
    now = datetime.now(timezone.utc)

    # Atomically claim this token for rotation: the WHERE clause means Postgres
    # serialises concurrent UPDATEs on the same row, so only ONE of several
    # parallel refresh calls presenting the same cookie (e.g. two components
    # both hitting a stale access token right after a page reload) can flip
    # revoked_at here. Without this, a plain read-then-write let every racer
    # "win", each minting its own rotation — and the next one to present the
    # now-already-revoked original token tripped reuse-detection below and
    # killed the whole family, including the sibling sessions just issued.
    claimed = db.execute(
        update(models.Session)
        .where(models.Session.refresh_token_hash == rt_hash,
               models.Session.revoked_at.is_(None))
        .values(revoked_at=now, rotated_at=now)
        .returning(models.Session.user_id, models.Session.device_id,
                   models.Session.family_id)
    ).first()

    if claimed:
        user_id, device_id, family_id = claimed
    else:
        # Didn't win the claim: either this token doesn't exist, is expired, or
        # was already rotated (by us, moments ago, or genuinely reused/stolen).
        sess = (db.query(models.Session)
                  .filter(models.Session.refresh_token_hash == rt_hash).first())
        if not sess:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
        if sess.expires_at < now:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
        if sess.revoked_at is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")   # lost the claim race unexpectedly
        # A row's revocation can come from three places: our own rotation
        # (revoked_at == rotated_at, set together above), a family-wide theft
        # cascade (sets only revoked_at), or an explicit sign-out / device
        # revoke (also sets only revoked_at). Grace forgiveness must apply
        # ONLY to the first case — a logged-out or cascade-killed session must
        # stay dead no matter how recently that happened.
        grace = timedelta(seconds=settings.refresh_reuse_grace_seconds)
        rotated_this_row = sess.rotated_at == sess.revoked_at
        if not rotated_this_row or now - sess.revoked_at > grace:
            # Genuine reuse of a dead credential (theft signal), or a session
            # ended some other way. Kill the whole family: neither an attacker
            # nor the legitimate holder of a stolen token continue.
            db.query(models.Session).filter(
                models.Session.family_id == sess.family_id,
                models.Session.revoked_at.is_(None)).update(
                    {models.Session.revoked_at: now}, synchronize_session=False)
            db.commit()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked — please sign in again")
        # Rotated moments ago by a concurrent request: a benign race, not
        # theft. Rotate again from this same lineage so the caller still gets
        # a valid session instead of being forced to sign in again.
        user_id, device_id, family_id = sess.user_id, sess.device_id, sess.family_id

    user = db.get(models.User, user_id)
    new_rt = security.new_refresh_token()
    db.add(models.Session(
        user_id=user_id, device_id=device_id,
        refresh_token_hash=security.hash_secret(new_rt),
        family_id=family_id, expires_at=security.refresh_expiry()))
    db.commit()

    access = security.issue_access_token(str(user.id), user.role, str(device_id))
    response.set_cookie("govux_rt", new_rt, httponly=True, secure=True,
                        samesite="strict", max_age=settings.refresh_ttl_seconds, path="/")
    return TokenPair(access_token=access, expires_in=settings.access_ttl_seconds)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Revoke this browser's session and clear its refresh cookie.

    No bearer token required: a user may click Sign out after the in-memory
    access token is already gone (e.g. right after a reload), so the refresh
    cookie alone is what identifies the session to kill. Idempotent — signing
    out twice, or with no active session, is a harmless no-op."""
    rt = request.cookies.get("govux_rt")
    if rt:
        rt_hash = security.hash_secret(rt)
        (db.query(models.Session)
           .filter(models.Session.refresh_token_hash == rt_hash,
                   models.Session.revoked_at.is_(None))
           .update({"revoked_at": datetime.now(timezone.utc)}))
        db.commit()
    response.delete_cookie("govux_rt", path="/", httponly=True, secure=True, samesite="strict")
    return Response(status_code=204)


@router.get("/devices", response_model=list[DeviceOut])
def list_devices(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    devices = (db.query(models.Device).filter(models.Device.user_id == user.id)
                 .order_by(desc(models.Device.last_active_at)).all())
    return [DeviceOut(id=str(d.id), label=d.label, last_location=d.last_location,
                      last_active_at=d.last_active_at, trusted=d.trusted) for d in devices]


@router.delete("/devices/{device_id}", status_code=204)
def revoke_device(device_id: str, user: models.User = Depends(current_user),
                  db: Session = Depends(get_db)):
    (db.query(models.Session)
       .filter(models.Session.device_id == device_id, models.Session.user_id == user.id)
       .update({"revoked_at": datetime.now(timezone.utc)}))
    (db.query(models.Device)
       .filter(models.Device.id == device_id, models.Device.user_id == user.id)
       .update({"trusted": False}))
    db.commit()
    return Response(status_code=204)
