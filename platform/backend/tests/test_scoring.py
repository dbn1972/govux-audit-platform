from app.services import scoring


def test_weights_sum_to_100():
    assert sum(scoring.CATEGORY_WEIGHTS.values()) == 100.0


def test_band_boundaries():
    assert scoring.band_for(95) == "A"
    assert scoring.band_for(75) == "B"
    assert scoring.band_for(60) == "C"
    assert scoring.band_for(40) == "D"
    assert scoring.band_for(0) == "E"
    assert scoring.band_for(39.9) == "E"


def test_overall_matches_model_example():
    r = scoring.compute_score({
        "accessibility": 57.8, "usability": 64.5, "gigw": 71.6, "design": 66.8,
        "performance": 61.8, "responsiveness": 61.2, "content": 61.3, "trust": 70.9})
    assert abs(r.overall - 63.9) < 0.2
    assert r.band == "C"
    assert r.guardrail_active is False


def test_guardrail_caps_band_on_critical_a11y():
    r = scoring.compute_score({**{k: 90 for k in scoring.CATEGORY_WEIGHTS}, "accessibility": 40})
    assert r.guardrail_active is True
    assert r.band == "C"          # capped even though arithmetic would be A/B


def test_guardrail_on_trust():
    r = scoring.compute_score({**{k: 95 for k in scoring.CATEGORY_WEIGHTS}, "trust": 30})
    assert r.guardrail_active is True
    assert r.band == "C"


def test_missing_category_scores_zero():
    r = scoring.compute_score({"accessibility": 100})
    assert r.overall < 30
    assert r.categories["trust"] == 0.0


def test_perfect_score():
    r = scoring.compute_score({k: 100 for k in scoring.CATEGORY_WEIGHTS})
    assert r.overall == 100.0 and r.band == "A" and r.guardrail_active is False


# ---------- compliance verdict (G1): legal pass/fail separate from band ----------
def _cats(a11y):
    return {**{k: 95 for k in scoring.CATEGORY_WEIGHTS}, "accessibility": a11y}


def test_compliance_non_compliant_on_critical():
    v = scoring.compliance_verdict(_cats(95), critical_a11y_count=1, reviewed=True)
    assert v.status == "non_compliant"


def test_compliance_non_compliant_on_low_a11y():
    v = scoring.compliance_verdict(_cats(40), critical_a11y_count=0, reviewed=True)
    assert v.status == "non_compliant"


def test_automated_only_can_never_be_compliant():
    # even a flawless automated run is only 'partially_compliant' without review
    v = scoring.compliance_verdict(_cats(100), critical_a11y_count=0, reviewed=False)
    assert v.status == "partially_compliant"
    assert v.confidence == "automated_only" and v.method == "automated"


def test_reviewed_high_a11y_is_compliant():
    v = scoring.compliance_verdict(_cats(95), critical_a11y_count=0, reviewed=True)
    assert v.status == "compliant" and v.confidence == "expert_verified"


def test_reviewed_but_below_pass_bar_is_partial():
    v = scoring.compliance_verdict(_cats(80), critical_a11y_count=0, reviewed=True)
    assert v.status == "partially_compliant"
