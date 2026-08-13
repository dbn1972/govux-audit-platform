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
