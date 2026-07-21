"""Auth primitives: gov-email check, OTP, JWT access tokens, device-bound
rotating refresh tokens (the Gmail-style session model)."""
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt
from .config import settings


# ---------- email restriction ----------
def is_gov_email(email: str) -> bool:
    """Accept bare @gov.in / @nic.in addresses as well as any subdomain."""
    e = email.strip().lower()
    domain = e.rsplit("@", 1)[-1]
    return any(domain == sfx.lstrip(".") or domain.endswith(sfx)
               for sfx in settings.allowed_email_suffixes)


# ---------- hashing (OTP + refresh tokens stored only as hashes) ----------
def _hash(value: str) -> str:
    return hmac.HMAC(settings.jwt_secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def hash_secret(value: str) -> str:
    return _hash(value)


def verify_secret(value: str, hashed: str) -> bool:
    return hmac.compare_digest(_hash(value), hashed)


# ---------- OTP ----------
def new_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def otp_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=settings.otp_ttl_seconds)


# ---------- access token (short-lived JWT, held in memory) ----------
def issue_access_token(user_id: str, role: str, device_id: str) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user_id),
        "role": role,
        "did": str(device_id),          # device binding claim
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.access_ttl_seconds)).timestamp()),
        "typ": "access",
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_alg)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])


# ---------- refresh token (rotating, device-bound) ----------
def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def refresh_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=settings.refresh_ttl_seconds)


def new_family_id() -> uuid.UUID:
    return uuid.uuid4()


def verify_device_proof(device_pubkey: str, challenge: str, signature: str) -> bool:
    """Proof-of-possession of the device key (DBSC/WebAuthn).
    Stub: in production verify `signature` over `challenge` with `device_pubkey`.
    """
    return bool(device_pubkey and signature)
