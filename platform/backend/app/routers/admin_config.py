"""Admin configuration — runtime-editable settings (email, CAPTCHA, rate limits,
scan parameters). programme_admin / super_admin only; every change is audit-logged;
secrets are never returned."""
import ipaddress
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from .. import models
from ..deps import require_role
from ..services import settings_store
from ..services import email as email_svc

router = APIRouter(prefix="/v1/admin/config", tags=["admin-config"])


class ConfigUpdate(BaseModel):
    updates: dict   # {key: value}


class TestEmail(BaseModel):
    to: str


def _coerce(meta: dict, value):
    t = meta["type"]
    if t == "int":
        return int(value)
    if t == "bool":
        return str(value).strip().lower() in ("1", "true", "yes", "on")
    return str(value)


@router.get("")
def get_config(db: Session = Depends(get_db),
               user=Depends(require_role("programme_admin", "super_admin"))):
    """Registry + current values, grouped by category (secrets masked)."""
    items = settings_store.schema_with_values(db)
    cats: dict[str, list] = {}
    for it in items:
        cats.setdefault(it["category"], []).append(it)
    return {"categories": [{"name": k, "settings": v} for k, v in cats.items()]}


@router.post("/test-email")
def test_email(body: TestEmail,
               user=Depends(require_role("programme_admin", "super_admin"))):
    """Send a test email via the configured provider (validate before relying on it)."""
    return email_svc.send_test(body.to)


@router.get("/metrics-summary")
def metrics_summary(user=Depends(require_role("programme_admin", "super_admin"))):
    """Live cache/queue/DB health for the admin monitoring panel (JSON form of /metrics)."""
    from ..services import metrics
    return metrics.snapshot()


@router.patch("")
def update_config(body: ConfigUpdate, request: Request, db: Session = Depends(get_db),
                  user=Depends(require_role("programme_admin", "super_admin"))):
    applied, rejected = {}, {}
    for key, value in (body.updates or {}).items():
        meta = settings_store.BY_KEY.get(key)
        if not meta:
            rejected[key] = "unknown setting"
            continue
        # ignore masked secret placeholders (don't overwrite with the ••• dots)
        if meta.get("secret") and str(value).strip() in ("", "••••••"):
            continue
        try:
            settings_store.set_value(key, _coerce(meta, value), db, user_id=user.id)
            applied[key] = "***" if meta.get("secret") else value
        except (ValueError, TypeError):
            rejected[key] = f"invalid {meta['type']}"

    if applied:
        ip = request.client.host if request.client else None
        try:
            ipaddress.ip_address(ip)
        except (ValueError, TypeError):
            ip = None
        db.add(models.AuditLog(actor_id=user.id, action="config_change",
                               target="app_settings", ip=ip,
                               detail={"changed": list(applied.keys())}))
        db.commit()
    return {"applied": applied, "rejected": rejected}
