# Production Readiness — Go / No-Go

**Status: the *software* is production-capable; the *service* is not yet in
production and cannot be until the go-live gates below (infrastructure + human
sign-off) are met.** Nothing is deployed to real infrastructure yet, and the
audit engine has not been exercised against live government sites at scale.

This is an honest checklist, not a rubber stamp.

## ✅ Production-grade and verified (software)

| Area | Evidence |
|---|---|
| CI | 10 jobs green on every push (backend, migrations, screens, frontend, e2e, helm, terraform, ansible, wizard, engine) |
| Test depth | ~90% backend coverage vs real Postgres+Redis; 22 frontend; 54/54 screen contracts; cross-browser E2E |
| Score integrity | Deterministic, LLM/ML-free; guard-rail; coverage-confidence gate (won't score an uncaptured site); anti-gaming/overlay detection caps the compliance verdict |
| AuthZ | OTP + device-bound rotating sessions; org-fencing (404 cross-org); **role-aware** nav + route guard |
| Secrets | Boot **asserts** strong, distinct `GOVUX_JWT_SECRET`/`GOVUX_SECRET_KEY` — verified it blocks weak/default values |
| Self-hardening | Baseline security headers (nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS in prod); DPDP self-service export/erase; sensitive-action audit trail |
| Probes | `/healthz` (liveness) + `/readyz` (DB+Redis readiness) — wired into the prod compose healthcheck and the Helm readiness probe |
| Deploy artifacts | `docker-compose.prod.yml` (gunicorn, split durable/cache Redis, migrate-on-boot) — **compose config validated**; Helm chart; Terraform; Ansible; air-gap bundle |
| Docs | Install, Dependencies, Deployment, Operations, Config, HLD/LLD, Security architecture, Privacy/DPDP, SBOM, Versioning, Upgrading |

## ⛔ Go-live gates — required, and NOT doable in code (infra + human)

1. **Provision infrastructure** — managed PostgreSQL 16 **with pgvector**, Redis 7 (durable + cache), S3/MinIO; Indian region for data residency.
2. **Real secrets + TLS + domain** — generate strong secrets, terminate TLS at the ingress, set `GOVUX_CORS_ORIGINS` to the real origin. (`preinstall-check.sh --prod` validates this.)
3. **Wire real SMTP** — OTP login uses the `console` provider in dev; **without a real mail relay, no one can sign in.** Set it in Admin → Configuration and send a test.
4. **Audit egress** — the engine must reach `.gov.in`/`.nic.in` from an allowlisted network (many sites geo-block/WAF non-Indian, datacenter IPs). Validate reachability at scale.
5. **Load & soak test** — k6/Locust against a representative estate before national rollout; tune worker replicas / DB pool.
6. **Security sign-off + DPIA** — external pen-test; a Data Protection Impact Assessment; publish an instance privacy notice + Grievance Officer per the DPDP Act.
7. **Data hygiene** — do **not** ship the demo seed; start from an empty estate (the dev DB is full of `testXXXX.gov.in` fixtures).
8. **Observability** — point Prometheus at `/metrics`, build Grafana dashboards + alerts; run a backup/restore drill.

## 🔧 Software gaps to close (before or shortly after launch)

- Several **steward screens are still demo/static** (monitoring, methodology, standards, discovery, bulk-scan) — wire to live data.
- **Notification delivery** (email/webhook) not yet wired end-to-end.
- Live audit status is **polling**, not WebSocket.
- **Selection-bias disclosure** on national statistics — "N audited" is the *crawlable* subset, not a random sample; label it.

## Go-live runbook (order)

```
1. Provision infra (§1)                4. Seed nothing; create the first org/steward
2. Set secrets/TLS; preinstall-check --prod   5. Configure SMTP + CAPTCHA; send test OTP
3. Deploy (Helm or compose.prod);      6. Reachability + load test; security sign-off
   migrations run on boot              7. Point monitoring; backup drill; open to users
```

**Bottom line:** merge-ready and deployable software with honest guard-rails; a
responsible launch still needs infrastructure, real mail, egress to gov sites,
and a security/DPDP sign-off — none of which are code.
