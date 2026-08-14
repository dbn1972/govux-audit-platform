"""Cleanup stray pytest fixture accounts from the dev database.

Usage:
    python -m app.cleanup_test_data          # dry-run (default)
    python -m app.cleanup_test_data --apply  # actually delete

Identifies fixture accounts by their characteristic `x.<hex>@nic.in` email
pattern created by conftest.py (`t.{uuid.hex[:8]}@nic.in`). These accumulate
because tests historically ran against the public schema before the schema-
isolation fix, and teardown never cleaned up created users.

Safe: only touches users matching the fixture pattern whose `display_name` is
"Tester" — real NIC users have proper display names and non-hex email prefixes.
"""
import re
import sys

from .database import SessionLocal
from . import models

# Pattern: single letter, dot, 8 hex chars @ nic.in (conftest creates t.<hex>@nic.in)
FIXTURE_PATTERN = re.compile(r"^[a-z]\.[0-9a-f]{8}@nic\.in$")


def find_stray_fixtures(db) -> list[models.User]:
    """Return users matching the pytest fixture account pattern."""
    users = db.query(models.User).filter(models.User.email.op("~")(
        r"^[a-z]\.[0-9a-f]{8}@nic\.in$"
    )).all()
    # extra safety: only those with the fixture display name or NULL
    return [u for u in users if u.display_name in ("Tester", None)]


def cleanup(apply: bool = False):
    db = SessionLocal()
    try:
        stray = find_stray_fixtures(db)
        print(f"Found {len(stray)} stray fixture account(s)")
        if not stray:
            return

        if not apply:
            print("Dry run — pass --apply to delete. Sample:")
            for u in stray[:10]:
                print(f"  {u.email}  (created {u.created_at})")
            if len(stray) > 10:
                print(f"  ... and {len(stray) - 10} more")
            return

        # Delete associated data first (FK constraints)
        user_ids = [u.id for u in stray]
        org_ids = {u.org_id for u in stray if u.org_id}

        # devices
        db.query(models.Device).filter(models.Device.user_id.in_(user_ids)).delete(
            synchronize_session=False)
        # sessions (refresh tokens)
        db.query(models.Session).filter(models.Session.user_id.in_(user_ids)).delete(
            synchronize_session=False)
        # OTP codes
        db.query(models.OtpCode).filter(models.OtpCode.email.in_(
            [u.email for u in stray])).delete(synchronize_session=False)
        # users themselves
        db.query(models.User).filter(models.User.id.in_(user_ids)).delete(
            synchronize_session=False)
        # orphaned fixture orgs (no remaining users)
        for oid in org_ids:
            remaining = db.query(models.User).filter(models.User.org_id == oid).count()
            if remaining == 0:
                db.query(models.Organisation).filter(models.Organisation.id == oid).delete(
                    synchronize_session=False)

        db.commit()
        print(f"Deleted {len(stray)} fixture account(s) and their associated data")
    finally:
        db.close()


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    cleanup(apply=apply)
