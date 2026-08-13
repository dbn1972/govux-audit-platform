# API surface (read on demand) — 28 endpoints

- **Auth:** `POST /v1/auth/otp/request|verify`, `POST /v1/auth/refresh|logout`, `GET/DELETE /v1/auth/devices`
- **Team:** `GET /v1/auth/team`, `PATCH /v1/auth/team/{id}/role`, `PATCH /v1/auth/organisation`,
  `POST/GET /v1/auth/invitations`, `DELETE /v1/auth/invitations/{id}` — invitations are how a
  SECOND person joins an existing org; consumed by `verify_otp` on first sign-in
- **Register (steward):** `POST /v1/admin/registry/import` — bulk CSV load of the national
  `.gov.in`/`.nic.in` estate. `dry_run` previews; imports land `verify_status='pending'`
  (listing is not ownership)
- **Domains:** `GET/POST /v1/domains`, `POST /v1/domains/{id}/verify` (real DNS-TXT / .well-known metafile)
- **Audits:** `POST /v1/audits` (→202 task_id), `GET /v1/audits/{id}`, `.../report`,
  `.../remediation`, `.../documents`, `GET /v1/domains/{id}/audits`, `.../compare`, `POST /v1/bulk-scans`
- **Monitoring:** `POST/GET /v1/schedules`, `DELETE /v1/schedules/{id}`,
  `POST /v1/discovery/scan`, `GET /v1/discovery` (discovery = programme_admin)
- **CI/CD:** `GET /v1/ci/gate?domain_id=&min_score=&require_compliant=` (pass/fail on latest audit)
- **National:** `GET /v1/national`, `GET /v1/rankings` (role: programme_admin/super_admin)
- **Library:** `GET /v1/guidelines`, `PATCH /v1/findings/{id}`
- **Ops:** `GET /healthz`

## Notifications (`services/notify.py`)
Audit completed / failed → the requester. Score drop ≥ 5 points → the org's owners + admins
(same threshold as `/v1/alerts`, so mail and dashboard never disagree). Larger-crawl request +
decision → approvers / requester. Every entry point swallows its own errors: a mail-relay outage
must never turn a completed audit into a failed one. Master switch + per-event flags live in
admin config (`notify_*`).

## Response shape notes
- Audit status/report carry a **compliance block** `{status, method, confidence}` distinct from
  `band`/`overall_score`. Never fold the legal verdict into the UX score.
- `report` includes `categories`, `findings` (with `confidence` + advisory `remediation`),
  `documents` (PDF/UA results), `field_data` (CrUX), `pages_total`.
- `POST /v1/audits` body: `{domain_id, depth=50, devices, browsers, webhook_url?}`.
  Idempotent — a second concurrent run of the same domain returns the in-flight task_id.

## Auth model
Passwordless email-OTP (gov emails only) → short-lived JWT access token (in memory) +
rotating device-bound refresh token (HttpOnly cookie `govux_rt`, path `/v1/auth`). Refresh-token
reuse revokes the family. OTP delivery is a dev stub — to mint a test session, exec into `api` and
call `security.issue_access_token(user_id, role, device_id)`.
