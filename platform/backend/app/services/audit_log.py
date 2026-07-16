"""Central audit-trail helper.

The findings store is, in aggregate, offensive-security intelligence about the
national estate (a map of every weakness on every government site). Movements of
sensitive data — PII exports, erasures, larger-crawl approvals, config changes —
must therefore be traceable. This is the single write path for that trail; the
caller owns the transaction (commit)."""
from __future__ import annotations
from .. import models


def record(db, actor_id=None, action: str = "", target: str | None = None,
           ip: str | None = None, device_id=None, detail: dict | None = None) -> None:
    db.add(models.AuditLog(actor_id=actor_id, action=action, target=target,
                           ip=ip, device_id=device_id, detail=detail or {}))
