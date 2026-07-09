# Deployment Guide

How to deploy the GovUX Audit Platform — from a laptop demo to a hardened
production instance.

---

## 1. Prerequisites

- Docker & Docker Compose v2
- ~4 GB RAM free for dev (browsers are heavy); more for production workers
- Outbound internet from the worker (it scans live gov sites) — subject to the
  egress policy in §5

## 2. Development

```bash
cd platform
docker compose up --build
docker compose exec api python -m app.seed      # demo org/users/domains
```

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API + OpenAPI docs | http://localhost:8000/docs |
| Health | http://localhost:8000/healthz |
| MinIO console | http://localhost:9001 |

The dev stack uses `uvicorn --reload` and `next dev` (fast, not for production) and
a single Redis. Source is bind-mounted, so edits are live.

## 3. Production

Production uses [`platform/docker-compose.prod.yml`](../platform/docker-compose.prod.yml):
Gunicorn (multi-worker) + `next build && next start`, **two** Redis instances
(durable AOF-persisted queue vs. LRU cache), health checks, resource limits,
non-root API, a **worker fleet**, and **migrations applied on boot**.

### 3.1 Configure secrets

```bash
cp .env.example .env
# edit .env — set REAL values (see §4). The API will NOT boot without them.
```

Generate strong secrets:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 3.2 Launch

```bash
docker compose -f platform/docker-compose.prod.yml --env-file .env up -d
docker compose -f platform/docker-compose.prod.yml ps      # all healthy?
curl -s http://<host>:8000/healthz                          # {"status":"ok"}
```

Migrations run automatically via `entrypoint.sh` (`alembic upgrade head`) before
the API starts. To seed reference data (guideline library etc.) run your seed step
once against the production DB.

## 4. Required environment variables

| Variable | Required | Notes |
|---|:--:|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | ✅ | strong DB password |
| `GOVUX_JWT_SECRET` | ✅ | signs tokens + OTP/refresh HMACs — **never the default** |
| `GOVUX_SECRET_KEY` | ✅ | encrypts secrets at rest — **must differ** from the JWT secret |
| `GOVUX_CORS_ORIGINS` | ✅ | comma-separated real frontend origin(s) |
| `GOVUX_CRUX_API_KEY` | optional | Chrome UX Report field data (else lab-only) |
| `GOVUX_DATABASE_URL` / `GOVUX_REDIS_URL` / `GOVUX_CACHE_REDIS_URL` | set in compose | queue vs. cache Redis are split |

`GOVUX_ENV=production` (set in the prod compose) enables fail-fast checks: the app
**refuses to boot** with a default/empty JWT secret or a missing master key, and
`/metrics` requires a token.

## 5. Hardening checklist (do before real users)

- [ ] Strong, distinct `GOVUX_JWT_SECRET` and `GOVUX_SECRET_KEY`.
- [ ] `GOVUX_ENV=production`.
- [ ] Email provider = `smtp` or `api` (**never `console`** in prod — it would log
      OTPs).
- [ ] Set an admin `metrics_token` (Configuration → Monitoring), or network-restrict
      `/metrics`.
- [ ] **Egress network policy on the worker**: deny RFC1918 and `169.254.0.0/16`
      (defence-in-depth against DNS-rebinding SSRF). E.g. a dedicated network
      namespace / firewall rules on the worker containers.
- [ ] Run the worker as a non-root user (the API already does).
- [ ] Front Postgres with **PgBouncer** before scaling API replicas.
- [ ] TLS termination + a reverse proxy (nginx/ALB) setting HSTS/CSP/X-Frame-Options
      on the frontend.
- [ ] Back up the `pgdata` and `redisdata` volumes.

## 6. Scaling

- **Workers** are horizontally scalable — each replica uses a unique consumer id
  and reclaims crashed peers' jobs (`XAUTOCLAIM`). Increase `worker.replicas` (or
  add an HPA keyed on `govux_queue_audit_depth`). Each audit needs ~500 MB–1 GB for
  three browser engines.
- **API** replicas scale behind the load balancer; size the DB pool against
  Postgres `max_connections ÷ replicas` (and add PgBouncer).
- **Cache** Redis can be a managed cluster; the durable **queue** Redis must have
  AOF persistence.

## 7. Database migrations

Schema lives in `platform/backend/db/schema.sql` and is applied by migration `0001`;
later migrations are **additive and idempotent**. Apply with:

```bash
docker compose -f platform/docker-compose.prod.yml exec api alembic upgrade head
```
CI runs a migration **round-trip** (upgrade → downgrade → re-apply) on every PR.

## 8. CI/CD

`.github/workflows/ci.yml` runs on every push/PR: backend pytest (Postgres + Redis,
≥80% coverage), migration round-trip, screen verification, frontend build, and an
engine syntax check. Wire your deploy step to run **after** these pass.
