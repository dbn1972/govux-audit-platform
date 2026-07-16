"""Async audit jobs: submit -> task_id (202), status, report, compare, bulk.

Every audit-scoped endpoint is org-fenced: an officer may only see/act on audits
of domains belonging to their own organisation (super_admin sees all). Cross-org
access returns 404 (not 403) so it never confirms that a task_id exists.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, text
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import settings
from .. import models
from ..deps import current_user
from ..schemas import AuditCreate, AuditAccepted, AuditStatus, BulkScanCreate
from ..services import queue, remediation, ml_priority, cache, settings_store
from ..services import scoring
from ..services.scoring import CATEGORY_WEIGHTS

router = APIRouter(prefix="/v1", tags=["audits"])


def _report_key(task_id) -> str:
    return cache.cache_key("report", str(task_id))


def _owned_domain(db: Session, domain_id, user: models.User) -> models.Domain:
    """Load a domain the caller is allowed to act on, else 404."""
    domain = db.get(models.Domain, domain_id)
    if not domain or (user.role != "super_admin" and domain.org_id != user.org_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domain not found")
    return domain


def _owned_audit(db: Session, task_id, user: models.User,
                 require_completed: bool = False) -> models.Audit:
    """Load an audit the caller's org owns (via its domain), else 404.

    Returns 404 rather than 403 on a cross-org hit so the endpoint never reveals
    that someone else's task_id exists (IDOR-safe)."""
    audit = db.get(models.Audit, task_id)
    if not audit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    domain = db.get(models.Domain, audit.domain_id)
    if user.role != "super_admin" and (not domain or domain.org_id != user.org_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    if require_completed and audit.status != "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Report not ready")
    return audit


@router.post("/audits", response_model=AuditAccepted, status_code=202)
def submit_audit(body: AuditCreate, user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)):
    # org-scope: you can only audit your own organisation's verified domains
    domain = _owned_domain(db, body.domain_id, user)
    if domain.verify_status != "verified":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Domain not verified")

    # page quota (admin-configurable): up to free_registered_pages freely; more
    # needs admin approval (admins are exempt)
    from ..services import settings_store
    free_pages = settings_store.get_int("free_registered_pages", settings.free_registered_pages)
    if body.depth > free_pages and user.role not in ("programme_admin", "super_admin"):
        from .scan_requests import approved_pages
        if approved_pages(db, user.id, domain.id) < body.depth:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                f"Scanning more than {free_pages} pages needs admin approval — "
                f"POST /v1/scan-requests for {body.depth} pages.")

    # idempotency: refuse a second concurrent run of the same domain. Serialise the
    # check-then-insert with a per-domain transaction advisory lock so two racing
    # submits can't both pass the "running?" check (TOCTOU) — auto-released on commit.
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('govux-audit'), hashtext(:d))"),
               {"d": str(domain.id)})
    running = (db.query(models.Audit)
                 .filter(models.Audit.domain_id == domain.id,
                         models.Audit.status.in_(["queued", "crawling", "analyzing", "scoring"]))
                 .first())
    if running:
        return AuditAccepted(task_id=str(running.id),
                             status_url=f"/v1/audits/{running.id}")

    audit = models.Audit(
        domain_id=domain.id, engine_version=settings.engine_version,
        requested_by=user.id, status="queued",
        scope={"depth": body.depth, "devices": body.devices, "browsers": body.browsers,
               "webhook_url": body.webhook_url},
    )
    db.add(audit)
    db.commit()

    queue.ensure_group()
    queue.enqueue_audit(str(audit.id), {"domain": domain.url, "scope": audit.scope})
    return AuditAccepted(task_id=str(audit.id), status_url=f"/v1/audits/{audit.id}")


@router.get("/audits")
def list_audits(user: models.User = Depends(current_user), db: Session = Depends(get_db),
                limit: int = 50, offset: int = 0):
    """Every audit across the officer's organisation (super_admin: all), newest
    first. Org-fenced exactly like the per-audit endpoints — an officer never
    sees another organisation's audits. Paginated for large estates."""
    limit = max(1, min(limit, 100))
    q = (db.query(models.Audit, models.Domain)
           .join(models.Domain, models.Audit.domain_id == models.Domain.id))
    if user.role != "super_admin":
        q = q.filter(models.Domain.org_id == user.org_id)
    rows = (q.order_by(desc(models.Audit.created_at))
              .offset(max(0, offset)).limit(limit).all())
    return [{"task_id": str(a.id), "domain": d.url, "status": a.status,
             "score": float(a.overall_score) if a.overall_score else None,
             "band": a.band, "compliance_status": a.compliance_status,
             "date": a.created_at} for a, d in rows]


@router.get("/audits/{task_id}", response_model=AuditStatus)
def audit_status(task_id: str, user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)):
    audit = _owned_audit(db, task_id, user)
    domain = db.get(models.Domain, audit.domain_id)
    return AuditStatus(
        task_id=str(audit.id), domain=domain.url, status=audit.status,
        pages_done=audit.pages_done, pages_total=audit.pages_total,
        overall_score=float(audit.overall_score) if audit.overall_score else None,
        band=audit.band, guardrail_active=audit.guardrail_active,
        compliance_status=audit.compliance_status, method=audit.method,
        confidence=audit.confidence,
    )


@router.get("/audits/{task_id}/report")
def audit_report(task_id: str, user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)):
    audit = _owned_audit(db, task_id, user, require_completed=True)  # auth: never cached
    # the report body is identical for any authorised viewer -> read-through cache,
    # invalidated when an assessor review changes the verdict (see review_audit)
    ttl = settings_store.get_int("cache_ttl_seconds", 120)
    return cache.get_or_set(_report_key(task_id), ttl, lambda: _build_report(db, audit, task_id))


def _build_report(db, audit, task_id):
    scores = db.query(models.AuditScore).filter(models.AuditScore.audit_id == task_id).all()
    findings = (db.query(models.Finding).filter(models.Finding.audit_id == task_id)
                  .order_by(models.Finding.severity).limit(500).all())
    documents = (db.query(models.AuditDocument)
                   .filter(models.AuditDocument.audit_id == task_id).all())
    browsers = (db.query(models.AuditBrowser)
                  .filter(models.AuditBrowser.audit_id == task_id).all())
    return {
        "task_id": str(audit.id),
        "overall_score": float(audit.overall_score),
        "band": audit.band,
        "guardrail_active": audit.guardrail_active,
        # cross-browser matrix (Chromium/Firefox/WebKit)
        "browsers": [{"engine": b.engine, "loaded": b.loaded, "status": b.status,
                      "js_errors": b.js_errors, "console_errors": b.console_errors,
                      "overflow": b.overflow, "broken_images": b.broken_images} for b in browsers],
        # advisory ML — never part of the score
        "anomaly_score": float(audit.anomaly_score) if audit.anomaly_score is not None else None,
        # legal verdict reported alongside — never folded into the band (G1)
        "compliance": {"status": audit.compliance_status, "method": audit.method,
                       "confidence": audit.confidence},
        "field_data": audit.field_data,
        "pages_total": audit.pages_total,
        "coverage": (audit.scope or {}).get("coverage"),
        "categories": [{"category": s.category, "weight": float(s.weight),
                        "score": float(s.score)} for s in scores],
        # transparent point-by-point breakdown of how the overall was reached
        "contributions": scoring.explain({s.category: float(s.score) for s in scores}),
        "findings": [{"id": str(f.id), "category": f.category, "severity": f.severity,
                      "guideline": f.guideline_id, "title": f.title, "state": f.state,
                      "confidence": f.confidence, "remediation": f.remediation}
                     for f in findings],
        "documents": [{"url": d.url, "type": d.doc_type, "tagged": d.tagged,
                       "has_lang": d.has_lang, "has_title": d.has_title,
                       "score": float(d.score) if d.score is not None else None,
                       "issues": d.issue_count} for d in documents],
    }


@router.get("/audits/{task_id}/remediation")
def audit_remediation(task_id: str, user: models.User = Depends(current_user),
                      db: Session = Depends(get_db)):
    """Impact x effort prioritised fix list with advisory guidance (gap G5)."""
    _owned_audit(db, task_id, user)
    findings = (db.query(models.Finding).filter(models.Finding.audit_id == task_id).all())
    items = [{"id": str(f.id), "category": f.category, "severity": f.severity,
              "guideline": f.guideline_id, "title": f.title, "effort": f.effort}
             for f in findings]
    items = remediation.prioritise(items)   # deterministic impact×effort (default order)

    # advisory XGBoost overlay — reorders nothing by default; adds ml_priority per item
    model = ml_priority.load()
    if model is not None:
        enriched = [{**it, "cat_weight": CATEGORY_WEIGHTS.get(it["category"], 10.0),
                     "level": "A" if it["severity"] == "critical" else "AA",
                     "legal": it["category"] == "accessibility" and it["severity"] in ("critical", "high"),
                     "instances": 1} for it in items]
        mp = {r["id"]: r["ml_priority"] for r in ml_priority.rank(model, enriched)}
        for it in items:
            it["ml_priority"] = mp.get(it["id"])

    return {"task_id": task_id, "items": items,
            "ordering": "deterministic impact×effort; ml_priority is an advisory XGBoost overlay"}


@router.get("/audits/{task_id}/documents")
def audit_documents(task_id: str, user: models.User = Depends(current_user),
                    db: Session = Depends(get_db)):
    """Document (PDF/Office) accessibility results for the audit (gap G3)."""
    _owned_audit(db, task_id, user)
    docs = (db.query(models.AuditDocument)
              .filter(models.AuditDocument.audit_id == task_id).all())
    return {"task_id": task_id,
            "documents": [{"url": d.url, "type": d.doc_type, "pages": d.pages,
                           "tagged": d.tagged, "has_lang": d.has_lang,
                           "has_title": d.has_title,
                           "score": float(d.score) if d.score is not None else None,
                           "issues": d.issue_count} for d in docs]}


class ReviewDecision(BaseModel):
    approved: bool = True          # assessor certifies the automated evidence
    notes: str | None = None


@router.post("/audits/{task_id}/review")
def review_audit(task_id: str, body: ReviewDecision,
                 user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Record an expert review of a completed audit and re-derive the legal verdict.

    This is the ingress the compliance model requires (`reviewed=True`) — without it
    every audit is capped at `partially_compliant` forever. Assessor/admin only;
    org-scoped and audit-logged for accountability.
    """
    if user.role not in ("assessor", "programme_admin", "super_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Expert review requires an assessor or admin role")
    audit = _owned_audit(db, task_id, user, require_completed=True)
    scores = {s.category: float(s.score) for s in
              db.query(models.AuditScore).filter(models.AuditScore.audit_id == task_id)}
    critical_a11y = (db.query(models.Finding)
                       .filter(models.Finding.audit_id == task_id,
                               models.Finding.category == "accessibility",
                               models.Finding.severity == "critical").count())
    if body.approved:
        comp = scoring.compliance_verdict(scores, critical_a11y, reviewed=True)
    else:
        # assessor rejected — a human found blocking issues automation missed
        comp = scoring.ComplianceResult(
            "non_compliant", "expert_reviewed", "expert_verified",
            reason=body.notes or "expert review found blocking issues")

    audit.is_reviewed = True
    audit.compliance_status = comp.status
    audit.method = comp.method
    audit.confidence = comp.confidence
    db.add(models.AuditLog(actor_id=user.id, action="audit_review", target=str(task_id),
                           detail={"approved": body.approved, "notes": body.notes,
                                   "verdict": comp.status, "reason": comp.reason}))
    db.commit()
    cache.invalidate(_report_key(task_id))   # verdict changed -> drop cached report
    return {"task_id": task_id, "is_reviewed": True,
            "compliance": {"status": comp.status, "method": comp.method,
                           "confidence": comp.confidence, "reason": comp.reason}}


@router.get("/audits/{task_id}/trend")
def audit_trend(task_id: str, user: models.User = Depends(current_user),
                db: Session = Depends(get_db)):
    """Dated score history for this audit's domain (drives the trend screen)."""
    audit = _owned_audit(db, task_id, user)
    rows = (db.query(models.Audit)
              .filter(models.Audit.domain_id == audit.domain_id,
                      models.Audit.status == "completed",
                      models.Audit.overall_score.isnot(None))
              .order_by(desc(models.Audit.created_at)).limit(24).all())
    return {"domain_id": str(audit.domain_id),
            "history": [{"task_id": str(a.id), "date": a.created_at,
                         "score": float(a.overall_score), "band": a.band} for a in rows]}


@router.get("/domains/{domain_id}/audits")
def audit_history(domain_id: str, user: models.User = Depends(current_user),
                  db: Session = Depends(get_db)):
    _owned_domain(db, domain_id, user)
    rows = (db.query(models.Audit).filter(models.Audit.domain_id == domain_id)
              .order_by(desc(models.Audit.created_at)).limit(50).all())
    return [{"task_id": str(a.id), "date": a.created_at, "score": float(a.overall_score)
             if a.overall_score else None, "band": a.band, "engine": a.engine_version}
            for a in rows]


@router.get("/domains/{domain_id}/compare")
def compare(domain_id: str, frm: str, to: str,
            user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    _owned_domain(db, domain_id, user)
    a, b = db.get(models.Audit, frm), db.get(models.Audit, to)
    # both snapshots must belong to the (owned) domain being compared
    if not a or not b or str(a.domain_id) != str(domain_id) or str(b.domain_id) != str(domain_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Snapshot not found")
    fa = {f.guideline_id for f in db.query(models.Finding).filter(models.Finding.audit_id == frm)}
    fb = {f.guideline_id for f in db.query(models.Finding).filter(models.Finding.audit_id == to)}
    return {
        "overall_delta": float(b.overall_score or 0) - float(a.overall_score or 0),
        "new_issues": sorted(fb - fa),
        "resolved_issues": sorted(fa - fb),
    }


@router.post("/bulk-scans", status_code=202)
def bulk_scan(body: BulkScanCreate, user=Depends(current_user), db: Session = Depends(get_db)):
    """Estate-wide bulk scan: auto-discover the register or accept a list.

    Restricted to programme/super admins — it enqueues across the whole estate.
    """
    if user.role not in ("programme_admin", "super_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bulk scan requires an admin role")
    # backpressure: don't pile an estate-wide batch onto an already-deep queue
    max_depth = settings_store.get_int("bulk_scan_max_queue_depth", 5000)
    depth = queue.audit_depth()
    if depth >= 0 and depth > max_depth:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            f"Audit queue is saturated ({depth} pending) — retry shortly.")
    batch_id = uuid.uuid4()
    if body.mode == "auto_discover":
        q = db.query(models.Domain).filter(models.Domain.verify_status == "verified")
        if body.scope == "never_audited":
            # SQL anti-join (NOT EXISTS) — never loads the whole audits table into Python
            audited = db.query(models.Audit.domain_id).filter(
                models.Audit.domain_id == models.Domain.id)
            q = q.filter(~audited.exists())
        targets = q.all()
    else:
        targets = db.query(models.Domain).filter(models.Domain.url.in_(body.domains)).all()

    queue.ensure_group()
    count = 0
    for d in targets:
        audit = models.Audit(domain_id=d.id, engine_version=settings.engine_version,
                             batch_id=batch_id, requested_by=user.id, status="queued",
                             scope={"depth": body.depth})
        db.add(audit)
        db.flush()
        queue.enqueue_audit(str(audit.id), {"domain": d.url, "scope": audit.scope})
        count += 1
    db.commit()
    return {"batch_id": str(batch_id), "enqueued": count}
