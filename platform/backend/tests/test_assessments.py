"""External-assessment ledger (G9/G11/G13) + STQC evidence pack (G12)."""
import io
import uuid
import zipfile

from app import models
from app import security


def _user(db, org, role):
    u = models.User(email=f"{role}.{uuid.uuid4().hex[:8]}@nic.in", org_id=org.id,
                    display_name=role, role=role)
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk")
    db.add(dev); db.commit()
    token = security.issue_access_token(str(u.id), u.role, str(dev.id))
    return {"Authorization": f"Bearer {token}"}


def test_create_requires_assessor_role(client, ctx, db):
    owner_headers = _user(db, ctx["org"], "owner")
    r = client.post("/v1/assessments", headers=owner_headers,
                    json={"kind": "vapt", "title": "Annual VAPT"})
    assert r.status_code == 403


def test_create_and_list(client, ctx, verified_domain):
    r = client.post("/v1/assessments", headers=ctx["headers"], json={
        "kind": "lived_experience_panel", "title": "Panel review of citizen portal",
        "domain_id": str(verified_domain.id), "agency": "NAB panel",
        "assessed_on": "2026-06-15", "outcome": "partial", "report_ref": "PANEL/26/3"})
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "lived_experience_panel" and body["domain"] == verified_domain.url

    # org-wide record (no domain)
    r2 = client.post("/v1/assessments", headers=ctx["headers"],
                     json={"kind": "vapt", "title": "Annual VAPT", "outcome": "passed"})
    assert r2.status_code == 201 and r2.json()["domain"] is None

    ls = client.get("/v1/assessments", headers=ctx["headers"]).json()["assessments"]
    assert {a["kind"] for a in ls} >= {"lived_experience_panel", "vapt"}
    only_vapt = client.get("/v1/assessments?kind=vapt", headers=ctx["headers"]).json()["assessments"]
    assert only_vapt and all(a["kind"] == "vapt" for a in only_vapt)
    assert client.get("/v1/assessments?kind=nonsense", headers=ctx["headers"]).status_code == 422


def test_org_fencing(client, ctx, db, verified_domain):
    other_org = models.Organisation(name="Other Dept", org_type="department")
    db.add(other_org); db.commit()
    other_admin = _user(db, other_org, "programme_admin")

    client.post("/v1/assessments", headers=ctx["headers"],
                json={"kind": "stqc_certification", "title": "STQC cert application"})
    ls = client.get("/v1/assessments", headers=other_admin).json()["assessments"]
    assert all(a["kind"] != "stqc_certification" for a in ls)   # can't see other org's rows

    # cross-org domain id is a 404 (existence never revealed)
    r = client.post("/v1/assessments", headers=other_admin,
                    json={"kind": "vapt", "title": "Sneaky",
                          "domain_id": str(verified_domain.id)})
    assert r.status_code == 404


def test_evidence_pack(client, ctx, verified_domain, db, monkeypatch):
    from app import worker
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None: {
        "url": url,
        "categories": {"accessibility": 95, "usability": 85, "gigw": 90, "design": 80,
                       "performance": 88, "responsiveness": 90, "content": 82, "trust": 91},
        "cwv": {"lcp_ms": 1900, "cls": 0.05},
        "findings": [{"category": "content", "severity": "low",
                      "guideline": "GIGW-2.1", "title": "Plain language", "effort": "low"}],
    })
    client.post("/v1/assessments", headers=ctx["headers"], json={
        "kind": "vapt", "title": "Annual VAPT", "domain_id": str(verified_domain.id),
        "agency": "CERT-In firm", "outcome": "passed", "report_ref": "VAPT/2026/17"})

    task_id = client.post("/v1/audits", headers=ctx["headers"],
                          json={"domain_id": str(verified_domain.id)}).json()["task_id"]
    # not ready before the worker completes the audit
    assert client.get(f"/v1/audits/{task_id}/evidence", headers=ctx["headers"]).status_code == 409
    worker.process(task_id, {"domain": verified_domain.url})

    r = client.get(f"/v1/audits/{task_id}/evidence", headers=ctx["headers"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert sorted(z.namelist()) == ["compliance-statement.md", "external-assessments.csv",
                                    "findings.csv", "methodology.md", "report.json",
                                    "summary.pdf"]
    stmt = z.read("compliance-statement.md").decode()
    # automated-only cap stated, ledger row included, verdict present
    assert "partially_compliant" in stmt and "Annual VAPT" in stmt
    assert "Expert-reviewed: no" in stmt
    assert z.read("summary.pdf")[:4] == b"%PDF"
    assert b"VAPT/2026/17" in z.read("external-assessments.csv")
