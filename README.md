<div align="center">

# 🇮🇳 GovUX Audit Platform

**Self-service UX & compliance auditing for Indian government websites.**

Score any `.gov.in` / `.nic.in` site against **GIGW 3.0**, **WCAG 2.2 AA**, **UX4G**, and **Core Web Vitals** — into a single, defensible **0–100 GovUX Score**.

[![CI](https://github.com/dbn1972/govux-audit-platform/actions/workflows/ci.yml/badge.svg)](../../actions)
![Tests](https://img.shields.io/badge/tests-181%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-89%25-brightgreen)
![Security](https://img.shields.io/badge/SAST-85%2F100-success)
![Python](https://img.shields.io/badge/python-3.12-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![License](https://img.shields.io/badge/license-Proprietary%20(GoI)-lightgrey)

</div>

---

## What it does

Government website quality is hard to measure objectively and defend to an auditor. GovUX solves that with a **deterministic, reproducible score** that combines every relevant standard into one number — and keeps the **legal compliance verdict separate** from the aspirational UX band, so a respectable score never masquerades as legal compliance.

- **Free public scanner** — anyone can scan a single government URL, no sign-up, and download a PDF (GTmetrix-style).
- **Registered officer workspace** — register & verify domains, run multi-page audits, track prioritised fixes.
- **Expert review** — an assessor certifies findings automation can't judge, unlocking a defensible `compliant` verdict.
- **National oversight** — country-wide roll-ups, ministry/state league tables, continuous monitoring, and estate discovery for programme administrators (MeitY/NIC).

## The GovUX Score

A weighted mean of **8 deterministic categories** (weights sum to 100), banded A–E, with a **guard-rail** that caps the band at C on critical accessibility or trust failures.

| Category | Weight | Measured by |
|---|:--:|---|
| Accessibility | 22 | axe-core, WCAG 2.0/2.1/2.2 AA |
| Usability & UX | 17 | nav/search/landmark/label heuristics |
| GIGW 3.0 | 15 | 17 mandatory-element checks |
| Performance / CWV | 12 | Lighthouse (LCP/CLS/TBT) + CrUX field data |
| Design / UX4G | 11 | deterministic computer-vision signals |
| Responsiveness | 10 | 4 viewports + tap-target + 3-browser matrix |
| Content quality | 7 | Indic-script/language checks, readability |
| Trust & security | 6 | HTTPS + 6 security headers |

> **Never-break invariant:** the score path is **deterministic and LLM/ML-free**. Machine-learning outputs (anomaly detection, priority ranking) are **advisory only** and computed *after* the score is committed. The legal `compliance_status` is **separate** from the UX band — automated-only evidence can reach at most `partially_compliant`.

## Architecture

```
                    ┌── Browsers ──┐
   Next.js 14  ─────┤  /scan (free)│─────────────┐
   (UX4G DS)        │  officer app │             │
                    └──────────────┘             ▼
                                          FastAPI (Python 3.12)
                             reads: cache-first ──┤├── writes: queue-first
                                          │                   │
                                    Redis (cache) ◀──── Redis Streams (jobs, DLQ)
                                          │                   ▼
                                     PostgreSQL ◀──── audit workers (fleet)
                                     (pgvector)             │
                                                     Node engine:
                                              Playwright · Lighthouse · axe-core
                                          MinIO/S3 (PDF reports)   Prometheus (/metrics)
```

Full detail: [`platform/docs/ARCHITECTURE.md`](platform/docs/ARCHITECTURE.md).

## Quick start (development)

```bash
cd platform
docker compose up --build                       # api :8000 · web :3000 · db · redis · minio
docker compose exec api python -m app.seed      # demo org, users, domains
docker compose exec api pytest                  # backend suite (≥80% gate)
```

- App: **http://localhost:3000**  ·  API docs: **http://localhost:8000/docs**
- Demo sign-in email: `steward@indiapost.gov.in` (OTP printed to the API log in dev)

## Quick start (production)

```bash
cd platform
python3 scripts/govux-setup.py          # guided: sizes the deployment + generates a secure .env
./scripts/preinstall-check.sh --prod    # validate prerequisites + secrets
docker compose -f docker-compose.prod.yml --env-file deploy-out/.env up -d
```

Prefer to configure by hand? `cp .env.example .env`, set real secrets, and use `--env-file .env`.
For Kubernetes, the wizard also emits `helm-values.yaml` — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Runs Gunicorn (multi-worker) + `next start`, a **split & AOF-persisted** Redis (durable queue vs. cache), health checks, resource limits, and **migrations on boot**. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Documentation

| Audience | Document |
|---|---|
| ⬇️ Installing it | [**Installation Guide**](INSTALL.md) · [**Dependency Manifest**](docs/DEPENDENCIES.md) · [Configuration Reference](docs/CONFIGURATION.md) |
| 👤 Government users (officers, assessors, admins) | [**User Manual**](docs/USER_MANUAL.md) |
| 🚀 Operators / DevOps | [**Deployment Guide**](docs/DEPLOYMENT.md) · [**Operations Runbook**](docs/OPERATIONS.md) · [Upgrade Guide](docs/UPGRADING.md) |
| 🧑‍💻 Engineers | [Architecture](platform/docs/ARCHITECTURE.md) · [API](platform/docs/API.md) · [Data Access](platform/docs/DATA_ACCESS.md) · [Coding Standards](platform/docs/CODING_STANDARDS.md) · [Gotchas](platform/docs/GOTCHAS.md) |
| 📊 Methodology | [Scoring & Validation](platform/docs/SCORING_VALIDATION.md) |
| 🔐 Security & privacy | [Security Policy](SECURITY.md) · [Security Architecture & Threat Model](docs/SECURITY_ARCHITECTURE.md) · [Privacy & Data Protection (DPDP)](docs/PRIVACY.md) |
| ⚖️ Legal & governance | [Third-Party Licenses](docs/THIRD_PARTY_LICENSES.md) · [SBOM](docs/SBOM.md) · [Versioning & Support Policy](docs/VERSIONING.md) · [Support](SUPPORT.md) |
| 🤝 Contributors | [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Changelog](CHANGELOG.md) |

## Tech stack

**Backend:** FastAPI · SQLAlchemy 2.0 · Pydantic v2 · PostgreSQL (pgvector) · Redis Streams · MinIO/S3 · Alembic
**Engine:** Node · Playwright (Chromium/Firefox/WebKit) · Lighthouse · axe-core
**Frontend:** Next.js 14 (App Router) · Bootstrap 5 / UX4G Design System · TypeScript
**Advisory ML:** scikit-learn (IsolationForest) · XGBoost · Pillow/NumPy (CV) — *out of the score path*

## Project status

Hardened & tested: **181 backend tests (~89% coverage)**, 52/52 screen gate, SAST **85/100**. Production-ready for a controlled pilot; national-scale hardening (read replicas, autoscaling, load testing) tracked on the roadmap. See [CHANGELOG](CHANGELOG.md).

## License

Proprietary — © Government of India (MeitY / NIC). See [LICENSE](LICENSE). Not for public redistribution.
