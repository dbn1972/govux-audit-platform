"""GovUX Studio — deterministic auditor, the generate->audit->refine loop,
billing, quota, and the endpoints (LLM mocked, never hits the network)."""
import json
from app.services import studio, studio_audit, settings_store

# a UX4G-conformant page that should score well on the static auditor
COMPLIANT = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>:focus{outline:2px solid #4a2bc2} body{font-family:"Noto Sans",system-ui;font-size:16px;max-width:1100px}
.btn{background:#4a2bc2;color:#fff;border-radius:4px}</style></head>
<body><a href="#main">Skip to main content</a>
<header>भारत सरकार | Government of India — Department of Example</header>
<nav><a href="index.html">Home</a> <a href="about.html">About</a></nav>
<main id="main"><h1>Welcome to the Department</h1>
<img src="data:image/svg+xml,%3Csvg/%3E" alt="Department emblem">
<label for="q">Search</label><input id="q" type="search" name="q">
<h2>Our services</h2>
<p>This department delivers citizen services across the state with a focus on transparency,
accessibility and speed. Citizens can find schemes, download forms, read policies and contact
officers. Every page follows the UX4G design system and GIGW guidelines so the experience is
consistent, inclusive and available in multiple Indian languages for a billion citizens who rely
on these public services every single day of the year across cities, towns and villages.</p>
<h2>Popular tasks</h2><p>Apply for a scheme, track a request, or read the latest circulars here.</p>
<a class="btn" href="about.html">Learn more about us</a></main>
<footer>Last Updated: 16 Jul 2026 ·
<a href="privacy.html">Privacy Policy</a> <a href="terms.html">Terms</a>
<a href="sitemap.html">Sitemap</a> <a href="rti.html">RTI</a> <a href="contact.html">Contact</a>
<a href="copyright.html">Copyright</a> <a href="accessibility.html">Accessibility Statement</a>
<a href="feedback.html">Feedback</a> <a href="help.html">Help</a></footer></body></html>"""

BAD = "<html><body><h1>x</h1><h1>y</h1><img src='https://cdn/x.png'><script>accessibe.init()</script></body></html>"


def test_static_auditor_scores_compliant_high_and_bad_low():
    good = studio_audit.score({"index.html": COMPLIANT})
    assert good["overall"] >= 80 and good["band"] in ("A", "B")
    bad = studio_audit.score({"index.html": BAD})
    assert bad["overall"] < 60
    joined = " ".join(bad["findings"])
    assert "overlay" in joined and "alt" in joined


def test_generate_parses_pages(monkeypatch):
    monkeypatch.setattr(studio, "_caller",
                        lambda system, user: (json.dumps({"index.html": COMPLIANT}), {"input": 10, "output": 20}))
    pages, usage = studio.generate({"department": "X"})
    assert "index.html" in pages and usage["output"] == 20


def test_run_loop_persists_and_bills(db, ctx, monkeypatch):
    from app import models
    from app.database import SessionLocal
    monkeypatch.setattr(studio, "_caller",
                        lambda system, user: (json.dumps({"index.html": COMPLIANT}), {"input": 100, "output": 500}))
    run = models.StudioRun(org_id=ctx["org"].id, requested_by=ctx["user"].id,
                           status="generating", inputs={"department": "Dept", "page_count": 1})
    db.add(run); db.commit()
    studio.run(run.id, SessionLocal)
    db.refresh(run)
    assert run.status == "scored"
    assert float(run.overall_score) >= 80
    assert run.output_tokens == 500 and float(run.cost_inr) > 0     # billable


def test_create_requires_enabled(client, ctx, monkeypatch):
    monkeypatch.setattr(settings_store, "get_bool", lambda k, d=None: False)
    r = client.post("/v1/studio", headers=ctx["headers"],
                    json={"department": "Dept of Example", "purpose": "portal", "pages": ["Home", "About"]})
    assert r.status_code == 403


def test_create_and_download(client, ctx, db, monkeypatch):
    from app import models
    monkeypatch.setattr(settings_store, "get_bool", lambda k, d=None: True)
    monkeypatch.setattr(settings_store, "get_str", lambda k, d="": "sk-test" if k == "llm_api_key" else d)
    monkeypatch.setattr(settings_store, "get_int",
                        lambda k, d=None: {"studio_max_pages": 8, "studio_monthly_quota": 20,
                                           "studio_max_refines": 1, "studio_target_score": 80,
                                           "studio_cost_per_1k_output_inr": 120}.get(k, d or 0))
    monkeypatch.setattr(studio, "_caller",
                        lambda system, user: (json.dumps({"index.html": COMPLIANT}), {"input": 50, "output": 300}))
    r = client.post("/v1/studio", headers=ctx["headers"],
                    json={"department": "Dept of Example", "purpose": "citizen portal", "pages": ["Home", "About"]})
    assert r.status_code == 202
    rid = r.json()["id"]
    got = client.get(f"/v1/studio/{rid}", headers=ctx["headers"]).json()
    assert got["status"] == "scored" and got["score"] >= 80
    assert got["billing"]["output_tokens"] == 300 and got["billing"]["cost_inr"] > 0
    z = client.get(f"/v1/studio/{rid}/download", headers=ctx["headers"])
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip"
