# Security Policy

GovUX audits *other* systems for security and accessibility, so we hold this
codebase to the same bar. This document explains how to report vulnerabilities and
the security controls the platform ships with.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

- Email the security contact: **security@govux.gov.in** (or your programme's
  designated CERT-In point of contact).
- Include: affected version/commit, a description, reproduction steps, and impact.
- You will receive an acknowledgement within **3 working days** and a remediation
  timeline based on severity.
- Please allow a reasonable disclosure window before any public discussion.

Findings that involve **cross-tenant data access, authentication bypass, SSRF, or
secret exposure** are treated as **Critical/High** and prioritised for immediate
remediation and, where relevant, credential rotation.

## Supported versions

| Version | Supported |
|---|:--:|
| `main` (latest) | ✅ |
| tagged releases | ✅ (current major) |
| older | ❌ |

## Security controls in this codebase

Verified in code and covered by the test suite (`tests/test_security_hardening.py`,
`tests/test_integration.py`, `tests/test_sast_fixes.py`):

- **Access control** — every audit/domain resource is org-scoped (`_owned_audit`,
  `_owned_domain`); cross-org access returns 404. Admin/steward endpoints are
  role-gated (`programme_admin` / `super_admin`).
- **Authentication** — gov-email OTP + device-bound **rotating** refresh tokens;
  replaying a rotated token **revokes the whole session family**. OTP/refresh use
  a CSPRNG; secrets are stored HMAC-SHA256 with constant-time comparison.
- **SSRF** — every outbound fetch (scans, document fetch) is validated per hop:
  http(s) only, gov-domain, no raw IPs, and blocked private/loopback/link-local/
  reserved/metadata addresses. Document discovery is same-origin.
- **Secrets at rest** — SMTP/CAPTCHA secrets are Fernet-encrypted; the API refuses
  to boot in production without a strong, non-default `GOVUX_JWT_SECRET` and a
  distinct `GOVUX_SECRET_KEY`.
- **Abuse resistance** — per-IP rate limiting, CAPTCHA step-up, and escalating
  sign-in lockout.
- **Observability** — request IDs on every response; a global exception handler
  that never leaks stack traces; audit logging of privileged actions.
- **Supply chain** — all dependencies are pinned; `pip-audit` / `npm audit` /
  Dependabot recommended in CI.

## Deployment hardening checklist

Before exposing an instance to real users:

- [ ] Set strong, distinct `GOVUX_JWT_SECRET` and `GOVUX_SECRET_KEY` (see
      `.env.example`); never ship the defaults.
- [ ] Set `GOVUX_ENV=production` (enables fail-fast checks).
- [ ] Use `smtp`/`api` email provider — **never `console`** in production.
- [ ] Set a `metrics_token` (or network-restrict `/metrics`).
- [ ] Apply an **egress network policy** on the worker (deny RFC1918 /
      169.254.0.0/16) as defence-in-depth against DNS-rebinding SSRF.
- [ ] Run the worker as a non-root user; front Postgres with PgBouncer.
- [ ] Restrict `GOVUX_CORS_ORIGINS` to the real frontend origin.

A full static security assessment (SAST) with scoring and remediation is
maintained by the security team; the current posture is **85/100 (Good)**.
