"""External assessments — the manual-assurance ledger (gaps G9/G11/G13).

Automation cannot perform a CERT-In VAPT, audit a native mobile app, run a
lived-experience panel with disabled users, or grant STQC certification. This
ledger records those externally performed assessments so they appear alongside
the automated evidence (report, evidence pack) without ever touching the
deterministic score path (rule #1) or upgrading the automated-only verdict
(rule #2 — only `POST /audits/{id}/review` can set `reviewed=True`).

Org-fenced: officers see their own organisation's records; super_admin sees all.
"""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..deps import current_user
from ..services import audit_log

router = APIRouter(prefix="/v1/assessments", tags=["assessments"])

KINDS = ("vapt", "native_app_a11y", "lived_experience_panel", "stqc_certification", "other")
WRITER_ROLES = ("assessor", "programme_admin", "super_admin")


class AssessmentCreate(BaseModel):
    kind: Literal["vapt", "native_app_a11y", "lived_experience_panel",
                  "stqc_certification", "other"]
    title: str = Field(min_length=3, max_length=300)
    domain_id: str | None = None
    agency: str | None = None
    assessed_on: date | None = None
    outcome: Literal["passed", "failed", "partial", "in_progress"] = "in_progress"
    summary: str | None = None
    report_ref: str | None = None


def _row(a: models.ExternalAssessment, domain_url: str | None = None) -> dict:
    return {"id": str(a.id), "kind": a.kind, "title": a.title, "agency": a.agency,
            "domain_id": str(a.domain_id) if a.domain_id else None,
            "domain": domain_url,
            "assessed_on": a.assessed_on.isoformat() if a.assessed_on else None,
            "outcome": a.outcome, "summary": a.summary, "report_ref": a.report_ref,
            "created_at": a.created_at.isoformat() if a.created_at else None}


@router.post("", status_code=201)
def create_assessment(body: AssessmentCreate,
                      user: models.User = Depends(current_user),
                      db: Session = Depends(get_db)):
    if user.role not in WRITER_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Recording an assessment requires an assessor or admin role")
    domain = None
    if body.domain_id:
        domain = db.get(models.Domain, body.domain_id)
        # 404 (not 403) on a cross-org hit so the id's existence is never revealed
        if not domain or (user.role != "super_admin" and domain.org_id != user.org_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Domain not found")
    a = models.ExternalAssessment(
        org_id=domain.org_id if domain else user.org_id,
        domain_id=domain.id if domain else None,
        kind=body.kind, title=body.title, agency=body.agency,
        assessed_on=body.assessed_on, outcome=body.outcome,
        summary=body.summary, report_ref=body.report_ref, created_by=user.id)
    db.add(a)
    db.flush()
    audit_log.record(db, user.id, "assessment_record", target=str(a.id),
                     detail={"kind": body.kind, "outcome": body.outcome,
                             "domain_id": body.domain_id})
    db.commit()
    return _row(a, domain.url if domain else None)


@router.get("")
def list_assessments(kind: str | None = None, domain_id: str | None = None,
                     user: models.User = Depends(current_user),
                     db: Session = Depends(get_db)):
    q = db.query(models.ExternalAssessment, models.Domain.url).outerjoin(
        models.Domain, models.ExternalAssessment.domain_id == models.Domain.id)
    if user.role != "super_admin":
        q = q.filter(models.ExternalAssessment.org_id == user.org_id)
    if kind:
        if kind not in KINDS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown kind")
        q = q.filter(models.ExternalAssessment.kind == kind)
    if domain_id:
        q = q.filter(models.ExternalAssessment.domain_id == domain_id)
    rows = q.order_by(desc(models.ExternalAssessment.created_at)).limit(500).all()
    return {"assessments": [_row(a, url) for a, url in rows]}
