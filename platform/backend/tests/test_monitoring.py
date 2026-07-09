import uuid
from app import models


# ---------- schedules (G2) ----------
def test_create_list_delete_schedule(client, ctx, verified_domain):
    r = client.post("/v1/schedules", headers=ctx["headers"],
                    json={"domain_id": str(verified_domain.id), "cadence": "weekly"})
    assert r.status_code == 201
    sid = r.json()["id"]
    assert r.json()["cadence"] == "weekly"

    lst = client.get("/v1/schedules", headers=ctx["headers"])
    assert lst.status_code == 200
    assert any(s["id"] == sid for s in lst.json())

    d = client.delete(f"/v1/schedules/{sid}", headers=ctx["headers"])
    assert d.status_code == 204


def test_schedule_rejects_bad_cadence(client, ctx, verified_domain):
    r = client.post("/v1/schedules", headers=ctx["headers"],
                    json={"domain_id": str(verified_domain.id), "cadence": "hourly"})
    assert r.status_code == 400


def test_schedule_missing_domain(client, ctx):
    r = client.post("/v1/schedules", headers=ctx["headers"],
                    json={"domain_id": str(uuid.uuid4()), "cadence": "daily"})
    assert r.status_code == 404


def test_delete_missing_schedule(client, ctx):
    assert client.delete(f"/v1/schedules/{uuid.uuid4()}",
                         headers=ctx["headers"]).status_code == 404


# ---------- auto-discovery (G2) ----------
def test_discovery_scan_records_new_hosts(client, ctx):
    host = f"disc{uuid.uuid4().hex[:6]}.gov.in"
    r = client.post("/v1/discovery/scan", headers=ctx["headers"], json={"samples": [
        {"seed": "https://portal.gov.in/robots.txt",
         "body": f"Sitemap: https://{host}/sitemap.xml", "kind": "robots"}]})
    assert r.status_code == 200
    assert host in r.json()["discovered"]
    assert r.json()["new"] >= 1

    lst = client.get("/v1/discovery", headers=ctx["headers"])
    assert lst.status_code == 200
    assert any(d["url"] == host for d in lst.json())


def test_discovery_requires_admin(client, db):
    org = models.Organisation(name="O", org_type="department"); db.add(org); db.flush()
    u = models.User(email=f"owner.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="owner")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    from app import security
    tok = security.issue_access_token(str(u.id), "owner", str(dev.id))
    r = client.post("/v1/discovery/scan", headers={"Authorization": f"Bearer {tok}"},
                    json={"samples": []})
    assert r.status_code == 403
