# Privacy & Data Protection

How the GovUX Audit Platform handles personal data, aligned with the **Digital
Personal Data Protection (DPDP) Act, 2023**. This describes the *self-hosted
software's* behaviour; the operating government body is the **Data Fiduciary**
and should publish an instance-specific privacy notice referencing this document.

> Not to be confused with the platform's DPDP **scoring feature**, which assesses
> whether *audited* websites disclose consent, rights, and grievance mechanisms.
> This document is about the platform's *own* data handling.

## 1. Personal data collected

The platform is designed for **data minimisation** — it collects only what login
and auditing require.

| Data | Where | Purpose | Source |
|---|---|---|---|
| Official email (`*.gov.in`/`*.nic.in`) | `users.email` | identity & login; enforced gov-only by code + DB CHECK | user |
| Display name, role, organisation | `users` | authorisation & attribution | admin/user |
| One-time passwords (OTP) | transient (Redis, short TTL) | login second factor | generated |
| Device public key | `devices.device_pubkey` | device-bound session (rotating refresh token) | user's browser |
| IP addresses | `devices.created_ip`/`last_ip`, `audit_log.ip` | security, abuse/rate-limit, audit trail | request |
| Audit activity | `audits`, `audit_log` | operational history & accountability | user actions |

**Not collected:** no financial data, no government IDs (Aadhaar/PAN), no
biometric data, no marketing/behavioural tracking, no third-party analytics
cookies. Passwords are never used (OTP + device-bound tokens only).

## 2. Purpose & lawful basis

Personal data is processed to (a) authenticate authorised government officers,
(b) run and attribute website audits, and (c) secure the service (abuse
prevention, audit logging). Basis: performance of the government body's public
function and legitimate operation of the service, per the DPDP Act.

## 3. Storage, security & residency

- **At rest:** system-of-record PostgreSQL. Configured secrets (SMTP/CAPTCHA
  credentials) are **encrypted at rest** with `GOVUX_SECRET_KEY`
  (`services/secretbox.py`).
- **In transit:** operators must terminate **TLS** at the ingress (see
  [DEPLOYMENT.md](DEPLOYMENT.md) hardening checklist).
- **Access control:** role-based (`owner`, `contributor`, `assessor`,
  `programme_admin`, `super_admin`); every audit is **organisation-fenced** — an
  officer can only see their own organisation's data.
- **Residency:** self-hosted — data stays wherever the operator deploys it
  (on-prem or Indian-region cloud). No data leaves the deployment except optional,
  operator-enabled outbound calls (see §5).

## 4. Retention

- **OTPs:** expire in minutes (short Redis TTL).
- **Sessions/devices:** until the user revokes them (Settings → Trusted devices)
  or they rotate out.
- **Audit records & logs:** retained for operational history; operators should set
  a retention period in line with their records-management policy. See
  [OPERATIONS.md](OPERATIONS.md) for backup/rotation.

## 5. Third parties & data sharing

The platform makes **no** third-party data sharing by default. Optional,
operator-configured outbound calls:

| Integration | Data sent | Toggle |
|---|---|---|
| SMTP relay | recipient gov email + OTP (to deliver login codes) | Admin → Configuration |
| Chrome UX Report (CrUX) API | the **public** URL being audited (no personal data) | `GOVUX_CRUX_API_KEY` |
| CAPTCHA provider | challenge token (public-scanner abuse control) | Admin → Configuration |
| CI/CD webhook | audit score/verdict for a domain (no personal data) | per-audit opt-in |

## 6. Data-principal rights (DPDP Act)

The operating body, as Data Fiduciary, must honour access, correction, and
erasure requests. Platform support:

- **Access/correction:** a `super_admin` can view and edit user records.
- **Session control:** users self-manage trusted devices (revoke individually or
  "sign out all others").
- **Erasure:** user and associated records can be removed via administrative
  database operation; operators should document this in their SOP. *(A
  self-service export/erasure endpoint is on the roadmap — see
  [ROADMAP](../README.md#project-status).)*
- **Grievance:** publish a Grievance Officer contact in the instance privacy
  notice, per the DPDP Act.

## 7. Children's data

The platform is an internal tool for government officers and is **not directed at
children**; it does not knowingly process children's data.

## 8. Breach response

Security-incident handling, including notification obligations to the Data
Protection Board, is covered operationally in
[OPERATIONS.md](OPERATIONS.md#4-common-incidents) and
[SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md). Report vulnerabilities per
[SECURITY.md](../SECURITY.md).

---

_This document supports DPDP-aligned operation but is not legal advice. The
deploying government body must complete its own DPDP compliance (privacy notice,
Grievance Officer, DPIA where applicable) for its instance._
