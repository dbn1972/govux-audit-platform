"""Free public-scan worker — single-concurrency (one scan at a time, others wait).

Runs the deterministic engine on a single URL, scores it, generates a PDF, and
(for registered users) stores the PDF in S3/MinIO. Kept separate from the main
audit worker so the free tier can't starve authenticated audits.
"""
import json
from datetime import datetime, timezone

from .database import SessionLocal
from . import models
from .services import queue, storage, report_pdf
from .services.scoring import compute_score, CATEGORY_WEIGHTS
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
        print("public-scan error:", exc)
    finally:
        db.close()


def run():
    queue.ensure_public_group()
    print("GovUX public-scan worker started; one scan at a time…")
    while True:  # pragma: no cover - long-lived loop
        batches = queue.read_public(consumer="pub-worker-1", count=1, block_ms=5000)
        for _stream, entries in batches or []:
            for entry_id, data in entries:
                try:
                    process(data["scan_id"])
                    queue.ack_public(entry_id)
                except Exception as exc:
                    print("public worker error:", exc)


if __name__ == "__main__":  # pragma: no cover
    run()
