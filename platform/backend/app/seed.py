"""Seed demo data:  python -m app.seed

Creates both personas so every screen is demoable:
  * an owner (registers/audits their own domains), and
  * a steward / programme_admin (national dashboard, rankings, monitoring, discovery).
Plus a monitoring schedule and a couple of auto-discovered domains.

IDEMPOTENT, and deliberately so. It used to bail out entirely the moment
steward@indiapost.gov.in existed, which meant the one case you most want to fix
— a deployment where that address had already been created by self-service
sign-in, landing in its own auto-provisioned org — was the exact case it refused
to touch. Re-running now reconciles whatever is there instead of no-opping, so a
deployed database can be brought into line with a local one.

Existing rows are adopted rather than duplicated; nothing here deletes data.
"""
from datetime import datetime, timedelta, timezone

from .database import SessionLocal, Base, engine
from . import models

ORG_NAME = "Department of Posts (India Post)"
OWNER_EMAIL = "d.nayak@indiapost.gov.in"
STEWARD_EMAIL = "steward@indiapost.gov.in"
DOMAINS = [("indiapost.gov.in", "transactional"),
           ("ncsc.dop.gov.in", "transactional"),
           ("ippbonline.gov.in", "payments")]
DISCOVERED = ["cept.gov.in", "postagestamps.gov.in"]


def seed() -> dict:
    Base.metadata.create_all(engine)   # dev convenience; use schema.sql/Alembic in prod
    db = SessionLocal()
    stats = {"org": "", "users_created": 0, "users_updated": 0,
             "domains_created": 0, "domains_adopted": 0,
             "schedules_created": 0, "discovered_created": 0}
    try:
        # By NAME, not "the first organisation in the table" — on a deployment
        # that already has orgs, `.first()` attached the demo users to whichever
        # one happened to sort first.
        org = db.query(models.Organisation).filter(models.Organisation.name == ORG_NAME).first()
        if not org:
            org = models.Organisation(name=ORG_NAME, org_type="department")
            db.add(org); db.flush()
            stats["org"] = "created"
        else:
            stats["org"] = "existing"

        def upsert_user(email: str, display_name: str, role: str) -> models.User:
            u = db.query(models.User).filter(models.User.email == email).first()
            if u is None:
                u = models.User(email=email, display_name=display_name,
                                org_id=org.id, role=role)
                db.add(u); db.flush()
                stats["users_created"] += 1
                return u
            # Adopt an account that signed itself in before the seed ran: move it
            # into the demo org and give it the intended role and name. This is
            # the reconciliation that the old bail-out prevented.
            if u.org_id != org.id or u.role != role or u.display_name != display_name:
                u.org_id, u.role, u.display_name = org.id, role, display_name
                stats["users_updated"] += 1
            return u

        owner = upsert_user(OWNER_EMAIL, "D. Nayak", "owner")
        steward = upsert_user(STEWARD_EMAIL, "MeitY/NIC Steward", "programme_admin")
        db.flush()

        domains = []
        for url, cat in DOMAINS:
            d = db.query(models.Domain).filter(models.Domain.url == url).first()
            if d is None:
                d = models.Domain(org_id=org.id, url=url, tld="gov.in",
                                  service_category=cat, size_class="large",
                                  verify_status="verified", created_by=owner.id)
                db.add(d)
                stats["domains_created"] += 1
            else:
                # Adopt only a claim nobody else has proven — never take a domain
                # another organisation has legitimately verified.
                if d.org_id != org.id and d.verify_status != "verified":
                    d.org_id = org.id
                    stats["domains_adopted"] += 1
                if d.org_id == org.id:
                    d.verify_status = "verified"
                    d.service_category = d.service_category or cat
            domains.append(d)
        db.flush()

        # a weekly monitor on the flagship domain (continuous monitoring demo)
        if not db.query(models.Schedule).filter(models.Schedule.domain_id == domains[0].id).first():
            db.add(models.Schedule(domain_id=domains[0].id, cadence="weekly",
                                   next_run_at=datetime.now(timezone.utc) + timedelta(days=7),
                                   created_by=steward.id))
            stats["schedules_created"] += 1

        # a couple of auto-discovered estate domains not yet registered
        for url in DISCOVERED:
            if not db.query(models.DiscoveredDomain).filter(
                    models.DiscoveredDomain.url == url).first():
                db.add(models.DiscoveredDomain(url=url, source="registry", seed="seed"))
                stats["discovered_created"] += 1

        db.commit()
    finally:
        db.close()
    return stats


if __name__ == "__main__":
    s = seed()
    print(f"organisation      : {s['org']} ({ORG_NAME})")
    print(f"users created     : {s['users_created']}")
    print(f"users reconciled  : {s['users_updated']}")
    print(f"domains created   : {s['domains_created']}")
    print(f"domains adopted   : {s['domains_adopted']}")
    print(f"schedules created : {s['schedules_created']}")
    print(f"discovered created: {s['discovered_created']}")
