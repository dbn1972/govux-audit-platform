# Architecture

## Tech stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Frontend + BFF | Next.js App Router (TypeScript) | 14.2.3 | Server components, route-level layout, Node BFF |
| Design system | Bootstrap 5 + UX4G tokens | 5.3.3 | UX4G is built on Bootstrap 5; remap CSS variables |
| Core API | FastAPI (Python 3.12) | 0.111.0 | Scoring/ML/NLP is Python; keeps reproducible score co-located |
| ORM | SQLAlchemy 2.0 | 2.0.30 | Must preserve PG-native ENUM/JSONB/INET types |
| Validation | Pydantic v2 + pydantic-settings | 2.7.0 / 2.2.1 | Drives the OpenAPI contract |
| Queue | Redis Streams (consumer groups) | redis 7 | Polyglot (Python + Node), explicit ack, reclaim/DLQ |
| Audit engine | Node: Playwright + Lighthouse + axe-core | 1.44.0 / 12.0.0 / 4.9.0 | Reference implementations for WCAG/CWV |
| Cross-browser | Playwright Chromium + Firefox + WebKit | — | All three baked into Docker image |
| Database | PostgreSQL 16 + pgvector | pgvector/pgvector:pg16 | Required extensions: pgcrypto, citext, vector |
| Object storage | MinIO (S3-compatible) | latest | Evidence artefacts and public-scan PDFs |
| Advisory ML | scikit-learn + XGBoost | 1.5.0 / 2.0.3 | Anomaly detection + finding prioritization (advisory only) |
| Design CV | Pillow (deterministic pixel analysis) | 10.3.0 | Not a learned model — must be deterministic for score path |

## Service topology (Docker Compose — 6 services)

```
browser -> web :3000 (Next.js) -> api :8000 (FastAPI)
                                     |
                              db :5432 (pgvector/pg16)
                              redis :6379 (Streams + cache)
                                     |
                          worker (Python + Node engine)
                          scheduler (continuous monitoring)
                          public-worker (free scanner, single-concurrency)
                          minio :9000 (object storage)
```

- **api** — FastAPI with uvicorn `--reload`. Source bind-mounted, edits are live.
- **worker** — consumes `govux:audits` stream, shells out to Node engine, scores, persists.
- **scheduler** — polls `schedules` table, submits due audits on cadence.
- **public-worker** — consumes `govux:public` stream; single-concurrency by design.
- **db** — `pgvector/pgvector:pg16`. Mounts `db/schema.sql` at init (first boot only).
- **redis** — durable job queue (Streams) + status keys + cache. AOF persistence enabled.

## Data flow (audit pipeline)

1. `POST /v1/audits` -> 202 + task_id, advisory-lock guarded, enqueue to Redis Streams
2. Worker: `status = crawling` -> run Node engine (Playwright crawl N pages)
3. Worker: `status = analyzing` -> coverage-confidence gate check
4. If unreachable: `insufficient_evidence`, no score, no band -> return
5. Design CV scoring (deterministic pixel analysis)
6. CrUX field data blend (if API key configured)
7. `status = scoring` -> `compute_score(categories)` -> persist `audit_scores`
8. Cross-browser matrix (Chromium/Firefox/WebKit)
9. Document accessibility audit (PDF/Office, SSRF-guarded)
10. Findings with remediation guidance
11. Integrity Engine assessment (caps verdict only)
12. Compliance verdict computation
13. Per-page coverage -> `overall_score`, `band` -> **commit**
14. Advisory ML (anomaly detection) — after commit, wrapped in try/except
15. Cache invalidation -> webhook notification

## Scoring model

#[[file:platform/backend/app/services/scoring.py]]

Eight categories, weights sum to exactly 100:
- accessibility: 22, usability: 17, gigw: 15, performance: 12, design: 11
- responsiveness: 10, content: 7, trust: 6

Bands: A >= 90, B >= 75, C >= 60, D >= 40, E < 40

Guard-rails: accessibility < 50 OR trust < 50 -> band capped at C

Compliance verdict (independent of band):
- critical a11y or a11y < 50 -> `non_compliant`
- automated-only -> at most `partially_compliant`
- `compliant` requires: reviewed=True + a11y >= 90 + zero criticals

## Data model highlights

- 22 tables, 10 enums, canonical in `platform/db/schema.sql`
- `audits` is the central table; `audits.id` IS the task_id
- `findings.guideline_id` is NOT an FK to `guidelines` (new axe rules need no migration)
- Weight stored per `audit_scores` row (historical auditability)
- `ranking_publications` is governance-gated (approver + methodology version required)

## Authentication model

- Passwordless OTP only (no passwords anywhere)
- JWT HS256 access tokens (15 min, in-memory only on client)
- Device-bound rotating refresh tokens (60-day, HttpOnly cookie)
- Rotation families with bounded reuse grace window (10s) for concurrent refresh races
- Per-IP and per-account rate limits with escalating lockout

## Key architectural boundaries

- **Score path vs advisory path**: ML/LLM runs AFTER `db.commit()` of the score. Advisory failure cannot fail an audit.
- **Authenticated vs public clients**: `lib/api.ts` (token management) vs raw `fetch` (no auth headers).
- **Steward vs non-steward routes**: `NAV` constant drives both visibility AND deep-link guard.
- **Queue vs sync writes**: heavy/derivable writes queue to Redis; auth/transactional writes stay synchronous on Postgres.
- **Cache vs direct reads**: aggregates (national, rankings) cached in Redis; auth flows and single-audit reads go direct to PG.
