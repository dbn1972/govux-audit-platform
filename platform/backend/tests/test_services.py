"""Unit tests for the gap-closure services (pure / injected — no network)."""
from app.services import remediation, discovery, language, crux, pdf_audit, verification


# ---------- remediation (G5) ----------
def test_remediation_matches_known_rule():
    g = remediation.guidance_for({"guideline": "WCAG-1.4.3", "title": "Color contrast",
                                  "category": "accessibility", "severity": "high", "effort": "low"})
    assert "contrast" in g.remediation.lower()
    assert g.priority > 0


def test_remediation_default_for_unknown():
    g = remediation.guidance_for({"guideline": "ZZZ", "title": "mystery",
                                  "category": "x", "severity": "low"})
    assert g.remediation and g.code_hint


def test_priority_orders_high_impact_low_effort_first():
    items = [
        {"severity": "low", "effort": "high", "title": "minor", "guideline": "z"},
        {"severity": "critical", "effort": "low", "title": "https", "guideline": "GIGW-6.2"},
    ]
    out = remediation.prioritise(items)
    assert out[0]["guideline"] == "GIGW-6.2"
    assert out[0]["priority"] >= out[1]["priority"]
    assert "remediation" in out[0] and "code_hint" in out[0]


# ---------- discovery (G2) ----------
def test_parse_sitemap_extracts_gov_hosts():
    xml = """<urlset><url><loc>https://a.gov.in/x</loc></url>
             <url><loc>https://b.nic.in/</loc></url>
             <url><loc>https://evil.com/</loc></url></urlset>"""
    hosts = discovery.parse_sitemap(xml)
    assert hosts == ["a.gov.in", "b.nic.in"]


def test_parse_robots_reads_sitemap_and_hosts():
    txt = "User-agent: *\nSitemap: https://c.gov.in/sitemap.xml\nsee https://d.nic.in/"
    hosts = discovery.parse_robots(txt)
    assert "c.gov.in" in hosts and "d.nic.in" in hosts


def test_extract_and_dispatch():
    html = '<a href="https://e.gov.in/p">x</a><a href="https://x.org">y</a>'
    assert discovery.extract_gov_domains(html) == ["e.gov.in"]
    assert discovery.discover("seed", "<loc>https://f.gov.in/</loc>", "auto") == ["f.gov.in"]
    assert "g.gov.in" in discovery.discover("seed", "Sitemap: https://g.gov.in/s.xml", "auto")


# ---------- language / script (G6) ----------
def test_detect_devanagari_and_latin():
    assert language.detect_script("नमस्ते यह हिंदी है") == "devanagari"
    assert language.detect_script("hello this is english") == "latin"
    assert language.detect_script("") == "unknown"


def test_lang_mismatch_detected():
    assert language.lang_matches_script("hi", "devanagari") is True
    assert language.lang_matches_script("en", "devanagari") is False
    assert language.is_indic("tamil") and not language.is_indic("latin")


def test_readability_scriptaware():
    latin = language.readability("word " * 40)
    indic = language.readability("नमस्ते " * 40)
    assert 0 <= latin <= 100 and 0 <= indic <= 100
    assert language.readability("short text") == 70.0


# ---------- CrUX field data (G4) ----------
def _crux_record():
    return {"record": {"metrics": {
        "largest_contentful_paint": {"percentiles": {"p75": 3000}},
        "cumulative_layout_shift": {"percentiles": {"p75": 0.05}},
        "interaction_to_next_paint": {"percentiles": {"p75": 150}}}}}


def test_crux_parse_and_blend():
    parsed = crux.parse_record(_crux_record())
    assert parsed["lcp_ms"] == 3000 and parsed["cls"] == 0.05
    assert 0 <= parsed["field_score"] <= 100
    assert crux.parse_record({}) is None
    assert crux.blend(80.0, None) == 80.0
    blended = crux.blend(80.0, parsed)
    assert blended != 80.0


def test_crux_fetch_disabled_without_key(monkeypatch):
    monkeypatch.setattr(crux.settings, "crux_api_key", "")
    assert crux.fetch_field_data("https://x.gov.in") is None


def test_crux_fetch_with_injected_fetcher(monkeypatch):
    monkeypatch.setattr(crux.settings, "crux_api_key", "test-key")
    data = crux.fetch_field_data("https://x.gov.in", fetch=lambda u, k: _crux_record())
    assert data and data["field_score"] >= 0


# ---------- PDF/document accessibility (G3) ----------
def test_pdf_assess_flags_missing_signals():
    r = pdf_audit.assess("https://x.gov.in/form.pdf",
                         {"tagged": False, "has_lang": False, "has_title": False, "pages": 3})
    assert r.score < 100 and len(r.findings) >= 3
    assert any(f["severity"] == "critical" for f in r.findings)


def test_pdf_assess_clean_document():
    r = pdf_audit.assess("https://x.gov.in/ok.pdf",
                         {"tagged": True, "has_lang": True, "has_title": True, "pages": 1})
    assert r.score == 100 and len(r.findings) == 0
    assert r.as_row()["issue_count"] == 0


# ---------- verification (G / stub -> real) ----------
def test_verification_dns_and_metafile_injected():
    token = "govux-verify=abc123"
    assert verification.check_dns_txt("x.gov.in", token,
                                      resolve_txt=lambda h: ["v=spf1", token]) is True
    assert verification.check_dns_txt("x.gov.in", token,
                                      resolve_txt=lambda h: ["nothing"]) is False
    assert verification.check_metafile("x.gov.in", token,
                                       fetch_text=lambda u: token) is True
    assert verification.verify("x.gov.in", token, "sso_mapping") is True
    assert verification.verify("x.gov.in", token, "unknown") is False


def test_verification_handles_resolver_errors():
    def boom(_):
        raise RuntimeError("dns down")
    assert verification.check_dns_txt("x.gov.in", "t", resolve_txt=boom) is False
