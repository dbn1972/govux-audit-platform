"""Standalone manual assessments — a review with no engine run behind it.

Reviews used to require a completed audit, which requires a crawlable domain.
An organisation with three registered domains could therefore review exactly the
one it had audited, and a mobile app — which the engine cannot crawl at all —
had no route in.

What this deliberately does NOT do is produce a GovUX score. The score is
deterministic and engine-derived; a questionnaire cannot stand in for evidence
the engine gathered. An assessment yields a compliance verdict and a completion
rating, and says so.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..deps import current_user
from ..services import review as review_svc, audit_log, url_validate

router = APIRouter(prefix="/v1/manual-assessments", tags=["manual assessments"])

PLATFORMS = ("website", "app")


class AssessmentCreate(BaseModel):
    domain_id: str | None = None
    # free text for a native app, which has no domain to point at
    subject: str | None = Field(None, max_length=200)
    platform: str = "website"


class ItemUpdate(BaseModel):
    decision: str
    note: str | None = Field(None, max_length=2000)


class SignOff(BaseModel):
    compliant: bool
    notes: str | None = Field(None, max_length=4000)


def _owned(db: Session, assessment_id: str, user) -> models.ManualAssessment:
    a = db.get(models.ManualAssessment, assessment_id)
    # 404 rather than 403 across orgs, so the endpoint never confirms that
    # someone else's assessment exists
    if not a or (user.role != "super_admin" and a.org_id != user.org_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assessment not found")
    return a


@router.post("", status_code=201)
def create_assessment(body: AssessmentCreate, user=Depends(current_user),
                      db: Session = Depends(get_db)):
    if user.role not in review_svc.REVIEWER_ROLES + ("owner",):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Starting an assessment requires an owner or assessor role")
    if body.platform not in PLATFORMS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"platform must be one of {', '.join(PLATFORMS)}")
    if not user.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No organisation on this account")

    domain = None
    if body.domain_id:
        domain = db.get(models.Domain, body.domain_id)
        if not domain or (user.role != "super_admin" and domain.org_id != user.org_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Domain not found")

    subject = (body.subject or "").strip() or (domain.url if domain else "")
    if not subject:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Give a domain to assess, or a name for the app")

    # A website subject typed by hand still has to be a government host — the
    # same rule the register enforces. An app name is free text: an app has no
    # domain to check, which is the whole reason it needs this route.
    if body.platform == "website" and not domain:
        v = url_validate.validate(subject)
        if not v["ok"]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, v["error"])
        host = v["host"]
        subject = host
        # adopt an existing registration if this host is already on the register
        domain = (db.query(models.Domain)
                    .filter(models.Domain.url == host,
                            models.Domain.org_id == user.org_id).first())

    # Deliberately NOT requiring domain verification: verification gates auditing
    # because the engine fetches the site. A human answering questions about a
    # service they administer fetches nothing, and blocking that would only stop
    # the assessments this exists to enable.

    # Starting the same subject twice resumes it rather than opening a second
    # empty one. Without this the list fills with duplicates of the same site —
    # every visit to this panel is one click away from creating another — and a
    # reviewer cannot tell which of them holds their answers. A signed-off
    # assessment is deliberately NOT reused: reassessing is a new record.
    existing = (db.query(models.ManualAssessment)
                  .filter(models.ManualAssessment.org_id == user.org_id,
                          models.ManualAssessment.subject == subject,
                          models.ManualAssessment.platform == body.platform,
                          models.ManualAssessment.status != "signed_off")
                  .order_by(desc(models.ManualAssessment.created_at)).first())
    if existing:
        return {"id": str(existing.id), "subject": existing.subject,
                "platform": existing.platform, "status": existing.status,
                "created_at": existing.created_at, "resumed": True}

    a = models.ManualAssessment(org_id=user.org_id, domain_id=domain.id if domain else None,
                                subject=subject, platform=body.platform,
                                created_by=user.id)
    db.add(a); db.commit()
    return {"id": str(a.id), "subject": a.subject, "platform": a.platform,
            "status": a.status, "created_at": a.created_at, "resumed": False}


@router.get("")
def list_assessments(user=Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(models.ManualAssessment)
    if user.role != "super_admin":
        q = q.filter(models.ManualAssessment.org_id == user.org_id)
    rows = q.order_by(desc(models.ManualAssessment.created_at)).limit(50).all()
    out = []
    for a in rows:
        answered = (db.query(models.ReviewItem)
                      .filter(models.ReviewItem.assessment_id == a.id).count())
        out.append({"id": str(a.id), "subject": a.subject, "platform": a.platform,
                    "status": a.status, "verdict": a.verdict, "answered": answered,
                    "created_at": a.created_at, "signed_off_at": a.signed_off_at})
    return out


@router.get("/{assessment_id}/checklist")
def checklist(assessment_id: str, enforcement: str | None = None,
              category: str | None = None, standard: str | None = None,
              user=Depends(current_user), db: Session = Depends(get_db)):
    a = _owned(db, assessment_id, user)
    decided = db.query(models.ReviewItem).filter(models.ReviewItem.assessment_id == a.id)
    return {
        "assessment_id": str(a.id), "subject": a.subject, "status": a.status,
        "verdict": a.verdict, "notes": a.notes, "signed_off_at": a.signed_off_at,
        "created_at": a.created_at,
        # The assessment's own platform governs, and there is deliberately no
        # override: the subject does not change halfway through a review. It
        # used to accept `platform` from the query, and the review screen always
        # sent "website" — so every app assessment was answered against the
        # website corpus, silently, including the guidelines an app cannot have.
        **review_svc.build(db, decided, a.platform, enforcement, category, standard),
    }


@router.put("/{assessment_id}/checklist/{guideline_id}")
def set_item(assessment_id: str, guideline_id: str, body: ItemUpdate,
             user=Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in review_svc.REVIEWER_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Recording a review decision requires an assessor or admin role")
    if body.decision not in review_svc.DECISIONS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"decision must be one of {', '.join(review_svc.DECISIONS)}")
    a = _owned(db, assessment_id, user)
    if a.status == "signed_off":
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This assessment is signed off; start a new one to reassess")
    if not db.get(models.Guideline, guideline_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Guideline not found")

    item = (db.query(models.ReviewItem)
              .filter(models.ReviewItem.assessment_id == a.id,
                      models.ReviewItem.guideline_id == guideline_id).first())
    if item is None:
        item = models.ReviewItem(assessment_id=a.id, guideline_id=guideline_id)
        db.add(item)
    item.decision, item.note = body.decision, body.note
    item.decided_by, item.decided_at = user.id, datetime.now(timezone.utc)
    db.commit()
    return {"guideline_id": guideline_id, "decision": item.decision, "note": item.note}


@router.post("/{assessment_id}/sign-off")
def sign_off(assessment_id: str, body: SignOff, user=Depends(current_user),
             db: Session = Depends(get_db)):
    if user.role not in review_svc.REVIEWER_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Signing off an assessment requires an assessor or admin role")
    a = _owned(db, assessment_id, user)
    # Recording a decision is already blocked once signed off; the verdict was
    # not, so the same assessment could be certified compliant and then flipped
    # to non-compliant (or back) indefinitely, each flip overwriting the last.
    if a.status == "signed_off":
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This assessment is already signed off; start a new one to reassess")
    items = db.query(models.ReviewItem).filter(models.ReviewItem.assessment_id == a.id).all()
    failed = sum(1 for i in items if i.decision == "fail")
    answered = len(items)

    if body.compliant and failed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"{failed} item(s) are marked not met — resolve them or reject instead")
    if body.compliant and not answered:
        # an empty checklist is not a pass; it is an unstarted review
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Nothing has been assessed yet")

    a.verdict = "compliant" if body.compliant else "non_compliant"
    a.status = "signed_off"
    a.signed_off_at = datetime.now(timezone.utc)
    a.notes = body.notes
    db.commit()
    audit_log.record(db, user.id, "manual_assessment.sign_off", target=str(a.id),
                     detail={"verdict": a.verdict, "answered": answered, "failed": failed})
    db.commit()
    return {"id": str(a.id), "verdict": a.verdict, "status": a.status,
            "answered": answered, "failed": failed}
