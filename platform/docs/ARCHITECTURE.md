# Architecture & conventions (read on demand)

## Stack (and why)
| Layer | Tech | Note |
|-------|------|------|
| Frontend + BFF | Next.js 14 (App Router, TS) on Bootstrap 5 = UX4G Design System | UX4G tokens in `frontend/app/ux4g-theme.css` |
| Core API | FastAPI (Python 3.12) | same runtime as scoring/ML — keeps the reproducible score with its models |
| Queue | Redis Streams (consumer groups) | polyglot: Node + Python workers. NOT Celery |
| Audit engine | Node: Playwright + Lighthouse + axe-core; Python: GIGW rules, scoring | deterministic, no AI in the score path |
| Cross-browser | Playwright **Chromium + Firefox + WebKit** (all baked into the image) | `audit_engine/compat.js`; every audit runs the matrix + responsive (mobile/tablet/desktop) |
| Advisory ML | scikit-learn **IsolationForest** anomaly detection + **XGBoost** finding-priority ranking | `services/ml_anomaly.py`, `services/ml_priority.py`; trained via `python -m app.ml_train`; **advisory only, never in the score** |
| CV design score | deterministic pixel analysis (palette/whitespace/clutter/balance) | `services/design_cv.py` — replaces the hardcoded `design: 70`; **deterministic (not a learned model)** so it can stay in the score path |
| Data | PostgreSQL (+ pgvector), Redis, MinIO/S3 (evidence) | db image must be `pgvector/pgvector:pg16` |

FastAPI over Fastify because the differentiating logic (scoring, Phase-1 ML, Indic NLP) is Python;
Next.js already provides the Node BFF.

## Repo layout
```
platform/
  db/schema.sql                 # canonical Postgres schema (authoritative)
  backend/app/
    main.py config.py database.py models.py schemas.py
    security.py deps.py
    routers/                    # auth, domains, audits, rankings, library, monitoring, ci
    services/                   # scoring, queue, remediation, verification, discovery,
                                #   scheduler, crux, pdf_audit, language
    worker.py                   # consumes queue -> engine -> score -> persist
    scheduler entry: python -m app.services.scheduler   (continuous monitoring)
    seed.py                     # python -m app.seed
    audit_engine/               # Node: runner.js, gigw-rules.js, lang.js
    tests/                      # pytest (221 tests across 36 files, 80% gate in pytest.ini)
    migrations/                 # Alembic (0001 loads schema.sql; 0002 gap-closure)
  frontend/app/                 # 36 routes (App Router); owner + /admin/* steward
    components/AppShell.tsx  lib/api.ts  lib/score.ts  app/ux4g-theme.css
  scripts/verify_screens.py
  docker-compose.yml            # db, redis, api(:8000), worker, scheduler, web(:3000)
```

## Data flow (an audit)
`POST /v1/audits` → 202 + task_id, enqueues to Redis Streams → `worker.process`:
run Node engine (crawl N pages) → blend CrUX field data → `compute_score` (UX band) →
`compliance_verdict` (separate legal pass/fail) → attach advisory remediation →
persist scores/findings/pages/documents → set status `completed` → optional CI webhook.

## Scoring model (`services/scoring.py`)
Category weights (sum 100): accessibility 22, usability 17, gigw 15, design 11, performance 12,
responsiveness 10, content 7, trust 6. Bands A≥90 B≥75 C≥60 D≥40 E<40. Guard-rail: accessibility<50
or trust<50 caps the band at C. Compliance verdict is INDEPENDENT of the band: critical a11y or
a11y<50 ⇒ `non_compliant`; automated-only ⇒ at most `partially_compliant`; `compliant` needs
`reviewed=True` + a11y≥90 + no criticals.
Responsiveness now blends 60% no-horizontal-overflow + 40% WCAG 2.5.8 tap-target size (controls ≥24px,
checked at mobile width) — see `audit_engine/runner.js` `responsiveness()`.

## Crawler etiquette (`audit_engine/robots.js`)
The engine identifies itself as `GovUXBot` (Googlebot-style: real browser token + `(compatible;
GovUXBot/1.0; +<BOT_URL>)`) and honours robots.txt properly — Disallow/Allow with `*`/`$`,
most-specific User-agent group wins, longest-match with Allow winning ties. Unit-tested in
`robots.test.js` (dependency-free, runs in CI without Playwright).
- **The homepage is exempt** from Disallow: it is the explicit, owner-verified audit target.
  Everything *discovered* (sitemap + nav links) is filtered, as are same-origin broken-link probes.
- **Crawl-delay is honoured in full**, not capped. `MAX_TOTAL_DELAY_MS` bounds total wait instead,
  so a slow-rate site is sampled on fewer pages (`coverage.limited_by_crawl_delay`) rather than
  crawled faster than it asked.
- **Disclosure has a cost**: some government WAFs block self-identifying bots (measured:
  `www.india.gov.in` → 403 disclosed, 200 undisclosed). The fix is for the operator to allow-list
  `GovUXBot`; `evidence.blocked_hint` says exactly that. `GOVUX_UA_DISCLOSE=0` is an explicit
  operator escape hatch — never an automatic retry-in-disguise.

## Conventions
- Python: FastAPI + SQLAlchemy 2.0; Pydantic v2 schemas in `schemas.py` drive OpenAPI. Add a router in
  `routers/`, include it in `main.py`. Use `Depends(current_user)` / `require_role(...)`.
- Frontend: client pages use `AppShell`; data via `lib/api.ts` (silent refresh). Bootstrap/UX4G classes
  (`btn btn-primary`, `card`, `table`, `badge`, `bi-*`), deep-blue headings via `var(--ux-navy)`.
- Every new screen passes `scripts/verify_screens.py`, which checks structure AND that the
  route is linked from somewhere — an unreachable page fails the build, so a new screen must
  appear in the `AppShell` nav or be linked from another page.
- Every new endpoint has a test in `backend/tests/` (keep coverage ≥80%).

## Gap-closure map (from GovUX_Benchmark_Gap_Analysis)
G1 compliance verdict + two-tier → `services/scoring.compliance_verdict`; G2 continuous monitoring +
auto-discovery → `services/scheduler`, `services/discovery`, `/v1/schedules`, `/v1/discovery`;
G3 PDF/document a11y → `services/pdf_audit`; G4 CrUX field data → `services/crux`; G5 remediation +
CI gate + webhook → `services/remediation`, `/v1/ci/gate`; G6 multilingual → `services/language`,
`audit_engine/lang.js`; G7 multi-page crawl → `audit_engine/runner.js` → `audit_pages`; G8 broken-link
QA; G10 overlay detection + `/admin/methodology`; G12 STQC evidence pack → `services/evidence_pack`
(`GET /v1/audits/{id}/evidence`, deterministic ZIP: report.json/findings.csv/compliance-statement/
methodology/summary.pdf); G9 native-app a11y, G11 lived-experience panel, G13 deep VAPT → not
automatable, closed as the manual-assurance ledger `external_assessments` (`/v1/assessments`,
`routers/assessments.py`, frontend `/assessments`) — externally performed assessments recorded by
assessors, surfaced in the evidence pack; never in the score path, never upgrades the verdict
(only `POST /audits/{id}/review` does).
