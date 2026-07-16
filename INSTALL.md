# Installing the GovUX Audit Platform

A single guide to download, install, and verify the platform — from a 5-minute
local trial to a production or air-gapped government deployment.

> **New here?** The platform is fully containerized. For a local trial you need
> **only Docker + Docker Compose v2** — nothing else. Full dependency manifest:
> [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

## Contents
1. [Prerequisites (60-second check)](#1-prerequisites-60-second-check)
2. [Download](#2-download)
3. [Choose an install method](#3-choose-an-install-method)
4. [Method A — Docker Compose (fastest)](#method-a--docker-compose-fastest)
5. [Method B — Guided setup wizard](#method-b--guided-setup-wizard)
6. [Method C — Production (hardened Compose)](#method-c--production-hardened-compose)
7. [Method D — Kubernetes (Helm)](#method-d--kubernetes-helm)
8. [Method E — Cloud infra (Terraform)](#method-e--cloud-infrastructure-terraform)
9. [Method F — VM fleet (Ansible)](#method-f--vm-fleet-ansible)
10. [Method G — Air-gapped / offline](#method-g--air-gapped--offline)
11. [Verify the install](#4-verify-the-install)
12. [Troubleshooting & support](#5-troubleshooting--support)
13. [Full documentation index](#6-full-documentation-index)

---

## 1. Prerequisites (60-second check)

Install **[Docker Engine 24+](https://docs.docker.com/engine/install/)** with the
**Compose v2** plugin. Then let the platform check everything else (RAM, disk,
free ports, and — with `--prod` — your secrets):

```bash
cd platform
./scripts/preinstall-check.sh          # dev prerequisites
./scripts/preinstall-check.sh --prod   # also validates .env secrets for production
```

Minimums: 2 vCPU / 4 GB RAM / 10 GB disk (dev); 4+ vCPU / 8 GB+ (prod). Ports
3000, 8000, 5432, 6379, 9000, 9001. Full list: [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

## 2. Download

```bash
git clone https://github.com/dbn1972/govux-audit-platform.git
cd govux-audit-platform
```

(Offline site? Skip to [Method G](#method-g--air-gapped--offline) — the bundle
carries the source **and** every image.)

## 3. Choose an install method

| You want to… | Use | Time |
|---|---|---|
| Try it locally / demo | **A — Docker Compose** | ~5 min |
| Be guided + get a sizing recommendation | **B — Setup wizard** | ~10 min |
| Run it for real on one host | **C — Production Compose** | ~15 min |
| Run on Kubernetes | **D — Helm** | ~20 min |
| Provision cloud infra first | **E — Terraform** | ~30 min |
| Configure a fleet of VMs | **F — Ansible** | ~30 min |
| Install with no internet | **G — Air-gapped bundle** | ~20 min |

---

## Method A — Docker Compose (fastest)

```bash
cd platform
docker compose up --build                 # starts db, redis, minio, api, workers, web
docker compose exec api python -m app.seed # load demo data (optional)
```

Open **http://localhost:3000** (UI) and **http://localhost:8000/docs** (API).
That's the whole stack — Postgres+pgvector, Redis, MinIO, the API, the audit
workers, the scheduler, and the Next.js frontend.

## Method B — Guided setup wizard

Answers a few questions, recommends an architecture for your estate size, and
generates a ready-to-use `.env`, Helm values, and a setup summary:

```bash
cd platform
python3 scripts/govux-setup.py                       # interactive
python3 scripts/govux-setup.py --answers scripts/setup-answers.example.json --out ./deploy-out
python3 scripts/govux-setup.py --answers ... --dry-run   # preview, write nothing
```

## Method C — Production (hardened Compose)

```bash
cd platform
cp .env.example .env      # then set REAL secrets (see §Required config below)
./scripts/preinstall-check.sh --prod          # must pass
docker compose -f docker-compose.prod.yml up -d --build
```

Production compose differs from dev: **migrate-on-boot**, multi-worker
**Gunicorn** (no reload), a **durable** Redis (AOF) for the queue plus a separate
**LRU cache** Redis, and healthchecks on every service.

**Required secrets** (`.env`) — the API will not boot in prod without them:

| Variable | Meaning |
|---|---|
| `POSTGRES_PASSWORD` | strong DB password |
| `GOVUX_JWT_SECRET` | signs access tokens (32+ random chars) |
| `GOVUX_SECRET_KEY` | encrypts SMTP/CAPTCHA at rest — **must differ** from JWT secret |
| `GOVUX_CORS_ORIGINS` | your real browser origin(s) |

Generate one: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

## Method D — Kubernetes (Helm)

Requires `kubectl` + `helm` and a cluster. Chart at `platform/deploy/helm/govux`.

```bash
helm lint platform/deploy/helm/govux
helm install govux platform/deploy/helm/govux \
  --set secrets.jwtSecret=... --set secrets.secretKey=... \
  --set secrets.databaseUrl=postgresql://user:pass@host/govux \
  --set ingress.enabled=true --set api.autoscaling.enabled=true \
  --set worker.autoscaling.enabled=true
```

## Method E — Cloud infrastructure (Terraform)

Requires `terraform`. Provisions the underlying infra; see
`platform/deploy/terraform/README.md` and `terraform.tfvars.example`.

```bash
cd platform/deploy/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in
terraform init && terraform plan && terraform apply
```

## Method F — VM fleet (Ansible)

Requires `ansible`. Configures Docker + the stack across hosts;
see `platform/deploy/ansible/README.md`.

```bash
cd platform/deploy/ansible
cp inventory.example.ini inventory.ini         # add your hosts
ansible-playbook -i inventory.ini deploy.yml
```

## Method G — Air-gapped / offline

For secure government networks with no internet. Build the bundle on a connected
machine, copy it in, and install — no registry pulls. Full guide:
[platform/deploy/AIRGAP.md](platform/deploy/AIRGAP.md).

```bash
# on a connected machine:
cd platform
bash scripts/build-airgap-bundle.sh --out=./govux-airgap
# copy ./govux-airgap to the target, verify integrity, then load + up:
cd govux-airgap && sha256sum -c SHA256SUMS
```

---

## 4. Verify the install

```bash
curl -fsS http://localhost:8000/healthz          # API liveness → 200
docker compose ps                                # every service "running"/"healthy"
cd platform && python3 scripts/verify_screens.py # all UI screens present (53/53)
docker compose exec api pytest                   # backend suite (≈90% coverage)
```

Then sign in at **http://localhost:3000/login** with a `.gov.in`/`.nic.in` email.
In **dev** the one-time password is printed to the API log
(`docker compose logs api`); in **production** it is emailed via the SMTP relay
you configure under Admin → Configuration. Then register and verify a domain and
run your first audit from **New Audit**.

## 5. Troubleshooting & support

- **Bundle a diagnostic** for support: `platform/scripts/diagnostic-bundle.sh`
  (collects versions, container status, and sanitised logs — no secrets).
- **Common bring-up issues:** `platform/docs/GOTCHAS.md`.
- **Operations** (backups, scaling, monitoring, incident runbook): [docs/OPERATIONS.md](docs/OPERATIONS.md).
- **Security disclosures:** [SECURITY.md](SECURITY.md).

## 6. Full documentation index

| Document | What it covers |
|---|---|
| [README.md](README.md) | Product overview & quick start |
| [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) | **Every external dependency** (this is the manifest) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment topologies & environment setup |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Run it in production — backup, scale, monitor, recover |
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) | End-user & administrator guide |
| [platform/deploy/AIRGAP.md](platform/deploy/AIRGAP.md) | Offline / air-gapped installation |
| [platform/deploy/helm/govux](platform/deploy/helm/govux) · [terraform](platform/deploy/terraform) · [ansible](platform/deploy/ansible) | Infra automation |
| [platform/docs/ARCHITECTURE.md](platform/docs/ARCHITECTURE.md) · [API.md](platform/docs/API.md) · [GOTCHAS.md](platform/docs/GOTCHAS.md) | Engineering deep-dives |
| [CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md) | Contributing & release history |
