# Third-Party Licenses

The GovUX Audit Platform bundles open-source software. This file lists the
**direct** dependencies and their licenses for attribution and procurement
review. For a complete, machine-readable inventory **including transitive
dependencies**, generate a CycloneDX SBOM — see [SBOM.md](SBOM.md).

> License identifiers use [SPDX](https://spdx.org/licenses/) short names. Confirm
> against your organisation's policy before redistribution. Versions are pinned;
> the authoritative versions live in `platform/backend/requirements.txt`,
> `platform/backend/audit_engine/package.json`, and `platform/frontend/package.json`.

## Backing services (container images)

| Component | Version | License | Notes |
|---|---|---|---|
| PostgreSQL | 16 | PostgreSQL License (permissive, BSD-like) | via `pgvector/pgvector:pg16` |
| pgvector | pg16 | PostgreSQL License | vector extension |
| Redis | 7 | BSD-3-Clause (Redis ≤7.2 OSS) | verify your tag's license |
| MinIO (server) | latest | **AGPL-3.0** | ⚠️ copyleft — swap for AWS S3 / any S3 API if AGPL is a concern |

## Backend (Python) — `requirements.txt`

| Package | Version | License |
|---|---|---|
| fastapi | 0.111.0 | MIT |
| uvicorn | 0.30.0 | BSD-3-Clause |
| gunicorn | 22.0.0 | MIT |
| starlette (via fastapi) | — | BSD-3-Clause |
| sqlalchemy | 2.0.30 | MIT |
| psycopg | 3.1.19 | LGPL-3.0 |
| alembic | 1.13.1 | MIT |
| pydantic / pydantic-settings | 2.7.0 / 2.2.1 | MIT |
| redis | 5.0.4 | MIT |
| python-jose[cryptography] | 3.3.0 | MIT |
| httpx | 0.27.0 | BSD-3-Clause |
| email-validator | 2.1.1 | The Unlicense |
| dnspython | 2.6.1 | ISC |
| pypdf | 4.2.0 | BSD-3-Clause |
| reportlab | 4.2.0 | BSD-3-Clause |
| Pillow | 10.3.0 | HPND (PIL/MIT-like) |
| scikit-learn | 1.5.0 | BSD-3-Clause |
| xgboost | 2.0.3 | Apache-2.0 |
| joblib | 1.4.2 | BSD-3-Clause |
| boto3 | 1.34.100 | Apache-2.0 |

## Audit engine (Node) — `audit_engine/package.json`

| Package | Version | License |
|---|---|---|
| playwright | 1.44.0 | Apache-2.0 |
| @axe-core/playwright | 4.9.0 | MPL-2.0 (axe-core) |
| lighthouse | 12.0.0 | Apache-2.0 |
| chrome-launcher | 1.1.2 | Apache-2.0 |

Playwright downloads **Chromium** (BSD-style), **Firefox** (MPL-2.0), and
**WebKit** (LGPL-2.1 / BSD) browser builds at install time.

## Frontend (Node) — `frontend/package.json`

| Package | Version | License |
|---|---|---|
| next | 14.2.3 | MIT |
| react / react-dom | 18.3.1 | MIT |
| bootstrap | 5.3.3 | MIT |
| bootstrap-icons | 1.11.3 | MIT |
| typescript | 5.4.5 | Apache-2.0 |
| vitest | 1.6.0 | MIT |

## License-obligation summary

- **Permissive (MIT / BSD / Apache-2.0 / ISC / PSF):** the vast majority — require
  attribution (this file + `NOTICE`); no source-disclosure obligation.
- **Weak copyleft (LGPL-3.0 `psycopg`, MPL-2.0 `axe-core`/Firefox):** used
  unmodified as libraries; comply by preserving notices and offering the
  components' source. No obligation on your application code.
- **Strong copyleft (AGPL-3.0 — MinIO server only):** triggers network-use source
  obligations **if you distribute or offer MinIO as a service**. The platform uses
  MinIO through the standard S3 API, so it is trivially replaceable with AWS S3 or
  another S3-compatible store to avoid AGPL entirely.

_This summary is provided in good faith and is not legal advice; have your legal
team review before public distribution._
