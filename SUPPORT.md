# Support

How to get help with the GovUX Audit Platform.

## Before you ask

1. Check the docs — most questions are answered there:
   - [Installation](INSTALL.md) · [Dependencies](docs/DEPENDENCIES.md)
   - [User Manual](docs/USER_MANUAL.md) (incl. FAQ & glossary)
   - [Deployment](docs/DEPLOYMENT.md) · [Operations Runbook](docs/OPERATIONS.md)
   - [Configuration Reference](docs/CONFIGURATION.md)
   - Bring-up problems: [platform/docs/GOTCHAS.md](platform/docs/GOTCHAS.md)
2. Search existing [issues](https://github.com/dbn1972/govux-audit-platform/issues).

## Getting help

| Need | Where |
|---|---|
| **Bug report** | Open a [bug issue](https://github.com/dbn1972/govux-audit-platform/issues/new?template=bug_report.md) |
| **Feature request** | Open a [feature issue](https://github.com/dbn1972/govux-audit-platform/issues/new?template=feature_request.md) |
| **Question / how-to** | Start a discussion or a `question` issue |
| **Security vulnerability** | **Do not open a public issue** — follow [SECURITY.md](SECURITY.md) |
| **Operational incident (self-hosted)** | Your internal ops team + the [Operations Runbook](docs/OPERATIONS.md) |

## Help us help you

When reporting a problem, attach a **diagnostic bundle** — it collects versions,
container status, and sanitised logs (no secrets):

```bash
cd platform && ./scripts/diagnostic-bundle.sh
```

Include: what you expected, what happened, steps to reproduce, install method
(Compose/Helm/…), and the platform version (`appVersion` in
`platform/deploy/helm/govux/Chart.yaml`).

## Response expectations

This is an open-source project; community response is best-effort. Organisations
running it in production should arrange internal or vendor support and define
their own SLAs — see [VERSIONING.md](docs/VERSIONING.md) for supported versions.
