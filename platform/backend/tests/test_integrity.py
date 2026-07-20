"""Integrity Engine (anti-gaming) — flags gaming, caps the verdict, never the score."""
from app.services import integrity
from app.services.scoring import compliance_verdict

OVERLAY = {"category": "accessibility", "severity": "high", "guideline": "Integrity-overlay", "title": "overlay"}
HIDDEN = {"category": "gigw", "severity": "high", "guideline": "Integrity-gaming", "title": "hidden"}
CLEAN = {"category": "trust", "severity": "low", "guideline": "Security", "title": "hsts"}


def test_disabled_is_noop():
    r = integrity.assess([OVERLAY], 90, 40, enabled=False)
    assert r["enabled"] is False and r["flagged"] is False and r["score"] is None


def test_clean_not_flagged():
    r = integrity.assess([CLEAN], 82, 80)
    assert r["flagged"] is False and r["score"] == 100 and r["techniques"] == []


def test_overlay_and_hidden_flagged():
    r = integrity.assess([OVERLAY, HIDDEN, CLEAN], 88, 85)
    keys = {t["key"] for t in r["techniques"]}
    assert r["flagged"] and {"accessibility-overlay", "hidden-mandatory-elements"} <= keys
    assert r["score"] < 100


def test_improbable_jump_flagged():
    r = integrity.assess([CLEAN], 90, 40)          # +50 jump
    assert r["flagged"] and any(t["key"] == "improbable-jump" for t in r["techniques"])
    assert r["jump"] == {"from": 40.0, "to": 90.0}
    # a modest, plausible improvement is NOT flagged
    assert integrity.assess([CLEAN], 60, 50)["flagged"] is False


def test_flag_caps_the_compliance_verdict():
    cats = {"accessibility": 95, "usability": 90, "gigw": 90, "design": 90,
            "performance": 90, "responsiveness": 90, "content": 90, "trust": 90}
    clean = compliance_verdict(cats, 0, reviewed=True)
    gamed = compliance_verdict(cats, 0, reviewed=True, integrity_flagged=True)
    assert clean.status == "compliant"
    assert gamed.status != "compliant"            # gaming voids the verdict
