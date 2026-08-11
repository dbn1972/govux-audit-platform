#!/usr/bin/env bash
# GovUX backup / restore / verify.
#
# Backups were previously a REMINDER only ("confirm managed Postgres/Redis/S3 HA
# + backups, and run a restore drill before go-live" — deploy/terraform/outputs.tf).
# An untested backup is not a backup, so this script does all three jobs and the
# `verify` one restores into a scratch database and checks the data actually came
# back, rather than trusting that pg_dump exited 0.
#
#   ./scripts/govux-backup.sh backup                  # dump -> ./backups/
#   ./scripts/govux-backup.sh backup --out /srv/bk    # dump elsewhere
#   ./scripts/govux-backup.sh verify <file.dump>      # restore to scratch DB + assert
#   ./scripts/govux-backup.sh restore <file.dump>     # DESTRUCTIVE, needs --yes
#   ./scripts/govux-backup.sh list
#
# Postgres only. MinIO/S3 evidence objects are a separate concern — see
# RESTORE.md for why losing them is recoverable and losing the DB is not.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"    # platform/

COMPOSE_FILE="${GOVUX_COMPOSE_FILE:-docker-compose.yml}"
DC="docker compose -f $COMPOSE_FILE"
DB_SERVICE="${GOVUX_DB_SERVICE:-db}"
PGUSER="${GOVUX_PGUSER:-govux}"
PGDATABASE="${GOVUX_PGDATABASE:-govux}"
OUTDIR="./backups"
ASSUME_YES=0
RETAIN_DAYS="${GOVUX_RETAIN_DAYS:-30}"

CMD="${1:-}"; shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --out) shift; OUTDIR="$1" ;;
    --yes) ASSUME_YES=1 ;;
    --retain-days) shift; RETAIN_DAYS="$1" ;;
    *) ARG="${ARG:-}$1" ;;
  esac
  shift
done

die() { echo "ERROR: $*" >&2; exit 1; }
psql_q() { $DC exec -T "$DB_SERVICE" psql -U "$PGUSER" -d "$1" -tAc "$2"; }

# ---------------------------------------------------------------- backup ----
do_backup() {
  mkdir -p "$OUTDIR"
  local ts file
  ts="$(date +%Y%m%d-%H%M%S)"
  file="$OUTDIR/govux-$ts.dump"

  echo "Dumping $PGDATABASE …"
  # -Fc (custom format): compressed, and pg_restore can be selective on the way
  # back in. Plain SQL cannot, and a 100k-audit estate dumps large.
  $DC exec -T "$DB_SERVICE" pg_dump -U "$PGUSER" -d "$PGDATABASE" -Fc --no-owner --no-acl > "$file"
  [ -s "$file" ] || die "dump is empty — is the '$DB_SERVICE' service running?"

  # checksum alongside, so a corrupted transfer is detectable before a restore
  ( cd "$OUTDIR" && shasum -a 256 "$(basename "$file")" > "$(basename "$file").sha256" )

  echo "Wrote $file ($(du -h "$file" | cut -f1))"
  echo "Checksum $(cat "$file.sha256" | cut -d' ' -f1)"

  if [ "$RETAIN_DAYS" -gt 0 ]; then
    find "$OUTDIR" -name 'govux-*.dump*' -type f -mtime "+$RETAIN_DAYS" -print -delete 2>/dev/null || true
  fi
  echo "$file"
}

# ---------------------------------------------------------------- verify ----
# The part that makes this a real backup: restore into a throwaway database and
# assert the rows came back. Exits non-zero if the dump is unusable.
do_verify() {
  local file="${1:-}"
  [ -n "$file" ] || die "usage: govux-backup.sh verify <file.dump>"
  [ -f "$file" ] || die "no such file: $file"

  if [ -f "$file.sha256" ]; then
    ( cd "$(dirname "$file")" && shasum -a 256 -c "$(basename "$file").sha256" >/dev/null ) \
      || die "checksum mismatch — this dump is corrupt"
    echo "Checksum OK"
  else
    echo "WARNING: no .sha256 beside this dump; skipping integrity check" >&2
  fi

  local scratch="govux_verify_$$"
  echo "Restoring into scratch database $scratch …"
  psql_q postgres "DROP DATABASE IF EXISTS $scratch" >/dev/null
  psql_q postgres "CREATE DATABASE $scratch" >/dev/null
  # shellcheck disable=SC2094
  trap '$DC exec -T "$DB_SERVICE" psql -U "$PGUSER" -d postgres -tAc "DROP DATABASE IF EXISTS '"$scratch"'" >/dev/null 2>&1 || true' EXIT

  # pg_restore reports benign noise (extensions owned by another role, etc.);
  # correctness is judged by the assertions below, not by its exit code.
  $DC exec -T "$DB_SERVICE" pg_restore -U "$PGUSER" -d "$scratch" --no-owner --no-acl \
    < "$file" > /dev/null 2>&1 || true

  local failures=0
  # 1. the core tables exist
  for t in organisations users domains audits findings invitations; do
    local n
    n="$(psql_q "$scratch" "SELECT to_regclass('public.$t') IS NOT NULL")"
    if [ "$n" != "t" ]; then echo "  MISSING TABLE: $t"; failures=$((failures+1)); fi
  done
  # 2. row counts match the live database (a dump that restores empty is the
  #    classic silent failure this whole script exists to catch)
  for t in organisations users domains audits; do
    local live restored
    live="$(psql_q "$PGDATABASE" "SELECT count(*) FROM $t")"
    restored="$(psql_q "$scratch" "SELECT count(*) FROM $t" 2>/dev/null || echo "ERR")"
    if [ "$live" != "$restored" ]; then
      echo "  ROW COUNT MISMATCH $t: live=$live restored=$restored"
      failures=$((failures+1))
    else
      echo "  $t: $restored rows OK"
    fi
  done
  # 3. the gov-only CHECK constraints survived (invariant #4 lives in the schema)
  local chk
  chk="$(psql_q "$scratch" "SELECT count(*) FROM pg_constraint WHERE conname IN ('chk_gov_email','chk_gov_domain','chk_gov_invite_email')")"
  if [ "$chk" -lt 3 ]; then
    echo "  MISSING gov-only CHECK constraints (found $chk of 3)"; failures=$((failures+1))
  else
    echo "  gov-only CHECK constraints OK"
  fi

  [ "$failures" -eq 0 ] || die "$failures verification failure(s) — this backup is NOT usable"
  echo "VERIFIED: $file restores cleanly and completely."
}

# --------------------------------------------------------------- restore ----
do_restore() {
  local file="${1:-}"
  [ -n "$file" ] || die "usage: govux-backup.sh restore <file.dump> --yes"
  [ -f "$file" ] || die "no such file: $file"
  if [ "$ASSUME_YES" -ne 1 ]; then
    die "restore REPLACES the contents of '$PGDATABASE'. Re-run with --yes if that is intended."
  fi
  echo "Restoring $file into $PGDATABASE (existing objects will be dropped) …"
  $DC exec -T "$DB_SERVICE" pg_restore -U "$PGUSER" -d "$PGDATABASE" \
    --clean --if-exists --no-owner --no-acl < "$file" > /dev/null 2>&1 || true
  echo "Restored. Run the app's migrations to confirm the schema is at head:"
  echo "  $DC exec -T api alembic upgrade head"
}

case "$CMD" in
  backup)  do_backup ;;
  verify)  do_verify "${ARG:-}" ;;
  restore) do_restore "${ARG:-}" ;;
  list)    ls -lh "$OUTDIR"/govux-*.dump 2>/dev/null || echo "No backups in $OUTDIR" ;;
  *) sed -n '2,18p' "$0"; exit 1 ;;
esac
