"""Page-quota escalation: registered users may scan up to `free_registered_pages`
(10). Scanning more requires an admin-approved request."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..config import settings
from .. import models
from ..deps import current_user, require_role

router = APIRouter(prefix="/v1/scan-requests", tags=["quota"])


class RequestCreate(BaseModel):
    domain_id: str
    requested_pages: int
    reason: str | None = None


class Decision(BaseModel):
    status: str   # approved | rejected


def approved_pages(db: Session, user_id, domain_id) -> int:
    """The largest approved page count for this user+domain (0 if none)."""
    rows = (db.query(models.ScanRequest.requested_pages)
              .filter(models.ScanRequest.user_id == user_id,
                      models.ScanRequest.domain_id == domain_id,
                      models.ScanRequest.status == "approved").all())
    return max([r[0] for r in rows], default=0)


@router.post("", status_code=201)
def create_request(body: RequestCreate, user: models.User = Depends(current_user),
                   db: Session = Depends(get_db)):
    if body.requested_pages <= settings.free_registered_pages:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Up to {settings.free_registered_pages} pages need no approval.")
    if not db.get(models.Domain, body.domain_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domain not found")
    r = models.ScanRequest(user_id=user.id, domain_id=body.domain_id,
                           requested_pages=body.requested_pages, reason=body.reason, status="pending")
    db.add(r); db.commit()
    return {"id": str(r.id), "status": "pending", "requested_pages": r.requested_pages}


@router.get("")
def list_requests(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(models.ScanRequest)
    if user.role not in ("programme_admin", "super_admin"):
        q = q.filter(models.ScanRequest.user_id == user.id)     # own only
    rows = q.order_by(desc(models.ScanRequest.created_at)).limit(100).all()
    # resolve requester + domain to names so the approvals UI shows who/what, not UUIDs
    uids = {r.user_id for r in rows}
    dids = {r.domain_id for r in rows if r.domain_id}
    users = {u.id: u.email for u in db.query(models.User).filter(models.User.id.in_(uids)).all()} if uids else {}
    doms = {d.id: d.url for d in db.query(models.Domain).filter(models.Domain.id.in_(dids)).all()} if dids else {}
    return [{"id": str(r.id), "user_id": str(r.user_id), "user_email": users.get(r.user_id),
             "domain_id": str(r.domain_id) if r.domain_id else None,
             "domain_url": doms.get(r.domain_id) if r.domain_id else None,
             "requested_pages": r.requested_pages, "reason": r.reason, "status": r.status,
             "created_at": r.created_at} for r in rows]


@router.patch("/{req_id}")
def decide_request(req_id: str, body: Decision,
                   admin=Depends(require_role("programme_admin", "super_admin")),
                   db: Session = Depends(get_db)):
    r = db.get(models.ScanRequest, req_id)
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if body.status not in ("approved", "rejected"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "status must be approved|rejected")
    r.status = body.status
    r.decided_by = admin.id
    r.decided_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": str(r.id), "status": r.status}
