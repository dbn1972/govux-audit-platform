# GovUX — Terraform (Helm deployment)

Deploys the GovUX Helm chart to an **existing** Kubernetes cluster with the
`helm` + `kubernetes` providers. Terraform owns the Kubernetes Secret (so secrets
never live in Helm release state as plaintext) and installs the chart referencing it.

> Provisioning the cluster and managed **Postgres / Redis / S3** is cloud-specific
> and intentionally out of scope — provision them with your platform team's modules
> and feed the connection strings into `terraform.tfvars`.

## Usage

```bash
cd platform/deploy/terraform
cp terraform.tfvars.example terraform.tfvars   # set real values (secrets, DB/Redis URLs)
terraform init
terraform plan
terraform apply
```

## What it creates

- a namespace (`var.namespace`)
- a Kubernetes Secret (`<release>-secrets`) with `jwtSecret`, `secretKey`,
  `databaseUrl`, `cruxApiKey`
- a `helm_release` of the chart at `../helm/govux`, referencing that Secret

A **plan-time precondition** fails if `jwt_secret`/`secret_key` are unset or equal —
mirroring the application's production boot assertion.

## Key variables

| Variable | Notes |
|---|---|
| `kubeconfig_path` / `kube_context` | target cluster |
| `jwt_secret` / `secret_key` / `database_url` | required, sensitive; secret_key ≠ jwt_secret |
| `redis_url` / `cache_redis_url` | required — external/managed Redis (queue + cache) |
| `image_registry` / `image_tag` | your images |
| `ingress_enabled` / `ingress_host` | TLS ingress |
| `api_replicas` / `worker_replicas` | scale |

## Verify without a cluster

```bash
terraform fmt -check
terraform validate      # after `terraform init`
```
CI runs `fmt -check` + `validate` on every PR.

## State & secrets

Use a **remote backend** (S3+DynamoDB / GCS / azurerm) with encryption for real
deployments — `terraform.tfstate` contains the secret values. Never commit
`terraform.tfvars` or state files (see `.gitignore`).
