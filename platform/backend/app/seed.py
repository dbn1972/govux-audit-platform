"""Seed demo data:  python -m app.seed

Creates both personas so every screen is demoable:
  * an owner (registers/audits their own domains), and
  * a steward / programme_admin (national dashboard, rankings, monitoring, discovery).
Plus a monitoring schedule and a couple of auto-discovered domains.
"""
from datetime import datetime, timedelta, timezone

from .database import SessionLocal, Base, engine
from . import models


def seed():
    Base.metadata.create_all(engine)   # dev convenience; use schema.sql/Alembic in prod
    db = SessionLocal()
    try:
        if db.query(models.Organisation).first():
            print("already seeded"); return

        org = models.Organisation(name="Department of Posts (India Post)", org_type="department")
        db.add(org); db.flush()

        owner = models.User(email="d.nayak@indiapost.gov.in", org_id=org.id,
                            display_name="D. Nayak", role="owner")
        steward = models.User(email="steward@indiapost.gov.in", org_id=org.id,
                              display_name="MeitY/NIC Steward", role="programme_admin")
        db.add_all([owner, steward]); db.flush()

        domains = []
        for url, cat in [("indiapost.gov.in", "transactional"),
                         ("ncsc.dop.gov.in", "transactional"),
                         ("ippbonline.gov.in", "payments")]:
            d = models.Domain(org_id=org.id, url=url, tld="gov.in",
                              service_category=cat, size_class="large",
                              verify_status="verified", created_by=owner.id)
            db.add(d); domains.append(d)
        db.flush()

        # a weekly monitor on the flagship domain (continuous monitoring demo)
        db.add(models.Schedule(domain_id=domains[0].id, cadence="weekly",
                               next_run_at=datetime.now(timezone.utc) + timedelta(days=7),
                               created_by=steward.id))
        # a couple of auto-discovered estate domains not yet registered
        for url in ["cept.gov.in", "postagestamps.gov.in"]:
            db.add(models.DiscoveredDomain(url=url, source="registry", seed="seed"))

        db.commit()
        print("seeded: 1 org, 2 users (owner d.nayak@indiapost.gov.in + "
              "steward@indiapost.gov.in), 3 verified domains, 1 monitor, 2 discovered")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
