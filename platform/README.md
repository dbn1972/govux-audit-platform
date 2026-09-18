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

The frontend runs on the **UX4G Design System** directly. Bootstrap is fully
removed — no `bootstrap`/`bootstrap-icons` dependency, no `ux4g-theme.css`
remapping layer, no `--bs-*` variables anywhere in the source.

- `ux4g-web-components` (npm) is the only CSS framework dependency. It ships the
  reset, the `--ux4g-*` design tokens, 53 components and the utility classes.
- `app/layout.tsx` imports, in this order: `ux4g-web-components/styles.css` →
  `app/design-system.css` → `app/globals.css`. UX4G must come first: it
  establishes the reset and the tokens everything else is expressed in.
- Pages use **UX4G classes directly** — `ux4g-btn ux4g-btn-primary`,
  `ux4g-table`, `ux4g-alert`, `ux4g-input`, `ux4g-tag-tonal-*`, `ux4g-container`,
  `ux4g-grid` / `ux4g-cols-span-*`, `ux4g-heading-*`, and the `ux4g-p*`/`ux4g-m*`
  spacing scale. See `login`, `dashboard`, `report`.
- `app/design-system.css` is the **gx-\* product layer**: only the primitives UX4G
  has no component for — the score meter, the verdict and severity blocks, the
  guided-review workflow, the nav rail, the stat tiles and the landing page. It is
  authored on UX4G semantic tokens, so both themes come from one source.
- Icons come from `lucide-react` behind `components/Icon.tsx`, which maps the
  project's icon vocabulary (the historical `bi-*` names, still used as data in
  the nav and notification models) onto lucide components.
- Theming is UX4G's own `data-theme` attribute, applied before first paint by an
  inline script in `layout.tsx` so a dark-mode reader never sees a white flash.
- Fonts are **Noto Sans** + **Noto Sans Devanagari**, self-hosted by `next/font`
  at build time — no request leaves the origin, and the Indic face is loaded now
  rather than swapped in later (a face swap changes every line length).

### Two rules that bite

1. `ux4g-heading-*`, `ux4g-body-*` and `ux4g-label-*` are applied through
   `[class^=ux4g-…]` selectors, so they only take effect when they are **first**
   in the class attribute. `ux4g-fs-*` uses `[class*=…]` and works anywhere.
2. Anything genuinely bespoke goes in the `gx-*` layer with a `gx-` prefix and is
   built from tokens — never a colour literal, or it cannot follow the theme.

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
    app/design-system.css  # the gx-* product layer, on UX4G tokens
    app/globals.css        # page ground + responsive-table reflow
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
