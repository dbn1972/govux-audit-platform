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
