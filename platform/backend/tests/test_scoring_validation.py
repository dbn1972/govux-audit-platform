"""Score validation harness — locks in the invariants that make the GovUX Score
defensible for a national league table, so it can never silently regress.

These are property/invariant checks (determinism, monotonicity, bounds, guard-rail
correctness, compliance transitions) plus a small golden set. They do NOT claim the
*weights* are empirically calibrated — that needs ground-truth data (see
docs/SCORING_VALIDATION.md) — but they guarantee the model behaves coherently.
"""
import itertools
from app.services import scoring

CATS = list(scoring.CATEGORY_WEIGHTS)


def _vec(v):
    return {c: v for c in CATS}


# ---------- structural invariants ----------
def test_weights_sum_to_100_exactly():
    assert sum(scoring.CATEGORY_WEIGHTS.values()) == 100.0


def test_deterministic():
    cats = {"accessibility": 63, "usability": 71, "gigw": 58, "design": 66,
            "performance": 49, "responsiveness": 80, "content": 55, "trust": 90}
    first = scoring.compute_score(cats)
    for _ in range(10):
        r = scoring.compute_score(cats)
        assert (r.overall, r.band, r.guardrail_active) == (first.overall, first.band, first.guardrail_active)


def test_overall_and_band_bounded():
    for v in range(0, 101, 5):
        r = scoring.compute_score(_vec(v))
        assert 0.0 <= r.overall <= 100.0
        assert r.band in "ABCDE"


def test_monotonic_in_each_category():
    """Raising one category's score (others fixed) never lowers the overall."""
    base = _vec(50)
    for c in CATS:
        lo = scoring.compute_score({**base, c: 40}).overall
        hi = scoring.compute_score({**base, c: 90}).overall
        assert hi >= lo, f"raising {c} lowered the overall"


def test_contributions_sum_to_overall():
    cats = {"accessibility": 80, "usability": 60, "gigw": 70, "design": 55,
            "performance": 65, "responsiveness": 90, "content": 40, "trust": 100}
    overall = scoring.compute_score(cats).overall
    total = sum(row["contribution"] for row in scoring.explain(cats))
    assert abs(total - overall) < 0.05          # the breakdown reconciles to the score
    # highest 'lost' row is the biggest point-loss category (remediation priority)
    rows = scoring.explain(cats)
    assert rows == sorted(rows, key=lambda r: r["lost"], reverse=True)


# ---------- band boundaries (exact) ----------
def test_band_boundaries_exact():
    assert scoring.band_for(90.0) == "A"
    assert scoring.band_for(89.99) == "B"
    assert scoring.band_for(75.0) == "B"
    assert scoring.band_for(74.99) == "C"
    assert scoring.band_for(60.0) == "C"
    assert scoring.band_for(59.99) == "D"
    assert scoring.band_for(40.0) == "D"
    assert scoring.band_for(39.99) == "E"


# ---------- guard-rail correctness (swept) ----------
def test_guardrail_caps_band_whenever_threshold_breached():
    for a11y, trust in itertools.product([30, 49, 50, 80], [30, 49, 50, 80]):
        cats = {**_vec(95), "accessibility": a11y, "trust": trust}
        r = scoring.compute_score(cats)
        breached = a11y < 50 or trust < 50
        assert r.guardrail_active is breached
        if breached:
            assert r.band in ("C", "D", "E")     # never A or B under a guard-rail


# ---------- compliance verdict transitions (G1) ----------
def test_compliance_transitions_are_coherent():
    good = _vec(95)
    # automated-only can never be 'compliant'
    assert scoring.compliance_verdict(good, 0, reviewed=False).status == "partially_compliant"
    # reviewed + high a11y + no criticals -> compliant
    assert scoring.compliance_verdict(good, 0, reviewed=True).status == "compliant"
    # adding a critical a11y failure downgrades to non_compliant, even reviewed
    assert scoring.compliance_verdict(good, 1, reviewed=True).status == "non_compliant"
    # low a11y is non_compliant regardless of review
    assert scoring.compliance_verdict({**good, "accessibility": 40}, 0, reviewed=True).status == "non_compliant"


# ---------- golden set (regression guard) ----------
GOLDEN = [
    # (category vector, expected_overall, expected_band)
    ({c: 100 for c in CATS}, 100.0, "A"),
    ({c: 0 for c in CATS}, 0.0, "E"),
    ({"accessibility": 57.8, "usability": 64.5, "gigw": 71.6, "design": 66.8,
      "performance": 61.8, "responsiveness": 61.2, "content": 61.3, "trust": 70.9}, 63.9, "C"),
]


def test_golden_set_regression():
    for cats, exp_overall, exp_band in GOLDEN:
        r = scoring.compute_score(cats)
        assert abs(r.overall - exp_overall) < 0.15, f"{cats} -> {r.overall}, expected {exp_overall}"
        assert r.band == exp_band
