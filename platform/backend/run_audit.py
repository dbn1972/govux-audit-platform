"""Direct audit runner for local dev (bypasses Redis Streams).

Usage: python run_audit.py
   or: python run_audit.py <task_id>

Without a task_id, picks the oldest 'queued' audit from the DB and runs it.
With a task_id, runs that specific audit.
"""
import sys
import os

# Ensure the app module is importable
sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("GOVUX_DATABASE_URL", "postgresql+psycopg://govux:govux@localhost:5432/govux")
os.environ.setdefault("GOVUX_REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("GOVUX_ENV", "dev")
os.environ.setdefault("GOVUX_JWT_SECRET", "change-me-in-prod")

from app.database import SessionLocal
from app import models, worker


def main():
    db = SessionLocal()
    try:
        if len(sys.argv) > 1:
            task_id = sys.argv[1]
            audit = db.get(models.Audit, task_id)
        else:
            # Pick oldest queued audit
            audit = (db.query(models.Audit)
                     .filter(models.Audit.status == "queued")
                     .order_by(models.Audit.created_at)
                     .first())

        if not audit:
            print("No queued audits found.")
            return

        domain = db.get(models.Domain, audit.domain_id)
        print(f"Running audit {audit.id} for {domain.url} (depth={audit.scope.get('depth', 10)})...")

        payload = {"domain": domain.url, "scope": audit.scope}
        worker.process(str(audit.id), payload)
        print(f"✓ Audit completed! Check /v1/audits/{audit.id} for results.")
    except Exception as e:
        print(f"✗ Audit failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
