# PRODUCT.md — GovUX Audit Platform

> **Purpose of this document.** This is the single, self-contained specification of what this
> product is, why every significant decision was made, and how to rebuild it from an empty
> directory. It is written for two readers: a new engineer joining the team, and an AI agent
> asked to recreate or extend the system. Everything needed to do that is inline — you should
> not have to open another file to understand the product, though you will need the repository
> to copy implementation detail.
>
> **Status of this document:** current as of 2026-08-11, engine version `v3.2`, branch `amanmittal`.
> Section 27 records where the rest of the repository's documentation has drifted from the code.

---

## Table of contents

**Part A — What this product is**
1. [Identity card](#1-identity-card)
2. [Problem and regulatory context](#2-problem-and-regulatory-context)
3. [Users, roles and permissions](#3-users-roles-and-permissions)
4. [The four surfaces](#4-the-four-surfaces)
5. [End-to-end journeys](#5-end-to-end-journeys)
6. [Product invariants](#6-product-invariants-the-never-break-rules)
7. [Anti-requirements](#7-anti-requirements-what-this-product-deliberately-does-not-do)

**Part B — The scoring model**

8. [The GovUX Score](#8-the-govux-score)
9. [The compliance verdict](#9-the-compliance-verdict)
10. [What the engine actually measures](#10-what-the-engine-actually-measures)
11. [The coverage-confidence gate](#11-the-coverage-confidence-gate)
12. [Advisory ML and LLM layers](#12-advisory-ml-and-llm-layers)
13. [Regulatory citation map](#13-regulatory-citation-map)
14. [Gap-closure map G1–G13](#14-gap-closure-map-g1g13)

**Part C — How it is built**

15. [Stack, with rationale](#15-stack-with-rationale)
16. [Service topology](#16-service-topology)
17. [Data model](#17-data-model)
18. [API surface](#18-api-surface)
19. [Authentication and session design](#19-authentication-and-session-design)
20. [The audit pipeline](#20-the-audit-pipeline)
21. [The Node audit engine](#21-the-node-audit-engine)
22. [Frontend architecture](#22-frontend-architecture)
23. [Failure modes](#23-failure-modes)
24. [Scale envelope](#24-scale-envelope)

**Part D — Build it from zero**

25. [Reconstruction plan](#25-reconstruction-plan)
26. [Local bring-up](#26-local-bring-up)
27. [Configuration reference](#27-configuration-reference)
28. [Testing and quality gates](#28-testing-and-quality-gates)
29. [Deployment](#29-deployment)
30. [Security and privacy posture](#30-security-and-privacy-posture)
31. [Third-party licence constraints](#31-third-party-licence-constraints)

**Part E — Context you cannot infer from code**

32. [Decision ledger](#32-decision-ledger)
33. [Documented state vs actual state](#33-documented-state-vs-actual-state)
34. [Glossary](#34-glossary)
35. [Source-of-truth map](#35-source-of-truth-map)
36. [Reconstruction acceptance checklist](#36-reconstruction-acceptance-checklist)

---
---

# Part A — What this product is

## 1. Identity card

| | |
|---|---|
| **Name** | GovUX Audit Platform |
| **One line** | A self-service UX and compliance audit engine for Indian government websites that produces a defensible 0–100 score and a separate legal compliance verdict. |
| **Domain scope** | `*.gov.in` and `*.nic.in` only — enforced in application code *and* as a PostgreSQL `CHECK` constraint. |
| **Standards** | GIGW 3.0, WCAG 2.2 AA, UX4G Design System, Core Web Vitals |
| **Engine version** | `v3.2` (`GOVUX_ENGINE_VERSION`, stamped on every audit row) |
| **API version** | `1.1`, all routes under `/v1` |
| **Spec of record** | `GovUX_Audit_Platform_BRD_v1.1_Consolidated.docx` (repo root) |
| **Size** | ~9,300 lines Python · ~4,400 lines TypeScript/TSX · 851 lines Node engine · 377-line SQL schema |
| **Surface** | 64 HTTP endpoints (61 in 12 routers + 3 ops) · 36 frontend routes · 22 tables · 10 enums · 11 migrations |
| **Tests** | 221 backend tests across 36 files, hard `--cov-fail-under=80` gate; Vitest component tests; Playwright + axe e2e |
| **Licence** | See `LICENSE` and `NOTICE` at repo root |

**Repository layout**

```
govux-audit-platform/
  CLAUDE.md                     # agent steering — invariants + token discipline
  PRODUCT.md                    # this file
  README.md INSTALL.md CHANGELOG.md SECURITY.md CONTRIBUTING.md
  GovUX_*.docx / .xlsx          # BRD v1.0/v1.1, scoring model, automation catalogue, gap analysis
  UX4G-Handbook.pdf
  docs/                         # HLD, LLD, DEPLOYMENT, OPERATIONS, PRIVACY, SBOM, BRDs for sub-products
  prototype/                    # 22 static HTML screens — the original design reference
  scripts/generate-sbom.sh
  platform/                     # ← all runnable code lives here
    CLAUDE.md                   # dev-loop steering
    docker-compose.yml          # dev stack (6 services)
    docker-compose.prod.yml     # production stack
    .env.example
    db/schema.sql               # canonical schema — authoritative
    backend/
      app/
        main.py config.py database.py models.py schemas.py security.py deps.py
        routers/                # 12 routers
        services/               # 26 service modules
        prompts/studio_generate.md
        worker.py               # audit worker
        public_worker.py        # free-scanner worker
        seed.py ml_train.py
      audit_engine/             # 7 Node files — Playwright/Lighthouse/axe
      migrations/versions/      # Alembic 0001–0011
      tests/                    # 36 pytest files
      models/                   # trained .joblib artefacts (anomaly, priority)
      pytest.ini requirements.txt Dockerfile
    frontend/                   # Next.js 14 App Router
      app/ components/AppShell.tsx lib/api.ts lib/score.ts app/ux4g-theme.css
      e2e/ test/ package.json
    deploy/                     # helm/ terraform/ ansible/ AIRGAP.md
    ops/prometheus-alerts.yml
    scripts/                    # govux-setup.py, verify_screens.py, preinstall-check.sh,
                                #   build-airgap-bundle.sh, diagnostic-bundle.sh
```

---

## 2. Problem and regulatory context

India runs one of the largest public web estates in the world — thousands of ministry,
department, state, PSU and district sites on `.gov.in` and `.nic.in`. Quality is wildly uneven,
and the accountability loop is broken in a specific way:

- **Compliance is mandated but not measured.** GIGW 3.0 (Guidelines for Indian Government
  Websites, issued by NIC/MeitY) and WCAG 2.2 AA are policy requirements. There is no cheap,
  repeatable, self-service way for a department to find out whether its own site complies.
- **Audits are expensive, slow and inconsistent.** Manual STQC/third-party audits cost lakhs and
  take weeks, so they happen once at launch and never again. Two auditors produce two answers.
- **Feedback arrives after the money is spent.** Teams learn they failed *after* procurement,
  build and launch.
- **There is no comparable number.** Without a common, published methodology, "our site is fine"
  is unfalsifiable, and no ministry can see where it stands relative to its peers.

**What this product does about it.** It gives any authorised government officer a self-service
audit: register your domain, prove you own it, click audit, and within minutes get a 0–100
**GovUX Score** with an A–E band, a **separate legal compliance verdict**, a prioritised list of
findings with remediation guidance, evidence artefacts, and a downloadable STQC-style evidence
pack. Programme administrators get an estate-wide view: national rollups, ministry and state
league tables, continuous monitoring, and auto-discovery of unregistered domains.

**Why the score must be deterministic.** The moment a government score is published, it becomes
a rubric with real consequences — budget, reputation, procurement. A score that a vendor cannot
reproduce is a score a vendor will litigate. So: same inputs plus same engine version must always
produce the same number, with no model, no randomness, and no LLM anywhere in the score path.
That single constraint drives most of this system's architecture.

**Why compliance is a separate verdict.** Automated testing catches only roughly 30–40% of WCAG
failures — a finding consistent across the EU two-tier accessibility model and UK GDS practice.
A high UX band therefore cannot be allowed to imply legal compliance. The two are computed
independently and displayed independently (see §9).

---

## 3. Users, roles and permissions

Five roles, defined as the PostgreSQL enum `user_role`. There are no passwords anywhere in the
system — authentication is gov-email OTP only (§19).

| Role | Who they are | What they can do |
|---|---|---|
| `owner` | Department web-estate owner. **Default role for any self-registering user.** | Register and verify domains for their org; submit audits; view reports, findings, remediation, trends, compare; manage schedules; request page-quota escalation; export/delete own data. |
| `contributor` | Team member of a department | Same operational surface as `owner`, scoped to the org; intended for delegated day-to-day work. |
| `assessor` | Accessibility/UX expert performing manual review | Everything a contributor can do, **plus** `POST /v1/audits/{id}/review` — the only path that can raise a compliance verdict to `compliant`; and record external assessments in the manual-assurance ledger. |
| `programme_admin` | MeitY/NIC programme steward | National dashboard, rankings, ministry and state league tables, auto-discovery scan and review, quota-request approval, runtime configuration, `/metrics` summary, alerts. |
| `super_admin` | Platform operator | Everything, plus GovUX Studio tenant entitlement (`GET/PATCH /v1/studio/tenants`) — the only role that can switch `organisations.studio_enabled`. |

**Role assignment gotcha that matters when recreating this:** OTP verification only ever creates
new users with role `owner`. There is no self-service role elevation and no admin UI for it. Any
non-owner account must be inserted into `users` directly (or promoted via SQL). This is
deliberate — role escalation on a government platform should not be a click — but it means a
fresh install has no `programme_admin` until you make one.

**Standing dev/test accounts** (one per role, org "GovUX QA Sandbox", `org_type = other`):
`owner@gov.in`, `contributor@gov.in`, `assessor@gov.in`, `programme_admin@gov.in`,
`super_admin@gov.in`. Sign in via the normal OTP flow; in dev the OTP is returned in the
`dev_otp` field of the `/v1/auth/otp/request` response (production never returns it).

**Enforcement.** `deps.current_user` resolves the bearer token to a `User`; `deps.require_role(*roles)`
is the guard. Org scoping is applied per-query in each router — there is no row-level security in
Postgres, so **every new query that touches org-owned data must filter by `org_id` explicitly.**

---

## 4. The four surfaces

This is one platform, but it has four genuinely distinct product surfaces. Recreating only the
first still gives you a coherent product; the other three are additive.

### 4.1 The authenticated audit platform (the core)

Registered `.gov.in`/`.nic.in` officers register domains, prove ownership, and run full
multi-page audits with cross-browser matrix, document accessibility, CrUX field data, evidence
packs and continuous monitoring. This is the product. Everything in Parts B and C is primarily
about this surface.

### 4.2 The free public scanner

An anonymous, single-URL, low-cost scan at `POST /v1/public/scan`, backed by a **separate**
Redis stream (`govux:public`) and a **separate single-concurrency worker** (`public_worker.py`).
Its purpose is acquisition and public accountability: anyone can check any government site
without an account.

Abuse controls are the whole design problem here, because it is an unauthenticated endpoint that
makes outbound requests:
- Target host must end in `.gov.in`/`.nic.in` (`GOVUX_FREE_SCAN_SUFFIXES`) — this is an SSRF
  guard as much as a scoping rule.
- Per-IP quota: `GOVUX_SCAN_IP_LIMIT` (default 3) per `GOVUX_SCAN_IP_WINDOW` (24h), after which
  a CAPTCHA is required (`GET /v1/public/captcha`, Cloudflare Turnstile / reCAPTCHA in prod).
- Single-concurrency worker so a burst cannot starve the paid audit queue.
- Registered users get a PDF written to S3/MinIO (`public_scans.pdf_key`); anonymous users get
  the on-screen result only.

Results land in `public_scans`, which is deliberately **not** the `audits` table — public scans
are not evidence, do not feed rankings, and have their own lifecycle.

### 4.3 GovUX Studio (AI prototype generator)

Closes the loop from diagnosis to remedy. An officer describes the site they need and how many
pages; the platform calls Claude to generate a complete, multi-page, inter-linked HTML prototype,
then runs the platform's **own deterministic auditor** over the generated HTML and feeds failures
back into a refine prompt. The loop repeats until the prototype scores at or above target
(design goal: ≥80/100 within ≤4 iterations).

The governing rule, and the reason Studio does not violate invariant #1: **the LLM only generates;
the deterministic engine is the sole arbiter of score.** No model output ever becomes a score.

- Orchestration: `services/studio.py`; scoring of generated HTML: `services/studio_audit.py`;
  prompt: `app/prompts/studio_generate.md`.
- Model: configured at runtime via `app_settings` keys `llm_api_key` and `llm_model`; default
  `claude-haiku-4-5-20251001`, `max_tokens: 8000`.
- Entitlement: org-fenced behind `organisations.studio_enabled`, which **defaults to false** and
  can only be switched by a `super_admin`.
- Billing: every run records `input_tokens`, `output_tokens`, `cost_inr` on `studio_runs`.
- Output: `studio_runs.pages` is a `{filename: html}` JSONB blob; runs can be previewed
  (`/v1/studio/{run_id}/preview/{filename}`), downloaded as a bundle, or published to a public
  showcase under a unique `public_slug`.

### 4.4 The Integrity Engine (anti-gaming)

A published, transparent, deterministic score is a rubric, and rubrics get gamed (Goodhart's
Law). The specific attacks this defends against: accessibility overlay widgets that inflate
automated scores while degrading real screen-reader experience; hidden or stuffed "mandatory"
GIGW elements present only for the crawler; cloaking a clean page to the auditor's user agent;
`alt` text that exists but is meaningless.

`services/integrity.py` runs over the findings plus the delta against the previous completed
audit for the same domain, and returns a JSONB verdict stored on `audits.integrity`.

**Its governing constraint is the important part: the Integrity Engine caps the compliance
verdict and can route an audit to human review, but it never changes the deterministic score.**
Silently docking points would break reproducibility and would be indefensible to a vendor. Instead,
`integrity_flagged=True` forces the verdict to at most `partially_compliant`, with a stated reason.

Feature-flagged at runtime via the `app_settings` key `integrity_enabled` (default true).

### 4.5 The manual-assurance ledger (supporting)

Three of the thirteen benchmark gaps (native mobile-app accessibility, lived-experience
disabled-user panels, deep VAPT) are **not automatable** and were closed honestly rather than
faked. `external_assessments` records externally performed assurance work — CERT-In empanelled
VAPT, STQC certification, accessibility panel reviews — entered by assessors, surfaced in the
evidence pack and compliance views.

It is advisory evidence: **never in the score path, and it never upgrades the compliance verdict.**
Only `POST /v1/audits/{id}/review` can do that.

---

## 5. End-to-end journeys

### 5.1 Officer: from sign-up to a scored report

1. **Sign in.** `POST /v1/auth/otp/request` with a `.gov.in`/`.nic.in` email → 6-digit OTP,
   hashed and stored with a 5-minute TTL. `POST /v1/auth/otp/verify` with the code and a device
   public key → access token (15 min, in memory) + `govux_rt` HttpOnly refresh cookie (60 days,
   device-bound). First-time verification creates the user as `owner`.
2. **Register a domain.** `POST /v1/domains` with the URL. Both the app and the DB `CHECK` reject
   anything not ending `.gov.in`/`.nic.in`.
3. **Prove ownership.** `POST /v1/domains/{id}/verify` — `dns_txt` (TXT record with `verify_token`)
   or `file_upload`. Status moves `pending → verified`. Unverified domains cannot be audited.
4. **Submit an audit.** `POST /v1/audits` with `{domain_id, depth, devices, browsers, webhook_url}`
   → **202 Accepted** with a `task_id` and `status_url`. Never inline. A per-domain
   `pg_advisory_xact_lock` prevents two racing submits from both passing the "already running?"
   check; if an audit is already in flight for that domain the existing `task_id` is returned.
5. **Poll.** `GET /v1/audits/{task_id}` walks `queued → crawling → analyzing → scoring → completed`
   (or `partial`, `failed`, `cancelled`, `insufficient_evidence`).
6. **Read the report.** `GET /v1/audits/{task_id}/report` returns the overall score, band, the
   eight category scores with their point contributions, the compliance verdict *with its reason*,
   findings ranked by severity, per-page coverage, the cross-browser matrix, document
   accessibility results, and CrUX field data if available.
7. **Remediate.** `GET /v1/audits/{task_id}/remediation` returns advisory fix guidance ordered by
   points recoverable. `PATCH /v1/findings/{id}` moves a finding through
   `open → in_progress → resolved → not_applicable`.
8. **Re-audit and compare.** `GET /v1/domains/{id}/compare` and `GET /v1/audits/{id}/trend`.
9. **Export evidence.** `GET /v1/audits/{task_id}/evidence` returns a deterministic ZIP:
   `report.json`, `findings.csv`, compliance statement, methodology, `summary.pdf`.
10. **Automate.** `POST /v1/schedules` for recurring audits; `GET /v1/ci/gate` as a CI/CD pass/fail
    gate; a `webhook_url` in the audit scope fires on completion.

### 5.2 Assessor: raising a verdict

Automated evidence alone caps the verdict at `partially_compliant`, forever. An assessor reviews
the findings, confirms or dismisses them, and calls `POST /v1/audits/{task_id}/review`. That sets
`reviewed=True`, which re-runs `compliance_verdict` with `method=expert_reviewed` and
`confidence=expert_verified`. Only with review **plus** accessibility ≥ 90 **plus** zero critical
accessibility failures does the verdict become `compliant`.

### 5.3 Programme administrator: running the estate

National rollup (`GET /v1/national`), segmented rankings (`GET /v1/rankings`), ministry and state
league tables, auto-discovery (`POST /v1/discovery/scan` crawls sitemaps/robots/registries for
unregistered `.gov.in` domains into `discovered_domains`), quota approvals
(`PATCH /v1/scan-requests/{id}`), runtime config (`PATCH /v1/admin/config`), and
`GET /v1/admin/config/metrics-summary`.

Rankings are **governance-gated**: `ranking_publications` records the segment, the mode
(`internal` | `public`), the approving user and the methodology version. Nothing goes public
without an approver on record and a stated methodology — because a published league table of
government departments is a political artefact, not just a query result.

### 5.4 Citizen: the free scan

Paste a `.gov.in` URL at `/scan` → `POST /v1/public/scan` → 202 → poll `GET /v1/public/scan/{id}`
→ score, band, headline findings. Registered users additionally get
`GET /v1/public/scan/{id}/pdf`. Public aggregate stats at `GET /v1/public/stats`, live queue depth
at `GET /v1/public/queue`.

### 5.5 Officer: generating a compliant prototype (Studio)

Requires `organisations.studio_enabled`. `POST /v1/studio` with a description and page count →
202 → generate → deterministic audit → refine loop → `status = scored`. Preview each page, see
the live score, download the bundle, optionally publish to the public showcase.

---

## 6. Product invariants (the "never break" rules)

These five rules are the product. Violating any of them does not produce a worse version of this
system; it produces a different, indefensible one. They are restated in `CLAUDE.md` because they
are the constraints most likely to be broken by a well-meaning change.

### Invariant 1 — the score path is deterministic and LLM/ML-free

Same inputs + same engine version ⇒ byte-identical score. Category weights sum to exactly 100.
No model inference, no randomness, no network variability inside `compute_score`. ML and LLM
output is advisory and is attached *after* the score is computed and committed.

*Why:* a government score with real budgetary consequences must be reproducible by the audited
party, or it cannot survive challenge. Locked by `tests/test_scoring_validation.py`.

### Invariant 2 — the legal compliance verdict is separate from the UX band

`compute_score` produces a band (A–E). `compliance_verdict` produces a legal status. They are
computed independently and must never be conflated in code or UI. **Automated-only evidence can
never yield `compliant`** — at most `partially_compliant`.

*Why:* automated tooling catches ~30–40% of WCAG failures. Letting a good band imply legal
compliance would make the platform a liability generator for every department that trusted it.

### Invariant 3 — audits are asynchronous, always

`POST /v1/audits` returns **202 + task_id** and enqueues to Redis Streams. A Python worker
consumes it. Never run an audit inline in a request handler.

*Why:* an audit takes minutes (Playwright across three browsers, Lighthouse, multi-page crawl,
document fetching). Inline execution would exhaust the API's worker pool and make the platform
trivially DoS-able by its own users.

### Invariant 4 — `.gov.in` / `.nic.in` only, enforced twice

Both user emails and audited domains are restricted, in application code **and** as PostgreSQL
`CHECK` constraints (`chk_gov_email`, `chk_gov_domain`), plus a suffix allowlist on the free
scanner.

*Why:* this is simultaneously the product's scope, its access-control model, and its SSRF guard.
The DB constraint is the backstop for the case where a new code path forgets the check — which
will happen.

### Invariant 5 — schema changes are made in three places, in sync

Any schema change must land in **`db/schema.sql`** (canonical) ⇄ **`app/models.py`**
(SQLAlchemy, preserving PG `ENUM`/`JSONB`/`INET` types) ⇄ **an Alembic migration** (additive).

*Why:* `schema.sql` initialises fresh databases via the Postgres entrypoint; Alembic upgrades
existing ones; `models.py` is what the ORM believes. Any two of them agreeing while the third
drifts produces failures that appear only on fresh installs or only on upgrades.

---

## 7. Anti-requirements (what this product deliberately does not do)

Listed explicitly because each is a plausible-sounding "improvement" that would break the
product. Do not add these:

- **No non-government sites.** Not as a paid tier, not "just for testing". The domain restriction
  is load-bearing for SSRF safety.
- **No LLM or ML in the score.** Not "as a tie-breaker", not "to weight severity", not "just for
  the design category". The design category is scored by *deterministic pixel analysis*
  (`services/design_cv.py`) precisely so it can stay in the score path.
- **No synchronous audits.** Not even a "quick mode".
- **No secret score adjustments.** The Integrity Engine caps the *verdict*; it does not silently
  dock points. Any penalty a user cannot see and reproduce is a bug.
- **No passwords.** OTP only. Do not add a password field, a password reset flow, or password
  storage of any kind.
- **No automated path to `compliant`.** Only an assessor's explicit review call can produce it.
- **No score without evidence.** If the home page did not load, the audit ends as
  `insufficient_evidence` with no band (§11). Do not "fall back to defaults".
- **No unapproved public rankings.** Publication requires an approver and a methodology version
  on record.

---
---

# Part B — The scoring model

## 8. The GovUX Score

Implemented in `platform/backend/app/services/scoring.py` (154 lines — deliberately small, because
everything in it is load-bearing).

### 8.1 Category weights

Eight categories. **The weights must sum to exactly 100** — this is asserted by tests.

| Category | Weight | What it covers |
|---|---:|---|
| `accessibility` | 22.0 | WCAG 2.2 AA via axe-core |
| `usability` | 17.0 | Navigation, search, form and interaction heuristics |
| `gigw` | 15.0 | GIGW 3.0 mandatory elements and structure |
| `design` | 11.0 | UX4G design foundation, scored by deterministic CV |
| `performance` | 12.0 | Core Web Vitals (Lighthouse lab + CrUX field) |
| `responsiveness` | 10.0 | Responsive layout, cross-browser, tap-target size |
| `content` | 7.0 | Content quality and multilingual/Indic-script support |
| `trust` | 6.0 | HTTPS, security headers, privacy and contact signals |
| **Total** | **100.0** | |

### 8.2 The formula

```
overall = Σ (weight_c × score_c) / Σ weights,   rounded to 1 decimal
```

where each `score_c` is 0–100 and **a missing category scores 0, not a default**. That choice is
deliberate: a silently-absent category must hurt, or an engine bug becomes a free pass.

### 8.3 Bands

| Band | Threshold |
|---|---|
| A | ≥ 90 |
| B | ≥ 75 |
| C | ≥ 60 |
| D | ≥ 40 |
| E | < 40 |

### 8.4 The guard-rail

```python
GUARDRAILS = {"accessibility": 50.0, "trust": 50.0}
GUARDRAIL_CAP_BAND = "C"
```

If accessibility < 50 **or** trust < 50, the band is capped at **C** regardless of the overall
number, and `audits.guardrail_active` is set true.

*Why:* without this, a site could score 91 on the strength of performance and design while being
unusable with a screen reader and served over plain HTTP. A weighted average is exactly the wrong
tool for a floor condition, so the floor is applied separately and visibly.

### 8.5 Transparency: `explain()`

`scoring.explain(category_scores)` decomposes the overall score into per-category
`contribution` (points added), `max_contribution` (points if perfect) and `lost` (points forgone),
sorted by `lost` descending. Contributions sum exactly to `overall`.

This is both the defensibility mechanism — a department can see precisely where every point went —
and the prioritisation mechanism: the top of the `lost` list is where remediation pays back most.

---

## 9. The compliance verdict

Computed by `scoring.compliance_verdict(category_scores, critical_a11y_count, reviewed, integrity_flagged)`,
entirely independently of the band.

**Output:** `status` (`compliant` | `partially_compliant` | `non_compliant`), `method`
(`automated` | `expert_reviewed`), `confidence` (`automated_only` | `expert_verified`), and a
human-readable `reason`. The reason string is part of the contract — the UI shows it, and a
verdict without a stated reason is not defensible.

**Decision order (first match wins):**

1. **Integrity flagged**, and not already failing on accessibility →
   `partially_compliant`, reason: an overlay or hidden/stuffed elements were detected;
   automated remediation masks rather than fixes the markup.
2. **Any critical accessibility failure, or accessibility < 50** → `non_compliant`.
3. **Not reviewed** → `partially_compliant`, reason: automated evidence only.
4. **Reviewed but accessibility < 90** → `partially_compliant`.
5. **Reviewed, accessibility ≥ 90, zero criticals** → `compliant`.

Thresholds: `COMPLIANCE_A11Y_FAIL = 50.0`, `COMPLIANCE_A11Y_PASS = 90.0`.

A sixth status, `not_assessed`, is written by the worker when an audit ends as
`insufficient_evidence` (§11). It is set directly rather than returned by `compliance_verdict`,
because refusing to assess is not a verdict.

**The consequence worth internalising:** in normal operation, on a fresh automated audit, the
verdict is *always* `partially_compliant` or `non_compliant`. `compliant` is unreachable without a
human. That is the intended behaviour, not a bug.

---

## 10. What the engine actually measures

Every category traces to concrete checks. Source files are under `platform/backend/audit_engine/`
unless noted.

| Category | Signal | Where |
|---|---|---|
| accessibility | axe-core WCAG 2.2 AA rule set via `@axe-core/playwright`; violations mapped to severity | `runner.js: accessibility()` |
| accessibility | PDF/Office document accessibility — tagged tree, title, language, page count | `services/pdf_audit.py`, capped at `GOVUX_MAX_DOCUMENTS_PER_AUDIT` (10) |
| usability | Navigation, search presence, form labelling, interaction heuristics | `runner.js: usability()` |
| gigw | GIGW 3.0 mandatory elements — contact, help, accessibility statement, policies, structure | `runner.js: gigw()`, `gigw-rules.js` |
| design | Deterministic pixel analysis of the home-page screenshot: palette coherence, whitespace ratio, clutter, balance | `services/design_cv.py` — **replaces a previously hardcoded `design: 70`** |
| performance | Lighthouse lab metrics (LCP, INP, CLS) | `runner.js: performance()`, `perf.js` |
| performance | CrUX real-user field data, blended when `GOVUX_CRUX_API_KEY` is set | `services/crux.py` — `blend()`; stored on `audits.field_data` |
| responsiveness | 60% no-horizontal-overflow across mobile/tablet/desktop viewports + 40% WCAG 2.5.8 tap-target size (controls ≥ 24px at mobile width) | `runner.js: responsiveness()` |
| responsiveness | Cross-browser matrix: Chromium, Firefox, WebKit — loaded, HTTP status, JS errors, console errors, overflow, broken images | `compat.js` → `audit_browsers` |
| content | Content quality; script-aware multilingual/Indic detection | `runner.js: content()`, `lang.js`, `services/language.py` |
| trust | HTTPS, security headers, privacy policy, contact and ownership signals | `runner.js: trust()` |
| — (integrity) | Accessibility-overlay detection, hidden/stuffed mandatory elements | `runner.js: overlays()` → `services/integrity.py` |
| — (QA) | Broken-link probing, up to `MAX_LINKCHECK = 30` links | `runner.js: brokenLinks()` |
| — (coverage) | Sitemap-driven page discovery, diversified selection, `MAX_CRAWL = 25` pages | `runner.js: sitemapPages()`, `diversify()` |

**Engine constants** (in `runner.js`): `MAX_CRAWL = 25` pages fully audited, `MAX_LINKCHECK = 30`
links probed, `MAX_DOCS = 12` documents discovered.

**`depth` semantics — settled decision:** `depth` means **page count, capped at 25**. It is passed
from `audits.scope.depth` through `worker.run_engine(..., depth=...)` into the runner. This is how
the free-page quota (`GOVUX_FREE_REGISTERED_PAGES = 10`) and the `/v1/scan-requests` escalation
flow read it.

---

## 11. The coverage-confidence gate

This is a subtle but important behaviour that an AI recreating the system will otherwise get
wrong, because it looks like a missing error handler.

Before scoring, the worker inspects `result.evidence`:

```python
if not ev.get("home_reachable", True) or ev.get("pages_analysed", 1) == 0:
    audit.status = "insufficient_evidence"
    audit.overall_score = None
    audit.band = None
    audit.compliance_status = "not_assessed"
    # + a high-severity 'trust' finding explaining that no score was issued
    return          # stop before scoring
```

**Why this exists.** When a site is unreachable — timeout, WAF block, geo-block — the engine still
returns category values, but they are *fillers, not evidence*. Scoring them produced a real
incident: `umang.gov.in` was unreachable from the audit network, every category filled in at 60,
and the platform confidently published "Band D" for a site it had never seen.

**The rule:** never emit a band without evidence. Refusing to score is a valid, correct outcome,
and the `insufficient_evidence` status plus a `null` band is how the product says "I don't know."
Do not add a fallback that scores anyway.

---

## 12. Advisory ML and LLM layers

Everything here is **strictly outside the score path**. The boundary is enforced structurally:
the score is computed and `db.commit()`-ed *before* any of this runs.

### 12.1 Anomaly detection — scikit-learn IsolationForest

`services/ml_anomaly.py`, artefact `backend/models/anomaly.joblib`. After an audit is committed,
features are derived from the overall and category scores; the model produces
`audits.anomaly_score`. If flagged anomalous, a **low-severity advisory finding** is added
(`guideline_id = "ML-ADVISORY"`, `confidence = "advisory"`) saying the scores are statistically
unusual versus the trained baseline and warrant human review. It changes nothing else.

### 12.2 Finding-priority ranking — XGBoost

`services/ml_priority.py`, artefact `backend/models/priority.joblib`. Ranks findings for
remediation ordering only. Does not alter severity, score or verdict.

Both models train via `python -m app.ml_train`.

### 12.3 LLM advisory

`services/llm_advisor.py` provides narrative guidance. `services/studio.py` uses Claude for
prototype generation (§4.3). Neither touches the score.

**If you are recreating this and are tempted to let the model help with scoring: don't.** Invariant
1 is the product's whole defensibility argument.

---

## 13. Regulatory citation map

Findings carry a `guideline_id` — a free-form tag from the engine (`axe` rule id, GIGW rule name,
or an internal tag such as `Cross-browser`, `Evidence`, `ML-ADVISORY`). The curated
`guidelines` table maps ids to plain-language explanations, families and examples.

| Family | Source | Example ids | Used for |
|---|---|---|---|
| `WCAG` | WCAG 2.2 Level AA | `WCAG-1.4.3`, `WCAG-2.5.8` | Accessibility findings; the statutory bar for the compliance verdict |
| `GIGW` | GIGW 3.0 (NIC/MeitY) | mandatory-element rules | GIGW category |
| `UX4G` | UX4G Design System | design foundation checks | Design category |
| `CWV` | Core Web Vitals | LCP, INP, CLS | Performance category |

**Deliberate schema decision:** `findings.guideline_id` is **not** a foreign key to `guidelines`.
Engine tags need not exist in the curated library — a new axe rule must be able to produce a
finding without a migration. The library enriches findings when it can and stays silent when it
cannot.

The optional `guidelines.embedding vector(768)` column (pgvector) exists for retrieval-augmented
guidance. It is optional; the platform runs fine with it empty.

---

## 14. Gap-closure map G1–G13

From `GovUX_Benchmark_Gap_Analysis_v1.0.docx`. Each gap and the code that closes it:

| Gap | What it is | Where it is closed |
|---|---|---|
| **G1** | Compliance verdict separate from score; two-tier methodology | `services/scoring.compliance_verdict`; `findings.confidence`; `audits.method`/`confidence` |
| **G2** | Continuous monitoring + auto-discovery | `services/scheduler.py`, `services/discovery.py`, `/v1/schedules`, `/v1/discovery` |
| **G3** | PDF / document accessibility | `services/pdf_audit.py` → `audit_documents` |
| **G4** | Real-user (field) performance data | `services/crux.py` → `audits.field_data` |
| **G5** | Remediation guidance + CI gate + webhook | `services/remediation.py`, `GET /v1/ci/gate`, `scope.webhook_url` |
| **G6** | Multilingual / Indic-script content | `services/language.py`, `audit_engine/lang.js` |
| **G7** | Multi-page crawl coverage | `audit_engine/runner.js` → `audit_pages` |
| **G8** | Broken-link QA | `audit_engine/runner.js: brokenLinks()` |
| **G9** | Native mobile-app accessibility | **Not automatable** → manual-assurance ledger, `external_assessments.kind = native_app_a11y` |
| **G10** | Accessibility-overlay detection + published methodology | `runner.js: overlays()`, `services/integrity.py`, `/admin/methodology` |
| **G11** | Lived-experience (disabled-user) panel review | **Not automatable** → `external_assessments.kind = lived_experience_panel` |
| **G12** | STQC-style evidence pack | `services/evidence_pack.py`, `GET /v1/audits/{id}/evidence` — deterministic ZIP |
| **G13** | Deep VAPT | **Not automatable** → `external_assessments.kind = vapt` (CERT-In empanelled) |

G9, G11 and G13 were closed by **recording externally performed assurance rather than pretending
to automate it**. This is a product decision worth preserving: an audit platform that claims to do
penetration testing from a page crawl is lying, and the ledger makes the boundary explicit while
still surfacing the evidence in the compliance view.

---
---

# Part C — How it is built

## 15. Stack, with rationale

| Layer | Technology | Version | Why this, and what was rejected |
|---|---|---|---|
| Frontend + BFF | Next.js App Router (TypeScript) | 14.2.3 | App Router for server components and route-level layout; provides the Node BFF so no separate gateway is needed. React 18.3.1. |
| Design system | Bootstrap 5 + UX4G tokens | 5.3.3 | **UX4G Design System is built on Bootstrap 5.** Using Bootstrap classes directly and re-mapping its CSS variables to UX4G tokens gives visual compliance without a bespoke component library. `bootstrap-icons` 1.11.3. |
| Core API | FastAPI (Python 3.12) | 0.111.0 | **Chosen over Fastify.** The differentiating logic — deterministic scoring, ML, Indic NLP — is Python. Putting the API in the same runtime keeps the reproducible score co-located with its models. Next.js already covers the Node BFF need. |
| ORM | SQLAlchemy 2.0 | 2.0.30 | 2.0 style; must preserve PG-native `ENUM`/`JSONB`/`INET` types to stay in sync with `schema.sql`. |
| Validation | Pydantic v2 + pydantic-settings | 2.7.0 / 2.2.1 | `schemas.py` drives the OpenAPI contract, which is itself contract-tested. |
| Queue | **Redis Streams** with consumer groups | redis 7 | **Chosen over Celery.** The queue must be polyglot — Python workers *and* the Node engine ecosystem — and needs consumer groups, pending-entry lists and explicit ack for reclaim/DLQ. Celery's Python-centric model and opaque broker semantics fit neither. |
| Audit engine | Node: Playwright + Lighthouse + axe-core | 1.44.0 / 12.0.0 / 4.9.0 | These are the reference implementations. axe-core is the de-facto standard for WCAG automation; Lighthouse is Google's own CWV measurement. Reimplementing either would forfeit exactly the credibility the platform needs. `chrome-launcher` 1.1.2. |
| Cross-browser | Playwright Chromium + Firefox + WebKit | — | All three baked into the image. WebKit stands in for Safari/iOS, which matters for citizen-facing government sites. |
| Database | PostgreSQL 16 + pgvector | `pgvector/pgvector:pg16` | **The image must be `pgvector/pgvector:pg16`** — plain `postgres:16` fails at `CREATE EXTENSION vector`. Also uses `pgcrypto` (`gen_random_uuid()`) and `citext` (case-insensitive email/URL). |
| Object storage | MinIO (S3-compatible) | latest | Evidence artefacts and public-scan PDFs. S3-compatible so production can use any provider, including on-prem NIC storage. |
| Advisory ML | scikit-learn IsolationForest + XGBoost | 1.5.0 / 2.0.3 | Anomaly detection and finding prioritisation. Advisory only. |
| Design CV | Deterministic pixel analysis (Pillow) | 10.3.0 | **Deliberately not a learned model** — it must live inside the score path, so it must be deterministic. |
| PDF | pypdf + reportlab | 4.2.0 / 4.2.0 | Document accessibility inspection; report and evidence-pack generation. |
| Migrations | Alembic | 1.13.1 | `0001` loads `schema.sql`; `0002`+ are additive. |
| Auth crypto | python-jose | 3.3.0 | HS256 access tokens. |
| Prod server | gunicorn + uvicorn workers | 22.0.0 / 0.30.0 | |
| Testing | pytest + coverage; Vitest; Playwright + `@axe-core/playwright` | — | The platform audits its own frontend for accessibility in e2e. |

---

## 16. Service topology

Six services in `platform/docker-compose.yml`:

```
                      ┌──────────────┐
    browser ─────────▶│  web :3000   │  Next.js (App Router + BFF)
                      └──────┬───────┘
                             │ /api/* proxied
                      ┌──────▼───────┐
                      │  api :8000   │  FastAPI — uvicorn --reload (dev)
                      └──┬────────┬──┘
                         │        │
          ┌──────────────▼──┐  ┌──▼────────────┐
          │ db :5432        │  │ redis :6379   │
          │ pgvector/pg16   │  │ Streams+cache │
          └──────────────▲──┘  └──▲─────────▲──┘
                         │        │         │
        ┌────────────────┴───┐ ┌──┴──────┐ ┌┴───────────────┐
        │ worker             │ │scheduler│ │ public-worker  │
        │ python -m app.worker│ │         │ │                │
        │ ├─ node runner.js  │ └─────────┘ └───────┬────────┘
        │ └─ node compat.js  │                     │
        └────────────────────┘              ┌──────▼──────┐
                                            │ minio :9000 │
                                            │ console:9001│
                                            └─────────────┘
```

| Service | Command | Role |
|---|---|---|
| `db` | — | PostgreSQL 16 + pgvector. Mounts `db/schema.sql` at `/docker-entrypoint-initdb.d/01-schema.sql` — **schema loads automatically on first boot only**. Named volume `pgdata`. |
| `redis` | — | Durable job queue (Streams) + status keys + read-aggregate cache. |
| `minio` | `server /data --console-address ":9001"` | Evidence and PDF object storage. Volume `miniodata`. |
| `api` | `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` | HTTP API. Source bind-mounted → **edits are live, no rebuild needed**. |
| `worker` | `python -m app.worker` | Consumes `govux:audits`, shells out to the Node engine, scores, persists. |
| `scheduler` | `python -m app.services.scheduler` | Polls `schedules` every `GOVUX_SCHEDULER_POLL_SECONDS` (60) and submits due audits. |
| `public-worker` | `python -m app.public_worker` | Consumes `govux:public`; single-concurrency by design. |
| `web` | `npm run dev` | Next.js dev server on :3000. |

**Bind-mount gotcha:** worker-family services mount `./backend:/app` **plus** an anonymous volume
at `/app/audit_engine/node_modules`. Without the second mount the bind shadows the image's
installed `node_modules` and Playwright disappears at runtime. Same pattern for `web` with
`/app/node_modules`.

**Cache/queue separation:** `GOVUX_CACHE_REDIS_URL` can point at a *different* Redis in production
so that a cache flush or eviction can never touch the durable job queue. In dev it defaults to
`GOVUX_REDIS_URL`.

---

## 17. Data model

Canonical definition: `platform/db/schema.sql` (377 lines). Extensions required: `pgcrypto`,
`citext`, `vector`.

### 17.1 Enums (10)

| Enum | Values |
|---|---|
| `user_role` | `owner`, `contributor`, `assessor`, `programme_admin`, `super_admin` |
| `org_type` | `ministry`, `department`, `state`, `ut`, `psu`, `other` |
| `verify_method` | `dns_txt`, `file_upload`, `sso_mapping` |
| `verify_status` | `pending`, `verified`, `failed` |
| `audit_status` | `queued`, `crawling`, `analyzing`, `scoring`, `completed`, `partial`, `failed`, `cancelled`, `insufficient_evidence` |
| `page_status` | `discovered`, `analysed`, `timed_out`, `skipped`, `error` |
| `severity` | `critical`, `high`, `medium`, `low` |
| `finding_state` | `open`, `in_progress`, `resolved`, `not_applicable` |
| `band` | `A`, `B`, `C`, `D`, `E` |
| `publish_mode` | `internal`, `public` |

### 17.2 Tables (22)

**Identity and access**

- **`organisations`** — `id`, `name`, `org_type`, `parent_id` (self-FK, hierarchy), `state_code`,
  `studio_enabled` (default `false`), `created_at`.
- **`users`** — `id`, `email` (`CITEXT UNIQUE`), `org_id`, `display_name`, `role` (default
  `owner`), `is_active`, `last_login_at`. **`CONSTRAINT chk_gov_email CHECK (email ~* '[@.](gov|nic)\.in$')`.**
  No password column, by design.
- **`otp_codes`** — `email`, `code_hash`, `purpose` (`login`|`step_up`), `expires_at`,
  `consumed_at`, `attempts`, `created_ip` (`INET`). OTPs are hashed, single-use, short-TTL.
- **`devices`** — `user_id`, `device_pubkey` (non-extractable device public key, DBSC/WebAuthn
  shaped), `label`, `user_agent`, `last_ip`, `last_location`, `trusted`, `last_active_at`.
- **`sessions`** — `user_id`, `device_id`, `refresh_token_hash`, **`family_id`** (rotation family),
  `expires_at`, `revoked_at`, `rotated_at`.

**Estate**

- **`domains`** — `org_id`, `url` (`UNIQUE`), `tld`, `service_category`
  (`transactional`|`information`|`payments`|…), `size_class` (`large`|`medium`|`small`, used for
  fair segmentation in rankings), `verify_method`, `verify_status`, `verify_token`, `created_by`.
  **`CONSTRAINT chk_gov_domain CHECK (url ~* '(\.gov\.in|\.nic\.in)$')`.**
- **`discovered_domains`** — `url` (`UNIQUE`), `source` (`sitemap`|`robots`|`crawl`|`registry`),
  `seed`, `imported`.

**Audits**

- **`audits`** — the central table. `id` **is the `task_id`**. `domain_id`, `status`, `scope`
  (`JSONB`: pages/depth/devices/browsers/journeys/webhook_url/coverage), `engine_version`,
  `batch_id` (set for bulk/estate scans), `requested_by`, `pages_total`, `pages_done`,
  `overall_score NUMERIC(5,2)`, `band`, `guardrail_active`, `compliance_status`, `method`,
  `confidence`, `field_data` (JSONB, CrUX), `anomaly_score NUMERIC(6,3)` (advisory ML),
  `integrity` (JSONB, anti-gaming), `created_at`/`started_at`/`finished_at`.
- **`audit_scores`** — `PRIMARY KEY (audit_id, category)`, plus `weight` and `score`. The weight is
  stored per row so a historical audit remains explainable after the weights are versioned forward.
- **`audit_pages`** — per-page coverage: `url`, `status`, `device`, `lcp_ms`, `inp_ms`, `cls`,
  `page_score`, `issue_count`, `crawled_at`.
- **`audit_documents`** — `url`, `doc_type` (`pdf`|`docx`|`xlsx`), `pages`, `tagged`, `has_title`,
  `has_lang`, `score`, `issue_count`.
- **`audit_browsers`** — per-engine matrix: `engine`, `loaded`, `status`, `js_errors`,
  `console_errors`, `overflow`, `broken_images`.
- **`findings`** — `audit_id`, `page_id` (`ON DELETE SET NULL`), `guideline_id` (**not an FK**, see
  §13), `category`, `severity`, `effort`, `element`, `evidence_ref` (object-store key),
  `state`, `is_reviewed`, `confidence` (`automated`|`needs_review`|`confirmed`|`advisory`),
  `remediation`, `title`.
- **`guidelines`** — `id` (e.g. `WCAG-1.4.3`), `family`, `category`, `title`, `plain_language`,
  `good_example`, `version`, `embedding vector(768)` (optional).

**Operations and governance**

- **`schedules`** — `domain_id`, `cadence` (`daily`|`weekly`|`monthly`), `enabled`, `next_run_at`,
  `last_run_at`. Indexed `(enabled, next_run_at)` for the scheduler's due-query.
- **`ranking_publications`** — `segment` (JSONB `{category, size_class, org_scope}`), `mode`,
  `approved_by`, `methodology_version`, `published_at`.
- **`public_scans`** — free-scanner results: `url`, `host`, `status`, `requested_by` (NULL =
  anonymous), `overall_score`, `band`, `pdf_key`, `ip` (`INET`), `error`.
- **`scan_requests`** — page-quota escalation: `user_id`, `domain_id`, `requested_pages`, `reason`,
  `status` (`pending`|`approved`|`rejected`), `decided_by`, `decided_at`.
- **`app_settings`** — `key`/`value` runtime configuration overriding env defaults, with
  `updated_by`/`updated_at`. Secret values are encrypted at rest via `services/secretbox.py`.
- **`audit_log`** — `BIGSERIAL`, `actor_id`, `action`, `target`, `ip`, `device_id`, `detail`
  (JSONB). Tamper-evident accountability trail.

**Sub-products**

- **`studio_runs`** — `org_id`, `requested_by`, `status` (`generating`|`scored`|`failed`),
  `inputs` (JSONB), `pages` (JSONB `{filename: html}`), `overall_score`, `band`, `iterations`,
  `findings`, `input_tokens`, `output_tokens`, `cost_inr`, `published`, `public_slug` (UNIQUE),
  `title`.
- **`external_assessments`** — `org_id`, `domain_id`, `kind` (`vapt` | `native_app_a11y` |
  `lived_experience_panel` | `stqc_certification` | `other`), `title`, `agency`, `assessed_on`,
  `outcome` (`passed`|`failed`|`partial`|`in_progress`), `summary`, `report_ref`, `created_by`.

### 17.3 Indexing notes

Every FK used in a join or report is indexed. Two are worth calling out:

- `idx_audit_completed_score` — **partial** index `ON audits(overall_score DESC) WHERE status = 'completed'`.
  The league/rankings sort only ever reads completed audits; a partial index keeps it small.
- `idx_studio_slug` — partial, `WHERE published`.

### 17.4 Migrations

Alembic, `backend/migrations/versions/`, head `0011`:

| Rev | Purpose |
|---|---|
| `0001_initial` | Loads `db/schema.sql` |
| `0002_gap_closure` | Gap-closure columns/tables (additive) |
| `0003_browser_matrix_ml` | `audit_browsers`, `anomaly_score` |
| `0004_public_scans` | Free scanner |
| `0005_app_settings` | Runtime configuration |
| `0006_fk_indexes` | FK and sort indexes |
| `0007_insufficient_evidence` | `insufficient_evidence` status |
| `0008_studio_runs` | GovUX Studio |
| `0009_studio_tenant_publish` | `studio_enabled`, publish/showcase |
| `0010_integrity` | `audits.integrity` |
| `0011_external_assessments` | Manual-assurance ledger |

`0001` loading `schema.sql` wholesale means **`schema.sql` is the source of truth and Alembic
is the delivery mechanism for changes to it** — not an independent definition.

---

## 18. API surface

FastAPI, title from `GOVUX_APP_NAME`, version `1.1`. Interactive docs at `/docs`. All business
routes under `/v1`.

**Global middleware:** every response carries `X-Request-ID` (echoed from the request or
generated), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: geolocation=(), camera=(), microphone=()`, and — in production only —
`Strict-Transport-Security: max-age=63072000; includeSubDomains`. As the comment in `main.py`
puts it: an audit platform that flags others for missing headers must set its own.

**Global exception handler:** never leaks a stack trace. Logs with the request id and returns a
500 with a referenceable message and the `request_id` in the body.

**CORS:** `allow_origins` from `GOVUX_CORS_ORIGINS`, `allow_credentials=True` (required for the
HttpOnly refresh cookie).

### Ops (3, unauthenticated except `/metrics`)

| Method | Path | Notes |
|---|---|---|
| GET | `/healthz` | Liveness. No dependencies. Returns engine version. |
| GET | `/readyz` | Readiness — checks Postgres and Redis. **503** when not ready. Orchestrators must poll this, not `/healthz`. |
| GET | `/metrics` | Prometheus. Toggleable via `app_settings.metrics_enabled`; bearer token via `metrics_token`. **In production a token is mandatory** — an open `/metrics` leaks queue and DB internals. |

### `auth` — `/v1/auth` (9)

| Method | Path | Access |
|---|---|---|
| GET | `/me` | authenticated |
| GET | `/me/export` | authenticated — DPDP data portability |
| DELETE | `/me` | authenticated — DPDP erasure |
| POST | `/otp/request` | public → **202** |
| POST | `/otp/verify` | public → `TokenPair` + sets `govux_rt` cookie |
| POST | `/refresh` | refresh cookie → `TokenPair` |
| POST | `/logout` | authenticated → **204** |
| GET | `/devices` | authenticated |
| DELETE | `/devices/{device_id}` | authenticated → **204** |

### `domains` — `/v1/domains` (3)

`GET ""` (list, org-scoped) · `POST ""` → **201** · `POST /{domain_id}/verify`

### `audits` — `/v1` (12)

| Method | Path | Notes |
|---|---|---|
| POST | `/audits` | **202** `{task_id, status_url}`. Advisory-lock guarded. |
| GET | `/audits` | List |
| GET | `/audits/{task_id}` | Status |
| GET | `/audits/{task_id}/report` | Full report |
| GET | `/audits/{task_id}/remediation` | Advisory guidance, ranked |
| GET | `/audits/{task_id}/documents` | Document a11y results |
| POST | `/audits/{task_id}/review` | **assessor** — the only path to `compliant` |
| GET | `/audits/{task_id}/evidence` | Deterministic STQC evidence ZIP |
| GET | `/audits/{task_id}/trend` | Score history |
| GET | `/domains/{domain_id}/audits` | Domain history |
| GET | `/domains/{domain_id}/compare` | Compare runs |
| POST | `/bulk-scans` | **202** — estate scan, sets `batch_id` |

### `rankings` — `/v1` (4) · all `require_role("programme_admin", "super_admin")`

`GET /national` · `GET /rankings` · `GET /ministries` · `GET /states`

### `library` — `/v1` (2)

`GET /guidelines` · `PATCH /findings/{finding_id}` (finding state transitions)

### `monitoring` — `/v1` (5)

`POST /schedules` **201** · `GET /schedules` · `DELETE /schedules/{schedule_id}` **204** ·
`POST /discovery/scan` **(programme_admin/super_admin)** · `GET /discovery` **(same)**

### `ci` — `/v1/ci` (1)

`GET /gate` — CI/CD pass-fail gate.

### `public` — `/v1/public` (8, unauthenticated)

`POST /scan` **202** · `GET /captcha` · `GET /scan/{scan_id}` · `GET /scan/{scan_id}/pdf` ·
`GET /stats` · `GET /queue` · `GET /showcase/{slug}` · `GET /showcase/{slug}/{filename}` (HTML)

### `scan_requests` — `/v1/scan-requests` (3)

`POST ""` **201** · `GET ""` · `PATCH /{req_id}` **(programme_admin/super_admin)**

### `admin_config` — `/v1/admin/config` (4) · all `require_role("programme_admin", "super_admin")`

`GET ""` · `PATCH ""` · `POST /test-email` · `GET /metrics-summary`

### `studio` — `/v1/studio` (7)

`GET /tenants` **(super_admin)** · `PATCH /tenants/{org_id}` **(super_admin)** · `POST ""` **202** ·
`GET ""` · `GET /{run_id}` · `POST /{run_id}/publish` · `GET /{run_id}/preview/{filename}` (HTML) ·
`GET /{run_id}/download`

### `assessments` — `/v1/assessments` (2)

`POST ""` **201** · `GET ""`

**Contract testing:** the OpenAPI document is snapshotted in `backend/tests/openapi_contract.json`
and asserted by `test_openapi_contract.py`. Changing an endpoint shape without updating the
snapshot fails CI — deliberate, because the frontend and CI consumers depend on it.

---

## 19. Authentication and session design

This is the most security-sensitive subsystem and the one most likely to be recreated
incorrectly. `app/security.py`, `app/routers/auth.py`, `app/deps.py`.

### 19.1 Model

**Passwordless, gov-email OTP, device-bound rotating refresh tokens.**

- **No passwords exist anywhere.** No column, no hash, no reset flow.
- **Access token:** JWT HS256, `GOVUX_JWT_SECRET`, TTL 15 minutes. Claims include `sub` (user id),
  role, and device id. Held **in memory only** on the client — never `localStorage`.
- **Refresh token:** opaque random, hashed in `sessions.refresh_token_hash`, TTL 60 days,
  delivered as cookie `govux_rt` with `HttpOnly; Secure; SameSite=Strict; Path=/`.
- **Device binding:** each session references a `devices` row holding a non-extractable device
  public key (DBSC/WebAuthn shaped).
- **Rotation families:** every refresh mints a new token in the **same `family_id`**.

### 19.2 The OTP flow

1. `POST /v1/auth/otp/request` — validates the suffix against `GOVUX_ALLOWED_EMAIL_SUFFIXES`,
   generates a 6-digit code, stores only its hash with a 5-minute TTL and `created_ip`, and emails
   it. **In dev only, the response includes `dev_otp`.** Returns **202**.
2. `POST /v1/auth/otp/verify` — checks hash, expiry and `attempts` (max
   `GOVUX_OTP_MAX_ATTEMPTS = 5`), marks `consumed_at`, upserts the device, creates a session, and
   returns the token pair. **New users are created as `owner`.**

### 19.3 Brute-force and abuse control

| Control | Setting | Default |
|---|---|---|
| OTP requests per IP per hour | `GOVUX_OTP_REQUEST_IP_LIMIT` | 6 |
| Failed sign-ins before lock-out | `GOVUX_OTP_FAIL_THRESHOLD` | 3 |
| First lock duration | `GOVUX_OTP_LOCK_SECONDS` | 600s |
| Escalated lock (+ CAPTCHA) | `GOVUX_OTP_LOCK_SECONDS_2` | 1200s |

Lock-out responses return a **structured** `detail` object — `{message, retry_after, captcha_required}` —
not a plain string. The frontend API client handles both shapes; a recreation that assumes
`detail` is always a string will show `[object Object]` to locked-out users.

### 19.4 Refresh rotation, reuse detection, and the race that breaks it

The naive implementation — look up the token, check `revoked_at`, revoke it, mint a new one — has
a serious flaw in a real browser. Two components can both hit a stale access token right after a
page reload and fire two concurrent `/refresh` calls with the same cookie. Both read
`revoked_at IS NULL`, both "win", both mint rotations. The next request presenting the
now-already-revoked original trips reuse detection and **kills the entire session family** —
including the sibling sessions just issued. The user is logged out for being correct.

The implemented fix (currently uncommitted on branch `amanmittal`) has two parts:

**1. Atomic claim.** Rotation is a single `UPDATE ... WHERE refresh_token_hash = :h AND revoked_at IS NULL
... RETURNING user_id, device_id, family_id`. Postgres serialises concurrent updates on the row,
so exactly one caller can claim it.

**2. A bounded reuse grace window.** A caller that loses the claim inspects the row:

- Row missing → 401 "Invalid session".
- Expired → 401 "Session expired".
- `revoked_at IS NULL` → 401 (lost the race unexpectedly).
- Otherwise, determine **why** it was revoked. Our own rotation sets `revoked_at` and `rotated_at`
  *together*, so `rotated_at == revoked_at` identifies it. A family-wide theft cascade or an
  explicit sign-out/device-revoke sets **only** `revoked_at`.
  - If it was **not** our own rotation, **or** more than `GOVUX_REFRESH_REUSE_GRACE_SECONDS`
    (default 10s) have passed → genuine reuse. Revoke the whole family. 401.
  - If it **was** our own rotation within the grace window → benign race. Rotate again from the
    same lineage and return a valid session.

**The subtlety that must not be lost in a rewrite:** grace forgiveness applies *only* to the
self-rotation case. A logged-out or cascade-killed session must stay dead no matter how recently
it died. Getting this wrong turns "sign out" into "sign out for ten seconds".

### 19.5 Sign-out and idle timeout

- `POST /v1/auth/logout` revokes the session server-side and clears the cookie → **204**.
- **Idle policy, separate from token TTL:** `AppShell.tsx` warns at **19 minutes** of inactivity
  with an accessible `role="alertdialog"` countdown and auto-signs-out at **20 minutes**.

These are two different clocks and both are needed. The 15-minute access token expiring is
invisible — `lib/api.ts` silently refreshes and retries, which is what makes a page reload resume
the session. The idle timer is what actually ends a session on an unattended machine.

### 19.6 Client token handling

`frontend/lib/api.ts`: access token in a module-scoped variable; all requests
`credentials: "include"`; on **401**, one silent `POST /v1/auth/refresh` and one retry; if that
fails, clear the token, redirect to `/login` (except for `/v1/auth/*` calls, so the login page
itself does not loop), and throw `AuthError`.

---

## 20. The audit pipeline

`POST /v1/audits` → `app/worker.py: process()`. The order below is load-bearing.

**Submission (`routers/audits.py`)**
1. Resolve and authorise the domain (org-scoped, must be `verified`).
2. `SELECT pg_advisory_xact_lock(hashtext('govux-audit'), hashtext(:domain_id))` — a per-domain
   transaction advisory lock, auto-released on commit, closing the TOCTOU window between the
   "already running?" check and the insert.
3. If an audit is already `queued|crawling|analyzing|scoring` for that domain, **return its
   existing `task_id`** rather than creating a duplicate.
4. Insert the `audits` row with `status='queued'`, `engine_version`, and
   `scope = {depth, devices, browsers, webhook_url}`.
5. `queue.ensure_group()`, `queue.enqueue_audit(task_id, {domain, scope})`.
6. Return **202** `{task_id, status_url}`.

**Processing (`worker.process`)**
1. `status = crawling`, set `started_at`, mirror status into Redis.
2. **Run the engine** — `node runner.js '{"url":…, "screenshotPath":…, "depth":…}'`, 600s timeout,
   JSON on stdout. Non-zero exit ⇒ `RuntimeError` with the last 500 chars of stderr.
3. `status = analyzing`. Record crawl coverage (sitemap size vs pages audited) into `scope.coverage`
   for honest reporting.
4. **Coverage-confidence gate** (§11) — if the home page was unreachable or zero pages analysed,
   write `insufficient_evidence`, no score, no band, `compliance_status = not_assessed`, plus an
   explanatory finding, and **return**.
5. **Design CV** — `design_cv.score_from_path(screenshot)` overwrites `categories["design"]`; the
   screenshot is deleted afterwards.
6. **CrUX blend** — if a key is configured and field data exists, `crux.blend()` the performance
   category and store `audits.field_data`.
7. `status = scoring`. **`compute_score(categories)`** → merge eight `audit_scores` rows, each with
   its weight.
8. **Cross-browser matrix** — `node compat.js <url>`, 420s timeout; persist `audit_browsers` rows;
   synthesise responsiveness findings (`critical` if a browser fails to load, `high` on overflow,
   `low` on broken images).
9. **Documents** — fetch and audit up to `max_documents_per_audit` discovered documents through the
   **SSRF-guarded** `url_validate.guarded_get` (validates every redirect hop, blocks
   loopback/internal/reserved resolutions, caps size). Engine-discovered document URLs are
   attacker-influenced input.
10. **Findings** — sort by severity, count critical accessibility failures, attach
    `remediation.guidance_for(f)`, insert with `confidence="automated"`.
11. **Integrity Engine** — `integrity.assess(findings, overall, previous_overall, enabled=…)` →
    `audits.integrity`. Caps the verdict only.
12. **Compliance verdict** — `compliance_verdict(categories, critical_a11y, reviewed=False, integrity_flagged=…)`
    → `compliance_status`, `method`, `confidence`.
13. **Per-page coverage** — insert `audit_pages`; set `pages_total`/`pages_done`.
14. Write `overall_score`, `band`, `guardrail_active`; `status = completed`; `finished_at`;
    **commit**.
15. **Advisory ML** — *after* the commit: anomaly score, optional advisory finding. Wrapped in
    `try/except` — advisory failure must never fail an audit.
16. **Cache invalidation** — drop the `national`, `rankings`, `ministries`, `states` and `domains`
    prefixes.
17. **Webhook** — if `scope.webhook_url` is set, POST the result. Wrapped in `try/except`: a
    webhook error must never fail a completed audit.

**Reliability**
- **Ack only on success.** `queue.ack(entry_id)` runs only if `process()` returned cleanly; failures
  stay in the Redis pending-entry list.
- **Reclaim.** Each worker uses a unique consumer name (`HOSTNAME`, or `py-worker-<pid>` locally) so
  replicas scale horizontally and a dead consumer's in-flight jobs can be reclaimed. Every 6th tick
  (`ticks % 6 == 0`) the worker calls `queue.reclaim_stale(consumer)` and processes what it
  reclaims; poison messages go to a DLQ.
- **Failure path.** Any exception sets `status = 'failed'` and publishes the error (truncated to 200
  chars) to the Redis status key.

---

## 21. The Node audit engine

`platform/backend/audit_engine/` — ES modules (`"type": "module"`), 851 lines total. Invoked by the
Python worker via `subprocess.run`, receiving a JSON argument and returning JSON on stdout. Keeping
it a subprocess rather than a service is deliberate: it gives per-run isolation and a hard timeout
for a component that drives three real browsers.

| File | Lines | Role |
|---|---:|---|
| `runner.js` | 503 | Main audit: crawl, per-page audit, all category scoring, findings, dedupe |
| `perf.js` | 84 | Lighthouse / Core Web Vitals |
| `compat.js` | 73 | Cross-browser matrix — Chromium, Firefox, WebKit |
| `lang.js` | 60 | Script-aware multilingual/Indic content detection |
| `evidence.js` | 54 | Evidence artefact capture |
| `deep.js` | 46 | Deep-crawl helpers |
| `gigw-rules.js` | 31 | GIGW 3.0 mandatory-element rules |

**`runner.js` functions in order:** `readInput` → `normalizeUrl` → `accessibility` (axe-core) →
`responsiveness` (multi-viewport) → `gigw` → `content` → `trust` → `overlays` (integrity) →
`usability` → `discoverLinks` → `fetchText` / `sitemapPages` → `diversify` → `brokenLinks` →
`performance` (Lighthouse) → `auditLoaded` → `auditPage` → `dedupe` → `main`.

**`diversify(urls, cap)`** matters more than its size suggests: given a large sitemap it selects a
*spread* of page types rather than the first N URLs, which on most government portals would be 25
near-identical news items. Coverage quality, not just coverage count.

**Constants:** `MAX_CRAWL = 25`, `MAX_LINKCHECK = 30`, `MAX_DOCS = 12`. A desktop Chrome UA string
is set explicitly (`UA`) — many government sites serve different markup to unknown agents.

**Timeouts:** main runner 600s, compat 420s (enforced Python-side).

**Install note:** `package.json` has `"postinstall": "playwright install chromium"`, but the Docker
image must install **all three** browser engines for `compat.js` to work.

---

## 22. Frontend architecture

Next.js 14.2.3 App Router, TypeScript, React 18.3.1.

### 22.1 Routes (36)

**Public/auth:** `/login`, `/scan`, `/report`, `/showcase/[slug]`

**Officer:** `/dashboard`, `/domains`, `/domains/new`, `/audits`, `/audits/new`, `/audits/[id]`
and its sub-views `compare`, `compatibility`, `documents`, `issues`, `remediation`, `report`,
`trends`; `/library`, `/review`, `/assessments`, `/settings`, `/studio`

**Programme admin (`/admin/*`):** `alerts`, `approvals`, `bulk-scan`, `config`, `discovery`,
`league`, `methodology`, `ministries`, `monitoring`, `national`, `standards`, `states`,
`studio-access`

### 22.2 Design system

UX4G Design System 3.0 is built on **Bootstrap 5**, so the frontend uses Bootstrap component
classes directly (`container`, `row`/`col`, `card`, `btn btn-primary`, `form-control`,
`table table-hover`, `badge`, `alert`, `bi-*` icons) and re-maps Bootstrap's CSS variables to
UX4G tokens in `app/ux4g-theme.css`: `--bs-primary`, `--bs-body-color`, `--bs-border-radius`,
`--bs-font-sans-serif`, deep-blue headings via `--ux-navy` (#0a3d7a), the tricolour strip, and
score-band utilities.

Load order in `app/layout.tsx` is significant: `bootstrap.min.css` → `ux4g-theme.css` (overrides)
→ `globals.css`. Font via `next/font` (Inter); production should swap to the exact UX4G font and
add **Noto Sans** for Indic scripts.

### 22.3 Shared modules

- **`components/AppShell.tsx`** — the shell every authenticated page wraps in. Owns navigation
  (role-aware), the sign-out control, and the idle-timeout policy (19-minute warning dialog,
  20-minute auto sign-out).
- **`lib/api.ts`** — the only HTTP client. In-memory access token, `credentials: "include"`,
  single silent refresh + retry on 401, structured-vs-string `detail` handling, `AuthError`.
- **`lib/score.ts`** — band/colour/formatting helpers, kept in one place so the band mapping cannot
  drift between screens.

### 22.4 The screen contract

`platform/scripts/verify_screens.py` asserts every route renders and is reachable from `AppShell`
navigation. **Every new screen must use `AppShell`, fetch through `lib/api.ts`, appear in nav, and
pass `verify_screens.py`.** A screen that exists but is unreachable is a bug the script is designed
to catch.

---

## 23. Failure modes

How the system behaves when the audited site misbehaves. Preserve these behaviours.

| Situation | Behaviour |
|---|---|
| Home page unreachable (timeout / WAF / geo-block) | Audit ends `insufficient_evidence`, **no score, no band**, `compliance_status = not_assessed`, plus a high-severity `trust` finding naming the cause and the remedy (allowlist the audit egress IPs, re-run). §11. |
| Zero pages analysed | Same as above. |
| Engine exits non-zero | `RuntimeError` with the last 500 chars of stderr → audit `failed`, error published to the Redis status key (truncated to 200 chars). |
| Engine exceeds 600s | `subprocess.TimeoutExpired` → audit `failed`. |
| Cross-browser matrix fails | Logged and swallowed — returns no browser findings. The audit still completes. A partial matrix must not sink a whole audit. |
| A browser in the matrix fails to load the site | Persisted as `loaded=false` plus a **critical** responsiveness finding. |
| Document fetch fails or is not a valid PDF | That document is skipped silently (`continue`); other documents and the audit proceed. |
| Document URL resolves to an internal/loopback/reserved address | Blocked by `url_validate.guarded_get` — every redirect hop validated, size capped. |
| Design CV fails | Logged; the engine's own design value stands. |
| CrUX unavailable or no key | Lab-only performance; `field_data` stays null. |
| Duplicate audit submitted for a domain | Advisory lock + running-check returns the **existing** `task_id`. |
| Worker crashes mid-job | Job stays in the pending-entry list; a peer reclaims it via `reclaim_stale`. Poison messages go to the DLQ. |
| ML advisory fails | Logged and swallowed — the score is already committed. |
| Webhook POST fails | Logged and swallowed — the audit stays `completed`. |
| Redis unreachable | `/readyz` returns **503**; orchestrators stop routing traffic. |
| Postgres unreachable | `/readyz` returns **503**. |
| Unhandled API exception | 500 with a friendly message plus `request_id`; full detail only in logs. |
| Free scan over IP quota | CAPTCHA required (`captcha_required` in the structured error). |
| Account over failed-sign-in threshold | Lock-out with `retry_after`; escalates to a longer lock plus CAPTCHA. |

---

## 24. Scale envelope

Design targets and the levers that move them.

| Dimension | Value | Lever |
|---|---|---|
| Pages fully audited per run | 25 max | `MAX_CRAWL` in `runner.js`; per-run `depth` in `audits.scope` |
| Free-tier pages for registered users | 10 | `GOVUX_FREE_REGISTERED_PAGES`; more requires `/v1/scan-requests` approval |
| Links probed for broken-link QA | 30 | `MAX_LINKCHECK` |
| Documents audited per run | 10 (engine discovers up to 12) | `GOVUX_MAX_DOCUMENTS_PER_AUDIT` / `MAX_DOCS` |
| Browser engines per run | 3 (Chromium, Firefox, WebKit) | `compat.js` |
| Main engine timeout | 600s | `worker.run_engine` |
| Compat timeout | 420s | `worker.run_compat` |
| Typical audit wall-clock | Minutes, dominated by Playwright + Lighthouse | — |
| Audit worker concurrency | 1 job at a time per replica; scale horizontally | Replica count — each gets a unique consumer name |
| Public scanner concurrency | 1, deliberately | `public_worker.py` — protects the paid queue |
| Free scans per IP | 3 per 24h, then CAPTCHA | `GOVUX_SCAN_IP_LIMIT`, `GOVUX_SCAN_IP_WINDOW` |
| DB pool per API process | 10 + 20 overflow, 30s timeout | `GOVUX_DB_POOL_SIZE`, `GOVUX_DB_MAX_OVERFLOW`, `GOVUX_DB_POOL_TIMEOUT` — tune against `max_connections` |
| Scheduler poll | 60s | `GOVUX_SCHEDULER_POLL_SECONDS` |
| Target estate | 2,000+ government domains | Bulk scans via `batch_id`; auto-discovery |

**The scaling shape to understand:** audit throughput is bounded by browser-driving worker
replicas, not by the API. Scale `worker` replicas; the API, Postgres and Redis are nowhere near the
bottleneck at this workload. Cached read aggregates (`services/cache.py`) keep the national and
rankings views cheap regardless of estate size.

---
---

# Part D — Build it from zero

## 25. Reconstruction plan

Ten phases, ordered so each is independently verifiable. Do not proceed past a phase whose
definition of done is unmet — later phases assume the invariants hold.

### Phase 0 — Skeleton and contracts
Create `platform/` with `backend/` (FastAPI + `requirements.txt` + Dockerfile with Node, Python
3.12 and all three Playwright browsers), `frontend/` (Next.js 14 + TS + Bootstrap 5), `db/`, and
`docker-compose.yml` with the six services. Write `CLAUDE.md` with the five invariants **first** —
they constrain everything after.
**Done when:** `docker compose up --build` starts all six; `/healthz` returns ok.

### Phase 1 — Schema
Write `db/schema.sql`: extensions, 10 enums, 22 tables, both `CHECK` constraints, all indexes
including the two partial ones. Mirror it in `app/models.py` with PG-native types. Alembic `0001`
loads `schema.sql`.
**Done when:** a fresh `db` volume auto-loads the schema; `alembic upgrade head` is clean; a test
asserts both gov-domain `CHECK`s reject a non-gov value.

### Phase 2 — Auth
`security.py` (OTP generation/hashing, JWT issue/decode, refresh mint/hash/expiry), `deps.py`
(`current_user`, `optional_user`, `require_role`), `routers/auth.py` (all 9 endpoints).
Implement rotation as an **atomic claim** with the bounded reuse grace from the start (§19.4) —
retrofitting it is far harder than building it right.
**Done when:** OTP request→verify→refresh→logout works end to end; replaying a rotated token
outside the grace window kills the family; replaying inside it does not; a logged-out session stays
dead regardless of timing.

### Phase 3 — Domains and org scoping
`routers/domains.py`: list (org-scoped), create (gov-suffix validated), verify (`dns_txt`,
`file_upload`).
**Done when:** a user cannot see or audit another org's domain; unverified domains cannot be
audited.

### Phase 4 — Queue and worker skeleton
`services/queue.py` on Redis Streams: `ensure_group`, `enqueue_audit`, `read_jobs`, `ack`,
`reclaim_stale`, `set_status`. `worker.py` loop with unique consumer names, ack-on-success-only,
periodic reclaim. `routers/audits.py: POST /audits` with the advisory lock, returning **202**.
**Done when:** a submitted audit walks its statuses with a stubbed engine; killing a worker
mid-job lets a peer reclaim it; a duplicate submit returns the existing `task_id`.

### Phase 5 — The scoring engine
`services/scoring.py`: `CATEGORY_WEIGHTS`, `BANDS`, `GUARDRAILS`, `compute_score`, `explain`,
`compliance_verdict`. Write `tests/test_scoring_validation.py` **alongside**, asserting: weights
sum to 100; determinism; contributions sum to overall; guard-rail caps at C; automated-only never
yields `compliant`; every verdict branch.
**Done when:** those invariant tests pass and would fail if a weight were nudged.

### Phase 6 — The Node engine
`audit_engine/`: `runner.js` and the six helpers. Wire `worker.run_engine` / `run_compat` with
their timeouts. Implement the **coverage-confidence gate** in the worker at this point, before any
real scoring path exists that could bypass it.
**Done when:** a real `.gov.in` audit reaches `completed` with a band; an unreachable host reaches
`insufficient_evidence` with a null band.

### Phase 7 — Enrichment and gap closure
Design CV, CrUX blend, PDF/document audit (behind the SSRF guard), cross-browser matrix,
remediation guidance, broken-link QA, multilingual, evidence pack, integrity engine, scheduler,
discovery, CI gate, webhook.
**Done when:** each of G1–G8, G10, G12 has a passing test; G9/G11/G13 are represented in
`external_assessments`.

### Phase 8 — Frontend
`AppShell` (nav + sign-out + idle timeout), `lib/api.ts` (in-memory token, silent refresh),
`lib/score.ts`, `ux4g-theme.css`, then the 36 routes. Officer flow first, `/admin/*` second.
**Done when:** `python3 scripts/verify_screens.py` passes; every route is reachable from nav;
Playwright + axe e2e is green.

### Phase 9 — Ops, advisory, sub-products
`/readyz`, `/metrics` (token-gated in prod), `services/cache.py` invalidation, `settings_store` +
`secretbox`, `audit_log`, advisory ML (`ml_train`), then Studio and the public scanner with their
separate stream and worker.
**Done when:** `/readyz` flips to 503 when Redis is stopped; `/metrics` refuses to serve in
production without a token; the coverage gate holds at ≥80%.

---

## 26. Local bring-up

```bash
cd platform && docker compose up --build
```

```bash
docker compose exec api python -m app.seed
```

| Surface | URL |
|---|---|
| Frontend | http://localhost:3000/login |
| API | http://localhost:8000 |
| OpenAPI docs | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 (`govux` / `govux-secret`) |
| Postgres | `localhost:5432` (`govux` / `govux` / `govux`) |

**Sign in:** enter one of the five role accounts (§3) or a seeded address; read the `dev_otp` field
from the `/v1/auth/otp/request` response and submit it.

**Seed data** (`python -m app.seed`) creates the org "Department of Posts (India Post)", an `owner`
(`d.nayak@indiapost.gov.in`), a `programme_admin` (`steward@indiapost.gov.in`), three domains
(`indiapost.gov.in`, `ncsc.dop.gov.in`, `ippbonline.gov.in`), a monitoring schedule and a couple of
discovered domains. It is idempotent — it no-ops if the steward already exists.

**Bring-up gotchas**

1. **`db/schema.sql` loads only on an empty volume.** Postgres runs
   `/docker-entrypoint-initdb.d/*` on first init only. After a schema change either run the Alembic
   migration or `docker compose down -v` (destroys data).
2. **The db image must be `pgvector/pgvector:pg16`.** Plain `postgres:16` fails on
   `CREATE EXTENSION vector`.
3. **Source is bind-mounted — edits are live.** Do not rebuild to see a Python or TSX change.
   Rebuild only when `requirements.txt`, `package.json` or a Dockerfile changes.
4. **Never remove the anonymous `node_modules` volumes** from `worker`, `scheduler`,
   `public-worker` or `web`; the bind mount will shadow the installed modules.
5. **Dev Redis has no volume and `appendonly no`.** A Redis restart drops queued jobs, leaving
   orphaned `queued` rows with no message behind them. Prod compose is configured correctly. See
   §33 — there is no reconciler for this yet.
6. **Verify narrowly.** Run the one affected test, not the suite.

**Useful commands**

```bash
docker compose exec api pytest tests/test_scoring_validation.py -q
```

```bash
docker compose exec api alembic upgrade head
```

```bash
python3 scripts/verify_screens.py
```

---

## 27. Configuration reference

All backend settings are env-driven with the prefix **`GOVUX_`** (`app/config.py`,
pydantic-settings). List-valued settings accept comma-separated strings.

### Application

| Env | Default | Notes |
|---|---|---|
| `GOVUX_APP_NAME` | `GovUX Audit Platform API` | |
| `GOVUX_ENGINE_VERSION` | `v3.2` | Stamped on every audit; part of the reproducibility contract |
| `GOVUX_ENV` | `dev` | **`production` enables fail-fast checks** |
| `GOVUX_CORS_ORIGINS` | `http://localhost:3000` | CSV of browser origins; credentialed CORS |

### Data

| Env | Default | Notes |
|---|---|---|
| `GOVUX_DATABASE_URL` | `postgresql+psycopg://govux:govux@db:5432/govux` | |
| `GOVUX_REDIS_URL` | `redis://redis:6379/0` | **Durable queue** |
| `GOVUX_CACHE_REDIS_URL` | `""` → falls back to `REDIS_URL` | Point at a separate Redis in prod so a cache flush cannot touch the queue |
| `GOVUX_DB_POOL_SIZE` | `10` | Per API process |
| `GOVUX_DB_MAX_OVERFLOW` | `20` | |
| `GOVUX_DB_POOL_TIMEOUT` | `30` | |

### Auth

| Env | Default | Notes |
|---|---|---|
| `GOVUX_JWT_SECRET` | `change-me-in-prod` | **Must be set in production** |
| `GOVUX_JWT_ALG` | `HS256` | |
| `GOVUX_SECRET_KEY` | `""` | Encrypts settings secrets at rest. **Required in prod and must differ from the JWT secret** — enforced at startup by `secretbox.assert_production_key` |
| `GOVUX_ACCESS_TTL_SECONDS` | `900` (15 min) | |
| `GOVUX_REFRESH_TTL_SECONDS` | `5184000` (60 days) | |
| `GOVUX_REFRESH_REUSE_GRACE_SECONDS` | `10` | Benign-race window for concurrent refresh (§19.4) |
| `GOVUX_OTP_TTL_SECONDS` | `300` (5 min) | |
| `GOVUX_OTP_MAX_ATTEMPTS` | `5` | |
| `GOVUX_ALLOWED_EMAIL_SUFFIXES` | `.gov.in,.nic.in` | |

### Queue

| Env | Default |
|---|---|
| `GOVUX_AUDIT_STREAM` | `govux:audits` |
| `GOVUX_CONSUMER_GROUP` | `workers` |
| `GOVUX_PUBLIC_SCAN_STREAM` | `govux:public` |
| `GOVUX_PUBLIC_CONSUMER_GROUP` | `public-workers` |

### Engine and scheduling

| Env | Default | Notes |
|---|---|---|
| `GOVUX_CRUX_API_KEY` | `""` | Blank ⇒ lab-only performance |
| `GOVUX_SCHEDULER_POLL_SECONDS` | `60` | |
| `GOVUX_WEBHOOK_TIMEOUT_SECONDS` | `10` | |
| `GOVUX_MAX_DOCUMENTS_PER_AUDIT` | `10` | |

### Free scanner and abuse control

| Env | Default | Notes |
|---|---|---|
| `GOVUX_FREE_REGISTERED_PAGES` | `10` | Beyond this needs approval |
| `GOVUX_FREE_SCAN_SUFFIXES` | `.gov.in,.nic.in` | SSRF/abuse guard |
| `GOVUX_SCAN_IP_LIMIT` | `3` | Free scans per IP before CAPTCHA |
| `GOVUX_SCAN_IP_WINDOW` | `86400` | Seconds |
| `GOVUX_OTP_REQUEST_IP_LIMIT` | `6` | Per hour |
| `GOVUX_OTP_FAIL_THRESHOLD` | `3` | |
| `GOVUX_OTP_LOCK_SECONDS` | `600` | |
| `GOVUX_OTP_LOCK_SECONDS_2` | `1200` | Escalated, + CAPTCHA |
| `GOVUX_CAPTCHA_SECRET` | `""` | Turnstile / reCAPTCHA in prod |

### Object storage

| Env | Default |
|---|---|
| `GOVUX_S3_ENDPOINT` | `http://minio:9000` |
| `GOVUX_S3_BUCKET` | `govux-reports` |
| `GOVUX_S3_ACCESS_KEY` | `govux` |
| `GOVUX_S3_SECRET_KEY` | `govux-secret` |
| `GOVUX_S3_REGION` | `us-east-1` |

### Runtime settings (`app_settings` table, not env)

Admin-editable at runtime via `PATCH /v1/admin/config`, overriding env defaults; secrets are
encrypted at rest with `GOVUX_SECRET_KEY`.

| Key | Default | Purpose |
|---|---|---|
| `integrity_enabled` | `true` | Integrity Engine feature flag |
| `metrics_enabled` | `true` | `/metrics` on/off |
| `metrics_token` | `""` | Bearer token; **mandatory in production** |
| `llm_api_key` | `""` | Anthropic API key for Studio |
| `llm_model` | `claude-haiku-4-5-20251001` | Studio generation model |
| SMTP settings | — | Outbound OTP email; testable via `POST /v1/admin/config/test-email` |

### Production `.env` minimum

```
POSTGRES_PASSWORD=<strong random>
GOVUX_JWT_SECRET=<32+ random chars>
GOVUX_SECRET_KEY=<32+ random chars, DIFFERENT from JWT secret>
GOVUX_CORS_ORIGINS=https://govux.gov.in
GOVUX_ENV=production
```

The API **refuses to boot** in production if `GOVUX_SECRET_KEY` is unset or equal to the JWT
secret. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

---

## 28. Testing and quality gates

### Backend — pytest

221 tests across 36 files. `pytest.ini` sets `--cov=app --cov-report=term-missing --cov-fail-under=80`,
so **coverage below 80% fails the run**, not just the report. Actual coverage is around 92%.

```bash
docker compose exec api pytest
```

Notable suites: `test_scoring_validation.py` (the invariant lock), `test_scoring.py`,
`test_db_constraints.py` (both gov `CHECK`s), `test_openapi_contract.py` (snapshot contract),
`test_security.py` / `test_security_hardening.py` / `test_sast_fixes.py`,
`test_worker_reliability.py` (reclaim/DLQ), `test_url_validate.py` (SSRF guard),
`test_abuse.py` / `test_quota.py`, `test_integrity.py`, `test_studio.py`, `test_dpdp.py`,
`test_integration.py`.

**Rules:** every new endpoint gets a test; scoring changes must keep
`test_scoring_validation.py` green; a changed API shape must update the OpenAPI snapshot
deliberately.

### Frontend

```bash
npm test
```

Vitest + Testing Library component tests, and Playwright e2e with `@axe-core/playwright` — the
platform runs accessibility checks against its own UI, which is the minimum credibility bar for an
accessibility auditing product.

### Screens

```bash
python3 scripts/verify_screens.py
```

Asserts all 36 routes render and are reachable from `AppShell` navigation.

### CI

`.github/workflows/ci.yml`. See §33 for the current known CI issues.

---

## 29. Deployment

| Target | Where | Notes |
|---|---|---|
| Dev | `platform/docker-compose.yml` | Six services, bind mounts, `--reload` |
| Single-host prod | `platform/docker-compose.prod.yml` | gunicorn + uvicorn workers; Redis persistence enabled |
| Kubernetes | `platform/deploy/helm/govux/` | |
| Infrastructure | `platform/deploy/terraform/` | |
| Config management | `platform/deploy/ansible/` | |
| Air-gapped | `platform/deploy/AIRGAP.md` + `scripts/build-airgap-bundle.sh` | Government estates are frequently air-gapped — this is a first-class path, not an afterthought |
| Guided install | `platform/scripts/govux-setup.py`, `preinstall-check.sh` | |
| Diagnostics | `platform/scripts/diagnostic-bundle.sh` | Support bundle |
| SBOM | `scripts/generate-sbom.sh`, `docs/SBOM.md` | Required for government procurement |
| Monitoring | `platform/ops/prometheus-alerts.yml` | Scrape token-gated `/metrics` |

**Production checklist**

1. `.env` from `.env.example` with real, distinct secrets.
2. `GOVUX_ENV=production` (enables fail-fast startup checks and HSTS).
3. `GOVUX_CORS_ORIGINS` set to the real origin(s).
4. `metrics_token` set — `/metrics` refuses to serve without it in production.
5. `GOVUX_CACHE_REDIS_URL` pointed at a separate Redis.
6. Redis persistence enabled (AOF) so queued jobs survive a restart.
7. `alembic upgrade head` before starting the API.
8. TLS terminated at the ingress (HSTS is emitted by the app, assuming TLS upstream).
9. Orchestrator readiness gate on `/readyz`, **not** `/healthz`.
10. Scale `worker` replicas for audit throughput — each needs a unique `HOSTNAME`.

---

## 30. Security and privacy posture

**Authentication.** Passwordless gov-email OTP; hashed single-use codes; JWT access tokens held
only in memory; device-bound rotating refresh tokens in an `HttpOnly; Secure; SameSite=Strict`
cookie; family-wide revocation on genuine reuse; per-IP and per-account rate limits with escalating
lock-out and CAPTCHA.

**Authorisation.** Five roles via `require_role`; org scoping applied per query. **There is no
row-level security in Postgres** — every new query touching org-owned data must filter `org_id`
explicitly. This is the single easiest way to introduce a data-leak bug here.

**SSRF.** The largest inherent risk: the platform makes outbound requests to attacker-influenceable
URLs (engine-discovered document links, user-supplied scan targets). Defences: the `.gov.in`/`.nic.in`
suffix allowlist on both audits and free scans, and `services/url_validate.guarded_get`, which
validates **every redirect hop**, blocks loopback/internal/reserved resolutions, and caps response
size.

**Transport and headers.** Security headers on every response; HSTS in production; credentialed
CORS restricted to configured origins.

**Secrets at rest.** `services/secretbox.py` encrypts settings secrets (SMTP, CAPTCHA, LLM key)
using `GOVUX_SECRET_KEY`. Startup fails in production if that key is missing or equals the JWT
secret — the check exists because reusing one secret for two purposes is the most likely
misconfiguration.

**Error handling.** No stack trace ever reaches a client; the global handler logs with a request id
and returns a referenceable message.

**Observability.** `X-Request-ID` on every response and in every log line; `/metrics` token-gated
and mandatory-token in production, because queue depth and DB pool internals are useful
reconnaissance.

**Accountability.** `audit_log` records actor, action, target, IP, device and a JSONB detail blob
for logins, OTP verifications, audit submissions, publications and role changes.

**DPDP (Digital Personal Data Protection Act).** `services/dpdp.py`, tested by `test_dpdp.py`.
`GET /v1/auth/me/export` is data portability; `DELETE /v1/auth/me` is erasure. Personal data held
is deliberately minimal: email, display name, org, device metadata, IP addresses in `otp_codes`,
`devices`, `public_scans` and `audit_log`. See `docs/PRIVACY.md`.

**Data residency.** Object storage is S3-compatible specifically so deployments can keep evidence
on NIC or other in-country infrastructure.

---

## 31. Third-party licence constraints

Relevant to procurement and to any commercial offering; full detail in `docs/THIRD_PARTY_LICENSES.md`
and `docs/SBOM.md`.

- **axe-core / `@axe-core/playwright`** — **MPL-2.0**, from Deque Systems. MPL is file-level
  copyleft: modifications to axe-core source must be published. The platform only *consumes* the
  library, which is fine, but forking or patching it changes that. Deque also places conditions on
  commercial use of the axe brand — check before marketing "axe-powered".
- **Lighthouse** — Apache-2.0, Google.
- **Playwright** — Apache-2.0, Microsoft. Note the **browser binaries** ship under their own
  licences (Chromium BSD-style, Firefox MPL-2.0, WebKit LGPL/BSD) and are redistributed inside the
  Docker image, which matters for the air-gap bundle.
- **Bootstrap / bootstrap-icons** — MIT.
- **PostgreSQL** — PostgreSQL Licence; **pgvector** — PostgreSQL Licence.
- **Redis 7** — check the licence for the exact image tag; Redis relicensed to RSALv2/SSPLv1 from
  7.4. For a government deployment redistributing the stack, pin a tag whose licence you have
  cleared, or use Valkey.
- **MinIO** — **AGPL-3.0**. AGPL's network clause is the one to think about if MinIO is
  redistributed as part of a hosted offering. Any S3-compatible backend can be substituted.
- **scikit-learn** (BSD-3), **XGBoost** (Apache-2.0), **Pillow** (MIT-CMU), **reportlab** (BSD),
  **pypdf** (BSD).
- **Anthropic API** (Studio) — commercial terms; the API key is customer-supplied at runtime and
  is not bundled.

`scripts/generate-sbom.sh` produces the SBOM required for government procurement.

---
---

# Part E — Context you cannot infer from code

## 32. Decision ledger

The decisions most likely to be re-litigated by someone who did not see the reasoning. Each is
settled.

| # | Decision | Rejected alternative | Why |
|---|---|---|---|
| 1 | Score path is deterministic and LLM/ML-free | ML-weighted or LLM-assisted scoring | Reproducibility is the platform's entire defensibility argument. A vendor must be able to recompute the number. |
| 2 | Compliance verdict separate from the UX band | One combined number | Automated tools catch ~30–40% of WCAG issues. A conflated number would let a good band imply legal compliance and generate liability for every department that trusted it. |
| 3 | Automated-only can never be `compliant` | Auto-certify above a threshold | Matches the EU two-tier model and UK GDS practice. Certification requires a human. |
| 4 | Design category scored by **deterministic pixel analysis**, not a learned model | A CNN aesthetic scorer | Design is 11% of the score, so it must live in the score path, so it must be deterministic. Replaced a hardcoded `design: 70` without breaking invariant 1. |
| 5 | Integrity Engine caps the **verdict**, never the score | Silently docking points for detected gaming | A penalty a user cannot see or reproduce is indistinguishable from a bug and is indefensible on challenge. |
| 6 | Missing category scores **0** | Default to a neutral 50–70 | A silently-absent category must hurt, or an engine bug becomes a free pass. |
| 7 | Unreachable site ⇒ `insufficient_evidence`, **no band** | Score whatever the engine returned | The `umang.gov.in` incident: unreachable site → all-60 fillers → a confident, wrong "Band D". Refusing to score is a correct outcome. |
| 8 | FastAPI (Python) for the core API | Fastify (Node) | Scoring, ML and Indic NLP are Python; co-locating them with the API keeps the reproducible score next to its models. Next.js already supplies the Node BFF. |
| 9 | Redis Streams | Celery | Needs polyglot producers/consumers (Python + Node), consumer groups, pending-entry lists and explicit ack for reclaim/DLQ. Celery's Python-centric, opaque-broker model fits none of that. |
| 10 | Node engine invoked as a **subprocess** | A long-lived Node service | Per-run isolation and a hard timeout for a component driving three real browsers. A leak or hang dies with the process. |
| 11 | axe-core + Lighthouse rather than bespoke checks | Reimplementing WCAG/CWV rules | These are the reference implementations. Reimplementing forfeits exactly the third-party credibility the platform needs. |
| 12 | Bootstrap 5 classes + CSS-variable remapping | A bespoke UX4G component library | UX4G 3.0 *is* built on Bootstrap 5. Remapping tokens gives visual compliance without maintaining a component library. |
| 13 | Passwordless OTP | Passwords, or SSO now | No password database to breach, and gov-email possession is itself the domain-eligibility proof. Parichay SSO is a future path — see §33 for the dead button. |
| 14 | `.gov.in`/`.nic.in` enforced in **both** app and DB | App-layer check only | The DB `CHECK` is the backstop for the code path that forgets — and one will. |
| 15 | G9/G11/G13 closed as a **manual-assurance ledger** | Claiming automated coverage, or leaving them open | A crawler cannot do VAPT, native-app a11y or lived-experience panels. Recording externally performed assurance is honest and still surfaces the evidence. |
| 16 | `findings.guideline_id` is **not** an FK | FK to `guidelines` | A new axe rule must be able to produce a finding without a migration. The library enriches when it can. |
| 17 | Weight stored per `audit_scores` row | Read weights from code at display time | A historical audit must stay explainable after weights are versioned forward. |
| 18 | Rankings publication is governance-gated | Publish automatically | A public league table of government departments is a political artefact. It needs a named approver and a stated methodology version. |
| 19 | Public scanner on a **separate** stream and single-concurrency worker | One shared queue | An unauthenticated endpoint must not be able to starve the authenticated audit queue. |
| 20 | Idle timeout separate from token TTL | Rely on the 15-minute access token | Token expiry is invisible — `lib/api.ts` silently refreshes. Only an explicit idle timer ends a session on an unattended machine. |
| 21 | Bounded reuse **grace** on refresh rotation | Strict reuse detection with no grace | Strict detection logs users out for a benign double-refresh after a page reload. The grace applies *only* to self-rotation, so sign-out and theft cascades stay absolute. |
| 22 | `depth` = **page count, capped at 25** | Crawl-depth levels | Matches how the free-page quota and the escalation flow already read it. |
| 23 | Advisory ML runs **after** the score commit | Inline in scoring | Makes the invariant structural rather than a matter of discipline — and means an ML failure cannot fail an audit. |
| 24 | Air-gapped install is first-class | Online-only | Government estates are frequently air-gapped. |
| 25 | Cache may use a **separate** Redis from the queue | One Redis for both | A cache flush or eviction must never be able to touch durable jobs. |

---

## 33. Documented state vs actual state

Recorded honestly so a reader — human or AI — does not trust a stale claim. Accurate as of
2026-08-11, branch `amanmittal`.

### 33.1 Documentation that has drifted from the code

| File | Says | Actually |
|---|---|---|
| `docs/BRD_GOVUX_STUDIO.md` | "Status: Proposed — **not yet implemented**" | **Implemented.** `services/studio.py`, `services/studio_audit.py`, `routers/studio.py` (7 endpoints), `app/prompts/studio_generate.md`, `studio_runs` table, migrations `0008`/`0009`, frontend `/studio` and `/admin/studio-access`, `test_studio.py`. |
| `docs/BRD_INTEGRITY_ENGINE.md` | "Status: Proposed — **not yet implemented**" | **Implemented.** `services/integrity.py`, `audits.integrity` column, migration `0010`, wired into `worker.process` and `compliance_verdict`, `test_integrity.py`. |
| `README.md` | "a **starter**… the frontend is a scaffold with representative pages. Extend the 22 prototype screens into React routes" | The frontend has **36 App Router routes**, an `AppShell`, idle-timeout policy, e2e and component tests. The prototype extension is done. |
| `platform/docs/ARCHITECTURE.md` | "82 tests", "27 routes" | **221 tests**, **36 routes**. |

These four status lines are the most misleading artefacts in the repository — an agent reading
them would rebuild features that already exist. Fixing them is a small, worthwhile follow-up.

### 33.2 Known open defects

From the full live service audit of 2026-08-11 (branch `vipul-check`), with current status
re-verified:

| Sev | Defect | Status |
|---|---|---|
| P1 | `worker.py` called `run_engine()` without `depth=`, so `runner.js` always fell back to `MAX_CRAWL=25`, making the page quota and the `/v1/scan-requests` approval flow moot | **Fixed** — `worker.py:142` now passes `depth=depth` from `scope.depth`. |
| P1 | 42 orphaned `public_scans` rows stuck at `status='queued'` with no Redis message behind them. Dev compose runs Redis with **no volume and `appendonly no`** (prod compose is fine), and **no reconciler exists**. The same mechanism can make a domain permanently un-auditable through the re-submit path in `routers/audits.py`, since the "already running?" check will keep returning a `task_id` that no worker will ever pick up. | **Open.** Needs a reconciler that expires rows in a non-terminal state with no live queue entry. |
| P1 | `public_worker.py` has no `reclaim_stale` equivalent — the audit worker reclaims orphaned jobs every 6th tick; the public worker does not, so a crash mid-scan strands the job. | **Open** — `public_worker.py` has no reclaim path. |
| P2 | `frontend/test/audits.component.test.tsx` red on a stale assertion (the page now sends `submitAudit(id, 10)`) → CI red on main. Frontend tests run against the live dev DB and pollute it. `pytest` is missing from the API image. | **Open.** |
| P3 | Dead "Continue with Parichay SSO" button — `frontend/app/login/page.tsx:67` links to `/api/v1/auth/sso`, which does not exist. | **Open.** Decision taken: **remove the button** rather than stub or implement it. |
| P3 | No cancel-audit path (the `cancelled` status exists in the enum but nothing sets it); worker is silent (no structured progress logging); `failed` never sets `finished_at`; Studio nav is shown even when `studio_enabled` defaults to false. | **Open.** |

### 33.3 Settled decisions on those defects

Recorded so they are not re-debated:
- `depth` means **page count, capped at 25**.
- The dead SSO button should be **removed**, not stubbed or implemented.
- Dev-DB cleanup was limited to **expiring the 42 ghost queued scans only** — no reset, no reseed.

### 33.4 In-flight uncommitted work

Branch `amanmittal`, four modified files (+174/−29):

- `app/config.py` — adds `refresh_reuse_grace_seconds: int = 10`.
- `app/routers/auth.py` — rewrites `POST /refresh` as an **atomic claim** (`UPDATE … WHERE
  refresh_token_hash = :h AND revoked_at IS NULL … RETURNING`) plus the bounded reuse-grace logic
  described in §19.4, distinguishing self-rotation (`rotated_at == revoked_at`) from a theft
  cascade or explicit sign-out.
- `tests/test_auth.py`, `tests/test_security_hardening.py` — cover the concurrent-refresh race, the
  grace window boundary, and the requirement that logged-out and cascade-killed sessions stay dead
  inside the grace window.

The most recent commit (`31b4783`) added logout, the idle timeout and the sign-out UI.

### 33.5 Test-data pollution

Backend tests have historically run against the live dev database, leaving roughly 527 pytest
fixture accounts of the form `x.<hex>@nic.in`. This is why the five role-labelled accounts in §3
exist — hunting for a usable login among the fixtures was wasting time every session.

---

## 34. Glossary

| Term | Meaning |
|---|---|
| **GIGW 3.0** | Guidelines for Indian Government Websites, version 3.0 — the NIC/MeitY standard for government web presence. |
| **WCAG 2.2 AA** | Web Content Accessibility Guidelines 2.2, Level AA — the statutory accessibility bar used for the compliance verdict. |
| **UX4G** | "UX for Government", the Government of India design system (v3.0), built on Bootstrap 5. Published by NeGD. |
| **CWV** | Core Web Vitals — LCP (Largest Contentful Paint), INP (Interaction to Next Paint), CLS (Cumulative Layout Shift). |
| **CrUX** | Chrome User Experience Report — Google's real-user (field) performance dataset, as opposed to Lighthouse's lab measurements. |
| **MeitY** | Ministry of Electronics and Information Technology. |
| **NIC** | National Informatics Centre — operates much of the `.gov.in`/`.nic.in` estate. |
| **NeGD** | National e-Governance Division. |
| **STQC** | Standardisation Testing and Quality Certification directorate — issues the certification the evidence pack (G12) is shaped for. |
| **CERT-In** | Indian Computer Emergency Response Team; empanels firms permitted to perform VAPT. |
| **VAPT** | Vulnerability Assessment and Penetration Testing. |
| **DPDP** | Digital Personal Data Protection Act — India's data-protection law; drives the export and erasure endpoints. |
| **Parichay** | Government of India's SSO service. Not yet integrated (§33.2). |
| **Band** | The A–E UX quality grade derived from the overall score. **Aspirational and comparative.** |
| **Verdict** | The legal compliance status (`compliant` / `partially_compliant` / `non_compliant` / `not_assessed`). **Independent of the band.** |
| **Guard-rail** | The rule capping the band at C when accessibility or trust falls below 50. |
| **Task ID** | The `audits.id` UUID returned by `POST /v1/audits`; the handle for polling and reporting. |
| **Evidence pack** | The deterministic STQC-style ZIP produced by G12. |
| **Integrity flag** | The Integrity Engine's anti-gaming signal; caps the verdict, never the score. |
| **Rotation family** | `sessions.family_id` — the lineage of rotated refresh tokens; reuse revokes the whole family. |
| **Manual-assurance ledger** | `external_assessments` — externally performed assurance that automation cannot produce (G9/G11/G13). |

---

## 35. Source-of-truth map

When two places disagree, this is which one wins.

| Question | Authority |
|---|---|
| What is the database schema? | `platform/db/schema.sql` — canonical. `models.py` and Alembic follow it. |
| What are the scoring weights, bands, guard-rails? | `platform/backend/app/services/scoring.py`. Invariants locked in `tests/test_scoring_validation.py`. |
| What is the API contract? | `platform/backend/app/schemas.py` → generated OpenAPI at `/docs`, snapshotted in `tests/openapi_contract.json`. |
| What configuration exists? | `platform/backend/app/config.py` (env) + `app_settings` rows (runtime). |
| What does the engine measure? | `platform/backend/audit_engine/runner.js`. |
| What is the audit pipeline order? | `platform/backend/app/worker.py: process()`. |
| Which routes exist? | `platform/frontend/app/**/page.tsx`, gated by `scripts/verify_screens.py`. |
| What are the product invariants? | `CLAUDE.md` (root) and §6 of this file. |
| What was the original requirement? | `GovUX_Audit_Platform_BRD_v1.1_Consolidated.docx`. |
| What is actually built right now? | §33 of this file. |

**Other documentation, and what each is for**

| Doc | Use it for |
|---|---|
| `CLAUDE.md` (root) | Agent steering: invariants + token-efficient working rules |
| `platform/CLAUDE.md` | Dev-loop steering: run, test, change rules that bite |
| `platform/docs/ARCHITECTURE.md` | Stack table, repo layout, gap map (note the stale counts — §33.1) |
| `platform/docs/API.md` | Endpoint and auth summary |
| `platform/docs/GOTCHAS.md` | Bring-up, dev-loop and engine gotchas |
| `platform/docs/SCORING_VALIDATION.md` | Scoring invariants and how they are tested |
| `platform/docs/CODING_STANDARDS.md`, `DATA_ACCESS.md` | Conventions; read before writing backend code |
| `docs/HLD.md`, `docs/LLD.md` | High- and low-level design |
| `docs/DEPLOYMENT.md`, `OPERATIONS.md`, `CONFIGURATION.md`, `UPGRADING.md` | Running it in production |
| `docs/SECURITY_ARCHITECTURE.md`, `PRIVACY.md` | Security model and DPDP posture |
| `docs/SBOM.md`, `DEPENDENCIES.md`, `THIRD_PARTY_LICENSES.md` | Procurement and licence compliance |
| `docs/PRODUCTION_READINESS.md`, `VERSIONING.md` | Release process |
| `docs/USER_MANUAL.md` | End-user documentation |
| `docs/BRD_GOVUX_STUDIO.md`, `BRD_INTEGRITY_ENGINE.md` | Sub-product requirements (**status lines are stale** — both are built) |
| `prototype/` | Original 22-screen design reference |

---

## 36. Reconstruction acceptance checklist

You have successfully recreated this product when **all** of the following hold. This list is the
operational definition of "done" — an AI rebuilding the system should treat it as the test suite
for its own work.

**Structural**

- [ ] `docker compose up --build` brings up six services; `/healthz` returns `{status: ok, engine: v3.2}`.
- [ ] `/readyz` returns 200 when Postgres and Redis are up, and **503** when either is stopped.
- [ ] A fresh database volume auto-loads `db/schema.sql`: 22 tables, 10 enums, `pgcrypto`/`citext`/`vector`.
- [ ] `alembic upgrade head` reaches `0011` cleanly on both a fresh and an existing database.
- [ ] `schema.sql`, `models.py` and the migrations agree — no column exists in one and not the others.

**Invariants**

- [ ] `sum(CATEGORY_WEIGHTS.values()) == 100.0`.
- [ ] `compute_score` is deterministic: the same input dict produces the identical float on repeated calls and across processes.
- [ ] `explain()` contributions sum to `compute_score().overall`.
- [ ] Accessibility 49 or trust 49 caps the band at C and sets `guardrail_active`.
- [ ] `compliance_verdict(..., reviewed=False)` **never** returns `compliant`, for any input.
- [ ] `compliance_verdict` returns `non_compliant` when `critical_a11y_count > 0` or accessibility < 50, regardless of the band.
- [ ] `integrity_flagged=True` caps an otherwise-passing verdict at `partially_compliant` with a stated reason.
- [ ] No import of an ML or LLM module exists inside `services/scoring.py`, and no advisory code runs before the score `db.commit()` in `worker.process`.
- [ ] Inserting a user with a non-gov email fails at the **database** layer; likewise a non-gov domain URL.

**Behaviour**

- [ ] `POST /v1/audits` returns **202** with a `task_id` — never a score inline.
- [ ] A duplicate submit for a domain with a running audit returns the **existing** `task_id`.
- [ ] A seeded audit against a reachable `.gov.in` site reaches `completed` with a non-null band, eight `audit_scores` rows, and a compliance verdict with a non-empty reason.
- [ ] An audit against an unreachable host reaches **`insufficient_evidence`** with `overall_score` and `band` null, `compliance_status = not_assessed`, and an explanatory `trust` finding.
- [ ] `POST /v1/audits/{id}/review` by an `assessor` is the only path that can produce `compliant`.
- [ ] Killing a worker mid-job lets a peer reclaim and complete it.
- [ ] Two concurrent `POST /v1/auth/refresh` calls with the same cookie both succeed; a replay outside the grace window revokes the family; a session ended by `POST /v1/auth/logout` stays dead even if replayed one second later.
- [ ] A free scan against a non-`.gov.in` host is rejected; the fourth scan from one IP within 24h requires a CAPTCHA.
- [ ] A document URL resolving to a loopback or internal address is blocked by the SSRF guard.

**Quality gates**

- [ ] `pytest` passes with coverage **≥ 80%** (the `--cov-fail-under=80` gate is enforced, not advisory).
- [ ] `tests/test_scoring_validation.py` passes and demonstrably fails if any weight is altered.
- [ ] `test_openapi_contract.py` passes against the committed snapshot.
- [ ] `npm test` passes; Playwright + axe e2e is green against the platform's own UI.
- [ ] `python3 scripts/verify_screens.py` passes; every route is reachable from `AppShell` nav.

**Production posture**

- [ ] With `GOVUX_ENV=production` and `GOVUX_SECRET_KEY` unset — or equal to `GOVUX_JWT_SECRET` — the API **refuses to boot**.
- [ ] With `GOVUX_ENV=production` and no `metrics_token`, `/metrics` returns **401**.
- [ ] Every response carries `X-Request-ID`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`; HSTS appears only in production.
- [ ] An unhandled exception returns a 500 with a `request_id` and **no stack trace**.
- [ ] `GET /v1/auth/me/export` returns the user's data; `DELETE /v1/auth/me` erases it.
