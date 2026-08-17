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


def test_requested_depth_reaches_the_engine(client, ctx, verified_domain, monkeypatch):
    """worker.py used to drop the caller's depth entirely and always run the
    engine's own 25-page default, making the free-tier quota and the
    scan-request approval flow decorative. It must reach run_engine()."""
    from app import worker
    seen = {}

    def _capture(url, screenshot_path=None, depth=None):
        seen["depth"] = depth
        return {"url": url,
                "categories": {"accessibility": 80, "usability": 70, "gigw": 75, "design": 70,
                               "performance": 65, "responsiveness": 60, "content": 62, "trust": 90},
                "cwv": {"lcp_ms": 2000, "cls": 0.05}, "findings": []}
    monkeypatch.setattr(worker, "run_engine", _capture)

    sub = client.post("/v1/audits", headers=ctx["headers"],
                      json={"domain_id": str(verified_domain.id), "depth": 3})
    task_id = sub.json()["task_id"]
    worker.process(task_id, {"domain": verified_domain.url, "scope": {"depth": 3}})

    assert seen["depth"] == 3


def test_depth_below_one_is_rejected(client, ctx, verified_domain):
    r = client.post("/v1/audits", headers=ctx["headers"],
                    json={"domain_id": str(verified_domain.id), "depth": 0})
    assert r.status_code == 422


def test_status_and_report_lifecycle(client, ctx, verified_domain, db, monkeypatch):
    from app import worker
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
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
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
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
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
        "url": url, "categories": {k: 70 for k in
            ["accessibility", "usability", "gigw", "design", "performance", "responsiveness", "content", "trust"]},
        "cwv": {}, "findings": []})
    r1 = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)}).json()
    worker.process(r1["task_id"], {"domain": verified_domain.url})

    hist = client.get(f"/v1/domains/{verified_domain.id}/audits", headers=ctx["headers"])
    assert hist.status_code == 200 and len(hist.json()) >= 1

    # explicitly comparing an audit against itself -> zero delta, no new/resolved
    cmp = client.get(f"/v1/audits/{r1['task_id']}/compare",
                     headers=ctx["headers"], params={"against": r1["task_id"]})
    assert cmp.status_code == 200
    body = cmp.json()
    assert body["has_baseline"] is True
    assert body["overall_delta"] == 0
    assert body["new_issues"] == [] and body["resolved_issues"] == []


def test_compare_with_no_prior_audit_reports_no_baseline(client, ctx, verified_domain, monkeypatch):
    from app import worker
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
        "url": url, "categories": {k: 70 for k in
            ["accessibility", "usability", "gigw", "design", "performance", "responsiveness", "content", "trust"]},
        "cwv": {}, "findings": []})
    r1 = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)}).json()
    worker.process(r1["task_id"], {"domain": verified_domain.url})

    # no `against` -> auto-picks the prior completed audit; there is none yet
    r = client.get(f"/v1/audits/{r1['task_id']}/compare", headers=ctx["headers"])
    assert r.status_code == 200
    assert r.json() == {"has_baseline": False,
                        "message": "No earlier completed audit for this domain yet — "
                                   "run another audit later to see a comparison."}


def test_compare_defaults_to_the_most_recent_prior_audit_with_real_diffs(
        client, ctx, verified_domain, monkeypatch):
    """The real feature this screen replaced fake data with: score delta, new
    vs resolved findings by guideline, and per-page score deltas matched by URL
    — auto-selecting the domain's previous completed audit with no `against`."""
    from app import worker

    def engine_v1(url, screenshot_path=None, depth=None):
        return {"url": url, "categories": {k: 60 for k in
                    ["accessibility", "usability", "gigw", "design", "performance", "responsiveness", "content", "trust"]},
                "cwv": {}, "findings": [
                    {"category": "accessibility", "severity": "high", "guideline": "WCAG1.1.1",
                     "title": "Missing alt text", "effort": "low"},
                    {"category": "accessibility", "severity": "medium", "guideline": "WCAG1.4.3",
                     "title": "Low contrast", "effort": "medium"}],
                "pages": [{"url": url, "status": "analysed", "page_score": 55},
                          {"url": url + "apply", "status": "analysed", "page_score": 40}],
                "pages_total": 2, "evidence": {"home_reachable": True, "pages_analysed": 2, "pages_total": 2}}

    def engine_v2(url, screenshot_path=None, depth=None):
        return {"url": url, "categories": {k: 80 for k in
                    ["accessibility", "usability", "gigw", "design", "performance", "responsiveness", "content", "trust"]},
                "cwv": {}, "findings": [
                    {"category": "accessibility", "severity": "medium", "guideline": "WCAG1.4.3",
                     "title": "Low contrast", "effort": "medium"},
                    {"category": "accessibility", "severity": "low", "guideline": "WCAG2.4.4",
                     "title": "Ambiguous link text", "effort": "low"}],
                "pages": [{"url": url, "status": "analysed", "page_score": 75},
                          {"url": url + "new-page", "status": "analysed", "page_score": 90}],
                "pages_total": 2, "evidence": {"home_reachable": True, "pages_analysed": 2, "pages_total": 2}}

    monkeypatch.setattr(worker, "run_engine", engine_v1)
    r1 = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)}).json()
    worker.process(r1["task_id"], {"domain": verified_domain.url})

    monkeypatch.setattr(worker, "run_engine", engine_v2)
    r2 = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)}).json()
    worker.process(r2["task_id"], {"domain": verified_domain.url})

    r = client.get(f"/v1/audits/{r2['task_id']}/compare", headers=ctx["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["has_baseline"] is True
    assert body["from_audit"]["task_id"] == r1["task_id"]
    assert body["to_audit"]["task_id"] == r2["task_id"]

    # ml_anomaly may legitimately add its own "ML-ADVISORY" finding to either
    # run depending on the trained model's baseline — real behaviour, not
    # something this test controls, so only assert on the WCAG findings.
    new_ids = {i["guideline_id"] for i in body["new_issues"] if i["guideline_id"].startswith("WCAG")}
    resolved_ids = {i["guideline_id"] for i in body["resolved_issues"] if i["guideline_id"].startswith("WCAG")}
    assert new_ids == {"WCAG2.4.4"}          # only in the newer run
    assert resolved_ids == {"WCAG1.1.1"}     # only in the older run
    # WCAG1.4.3 persisted in both -> neither new nor resolved
    assert "WCAG1.4.3" not in new_ids and "WCAG1.4.3" not in resolved_ids

    by_url = {p["url"]: p for p in body["pages"]}
    home = by_url[verified_domain.url]
    assert home["score"] == 75 and home["delta"] == 20 and home["new_page"] is False
    assert by_url[verified_domain.url + "new-page"]["new_page"] is True
    assert by_url[verified_domain.url + "apply"]["status"] == "not_recrawled"


def test_bulk_scan_enqueues(client, ctx, verified_domain):
    r = client.post("/v1/bulk-scans", headers=ctx["headers"],
                    json={"mode": "auto_discover", "scope": "all"})
    assert r.status_code == 202
    assert r.json()["enqueued"] >= 1


def test_bulk_scan_status_reports_real_progress(client, ctx, verified_domain, db):
    """The bulk-scan screen used to render a hardcoded '38% · 517 / 1,360 done'
    bar because no endpoint like this existed. Progress is aggregated from the
    batch's own audits — no new state to keep in sync."""
    from app import models as m
    batch = client.post("/v1/bulk-scans", headers=ctx["headers"],
                        json={"mode": "auto_discover", "scope": "all"}).json()["batch_id"]

    r = client.get(f"/v1/bulk-scans/{batch}", headers=ctx["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert body["done"] == 0 and body["percent"] == 0
    assert body["queued"] == body["total"] and body["finished"] is False
    assert body["finished_at"] is None          # nothing has finished yet

    # drive the batch to a mixed terminal state
    audits = db.query(m.Audit).filter(m.Audit.batch_id == batch).all()
    audits[0].status = "completed"
    for a in audits[1:]:
        a.status = "failed"
    db.commit()

    body = client.get(f"/v1/bulk-scans/{batch}", headers=ctx["headers"]).json()
    assert body["done"] == body["total"] and body["percent"] == 100
    assert body["finished"] is True
    # finished-without-a-score is counted apart from scored, and NOT called a
    # failure: `insufficient_evidence` is the coverage gate correctly refusing
    # to band a site it could not capture
    assert body["scored"] == 1
    assert body["no_result"] == body["total"] - 1
    assert body["by_status"]["completed"] == 1


def test_bulk_scan_status_is_steward_only_and_404s_on_nonsense(client, ctx, db):
    from app import models as m, security
    org = m.Organisation(name=f"BS {uuid.uuid4().hex[:6]}", org_type="department")
    db.add(org); db.flush()
    u = m.User(email=f"bs.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="owner")
    db.add(u); db.flush()
    dev = m.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    h = {"Authorization": f"Bearer {security.issue_access_token(str(u.id), 'owner', str(dev.id))}"}

    assert client.get(f"/v1/bulk-scans/{uuid.uuid4()}", headers=h).status_code == 403
    # unknown batch, and a non-UUID, both 404 rather than 500
    assert client.get(f"/v1/bulk-scans/{uuid.uuid4()}", headers=ctx["headers"]).status_code == 404
    assert client.get("/v1/bulk-scans/not-a-uuid", headers=ctx["headers"]).status_code == 404


def test_status_missing_task(client, ctx):
    assert client.get(f"/v1/audits/{uuid.uuid4()}", headers=ctx["headers"]).status_code == 404


def test_worker_full_pipeline(client, ctx, verified_domain, db, monkeypatch):
    """Crawl pages + documents + field data + compliance verdict + remediation
    + webhook, all wired through worker.process (gaps G1,G3,G4,G5,G7)."""
    from app import worker
    from app.services import pdf_audit, crux, design_cv, ml_priority

    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
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
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
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


def test_integrity_flags_gaming_and_caps_verdict(client, ctx, verified_domain, db, monkeypatch):
    """An engine overlay finding -> audit.integrity.flagged and a capped verdict."""
    from app import worker
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
        "url": url, "categories": {k: 92 for k in
            ["accessibility", "usability", "gigw", "design", "performance", "responsiveness", "content", "trust"]},
        "cwv": {}, "findings": [{"category": "accessibility", "severity": "high",
                                 "guideline": "Integrity-overlay", "title": "Accessibility overlay detected"}]})
    r = client.post("/v1/audits", headers=ctx["headers"], json={"domain_id": str(verified_domain.id)}).json()
    worker.process(r["task_id"], {"domain": verified_domain.url})
    rep = client.get(f"/v1/audits/{r['task_id']}/report", headers=ctx["headers"]).json()
    assert rep["integrity"]["flagged"] is True
    assert any(t["key"] == "accessibility-overlay" for t in rep["integrity"]["techniques"])
    assert rep["compliance"]["status"] != "compliant"     # gaming caps the verdict


def test_remediation_ai_enrichment_opt_in(client, ctx, verified_domain, db, monkeypatch):
    """?enrich=1 adds advisory LLM guidance when enabled; deterministic guidance stays."""
    from app import worker
    from app.services import llm_advisor
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
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
    monkeypatch.setattr(worker, "run_engine", lambda url, screenshot_path=None, depth=None: {
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


# ---------- guided manual review checklist ----------------------------------
# The review screen used to hold three prompts in the frontend and threw the
# answers away. These cover the two things that made it worthless as evidence:
# the checklist has to come from the library, and decisions have to persist.

def _guideline(db, gid="UX4G-TEST-001", automation="manual", enforcement="Foundational"):
    from app import models
    g = db.get(models.Guideline, gid)
    if g is None:
        g = models.Guideline(id=gid, family="UX4G", category="Task Orientation",
                             title="Test guideline")
        db.add(g)
    g.automation = automation
    g.enforcement_level = enforcement
    db.commit()
    return g


def _completed_audit(db, ctx, verified_domain):
    from app import models
    a = models.Audit(domain_id=verified_domain.id, engine_version="test",
                     requested_by=ctx["user"].id, status="completed")
    db.add(a); db.commit()
    return a


def test_checklist_excludes_what_the_engine_already_decides(client, ctx, verified_domain, db):
    a = _completed_audit(db, ctx, verified_domain)
    _guideline(db, "UX4G-MANUAL-1", automation="manual")
    _guideline(db, "UX4G-AUTO-1", automation="automated")

    ids = {i["guideline_id"] for i in
           client.get(f"/v1/audits/{a.id}/review-checklist", headers=ctx["headers"]).json()["items"]}
    assert "UX4G-MANUAL-1" in ids
    # re-asking a human to confirm an automated result is how checklists become
    # rubber stamps — automated guidelines must never appear
    assert "UX4G-AUTO-1" not in ids


def test_a_decision_is_persisted_and_returned_with_the_checklist(client, ctx, verified_domain, db):
    a = _completed_audit(db, ctx, verified_domain)
    _guideline(db, "UX4G-PERSIST-1")

    r = client.put(f"/v1/audits/{a.id}/review-checklist/UX4G-PERSIST-1",
                   headers=ctx["headers"], json={"decision": "fail", "note": "no mission stated"})
    assert r.status_code == 200

    body = client.get(f"/v1/audits/{a.id}/review-checklist", headers=ctx["headers"]).json()
    item = next(i for i in body["items"] if i["guideline_id"] == "UX4G-PERSIST-1")
    assert item["decision"] == "fail" and item["note"] == "no mission stated"
    assert body["failed"] >= 1


def test_re_deciding_updates_in_place(client, ctx, verified_domain, db):
    from app import models
    a = _completed_audit(db, ctx, verified_domain)
    _guideline(db, "UX4G-REDECIDE-1")
    for d in ("fail", "pass"):
        client.put(f"/v1/audits/{a.id}/review-checklist/UX4G-REDECIDE-1",
                   headers=ctx["headers"], json={"decision": d})
    rows = (db.query(models.ReviewItem)
              .filter(models.ReviewItem.audit_id == a.id,
                      models.ReviewItem.guideline_id == "UX4G-REDECIDE-1").all())
    assert len(rows) == 1 and rows[0].decision == "pass"


def test_an_unknown_decision_is_rejected(client, ctx, verified_domain, db):
    a = _completed_audit(db, ctx, verified_domain)
    _guideline(db, "UX4G-BADDEC-1")
    r = client.put(f"/v1/audits/{a.id}/review-checklist/UX4G-BADDEC-1",
                   headers=ctx["headers"], json={"decision": "maybe"})
    assert r.status_code == 422


def test_recording_a_decision_requires_a_reviewer_role(client, ctx, verified_domain, db):
    from app import models, security
    a = _completed_audit(db, ctx, verified_domain)
    _guideline(db, "UX4G-ROLE-1")
    u = models.User(email=f"contrib.rev.{uuid.uuid4().hex[:6]}@nic.in",
                    org_id=ctx["org"].id, role="contributor")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    hdrs = {"Authorization": f"Bearer {security.issue_access_token(str(u.id), 'contributor', str(dev.id))}"}

    r = client.put(f"/v1/audits/{a.id}/review-checklist/UX4G-ROLE-1",
                   headers=hdrs, json={"decision": "pass"})
    assert r.status_code == 403
    # ...but they may still read the checklist to see what the assessor will cover
    assert client.get(f"/v1/audits/{a.id}/review-checklist", headers=hdrs).status_code == 200


def test_another_orgs_audit_checklist_is_not_reachable(client, ctx, verified_domain, db):
    from app import models, security
    a = _completed_audit(db, ctx, verified_domain)
    org = models.Organisation(name=f"Other {uuid.uuid4().hex[:6]}", org_type="department")
    db.add(org); db.flush()
    u = models.User(email=f"out.rev.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="assessor")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    hdrs = {"Authorization": f"Bearer {security.issue_access_token(str(u.id), 'assessor', str(dev.id))}"}

    assert client.get(f"/v1/audits/{a.id}/review-checklist", headers=hdrs).status_code == 404
    _guideline(db, "UX4G-FENCE-1")
    assert client.put(f"/v1/audits/{a.id}/review-checklist/UX4G-FENCE-1",
                      headers=hdrs, json={"decision": "pass"}).status_code == 404


def test_checklist_returns_facet_counts_and_a_standard_filter(client, ctx, verified_domain, db):
    from app import models
    a = _completed_audit(db, ctx, verified_domain)
    g1 = _guideline(db, "UX4G-STD-WCAG", automation="manual")
    g1.category, g1.reference = "Accessibility", "WCAG 2.2 SC 1.4.3"
    g2 = _guideline(db, "UX4G-STD-GIGW", automation="manual")
    g2.category, g2.reference = "Trust & Credibility", "GIGW 3.0 – Section 5.3.2"
    db.commit()

    body = client.get(f"/v1/audits/{a.id}/review-checklist", headers=ctx["headers"]).json()
    # counts are over everything reviewable, not just the current page — the UI
    # shows them on the filter options before one is chosen
    cats = {c["name"]: c["count"] for c in body["categories"]}
    assert cats.get("Accessibility", 0) >= 1
    stds = {s["name"]: s["count"] for s in body["standards"]}
    assert stds.get("WCAG", 0) >= 1 and stds.get("GIGW", 0) >= 1
    assert body["reviewable_total"] >= 2

    only_wcag = client.get(f"/v1/audits/{a.id}/review-checklist?standard=WCAG",
                           headers=ctx["headers"]).json()
    ids = {i["guideline_id"] for i in only_wcag["items"]}
    assert "UX4G-STD-WCAG" in ids and "UX4G-STD-GIGW" not in ids


def test_compliance_rating_ignores_not_applicable(client, ctx, verified_domain, db):
    a = _completed_audit(db, ctx, verified_domain)
    for gid, decision in (("UX4G-R1", "pass"), ("UX4G-R2", "pass"),
                          ("UX4G-R3", "fail"), ("UX4G-R4", "not_applicable")):
        _guideline(db, gid)
        client.put(f"/v1/audits/{a.id}/review-checklist/{gid}",
                   headers=ctx["headers"], json={"decision": decision})

    body = client.get(f"/v1/audits/{a.id}/review-checklist", headers=ctx["headers"]).json()
    # 2 met of 3 assessed = 66.7%; the N/A is answered but not assessable, so
    # counting it either way would misstate the rating
    assert body["decided"] >= 4
    assert body["passed"] >= 2 and body["failed"] >= 1
    assert body["rating"] == round(100 * body["passed"] / (body["passed"] + body["failed"]), 1)


def test_rating_is_none_before_anything_is_answered(client, ctx, verified_domain, db):
    a = _completed_audit(db, ctx, verified_domain)
    _guideline(db, "UX4G-R-NONE")
    body = client.get(f"/v1/audits/{a.id}/review-checklist", headers=ctx["headers"]).json()
    # not 0 and not 100 — an unanswered checklist has no rating to report
    assert body["rating"] is None


def test_the_checklist_is_scoped_to_the_platform_being_reviewed(client, ctx, verified_domain, db):
    # The UX4G self-check renders one platform at a time — its published Website
    # view is 354 of the mastersheet's 412, the rest being app-only patterns.
    # Without this a reviewer auditing a site is asked about avatar menus.
    from app import models
    a = _completed_audit(db, ctx, verified_domain)
    web = _guideline(db, "UX4G-PLAT-WEB"); web.applies_website, web.applies_app = True, False
    app = _guideline(db, "UX4G-PLAT-APP"); app.applies_website, app.applies_app = False, True
    both = _guideline(db, "UX4G-PLAT-BOTH"); both.applies_website, both.applies_app = True, True
    db.commit()

    def ids(qs=""):
        r = client.get(f"/v1/audits/{a.id}/review-checklist{qs}", headers=ctx["headers"])
        return {i["guideline_id"] for i in r.json()["items"]}

    site = ids()                       # website is the default — this audits websites
    assert "UX4G-PLAT-WEB" in site and "UX4G-PLAT-BOTH" in site
    assert "UX4G-PLAT-APP" not in site

    mobile = ids("?platform=app")
    assert "UX4G-PLAT-APP" in mobile and "UX4G-PLAT-BOTH" in mobile
    assert "UX4G-PLAT-WEB" not in mobile


def test_a_guideline_with_unknown_platform_is_never_hidden(client, ctx, verified_domain, db):
    # Defaults are TRUE both ways on purpose: a guideline wrongly shown costs a
    # reviewer a moment, one wrongly hidden is a compliance item silently
    # dropped from an audit.
    from app import models
    a = _completed_audit(db, ctx, verified_domain)
    g = models.Guideline(id="UX4G-PLAT-UNSET", family="UX4G", category="Task Orientation",
                         title="Unclassified", automation="manual")
    db.add(g); db.commit()
    db.refresh(g)
    assert g.applies_website is True and g.applies_app is True

    for qs in ("", "?platform=app"):
        r = client.get(f"/v1/audits/{a.id}/review-checklist{qs}", headers=ctx["headers"])
        assert "UX4G-PLAT-UNSET" in {i["guideline_id"] for i in r.json()["items"]}
