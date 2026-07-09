import uuid
from app import models


def _completed_audit(db, domain, score, band="B", guardrail=False, compliance="partially_compliant"):
    a = models.Audit(domain_id=domain.id, engine_version="test", status="completed",
                     overall_score=score, band=band, guardrail_active=guardrail,
                     compliance_status=compliance)
    db.add(a); db.commit()
    return a


def test_ci_gate_passes_above_threshold(client, ctx, verified_domain, db):
    _completed_audit(db, verified_domain, 85)
    r = client.get("/v1/ci/gate", headers=ctx["headers"],
                   params={"domain_id": str(verified_domain.id), "min_score": 70})
    assert r.status_code == 200 and r.json()["passed"] is True


def test_ci_gate_fails_below_threshold(client, ctx, verified_domain, db):
    _completed_audit(db, verified_domain, 55)
    r = client.get("/v1/ci/gate", headers=ctx["headers"],
                   params={"domain_id": str(verified_domain.id), "min_score": 70})
    body = r.json()
    assert body["passed"] is False and body["reasons"]


def test_ci_gate_requires_compliant(client, ctx, verified_domain, db):
    _completed_audit(db, verified_domain, 95, band="A", compliance="partially_compliant")
    r = client.get("/v1/ci/gate", headers=ctx["headers"],
                   params={"domain_id": str(verified_domain.id), "min_score": 70,
                           "require_compliant": True})
    assert r.json()["passed"] is False


def test_ci_gate_guardrail_blocks(client, ctx, verified_domain, db):
    _completed_audit(db, verified_domain, 88, guardrail=True)
    r = client.get("/v1/ci/gate", headers=ctx["headers"],
                   params={"domain_id": str(verified_domain.id), "min_score": 70})
    assert r.json()["passed"] is False


def test_ci_gate_no_audit(client, ctx, verified_domain):
    r = client.get("/v1/ci/gate", headers=ctx["headers"],
                   params={"domain_id": str(verified_domain.id)})
    assert r.status_code == 404


def test_ci_gate_missing_domain(client, ctx):
    r = client.get("/v1/ci/gate", headers=ctx["headers"],
                   params={"domain_id": str(uuid.uuid4())})
    assert r.status_code == 404
