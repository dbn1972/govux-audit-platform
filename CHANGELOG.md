# Changelog

All notable changes to the GovUX Audit Platform are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/); this
project uses date-based entries until formal versioning begins.

## [Unreleased]

### Security
- Org-scoped authorization across the audits router — closed a cross-tenant IDOR
  (any officer could read another department's report by task id).
- SSRF-guarded outbound fetch on every hop (scans + document fetch); same-origin
  document discovery; blocked private/loopback/link-local/reserved/metadata IPs.
- Refresh-token **family revocation** on rotated-token reuse (session-theft
  containment).
- Production boot now rejects a default/empty `GOVUX_JWT_SECRET` and requires a
  distinct `GOVUX_SECRET_KEY` (SAST-001).
- OTP is never written to logs in production; the `console` email provider is
  refused in production (SAST-003).
- `/metrics` requires a token in production (SAST-006).
- SAST posture improved **67 → 85/100 (Good)**.

### Added
- **Certification loop** — `POST /v1/audits/{id}/review` lets an assessor certify an
  audit, unlocking a defensible `compliant` verdict (previously unreachable).
- **Observability** — Prometheus `/metrics`, an admin live-health panel, request
  IDs, structured logging, and Prometheus alert rules (`ops/prometheus-alerts.yml`).
- **National roll-ups** — live `/v1/ministries` and `/v1/states` endpoints;
  per-audit score `trend`. Replaced fabricated demo data on the national, league,
  ministries, states, trends, and compatibility screens with live data.
- **Reliability** — Redis-Streams **dead-letter queue** + `XAUTOCLAIM` reclaim of
  crashed jobs; cache **stampede single-flight**; per-domain idempotency advisory
  lock; read-through caching of the report and domain-list reads.
- **Production topology** — `docker-compose.prod.yml` (Gunicorn, `next start`,
  split + AOF-persisted Redis, health checks, resource limits, migrate-on-boot),
  `.env.example`, and a CI migration round-trip check.
- Full responsive shell (mobile off-canvas drawer with focus management) and an
  AA-contrast colour pass (all band/score colours ≥ 4.5:1).

### Changed
- National/rankings roll-ups now count the **latest audit per domain** (no longer
  double-count history).
- Database: explicit connection-pool sizing, FK + partial league indexes, TOCTOU
  fix on the audit-idempotency guard, SQL anti-join for bulk-scan targeting.

### Testing
- Backend suite: **181 tests, ~89% coverage** (security, integration, rollup,
  metrics, SAST-fix suites added). Screen contract 52/52. CI now runs Postgres +
  Redis + a migration round-trip.

---

_Earlier history predates version control; this is the first tracked release._
