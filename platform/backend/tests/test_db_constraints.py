"""Database CHECK-constraint integration tests (Volume-14 gap).

Invariant #4 ("access restricted to *.gov.in / *.nic.in") is enforced in code
AND in the schema (chk_gov_email, chk_gov_domain). The application-layer half is
well covered by the auth/domain/public router tests; the DB-CHECK half was not.
These bypass the routers and write straight through the ORM to prove the database
itself refuses non-gov data — the last line of defence if a code path ever forgets
to validate.
"""
import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.database import SessionLocal


def _org(s):
    o = models.Organisation(name="Dept", org_type="department")
    s.add(o); s.flush()
    return o


def test_db_rejects_a_non_gov_user_email():
    s = SessionLocal()
    try:
        org = _org(s)
        s.add(models.User(email="attacker@gmail.com", org_id=org.id,
                          display_name="x", role="owner"))
        with pytest.raises(IntegrityError):   # chk_gov_email
            s.commit()
    finally:
        s.rollback(); s.close()


def test_db_accepts_a_valid_gov_user_email():
    s = SessionLocal()
    try:
        org = _org(s)
        s.add(models.User(email=f"real.{uuid.uuid4().hex[:6]}@dept.nic.in",
                          org_id=org.id, display_name="ok", role="owner"))
        s.commit()          # must NOT raise
    finally:
        s.rollback(); s.close()


def test_db_rejects_a_non_gov_domain_url():
    s = SessionLocal()
    try:
        org = _org(s)
        s.add(models.Domain(org_id=org.id, url=f"evil-{uuid.uuid4().hex[:6]}.com",
                            tld="com", verify_status="pending"))
        with pytest.raises(IntegrityError):   # chk_gov_domain
            s.commit()
    finally:
        s.rollback(); s.close()
