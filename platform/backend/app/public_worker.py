"""Free public-scan worker — single-concurrency (one scan at a time, others wait).

Runs the deterministic engine on a single URL, scores it, generates a PDF, and
(for registered users) stores the PDF in S3/MinIO. Kept separate from the main
audit worker so the free tier can't starve authenticated audits.
"""
import json
import os
from datetime import datetime, timedelta, timezone

from .config import settings
from .logging import configure_logging, get_logger
from .database import SessionLocal
from . import models
from .services import queue, storage, report_pdf
from .services.scoring import compute_score, CATEGORY_WEIGHTS

logger = get_logger("public_worker")
from . import worker as audit_worker


def process(scan_id: str):
    db = SessionLocal()
    try:
        scan = db.get(models.PublicScan, scan_id)
        if not scan:
            return
        scan.status = "running"; scan.started_at = datetime.now(timezone.utc); db.commit()

        # single landing page only (depth 1) — fast, free tier
        result = audit_worker.run_engine(scan.url, depth=1)
        score = compute_score(result["categories"])

        scan.overall_score = score.overall
        scan.band = score.band

        # how many times this URL has been scanned (incl. this one)
        count = db.query(models.PublicScan).filter(models.PublicScan.url == scan.url).count()

        pdf = report_pdf.build({
            "url": scan.url, "host": scan.host,
            "date": datetime.now(timezone.utc).strftime("%d %b %Y"),
            "overall_score": score.overall, "band": score.band,
            "cwv": result.get("cwv"), "scan_count": count,
            "categories": [{"category": c, "weight": CATEGORY_WEIGHTS[c], "score": s}
                           for c, s in score.categories.items()],
            "findings": result.get("findings", []),
        })

        # cache the PDF in Redis (short TTL) for immediate download by anyone;
        # registered users also get a durable copy in S3/MinIO.
        import base64
        try:
            queue._r.setex(f"govux:pdf:{scan_id}", 3600, base64.b64encode(pdf).decode())
        except Exception:
            pass
        if scan.requested_by is not None:
            scan.pdf_key = storage.put_pdf(f"scans/{scan_id}.pdf", pdf)

        scan.status = "completed"; scan.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        scan = db.get(models.PublicScan, scan_id)
        if scan:
            scan.status = "failed"; scan.error = str(exc)[:300]; db.commit()
        logger.error("public_scan_error", scan_id=scan_id, error=str(exc))
    finally:
        db.close()


def _handle(entry_id, data):
    try:
        process(data["scan_id"])
        queue.ack_public(entry_id)   # ack only on success; failures stay pending for reclaim/DLQ
    except Exception as exc:
        logger.error("public_worker_handle_error", error=str(exc))


def reconcile_stale_scans(db):
    """Fail out scans that have been queued/running past all reasonable
    processing time — almost certainly because their Redis Streams message
    was lost outright (e.g. a dev-Redis restart with no persistence) rather
    than merely slow, since reclaim_stale_public only rescues a message that
    is still IN the stream. Without this, a lost message leaves the DB row
    stuck in 'queued' forever, permanently inflating the public queue
    position shown to everyone behind it."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.public_scan_stale_minutes)
    stale = (db.query(models.PublicScan)
               .filter(models.PublicScan.status.in_(["queued", "running"]),
                       models.PublicScan.created_at < cutoff)
               .all())
    for scan in stale:
        scan.status = "failed"
        scan.error = "Timed out waiting in the queue — please try scanning again."
        scan.finished_at = datetime.now(timezone.utc)
    if stale:
        db.commit()
        logger.info("reconciled_stale_scans", count=len(stale))


def run():
    configure_logging()
    queue.ensure_public_group()
    # unique consumer per replica (falls back to PID locally) so a crashed
    # process's in-flight scan can be reclaimed instead of stalling the
    # single-concurrency queue forever.
    consumer = os.getenv("HOSTNAME") or f"pub-worker-{os.getpid()}"
    logger.info("public_worker_started", consumer=consumer)
    ticks = 0
    while True:  # pragma: no cover - long-lived loop
        ticks += 1
        if ticks % 6 == 0:
            for entry_id, data in queue.reclaim_stale_public(consumer):
                _handle(entry_id, data)
            db = SessionLocal()
            try:
                reconcile_stale_scans(db)
            finally:
                db.close()
        batches = queue.read_public(consumer=consumer, count=1, block_ms=5000)
        for _stream, entries in batches or []:
            for entry_id, data in entries:
                _handle(entry_id, data)


if __name__ == "__main__":  # pragma: no cover
    run()
