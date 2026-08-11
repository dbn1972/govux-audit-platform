# GovUX Audit Platform — `platform/`

The runnable implementation of **BRD v1.1**: a self-service UX & compliance audit
engine for `.gov.in` / `.nic.in` websites.

> **Status:** the backend, audit engine and frontend are all built out — 12 routers /
> 61 endpoints, 22 tables, 221 backend tests at a ≥80% coverage gate, and **36 App
> Router routes** covering the officer workspace and the `/admin/*` steward console.
> The original 22 static screens in `../prototype/` are the historical design
> reference; they have been superseded by the React routes under `frontend/app/`.
>
> For the complete product specification — invariants, scoring model, data model,
> information architecture and a from-scratch rebuild plan — see **[`../PRODUCT.md`](../PRODUCT.md)**.

## Run it

```bash
docker compose up --build
```

- Frontend (Next.js):  http://localhost:3000/login
- API (FastAPI):        http://localhost:8000
- **API docs (OpenAPI)**: http://localhost:8000/docs  ← auto-generated
- Postgres seeds itself from `db/schema.sql`

## Stack (per BRD v1.1)

| Layer | Tech |
|-------|------|
| Frontend + BFF | Next.js (React/TypeScript) |
| Core API | FastAPI (Python) — same runtime as scoring/ML |
| Queue | **Redis Streams** (polyglot; Node + Python workers), no Celery |
| Workers | Python (rules/ML/scoring) + Node (Lighthouse/axe/Playwright) |
| Data | PostgreSQL (+ pgvector), Redis, MinIO/S3 (evidence) |

## UX4G design system

The frontend inherits the **UX4G Design System 2.0**, which is built on **Bootstrap 5**:

- `bootstrap` + `bootstrap-icons` are npm dependencies (`package.json`).
- `app/layout.tsx` imports `bootstrap.min.css`, then `ux4g-theme.css` (overrides), then `globals.css`.
- `app/ux4g-theme.css` maps Bootstrap's CSS variables (`--bs-primary`, `--bs-body-color`, `--bs-border-radius`, `--bs-font-sans-serif`, …) to UX4G tokens (primary `#0d6efd`, secondary `#6c757d`, deep-blue headings `#0a3d7a`, tricolour strip, score-band utilities).
- Pages use **official Bootstrap/UX4G component classes** (`container`, `row`/`col`, `card`, `btn btn-primary`, `form-control`, `table table-hover`, `badge`, `alert`, `bi-*` icons) — see `login`, `dashboard`, `report`.
- Font is wired via `next/font` (Inter). For production, swap to the exact UX4G font and add **Noto Sans** for Indic scripts.

To go fully native, also install UX4G's published component package (if using their Figma-linked kit) and replace bespoke widgets with UX4G components.

## Layout

```
platform/
  db/schema.sql            # full Postgres schema (orgs, users, devices, sessions,
                           #   domains, audits, pages, findings, scores, rankings, log)
  backend/
    app/
      main.py              # FastAPI app + CORS (credentials for the refresh cookie)
      config.py            # env-driven settings
      database.py models.py schemas.py
      security.py          # gov-email check, OTP, JWT access, device-bound refresh
      deps.py              # current_user / require_role
      routers/auth.py      # OTP request/verify, refresh (rotating), devices list/revoke
      routers/audits.py    # POST /audits->task_id, status, report, history, compare, bulk
      services/scoring.py  # weighted 8-category GovUX score + guard-rails (Annex B)
      services/queue.py    # Redis Streams enqueue/consume
      worker.py            # worker loop (drives states, writes score)
  frontend/
    app/login report dashboard   # representative pages (WebCrypto device key on login)
    lib/api.ts             # API client w/ silent token refresh
    app/globals.css        # design tokens (subset of prototype/app.css)
```

## Key API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/auth/otp/request` | Send OTP (rejects non gov.in/nic.in) |
| POST | `/v1/auth/otp/verify`  | Verify + issue access token + device-bound refresh cookie |
| POST | `/v1/auth/refresh`     | Rotate the refresh token (reuse detection) |
| GET/DELETE | `/v1/auth/devices` | List / revoke trusted devices |
| POST | `/v1/audits`           | Submit audit → **202 { task_id }** |
| GET  | `/v1/audits/{id}`      | Live status + progress |
| GET  | `/v1/audits/{id}/report` | Full result (8 category scores + findings) |
| GET  | `/v1/domains/{id}/compare` | Diff two dated snapshots |
| POST | `/v1/bulk-scans`       | Estate-wide bulk scan (auto-discover / list) |

## Auth model (Gmail-style)

Passwordless OTP restricted to `.gov.in` / `.nic.in`. On verify: a short-lived
JWT access token (in memory) + a **rotating, device-bound refresh token** in an
HttpOnly/Secure/SameSite cookie. A device key pair (WebCrypto/DBSC) binds the
session to the browser, so a stolen cookie is useless elsewhere. Refresh-token
reuse revokes the whole session family. See `security.py` + `routers/auth.py`.

## Screen → route map (extend the prototype into Next.js)

| Prototype screen | Next.js route |
|------------------|---------------|
| login.html | `/login` ✅ |
| dashboard.html | `/dashboard` ✅ |
| report.html | `/report` ✅ |
| domains / register / configure / running | `/domains`, `/domains/new`, `/audits/new`, `/audits/[id]` |
| issues / issue-detail / compatibility | `/audits/[id]/issues`, `/issues/[id]`, `/audits/[id]/compatibility` |
| trends / compare | `/audits/[id]/trends`, `/audits/[id]/compare` |
| manual-review / library / settings | `/review`, `/library`, `/settings` |
| national / bulk-scan / ministries / states / league / alerts / standards | `/admin/*` |

## Next steps
1. Wire the real audit runners in `worker.py` (Node: Lighthouse+axe+Playwright; Python: GIGW rules + Phase-1 ML).
2. Port the remaining prototype screens into `frontend/app/**`.
3. Add Alembic migrations, tests, and the SSO (Parichay) integration.
