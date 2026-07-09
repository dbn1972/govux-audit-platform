"""Authentication: gov-email OTP + device-bound rotating sessions."""
import ipaddress
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import settings
from .. import models, security
from ..schemas import OtpRequest, OtpVerify, TokenPair, DeviceOut
from ..deps import current_user
from ..services import ratelimit, captcha, authguard, settings_store
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


@router.post("/otp/request", status_code=202)
def request_otp(body: OtpRequest, request: Request, db: Session = Depends(get_db)):
    email = str(body.email).lower()
    if not security.is_gov_email(email):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only .gov.in or .nic.in email addresses are allowed")
    # throttle OTP requests per IP (stops OTP-spam / enumeration)
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
    return {"message": "OTP sent", "email": email}


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
    if not user:
        user = models.User(email=email, display_name=email.split("@")[0], role="owner")
        db.add(user)
        db.flush()
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
    # look up by hash REGARDLESS of revoked state so we can detect token reuse
    sess = (db.query(models.Session)
              .filter(models.Session.refresh_token_hash == rt_hash).first())
    if not sess:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
    if sess.revoked_at is not None:
        # a rotated (already-superseded) token was replayed => token theft. Kill the
        # whole session family so neither attacker nor victim can keep using it.
        db.query(models.Session).filter(
            models.Session.family_id == sess.family_id,
            models.Session.revoked_at.is_(None)).update(
                {models.Session.revoked_at: now}, synchronize_session=False)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked — please sign in again")
    if sess.expires_at < now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")

    user = db.get(models.User, sess.user_id)
    # rotate: revoke the presented token and mint a fresh one in the SAME family, so a
    # later replay of the old token is detectable as reuse (branch above).
    sess.revoked_at = now
    sess.rotated_at = now
    new_rt = security.new_refresh_token()
    db.add(models.Session(
        user_id=sess.user_id, device_id=sess.device_id,
        refresh_token_hash=security.hash_secret(new_rt),
        family_id=sess.family_id, expires_at=security.refresh_expiry()))
    db.commit()

    access = security.issue_access_token(str(user.id), user.role, str(sess.device_id))
    response.set_cookie("govux_rt", new_rt, httponly=True, secure=True,
                        samesite="strict", max_age=settings.refresh_ttl_seconds, path="/")
    return TokenPair(access_token=access, expires_in=settings.access_ttl_seconds)


@router.get("/devices", response_model=list[DeviceOut])
def list_devices(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    devices = db.query(models.Device).filter(models.Device.user_id == user.id).all()
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
