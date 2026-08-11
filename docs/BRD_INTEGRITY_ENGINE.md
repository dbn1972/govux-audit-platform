# Business Requirements Document — GovUX Integrity Engine (anti-gaming)

| | |
|---|---|
| **Document** | BRD — GovUX Integrity Engine |
| **Version** | 1.0 (Draft for approval) |
| **Owner** | GovUX Audit Platform — Product |
| **Related** | [Scoring & Validation](../platform/docs/SCORING_VALIDATION.md) · [Security Architecture](SECURITY_ARCHITECTURE.md) · [HLD](HLD.md) · [LLD](LLD.md) |
| **Status** | **Implemented** (as of 2026-08-11) — see “Implementation map” below |

---

## 0. Implementation map

This BRD was written as a proposal and has since been **built**. The requirements below are
retained as the statement of intent; this table is where each one now lives in the code.

| Area | Implementation |
|---|---|
| Detection + assessment | `platform/backend/app/services/integrity.py` — `assess(findings, overall, previous_overall, enabled)` |
| Overlay / stuffing detection in the engine | `platform/backend/audit_engine/runner.js` — `overlays()` |
| Persistence | `audits.integrity` (JSONB); migration `0010_integrity` |
| Pipeline wiring | `platform/backend/app/worker.py` — runs after scoring, before the compliance verdict |
| Effect on the verdict | `services/scoring.py` — `compliance_verdict(..., integrity_flagged=True)` caps at `partially_compliant` with a stated reason |
| Feature flag | `app_settings` key `integrity_enabled` (default `true`) |
| Tests | `platform/backend/tests/test_integrity.py` |

The governing constraint held: **the Integrity Engine caps the compliance verdict and routes to
human review; it never changes the deterministic score.** A penalty the audited party cannot see
and reproduce would be indefensible on challenge. See `PRODUCT.md` §4.4.

---

## 1. Executive summary

A published, transparent, deterministic government score is a **rubric — and rubrics get gamed** (Goodhart's Law). Once ministries are ranked, some will optimise for the *checks* rather than for citizens: accessibility overlays, hidden "mandatory" links stuffed for the crawler, cloaking a clean page to the auditor, `alt` text that exists but says nothing. Left unchecked, "world-class GovUX score" quietly becomes "world-class at passing GovUX checks."

The **Integrity Engine** is the platform's immune system. It extends the anti-gaming detection that already exists (`overlays()` in the engine → the `integrity_flagged` path that caps the compliance verdict) into a systematic layer that (a) detects specific gaming techniques, (b) measures the **gap between what the auditor sees and what a real user/assessor experiences** — the *general* defence that catches gaming nobody anticipated — and (c) makes gaming **cost more than the flaw it hides**, with a **human review backstop** so honest sites are never silently punished.

**Governing principle:** *score substance, not presence; measure and penalise the divergence between the auditor's view and reality.* The deterministic score stays LLM/ML-free and reproducible; the Integrity Engine acts on the **compliance verdict and review queue**, never by secretly changing the number.

---

## 2. Problem & context

- The methodology is intentionally **transparent** (for defensibility) — which also makes it a published cheat-sheet.
- The platform already catches two techniques (overlays; hidden mandatory elements) but has no systematic, extensible integrity layer, no cloaking/divergence detection, and no cross-estate pattern detection.
- The findings DB is high-stakes; a gamed "compliant" verdict on an inaccessible site actively harms the citizens it's meant to protect.

---

## 3. Goals & objectives (SMART)

| # | Objective | Metric |
|---|---|---|
| G1 | Detect the common gaming techniques deterministically | ≥ 8 techniques detected (overlays, hidden elements, dead/insubstantial mandatory links, alt-stuffing, cloaking, contrast tricks, ARIA-lies, improbable jumps) |
| G2 | Catch *unanticipated* gaming via reality-divergence | Every audit carries an **auditor-vs-reality divergence score**; large gaps auto-queue for human review |
| G3 | Make gaming irrational | A confirmed gaming attempt **voids the compliance verdict and flags the org** — a worse outcome than the honest failure |
| G4 | Protect honest sites | Detection **flags for human review + caps the verdict**; it never silently tanks the deterministic number (false-positive safe) |
| G5 | Preserve the invariant | The 0–100 score stays deterministic, reproducible and LLM/ML-free |

---

## 4. Scope

**In scope**
- A pluggable **detector suite** (Tier 1) run during/after each audit, emitting `integrity` findings.
- A **divergence tracker** (Tier 2): auditor-view vs real-browser view, lab CWV vs CrUX field, axe-pass vs assessor verdict.
- **Verdict & queue integration**: gaming caps the compliance verdict (reuse `integrity_flagged`) and raises an **integrity flag** for review — never a silent score change.
- **Cross-estate fingerprinting** (Tier 3): the same trick appearing across many sites.
- An **Integrity report** per audit + a steward **Integrity queue**.

**Out of scope (v1)**
- Automated punishment without human confirmation (all penalties beyond verdict-capping require an assessor).
- De-anonymised "naming and shaming" (a governance decision, not a platform default).
- Changing the deterministic scoring formula or weights.

---

## 5. Personas

| Persona | Need |
|---|---|
| **Assessor / steward** | A prioritised **Integrity queue** of likely-gamed sites, with evidence, to confirm or clear |
| **Ministry owner** | A clear, honest integrity report ("we detected X; fix the markup, don't mask it") |
| **Programme leadership** | Confidence the national score reflects real quality, not check-passing |

---

## 6. Functional requirements

### Tier 1 — deterministic detectors (extend the engine)
Run in the engine / worker; each emits an `integrity` finding and contributes to an **integrity score** (0–100, separate from the GovUX score).

- **FR-1 Overlays** *(exists — keep/broaden)*: accessibility-overlay vendors → high finding, caps verdict.
- **FR-2 Hidden mandatory elements** *(exists — keep)*: present-but-invisible required links (`display:none`/`aria-hidden`/0-size/off-screen).
- **FR-3 Dead / insubstantial mandatory links** *(new)*: fetch each GIGW mandatory link — does it resolve (200)? does the target actually contain the required substance (**wire the dormant `dpdp.py`** for privacy/consent/rights/grievance)? Presence → substance.
- **FR-4 Alt-text quality** *(new)*: flag `alt` equal to the filename/URL, empty-but-not-decorative, or identical across many images — "has alt" gamed into meaninglessness.
- **FR-5 Cloaking / auditor-sniffing** *(new, high value)*: fetch each page **twice** — audit UA vs a real-browser UA — and diff DOM + sub-scores. A page served clean *only* to the auditor is decisive proof of gaming.
- **FR-6 Contrast / ARIA tricks** *(new)*: text that passes contrast but is 0-size/behind an image; `aria-label`/`role` overrides that satisfy axe but misrepresent the control.
- **FR-7 Improbable-jump flag** *(new, extends `ml_anomaly`)*: a large score jump with no corresponding real change → queue for review, don't auto-trust.

### Tier 2 — reality-divergence (the general defence)
- **FR-8 Divergence tracker**: for every audit, compute and store three gaps —
  1. **auditor-view vs real-browser-view** (from FR-5),
  2. **lab CWV vs CrUX field data**,
  3. **automated pass vs assessor verdict** (once reviewed).
  A large positive gap = the site looks better to the machine than to reality ⇒ **auto-raise an integrity flag**. This catches gaming *without knowing the technique*.

### Tier 3 — estate-level & methodology
- **FR-9 Cross-estate fingerprinting**: detect the same overlay/hidden-element/cloaking signature across many domains (a vendor selling "compliance-in-a-box") and neutralise the pattern estate-wide.
- **FR-10 Private holdout monitor**: a rotating set of **un-published** integrity checks, recomputed periodically, that flags checklist-optimisers. It is an **integrity monitor only** — it never enters the public deterministic score (invariant preserved).
- **FR-11 Penalty asymmetry**: a *confirmed* gaming attempt voids the compliance verdict (`integrity_flagged`), flags the org, and is recorded in the tamper-evident log — strictly worse than the honest failure.

### Integrity report & queue
- **FR-12**: each audit exposes an **integrity block** (score, findings, divergence gaps, status: clean / flagged / confirmed-gaming / cleared).
- **FR-13**: a steward **Integrity queue** ranks flagged sites by divergence + severity for human confirmation; the assessor's decision feeds FR-8's third gap (a learning loop).

---

## 7. Architecture & integration (reuses what exists)

```
Engine audit ─┬─ deterministic score (UNCHANGED, LLM/ML-free)
              └─ Integrity Engine
                   Tier1 detectors (overlays*, hidden*, links+dpdp, alt, cloaking, aria, jump)
                   Tier2 divergence (audit-UA vs real-UA, lab vs CrUX, auto vs assessor)
                   Tier3 fingerprint + holdout monitor
                        │
                        ├─ integrity findings + integrity_score  → Integrity report
                        ├─ integrity_flagged=true  → compliance_verdict CAPPED (existing path)
                        └─ raise integrity_flag     → steward Integrity queue (human confirm)
```

- **Reuses:** `audit_engine/runner.js` `overlays()` (extend), `scoring.compliance_verdict(integrity_flagged=…)` (existing hook), `ml_anomaly` (jump/divergence), `dpdp.py` (wire it), `crux` (field data), the audit-log (tamper-evident record).
- **New data:** an `integrity_flags` table (audit_id, technique, evidence, divergence, status, decided_by) + an `integrity` block on the audit.
- **Invariant:** the numeric score is untouched; integrity acts on the **verdict** and the **review queue**. Detection **flags**, humans **confirm**, penalty applies on confirmation (or auto-cap for unambiguous techniques like overlays).

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| **Determinism** | Score path unchanged; integrity outputs are separate and reproducible |
| **False-positive safety** | Ambiguous signals **flag for review**, never silently penalise; only unambiguous techniques (overlay present, cloaking proven) auto-cap the verdict |
| **Performance** | The double-fetch (cloaking) and link-resolution add bounded work; run async in the worker |
| **Transparency vs holdout** | Public methodology stays published; the holdout is an *integrity monitor*, disclosed as existing but not itemised |
| **Auditability** | Every flag + assessor decision is logged (tamper-evident) for appeals |

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **False positives punish honest sites** | Human-confirm before any penalty beyond verdict-cap; assessor can clear; decisions logged |
| **Arms race** — gamers adapt | Divergence tracker (FR-8) is technique-agnostic; holdout (FR-10) + fast methodology cadence stay ahead |
| **Holdout undermines reproducibility** | Holdout never touches the public score — it only raises review flags |
| **Cloaking double-fetch load / WAF trips** | Bounded, throttled, cached; degrade gracefully to single-fetch (flag "could not verify") |
| **Over-policing chills adoption** | Framing: "fix the markup, don't mask it" — integrity findings come with remediation, not just penalties |

---

## 10. Acceptance criteria

1. An overlay, a hidden mandatory link, a dead privacy link, and alt-stuffing each produce an **integrity finding** and lower the integrity score.
2. A page that serves different content to the audit UA vs a real UA is **flagged as cloaking**.
3. A completed audit exposes an **integrity block** (score, findings, divergence, status).
4. A confirmed gaming attempt **caps the compliance verdict** and appears in the tamper-evident log; an honest failure with the same missing element does **not** carry the gaming penalty.
5. Flagged sites appear in the steward **Integrity queue**, ranked by divergence; an assessor can confirm or clear.
6. The deterministic GovUX score is **byte-identical** with and without the Integrity Engine (invariant proven by test).

---

## 11. Phasing

- **Phase 1:** Tier-1 detectors FR-3/4/5/7 (link+dpdp, alt, cloaking, jump) on top of the existing overlay/hidden detection; the integrity block + verdict cap.
- **Phase 2:** Tier-2 divergence tracker (lab-vs-CrUX now; auto-vs-assessor as reviews accrue) + the steward Integrity queue.
- **Phase 3:** Tier-3 cross-estate fingerprinting + the private holdout monitor + tamper-evident integration.

---

_Proposal only. It extends the platform's existing `overlays()` detector and `integrity_flagged` verdict path, preserves the LLM/ML-free deterministic score, and keeps a human in the loop so honest sites are never silently penalised._
