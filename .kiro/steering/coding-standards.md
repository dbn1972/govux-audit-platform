# Coding Standards

## Python (Backend — FastAPI 3.12)

### Style
- PEP 8, 4-space indent, ~100 column lines
- Full type hints on public functions; use `dict`/`list` builtins (not `Dict`/`List`)
- Docstrings only where intent is non-obvious (constraints, "why"), not restating the code
- Config via `settings` (env `GOVUX_*`); no literals for secrets/keys/URLs

### Architecture
- **Thin routers** in `app/routers/` — business logic lives in `app/services/`
- Auth: `Depends(current_user)` / `require_role(...)` for authorization
- Pydantic v2 models in `app/schemas.py` drive the OpenAPI contract
- SQLAlchemy 2.0 style; models mirror `db/schema.sql` exactly (PG `ENUM`/`JSONB`/`INET`)
- Never build SQL by string concatenation

### Security
- Fail closed: verification, auth, and permission checks default to deny/`False` on error
- Never log secrets, tokens, OTPs, or refresh tokens
- Every query touching org-owned data must filter by `org_id` explicitly (no row-level security in PG)
- SSRF guard on all outbound requests to user-influenced URLs via `services/url_validate.guarded_get`

### New endpoints
- Router file in `app/routers/`, included in `main.py`
- Pydantic request/response schemas in `schemas.py`
- Test in `backend/tests/` covering happy path, error/permission path, and boundary case

## TypeScript / Next.js (Frontend)

### Style
- TypeScript strict mode, ES2020 target
- Path alias `@/*` maps to project root
- Use `"use client"` directive only when client interactivity is needed

### Architecture
- All authenticated pages wrap in `AppShell` component
- All API calls go through `lib/api.ts` (handles silent token refresh, 401 recovery)
- Public pages (`/scan`, `/showcase/[slug]`) use raw `fetch` to `/api/v1/public/*` directly
- Score formatting via `lib/score.ts` (single source for band/color mapping)

### Design system
- Bootstrap 5 + UX4G tokens: use existing classes (`btn`, `card`, `table`, `badge`, `bi-*`)
- Deep-blue headings via `var(--ux-navy)` (#0a3d7a)
- No bespoke CSS when a Bootstrap token/class exists
- Load order: `bootstrap.min.css` -> `ux4g-theme.css` (overrides) -> `globals.css`

### New screens
- Must use `AppShell` layout
- Must fetch through `lib/api.ts`
- Must appear in `AppShell` nav (the `NAV` constant) or be linked from another page
- Must pass `scripts/verify_screens.py` (structure + reachability check)
- Include loading, empty, and error states

## Node Engine (`audit_engine/`)

- ES modules (`"type": "module"`)
- Deterministic — no AI in the score path
- **Quote attribute values** in selectors passed to `page.evaluate` (`a[href*="/hi"]`)
- Wrap every check in try/catch; degrade to a neutral score rather than crashing the run
- Bound runtime: crawl caps (`MAX_CRAWL=25`, `MAX_LINKCHECK=30`), politeness delays, timeouts
- Set a standard desktop UA — many gov sites serve different markup to unknown agents

## Test coverage (enforced)

- **>=80% backend line coverage is a hard gate** (`pytest.ini: --cov-fail-under=80`; currently ~92%)
- Every new endpoint and every new service function ships with tests
- Test three cases: happy path, error/permission path (403/404/400/409), boundary (empty, threshold, idempotent)
- Keep I/O out of unit tests — inject or monkeypatch: engine via `worker.run_engine`, HTTP via injected fetchers, Redis via `FakeRedis`
- Naming: `test_<unit>_<behavior>`; one behaviour per test
- Use existing fixtures (`client`, `ctx`, `db`, `verified_domain`) rather than rebuilding setup
- Engine (Node) changes smoke-tested with real `node runner.js` before merge
- Frontend logic in `lib/` covered by Vitest

## Definition of done

- Tests green + coverage >= 80%
- `verify_screens.py` passes (for frontend changes)
- `schema.sql` <-> `models.py` <-> Alembic in sync (for schema changes)
- No secrets in code or logs
- Engine changes smoke-tested with a real site
- OpenAPI contract snapshot updated if endpoint shape changed
