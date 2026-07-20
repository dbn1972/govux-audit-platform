# GovUX Helm Chart

Kubernetes deployment for the GovUX Audit Platform — mirrors `docker-compose.prod.yml`:
API + audit-worker fleet + scheduler + public-worker + web, with migrate-on-install,
health probes, HPA hooks, and secret/config separation.

## Prerequisites

- Kubernetes 1.24+ and Helm 3.8+ (works with Helm 4).
- **Pre-built images** for the backend and frontend (production builds), pushed to a
  registry your cluster can pull from.
- **External data stores** (the chart does NOT bundle them — enterprise best practice):
  - PostgreSQL 16 (with `pgvector`) — provide the DSN in `secrets.databaseUrl`.
  - Redis — a **durable** instance for the queue (`config.redisUrl`, AOF on) and,
    ideally, a separate cache instance (`config.cacheRedisUrl`).
  - S3-compatible object storage for report PDFs.

## Install

```bash
helm install govux ./platform/deploy/helm/govux \
  --namespace govux --create-namespace \
  --set image.registry=registry.gov.in/ \
  --set secrets.jwtSecret="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')" \
  --set secrets.secretKey="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')" \
  --set secrets.databaseUrl='postgresql+psycopg://USER:PASS@HOST:5432/govux' \
  --set config.redisUrl='redis://redis:6379/0' \
  --set config.cacheRedisUrl='redis://redis-cache:6379/0' \
  --set ingress.enabled=true --set ingress.host=govux.gov.in
```

Or reference a pre-created Secret (keys: `jwtSecret`, `secretKey`, `databaseUrl`,
`cruxApiKey`):

```bash
helm install govux ./platform/deploy/helm/govux --set existingSecret=govux-secrets ...
```

> The API **refuses to boot** if `jwtSecret`/`secretKey` are unset or equal — the chart
> enforces this at render time too.

## Key values

| Key | Default | Notes |
|---|---|---|
| `image.registry` / `image.backendRepository` / `image.webRepository` / `image.tag` | — / `govux/backend` / `govux/frontend` / `1.1` | your images |
| `secrets.jwtSecret` / `secrets.secretKey` / `secrets.databaseUrl` | "" (required) | or `existingSecret` |
| `config.redisUrl` / `config.cacheRedisUrl` / `config.corsOrigins` | in-cluster names | external in prod |
| `migrations.enabled` | `true` | `alembic upgrade head` as a pre-install/upgrade hook |
| `api.replicas` / `worker.replicas` / `web.replicas` | 2 / 3 / 2 | |
| `api.autoscaling.enabled` / `worker.autoscaling.enabled` | `false` | CPU HPA; see queue-depth note |
| `ingress.enabled` / `ingress.host` / `ingress.tls.*` | `false` / `govux.gov.in` | routes `/api` → API, `/` → web |
| `worker.podSecurityContext` | `{}` | Chromium sandbox — set non-root only with a compatible image |

## Upgrade & rollback

```bash
helm upgrade govux ./platform/deploy/helm/govux -f my-values.yaml   # runs migrations (hook)
helm rollback govux <REVISION>                                       # migrations are additive; verify data compatibility
```

Migrations are **additive and idempotent**; a rollback of the app is safe, but review
migration notes before rolling back across a schema change.

## Autoscaling on queue depth

The default HPA is CPU-based. For true audit-throughput scaling, expose
`govux_queue_audit_depth` (from `/metrics`) via **KEDA** or the Prometheus Adapter and
switch the worker HPA to that external metric.

## Verify (no cluster needed)

```bash
helm lint ./platform/deploy/helm/govux
helm template govux ./platform/deploy/helm/govux --set secrets.jwtSecret=a --set secrets.secretKey=b --set secrets.databaseUrl=x
```
