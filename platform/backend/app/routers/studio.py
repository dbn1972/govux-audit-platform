"""GovUX Studio — AI prototype generator endpoints (org-fenced, billable).

POST creates a run and generates in the background (llm generates, deterministic
studio_audit scores, refine loop closes to the target). Preview/download serve
sanitised, self-contained HTML.
"""
import io
import re
import secrets
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy import func, desc
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from ..database import get_db, SessionLocal
from .. import models
from ..deps import current_user, require_role
from ..services import settings_store, studio

router = APIRouter(prefix="/v1/studio", tags=["studio"])


class StudioCreate(BaseModel):
    department: str = Field(min_length=2, max_length=120)
    purpose: str = Field(min_length=2, max_length=400)
    pages: list[str] = Field(min_length=1, max_length=12)
    language: str = "English"
    tone: str = "formal, citizen-first"
    mode: str = "light"                       # light | dark
    accent: str = "ux4g-purple #4a2bc2"       # approved token; generator clamps to AA


def _slug(title: str, first: bool) -> str:
    if first or title.strip().lower() in ("home", "homepage", "index"):
        return "index.html"
    s = re.sub(r"[^a-z0-9]+", "-", title.strip().lower()).strip("-") or "page"
    return f"{s}.html"


def _month_start() -> datetime:
    n = datetime.now(timezone.utc)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"


# ---------- per-tenant entitlement (super_admin approves an organisation) ----------
class TenantToggle(BaseModel):
    enabled: bool


@router.get("/tenants")
def list_tenants(admin=Depends(require_role("super_admin")), db: Session = Depends(get_db)):
    """Every organisation + whether Studio is approved for it, with run counts."""
    counts = dict(db.query(models.StudioRun.org_id, func.count(models.StudioRun.id))
                    .group_by(models.StudioRun.org_id).all())
    rows = db.query(models.Organisation).order_by(models.Organisation.name).all()
    return [{"id": str(o.id), "name": o.name, "org_type": o.org_type,
             "studio_enabled": bool(o.studio_enabled), "runs": int(counts.get(o.id, 0))} for o in rows]


@router.patch("/tenants/{org_id}")
def set_tenant(org_id: str, body: TenantToggle,
               admin=Depends(require_role("super_admin")), db: Session = Depends(get_db)):
    org = db.get(models.Organisation, org_id)
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    org.studio_enabled = body.enabled
    db.add(models.AuditLog(actor_id=admin.id, action="studio_tenant_" + ("enable" if body.enabled else "disable"),
                           target=str(org.id)))
    db.commit()
    return {"id": str(org.id), "studio_enabled": org.studio_enabled}


@router.post("", status_code=202)
def create_run(body: StudioCreate, bg: BackgroundTasks,
               user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    if not settings_store.get_bool("studio_enabled", False):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "GovUX Studio is not enabled on this instance.")
    org = db.get(models.Organisation, user.org_id)
    if not (org and org.studio_enabled) and user.role != "super_admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "GovUX Studio is not approved for your organisation. Ask a platform administrator.")
    if not settings_store.get_str("llm_api_key", ""):
        raise HTTPException(status.HTTP_409_CONFLICT, "No AI provider key configured (Admin → Advisory AI).")
    max_pages = settings_store.get_int("studio_max_pages", 8)
    if len(body.pages) > max_pages:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Up to {max_pages} pages per run.")

    # billable quota — runs per organisation this month
    quota = settings_store.get_int("studio_monthly_quota", 20)
    if quota > 0:
        used = (db.query(func.count(models.StudioRun.id))
                  .filter(models.StudioRun.org_id == user.org_id,
                          models.StudioRun.created_at >= _month_start()).scalar() or 0)
        if used >= quota:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                f"Monthly Studio quota reached ({quota} runs). Contact your steward.")

    page_map = [(_slug(t, i == 0), t) for i, t in enumerate(body.pages)]
    inputs = {
        "department": body.department, "purpose": body.purpose,
        "page_count": len(page_map),
        "pages": "; ".join(f"{fn} → {t}" for fn, t in page_map),
        "language": body.language, "tone": body.tone, "mode": body.mode,
        "accent": body.accent, "date": datetime.now(timezone.utc).strftime("%d %b %Y"),
    }
    run = models.StudioRun(org_id=user.org_id, requested_by=user.id, status="generating", inputs=inputs)
    db.add(run); db.commit()
    bg.add_task(studio.run, run.id, SessionLocal)
    return {"id": str(run.id), "status": "generating"}


def _owned(db, run_id, user):
    run = db.get(models.StudioRun, run_id)
    if not run or (user.role != "super_admin" and run.org_id != user.org_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return run


@router.get("")
def list_runs(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(models.StudioRun)
    if user.role != "super_admin":
        q = q.filter(models.StudioRun.org_id == user.org_id)
    rows = q.order_by(desc(models.StudioRun.created_at)).limit(50).all()
    return [{"id": str(r.id), "status": r.status, "department": (r.inputs or {}).get("department"),
             "pages": (r.inputs or {}).get("page_count"), "score": float(r.overall_score) if r.overall_score else None,
             "band": r.band, "cost_inr": float(r.cost_inr), "created_at": r.created_at} for r in rows]


@router.get("/{run_id}")
def get_run(run_id: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    r = _owned(db, run_id, user)
    return {
        "id": str(r.id), "status": r.status, "inputs": r.inputs, "error": r.error,
        "score": float(r.overall_score) if r.overall_score else None, "band": r.band,
        "iterations": r.iterations, "findings": r.findings or [],
        "files": list((r.pages or {}).keys()),
        "published": bool(r.published), "public_slug": r.public_slug if r.published else None,
        "title": r.title or (r.inputs or {}).get("department"),
        "billing": {"input_tokens": r.input_tokens, "output_tokens": r.output_tokens, "cost_inr": float(r.cost_inr)},
    }


class PublishBody(BaseModel):
    publish: bool
    title: str | None = None


@router.post("/{run_id}/publish")
def publish(run_id: str, body: PublishBody,
            user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """Publish a scored run to the public showcase (or unpublish). Returns the slug."""
    r = _owned(db, run_id, user)
    if body.publish:
        if r.status != "scored" or not r.pages:
            raise HTTPException(status.HTTP_409_CONFLICT, "Only a finished prototype can be published.")
        if not r.public_slug:
            r.public_slug = secrets.token_urlsafe(9)
        r.published = True
        r.published_at = datetime.now(timezone.utc)
        if body.title:
            r.title = body.title[:120]
    else:
        r.published = False
    db.commit()
    return {"id": str(r.id), "published": r.published,
            "public_slug": r.public_slug if r.published else None}


@router.get("/{run_id}/preview/{filename}", response_class=HTMLResponse)
def preview(run_id: str, filename: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    r = _owned(db, run_id, user)
    html = (r.pages or {}).get(filename)
    if html is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")
    return HTMLResponse(studio.sanitize(html),
                        headers={"Content-Security-Policy": _CSP, "X-Frame-Options": "SAMEORIGIN"})


@router.get("/{run_id}/download")
def download(run_id: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    r = _owned(db, run_id, user)
    if not r.pages:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nothing to download yet.")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for fn, html in r.pages.items():
            z.writestr(fn, studio.sanitize(html))
        readme = (f"GovUX Studio — AI-generated prototype (DRAFT — human review required)\n"
                  f"Organisation: {(r.inputs or {}).get('department')}\n"
                  f"GovUX (static) score: {r.overall_score} (band {r.band}); iterations: {r.iterations}\n"
                  f"UX4G Design System 3.0. Serve over HTTPS and set security headers on deploy.\n")
        z.writestr("README.txt", readme)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="govux-studio-{run_id}.zip"'})
