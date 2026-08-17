"""Align the library's `automation` column with what the engine actually does.

The UX4G mastersheet marks 71 guidelines deterministic that had no engine check.
Because the library repeated that claim, they were advertised as automated AND
excluded from the assessor's checklist — so they were covered by nobody. This
resolves each one into the truth:

  BUILT      a new deterministic check exists (audit_engine/ux4g-rules.js)
  COVERED    an existing engine check already decides it, under another id
  NOT_AUTOMATABLE  the sheet is wrong: judging tone, audience or "is this easy
             to understand" is not a DOM decision. Moved to the review checklist.

Run after seed_engine_guidelines:
    docker compose exec api python -m app.reclassify_guidelines
"""
from __future__ import annotations

from .database import SessionLocal
from . import models

# Implemented in audit_engine/ux4g-rules.js and emitted per page.
BUILT = [
    "UX4G-PLD-022", "UX4G-PLD-023", "UX4G-PLD-012", "UX4G-PLD-018", "UX4G-PLD-004",
    "UX4G-PLD-014", "UX4G-PLD-028", "UX4G-PLD-010", "UX4G-PLD-017", "UX4G-MFA-002",
    "UX4G-MFA-007", "UX4G-WCQ-007", "UX4G-WCQ-011", "UX4G-WCQ-017", "UX4G-FDE-001",
    "UX4G-NIA-003", "UX4G-TO-023", "UX4G-LFS-004",
]

# Already decided by an existing detector; the note records which, so nobody
# builds a second check for the same thing.
COVERED = {
    "UX4G-RES-010": "GIGW-viewport",
    "UX4G-TC-001": "GIGW-6.2 (HTTPS)",
    "UX4G-WCQ-014": "WCAG-1.1.1 (axe)",
    "UX4G-BG-014": "WCAG-1.1.1 (axe)",
    "UX4G-BG-013": "WCAG-1.4.3 (axe)",
    "UX4G-PLD-016": "WCAG-1.4.3 (axe)",
    "UX4G-FDE-004": "WCAG-3.3.2 (axe)",
    "UX4G-HOM-010": "WCAG-2.4.2 + GIGW-metadata-title",
    "UX4G-NIA-001": "WCAG-2.4.2 (page title)",
    "UX4G-NIA-007": "WCAG-2.5.8 (target size)",
    "UX4G-RES-002": "WCAG-2.5.8 (target size)",
    "UX4G-MIA-003": "WCAG-2.4.7 (focus visible)",
    "UX4G-mobile-first": "Responsive (viewport overflow sweep)",
    "UX4G-lang": "GIGW-language-option",
    "UX4G-MFA-009": "GIGW-language-option",
    "UX4G-RES-004": "CWV-LCP / CWV-INP / CWV-CLS",
    "UX4G-LOG-006": "GIGW-privacy-policy + GIGW-terms",
    "UX4G-LOG-007": "Consent-banner / DPDP-s6-consent",
    "WCAG-2.4.7": "axe focus-visible heuristics (partial)",
}

# Everything else the sheet called deterministic but which needs a human. Left
# as `assisted` rather than `manual` where the machine can at least gather the
# evidence, so a reviewer starts from something rather than a blank page.
ASSISTED = [
    "UX4G-WCQ-009", "UX4G-WCQ-010",          # grammar / spelling — needs a language tool
    "UX4G-WCQ-003", "UX4G-WCQ-013",          # readability, overall a11y — partial signals exist
    "UX4G-LFS-002", "UX4G-LFS-003", "UX4G-LFS-008",
    "UX4G-PLD-009", "UX4G-PLD-032",          # affordance quality beyond the cursor check
    "UX4G-HOM-012", "UX4G-SEA-004", "UX4G-WS-007",
    "UX4G-consistent-components",
]


def run() -> dict[str, int]:
    stats = {"built": 0, "covered": 0, "assisted": 0, "manual": 0, "missing": 0}
    db = SessionLocal()
    try:
        def get(gid):
            g = db.get(models.Guideline, gid)
            if g is None:
                stats["missing"] += 1
            return g

        for gid in BUILT:
            g = get(gid)
            if g:
                g.automation = "automated"
                g.source = "GovUX engine (ux4g-rules)"
                stats["built"] += 1

        for gid, by in COVERED.items():
            g = get(gid)
            if g:
                g.automation = "automated"
                g.reference = f"Checked by {by}. {(g.reference or '')}".strip()[:500]
                stats["covered"] += 1

        for gid in ASSISTED:
            g = get(gid)
            if g:
                g.automation = "assisted"
                stats["assisted"] += 1

        # Anything still claiming automation without an engine check is a false
        # claim: demote it so it reaches the assessor instead of nobody.
        known = set(BUILT) | set(COVERED) | set(ASSISTED)
        engine_owned = ("GIGW-", "WCAG-", "CWV-")
        engine_exact = {"Security", "Consent-banner", "DPDP-s6-consent", "Responsive",
                        "Cross-browser", "Content-QA", "PDF-UA", "Integrity-overlay",
                        "Integrity-gaming", "ML-ADVISORY", "Evidence"}
        for g in db.query(models.Guideline).filter(models.Guideline.automation == "automated"):
            if g.id in known or g.id in engine_exact or g.id.startswith(engine_owned):
                continue
            g.automation = "manual"
            stats["manual"] += 1

        db.commit()
    finally:
        db.close()
    return stats


if __name__ == "__main__":
    s = run()
    for k in ("built", "covered", "assisted", "manual", "missing"):
        print(f"{s[k]:>5}  {k}")
