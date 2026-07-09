# Scoring validation & calibration (read on demand)

The GovUX Score drives national league tables, so it must be **defensible**, not just
computed. Two things make it so — and one that is still outstanding. Be honest about the third.

## 1. It is transparent
`scoring.explain(category_scores)` decomposes the overall into each category's **point
contribution** (weight × score ÷ 100). The contributions sum to the overall, and `lost` =
points a category leaves on the table, ranked so the biggest losses (and best remediation ROI)
come first. Surfaced in `GET /v1/audits/{id}/report` as `contributions`. This answers
"why is this site a 66?" with an auditable breakdown.

## 2. Its behaviour is locked by an invariant harness
`tests/test_scoring_validation.py` guarantees the model can never silently regress:
- **Determinism** — same input ⇒ identical output (reproducibility is a hard requirement).
- **Bounds** — overall ∈ [0,100], band ∈ {A..E}.
- **Monotonicity** — raising any single category never lowers the overall.
- **Reconciliation** — `explain(...)` contributions sum to `compute_score(...).overall`.
- **Band boundaries** — exact cut-offs (89.99→B, 90→A, …).
- **Guard-rail** — a11y<50 or trust<50 ⇒ band capped at C, swept across the grid.
- **Compliance transitions** — automated-only never `compliant`; a critical a11y failure always
  downgrades to `non_compliant` (G1).
- **Golden set** — representative vectors pinned to expected overall/band as a regression guard.

## 3. Outstanding: the *weights* are not yet empirically calibrated
The category weights (accessibility 22, usability 17, … trust 6) are expert-assigned, not fitted
to outcomes. Before the score is used to rank ministries publicly, calibrate them against ground
truth. Recommended path:
1. Assemble a **labelled reference set** — 50–100 gov sites with expert-audited category scores
   and, ideally, a citizen task-success signal per site.
2. **Fit / stress the weights**: check rank-correlation between the GovUX Score and expert overall
   judgement; run a weight-sensitivity sweep (how much does each weight move rankings?); prefer the
   smallest weight changes that maximise agreement.
3. **Inter-rater reliability** on the manual labels (two assessors) so the target itself is sound.
4. Re-run this harness; version the weights with the engine (`settings.engine_version`) and record
   the calibration in `ranking_publications.methodology_version` before any public league table.

Until step 3 lands, publish rankings as **segmented and provisional** (like-for-like by category/size,
marked "methodology vN"), and lean on the compliance verdict — which *is* legally anchored — for any
pass/fail claim.
