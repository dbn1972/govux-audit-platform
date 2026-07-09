"""Encryption at rest for secret settings (SMTP password, CAPTCHA secret, …).

Application-level symmetric encryption (Fernet = AES-128-CBC + HMAC) with a master
key. In production the master key comes from a secret manager (`GOVUX_SECRET_KEY`);
in dev it is derived from the JWT secret so it works out of the box. Ciphertexts
carry an `enc:` prefix so plaintext/legacy values are handled transparently.

This is the standard envelope pattern minus a hosted KMS — swap `_key()` for a
KMS data-key call to graduate to full envelope encryption.
"""
from __future__ import annotations
import base64
import hashlib

from ..config import settings

PREFIX = "enc:"


def _key() -> bytes:
    raw = (settings.secret_key or settings.jwt_secret).encode()
    return base64.urlsafe_b64encode(hashlib.sha256(raw).digest())   # 32-byte Fernet key


_DEFAULT_JWT = "change-me-in-prod"


def assert_production_key() -> None:
    """Fail fast at startup in production on weak/missing key material (SAST-001).

    The JWT secret signs access tokens AND keys every OTP/refresh HMAC, so a default
    value = total auth bypass. The encryption master key must exist and be distinct
    from the JWT secret (one secret compromising both signing and secrets-at-rest)."""
    if getattr(settings, "env", "dev") != "production":
        return
    if not settings.jwt_secret or settings.jwt_secret == _DEFAULT_JWT:
        raise RuntimeError(
            "GOVUX_JWT_SECRET must be set to a strong, non-default value in production "
            "(it signs access tokens and keys the OTP/refresh HMACs).")
    if not settings.secret_key or settings.secret_key == settings.jwt_secret:
        raise RuntimeError(
            "GOVUX_SECRET_KEY must be set and distinct from the JWT secret in production "
            "(it encrypts secrets at rest).")


def encrypt(plaintext: str) -> str:
    if plaintext is None:
        return ""
    # Do NOT swallow crypto errors: silently storing a secret in plaintext is worse
    # than failing loudly. Surface the error so the admin sees the write failed.
    from cryptography.fernet import Fernet
    return PREFIX + Fernet(_key()).encrypt(str(plaintext).encode()).decode()


def decrypt(token: str | None) -> str:
    if not token:
        return ""
    if not token.startswith(PREFIX):
        return token            # legacy/plaintext value
    try:
        from cryptography.fernet import Fernet
        return Fernet(_key()).decrypt(token[len(PREFIX):].encode()).decode()
    except Exception:
        return ""
