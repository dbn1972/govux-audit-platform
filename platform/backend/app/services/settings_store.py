"""Runtime configuration store — admin-editable settings that override the
env-driven defaults in `config.py`, without a redeploy.

A DB key/value table (`app_settings`) holds overrides; a code registry
(`SCHEMA`) gives each setting its type, category, label and whether it's secret.
Reads are served from a short-lived Redis cache (hot path: rate-limit checks),
loaded from the DB on a miss and invalidated on every write. Typed accessors
fall back to the code default when no override exists.
"""
from __future__ import annotations
from datetime import datetime, timezone

from . import queue, secretbox

CACHE_KEY = "govux:settings"
CACHE_TTL = 60

# key, type, category, label, default, secret, help
SCHEMA: list[dict] = [
    # Free scanner
    {"key": "scan_ip_limit", "type": "int", "category": "Free scanner", "label": "Free scans per IP", "default": 3},
    {"key": "scan_ip_window", "type": "int", "category": "Free scanner", "label": "Quota window (seconds)", "default": 86400},
    {"key": "free_registered_pages", "type": "int", "category": "Free scanner", "label": "Free pages for registered users", "default": 10},
    # Sign-in security
    {"key": "otp_fail_threshold", "type": "int", "category": "Sign-in security", "label": "Failed sign-ins before lock", "default": 3},
    {"key": "otp_lock_seconds", "type": "int", "category": "Sign-in security", "label": "First lock (seconds)", "default": 600},
    {"key": "otp_lock_seconds_2", "type": "int", "category": "Sign-in security", "label": "Escalated lock (seconds)", "default": 1200},
    {"key": "otp_request_ip_limit", "type": "int", "category": "Sign-in security", "label": "OTP requests per IP / hour", "default": 6},
    # CAPTCHA
    {"key": "captcha_enabled", "type": "bool", "category": "CAPTCHA", "label": "Require CAPTCHA over quota", "default": True},
    {"key": "captcha_provider", "type": "str", "category": "CAPTCHA", "label": "Provider (builtin | turnstile | recaptcha)", "default": "builtin"},
    {"key": "captcha_secret", "type": "str", "category": "CAPTCHA", "label": "Provider secret key", "default": "", "secret": True},
    # Email / OTP delivery
    {"key": "email_provider", "type": "str", "category": "Email / OTP delivery", "label": "Provider (console | smtp | api)", "default": "console"},
    {"key": "email_from", "type": "str", "category": "Email / OTP delivery", "label": "From address", "default": "no-reply@govux.gov.in"},
    {"key": "smtp_host", "type": "str", "category": "Email / OTP delivery", "label": "SMTP host", "default": ""},
    {"key": "smtp_port", "type": "int", "category": "Email / OTP delivery", "label": "SMTP port", "default": 587},
    {"key": "smtp_user", "type": "str", "category": "Email / OTP delivery", "label": "SMTP user", "default": ""},
    {"key": "smtp_password", "type": "str", "category": "Email / OTP delivery", "label": "SMTP password", "default": "", "secret": True},
    # Monitoring / Prometheus
    {"key": "metrics_enabled", "type": "bool", "category": "Monitoring / Prometheus", "label": "Expose /metrics for Prometheus", "default": True},
    {"key": "metrics_token", "type": "str", "category": "Monitoring / Prometheus", "label": "/metrics bearer token (blank = open scrape)", "default": "", "secret": True},
    {"key": "cache_ttl_seconds", "type": "int", "category": "Monitoring / Prometheus", "label": "Dashboard cache TTL (seconds)", "default": 120},

    # Integrity Engine (anti-gaming) — detects gaming; caps the verdict, never the score.
    {"key": "integrity_enabled", "type": "bool", "category": "Integrity (anti-gaming)", "label": "Detect gaming (overlays, hidden elements, improbable jumps) and cap the compliance verdict", "default": True},

    # Advisory AI — enriches remediation guidance only; NEVER affects the score.
    {"key": "llm_enabled", "type": "bool", "category": "Advisory AI (remediation)", "label": "Enrich remediation with an LLM (advisory — never affects the score)", "default": False},
    {"key": "llm_provider", "type": "str", "category": "Advisory AI (remediation)", "label": "Provider (anthropic)", "default": "anthropic"},
    {"key": "llm_model", "type": "str", "category": "Advisory AI (remediation)", "label": "Model", "default": "claude-haiku-4-5-20251001"},
    {"key": "llm_api_key", "type": "str", "category": "Advisory AI (remediation)", "label": "API key", "default": "", "secret": True},

    # GovUX Studio (AI prototype generator) — configurable + billable. Reuses the
    # Advisory-AI provider/key above for the actual model calls.
    {"key": "studio_enabled", "type": "bool", "category": "GovUX Studio", "label": "Enable GovUX Studio (AI prototype generator)", "default": False},
    {"key": "studio_max_pages", "type": "int", "category": "GovUX Studio", "label": "Max pages per run", "default": 8},
    {"key": "studio_max_refines", "type": "int", "category": "GovUX Studio", "label": "Max refine iterations toward score ≥ 80", "default": 4},
    {"key": "studio_target_score", "type": "int", "category": "GovUX Studio", "label": "Target GovUX score", "default": 80},
    {"key": "studio_monthly_quota", "type": "int", "category": "GovUX Studio", "label": "Runs per organisation / month (0 = unlimited)", "default": 20},
    {"key": "studio_cost_per_1k_output_inr", "type": "int", "category": "GovUX Studio", "label": "Billing rate — INR (paise) per 1K output tokens", "default": 120},
]
BY_KEY = {s["key"]: s for s in SCHEMA}


def _load_from_db() -> dict:
    from ..database import SessionLocal
    from .. import models
    s = SessionLocal()
    try:
        return {r.key: r.value for r in s.query(models.AppSetting).all() if r.value is not None}
    finally:
        s.close()


def _cached() -> dict:
    try:
        h = queue._r.hgetall(CACHE_KEY)
        if h:
            return h
    except Exception:
        pass
    data = _load_from_db()
    try:
        if data:
            queue._r.hset(CACHE_KEY, mapping=data)
            queue._r.expire(CACHE_KEY, CACHE_TTL)
    except Exception:
        pass
    return data


def raw(key: str):
    return _cached().get(key)


def _default(key, fallback=None):
    if fallback is not None:
        return fallback
    d = BY_KEY.get(key, {})
    return d.get("default")


def get_int(key: str, fallback=None) -> int:
    v = raw(key)
    try:
        return int(v) if v is not None else int(_default(key, fallback))
    except (TypeError, ValueError):
        return int(_default(key, fallback) or 0)


def get_bool(key: str, fallback=None) -> bool:
    v = raw(key)
    if v is None:
        return bool(_default(key, fallback))
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def get_str(key: str, fallback=None) -> str:
    v = raw(key)
    if v is None:
        return str(_default(key, fallback) or "")
    if BY_KEY.get(key, {}).get("secret"):
        return secretbox.decrypt(v)     # decrypt secret values for use
    return v


def set_value(key: str, value, db, user_id=None) -> None:
    from .. import models
    if key not in BY_KEY:
        raise KeyError(key)
    row = db.get(models.AppSetting, key) or models.AppSetting(key=key)
    # encrypt secret values at rest (SMTP password, CAPTCHA secret, …)
    row.value = secretbox.encrypt(str(value)) if BY_KEY[key].get("secret") else str(value)
    row.updated_by = user_id
    row.updated_at = datetime.now(timezone.utc)
    db.merge(row)
    db.commit()
    try:
        queue._r.delete(CACHE_KEY)   # invalidate so the change is live
    except Exception:
        pass


def schema_with_values(db) -> list[dict]:
    """The registry + current values for the admin UI. Secrets are masked."""
    from .. import models
    overrides = {r.key: r.value for r in db.query(models.AppSetting).all()}
    out = []
    for s in SCHEMA:
        val = overrides.get(s["key"], s["default"])
        if s.get("secret"):
            val = "••••••" if val else ""      # never expose a secret
        out.append({"key": s["key"], "type": s["type"], "category": s["category"],
                    "label": s["label"], "secret": bool(s.get("secret")),
                    "value": val, "is_override": s["key"] in overrides})
    return out
