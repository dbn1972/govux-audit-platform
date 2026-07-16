# External Dependencies — GovUX Audit Platform

Everything the product needs to run, and where it comes from. The platform is
**fully containerized**: apart from a container runtime, you do **not** install
Python, Node, Postgres, Redis, or browsers on the host — the images carry them.

- [1. Host prerequisites](#1-host-prerequisites)
- [2. Backing services (containers)](#2-backing-services-containers)
- [3. Application runtimes & libraries](#3-application-runtimes--libraries)
- [4. External network services](#4-external-network-services-optional-unless-noted)
- [5. Required configuration & secrets](#5-required-configuration--secrets)
- [6. Licensing & supply chain](#6-licensing--supply-chain)

---

## 1. Host prerequisites

The **only** things you install on the machine:

| Prerequisite | Minimum | Notes |
|---|---|---|
| **Docker Engine** | 24+ | https://docs.docker.com/engine/install/ |
| **Docker Compose v2** | v2 (plugin) | ships with Docker Desktop; on Linux install `docker-compose-plugin` |
| **CPU** | 2 vCPU (dev) · 4+ vCPU (prod) | headless browsers are CPU-heavy |
| **RAM** | 4 GB (dev) · 8 GB+ (prod) | Chromium/Firefox/WebKit run per audit |
| **Disk** | 10 GB+ free | browser binaries + images + object storage |
| **Free TCP ports** | 3000, 8000, 5432, 6379, 9000, 9001 | remap in compose if in use |
| **OS** | Linux x86-64 (prod) · macOS/Windows via Docker Desktop (dev) | |

> Kubernetes/Terraform/Ansible installs add their own tool prerequisites
> (`kubectl`+`helm`, `terraform`, `ansible`) — see [INSTALL.md](../INSTALL.md).

Run `platform/scripts/preinstall-check.sh` to verify all of the above automatically.

---

## 2. Backing services (containers)

Pulled automatically by Compose/Helm — no manual install.

| Service | Image | Version | Purpose |
|---|---|---|---|
| **PostgreSQL + pgvector** | `pgvector/pgvector:pg16` | PG 16 | System of record; `vector` extension for ML/embedding columns |
| **Redis** | `redis:7` | 7 | Redis Streams job queue + cache. Prod splits it into a **durable** instance (AOF `appendfsync everysec`) for the queue and a **cache** instance (`allkeys-lru`, 512 MB) |
| **MinIO** | `minio/minio` | latest | S3-compatible object storage for screenshots, PDFs, reports. Swappable for AWS S3 / any S3 API |

> **pgvector is required** — plain `postgres:16` will fail migrations
> (`CREATE EXTENSION vector`). Use the pgvector image or install the extension.

---

## 3. Application runtimes & libraries

Built into the images from the pinned manifests below — listed for audit/SBOM.

### Backend API & workers — `python:3.12-slim-bookworm`
`platform/backend/requirements.txt`

| Package | Version | Role |
|---|---|---|
| fastapi | 0.111.0 | HTTP API framework |
| uvicorn[standard] | 0.30.0 | ASGI dev server |
| gunicorn | 22.0.0 | prod process manager (UvicornWorker) |
| sqlalchemy | 2.0.30 | ORM |
| psycopg[binary] | 3.1.19 | PostgreSQL driver |
| alembic | 1.13.1 | schema migrations |
| pydantic / pydantic-settings | 2.7.0 / 2.2.1 | validation, config |
| redis | 5.0.4 | queue + cache client |
| python-jose[cryptography] | 3.3.0 | JWT signing |
| httpx | 0.27.0 | outbound HTTP |
| email-validator / dnspython | 2.1.1 / 2.6.1 | gov-email + domain checks |
| pypdf / reportlab / Pillow | 4.2.0 / 4.2.0 / 10.3.0 | PDF ingest + report/image generation |
| scikit-learn / xgboost / joblib | 1.5.0 / 2.0.3 / 1.4.2 | **advisory** ML (never in the score path) |
| boto3 | 1.34.100 | S3/MinIO client |

### Audit engine — Node.js (installed in the backend image)
`platform/backend/audit_engine/package.json`

| Package | Version | Role |
|---|---|---|
| playwright | 1.44.0 | real-browser rendering (**Chromium, Firefox, WebKit** installed `--with-deps`) |
| @axe-core/playwright | 4.9.0 | WCAG 2.2 automated accessibility rules |
| lighthouse | 12.0.0 | Core Web Vitals / performance (lab) |
| chrome-launcher | 1.1.2 | Lighthouse Chrome bootstrap |

### Frontend — Node.js / Next.js
`platform/frontend/package.json`

| Package | Version | Role |
|---|---|---|
| next | 14.2.3 | React app-router UI |
| react / react-dom | 18.3.1 | UI runtime |
| bootstrap / bootstrap-icons | 5.3.3 / 1.11.3 | UX4G-aligned styling |
| typescript, vitest, @testing-library/*, @playwright/test | (dev) | build, unit + E2E tests |

---

## 4. External network services (optional unless noted)

| Service | Required? | Used for | Config |
|---|---|---|---|
| **Target `.gov.in`/`.nic.in` sites** | Yes (egress) | the sites being audited — the engine must reach them | outbound HTTPS |
| **SMTP relay** | Yes for login | one-time-password (OTP) email to officers' gov addresses | set in Admin → Configuration (encrypted at rest) |
| **Chrome UX Report (CrUX) API** | Optional | real-world (field) Core Web Vitals; blank ⇒ lab-only performance | `GOVUX_CRUX_API_KEY` |
| **CAPTCHA provider** | Optional | abuse protection on the public free-scan form | Admin → Configuration |
| **Container registry** | Install-time | pulling the base images (Docker Hub, or your mirror) | air-gapped installs bundle these — see [AIRGAP](../platform/deploy/AIRGAP.md) |

> **Access is locked to `*.gov.in` / `*.nic.in`** in code *and* a database CHECK
> constraint — the platform will not register or audit non-government domains.

---

## 5. Required configuration & secrets

Copy `platform/.env.example` → `platform/.env` and set real values. The API
**refuses to boot in production** unless the secrets are strong and distinct.

| Variable | Required | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ prod | strong random password |
| `GOVUX_JWT_SECRET` | ✅ prod | signs access tokens; 32+ random chars; never the default |
| `GOVUX_SECRET_KEY` | ✅ prod | encrypts SMTP/CAPTCHA secrets at rest; **must differ** from the JWT secret |
| `GOVUX_CORS_ORIGINS` | ✅ prod | comma-separated real browser origins (e.g. `https://govux.gov.in`) |
| `GOVUX_DATABASE_URL` / `GOVUX_REDIS_URL` | wired by compose | override for external managed DB/Redis |
| `GOVUX_CRUX_API_KEY` | optional | see §4 |

Generate a secret: `python -c "import secrets; print(secrets.token_urlsafe(48))"`

---

## 6. Licensing & supply chain

- **Application license:** see [LICENSE](../LICENSE).
- **Third-party licenses:** predominantly permissive — MIT / Apache-2.0 / BSD /
  PSF (Python, FastAPI, React, Next, Playwright, axe-core, Lighthouse, Redis
  BSD-3, PostgreSQL PostgreSQL-license, MinIO AGPL for the server — swap for AWS
  S3 if AGPL is a concern). Confirm against your organisation's policy before
  distribution.
- **Version pinning:** every dependency above is pinned; images are tag-pinned.
  For a reproducible, hash-locked offline install use the
  [air-gapped bundle](../platform/deploy/AIRGAP.md) (`build-airgap-bundle.sh`),
  which ships images + checksums (`SHA256SUMS`).
- **Vulnerability reporting:** [SECURITY.md](../SECURITY.md).
