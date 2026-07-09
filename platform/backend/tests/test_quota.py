"""Page quota: 10 free, more needs admin approval."""
import uuid
from app import models, security


def _owner(db):
    org = models.Organisation(name="O", org_type="department"); db.add(org); db.flush()
    u = models.User(email=f"own.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="owner")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    tok = security.issue_access_token(str(u.id), "owner", str(dev.id))
    return u, org, {"Authorization": f"Bearer {tok}"}


def _domain(db, org, u):
    d = models.Domain(org_id=org.id, url=f"q{uuid.uuid4().hex[:6]}.gov.in", tld="gov.in",
                      verify_status="verified", created_by=u.id)
    db.add(d); db.commit()
    return d


def test_quota_blocks_over_10_pages(client, db):
    u, org, hdr = _owner(db)
    d = _domain(db, org, u)
    r = client.post("/v1/audits", headers=hdr, json={"domain_id": str(d.id), "depth": 15})
    assert r.status_code == 403


def test_default_depth_is_free(client, db):
    u, org, hdr = _owner(db)
    d = _domain(db, org, u)
    r = client.post("/v1/audits", headers=hdr, json={"domain_id": str(d.id)})   # default 10
    assert r.status_code == 202


def test_request_approve_then_allowed(client, db, ctx):
    u, org, hdr = _owner(db)
    d = _domain(db, org, u)
    req = client.post("/v1/scan-requests", headers=hdr,
                      json={"domain_id": str(d.id), "requested_pages": 15, "reason": "full crawl"})
    assert req.status_code == 201
    rid = req.json()["id"]
    # owner cannot approve their own request
    assert client.patch(f"/v1/scan-requests/{rid}", headers=hdr, json={"status": "approved"}).status_code == 403
    # admin (ctx = programme_admin) approves
    assert client.patch(f"/v1/scan-requests/{rid}", headers=ctx["headers"], json={"status": "approved"}).status_code == 200
    # now the owner may submit 15 pages
    r = client.post("/v1/audits", headers=hdr, json={"domain_id": str(d.id), "depth": 15})
    assert r.status_code == 202


def test_request_under_limit_rejected(client, db):
    u, org, hdr = _owner(db)
    d = _domain(db, org, u)
    r = client.post("/v1/scan-requests", headers=hdr, json={"domain_id": str(d.id), "requested_pages": 5})
    assert r.status_code == 400


def test_admin_exempt_from_quota(client, ctx, verified_domain):
    # ctx is programme_admin -> no approval needed even for depth 20
    r = client.post("/v1/audits", headers=ctx["headers"],
                    json={"domain_id": str(verified_domain.id), "depth": 20})
    assert r.status_code == 202
