# Operations Runbook

Day-2 operations for the GovUX Audit Platform: monitoring, alerts, common
incidents, and recovery.

---

## 1. Health & monitoring

| Signal | Where |
|---|---|
| Liveness | `GET /healthz` → `{"status":"ok"}` |
| Metrics (Prometheus) | `GET /metrics` (token-gated in prod) |
| Admin live panel | Configuration → **Live health** (cache/queue/DB, auto-refresh) |
| Structured logs | stdout of each service; every log line and error carries a **request id** |

### Key metrics (`/metrics`)

| Metric | Meaning | Watch for |
|---|---|---|
| `govux_queue_audit_depth` | jobs waiting | sustained growth = workers behind |
| `govux_queue_audit_pending` | unacked (in-flight) jobs | high = crashed workers |
| `govux_queue_audit_dlq` | dead-lettered poison jobs | **>0 = investigate** |
| `govux_cache_hit_rate` | 0–1 | low = DB pressure |
| `govux_db_pool_checked_out` / `_size` | pool usage | at max = saturation |

Alert rules ship in [`ops/prometheus-alerts.yml`](../platform/ops/prometheus-alerts.yml)
— load them into Prometheus/Alertmanager.

---

## 2. Alerts → response

**`GovuxDeadLetterQueueNonEmpty` (critical).** A job failed past the retry cap.
1. Inspect the DLQ stream: `redis-cli XRANGE govux:audits:dlq - +`.
2. Read the failure — usually one pathological URL. Check worker logs by the task id.
3. Fix the root cause; re-enqueue if appropriate, or leave parked.

**`GovuxAuditQueueBacklog` (warning).** Depth > 5000 for 10 min.
- Scale workers (`worker.replicas` up / HPA) — each handles ~1 audit / few minutes.
- Confirm workers are healthy (not all stuck in `pending`).

**`GovuxAuditPendingStuck` (warning).** Many unacked jobs.
- Likely crashed workers. The reclaim loop (`XAUTOCLAIM`) recovers them within a few
  minutes; if not, restart the worker service.

**`GovuxDbPoolSaturated` (critical).** Pool fully checked out.
- Add PgBouncer; raise `db_pool_size`; check for a slow query or a stuck transaction.

---

## 3. Queue & worker operations

- **Streams:** audits on `govux:audits` (group `workers`), public scans on
  `govux:public`, dead-letters on `govux:audits:dlq`.
- **At-least-once + idempotent:** a job is acked only on success; failures stay
  pending and are reclaimed. A per-domain advisory lock prevents duplicate
  concurrent audits.
- **Restart safely:** workers are stateless; restart/scale freely. In-flight jobs on
  a killed worker are reclaimed by peers.

```bash
# queue depth / pending / dlq
redis-cli XLEN govux:audits
redis-cli XPENDING govux:audits workers
redis-cli XLEN govux:audits:dlq
```

---

## 4. Common incidents

**"API won't start in production."** By design it refuses to boot without a strong
`GOVUX_JWT_SECRET` and a distinct `GOVUX_SECRET_KEY` — check the startup log for the
exact `RuntimeError` and set the missing/weak secret.

**"Users get logged out mid-session."** Check the refresh flow — the cookie is set
at `path=/` and sent to `/api/v1/auth/refresh`. A reused (rotated) refresh token
**revokes the whole family** by design (session-theft response); the user simply
signs in again.

**"OTP emails aren't arriving."** Configuration → Email/OTP delivery → **Send test
email**. In production the `console` provider is refused (it would log OTPs); use
`smtp`/`api`.

**"Scores look wrong / a site shows a mid-band 60 for a broken crawl."** Check the
report's **coverage** — a WAF-blocked crawl reduces coverage; the platform surfaces
this rather than hiding it. Re-run or lower depth.

**"Cache seems stale."** Aggregates auto-invalidate when an audit completes; TTL is
admin-configurable (Configuration → Monitoring). A Redis outage degrades to direct
DB reads (fail-open) — never a 500.

---

## 5. Backups & recovery

- **Postgres** (`pgdata`) — source of truth. Take regular `pg_dump`/snapshot
  backups; test restores.
- **Queue Redis** (`redisdata`) — AOF-persisted so in-flight jobs survive a restart.
- **Cache Redis** — disposable (rebuilds from Postgres on miss).
- **Object storage (MinIO/S3)** — durable report PDFs for registered users.

Recovery order after a full outage: DB → queue Redis → API/workers → cache Redis →
frontend.

---

## 6. Security operations

- Rotate `GOVUX_JWT_SECRET` / `GOVUX_SECRET_KEY` per policy; rotation invalidates
  existing sessions (users re-authenticate).
- Review the **audit log** (`audit_log` table) for privileged actions (config
  changes, reviews) — each records actor, IP, and detail.
- Keep dependencies current (`pip-audit`, `npm audit`, Dependabot) — the worker
  parses untrusted PDFs, so keep `pypdf` patched.
- Maintain the worker **egress policy** (deny internal ranges).

See [SECURITY.md](../SECURITY.md) for the vulnerability-reporting process.
