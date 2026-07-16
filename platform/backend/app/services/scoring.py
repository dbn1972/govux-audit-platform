"""GovUX scoring engine — the weighted 8-category model from BRD v1.1 / Annex B.
Deterministic and reproducible: same inputs + engine version => same score.

Two distinct verdicts are produced and MUST NOT be conflated (gap G1):
  * the UX *band* (A–E)  — an aspirational, comparable quality score, and
  * the legal *compliance_status* — a hard WCAG-anchored pass/fail signal.
A site can hold a respectable UX band while being legally non-compliant; the
compliance verdict makes that explicit instead of hiding it inside the band.
Automated-only evidence can never yield full 'compliant' — that requires
assessor review (the hybrid-rigour rule).
"""
from dataclasses import dataclass

# category weights (must sum to 100) — versioned with the engine
CATEGORY_WEIGHTS = {
    "accessibility": 22.0,
    "usability": 17.0,
    "gigw": 15.0,
    "design": 11.0,          # UX4G design foundation
    "performance": 12.0,     # Core Web Vitals
    "responsiveness": 10.0,  # responsive + multi-browser + multi-device
    "content": 7.0,
    "trust": 6.0,
}

BANDS = [(90, "A"), (75, "B"), (60, "C"), (40, "D"), (0, "E")]

# guard-rail: if any of these category scores is below its threshold, cap the band
GUARDRAILS = {"accessibility": 50.0, "trust": 50.0}
GUARDRAIL_CAP_BAND = "C"

# legal compliance thresholds (WCAG 2.2 AA is the statutory bar for accessibility)
COMPLIANCE_A11Y_FAIL = 50.0     # below this => non_compliant regardless of review
COMPLIANCE_A11Y_PASS = 90.0     # at/above this + reviewed + no criticals => compliant


@dataclass
class ScoreResult:
    overall: float
    band: str
    guardrail_active: bool
    categories: dict[str, float]


@dataclass
class ComplianceResult:
    status: str            # compliant | partially_compliant | non_compliant
    method: str            # automated | expert_reviewed
    confidence: str        # automated_only | expert_verified
    reason: str


def band_for(score: float) -> str:
    for threshold, letter in BANDS:
        if score >= threshold:
            return letter
    return "E"


def _cap_band(band: str, cap: str) -> str:
    order = "ABCDE"
    return band if order.index(band) >= order.index(cap) else cap


def compute_score(category_scores: dict[str, float]) -> ScoreResult:
    """category_scores: {category -> 0..100}. Missing categories score 0."""
    total_w = sum(CATEGORY_WEIGHTS.values())
    overall = sum(
        CATEGORY_WEIGHTS[c] * category_scores.get(c, 0.0) for c in CATEGORY_WEIGHTS
    ) / total_w
    overall = round(overall, 1)

    guardrail_active = any(
        category_scores.get(cat, 100.0) < thr for cat, thr in GUARDRAILS.items()
    )
    band = band_for(overall)
    if guardrail_active:
        band = _cap_band(band, GUARDRAIL_CAP_BAND)

    return ScoreResult(
        overall=overall,
        band=band,
        guardrail_active=guardrail_active,
        categories={c: round(category_scores.get(c, 0.0), 1) for c in CATEGORY_WEIGHTS},
    )


def explain(category_scores: dict[str, float]) -> list[dict]:
    """Break the overall score into each category's point contribution (transparency
    for defensibility). The contributions sum to `compute_score(...).overall`, and
    `lost` = points a category is leaving on the table — ranked so the biggest
    point losses come first, which is exactly where remediation pays back most.
    """
    total_w = sum(CATEGORY_WEIGHTS.values())
    rows = []
    for c, w in CATEGORY_WEIGHTS.items():
        sc = float(category_scores.get(c, 0.0))
        rows.append({
            "category": c,
            "weight": w,
            "score": round(sc, 1),
            "contribution": round(w * sc / total_w, 2),        # points added to the 0..100 overall
            "max_contribution": round(w * 100 / total_w, 2),   # points if this category were perfect
            "lost": round(w * (100 - sc) / total_w, 2),        # points forgone
        })
    rows.sort(key=lambda r: r["lost"], reverse=True)
    return rows


def compliance_verdict(
    category_scores: dict[str, float],
    critical_a11y_count: int = 0,
    reviewed: bool = False,
    integrity_flagged: bool = False,
) -> ComplianceResult:
    """Hard legal verdict, separate from the UX band (gap G1).

    The EU two-tier model and UK GDS both hold that automated testing catches
    only ~30-40% of WCAG issues, so a full 'compliant' claim is only defensible
    once an assessor has reviewed the evidence. We encode exactly that:
      * any critical accessibility failure, or a11y < 50  -> non_compliant
      * automated-only (unreviewed), or a11y < 90         -> partially_compliant
      * reviewed + a11y >= 90 + no critical failures       -> compliant
    """
    a11y = category_scores.get("accessibility", 0.0)
    method = "expert_reviewed" if reviewed else "automated"
    confidence = "expert_verified" if reviewed else "automated_only"

    # Accessibility overlays / stuffed-but-hidden mandatory elements are "compliance
    # theater": they can inflate an automated score while masking (or worsening) the
    # real experience. Such a site can never be certified 'compliant' — cap it at
    # partially_compliant regardless of the numbers, and name why.
    if integrity_flagged and not (critical_a11y_count > 0 or a11y < COMPLIANCE_A11Y_FAIL):
        return ComplianceResult(
            "partially_compliant", method, confidence,
            reason="integrity flag — an accessibility overlay or hidden/stuffed elements were "
                   "detected; automated remediation masks rather than fixes the markup")

    if critical_a11y_count > 0 or a11y < COMPLIANCE_A11Y_FAIL:
        return ComplianceResult(
            "non_compliant", method, confidence,
            reason=("critical accessibility failure" if critical_a11y_count
                    else f"accessibility {a11y:.0f} below {COMPLIANCE_A11Y_FAIL:.0f}"))
    if not reviewed:
        return ComplianceResult(
            "partially_compliant", method, confidence,
            reason="automated evidence only — expert review required for a full compliance claim")
    if a11y < COMPLIANCE_A11Y_PASS:
        return ComplianceResult(
            "partially_compliant", method, confidence,
            reason=f"accessibility {a11y:.0f} below the {COMPLIANCE_A11Y_PASS:.0f} pass bar")
    return ComplianceResult(
        "compliant", method, confidence,
        reason="expert-reviewed, no critical failures, accessibility at/above the AA bar")
