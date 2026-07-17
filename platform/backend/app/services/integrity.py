"""Integrity Engine (anti-gaming) — Phase 1.

Detects attempts to game the audit rather than genuinely comply, from the
engine's own findings plus score-history. STRICTLY separate from the numeric
score (invariant #1): the deterministic GovUX score is untouched. Integrity acts
on the *compliance verdict* (a detected attempt caps it via `integrity_flagged`)
and produces an `integrity` block for the report / a steward review queue.

Feature-flagged: when disabled, everything is a no-op and nothing is flagged.
"""
from __future__ import annotations

# a large, unexplained score jump between consecutive audits is suspicious
JUMP_THRESHOLD = 25.0

# per-technique penalty on the *integrity* score (0-100), NOT the GovUX score
_PENALTY = {
    "accessibility-overlay": 40,       # masks markup instead of fixing it
    "hidden-mandatory-elements": 35,   # required links stuffed but hidden from users
    "improbable-jump": 25,             # score leapt with no plausible real change
}
# map an engine finding's guideline -> integrity technique
_BY_GUIDELINE = {
    "Integrity-overlay": "accessibility-overlay",
    "Integrity-gaming": "hidden-mandatory-elements",
}

_LABEL = {
    "accessibility-overlay": "Accessibility overlay detected — masks the markup instead of fixing it",
    "hidden-mandatory-elements": "Mandatory elements present but hidden from users",
    "improbable-jump": "Score jumped implausibly with no matching real change",
}


def assess(findings: list[dict] | None, current_score: float | None,
           prev_score: float | None = None, enabled: bool = True) -> dict:
    """Return the integrity block. `flagged` -> the compliance verdict is capped
    and the audit is queued for human confirmation (never a silent score change)."""
    if not enabled:
        return {"enabled": False, "flagged": False, "score": None, "techniques": [], "jump": None}

    techniques: list[str] = []
    for f in findings or []:
        t = _BY_GUIDELINE.get(f.get("guideline") or "")
        if t and t not in techniques:
            techniques.append(t)

    jump = None
    if (prev_score is not None and current_score is not None
            and (float(current_score) - float(prev_score)) >= JUMP_THRESHOLD):
        techniques.append("improbable-jump")
        jump = {"from": round(float(prev_score), 1), "to": round(float(current_score), 1)}

    penalty = sum(_PENALTY.get(t, 20) for t in techniques)
    return {
        "enabled": True,
        "flagged": bool(techniques),
        "score": max(0, 100 - penalty),
        "techniques": [{"key": t, "label": _LABEL.get(t, t)} for t in techniques],
        "jump": jump,
    }
