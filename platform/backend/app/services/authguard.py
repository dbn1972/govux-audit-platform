"""Escalating sign-in brute-force lock-out (per account).

Policy: `otp_fail_threshold` (3) failures → lock `otp_lock_seconds` (10 min).
Fail again after that → lock `otp_lock_seconds_2` (20 min) AND require a CAPTCHA
on every further attempt until a successful sign-in resets the account.

State lives in Redis with TTLs so it self-heals. Keyed by email; a per-IP limit
on OTP *requests* (in the router) covers the enumeration angle.
"""
from __future__ import annotations
import time

from . import queue, settings_store
from ..config import settings

FAIL = "govux:otp:fail:"
LOCK = "govux:otp:lock:"     # value = unix ts when the lock lifts
TIER = "govux:otp:tier:"     # 0,1,2… escalation level


def _threshold():
    return settings_store.get_int("otp_fail_threshold", settings.otp_fail_threshold)


def status(email: str) -> dict:
    """Current gate for this account: locked? retry_after? captcha_required?"""
    try:
        tier = int(queue._r.get(TIER + email) or 0)
        lock = queue._r.get(LOCK + email)
        if lock:
            remaining = int(float(lock) - time.time())
            if remaining > 0:
                return {"locked": True, "retry_after": remaining, "captcha_required": tier >= 2}
        return {"locked": False, "retry_after": 0, "captcha_required": tier >= 2}
    except Exception:
        return {"locked": False, "retry_after": 0, "captcha_required": False}


def record_failure(email: str) -> dict:
    """Register a failed attempt; apply escalation when the threshold is crossed."""
    try:
        n = queue._r.incr(FAIL + email)
        if n == 1:
            queue._r.expire(FAIL + email, 3600)
        if n >= _threshold():
            tier = int(queue._r.get(TIER + email) or 0) + 1
            dur = (settings_store.get_int("otp_lock_seconds", settings.otp_lock_seconds) if tier == 1
                   else settings_store.get_int("otp_lock_seconds_2", settings.otp_lock_seconds_2))
            queue._r.setex(TIER + email, 86400, str(tier))
            queue._r.setex(LOCK + email, dur + 5, str(time.time() + dur))
            queue._r.delete(FAIL + email)
            return {"locked": True, "retry_after": dur, "tier": tier, "captcha_required": tier >= 2}
        return {"locked": False, "remaining_attempts": _threshold() - n}
    except Exception:
        return {"locked": False}


def reset(email: str) -> None:
    try:
        queue._r.delete(FAIL + email, LOCK + email, TIER + email)
    except Exception:
        pass
