"""Regression tests for the security-hardening pass:
  * audits router is org-scoped (no cross-tenant IDOR)
  * SSRF-guarded document fetch (guarded_get)
  * refresh-token rotation-reuse => whole-family revocation
"""
import uuid
from datetime import timedelta, datetime, timezone

import pytest

from app import models, security
from app.services import url_validate


# ---------- helpers ----------
def _org(db, name):
    o = models.Organisation(name=name, org_type="department")
    db.add(o); db.flush(); return o


def _user(db, org, role="owner"):
    u = models.User(email=f"u.{uuid.uuid4().hex[:8]}@nic.in", org_id=org.id,
                    display_name="U", role=role)
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk")
    db.add(dev); db.flush()
    return u, dev


def _token(u, dev):
    return {"Authorization": f"Bearer {security.issue_access_token(str(u.id), u.role, str(dev.id))}"}


def _completed_audit(db, domain):
    a = models.Audit(domain_id=domain.id, engine_version="v3.2", status="completed",
                     overall_score=80, band="B")
    db.add(a); db.flush(); return a


# ---------- IDOR: audits are org-fenced ----------
def test_cross_org_audit_report_is_404(db, client):
    org_a, org_b = _org(db, "Dept A"), _org(db, "Dept B")
    ua, da = _user(db, org_a)
    ub, dbdev = _user(db, org_b)
    dom_b = models.Domain(org_id=org_b.id, url=f"b{uuid.uuid4().hex[:6]}.gov.in",
                          tld="gov.in", verify_status="verified", created_by=ub.id)
    db.add(dom_b); db.flush()
    audit_b = _completed_audit(db, dom_b)
    db.commit()

    # owner (org B) can read its own report
    assert client.get(f"/v1/audits/{audit_b.id}/report", headers=_token(ub, dbdev)).status_code == 200
    # a user from org A cannot — and gets 404 (not 403), never confirming it exists
    for path in ("", "/report", "/remediation", "/documents"):
        r = client.get(f"/v1/audits/{audit_b.id}{path}", headers=_token(ua, da))
        assert r.status_code == 404, f"{path} leaked cross-org: {r.status_code}"


def test_super_admin_sees_cross_org(db, client):
    org_a, org_b = _org(db, "Dept A2"), _org(db, "Dept B2")
    sa, sdev = _user(db, org_a, role="super_admin")
    ub, _ = _user(db, org_b)
    dom_b = models.Domain(org_id=org_b.id, url=f"b{uuid.uuid4().hex[:6]}.gov.in",
                          tld="gov.in", verify_status="verified", created_by=ub.id)
    db.add(dom_b); db.flush()
    audit_b = _completed_audit(db, dom_b); db.commit()
    assert client.get(f"/v1/audits/{audit_b.id}/report", headers=_token(sa, sdev)).status_code == 200


# ---------- SSRF guard ----------
def test_guarded_get_blocks_ip_literal():
    with pytest.raises(url_validate.SSRFError):
        url_validate.guarded_get("http://169.254.169.254/latest/meta-data/x.pdf")


def test_guarded_get_blocks_internal_resolution(monkeypatch):
    monkeypatch.setattr(url_validate, "_resolve", lambda h: ["10.0.0.5"])
    with pytest.raises(url_validate.SSRFError):
        url_validate.guarded_get("http://internal.example.com/x.pdf")


# ---------- refresh-token family revocation ----------
def _session(db, u, dev, rt, fam):
    s = models.Session(user_id=u.id, device_id=dev.id,
                       refresh_token_hash=security.hash_secret(rt),
                       family_id=fam, expires_at=datetime.now(timezone.utc) + timedelta(days=1))
    db.add(s); db.flush(); return s


def _score(db, audit, category, value):
    db.add(models.AuditScore(audit_id=audit.id, category=category, weight=22, score=value))


# ---------- certification loop: expert review can reach `compliant` ----------
def test_expert_review_certifies_compliant(db, client, ctx):
    dom = models.Domain(org_id=ctx["org"].id, url=f"r{uuid.uuid4().hex[:6]}.gov.in",
                        tld="gov.in", verify_status="verified", created_by=ctx["user"].id)
    db.add(dom); db.flush()
    audit = _completed_audit(db, dom)
    _score(db, audit, "accessibility", 95)   # AA bar, no criticals
    db.commit()

    # before review: automated evidence only -> capped at partially_compliant
    r0 = client.get(f"/v1/audits/{audit.id}", headers=ctx["headers"]).json()
    # after an approving expert review: reachable `compliant`
    r = client.post(f"/v1/audits/{audit.id}/review", json={"approved": True},
                    headers=ctx["headers"])
    assert r.status_code == 200
    assert r.json()["compliance"]["status"] == "compliant"
    assert r.json()["compliance"]["method"] == "expert_reviewed"


def test_expert_review_rejection_is_non_compliant(db, client, ctx):
    dom = models.Domain(org_id=ctx["org"].id, url=f"r{uuid.uuid4().hex[:6]}.gov.in",
                        tld="gov.in", verify_status="verified", created_by=ctx["user"].id)
    db.add(dom); db.flush()
    audit = _completed_audit(db, dom)
    _score(db, audit, "accessibility", 95)
    db.commit()
    r = client.post(f"/v1/audits/{audit.id}/review",
                    json={"approved": False, "notes": "manual keyboard-trap found"},
                    headers=ctx["headers"])
    assert r.status_code == 200
    assert r.json()["compliance"]["status"] == "non_compliant"


def test_refresh_reuse_revokes_whole_family(db, client):
    org = _org(db, "Dept RT")
    u, dev = _user(db, org)
    fam = security.new_family_id()
    rt1 = security.new_refresh_token()
    _session(db, u, dev, rt1, fam)
    db.commit()

    # first refresh rotates rt1 -> rt2 (rt1 now revoked)
    r1 = client.post("/v1/auth/refresh", cookies={"govux_rt": rt1})
    assert r1.status_code == 200
    rt2 = r1.cookies.get("govux_rt")
    assert rt2 and rt2 != rt1

    # replaying the old rt1 is detected as reuse -> 401 and kills the family
    assert client.post("/v1/auth/refresh", cookies={"govux_rt": rt1}).status_code == 401
    # and the freshly-minted rt2 is now revoked too (whole family down)
    assert client.post("/v1/auth/refresh", cookies={"govux_rt": rt2}).status_code == 401
