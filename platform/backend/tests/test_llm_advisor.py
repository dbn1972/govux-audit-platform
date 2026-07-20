"""Advisory LLM remediation enrichment — opt-in, out of the score path."""
from app.services import llm_advisor


def test_disabled_by_default(monkeypatch):
    monkeypatch.setattr(llm_advisor.settings_store, "get_bool", lambda k, d=None: False)
    assert llm_advisor.is_enabled() is False
    assert llm_advisor.enrich({"title": "x"}, "base", "hint") is None


def test_enriches_when_enabled(monkeypatch):
    monkeypatch.setattr(llm_advisor.settings_store, "get_bool", lambda k, d=None: True)
    monkeypatch.setattr(llm_advisor.settings_store, "get_str",
                        lambda k, d="": "sk-test" if k == "llm_api_key" else "claude-haiku-4-5-20251001")
    monkeypatch.setattr(llm_advisor, "_caller", lambda model, key, prompt: "1. Do X\n2. Do Y")
    out = llm_advisor.enrich({"title": "Images must have alt text", "guideline": "WCAG-1.1.1"},
                             "Add alt text", "alt=…")
    assert out and "Do X" in out


def test_never_raises_on_api_failure(monkeypatch):
    monkeypatch.setattr(llm_advisor.settings_store, "get_bool", lambda k, d=None: True)
    monkeypatch.setattr(llm_advisor.settings_store, "get_str", lambda k, d="": "sk-test")
    def boom(*a, **k): raise RuntimeError("api down")
    monkeypatch.setattr(llm_advisor, "_caller", boom)
    assert llm_advisor.enrich({"title": "x"}, "b", "h") is None   # degrades, never throws
