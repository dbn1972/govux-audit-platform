#!/bin/sh
# Production entrypoint: apply DB migrations, then run the given command.
# Migrations are additive + idempotent, so this is safe to run on every deploy.
set -e
echo "[entrypoint] applying database migrations…"
alembic upgrade head
echo "[entrypoint] migrations applied; starting: $*"
exec "$@"
