# Operational gotchas (read on demand)

## Environment / bring-up
- **db image must be `pgvector/pgvector:pg16`** — `schema.sql` does `CREATE EXTENSION vector`; plain
  `postgres:16` dies mid-init.
- **Backend Dockerfile is pinned `python:3.12-slim-bookworm`** — Playwright 1.44 `install --with-deps`
  breaks on newer Debian. The image ships Node + npm + Chromium; the compose `worker`/`scheduler`
  services carry an anonymous volume for `/app/audit_engine/node_modules` so the bind mount doesn't
  shadow it.
- Engine needs the Playwright Chromium; Lighthouse needs `--disable-dev-shm-usage` (Docker's 64 MB
  `/dev/shm` crashes the tab) and `chromePath: chromium.executablePath()`.
- Port 3000 conflicts with a `shipguardai-web-1` container from another project if Docker Desktop
  restarts it — stop that container.

## Dev-loop traps
- **macOS bind-mount `__pycache__` goes stale.** Host edits may not take effect in the api/worker
  container until `find /app -name __pycache__ -exec rm -rf {} +` inside it (or run python with `-B`).
- **`docker compose` from the Bash tool sometimes loses its project dir** ("no configuration file
  provided"). Pass `-f /…/platform/docker-compose.yml` explicitly.
- Redis Streams entries can be lost if enqueued while the worker's consumer group isn't reading;
  set `PYTHONUNBUFFERED=1` on worker so logs flush and you can see it consuming.

## Testing
- Tests run against the compose Postgres (models use PG types: UUID/JSONB/INET/ENUM), with the Redis
  queue monkeypatched in `tests/conftest.py`.
- **pytest pollutes the shared dev DB:** the bulk-scan test auto-discovers all verified domains and
  leaves audits `queued`; the idempotency guard then returns those stale task_ids instead of
  enqueueing real audits. `conftest._schema` teardown cancels leftover queued audits — keep it.
- New deps `dnspython`/`pypdf` are imported lazily (`# pragma: no cover`) and monkeypatched in tests,
  so pytest runs without a rebuild; rebuild the image before a live verification/PDF run.
- Applying schema changes to the running dev DB without a full re-create: run the `0002` ALTERs
  (they're `IF NOT EXISTS`, idempotent).

## Engine
- CSS selectors passed to `page.evaluate` **must quote attribute values** (`a[href*="/hi"]`, not
  `a[href*=/hi]`) or `querySelector` throws a SyntaxError inside the browser context.
- Gov WAFs 403 the default HeadlessChrome UA — the engine sets a standard desktop UA and an explicit
  `browser.newContext()` (also required by `@axe-core/playwright`).
- Gov sites rarely reach `networkidle`; the engine waits for `domcontentloaded` then a bounded
  `networkidle`. The homepage is audited **in place** (never re-navigated) and there's a 400 ms
  politeness delay between crawled pages, so a WAF throttling the crawl can't zero out the primary
  result.

## Config that needs real secrets in prod (built + mocked in tests)
`GOVUX_CRUX_API_KEY` (field data), live DNS/HTTP for domain verification, outbound webhook URL.
Without them the features degrade gracefully (field data = None, verify = fail-closed).
