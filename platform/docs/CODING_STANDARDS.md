# Coding standards & test-coverage policy (read on demand)

## Test coverage (enforced)
- **≥80% backend line coverage is a hard gate** (`pytest.ini: --cov-fail-under=80`; currently ~93%).
  A PR that drops below 80% fails. Prefer raising it, never lower the gate.
- **Every new endpoint and every new service function ships with tests** in `backend/tests/`.
- **Test the three cases:** happy path, the error/permission path (404/403/400/409, invalid input),
  and a boundary (empty result, threshold edge, idempotent repeat). Scoring/verdict logic gets
  explicit boundary tests (band cut-offs, guard-rail, compliance transitions).
- **Keep I/O out of unit tests.** Pure logic (`scoring`, `remediation`, `discovery`, `language`,
  `pdf_audit.assess`, `crux.parse_record`) is tested directly. Network/DB/subprocess is *injected or
  monkeypatched*: engine via `worker.run_engine`, HTTP via injected fetchers, Redis via `FakeRedis`,
  DNS/PDF via lazy (`# pragma: no cover`) wrappers stubbed in tests. Never hit the real network in a test.
- **Engine (Node) changes are smoke-tested** with a real `node runner.js` run before merge (not in
  the pytest gate). Frontend logic in `lib/` is covered by vitest.
- Naming: `test_<unit>_<behavior>`; one behaviour per test; use the `client`/`ctx`/`db`/`verified_domain`
  fixtures rather than re-building setup.

## Python
- PEP 8, 4-space indent, ~100-col lines. Full type hints on public functions; `dict`/`list` builtins.
- FastAPI: thin routers; `Depends(current_user)` / `require_role(...)` for auth; Pydantic v2 models in
  `schemas.py` drive OpenAPI. Business logic lives in `services/`, not routers.
- SQLAlchemy 2.0 style; models mirror `db/schema.sql` exactly (PG `ENUM`/`JSONB`/`INET`). Never build
  SQL by string concatenation.
- **Fail closed on security**: verification, auth, and permission checks default to deny/`False` on
  error. Never log secrets, tokens, OTPs, or refresh tokens.
- Docstrings only where intent is non-obvious (a constraint, a "why"), not to restate the code.
- Config via `settings` (env `GOVUX_*`); no literals for secrets/keys/URLs.

## TypeScript / Next.js
- Client pages mount `AppShell`; all data goes through `lib/api.ts` (handles silent token refresh).
- Use Bootstrap 5 / UX4G classes (`btn`, `card`, `table`, `badge`, `bi-*`); deep-blue headings via
  `var(--ux-navy)`. No bespoke CSS when a token/class exists.
- Every new screen passes `scripts/verify_screens.py` (structure + reachability) and is linked
  from the `AppShell` nav or another page — orphaned routes fail the check.

## Engine (Node)
- Deterministic, no AI in the score path. **Quote attribute values** in any selector passed to
  `page.evaluate` (`a[href*="/hi"]`). Wrap every check in try/catch and degrade to a neutral score
  rather than crashing the run. Bound runtime (crawl caps, politeness delays, timeouts).

## Data access
Follow `DATA_ACCESS.md`: queue heavy writes, keep transactional writes synchronous, cache read-heavy
aggregates via `services/cache.py`, and keep Postgres as the source of truth.

## Definition of done
Tests green + coverage ≥80% · `verify_screens.py` passes · schema.sql ⇄ models.py ⇄ Alembic in sync ·
no secrets in code/logs · engine change smoke-tested.
