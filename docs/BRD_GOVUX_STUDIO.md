# Business Requirements Document — GovUX Studio (AI Prototype Generator)

| | |
|---|---|
| **Document** | BRD — GovUX Studio |
| **Version** | 1.0 (Draft for approval) |
| **Owner** | GovUX Audit Platform — Product |
| **Related** | [HLD](HLD.md) · [LLD](LLD.md) · [Scoring & Validation](../platform/docs/SCORING_VALIDATION.md) · [Security Architecture](SECURITY_ARCHITECTURE.md) |
| **Status** | Proposed — not yet implemented |

---

## 1. Executive summary

The GovUX Audit Platform today **finds** what is wrong with a government website and scores it 0–100. It stops at the diagnosis. **GovUX Studio** closes the loop: an officer describes the site they need, chooses how many pages, and the platform uses Claude to **generate a complete, multi-page, inter-linked HTML prototype pre-engineered to pass the platform's own audit at ≥ 80/100** across accessibility, UX, GIGW 3.0, performance and trust. The officer previews every screen, sees the live audit score, and downloads the HTML as a compliant starting point for their web team.

**The defining principle:** the LLM only **generates**; the existing **deterministic engine scores** — unchanged. The ≥ 80 target is reached by a **generate → audit → refine** loop where the deterministic auditor is the sole arbiter. The score path stays LLM/ML-free (platform invariant #1).

---

## 2. Business context & problem

- Ministries repeatedly ship sites that fail GIGW/WCAG because teams lack an accessible, compliant **starting point**; the audit tells them they failed *after* the fact.
- UX4G/GIGW compliance knowledge is scarce and unevenly distributed across 2,000+ government estates.
- There is no fast, safe way to produce a **demo-able, standards-compliant prototype** to align stakeholders before procurement/build.

**Opportunity:** turn the platform from a *grader* into a *studio* — from "your site scores 54/D" to "here is an 82/B starting point you can build on."

---

## 3. Goals & objectives (SMART)

| # | Objective | Metric |
|---|---|---|
| G1 | Generate a compliant multi-page prototype on demand | ≥ 90% of runs converge to **audit score ≥ 80** within ≤ 4 refine iterations |
| G2 | Let the officer demo the screens before building | Clickable multi-page preview in-browser, mobile + desktop |
| G3 | Hand off real, buildable code | One-click **download** of a self-contained HTML bundle |
| G4 | Preserve platform integrity | The deterministic score remains LLM-free; generated output passes the **anti-gaming** checks (no hidden-element stuffing, no overlays) |
| G5 | Control cost & safety | Per-run token cap; generated HTML sanitised; no external network calls in the prototype |

**Success metric (north star):** median generated score ≥ 82, with ≥ 80% of officers rating the prototype "usable as a starting point."

---

## 4. Scope

**In scope**
- Guided intake (department, purpose, page list, page count, primary + optional Indic language, tone).
- LLM generation of N inter-linked, self-contained HTML pages.
- Automatic scoring by the existing GovUX engine + a **generate → audit → refine** loop to reach ≥ 80.
- In-browser multi-screen preview (desktop + mobile) and **download** (`.zip` of HTML).
- Provenance + a clear "AI-generated draft — human review required" watermark/notice.

**Out of scope (v1)**
- Hosting/publishing the generated site (download only).
- Backend/dynamic functionality (forms submit to nowhere; clearly marked as prototype).
- Real departmental data, live integrations, or official emblem use without authorisation.
- Image generation (uses CSS/SVG placeholders, not photorealistic assets).

---

## 5. Personas & stakeholders

| Persona | Need |
|---|---|
| **Ministry domain owner** | A compliant starting prototype + demo screens to align their team/vendor |
| **Assessor** | Confidence the output is genuinely accessible, not check-gaming |
| **MeitY/NIC steward** | Cost governance, provenance, and that the invariant holds |
| **Web vendor** | Downloadable, clean HTML to build from |

---

## 6. Assumptions & constraints

- **Invariant #1 preserved:** generation is authoring (input side); scoring stays deterministic & LLM-free. GovUX Studio is an *advisory/authoring* tool.
- Requires the platform's Anthropic API key (Admin → Configuration → Advisory AI). Reuses `services/llm_advisor.py` plumbing (key encrypted at rest).
- Generated prototypes are **self-contained** (inline CSS/SVG, no external CSS/JS/fonts/images) — portable, CSP-safe, and fully auditable offline.
- Token/cost is bounded per run; large page counts increase cost linearly.

---

## 7. Functional requirements

### 7.1 Intake (FR-1)
The officer provides: department/organisation name, site purpose, **number of pages (1–12)**, the page list (e.g. Home, About, Services, Documents, Contact), primary language (English/Hindi/other Indic), and tone. Sensible defaults are offered per site type (informational portal, service portal, scheme page).

**Theme is a *constrained* choice, never a free colour picker** (that would break UX4G conformance and risk contrast failures that lower the accessibility score):
- **Mode:** Light (default) / Dark — both UX4G 3.0 themes are pre-validated for AA contrast.
- **Accent (optional):** default UX4G purple `#4a2bc2`; a ministry may pick an accent **from an approved, contrast-checked set only**, applied to decorative highlights while the interactive / link / focus tokens stay fixed to the system.
- The set is curated so **every combination clears WCAG AA** — user choice cannot break the ≥ 80 target. No arbitrary hex input.

### 7.2 Generation (FR-2)
The platform calls Claude with the **GovUX Studio generation prompt** (Appendix A), producing exactly N pages as a JSON map `{filename: html}`. Every page:
- **conforms to the official UX4G Design System 3.0** ([ux4g.gov.in](https://ux4g.gov.in)) — its real tokens (brand purple `#4a2bc2`, saffron `#f70`, green `#080`; text `#171717`/`#525252`; surfaces `#fff`/`#fafafa`/`#f5f5f5`; 4px base radius), typography (`Noto Sans` body, `Schibsted Grotesk` headings, full Indic Noto families), and component patterns. Tokens are emitted as CSS custom properties so the output mirrors the design system;
- shares a common **government masthead** (tricolour strip, Emblem of India, "Government of India / <Ministry>") and **mandatory GIGW footer** (Home, Sitemap, Website Policies, Privacy Policy, Terms, Copyright, Hyperlinking Policy, Accessibility Statement, Help, Contact, RTI, Feedback, **Last Updated** date);
- shares a consistent primary **navigation that cross-links every page** via relative links;
- includes skip-to-content, a language switcher, and text-size controls.

> **Design-system conformance is a first-class acceptance criterion**, not decoration: the UX4G 3.0 tokens above were extracted from the live design system and are the palette/type contract the generator must use — it may not invent its own colours or fonts.

### 7.3 Scoring & the ≥ 80 loop (FR-3)
Each generated page set is scored by the **existing deterministic engine** (Playwright + axe-core + Lighthouse + GIGW + cookie/overlay integrity). If overall < 80:
1. The auditor's findings are fed back to Claude with the **refine prompt** (Appendix B).
2. Claude returns corrected pages **without changing content intent**.
3. Repeat up to **K = 4** iterations.

If ≥ 80 is not reached in K iterations, the platform returns the **best** version **with an honest gap report** — it never fabricates an 80 (consistent with the coverage-confidence principle).

### 7.4 Preview & demo (FR-4)
A clickable, multi-screen preview renders every generated page in an iframe sandbox, with a **device toggle** (mobile 375 / tablet 768 / desktop 1440) and the live **GovUX score + band + category bars**. The officer can click between pages exactly as an end user would.

### 7.5 Download (FR-5)
One click downloads a `.zip` of the self-contained HTML files plus a `README` (score report, "AI-generated draft — human review required", provenance, and the exact prompt/inputs used).

### 7.6 History (FR-6)
Runs are saved per organisation (org-fenced), re-openable, and re-downloadable.

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | A ≤ 6-page run completes in ≤ 90 s median (generation + audit + up to 2 refines). Runs are async (task_id + poll), like audits. |
| **Security** | Generated HTML is **sanitised** (no `<script>` with external `src`, no `on*` handlers to external hosts, no external network references); served in a sandboxed iframe with a strict CSP; no tracking cookies. |
| **Cost** | Per-run token ceiling; page-count cap (12); admin-set monthly budget; each run's token cost logged. |
| **Accessibility (of the Studio itself)** | The Studio UI meets the same WCAG 2.2 AA bar the platform enforces. |
| **Integrity** | Generated output is subject to the platform's **anti-gaming** checks — hidden-but-present mandatory elements and accessibility overlays are rejected, so the generator can't "cheat" its own auditor. |
| **Provenance** | Every artifact carries an AI-generated notice, timestamp, model, and inputs. |

---

## 9. Architecture & API

Reuses existing components; adds a thin generation + orchestration layer.

```
Officer → Studio UI → POST /v1/studio → task_id (202)
                          │
      ┌───────────────────┴─────────────────────────┐
      │  Studio worker (new)                         │
      │   1. llm_advisor.generate(prompt) → pages    │  ← LLM (authoring)
      │   2. engine audit(pages)          → score    │  ← DETERMINISTIC (unchanged)
      │   3. if <80 and iter<K: refine → back to 2   │  ← generate→audit→refine loop
      │   4. persist run + best pages + score        │
      └──────────────────────────────────────────────┘
Officer ← GET /v1/studio/{id} (status, score) · /preview · /download.zip
```

**New endpoints**
- `POST /v1/studio` — `{department, purpose, pages[], language, tone}` → `202 {task_id}`
- `GET /v1/studio/{id}` — status, score, band, per-page list, gap report
- `GET /v1/studio/{id}/preview/{page}` — sandboxed page HTML
- `GET /v1/studio/{id}/download` — `.zip` bundle

**New data:** a `studio_runs` table (org-fenced) storing inputs, generated pages (object storage), score, iterations, token cost.

**Reuses:** `llm_advisor` (LLM plumbing + key), the audit engine (scoring), the async queue, org-fencing, `/readyz`.

---

## 10. The ≥ 80 guarantee — honestly stated

The target is met by **convergence, not assertion**:
- The generator is prompted with the **exact rubric the auditor uses**, so its first draft is already close.
- The deterministic auditor scores it; any gap becomes a precise refine instruction.
- The loop repeats up to K times; the auditor — never the LLM — decides the score.
- If it cannot reach 80, the platform **says so** and returns the best draft + the remaining findings. No faked scores.

This is the same Generator/Evaluator discipline that keeps the platform honest elsewhere.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM games the auditor (hidden elements to pass checks) | Existing **anti-gaming/overlay detection** rejects it; human preview required |
| Officer treats a draft as production-ready | Prominent "AI-generated draft — human review required" notice; download README repeats it |
| Cost runaway on large runs | Page cap (12), token ceiling, admin budget, per-run cost log |
| Impersonation of official branding | Emblem/branding use gated to authorised orgs; placeholders marked |
| Hallucinated "official" content | Content marked illustrative; no real data claims; assessor/human sign-off before use |
| Injection via generated HTML | Sanitisation + sandboxed iframe + strict CSP |

---

## 12. Acceptance criteria

1. An officer generates a **6-page** linked prototype; every page cross-links to the others and shares the masthead + mandatory footer.
2. The run reports a **deterministic GovUX score ≥ 80** (or an honest gap report if not).
3. The prototype previews on mobile + desktop with **no horizontal overflow** and passes the **axe critical/serious** gate.
4. The download is a self-contained `.zip` that renders offline with no external requests.
5. The generated output passes the platform's **integrity** checks (no hidden-element stuffing, no overlays).
6. The deterministic score path is unchanged — no LLM in scoring.
7. **UX4G 3.0 conformance:** the prototype uses the UX4G brand/text/surface tokens and `Noto Sans`/`Schibsted Grotesk` type stacks (emitted as CSS custom properties) — no invented palette or fonts.

---

## 13. Phasing

- **Phase 1 (MVP):** intake → generate → audit → 1 refine → preview → download, English only, informational sites.
- **Phase 2:** the full K-iteration loop, Indic languages, service-portal templates, run history.
- **Phase 3:** component library alignment to the official UX4G design system, brand kits per ministry, vendor hand-off package.

---

## Appendix A — GovUX Studio generation prompt

> The reusable prompt lives at **[`platform/backend/app/prompts/studio_generate.md`](../platform/backend/app/prompts/studio_generate.md)** and is the single source of truth. It embeds the exact audit rubric (GIGW mandatory elements, WCAG 2.2 AA, UX4G tokens, CWV budgets, self-containment, cross-linking, no overlays/tracking) so the first draft already targets ≥ 80. Inputs (`{department}`, `{purpose}`, `{pages}`, `{page_count}`, `{language}`, `{tone}`) are interpolated at run time; the model returns a JSON map `{filename: full_html}`.

## Appendix B — Refine prompt

> Also in the prompt file: given the auditor's findings and the current pages, return corrected pages **without changing content intent** — the loop that closes the last points to reach ≥ 80.

---

_This BRD is a proposal. Implementation is scoped in §13; it reuses the platform's existing LLM plumbing, audit engine, async queue and org-fencing, and preserves the LLM-free score invariant throughout._
