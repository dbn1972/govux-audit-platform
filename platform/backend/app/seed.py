"""Seed demo data:  python -m app.seed

Two organisations and six accounts — one of every role, so every screen is
demoable and every permission boundary is testable without inventing a login:

  Digital India Corporation   the real administrator (super_admin)
  GovUX QA Sandbox            one fixture per role: owner, contributor,
                              assessor, programme_admin, super_admin

The fixtures used to be a made-up department (India Post) with two invented
staff. Those addresses are indistinguishable from real ones — a live SMTP
relay mailed their sign-in codes straight to somebody else's mail server — so
the sandbox now uses the `*@gov.in` addresses listed in
`settings.sandbox_accounts`, whose codes are printed to the log instead of
sent (see `services/email.py`).

IDEMPOTENT, and deliberately so. It used to bail out entirely the moment the
steward account existed, which meant the one case you most want to fix — an
address already created by self-service sign-in, sitting in its own
auto-provisioned org — was the exact case it refused to touch. Re-running now
reconciles whatever is there instead of no-opping, so a deployed database can
be brought into line with a local one.

Existing rows are adopted rather than duplicated; nothing here deletes data.
"""
from datetime import datetime, timedelta, timezone

from .database import SessionLocal, Base, engine
from . import models

ADMIN_ORG = "Digital India Corporation"
ADMIN_USER = ("amanmittal.ux@digitalindia.gov.in", "Aman Mittal", "super_admin")

SANDBOX_ORG = "GovUX QA Sandbox"
SANDBOX_USERS = [
    ("owner@gov.in",            "Owner (Dev)",           "owner"),
    ("contributor@gov.in",      "Contributor (Dev)",     "contributor"),
    ("assessor@gov.in",         "Assessor (Dev)",        "assessor"),
    ("programme_admin@gov.in",  "Programme Admin (Dev)", "programme_admin"),
    ("super_admin@gov.in",      "Super Admin (Dev)",     "super_admin"),
]

# Audit targets for the demo. Real sites, deliberately: the engine fetches them.
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
        def upsert_org(name: str, org_type: str, state_code: str | None = None) -> tuple:
            o = db.query(models.Organisation).filter(models.Organisation.name == name).first()
            if o:
                return o, "existing"
            o = models.Organisation(name=name, org_type=org_type, state_code=state_code)
            db.add(o); db.flush()
            return o, "created"

        admin_org, admin_state = upsert_org(ADMIN_ORG, "department")
        sandbox_org, sandbox_state = upsert_org(SANDBOX_ORG, "other", "KA")
        # one word while both orgs agree ("created" / "existing"), which is the
        # normal case and what a re-run is checked against
        stats["org"] = (admin_state if admin_state == sandbox_state
                        else f"{admin_state}/{sandbox_state}")

        def upsert_user(org, email: str, display_name: str, role: str) -> models.User:
            u = db.query(models.User).filter(models.User.email == email).first()
            if u is None:
                u = models.User(email=email, display_name=display_name,
                                org_id=org.id, role=role)
                db.add(u); db.flush()
                stats["users_created"] += 1
                return u
            # Adopt an account that signed itself in before the seed ran: move it
            # into the right org and give it the intended role and name. This is
            # the reconciliation that the old bail-out prevented.
            if u.org_id != org.id or u.role != role or u.display_name != display_name:
                u.org_id, u.role, u.display_name = org.id, role, display_name
                stats["users_updated"] += 1
            return u

        upsert_user(admin_org, *ADMIN_USER)
        by_role = {role: upsert_user(sandbox_org, email, name, role)
                   for email, name, role in SANDBOX_USERS}
        db.flush()

        owner, steward = by_role["owner"], by_role["programme_admin"]
        domains = []
        for url, cat in DOMAINS:
            d = db.query(models.Domain).filter(models.Domain.url == url).first()
            if d is None:
                d = models.Domain(org_id=sandbox_org.id, url=url, tld="gov.in",
                                  service_category=cat, size_class="large",
                                  verify_status="verified", created_by=owner.id)
                db.add(d)
                stats["domains_created"] += 1
            else:
                # Adopt only a claim nobody else has proven — never take a domain
                # another organisation has legitimately verified.
                if d.org_id != sandbox_org.id and d.verify_status != "verified":
                    d.org_id = sandbox_org.id
                    stats["domains_adopted"] += 1
                if d.org_id == sandbox_org.id:
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
    print(f"organisations     : {s['org']} ({ADMIN_ORG} / {SANDBOX_ORG})")
    print(f"users created     : {s['users_created']}")
    print(f"users reconciled  : {s['users_updated']}")
    print(f"domains created   : {s['domains_created']}")
    print(f"domains adopted   : {s['domains_adopted']}")
    print(f"schedules created : {s['schedules_created']}")
    print(f"discovered created: {s['discovered_created']}")
