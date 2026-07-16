import uuid
from app import models


def test_submit_requires_verified_domain(client, ctx, db):
    d = models.Domain(org_id=ctx["org"].id, url=f"unv{uuid.uuid4().hex[:6]}.gov.in",
                      tld="gov.in", verify_status="pending", created_by=ctx["user"].id)
    db.add(d); db.commit()
    r = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(d.id)})
    assert r.status_code == 403


def test_submit_returns_task_id(client, ctx, verified_domain):
    r = client.post("/v1/audits", headers=ctx["headers"],
                    json={"domain_id": str(verified_domain.id)})
    assert r.status_code == 202
    body = r.json()
    assert body["task_id"] and body["status"] == "queued"
    assert body["status_url"].endswith(body["task_id"])


def test_submit_is_idempotent(client, ctx, verified_domain):
    a = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)})
    b = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)})
    assert a.json()["task_id"] == b.json()["task_id"]   # no duplicate concurrent run


def test_status_and_report_lifecycle(client, ctx, verified_domain, db, monkeypatch):
    from app import worker
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None: {
        "url": url,
        "categories": {"accessibility": 40, "usability": 70, "gigw": 80, "design": 70,
                       "performance": 65, "responsiveness": 60, "content": 62, "trust": 90},
        "cwv": {"lcp_ms": 3800, "cls": 0.2},
        "findings": [{"category": "accessibility", "severity": "critical",
                      "guideline": "WCAG2.1.1", "title": "Keyboard", "effort": "medium"}],
    })
    sub = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)})
    task_id = sub.json()["task_id"]

    # report not ready before processing
    assert client.get(f"/v1/audits/{task_id}/report", headers=ctx["headers"]).status_code == 409

    worker.process(task_id, {"domain": verified_domain.url})

    st = client.get(f"/v1/audits/{task_id}", headers=ctx["headers"]).json()
    assert st["status"] == "completed"
    assert st["overall_score"] is not None
    assert st["guardrail_active"] is True          # a11y=40 triggers guard-rail

    rep = client.get(f"/v1/audits/{task_id}/report", headers=ctx["headers"]).json()
    assert len(rep["categories"]) == 8
    assert rep["band"] == "C"
    assert any(f["severity"] == "critical" for f in rep["findings"])


def test_unreachable_site_yields_insufficient_evidence_not_a_band(
        client, ctx, verified_domain, db, monkeypatch):
    """Coverage-confidence gate: a site the engine couldn't capture (home
    unreachable / zero pages analysed) must NOT be scored — no band, no false
    verdict. This is the umang.gov.in case: unreachable -> all-60 fillers."""
    from app import worker
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None: {
        "url": url,
        # fillers the engine emits when nothing loaded — must be ignored
        "categories": {"accessibility": 60, "usability": 60, "gigw": 60, "design": 70,
                       "performance": 60, "responsiveness": 60, "content": 60, "trust": 60},
        "cwv": {}, "findings": [], "pages": [], "pages_total": 0,
        "evidence": {"home_reachable": False, "pages_analysed": 0, "pages_total": 0},
    })
    sub = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)})
    tid = sub.json()["task_id"]
    worker.process(tid, {"domain": verified_domain.url})

    st = client.get(f"/v1/audits/{tid}", headers=ctx["headers"]).json()
    assert st["status"] == "insufficient_evidence"
    assert st["overall_score"] is None
    assert st["band"] is None
    # the report is not "ready" for an unscored audit
    assert client.get(f"/v1/audits/{tid}/report", headers=ctx["headers"]).status_code == 409


def test_history_and_compare(client, ctx, verified_domain, db, monkeypatch):
    from app import worker
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None: {
        "url": url, "categories": {k: 70 for k in
            ["accessibility", "usability", "gigw", "design", "performance", "responsiveness", "content", "trust"]},
        "cwv": {}, "findings": []})
    r1 = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)}).json()
    worker.process(r1["task_id"], {"domain": verified_domain.url})

    hist = client.get(f"/v1/domains/{verified_domain.id}/audits", headers=ctx["headers"])
    assert hist.status_code == 200 and len(hist.json()) >= 1

    cmp = client.get(f"/v1/domains/{verified_domain.id}/compare",
                     headers=ctx["headers"], params={"frm": r1["task_id"], "to": r1["task_id"]})
    assert cmp.status_code == 200
    assert cmp.json()["overall_delta"] == 0


def test_bulk_scan_enqueues(client, ctx, verified_domain):
    r = client.post("/v1/bulk-scans", headers=ctx["headers"],
                    json={"mode": "auto_discover", "scope": "all"})
    assert r.status_code == 202
    assert r.json()["enqueued"] >= 1


def test_status_missing_task(client, ctx):
    assert client.get(f"/v1/audits/{uuid.uuid4()}", headers=ctx["headers"]).status_code == 404


def test_worker_full_pipeline(client, ctx, verified_domain, db, monkeypatch):
    """Crawl pages + documents + field data + compliance verdict + remediation
    + webhook, all wired through worker.process (gaps G1,G3,G4,G5,G7)."""
    from app import worker
    from app.services import pdf_audit, crux, design_cv, ml_priority

    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None: {
        "url": url,
        "categories": {"accessibility": 80, "usability": 70, "gigw": 75, "design": 70,
                       "performance": 90, "responsiveness": 80, "content": 60, "trust": 85},
        "cwv": {"lcp_ms": 3000},
        "findings": [
            {"category": "accessibility", "severity": "critical", "guideline": "WCAG2.1.1",
             "title": "Keyboard trap", "effort": "medium"},
            {"category": "trust", "severity": "low", "guideline": "Security",
             "title": "Missing security header: CSP", "effort": "low"}],
        "pages": [{"url": url, "status": "analysed", "page_score": 70, "issue_count": 2},
                  {"url": url + "/services", "status": "analysed", "page_score": 80, "issue_count": 0}],
        "pages_total": 2,
        "documents": ["https://x.gov.in/form.pdf"],
    })
    # document fetch + parse (pypdf extraction stubbed; assess() runs for real)
    monkeypatch.setattr(worker, "fetch_bytes", lambda url: b"%PDF-1.4 fake")
    monkeypatch.setattr(pdf_audit, "extract_features", lambda data: {
        "tagged": False, "has_lang": False, "has_title": False, "pages": 2, "doc_type": "pdf"})
    # real-user field data present -> performance must be blended down
    monkeypatch.setattr(crux, "fetch_field_data",
                        lambda url: {"lcp_ms": 4200, "cls": 0.2, "field_score": 30.0})
    # cross-browser matrix
    monkeypatch.setattr(worker, "run_compat", lambda url: {"engines": [
        {"engine": "Chromium", "loaded": True, "status": 200, "jsErrors": 1, "consoleErrors": 54, "overflow": False, "brokenImgs": 7},
        {"engine": "Firefox", "loaded": True, "status": 200, "jsErrors": 1, "consoleErrors": 0, "overflow": False, "brokenImgs": 9},
        {"engine": "WebKit (Safari/iOS)", "loaded": False, "status": None, "jsErrors": 0, "consoleErrors": 0, "overflow": False, "brokenImgs": 0},
    ]})
    # deterministic CV design score replaces the engine's hardcoded 70
    monkeypatch.setattr(design_cv, "score_from_path", lambda p: 55.0)
    calls = []
    monkeypatch.setattr(worker, "post_webhook", lambda u, p: calls.append((u, p)))

    sub = client.post("/v1/audits", headers=ctx["headers"],
                      json={"domain_id": str(verified_domain.id),
                            "webhook_url": "https://ci.gov.in/hook"})
    tid = sub.json()["task_id"]
    worker.process(tid, {"domain": verified_domain.url, "scope": {"webhook_url": "https://ci.gov.in/hook"}})

    st = client.get(f"/v1/audits/{tid}", headers=ctx["headers"]).json()
    assert st["status"] == "completed"
    assert st["pages_total"] == 2 and st["pages_done"] == 2
    # automated run with a critical a11y failure -> legally non_compliant, separate from band
    assert st["compliance_status"] == "non_compliant"
    assert st["confidence"] == "automated_only"

    rep = client.get(f"/v1/audits/{tid}/report", headers=ctx["headers"]).json()
    assert rep["compliance"]["status"] == "non_compliant"
    assert rep["field_data"]["field_score"] == 30.0
    # performance blended: lab 90 + field 30 -> 60, not the raw 90
    perf = next(c["score"] for c in rep["categories"] if c["category"] == "performance")
    assert perf == 60.0
    assert len(rep["documents"]) == 1 and rep["documents"][0]["issues"] >= 1
    assert any(f["remediation"] for f in rep["findings"])
    # transparent contribution breakdown reconciles to the overall score
    assert abs(sum(c["contribution"] for c in rep["contributions"]) - rep["overall_score"]) < 0.1

    # remediation endpoint: prioritised, guidance attached
    rem = client.get(f"/v1/audits/{tid}/remediation", headers=ctx["headers"]).json()
    assert rem["items"] and rem["items"][0]["priority"] >= rem["items"][-1]["priority"]
    assert all("remediation" in it for it in rem["items"])

    # documents endpoint
    docs = client.get(f"/v1/audits/{tid}/documents", headers=ctx["headers"]).json()
    assert docs["documents"][0]["tagged"] is False

    # webhook fired once
    assert len(calls) == 1 and calls[0][0] == "https://ci.gov.in/hook"

    # cross-browser matrix persisted + surfaced, with a finding for the WebKit load failure
    assert len(rep["browsers"]) == 3
    assert any(b["engine"].startswith("WebKit") and b["loaded"] is False for b in rep["browsers"])
    assert any(f["guideline"] == "Cross-browser" for f in rep["findings"])

    # deterministic CV design score entered the numeric score (design 70 -> 55)
    assert next(c["score"] for c in rep["categories"] if c["category"] == "design") == 55.0

    # advisory XGBoost priority overlay appears on /remediation when a model is present
    model = ml_priority.bootstrap_train(n=500)
    monkeypatch.setattr(ml_priority, "load", lambda: model)
    rem2 = client.get(f"/v1/audits/{tid}/remediation", headers=ctx["headers"]).json()
    assert "ordering" in rem2 and all("ml_priority" in it for it in rem2["items"])


def test_worker_ml_advisory(client, ctx, verified_domain, db, monkeypatch):
    """The advisory anomaly model adds a finding + anomaly_score, out of the score path."""
    from app import worker
    from app.services import ml_anomaly
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None: {
        "url": url, "categories": {k: 70 for k in
            ["accessibility","usability","gigw","design","performance","responsiveness","content","trust"]},
        "cwv": {}, "findings": []})
    monkeypatch.setattr(worker, "run_compat", lambda url: {"engines": []})
    # a trained model is present and flags this audit as anomalous
    monkeypatch.setattr(ml_anomaly, "load", lambda: object())
    monkeypatch.setattr(ml_anomaly, "score_one", lambda m, f: {"is_anomaly": True, "score": -0.21})

    sub = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)})
    tid = sub.json()["task_id"]
    worker.process(tid, {"domain": verified_domain.url})

    rep = client.get(f"/v1/audits/{tid}/report", headers=ctx["headers"]).json()
    assert rep["anomaly_score"] == -0.21
    assert any(f["guideline"] == "ML-ADVISORY" for f in rep["findings"])
    # the advisory did NOT change the numeric score (all categories 70 -> deterministic)
    assert rep["overall_score"] == 70.0


def test_remediation_missing_task(client, ctx):
    assert client.get(f"/v1/audits/{uuid.uuid4()}/remediation",
                      headers=ctx["headers"]).status_code == 404


def test_remediation_ai_enrichment_opt_in(client, ctx, verified_domain, db, monkeypatch):
    """?enrich=1 adds advisory LLM guidance when enabled; deterministic guidance stays."""
    from app import worker
    from app.services import llm_advisor
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None: {
        "url": url, "categories": {k: 70 for k in
            ["accessibility", "usability", "gigw", "design", "performance", "responsiveness", "content", "trust"]},
        "cwv": {}, "findings": [{"category": "trust", "severity": "medium", "guideline": "Security",
                                 "title": "Missing security header: HSTS", "effort": "low"}]})
    r = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)}).json()
    worker.process(r["task_id"], {"domain": verified_domain.url})

    # default: no AI, deterministic remediation present
    base = client.get(f"/v1/audits/{r['task_id']}/remediation", headers=ctx["headers"]).json()
    assert base["ai_available"] is False
    assert base["items"] and base["items"][0].get("remediation")
    assert "remediation_ai" not in base["items"][0]

    # enable Advisory AI + inject a fake model, then opt in
    monkeypatch.setattr(llm_advisor, "is_enabled", lambda: True)
    monkeypatch.setattr(llm_advisor, "enrich", lambda f, b, h: "AI: enable HSTS on your web server")
    enr = client.get(f"/v1/audits/{r['task_id']}/remediation?enrich=1", headers=ctx["headers"]).json()
    assert enr["ai_available"] is True
    assert any(str(it.get("remediation_ai", "")).startswith("AI:") for it in enr["items"])


def test_list_audits_org_fenced(client, ctx, verified_domain, db, monkeypatch):
    """GET /v1/audits returns the org's audits; another org never sees them."""
    from app import worker, security
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None: {
        "url": url, "categories": {k: 70 for k in
            ["accessibility", "usability", "gigw", "design", "performance", "responsiveness", "content", "trust"]},
        "cwv": {}, "findings": []})
    r = client.post("/v1/audits", headers=ctx["headers"],
                    json={"domain_id": str(verified_domain.id)}).json()
    worker.process(r["task_id"], {"domain": verified_domain.url})

    lst = client.get("/v1/audits", headers=ctx["headers"])
    assert lst.status_code == 200
    row = next((a for a in lst.json() if a["task_id"] == r["task_id"]), None)
    assert row is not None
    assert row["domain"] == verified_domain.url and row["status"] == "completed"

    # a different organisation must not see it (same fence as the per-audit routes)
    org2 = models.Organisation(name="Other Dept", org_type="department")
    db.add(org2); db.flush()
    u2 = models.User(email=f"o.{uuid.uuid4().hex[:8]}@nic.in", org_id=org2.id,
                     display_name="Other", role="programme_admin")
    db.add(u2); db.flush()
    dev2 = models.Device(user_id=u2.id, device_pubkey="pk2")
    db.add(dev2); db.commit()
    tok2 = security.issue_access_token(str(u2.id), u2.role, str(dev2.id))
    other = client.get("/v1/audits", headers={"Authorization": f"Bearer {tok2}"})
    assert other.status_code == 200
    assert r["task_id"] not in [a["task_id"] for a in other.json()]
