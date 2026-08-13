# Conventions & Workflow

## Git workflow

- Branch off `main` (never commit directly to main)
- Clear, imperative commit messages ("Add ...", "Fix ...", not "added")
- One focused change per PR
- Fill in the PR template (tests, screenshots for UI, security considerations)
- CI must pass before merge: backend, migrations, screens, frontend, engine jobs

## File organization

### Backend (`platform/backend/app/`)
- `main.py` — app factory, middleware, router includes
- `config.py` — pydantic-settings, all `GOVUX_*` env vars
- `database.py` — SQLAlchemy engine and session
- `models.py` — ORM models mirroring `db/schema.sql`
- `schemas.py` — Pydantic v2 request/response models (drives OpenAPI)
- `security.py` — OTP, JWT, refresh token logic
- `deps.py` — `current_user`, `optional_user`, `require_role`
- `routers/` — one file per resource (thin; delegate to services)
- `services/` — business logic modules (26 files)
- `worker.py` — audit queue consumer
- `public_worker.py` — free-scanner queue consumer

### Frontend (`platform/frontend/`)
- `app/` — Next.js App Router pages (36 routes)
- `app/layout.tsx` — root layout with CSS load order
- `app/ux4g-theme.css` — UX4G token overrides for Bootstrap
- `components/AppShell.tsx` — nav, idle timeout, role gating (THE IA source)
- `lib/api.ts` — sole HTTP client for authenticated pages
- `lib/score.ts` — band/color/formatting helpers

### Engine (`platform/backend/audit_engine/`)
- `runner.js` — main audit orchestrator (503 lines)
- `perf.js` — Lighthouse/CWV
- `compat.js` — cross-browser matrix
- `lang.js` — multilingual/Indic detection
- `evidence.js` — artefact capture
- `deep.js` — deep-crawl helpers
- `gigw-rules.js` — GIGW 3.0 mandatory elements

## API conventions

- All routes under `/v1`
- 202 for async operations (audits, scans, studio)
- 201 for creates (domains, schedules, assessments, scan-requests)
- 204 for deletes (logout, device revoke, schedule delete)
- Error responses: `{detail: string | {message, ...structured_fields}}`
- Lock-out errors include `retry_after` and `captcha_required`
- Every response carries `X-Request-ID`

## URL patterns (frontend)

| Pattern | Meaning |
|---------|---------|
| `/<collection>` | List view |
| `/<collection>/new` | Create action |
| `/<collection>/[id]` | Instance hub |
| `/<collection>/[id]/<facet>` | View of that instance |
| `/admin/<area>` | Steward console (flat, no nesting) |
| `/<public>` | Unauthenticated (login, scan, showcase) |

## Navigation architecture

The `NAV` constant in `AppShell.tsx` is the single source for:
- Desktop rail items
- Mobile drawer items
- Active-item highlighting (longest-prefix-wins)
- Steward route deep-link guard

A route not in NAV (and not linked from another page) fails `verify_screens.py`.

## Data access patterns

- **Queue-then-worker** for heavy writes (audits, bulk scans, scheduled runs)
- **Synchronous on Postgres** for auth, domain register/verify, finding review, initial audit row
- **Cache-aside** (`services/cache.py`) for national/rankings aggregates (TTL 120s, invalidated on audit completion)
- **Direct PG** for auth flows, single-audit status, anything just-written
- Redis down -> fallback to Postgres (never a 500)

## Adding a new cached read

1. Wrap DB query in `cache.get_or_set(cache.cache_key(name, *params), ttl, lambda: _query(db))`
2. Keep raw query in a private `_name(db, ...)` helper
3. Invalidate on the write that changes it
4. Add hit/miss/invalidate/fallback tests to `tests/test_cache.py`

## Schema change checklist

1. Edit `platform/db/schema.sql` (canonical source)
2. Update `platform/backend/app/models.py` (preserve PG ENUM/JSONB/INET types)
3. Create Alembic migration (`alembic revision --autogenerate -m "description"`)
4. Verify: `alembic upgrade head` + `alembic downgrade base` + `alembic upgrade head`

## Anti-patterns (do NOT add)

- Non-government sites (not even "just for testing")
- LLM or ML in the score path (not as tie-breaker, not for weighting)
- Synchronous audits (not even a "quick mode")
- Passwords (no password field, reset flow, or storage)
- Secret score adjustments (Integrity Engine caps verdict only, never score)
- Automated path to `compliant` (only assessor review)
- Score without evidence (unreachable site = `insufficient_evidence`, not defaults)
- Unapproved public rankings (requires approver + methodology version)

## Security checklist for new features

- [ ] Org-scoped queries filter by `org_id`
- [ ] Role enforcement via `require_role(...)`
- [ ] User-influenced URLs go through `url_validate.guarded_get`
- [ ] No secrets in logs or error responses
- [ ] New config uses `GOVUX_*` env prefix
- [ ] Structured error responses (not plain strings for auth errors)
