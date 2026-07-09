"""Guideline library + manual-review finding updates."""
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
    state: str | None = None          # open | in_progress | resolved | not_applicable
    is_reviewed: bool | None = None    # assessor confirmed


@router.patch("/findings/{finding_id}")
def update_finding(finding_id: str, body: FindingUpdate,
                   user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    f = db.get(models.Finding, finding_id)
    if not f:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Finding not found")
    if body.state is not None:
        f.state = body.state
    if body.is_reviewed is not None:
        f.is_reviewed = body.is_reviewed
    db.commit()
    return {"id": str(f.id), "state": f.state, "is_reviewed": f.is_reviewed}
