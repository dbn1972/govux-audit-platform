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
