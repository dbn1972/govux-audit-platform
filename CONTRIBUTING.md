# Contributing to GovUX Audit Platform

Thank you for helping improve government website quality. This guide covers the
local setup, the standards we hold, and how changes get merged.

## Ground rules (the "never break" invariants)

These are enforced in code and tests — a change that violates one will be rejected:

1. **The score path is deterministic and LLM/ML-free.** ML/CV outputs are advisory
   and computed *after* the score is committed. Same inputs ⇒ same score.
2. **The legal compliance verdict is separate from the UX band.** Automated-only
   evidence can reach at most `partially_compliant`.
3. **Audits are asynchronous** — `POST /v1/audits` returns `202` + a task id and is
   processed by a Redis-Streams worker. Never run an audit inline in a request.
4. **Access is restricted to `.gov.in` / `.nic.in`** — enforced in code *and* a DB
   constraint.
5. **Schema changes stay in sync:** `db/schema.sql` ⇄ `app/models.py` ⇄ an Alembic
   migration.

See [`platform/docs/CODING_STANDARDS.md`](platform/docs/CODING_STANDARDS.md) and
[`platform/docs/DATA_ACCESS.md`](platform/docs/DATA_ACCESS.md) for the full rules.

## Local development

```bash
cd platform
docker compose up --build
docker compose exec api python -m app.seed
```

- Backend: FastAPI at `:8000` (`/docs` for OpenAPI). Source is bind-mounted with
  `--reload`, so edits are live — **no rebuild needed** to see changes.
- Frontend: Next.js at `:3000`.
- Database and Redis run as compose services.

## Making a change

1. **Branch** off `main` (never commit directly to `main`).
2. **Write code that reads like the surrounding code** — match the existing
   conventions, comment density, and idioms.
3. **Add tests** for every changed path. Aim to keep coverage ≥ 80% (the CI gate).
4. **Keep the layers in sync** for schema changes (rule 5 above).

## Testing (must pass before a PR)

```bash
# backend — real Postgres + Redis, ≥80% coverage gate
docker compose exec api pytest

# frontend — types + unit + build
docker compose exec web npx tsc --noEmit
docker compose exec web npm test
docker compose exec web npm run build

# screen contract
python3 platform/scripts/verify_screens.py
```

CI runs all of these plus a **migration round-trip** and **screen verification** on
every pull request; they are required to pass before merge.

## Commit & PR conventions

- Write clear, imperative commit messages ("Add …", "Fix …", not "added").
- One focused change per PR; describe **what** and **why**, and how you verified it.
- Fill in the pull-request template (tests, screenshots for UI changes, security
  considerations).
- New endpoint ⇒ router in `routers/`, included in `main.py`, with a test.
- New screen ⇒ `AppShell` layout, `lib/api.ts` client method, passes
  `verify_screens.py`, added to nav, with loading/empty/error states.

## Reporting bugs & requesting features

Use the [issue templates](.github/ISSUE_TEMPLATE). For **security** issues, follow
[SECURITY.md](SECURITY.md) — do not open a public issue.

## Code of conduct

All participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md).
