"""Pluggable CAPTCHA.

- Production: set `GOVUX_CAPTCHA_SECRET` and `verify()` validates a Cloudflare
  Turnstile / reCAPTCHA widget token against the provider.
- Dev / self-contained: a built-in arithmetic challenge — `issue()` returns a
  question + id, and the client answers with the token `"<id>:<answer>"`.
Challenges are single-use and short-lived (stored in Redis).
"""
from __future__ import annotations
import secrets

from . import queue
from ..config import settings

CH_PREFIX = "govux:captcha:"
TTL = 300


def issue() -> dict:
    """Return a built-in challenge {captcha_id, question}. (No-op fields in provider mode.)"""
    a, b = secrets.randbelow(9) + 1, secrets.randbelow(9) + 1
    cid = secrets.token_urlsafe(8)
    try:
        queue._r.setex(CH_PREFIX + cid, TTL, str(a + b))
    except Exception:
        pass
    return {"captcha_id": cid, "question": f"What is {a} + {b}?",
            "mode": "provider" if settings.captcha_secret else "builtin"}


def verify(token: str | None) -> bool:
    if not token:
        return False
    if settings.captcha_secret:
        return _verify_provider(token)
    # built-in: token == "<captcha_id>:<answer>"
    try:
        cid, ans = token.split(":", 1)
        real = queue._r.get(CH_PREFIX + cid)
        if real is None:
            return False
        ok = str(ans).strip() == str(real).strip()
        queue._r.delete(CH_PREFIX + cid)   # single use
        return ok
    except Exception:
        return False


def _verify_provider(token: str) -> bool:  # pragma: no cover - needs network
    import httpx
    try:
        r = httpx.post("https://challenges.cloudflare.com/turnstile/v0/siteverify",
                       data={"secret": settings.captcha_secret, "response": token}, timeout=10)
        return bool(r.json().get("success"))
    except Exception:
        return False
