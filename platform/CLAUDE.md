# platform/CLAUDE.md — dev

FastAPI 3.12 + Next.js 14 + Node engine (Playwright/Lighthouse/axe) + Postgres(pgvector) + Redis Streams.
Rules & token workflow: `../CLAUDE.md`. **Follow the standards in** `docs/CODING_STANDARDS.md` +
`docs/DATA_ACCESS.md`. Depth on demand: `docs/{ARCHITECTURE,API,GOTCHAS,SCORING_VALIDATION}.md`.

## Run & test
```
docker compose up --build && docker compose exec api python -m app.seed   # :8000/docs · :3000/login
docker compose exec api pytest    # ≥80% gate (≈92%)   ·   web: npm test   ·   python3 scripts/verify_screens.py
```

## Change rules that bite
- `services/scoring.py`: deterministic, weights=100, guard-rail caps band at C on critical a11y/trust.
  Invariants locked in `tests/test_scoring_validation.py`.
- Data access: queue heavy writes; keep auth/transactional writes synchronous on Postgres (source of
  truth); cache read-heavy aggregates via `services/cache.py`. Details in `docs/DATA_ACCESS.md`.
- Schema change ⇒ `db/schema.sql` + `app/models.py` (PG ENUM/JSONB/INET) + Alembic (`0002` additive).
- New endpoint ⇒ router in `routers/`, included in `main.py`, with a test (≥80%).
- New screen ⇒ `AppShell` + `lib/api.ts`, passes `verify_screens.py` (structure + reachability:
  an unlinked route fails), reachable from the nav or another page.
