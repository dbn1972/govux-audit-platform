"""Guideline library + manual-review finding updates."""
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from .. import models
from ..deps import current_user

router = APIRouter(prefix="/v1", tags=["library"])


@router.get("/guidelines")
def guidelines(family: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Guideline)
    if family:
        q = q.filter(models.Guideline.family == family)
    return [{"id": g.id, "family": g.family, "category": g.category, "title": g.title,
             "plain_language": g.plain_language, "good_example": g.good_example}
            for g in q.all()]


class FindingUpdate(BaseModel):
    # Constrained, not a free string: `state` is a PG enum, so an arbitrary value
    # used to reach the database and come back as a 500 instead of a 422.
    state: Literal["open", "in_progress", "resolved", "not_applicable"] | None = None
    is_reviewed: bool | None = None    # assessor confirmed


# Same rule as POST /v1/audits/{id}/review: marking a finding as expert-reviewed
# is an assurance act, and confidence downstream rests on it having been a
# qualified human. Triaging `state` is ordinary remediation work, so any member
# of the owning organisation may do that.
REVIEWER_ROLES = ("assessor", "programme_admin", "super_admin")


@router.patch("/findings/{finding_id}")
def update_finding(finding_id: str, body: FindingUpdate,
                   user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Triage a finding (state) or record assessor sign-off (is_reviewed).

    This endpoint read no ownership at all: it loaded the finding by id and wrote
    to it, so any signed-in user from ANY organisation could mark another
    ministry's findings resolved and expert-reviewed. Reading that same audit was
    correctly fenced and returned 404 — only the write was open, which is the
    easiest kind of hole to miss.
    """
    f = db.get(models.Finding, finding_id)
    if not f:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Finding not found")

    # Fence to the caller's org via finding -> audit -> domain. 404 rather than
    # 403 on a cross-org hit, so this never confirms someone else's finding id
    # exists — matching _owned_audit in routers/audits.py.
    audit = db.get(models.Audit, f.audit_id)
    domain = db.get(models.Domain, audit.domain_id) if audit else None
    if user.role != "super_admin" and (not domain or domain.org_id != user.org_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Finding not found")

    if body.is_reviewed is not None and user.role not in REVIEWER_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Marking a finding as reviewed requires an assessor or admin role")

    if body.state is not None:
        f.state = body.state
    if body.is_reviewed is not None:
        f.is_reviewed = body.is_reviewed
    db.commit()
    return {"id": str(f.id), "state": f.state, "is_reviewed": f.is_reviewed}
