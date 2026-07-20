# Upgrade Guide

How to move a running deployment to a newer version safely. Read the
[CHANGELOG](../CHANGELOG.md) and any release-specific notes first, then follow the
path for your install method. Versioning rules: [VERSIONING.md](VERSIONING.md).

## Golden rules

1. **Back up first** — snapshot the database (and object storage) before every
   upgrade. See [OPERATIONS.md](OPERATIONS.md#5-backups--recovery).
2. **Read the notes** — a MAJOR bump may need manual steps; MINOR/PATCH usually
   don't.
3. **Migrations are forward-only in practice** — the production image runs
   `alembic upgrade head` on boot. Test the upgrade in staging first.
4. **Have a rollback plan** — keep the previous image tag and a fresh DB backup.

## Pre-upgrade checklist

```bash
# 1. Back up the database
pg_dump "$GOVUX_DATABASE_URL" > backup-$(date +%F).sql       # (use your real conn string)
# 2. Note the current version and confirm CI-green target build
# 3. Snapshot object storage (MinIO/S3) per your storage tooling
```

## Docker Compose

```bash
cd platform
git fetch --tags && git checkout <target-tag>     # or pull the new images
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --build
```

The `api` service runs migrations on boot (`entrypoint.sh` → `alembic upgrade
head`). Watch it apply cleanly:

```bash
docker compose -f docker-compose.prod.yml logs -f api | grep -i alembic
```

## Kubernetes (Helm)

```bash
helm repo update    # or check out the new chart
helm upgrade govux platform/deploy/helm/govux -f your-values.yaml
```

Migrations run as a **pre-upgrade Job** (`templates/migrate-job.yaml`) before the
new pods roll, so the schema is ready before traffic shifts. Roll back with:

```bash
helm rollback govux <previous-revision>
```

(Restore the DB backup as well if the release included non-reversible migrations.)

## Verify after upgrade

```bash
curl -fsS https://<host>/healthz                 # → 200
# check version, run a smoke audit, confirm dashboards/rankings load
```

- Confirm the OpenAPI contract matches expectations (a changed surface is
  intentional and noted in the changelog).
- Regenerate the [SBOM](SBOM.md) if dependencies changed.

## Rollback

1. Redeploy the previous image tag / `helm rollback`.
2. If the release applied a non-backward-compatible migration, **restore the
   pre-upgrade database backup** — do not point an old app at a newer schema.
3. Capture a [diagnostic bundle](../SUPPORT.md) and file an issue.

## Version-specific notes

Add a dated section here per release that needs manual steps, e.g.:

```
### → 2.0.0
- Requires setting <NEW_VAR> before boot.
- One-time data backfill: <command>.
```

_(No manual steps recorded yet — MINOR/PATCH upgrades to date are drop-in.)_
