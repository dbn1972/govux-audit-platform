"""Audit worker — consumes Redis Streams and runs the real audit engine.

Drives an audit through its states, invokes the Node runner (Playwright +
Lighthouse + axe-core + GIGW + responsiveness + multilingual + crawl), blends
CrUX field data, maps the result through the deterministic scoring engine,
derives the separate legal compliance verdict, attaches advisory remediation,
persists per-page and per-document coverage, and (for CI) fires a webhook.
"""
import json
import os
import subprocess
from datetime import datetime, timezone

from .database import SessionLocal
from .config import settings
from . import models
from sqlalchemy import desc
from .services import queue, cache
from .services.scoring import compute_score, compliance_verdict, CATEGORY_WEIGHTS
from .services import crux, remediation, pdf_audit, ml_anomaly, design_cv, integrity, settings_store

ENGINE = os.path.join(os.path.dirname(__file__), "..", "audit_engine", "runner.js")
COMPAT = os.path.join(os.path.dirname(__file__), "..", "audit_engine", "compat.js")


def run_engine(domain_url: str, screenshot_path: str | None = None,
               depth: int | None = None) -> dict:
    """Invoke the Node audit runner and return its JSON result."""
    payload = {"url": domain_url}
    if screenshot_path:
        payload["screenshotPath"] = screenshot_path
    if depth is not None:
        payload["depth"] = depth
    proc = subprocess.run(
        ["node", ENGINE, json.dumps(payload)],
        capture_output=True, text=True, timeout=600,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-500:] or "engine failed")
    return json.loads(proc.stdout)


def run_compat(domain_url: str) -> dict:
    """Run the cross-browser matrix (Chromium/Firefox/WebKit) — JSON on stdout."""
    proc = subprocess.run(
        ["node", COMPAT, domain_url],
        capture_output=True, text=True, timeout=420,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-300:] or "compat failed")
    return json.loads(proc.stdout)


def _cross_browser(db, audit, domain_url: str) -> list[dict]:
    """Run the matrix, persist per-engine results, return cross-browser findings."""
    findings: list[dict] = []
    try:
        compat = run_compat(domain_url)
    except Exception as exc:
        print("compat error:", exc)
        return findings
    for e in compat.get("engines", []):
        db.add(models.AuditBrowser(
            audit_id=audit.id, engine=e.get("engine", ""), loaded=e.get("loaded"),
            status=e.get("status"), js_errors=e.get("jsErrors"),
            console_errors=e.get("consoleErrors"), overflow=e.get("overflow"),
            broken_images=e.get("brokenImgs")))
        eng = e.get("engine", "a browser")
        if e.get("loaded") is False:
            findings.append({"category": "responsiveness", "severity": "critical",
                "guideline": "Cross-browser", "title": f"Site does not load in {eng}", "effort": "high"})
        elif e.get("overflow"):
            findings.append({"category": "responsiveness", "severity": "high",
                "guideline": "Cross-browser", "title": f"Horizontal overflow in {eng}", "effort": "medium"})
        elif (e.get("brokenImgs") or 0) > 0:
            findings.append({"category": "responsiveness", "severity": "low",
                "guideline": "Cross-browser", "title": f"{e['brokenImgs']} images fail to load in {eng}", "effort": "low"})
    return findings


def fetch_bytes(url: str) -> bytes:  # pragma: no cover - network; monkeypatched in tests
    # SSRF-guarded: validates every redirect hop, blocks internal/loopback/reserved
    # resolutions, and caps size. Engine-discovered doc URLs are attacker-influenced.
    from .services import url_validate
    return url_validate.guarded_get(url)


def post_webhook(url: str, payload: dict) -> None:  # pragma: no cover - network
    import httpx
    httpx.post(url, json=payload, timeout=settings.webhook_timeout_seconds)


_PAGE_STATES = {"discovered", "analysed", "timed_out", "skipped", "error"}


def _persist_pages(db, audit, pages: list[dict]) -> int:
    n = 0
    for p in pages:
        st = p.get("status", "analysed")
        db.add(models.AuditPage(
            audit_id=audit.id, url=p.get("url", ""),
            status=st if st in _PAGE_STATES else "analysed",
            device=p.get("device"), lcp_ms=p.get("lcp_ms"), inp_ms=p.get("inp_ms"),
            cls=p.get("cls"), page_score=p.get("page_score"),
            issue_count=p.get("issue_count", 0),
            crawled_at=datetime.now(timezone.utc)))
        n += 1
    return n


def _audit_documents(db, audit, doc_urls: list[str]) -> list[dict]:
    """Fetch + accessibility-check discovered documents (gap G3)."""
    findings: list[dict] = []
    for url in doc_urls[: settings.max_documents_per_audit]:
        try:
            data = fetch_bytes(url)
            res = pdf_audit.audit_pdf_bytes(url, data)
        except Exception:
            continue
        row = res.as_row()
        db.add(models.AuditDocument(audit_id=audit.id, **row))
        findings.extend(res.findings)
    return findings


def process(task_id: str, payload: dict):
    db = SessionLocal()
    try:
        audit = db.get(models.Audit, task_id)
        if not audit:
            return
        domain = db.get(models.Domain, audit.domain_id)

        audit.status = "crawling"
        audit.started_at = datetime.now(timezone.utc)
        db.commit()
        queue.set_status(task_id, "crawling")

        # --- run the deterministic engine (real checks) ---
        shot = f"/tmp/govux_shot_{task_id}.jpg"
        result = run_engine(payload.get("domain") or domain.url, screenshot_path=shot)
        audit.status = "analyzing"; db.commit(); queue.set_status(task_id, "analyzing")

        categories = dict(result["categories"])

        # record crawl coverage (sitemap size vs pages audited) for honest reporting
        if result.get("coverage"):
            audit.scope = {**(audit.scope or {}), "coverage": result["coverage"]}

        # --- coverage-confidence gate (never score a site we couldn't capture) ---
        # If the home page never loaded (timeout / WAF / geo-block) or no page was
        # analysed, the engine's category values are fillers, not evidence. Emitting
        # a GovUX band from them produces a false verdict (the umang.gov.in case:
        # unreachable -> all-60 fillers -> a bogus "Band D"). Refuse: mark the audit
        # `insufficient_evidence` with no band, and stop before scoring.
        ev = result.get("evidence") or {}
        if not ev.get("home_reachable", True) or ev.get("pages_analysed", 1) == 0:
            audit.status = "insufficient_evidence"
            audit.overall_score = None
            audit.band = None
            audit.compliance_status = "not_assessed"
            audit.method = "automated"
            audit.pages_total = result.get("pages_total") or 0
            audit.pages_done = 0
            db.add(models.Finding(
                audit_id=audit.id, category="trust", severity="high",
                guideline_id="Evidence",
                title=("Home page could not be captured — the site was unreachable from "
                       "the audit network (timeout / WAF / geo-block). No GovUX score is "
                       "issued without real evidence."),
                remediation=("Confirm the site is reachable and allowlists the audit "
                             "egress IPs, then re-run the audit."),
                confidence="automated"))
            audit.finished_at = datetime.now(timezone.utc)
            db.commit()
            queue.set_status(task_id, "insufficient_evidence")
            os.path.exists(shot) and os.remove(shot)
            return

        # --- deterministic CV design score (replaces the hardcoded design: 70) ---
        try:
            cv = design_cv.score_from_path(shot)
            if cv is not None:
                categories["design"] = cv
            os.path.exists(shot) and os.remove(shot)
        except Exception as exc:
            print("design-cv error:", exc)

        # --- blend CrUX field data into performance (gap G4) ---
        field = crux.fetch_field_data(payload.get("domain") or domain.url)
        if field:
            categories["performance"] = crux.blend(categories.get("performance", 0.0), field)
            audit.field_data = field

        # --- score (deterministic UX band) ---
        audit.status = "scoring"; db.commit(); queue.set_status(task_id, "scoring")
        score = compute_score(categories)

        for cat, sc in score.categories.items():
            db.merge(models.AuditScore(audit_id=audit.id, category=cat,
                                       weight=CATEGORY_WEIGHTS[cat], score=sc))

        # --- cross-browser matrix (Chromium/Firefox/WebKit) — permanent capability ---
        browser_findings = _cross_browser(db, audit, payload.get("domain") or domain.url)

        # --- findings (+ advisory remediation, gap G5) ---
        engine_findings = result.get("findings", []) + browser_findings
        # documents discovered by the engine are accessibility-checked here (G3)
        engine_findings = engine_findings + _audit_documents(db, audit,
                                                             result.get("documents", []))
        sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        critical_a11y = 0
        for f in sorted(engine_findings, key=lambda x: sev_rank.get(x.get("severity"), 9)):
            if f.get("category") == "accessibility" and f.get("severity") == "critical":
                critical_a11y += 1
            g = remediation.guidance_for(f)
            db.add(models.Finding(
                audit_id=audit.id, category=f["category"], severity=f["severity"],
                guideline_id=f.get("guideline"), element=f.get("element"),
                effort=f.get("effort"), title=f.get("title"),
                remediation=g.remediation, confidence="automated"))

        # --- Integrity Engine (anti-gaming) — detects gaming from the findings +
        #     an implausible jump vs the previous audit. Caps the verdict, never
        #     the deterministic score. Feature-flagged. ---
        prev = (db.query(models.Audit)
                  .filter(models.Audit.domain_id == audit.domain_id,
                          models.Audit.status == "completed",
                          models.Audit.overall_score.isnot(None),
                          models.Audit.id != audit.id)
                  .order_by(desc(models.Audit.created_at)).first())
        integ = integrity.assess(engine_findings, float(score.overall),
                                 float(prev.overall_score) if prev else None,
                                 enabled=settings_store.get_bool("integrity_enabled", True))
        audit.integrity = integ

        # --- legal compliance verdict, SEPARATE from the band (gap G1) ---
        comp = compliance_verdict(score.categories, critical_a11y, reviewed=False,
                                  integrity_flagged=integ["flagged"])
        audit.compliance_status = comp.status
        audit.method = comp.method
        audit.confidence = comp.confidence

        # --- per-page coverage (gap G7) ---
        pages = result.get("pages", [])
        done = _persist_pages(db, audit, pages)
        audit.pages_total = result.get("pages_total") or done or 1
        audit.pages_done = done or 1

        audit.overall_score = score.overall
        audit.band = score.band
        audit.guardrail_active = score.guardrail_active
        audit.status = "completed"
        audit.finished_at = datetime.now(timezone.utc)
        db.commit()

        # --- advisory ML: anomaly / regression detection (STRICTLY out of the score
        #     path — the score is already computed and committed above) ---
        try:
            model = ml_anomaly.load()
            if model is not None:
                feats = ml_anomaly.features_from(score.overall, score.categories)
                res = ml_anomaly.score_one(model, feats)
                audit.anomaly_score = res["score"]
                if res["is_anomaly"]:
                    db.add(models.Finding(
                        audit_id=audit.id, category="content", severity="low",
                        guideline_id="ML-ADVISORY", confidence="advisory",
                        title="Scores are statistically unusual versus the trained baseline — "
                              "worth a human review (possible regression)."))
                db.commit()
        except Exception as exc:
            print("ml advisory error:", exc)

        # a completed audit changes the national/rankings aggregates AND each org's
        # domain list (latest score/band) -> drop their caches
        for _pfx in ("national", "rankings", "ministries", "states", "domains"):
            cache.invalidate_prefix(_pfx)
        queue.set_status(task_id, "completed",
                         {"overall_score": score.overall, "band": score.band,
                          "compliance_status": comp.status})

        # --- CI/CD webhook notification (gap G5) ---
        webhook = (audit.scope or {}).get("webhook_url")
        if webhook:
            try:
                post_webhook(webhook, {
                    "task_id": str(audit.id), "domain": domain.url,
                    "overall_score": score.overall, "band": score.band,
                    "compliance_status": comp.status})
            except Exception as exc:  # never fail the audit on a webhook error
                print("webhook error:", exc)
    except Exception as exc:
        audit = db.get(models.Audit, task_id)
        if audit:
            audit.status = "failed"; db.commit()
        queue.set_status(task_id, "failed", {"error": str(exc)[:200]})
        raise
    finally:
        db.close()


def _handle(entry_id, data):
    try:
        process(data["task_id"], json.loads(data["payload"]))
        queue.ack(entry_id)   # ack only on success; failures stay pending for reclaim/DLQ
    except Exception as exc:
        print("worker error:", exc)


def run():
    queue.ensure_group()
    # unique consumer per replica so horizontal scaling works and a dead consumer's
    # in-flight jobs can be reclaimed by its peers (falls back to PID locally)
    consumer = os.getenv("HOSTNAME") or f"py-worker-{os.getpid()}"
    print(f"GovUX worker '{consumer}' started; waiting for jobs…")
    ticks = 0
    while True:  # pragma: no cover - long-lived loop
        # periodically reclaim jobs orphaned by crashed workers (and DLQ poison ones)
        ticks += 1
        if ticks % 6 == 0:
            for entry_id, data in queue.reclaim_stale(consumer):
                _handle(entry_id, data)
        batches = queue.read_jobs(consumer=consumer, count=1, block_ms=5000)
        for _stream, entries in batches or []:
            for entry_id, data in entries:
                _handle(entry_id, data)


if __name__ == "__main__":  # pragma: no cover
    run()
