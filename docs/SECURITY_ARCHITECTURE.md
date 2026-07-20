# Security Architecture & Threat Model

The security design of the GovUX Audit Platform: trust boundaries, the controls
that enforce them, and a STRIDE-style threat analysis. For **vulnerability
reporting** see [SECURITY.md](../SECURITY.md); for **privacy** see
[PRIVACY.md](PRIVACY.md).

## 1. Assets to protect

- Government officers' identities and sessions.
- Audit data and organisational boundaries (no cross-org leakage).
- Configured secrets (SMTP/CAPTCHA credentials, signing keys).
- Integrity of the **GovUX Score** (must stay deterministic and untampered).
- Availability of the audit service.

## 2. Trust boundaries & data flow

```
        Internet                    │  Deployment (operator-controlled)
  ┌──────────────┐   TLS   ┌────────┴─────────┐   ┌───────────────┐
  │ Officer      │────────▶│  Ingress / CORS  │──▶│  FastAPI API  │
  │ (browser)    │         └──────────────────┘   │  (authz here) │
  └──────────────┘                                └───┬───────────┘
                                                      │ queue (Redis Streams)
  ┌──────────────┐   outbound (audited site)      ┌───▼───────────┐
  │ Target .gov  │◀───────────────────────────────│  Workers      │
  │ website      │   SSRF-guarded fetch           │  (Playwright) │
  └──────────────┘                                └───┬───────────┘
                                          Postgres ◀──┴──▶ MinIO/S3
```

Boundaries: **untrusted internet → ingress**; **API → data stores**;
**workers → the audited third-party site** (treated as hostile input).

## 3. Controls (implemented)

| Threat area | Control | Where |
|---|---|---|
| **Authentication** | Email OTP (no passwords); short-lived access JWT + **device-bound, rotating** refresh token | auth flow, `security.py` |
| **Brute force** | Escalating per-account sign-in lock-out (hard control, not fail-open) | `services/authguard.py` |
| **Authorisation / IDOR** | Every audit endpoint is **org-fenced**; cross-org access returns 404 (never confirms existence); RBAC roles | `routers/audits.py`, `deps.py` |
| **Gov-only access** | Email + domain restricted to `*.gov.in`/`*.nic.in` in code **and** a DB CHECK constraint | `models.py`, `db/schema.sql` |
| **SSRF** (auditing attacker-supplied URLs) | Pre-scan URL validation; resolves host and rejects private/loopback/link-local ranges | `services/url_validate.py` |
| **Secrets at rest** | SMTP/CAPTCHA secrets encrypted with `GOVUX_SECRET_KEY`; prod boot **asserts** strong, distinct `GOVUX_JWT_SECRET`/`GOVUX_SECRET_KEY` | `services/secretbox.py` |
| **Abuse / DoS** | Redis fixed-window rate limits (OTP requests, public scans per IP); optional CAPTCHA on the public scanner | `services/ratelimit.py`, `captcha.py` |
| **Domain spoofing** | Real DNS-TXT ownership verification before a domain can be audited | `services/verification.py` |
| **Score tampering** | Score path is deterministic and **LLM/ML-free**; ML is advisory and computed *after* the score is committed; invariants locked by tests | `services/scoring.py`, `tests/test_scoring_validation.py` |
| **Auditability** | Sensitive/admin actions written to an append audit log (with IP) | `audit_log` |
| **Transport** | TLS terminated at ingress; CORS restricted to configured origins (`GOVUX_CORS_ORIGINS`) | deployment |
| **Supply chain** | Pinned deps + generatable CycloneDX SBOM | [SBOM.md](SBOM.md) |

## 4. STRIDE analysis

| STRIDE | Representative threat | Mitigation | Residual |
|---|---|---|---|
| **S**poofing | Fake login / another org's identity | OTP + device-bound tokens; gov-only email; org fence | Low |
| **T**ampering | Alter a score or another org's audit | Deterministic score + test invariants; org-fenced writes | Low |
| **R**epudiation | "I didn't approve that" | Audit log with actor + IP on sensitive actions | Low–Med (log retention is operator-set) |
| **I**nfo disclosure | Read another org's data; leak secrets | 404-on-cross-org; secrets encrypted at rest; no secrets in logs | Low |
| **D**oS | Flood OTP/public scanner; heavy crawls | Rate limits, CAPTCHA, single-concurrency public queue, worker backpressure | Medium (add WAF/edge limits at scale) |
| **E**levation | Officer performs admin action | RBAC checks on admin routes; `super_admin` gated | Low |

## 5. Known residual risks & operator responsibilities

- **Perimeter:** the platform assumes the operator provides **TLS** and ideally a
  **WAF/edge rate-limiting** for internet-facing deployments.
- **Log retention & SIEM:** audit-log retention and forwarding to a SIEM are
  operator-configured.
- **Secret rotation:** rotating `GOVUX_JWT_SECRET`/`GOVUX_SECRET_KEY` and DB
  credentials is an operational task (see [OPERATIONS.md](OPERATIONS.md)).
- **DoS at scale:** application rate limits are present; national-scale exposure
  should add edge protection.

## 6. Assurance

- Automated **SAST** and dependency review in CI; secret-scanning on commits.
- Test suite (~90% backend coverage) includes security cases: SSRF guard,
  org-fencing/IDOR, gov-only CHECK constraints, brute-force lock-out, prod
  secret assertion.
- Regenerate and scan the [SBOM](SBOM.md) each release.
