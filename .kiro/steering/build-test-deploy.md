# Build, Test & Deploy

## Local development

```bash
cd platform
docker compose up --build
docker compose exec api python -m app.seed
```

| Surface | URL |
|---------|-----|
| Frontend | http://localhost:3000/login |
| API / OpenAPI docs | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 (govux / govux-secret) |
| Postgres | localhost:5432 (govux / govux / govux) |

Sign in with seeded accounts; in dev mode OTP is returned in the `dev_otp` field of the response.

## Dev workflow

- Source is bind-mounted: Python and TSX edits are live (no rebuild needed)
- Rebuild only when `requirements.txt`, `package.json`, or Dockerfile changes
- Never remove anonymous `node_modules` volumes from worker/scheduler/public-worker/web

## Testing

### Backend (pytest)
```bash
docker compose exec api pytest                              # full suite, >=80% gate
docker compose exec api pytest tests/test_scoring_validation.py -q  # single test
```
- 221 tests across 36 files
- `pytest.ini`: `--cov=app --cov-report=term-missing --cov-fail-under=80`
- Tests use compose Postgres (PG types: UUID/JSONB/INET/ENUM)
- Redis monkeypatched in `tests/conftest.py`

### Frontend (Vitest + Playwright)
```bash
cd platform/frontend
npm test                    # vitest run (unit/component tests)
npm run e2e                 # full Playwright cross-browser
npm run e2e:a11y            # accessibility gate (axe, chromium only)
```

### Screen verification
```bash
python3 platform/scripts/verify_screens.py
```
Asserts all 36 routes render AND are reachable from AppShell navigation.

### Migration round-trip
```bash
docker compose exec api alembic upgrade head
docker compose exec api alembic downgrade base
docker compose exec api alembic upgrade head
```

## CI pipeline (.github/workflows/ci.yml)

10 jobs, all run on every push/PR except e2e (nightly/manual):

| Job | What it does |
|-----|--------------|
| `backend` | pytest with coverage gate (pgvector + Redis services) |
| `migrations` | Alembic round-trip (upgrade -> downgrade -> upgrade) |
| `screens` | `verify_screens.py` structure + reachability |
| `frontend` | Vitest + next build + accessibility gate (axe, chromium) |
| `e2e` | Full stack + 3 Playwright browsers (nightly/manual only) |
| `backup` | Dump + verify restore + prove verifier can fail |
| `helm` | Lint + template render of Helm chart |
| `wizard` | Guided-setup script + air-gap bundle integrity |
| `terraform` | fmt + init + validate |
| `ansible` | Syntax check + ansible-lint |
| `engine` | Node --check on runner.js + unit test robots.js |

## Deployment targets

| Target | Path / Tool |
|--------|-------------|
| Dev | `platform/docker-compose.yml` (6 services, bind mounts) |
| Single-host prod | `platform/docker-compose.prod.yml` (gunicorn + uvicorn) |
| Kubernetes | `platform/deploy/helm/govux/` |
| Infrastructure | `platform/deploy/terraform/` |
| Config management | `platform/deploy/ansible/` |
| Air-gapped | `platform/deploy/AIRGAP.md` + `scripts/build-airgap-bundle.sh` |
| Guided install | `platform/scripts/govux-setup.py` |

## Production checklist

1. `.env` with real, distinct secrets (JWT != SECRET_KEY)
2. `GOVUX_ENV=production` (enables fail-fast checks + HSTS)
3. `GOVUX_CORS_ORIGINS` set to real origin(s)
4. `metrics_token` set (mandatory in prod)
5. `GOVUX_CACHE_REDIS_URL` pointed at separate Redis from queue
6. Redis AOF persistence enabled
7. `alembic upgrade head` before starting the API
8. TLS at ingress; readiness on `/readyz` not `/healthz`
9. Scale `worker` replicas for throughput (unique HOSTNAME each)

## Key environment variables (prefix `GOVUX_`)

| Category | Key variables |
|----------|--------------|
| App | `GOVUX_APP_NAME`, `GOVUX_ENGINE_VERSION` (v3.2), `GOVUX_ENV`, `GOVUX_CORS_ORIGINS` |
| Data | `GOVUX_DATABASE_URL`, `GOVUX_REDIS_URL`, `GOVUX_CACHE_REDIS_URL` |
| Auth | `GOVUX_JWT_SECRET`, `GOVUX_SECRET_KEY` (must differ!), TTL settings |
| Queue | `GOVUX_AUDIT_STREAM`, `GOVUX_CONSUMER_GROUP`, `GOVUX_PUBLIC_SCAN_STREAM` |
| Engine | `GOVUX_CRUX_API_KEY`, `GOVUX_MAX_DOCUMENTS_PER_AUDIT` |
| Abuse | `GOVUX_SCAN_IP_LIMIT`, `GOVUX_OTP_REQUEST_IP_LIMIT`, `GOVUX_CAPTCHA_SECRET` |
| Storage | `GOVUX_S3_ENDPOINT`, `GOVUX_S3_BUCKET`, `GOVUX_S3_ACCESS_KEY`, `GOVUX_S3_SECRET_KEY` |

## Gotchas

- `db/schema.sql` loads only on empty volume (first docker init). After schema change: run Alembic or `docker compose down -v`.
- DB image must be `pgvector/pgvector:pg16` (not plain `postgres:16`).
- macOS bind-mount `__pycache__` goes stale; clear inside container or use `-B`.
- Dev Redis persistence is now enabled (AOF), but orphan reconciler is still missing.
- pytest pollutes the shared dev DB; `conftest._schema` teardown cancels leftover queued audits.
- Port 3000 may conflict with other containers on Docker Desktop restart.
