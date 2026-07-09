"""CI/CD quality gate (gap G5).

Lets a build pipeline block a release on the latest audit result:
    GET /v1/ci/gate?domain_id=...&min_score=80&require_compliant=true
Returns pass/fail plus the numbers, so a CI job can `exit 1` on failure. Audits
are async, so the gate reads the most recent completed snapshot rather than
running inline.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..deps import current_user

router = APIRouter(prefix="/v1/ci", tags=["ci"])


@router.get("/gate")
def gate(domain_id: str, min_score: float = 70.0, require_compliant: bool = False,
         fail_on_guardrail: bool = True,
         user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    domain = db.get(models.Domain, domain_id)
    if not domain:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domain not found")
    audit = (db.query(models.Audit)
               .filter(models.Audit.domain_id == domain_id,
                       models.Audit.status == "completed")
               .order_by(desc(models.Audit.created_at)).first())
    if not audit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No completed audit for this domain")

    score = float(audit.overall_score or 0)
    reasons = []
    if score < min_score:
        reasons.append(f"score {score:.1f} < required {min_score:.1f}")
    if fail_on_guardrail and audit.guardrail_active:
        reasons.append("guard-rail active (critical accessibility/trust failure)")
    if require_compliant and audit.compliance_status != "compliant":
        reasons.append(f"compliance is '{audit.compliance_status}', not 'compliant'")

    return {
        "passed": not reasons,
        "task_id": str(audit.id),
        "overall_score": score,
        "band": audit.band,
        "compliance_status": audit.compliance_status,
        "guardrail_active": audit.guardrail_active,
        "reasons": reasons,
    }
