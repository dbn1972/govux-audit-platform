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
  guided-review workflow, the stat tiles and the landing page — plus the narrow
  contrast repairs to UX4G's own components listed below. It is authored on UX4G
  semantic tokens, so both themes come from one source. (The identity bar, the
  masthead and the signed-in rail are UX4G components, not gx-\* primitives.)
- Icons come from `lucide-react` behind `components/Icon.tsx`, which maps the
  project's icon vocabulary (the historical `bi-*` names, still used as data in
  the nav and notification models) onto lucide components.
- Theming is UX4G's own `data-theme` attribute, applied before first paint by an
  inline script in `layout.tsx` so a dark-mode reader never sees a white flash.
- Fonts are **Noto Sans** + **Noto Sans Devanagari**, self-hosted by `next/font`
  at build time — no request leaves the origin, and the Indic face is loaded now
  rather than swapped in later (a face swap changes every line length).

### Theme

The product runs UX4G's **stock theme** — no brand override block, no
`--ux4g-color-primary-*` remap. Colour, elevation and shape come from UX4G's
*semantic* tokens (`--ux4g-bg-*`, `--ux4g-text-*`, `--ux4g-border-color-*`,
`--ux4g-shadow-*`, `--ux4g-radius-*`), used directly at each call site. Those
tokens are theme-aware inside UX4G's bundle, so **dark mode needs no CSS of our
own** — `design-system.css` carries no dark palette at all.

Only four kinds of token remain ours, because UX4G has no equivalent:

| Token | Why it stays |
|---|---|
| `--gx-page-max` | the product's 1280px frame |
| `--gx-space-1..7` | UX4G's scale steps 1.5rem → 2.5rem → 3.5rem, so 2rem and 3rem have no equivalent; converting would move layout, not colour |
| `--gx-band-A..E` | the A–E score palette — meaning, not identity, and tuned per theme for AA |
| `--gx-on-success/error/warning/info` | accessible ink for UX4G's own status grounds (see below) |

### Three rules that bite

1. `ux4g-heading-*`, `ux4g-body-*` and `ux4g-label-*` are applied through
   `[class^=ux4g-…]` selectors, so they only take effect when they are **first**
   in the class attribute. `ux4g-fs-*` uses `[class*=…]` and works anywhere.
2. Use the **semantic** tokens, never the `--ux4g-color-*` primitives: the
   primitive ramp does not flip with the theme, the semantic layer does. And a
   status *text* token is not a background — painting `--ux4g-text-status-error`
   as one inverts to pale pink under dark.
3. Anything genuinely bespoke goes in the `gx-*` layer with a `gx-` prefix and is
   built from tokens — never a colour literal, or it cannot follow the theme.

### The accessibility bar

The Government of India identity strip is UX4G's own accessibility bar
(`topbar` / `__wrap` / `__group` / `__iconbtn` / `__selectbtn`), not a bespoke
bar — `components/GovBanner.tsx`. The root class comes from the package's
`buildAccessibilityBarClasses()` rather than a hardcoded string.

> **What `ux4g-web-components` actually ships.** Despite the name it exports no
> renderable components — no React components and no custom elements. Three
> entry points: `./styles.css` (the CSS bundle), `./runtime` (`initRuntime()`,
> which injects the vendor JS behind dropdowns, modals, tooltips and the like —
> wired up in `components/Ux4gRuntime.tsx`), and `./types`, which is **55
> class-name builder functions** (`buildButtonClasses`, `buildTagClasses`,
> `buildAccessibilityBarClasses`, …) plus their TypeScript types. You still
> write the markup; the package supplies the classes. Prefer the builders over
> hardcoded class strings where one exists — they are the supported API, so an
> upstream class rename arrives as a package version bump instead of silently
> unstyling a component. `./types` is side-effect-free and tree-shakes.

### The navbar

The signed-out masthead (`components/SiteHeader.tsx`) is UX4G's published
**Navbar** — `ux4g-navbar` from `buildNavbarClasses()`, the `ux4g-navbar-wrap`
row, the brand block with `ux4g-divider-vertical` and its title/description
pair, and an `ux4g-navbar-links` list of `ux4g-text-link-sm` anchors. The
bespoke `.gx-siteheader` rules are retired.

Two classes from the published example are deliberately **not** used:

- `ux4g-navbar-desktop` / `ux4g-navbar-mobile` — an all-or-nothing pair.
  `navbar-desktop` is `display:none !important` below 768px and everything in it
  is expected to reappear in a `navbar-mobile` dropdown you build yourself.
  Adopting the wrapper without that dropdown would take the links *and the Sign
  in button* off every phone. With three links and two actions, hiding links
  individually keeps sign-in reachable at every width. Build the dropdown if the
  nav ever grows.
- `ux4g-navbar-logo` — it is `filter:brightness(0) invert(1)`, meant for a white
  logo on a dark bar. This navbar's ground is `--ux4g-bg-neutral-elevated`, so
  the class would paint the mark white on white.

### The signed-in shell

`AppShell` is UX4G's **Dashboard** pattern, not the Navbar: the rail is
`ux4g-dashboard-sidebar` with an `ux4g-dashboard-sidebar-nav`, and each item is
an `ux4g-dashboard-nav-item` (plus `.active`, carried alongside `aria-current`)
with an `ux4g-dashboard-nav-icon`. The app bar on top is `ux4g-navbar` — UX4G's
`ux4g-dashboard-header-container` is a content card, not a sticky bar — and the
mobile drawer is `buildDrawerClasses("left", open)`.

The drawer takes UX4G's *surface* only. The package ships styling with no
behaviour for it, so the dialog contract — focus trap, Escape, scroll lock,
focus restore, close on route change — stays in React, where it is tested.

> **`ux4g-dashboard-nav-item.active` is unreadable as shipped.** UX4G pairs
> `--ux4g-bg-primary` with `--ux4g-text-white`: `#fff` on `#f2efff` under light
> (**1.13:1**) and `#000` on `#24145c` under dark (**1.33:1**). The selected nav
> item disappears in both themes. `design-system.css` repaints it with
> `--ux4g-bg-primary-strong` + `--ux4g-text-neutral-inverse` (8.33:1 / 6.87:1)
> and restores a non-colour marker, since UX4G's item is 600-weight at every
> state and would otherwise be told apart by colour alone. It carries the GIGW text-size control (A− A A+,
90–140% in steps of 10), which persists in `localStorage` and is applied before
first paint by the inline script in `layout.tsx`, so a reader who needs 130% gets
it on every page without a flash. The buttons are UX4G's 36px icon buttons, well
clear of WCAG 2.5.8's 24px minimum, and the change is announced through a
`role="status"` live region.

The skip link is the one part still bespoke (`.gx-skip`): UX4G's `__skip` is a
permanently visible link, while ours stays off-screen until focused — the pattern
the e2e keyboard test asserts. It uses an elevated surface rather than the brand
ground, because it lands *on* the bar and would otherwise be invisible at the
moment it is needed.

### Which UX4G components this app uses

| UX4G component | Where |
|---|---|
| Accessibility Bar (`ux4g-topbar*`) | `GovBanner` — via `buildAccessibilityBarClasses()` |
| Navbar (`ux4g-navbar*`) | `SiteHeader`, and the `AppShell` app bar — via `buildNavbarClasses()` |
| Dashboard (`ux4g-dashboard-sidebar`, `-nav-item`) | `AppShell` rail |
| Drawer (`ux4g-drawer*`) | `AppShell` mobile nav — via `buildDrawerClasses()` |
| Card (`ux4g-card` `-solid` `-outline` `-header` `-body`) | every screen (183 call sites) |
| Tag (`ux4g-tag-tonal-*`) | all status pills and band chips (`gx-dot` adds the leading dot back on the 11 that report state) |
| Alert, Table, Input, Select, Button, Spinner | throughout |
| Empty state (`ux4g-empty-state*`) | every empty list |
| Icon button, Avatar, Progress bar, List | app bar, account menu, meters |

**Not adopted, with reasons** — these looked like matches and are not:

- `ux4g-footer` is `padding-bottom:32px!important`, not a footer component; the
  `gx-footer*` layout stays.
- `ux4g-status-pipeline*` is a reduced-motion override plus two helpers, not a
  self-contained stepper; the audit pipeline stays `gx-stage*`.
- `ux4g-dropdown-menu` is `display:none` and expects the vendor runtime to
  toggle it, but React owns this menu's open state — only the panel surface
  (`ux4g-list`) is used. `ux4g-list-item-row` is `background:none!important`,
  which would kill row hover, so rows stay `gx-menu-item`.
- `buildCardClasses()` requires a `layout` argument and `ux4g-card-vertical`
  adds `margin-top:2.5rem`; the classes are applied directly instead.

`gx-*` is now 95 classes, all of them things UX4G has no component for: the
score meter and bands, the compliance verdict block, severity tiles, the guided
review workflow, callouts, prose and TOC, stat tiles, and layout helpers.

### Known upstream gap: status contrast

`ux4g-web-components@2.1.0` pairs each status background with its matching
status text colour, and several of those pairs miss WCAG 2.2 AA. Measured on the
shipped bundle: alerts 1.90–4.02:1, tonal tags 3.58:1 (dark warning) and 4.30:1
(dark info). The `ux4g-topbar` has the same defect for a different reason — it
pairs `--ux4g-color-neutral-0`, a *primitive* that does not flip, with
`--ux4g-bg-primary-strong`, which does, so the whole bar is white-on-lavender at
2.61:1 under dark. The dashboard nav item's active state fails the same way at
1.13:1 and 1.33:1 (see *The signed-in shell*). `design-system.css` overrides
only the **ink** in each case
(via `--gx-on-*` for status, the semantic inverse token for the topbar); UX4G
keeps ownership of every background, spacing and shape. Remove those overrides when upstream fixes the token pairs — the measured
ratios are recorded beside each rule as the check.

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
