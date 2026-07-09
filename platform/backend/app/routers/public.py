"""Free public URL scanner — anonymous single-page scan, PDF download, scan
counts, and a visible single-concurrency wait queue."""
import base64
import re
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..config import settings
from .. import models
from ..deps import optional_user
from ..services import queue, storage, ratelimit, captcha, settings_store, url_validate

router = APIRouter(prefix="/v1/public", tags=["public"])
GOV = re.compile(r"(\.gov\.in|\.nic\.in)$", re.I)


class ScanCreate(BaseModel):
    url: str
    captcha: str | None = None   # required once the per-IP free quota is used up


def _host(url: str) -> str | None:
    u = url.strip()
    if not re.match(r"^https?://", u):
        u = "https://" + u
    h = (urlparse(u).hostname or "").lower()
    return h or None


def _position(db: Session, scan: models.PublicScan) -> int:
    """How many scans are ahead of this one in the queue (0 = running/next)."""
    return (db.query(models.PublicScan)
              .filter(models.PublicScan.status.in_(["queued", "running"]),
                      models.PublicScan.created_at < scan.created_at).count())


@router.post("/scan", status_code=202)
def create_scan(body: ScanCreate, request: Request, db: Session = Depends(get_db),
                user: models.User | None = Depends(optional_user)):
    # validate the URL BEFORE queuing: well-formed, http(s), gov domain, resolves,
    # and not pointing at an internal network (SSRF guard)
    v = url_validate.validate(body.url)
    if not v["ok"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, v["error"])
    host = v["host"]
    ip = request.client.host if request.client else "unknown"

    # per-IP free quota (admin-configurable). Over the limit: require a CAPTCHA if
    # enabled, else a hard block.
    limit = settings_store.get_int("scan_ip_limit", settings.scan_ip_limit)
    window = settings_store.get_int("scan_ip_window", settings.scan_ip_window)
    if ratelimit.count(f"scan:{ip}") >= limit:
        if settings_store.get_bool("captcha_enabled", True):
            if not captcha.verify(body.captcha):
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail={
                    "message": f"You've used your {limit} free scans. Solve the CAPTCHA to continue.",
                    "captcha_required": True})
        else:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail={
                "message": f"You've used your {limit} free scans. Please try again later."})
    ratelimit.hit(f"scan:{ip}", window)

    url = v["url"]
    scan = models.PublicScan(url=url, host=host, status="queued",
                             requested_by=(user.id if user else None),
                             ip=ip if ip and re.match(r"^[0-9.:a-fA-F]+$", ip) else None)
    db.add(scan); db.commit()

    queue.ensure_public_group()
    queue.enqueue_public(str(scan.id), {"url": url})
    ahead = _position(db, scan)
    return {"scan_id": str(scan.id), "status": "queued", "queue_position": ahead,
            "message": ("You are next." if ahead == 0 else f"{ahead} scan(s) ahead of you."),
            "status_url": f"/v1/public/scan/{scan.id}"}


@router.get("/captcha")
def get_captcha():
    """Issue a CAPTCHA challenge (needed once the free per-IP quota is used up)."""
    return captcha.issue()


@router.get("/scan/{scan_id}")
def scan_status(scan_id: str, db: Session = Depends(get_db)):
    scan = db.get(models.PublicScan, scan_id)
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")
    times = db.query(models.PublicScan).filter(models.PublicScan.url == scan.url).count()
    pdf_ready = scan.status == "completed"
    return {"scan_id": str(scan.id), "url": scan.url, "status": scan.status,
            "queue_position": _position(db, scan) if scan.status in ("queued", "running") else None,
            "overall_score": float(scan.overall_score) if scan.overall_score is not None else None,
            "band": scan.band, "url_scan_count": times, "pdf_ready": pdf_ready,
            "error": scan.error}


@router.get("/scan/{scan_id}/pdf")
def scan_pdf(scan_id: str, db: Session = Depends(get_db)):
    scan = db.get(models.PublicScan, scan_id)
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")
    if scan.status != "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Report not ready")
    pdf = None
    try:
        cached = queue._r.get(f"govux:pdf:{scan_id}")
        if cached:
            pdf = base64.b64decode(cached)
    except Exception:
        pdf = None
    if pdf is None and scan.pdf_key:           # registered: durable copy in S3
        pdf = storage.get_pdf(scan.pdf_key)
    if pdf is None:
        raise HTTPException(status.HTTP_410_GONE, "Report expired — please re-scan.")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="govux-scan-{scan.host}.pdf"'})


@router.get("/stats")
def url_stats(url: str, db: Session = Depends(get_db)):
    """How many times a URL/host has been scanned on GovUX."""
    host = _host(url)
    # exact host match uses idx_pubscan_host — the old leading-wildcard ILIKE forced a
    # full table scan on every call (unbounded query at scale)
    by_url = db.query(models.PublicScan).filter(models.PublicScan.host == host).count()
    return {"host": host, "scan_count": by_url}


@router.get("/queue")
def queue_state(db: Session = Depends(get_db)):
    rows = (db.query(models.PublicScan)
              .filter(models.PublicScan.status.in_(["running", "queued"]))
              .order_by(models.PublicScan.created_at).limit(50).all())
    return {"waiting": len(rows),
            "queue": [{"host": s.host, "status": s.status, "position": i}
                      for i, s in enumerate(rows)]}
