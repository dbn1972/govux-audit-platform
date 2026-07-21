"""Auto-polling worker for local dev — picks queued audits from DB every 5 seconds.

Usage: python auto_worker.py

This replaces the Redis Streams worker for local development (Redis 3.x on Windows
doesn't support Streams). It polls the DB directly.
"""
import sys
import os
import time

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("GOVUX_DATABASE_URL", "postgresql+psycopg://govux:govux@localhost:5432/govux")
os.environ.setdefault("GOVUX_REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("GOVUX_ENV", "dev")
os.environ.setdefault("GOVUX_JWT_SECRET", "change-me-in-prod")

from app.database import SessionLocal
from app import models, worker


def poll():
    print("GovUX local worker started — polling for queued audits every 5s...")
    while True:
        db = SessionLocal()
        try:
            audit = (db.query(models.Audit)
                     .filter(models.Audit.status == "queued")
                     .order_by(models.Audit.created_at)
                     .first())
            if audit:
                domain = db.get(models.Domain, audit.domain_id)
                depth = (audit.scope or {}).get("depth", 10)
                print(f"\n▶ Processing audit {audit.id} for {domain.url} (depth={depth})...")
                try:
                    payload = {"domain": domain.url, "scope": audit.scope}
                    worker.process(str(audit.id), payload)
                    print(f"  ✓ Completed!")
                except Exception as e:
                    print(f"  ✗ Failed: {e}")
            else:
                print(".", end="", flush=True)
        except Exception as e:
            print(f"\n  DB error: {e}")
        finally:
            db.close()
        time.sleep(5)


if __name__ == "__main__":
    poll()
