# Configuration Reference

Every setting, in one place. There are two layers:

1. **Deploy-time environment variables** — read at boot (prefix `GOVUX_`, plus the
   `POSTGRES_*` used by the database container). Set in `.env` /
   Helm values / your orchestrator.
2. **Runtime settings** — editable by admins in **Admin → Configuration** without a
   redeploy (stored in the `app_settings` table; override the code defaults).

Authoritative defaults live in `platform/backend/app/config.py`; the starter
template is `platform/.env.example`.

---

## 1. Environment variables (deploy-time)

### Core & secrets

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `GOVUX_ENV` | `dev` | prod: `production` | `production` enables fail-fast secret checks |
| `GOVUX_JWT_SECRET` | `change-me-in-prod` | ✅ prod | signs access tokens — 32+ random chars |
| `GOVUX_SECRET_KEY` | _(empty)_ | ✅ prod | encrypts stored secrets at rest — **must differ** from JWT secret |
| `GOVUX_CORS_ORIGINS` | — | ✅ prod | comma-separated allowed browser origins |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `govux` / — / `govux` | ✅ prod (password) | database container credentials |

> In production the API **refuses to boot** if `GOVUX_SECRET_KEY` is unset or
> equals the JWT secret. Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

### Data stores

| Variable | Default | Purpose |
|---|---|---|
| `GOVUX_DATABASE_URL` | `postgresql+psycopg://govux:govux@db:5432/govux` | Postgres (pgvector) connection |
| `GOVUX_REDIS_URL` | `redis://redis:6379/0` | durable queue + status |
| `GOVUX_CACHE_REDIS_URL` | _(empty → uses `redis_url`)_ | separate LRU cache instance (prod) |
| `GOVUX_DB_POOL_SIZE` / `GOVUX_DB_MAX_OVERFLOW` / `GOVUX_DB_POOL_TIMEOUT` | `10` / `20` / `30` | connection-pool tuning |
| `GOVUX_S3_ENDPOINT` / `GOVUX_S3_BUCKET` / `GOVUX_S3_ACCESS_KEY` / `GOVUX_S3_SECRET_KEY` / `GOVUX_S3_REGION` | MinIO defaults | object storage (point at AWS S3 for prod) |

### Sessions & tokens

| Variable | Default | Purpose |
|---|---|---|
| `GOVUX_ACCESS_TTL_SECONDS` | `900` (15 min) | access-token lifetime |
| `GOVUX_REFRESH_TTL_SECONDS` | `5184000` (60 days) | device-bound refresh-token lifetime |
| `GOVUX_OTP_TTL_SECONDS` | `300` (5 min) | OTP validity |
| `GOVUX_OTP_MAX_ATTEMPTS` | `5` | OTP tries before invalidation |
| `GOVUX_JWT_ALG` | `HS256` | token signing algorithm |

### Engine, queues & jobs

| Variable | Default | Purpose |
|---|---|---|
| `GOVUX_ENGINE_VERSION` | `v3.2` | methodology version stamped on reports |
| `GOVUX_AUDIT_STREAM` / `GOVUX_CONSUMER_GROUP` | `govux:audits` / `workers` | audit job stream |
| `GOVUX_PUBLIC_SCAN_STREAM` / `GOVUX_PUBLIC_CONSUMER_GROUP` | `govux:public` / `public-workers` | free-scan stream |
| `GOVUX_SCHEDULER_POLL_SECONDS` | `60` | scheduled-audit poll interval |
| `GOVUX_WEBHOOK_TIMEOUT_SECONDS` | `10` | CI/CD webhook timeout |
| `GOVUX_MAX_DOCUMENTS_PER_AUDIT` | `10` | PDF/doc cap per audit |

### Integrations & quotas

| Variable | Default | Purpose |
|---|---|---|
| `GOVUX_CRUX_API_KEY` | _(empty → lab-only performance)_ | Chrome UX Report field data |
| `GOVUX_FREE_REGISTERED_PAGES` | `10` | pages a registered user may scan free |
| `GOVUX_SCAN_IP_LIMIT` / `GOVUX_SCAN_IP_WINDOW` | `3` / `86400` | free scans per IP before CAPTCHA |
| `GOVUX_OTP_REQUEST_IP_LIMIT` | `6` | OTP requests per IP per hour |
| `GOVUX_OTP_FAIL_THRESHOLD` | `3` | failed sign-ins before lock-out |
| `GOVUX_OTP_LOCK_SECONDS` / `_2` | `600` / `1200` | first / escalated lock-out |
| `GOVUX_CAPTCHA_SECRET` | _(empty)_ | Turnstile/reCAPTCHA secret |

---

## 2. Runtime settings (Admin → Configuration)

Editable without redeploy by `super_admin` (and `programme_admin` where allowed).
Stored in `app_settings`; secret-typed values are **encrypted at rest** with
`GOVUX_SECRET_KEY`. Every change is written to the audit log.

| Setting | Type | Purpose |
|---|---|---|
| `email_provider` | str | how OTP mail is sent (`smtp`/console) |
| `email_from` | str | From address for OTP mail |
| `smtp_host` / `smtp_port` / `smtp_user` | str/int/str | SMTP relay |
| `smtp_password` | secret | SMTP credential (encrypted) |
| `captcha_enabled` | bool | require CAPTCHA on the public scanner |
| `captcha_provider` | str | Turnstile / reCAPTCHA |
| `captcha_secret` | secret | provider secret (encrypted) |
| `cache_ttl_seconds` | int | aggregate-cache TTL |
| `free_registered_pages` | int | per-user free page quota |
| `scan_ip_limit` / `scan_ip_window` | int | public-scan rate limit |
| `otp_request_ip_limit` | int | OTP-request rate limit |
| `otp_fail_threshold` / `otp_lock_seconds` | int | brute-force lock-out tuning |
| `metrics_enabled` | bool | expose `/metrics` |
| `metrics_token` | secret | bearer token guarding `/metrics` in prod |

> Runtime settings **override** the matching env defaults, so operators can tune
> quotas and wire SMTP/CAPTCHA live. Rotating `GOVUX_SECRET_KEY` re-keys the
> encrypted secret settings — see [OPERATIONS.md](OPERATIONS.md).

---

See also: [DEPENDENCIES.md](DEPENDENCIES.md) · [DEPLOYMENT.md](DEPLOYMENT.md) ·
[SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md).
