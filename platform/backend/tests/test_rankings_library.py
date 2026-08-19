import uuid
from app import models


def test_national_requires_admin_role(client, db):
    # a non-admin (owner) user
    org = models.Organisation(name="O", org_type="department"); db.add(org); db.flush()
    u = models.User(email=f"owner.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="owner")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    from app import security
    tok = security.issue_access_token(str(u.id), "owner", str(dev.id))
    r = client.get("/v1/national", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403


def test_national_and_rankings(client, ctx):
    n = client.get("/v1/national", headers=ctx["headers"])
    assert n.status_code == 200
    body = n.json()
    assert "band_distribution" in body and set("ABCDE") <= set(body["band_distribution"])
    rk = client.get("/v1/rankings", headers=ctx["headers"], params={"category": "transactional"})
    assert rk.status_code == 200 and "ranking" in rk.json()


def test_alerts_requires_admin_role(client, db):
    org = models.Organisation(name="O2", org_type="department"); db.add(org); db.flush()
    u = models.User(email=f"owner.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="owner")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    from app import security
    tok = security.issue_access_token(str(u.id), "owner", str(dev.id))
    r = client.get("/v1/alerts", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403


def test_alerts_computes_real_counts_and_items(client, ctx, db):
    """Was hardcoded illustrative copy; must now reflect real audits — one
    scenario for each of the four alert categories the screen surfaces."""
    from datetime import datetime, timedelta, timezone
    org = ctx["org"]

    def mk_domain(url):
        d = models.Domain(org_id=org.id, url=url, tld="gov.in", verify_status="verified",
                          created_by=ctx["user"].id)
        db.add(d); db.flush()
        return d

    def mk_audit(domain, score, band, created_at, guardrail=False):
        a = models.Audit(domain_id=domain.id, engine_version="v3.2", status="completed",
                         overall_score=score, band=band, guardrail_active=guardrail,
                         created_at=created_at)
        db.add(a); db.flush()
        return a

    now = datetime.now(timezone.utc)

    e_domain = mk_domain(f"e{uuid.uuid4().hex[:6]}.gov.in")
    mk_audit(e_domain, 20, "E", now)

    mk_domain(f"never{uuid.uuid4().hex[:6]}.gov.in")   # never audited: no Audit row at all

    spike_domain = mk_domain(f"spike{uuid.uuid4().hex[:6]}.gov.in")
    mk_audit(spike_domain, 55, "C", now, guardrail=True)

    reg_domain = mk_domain(f"reg{uuid.uuid4().hex[:6]}.gov.in")
    mk_audit(reg_domain, 80, "B", now - timedelta(days=10))
    mk_audit(reg_domain, 70, "B", now)   # -10 points, within the last 30 days

    db.commit()

    r = client.get("/v1/alerts", headers=ctx["headers"])
    assert r.status_code == 200
    body = r.json()

    assert body["band_e_count"] >= 1
    assert body["never_audited_count"] >= 1
    assert body["critical_spike_count"] >= 1
    assert body["regressed_count"] >= 1

    titles = " ".join(a["title"] for a in body["alerts"])
    assert "Band E" in titles
    assert "regressed" in titles
    assert "never been audited" in titles
    assert "critical accessibility failures" in titles
    assert reg_domain.url in titles   # the specific worst-regression callout, by name


def test_guidelines_endpoint(client, db):
    db.merge(models.Guideline(id="WCAG-1.4.3", family="WCAG", category="accessibility",
                              title="Colour contrast", plain_language="4.5:1"))
    db.commit()
    r = client.get("/v1/guidelines", params={"family": "WCAG"})
    assert r.status_code == 200
    assert any(g["id"] == "WCAG-1.4.3" for g in r.json())


def test_update_finding(client, ctx, verified_domain, db):
    audit = models.Audit(domain_id=verified_domain.id, engine_version="test",
                         requested_by=ctx["user"].id, status="completed")
    db.add(audit); db.flush()
    f = models.Finding(audit_id=audit.id, category="accessibility", severity="critical")
    db.add(f); db.commit()
    r = client.patch(f"/v1/findings/{f.id}", headers=ctx["headers"],
                     json={"state": "resolved", "is_reviewed": True})
    assert r.status_code == 200 and r.json()["state"] == "resolved"
    assert client.patch(f"/v1/findings/{uuid.uuid4()}", headers=ctx["headers"],
                        json={"state": "open"}).status_code == 404


# ---------- organisations directory -------------------------------------
def test_organisations_requires_admin_role(client, db):
    org = models.Organisation(name="O3", org_type="department"); db.add(org); db.flush()
    u = models.User(email=f"owner.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="owner")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    from app import security
    tok = security.issue_access_token(str(u.id), "owner", str(dev.id))
    r = client.get("/v1/organisations", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403


def test_organisations_search_type_filter_and_domain_counts(client, ctx, db):
    tag = uuid.uuid4().hex[:8]
    org_a = models.Organisation(name=f"Zebra Ministry {tag}", org_type="ministry")
    org_b = models.Organisation(name=f"Zebra Department {tag}", org_type="department")
    db.add_all([org_a, org_b]); db.flush()
    db.add_all([
        models.Domain(org_id=org_a.id, url=f"za{uuid.uuid4().hex[:6]}.gov.in",
                      tld="gov.in", verify_status="verified", created_by=ctx["user"].id),
        models.Domain(org_id=org_a.id, url=f"zb{uuid.uuid4().hex[:6]}.gov.in",
                      tld="gov.in", verify_status="verified", created_by=ctx["user"].id),
    ])
    db.commit()

    # search matches both by shared name fragment
    r = client.get("/v1/organisations", headers=ctx["headers"], params={"q": tag})
    assert r.status_code == 200
    body = r.json()
    names = {i["name"] for i in body["items"]}
    assert org_a.name in names and org_b.name in names
    assert body["total"] >= 2

    # org_type narrows it to just the ministry
    r2 = client.get("/v1/organisations", headers=ctx["headers"],
                    params={"q": tag, "org_type": "ministry"})
    items2 = r2.json()["items"]
    assert {i["name"] for i in items2} == {org_a.name}

    # domain_count reflects the two domains just added to org_a, zero for org_b
    by_name = {i["name"]: i for i in body["items"]}
    assert by_name[org_a.name]["domain_count"] == 2
    assert by_name[org_b.name]["domain_count"] == 0


def test_organisations_pagination(client, ctx, db):
    tag = uuid.uuid4().hex[:8]
    for i in range(5):
        db.add(models.Organisation(name=f"Page Org {tag} {i}", org_type="other"))
    db.commit()

    page1 = client.get("/v1/organisations", headers=ctx["headers"],
                       params={"q": f"Page Org {tag}", "limit": 2, "offset": 0}).json()
    page2 = client.get("/v1/organisations", headers=ctx["headers"],
                       params={"q": f"Page Org {tag}", "limit": 2, "offset": 2}).json()
    assert page1["total"] == 5 and page2["total"] == 5
    assert len(page1["items"]) == 2 and len(page2["items"]) == 2
    assert {i["id"] for i in page1["items"]}.isdisjoint({i["id"] for i in page2["items"]})


# ---------- steward organisation management ---------------------------------
def test_organisations_carry_activity_not_just_a_domain_count(client, ctx, db):
    """A steward looking at the directory needs to know whether an organisation
    is actually using the platform — domain count alone can't say that."""
    from app import models as m
    tag = uuid.uuid4().hex[:8]
    org = m.Organisation(name=f"Active {tag}", org_type="department")
    db.add(org); db.flush()
    db.add(m.User(email=f"a.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="owner"))
    d = m.Domain(org_id=org.id, url=f"act{uuid.uuid4().hex[:6]}.gov.in", tld="gov.in",
                 verify_status="verified", created_by=ctx["user"].id)
    db.add(d); db.flush()
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    # distinct timestamps: "latest" must not depend on insertion order
    for score, age in ((70, 2), (80, 1)):
        db.add(m.Audit(domain_id=d.id, engine_version="t", status="completed",
                       overall_score=score, band="B",
                       created_at=now - timedelta(days=age)))
    db.commit()

    row = next(i for i in client.get("/v1/organisations", headers=ctx["headers"],
                                     params={"q": tag}).json()["items"]
               if i["name"] == f"Active {tag}")
    assert row["domain_count"] == 1
    assert row["user_count"] == 1
    assert row["audit_count"] == 2          # every completed run
    assert row["audited_domains"] == 1      # ...over one domain
    assert row["avg_score"] == 80.0         # latest per domain, not the mean of both
    assert row["last_audited_at"] is not None


def test_steward_can_create_an_organisation(client, ctx, db):
    """Organisations could previously only appear as a side effect — auto-provisioned
    on a first domain registration, via CSV import, or from the seed script."""
    tag = uuid.uuid4().hex[:8]
    r = client.post("/v1/organisations", headers=ctx["headers"],
                    json={"name": f"Ministry of {tag}", "org_type": "ministry", "state_code": "DL"})
    assert r.status_code == 201, r.text
    assert r.json()["org_type"] == "ministry" and r.json()["state_code"] == "DL"

    # duplicate names are refused case-insensitively
    dup = client.post("/v1/organisations", headers=ctx["headers"],
                      json={"name": f"MINISTRY OF {tag}"})
    assert dup.status_code == 409

    assert client.post("/v1/organisations", headers=ctx["headers"],
                       json={"name": "X", "org_type": "wizard"}).status_code == 422


def test_steward_can_rename_any_organisation(client, ctx, db):
    """PATCH /v1/auth/organisation only edits your OWN, so nobody could correct
    the auto-provisioned names the platform generates for itself."""
    from app import models as m
    tag = uuid.uuid4().hex[:8]
    org = m.Organisation(name=f"aman's Organisation {tag}", org_type="department")
    db.add(org); db.commit()

    r = client.patch(f"/v1/organisations/{org.id}", headers=ctx["headers"],
                     json={"name": f"Dept of Fisheries {tag}", "org_type": "department",
                           "state_code": "KL"})
    assert r.status_code == 200
    db.expire_all()
    fresh = db.get(m.Organisation, org.id)
    assert fresh.name == f"Dept of Fisheries {tag}" and fresh.state_code == "KL"

    assert client.patch(f"/v1/organisations/{uuid.uuid4()}", headers=ctx["headers"],
                        json={"name": "Nope"}).status_code == 404


def test_creating_and_editing_organisations_requires_a_steward(client, db):
    org = models.Organisation(name=f"Plain {uuid.uuid4().hex[:6]}", org_type="department")
    db.add(org); db.flush()
    u = models.User(email=f"o.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="owner")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    from app import security
    h = {"Authorization": f"Bearer {security.issue_access_token(str(u.id), 'owner', str(dev.id))}"}
    assert client.post("/v1/organisations", headers=h, json={"name": "Sneaky Dept"}).status_code == 403
    assert client.patch(f"/v1/organisations/{org.id}", headers=h,
                        json={"name": "Renamed"}).status_code == 403


# ---------- finding updates: ownership + reviewer gate ----------------------
# The one pre-existing test above used the `ctx` fixture, i.e. a programme_admin
# — the superset role, in the owning org. That single happy path passed while
# the endpoint had NO ownership check and NO reviewer check at all: any signed-in
# user from any organisation could mark another ministry's findings resolved and
# expert-reviewed. Reading the same audit was correctly fenced (404); only the
# write was open. These cover the roles that actually constrain it.

def _user_in_own_org(db, role: str, name: str):
    from app import security
    org = models.Organisation(name=f"{name} Dept {uuid.uuid4().hex[:6]}", org_type="department")
    db.add(org); db.flush()
    u = models.User(email=f"{name}.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role=role)
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    tok = security.issue_access_token(str(u.id), role, str(dev.id))
    return org, u, {"Authorization": f"Bearer {tok}"}


def _finding_for(db, ctx, verified_domain):
    audit = models.Audit(domain_id=verified_domain.id, engine_version="test",
                         requested_by=ctx["user"].id, status="completed")
    db.add(audit); db.flush()
    f = models.Finding(audit_id=audit.id, category="accessibility", severity="critical")
    db.add(f); db.commit()
    return f


def test_another_orgs_finding_cannot_be_written(client, ctx, verified_domain, db):
    f = _finding_for(db, ctx, verified_domain)
    _, _, outsider = _user_in_own_org(db, "owner", "outsider")

    r = client.patch(f"/v1/findings/{f.id}", headers=outsider,
                     json={"state": "resolved", "is_reviewed": True})
    # 404, not 403 — never confirm another org's finding id exists
    assert r.status_code == 404

    db.refresh(f)
    assert f.state == "open" and f.is_reviewed is False


def test_a_colleague_may_triage_but_not_sign_off(client, ctx, verified_domain, db):
    from app import security
    f = _finding_for(db, ctx, verified_domain)
    # a contributor inside the OWNING org
    u = models.User(email=f"contrib.{uuid.uuid4().hex[:6]}@nic.in",
                    org_id=ctx["org"].id, role="contributor")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    hdrs = {"Authorization": f"Bearer {security.issue_access_token(str(u.id), 'contributor', str(dev.id))}"}

    assert client.patch(f"/v1/findings/{f.id}", headers=hdrs,
                        json={"state": "in_progress"}).status_code == 200

    r = client.patch(f"/v1/findings/{f.id}", headers=hdrs, json={"is_reviewed": True})
    assert r.status_code == 403
    db.refresh(f)
    assert f.is_reviewed is False


def test_an_assessor_may_sign_off(client, ctx, verified_domain, db):
    from app import security
    f = _finding_for(db, ctx, verified_domain)
    u = models.User(email=f"assessor.{uuid.uuid4().hex[:6]}@nic.in",
                    org_id=ctx["org"].id, role="assessor")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    hdrs = {"Authorization": f"Bearer {security.issue_access_token(str(u.id), 'assessor', str(dev.id))}"}

    r = client.patch(f"/v1/findings/{f.id}", headers=hdrs, json={"is_reviewed": True})
    assert r.status_code == 200 and r.json()["is_reviewed"] is True


def test_an_unknown_state_is_rejected_before_the_database(client, ctx, verified_domain, db):
    # `state` is a PG enum: as a free-form string this reached the DB and came
    # back a 500 rather than a validation error.
    f = _finding_for(db, ctx, verified_domain)
    r = client.patch(f"/v1/findings/{f.id}", headers=ctx["headers"], json={"state": "banana"})
    assert r.status_code == 422


# ---------- guidance coverage ------------------------------------------------
# A finding without guidance names a rule and a severity but never says how to
# pass it. Before the library merge two-thirds of a real report looked like that.
# This guards the invariant rather than the count: every id the engine can emit
# must resolve to a guideline that actually carries advice text.

# Mirrors audit_engine/rules.js GIGW_IDS + gigw-rules.js check keys.
ENGINE_GIGW_IDS = [
    "GIGW-contact-info", "GIGW-content-freshness", "GIGW-accessibility-statement",
    "GIGW-hyperlinking-policy", "GIGW-rti", "GIGW-6.2",
    "GIGW-copyright-policy", "GIGW-privacy-policy", "GIGW-terms", "GIGW-help-faq",
    "GIGW-sitemap", "GIGW-search", "GIGW-feedback", "GIGW-language-option",
    "GIGW-metadata-title", "GIGW-metadata-desc", "GIGW-viewport",
]
# Non-WCAG families runner.js / worker.py emit directly.
ENGINE_OTHER_IDS = [
    "Security", "Consent-banner", "DPDP-s6-consent", "Responsive", "Cross-browser",
    "Content-QA", "PDF-UA", "Integrity-overlay", "Integrity-gaming", "ML-ADVISORY",
    "Evidence", "CWV-LCP", "CWV-INP", "CWV-CLS",
]
# The WCAG criteria axe can decide deterministically (see rules.js wcagCriterion).
ENGINE_WCAG_IDS = [f"WCAG-{sc}" for sc in (
    "1.1.1 1.2.1 1.2.2 1.3.1 1.3.4 1.3.5 1.4.1 1.4.2 1.4.3 1.4.4 1.4.12 2.1.1 "
    "2.2.1 2.2.2 2.4.1 2.4.2 2.4.4 2.5.3 2.5.8 3.1.1 3.1.2 3.3.2 4.1.2").split()]


def test_every_engine_guideline_id_has_actionable_guidance(db):
    from app import models
    from app import seed_engine_guidelines
    # Runs the seeder rather than assuming a populated database: the suite uses
    # an isolated schema, and this way a guideline missing from the seed fails
    # here instead of only showing up on a live audit.
    seed_engine_guidelines.run()
    missing, empty = [], []
    for gid in ENGINE_GIGW_IDS + ENGINE_OTHER_IDS + ENGINE_WCAG_IDS:
        g = db.get(models.Guideline, gid)
        if g is None:
            missing.append(gid)
        elif not (g.advice or "").strip():
            empty.append(gid)
    assert not missing, f"engine emits ids with no guideline row: {missing}"
    assert not empty, f"guideline rows exist but carry no advice: {empty}"


# `family='UX4G'` is how the library is counted, exported and reconciled against
# the published UX4G self-health-check. Three Design Handbook principles used to
# be seeded into that family, so every one of those totals read three too high.
def test_the_ux4g_family_holds_only_mastersheet_rows(db):
    from app import models
    from app import seed_engine_guidelines
    seed_engine_guidelines.run()
    # Asserted per-id rather than as "family UX4G is empty of non-sheet rows":
    # other suites seed UX4G-* fixtures into this shared schema, and a whole-
    # family assertion would fail on their rows instead of on a real regression.
    handbook = ["UX4G-consistent-components", "UX4G-lang", "UX4G-mobile-first"]
    families = {gid: db.get(models.Guideline, gid).family for gid in handbook}
    assert families == {gid: "UX4G Handbook" for gid in handbook}, (
        f"handbook principles must not sit in family='UX4G': {families}")


def test_engine_guidelines_never_enter_the_human_review_checklist(db):
    from app import models
    from app import seed_engine_guidelines
    seed_engine_guidelines.run()
    # Anything the crawler decides on its own must be automation='automated',
    # otherwise it turns up in the assessor's checklist and the review becomes a
    # rubber stamp of machine output.
    rows = (db.query(models.Guideline)
              .filter(models.Guideline.id.in_(ENGINE_OTHER_IDS + ENGINE_WCAG_IDS)).all())
    wrong = [g.id for g in rows if g.automation != "automated"]
    assert not wrong, f"engine-decided guidelines not marked automated: {wrong}"


# ── national brief (PDF export) ─────────────────────────────────────────────
# The dashboard button that produces this was decorative for months: styled,
# clickable, wired to nothing. What matters in the test is that the document
# carries the same numbers the screen does and that a non-steward can't pull it.
def test_national_brief_returns_a_pdf_for_a_steward(client, ctx):
    r = client.get("/v1/national/brief.pdf", headers=ctx["headers"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-"
    assert "attachment;" in r.headers.get("content-disposition", "")
    assert "govux-national-brief-" in r.headers.get("content-disposition", "")


def test_national_brief_is_steward_only(client, db, ctx):
    """An owner may hold every domain in the brief and still not be entitled to
    the national picture — that is the steward's view, not a tenant's."""
    from app import models, security
    u = models.User(email="owner.brief@nic.in", org_id=ctx["org"].id,
                    display_name="Owner", role="owner")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk-owner")
    db.add(dev); db.commit()
    tok = security.issue_access_token(str(u.id), u.role, str(dev.id))
    r = client.get("/v1/national/brief.pdf", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403


# ── in-app notifications ────────────────────────────────────────────────────
# The bell was a link to Settings. These pin the two properties that matter:
# a user sees their own notifications and nobody else's, and reading is idempotent.
def test_notifications_are_scoped_to_the_signed_in_user(client, db, ctx):
    from app import models, security
    other = models.User(email="other.notif@nic.in", org_id=ctx["org"].id,
                        display_name="Other", role="owner")
    db.add(other); db.flush()
    db.add(models.Notification(user_id=ctx["user"].id, kind="audit_complete",
                               title="Yours", body="b", link="/x"))
    db.add(models.Notification(user_id=other.id, kind="audit_complete",
                               title="Theirs", body="b", link="/y"))
    db.commit()

    r = client.get("/v1/notifications", headers=ctx["headers"])
    assert r.status_code == 200
    titles = [i["title"] for i in r.json()["items"]]
    assert titles == ["Yours"], titles
    assert r.json()["unread"] == 1


def test_marking_read_is_idempotent_and_scoped(client, db, ctx):
    db.add(models.Notification(user_id=ctx["user"].id, kind="regression",
                               title="Score dropped", body="b", link="/z"))
    db.commit()
    assert client.post("/v1/notifications/read", json={}, headers=ctx["headers"]).json()["marked"] == 1
    # already read: nothing left to mark, and no error
    assert client.post("/v1/notifications/read", json={}, headers=ctx["headers"]).json()["marked"] == 0
    assert client.get("/v1/notifications", headers=ctx["headers"]).json()["unread"] == 0


def test_a_regression_is_recorded_even_with_that_mail_switched_off(db, ctx, monkeypatch):
    """The event this platform exists to catch must leave a trace regardless of
    a deployment's mail preferences — turning an email off is not consent to
    lose the record."""
    from app.services import notify, settings_store
    monkeypatch.setattr(settings_store, "get_bool", lambda k, d=True: False)

    domain = models.Domain(org_id=ctx["org"].id, url="regress.gov.in", tld="gov.in",
                           service_category="information", size_class="small",
                           verify_status="verified", created_by=ctx["user"].id)
    db.add(domain); db.flush()
    old = models.Audit(domain_id=domain.id, status="completed", engine_version="v3.2",
                       overall_score=80, band="B", requested_by=ctx["user"].id)
    db.add(old); db.flush()
    new = models.Audit(domain_id=domain.id, status="completed", engine_version="v3.2",
                       overall_score=60, band="C", requested_by=ctx["user"].id)
    db.add(new); db.flush()

    notify._regression(db, new, domain, "http://x/report")
    db.commit()

    # scoped to THIS domain: other tests in this shared schema also write
    # kind="regression" rows, and matching on kind alone picks up theirs
    rows = (db.query(models.Notification)
              .filter(models.Notification.kind == "regression",
                      models.Notification.title.contains("regress.gov.in")).all())
    assert rows, "a 20-point drop left no notification"
    assert rows[0].link == f"/audits/{new.id}/compare"
