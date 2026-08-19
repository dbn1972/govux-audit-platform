"""In-app notifications for the signed-in user.

The bell in the top bar reads this. Scoped to the caller in every query — a
notification is addressed to one user, and there is no route here that can
return another's.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..deps import current_user

router = APIRouter(prefix="/v1/notifications", tags=["notifications"])

LIMIT = 20


@router.get("")
def list_notifications(db: Session = Depends(get_db), user=Depends(current_user)):
    rows = (db.query(models.Notification)
              .filter(models.Notification.user_id == user.id)
              .order_by(desc(models.Notification.created_at))
              .limit(LIMIT).all())
    unread = (db.query(models.Notification)
                .filter(models.Notification.user_id == user.id,
                        models.Notification.read_at.is_(None)).count())
    return {
        "unread": unread,
        "items": [{"id": str(n.id), "kind": n.kind, "title": n.title, "body": n.body,
                   "link": n.link, "read": n.read_at is not None,
                   "created_at": n.created_at.isoformat() if n.created_at else None}
                  for n in rows],
    }


@router.post("/read")
def mark_read(body: dict | None = None, db: Session = Depends(get_db),
              user=Depends(current_user)):
    """Mark one notification read, or all of them when no id is given."""
    q = db.query(models.Notification).filter(
        models.Notification.user_id == user.id,
        models.Notification.read_at.is_(None))
    nid = (body or {}).get("id")
    if nid:
        q = q.filter(models.Notification.id == nid)
    now = datetime.now(timezone.utc)
    n = 0
    for row in q.all():
        row.read_at = now
        n += 1
    db.commit()
    return {"marked": n}
