# Backup & restore

Until now this was a one-line reminder in `deploy/terraform/outputs.tf` — no job,
no script, no tested restore path. An untested backup is not a backup, so the
tooling below treats **verification as the deliverable**, not the dump.

`scripts/govux-backup.sh` does three things:

```bash
./scripts/govux-backup.sh backup                 # dump -> ./backups/, with a .sha256
./scripts/govux-backup.sh verify <file.dump>     # restore to a scratch DB and ASSERT
./scripts/govux-backup.sh restore <file.dump> --yes   # DESTRUCTIVE
./scripts/govux-backup.sh list
```

## Why `verify` exists

`pg_dump` exiting 0 tells you a file was written, not that it can be restored.
The classic failure is a dump that restores *empty* — you find out during an
incident. `verify` therefore:

1. checks the SHA-256 written beside the dump (catches corrupt transfers),
2. restores into a throwaway `govux_verify_$$` database,
3. asserts the core tables exist,
4. asserts **row counts match the live database** — the check that actually
   catches a silently-empty dump,
5. asserts the gov-only `CHECK` constraints survived (`chk_gov_email`,
   `chk_gov_domain`, `chk_gov_invite_email`) — invariant #4 lives in the schema,
   so a restore that loses them is a restore that loses an access-control rule,
6. drops the scratch database on exit, including on failure.

It exits non-zero if any assertion fails, so it can gate a pipeline. Verified
behaviour: a good dump exits 0; a corrupted dump and a truncated dump both
exit 1.

## Restore drill (run this before go-live, then quarterly)

```bash
./scripts/govux-backup.sh backup
./scripts/govux-backup.sh verify ./backups/govux-<timestamp>.dump
docker compose exec -T api alembic upgrade head    # confirm schema is at head
```

The drill is the point. If `verify` has never been run against a *production*
dump, the production backup is unproven regardless of how many exist.

## What is and isn't covered

| Data | Covered | If lost |
|---|---|---|
| PostgreSQL (orgs, users, domains, audits, findings, settings) | **yes** | unrecoverable — this is the system of record |
| MinIO / S3 evidence (report PDFs, screenshots) | no | recoverable: re-run the audit; evidence is regenerable output |
| Redis (queue, cache) | no | in-flight jobs are re-queued by the worker's XAUTOCLAIM reclaim; the cache is derived |

Redis is deliberately excluded: it holds a cache and a work queue, both derived
from Postgres. Object storage is excluded because evidence can be regenerated
and versioned-bucket replication is the right tool for it — not a pg_dump script.

## Production

Use the managed provider's automated backups (PITR + retention) as the primary
mechanism; this script is the portable path and, more importantly, the **drill**.
Whatever produces the dump, point `verify` at it.

```bash
# nightly, e.g. from cron on the ops host
GOVUX_COMPOSE_FILE=docker-compose.prod.yml ./scripts/govux-backup.sh backup --retain-days 30
```

Environment overrides: `GOVUX_COMPOSE_FILE`, `GOVUX_DB_SERVICE`, `GOVUX_PGUSER`,
`GOVUX_PGDATABASE`, `GOVUX_RETAIN_DAYS`.
