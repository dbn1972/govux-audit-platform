"""Live roll-up endpoints that replaced demo-data screens (P0 S-1) + request-id."""
import uuid
from app import models


def _completed(db, org, user, score=88, band="B"):
    dom = models.Domain(org_id=org.id, url=f"r{uuid.uuid4().hex[:6]}.gov.in", tld="gov.in",
                        verify_status="verified", created_by=user.id)
    db.add(dom); db.flush()
    a = models.Audit(domain_id=dom.id, engine_version="v3.2", status="completed",
                     overall_score=score, band=band); db.add(a); db.flush()
    db.commit()
    return dom, a


def test_ministries_rollup_live(client, db, ctx):
    _completed(db, ctx["org"], ctx["user"])
    r = client.get("/v1/ministries", headers=ctx["headers"])
    assert r.status_code == 200
    names = [m["name"] for m in r.json()["ministries"]]
    assert ctx["org"].name in names
    row = next(m for m in r.json()["ministries"] if m["name"] == ctx["org"].name)
    assert row["domains"] >= 1 and "band" in row and isinstance(row["avg_score"], (int, float))


def test_ministries_role_gated(client, ctx_owner=None):
    assert client.get("/v1/ministries").status_code == 401


def test_states_rollup_live(client, ctx):
    r = client.get("/v1/states", headers=ctx["headers"])
    assert r.status_code == 200 and isinstance(r.json()["states"], list)


def test_audit_trend_live(client, db, ctx):
    dom, a = _completed(db, ctx["org"], ctx["user"], score=70)
    # a second, newer completed audit for the same domain
    a2 = models.Audit(domain_id=dom.id, engine_version="v3.2", status="completed",
                      overall_score=80, band="B"); db.add(a2); db.commit()
    r = client.get(f"/v1/audits/{a2.id}/trend", headers=ctx["headers"])
    assert r.status_code == 200
    hist = r.json()["history"]
    assert len(hist) == 2 and hist[0]["score"] == 80.0   # newest first


def test_audit_trend_org_scoped(client, db, ctx):
    # another org's audit must not be visible
    other = models.Organisation(name="Other Dept", org_type="department"); db.add(other); db.flush()
    ou = models.User(email=f"o.{uuid.uuid4().hex[:6]}@nic.in", org_id=other.id, role="owner")
    db.add(ou); db.flush()
    _, a = _completed(db, other, ou)
    assert client.get(f"/v1/audits/{a.id}/trend", headers=ctx["headers"]).status_code == 404


def test_request_id_header_present(client):
    r = client.get("/healthz")
    assert r.status_code == 200 and r.headers.get("X-Request-ID")
