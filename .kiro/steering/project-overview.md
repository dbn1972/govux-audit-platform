# Project Overview — GovUX Audit Platform

## What this is

A self-service UX and compliance audit engine for Indian government websites (`.gov.in` / `.nic.in`) that produces a defensible 0-100 GovUX Score and a separate legal compliance verdict. Standards covered: GIGW 3.0, WCAG 2.2 AA, UX4G Design System, Core Web Vitals.

## Five invariants (never break these)

1. **Score path is deterministic and LLM/ML-free.** Same inputs + same engine version = identical score. Category weights sum to exactly 100. ML and LLM outputs are advisory only, computed after the score is committed.
2. **Legal compliance verdict is SEPARATE from UX band.** Automated-only evidence can never yield `compliant` — at most `partially_compliant`. Only an assessor's explicit `POST /v1/audits/{id}/review` can produce `compliant`.
3. **Audits are asynchronous, always.** `POST /v1/audits` returns 202 + task_id and enqueues to Redis Streams. Never run an audit inline in a request handler.
4. **`.gov.in` / `.nic.in` only, enforced twice.** Both emails and domains are restricted in application code AND as PostgreSQL CHECK constraints (`chk_gov_email`, `chk_gov_domain`).
5. **Schema changes in three places, in sync.** Any schema change must land in `db/schema.sql` (canonical) + `app/models.py` (SQLAlchemy) + an Alembic migration (additive).

## Domain scope

- Target: `*.gov.in` and `*.nic.in` only
- No non-government sites, not even for testing
- The domain restriction is simultaneously scope, access-control, and SSRF guard

## The four product surfaces

1. **Authenticated audit platform** — the core. Officers register domains, prove ownership, run multi-page audits with cross-browser matrix.
2. **Free public scanner** — anonymous single-URL scan at `POST /v1/public/scan`, separate Redis stream and single-concurrency worker.
3. **GovUX Studio** — AI prototype generator (Claude). Generates HTML, then the deterministic engine scores it. LLM generates; the engine arbitrates.
4. **Integrity Engine** — anti-gaming. Detects overlays, stuffed elements, cloaking. Caps the verdict, never changes the score.

## User roles (PostgreSQL enum `user_role`)

| Role | Purpose |
|------|---------|
| `owner` | Default for self-registering users. Manages domains and audits for their org. |
| `contributor` | Team member, same ops as owner, scoped to org. |
| `assessor` | Can raise compliance verdict to `compliant` via review. |
| `programme_admin` | National dashboard, rankings, discovery, approvals. |
| `super_admin` | Everything, plus Studio tenant entitlement. |

Authentication is passwordless gov-email OTP only. No passwords anywhere.

## Key numbers

- ~9,300 lines Python, ~4,400 lines TypeScript/TSX, 851 lines Node engine
- 69 HTTP endpoints (12 routers + 3 ops routes)
- 36 frontend routes, 22 PostgreSQL tables, 10 enums, 11 Alembic migrations
- 221 backend tests, hard `--cov-fail-under=80` gate (actual ~92%)
- Engine version: `v3.2` (`GOVUX_ENGINE_VERSION`)

## Repository layout

```
govux-audit-platform/
  CLAUDE.md                     # agent steering — invariants
  PRODUCT.md                    # comprehensive product spec
  platform/                     # all runnable code
    docker-compose.yml          # dev stack (6 services)
    db/schema.sql               # canonical schema
    backend/
      app/                      # FastAPI application
        routers/                # 12 API routers
        services/               # 26 service modules
      audit_engine/             # Node: Playwright/Lighthouse/axe-core (7 files)
      tests/                    # 36 pytest files
      migrations/               # Alembic 0001-0011
    frontend/                   # Next.js 14 App Router
      app/                      # 36 routes
      components/               # AppShell.tsx, AuditNav.tsx
      lib/                      # api.ts, score.ts
    deploy/                     # helm, terraform, ansible
    scripts/                    # setup, verify, diagnostics
  prototype/                    # 22 static HTML screens (original design reference)
  docs/                         # HLD, LLD, deployment, ops, privacy, security docs
```

## Source of truth map

| Question | Authority |
|----------|-----------|
| Database schema | `platform/db/schema.sql` |
| Scoring weights/bands/guard-rails | `platform/backend/app/services/scoring.py` |
| API contract | `platform/backend/app/schemas.py` + OpenAPI snapshot |
| Configuration | `platform/backend/app/config.py` (env) + `app_settings` table (runtime) |
| Engine measurements | `platform/backend/audit_engine/runner.js` |
| Audit pipeline | `platform/backend/app/worker.py: process()` |
| Navigation/IA | `NAV` constant in `platform/frontend/components/AppShell.tsx` |
| Product invariants | `CLAUDE.md` (root) and PRODUCT.md section 6 |
