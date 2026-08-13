#!/bin/bash
# Production deploy script — builds, deploys, and waits for health.
# Intended to be invoked by CI/CD pipelines via SSM RunShellScript.
#
# Usage:
#   cd /opt/govux/app/platform
#   bash scripts/deploy-prod.sh [--no-build]
#
# Options:
#   --no-build    Skip image rebuild (e.g., when only config changed)
#
# Timeouts:
#   Docker build: up to 10 minutes (first build after Dockerfile change)
#   Health check: up to 5 minutes (migrations + container startup)
#
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="${GOVUX_ENV_FILE:-/opt/govux/config/.env}"
HEALTH_URL="http://127.0.0.1:8000/healthz"
HEALTH_TIMEOUT=300  # 5 minutes for health check
BUILD_FLAG="--build"

# Parse args
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD_FLAG="" ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."  # cd to platform/

echo "=== [deploy] Starting production deploy ==="
echo "    Compose file: $COMPOSE_FILE"
echo "    Env file: $ENV_FILE"
echo "    Build: ${BUILD_FLAG:-skipped}"
echo "    Time: $(date -u +%FT%TZ)"

# ── Build + Deploy ────────────────────────────────────────────────────────────
echo ""
echo "=== [deploy] Running docker compose up ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d $BUILD_FLAG --remove-orphans 2>&1

echo ""
echo "=== [deploy] Containers started, waiting for health ==="

# ── Health Check ──────────────────────────────────────────────────────────────
elapsed=0
interval=5
while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    echo "=== [deploy] API healthy after ${elapsed}s ==="
    
    # Also check web (frontend)
    if curl -sf http://127.0.0.1:3000/ >/dev/null 2>&1; then
      echo "=== [deploy] Web healthy ==="
    else
      echo "=== [deploy] WARNING: Web not yet responding on :3000 (non-blocking) ==="
    fi
    
    echo ""
    echo "=== [deploy] Deploy SUCCESSFUL at $(date -u +%FT%TZ) ==="
    docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
    exit 0
  fi
  sleep $interval
  elapsed=$((elapsed + interval))
  echo "    waiting... (${elapsed}s / ${HEALTH_TIMEOUT}s)"
done

echo ""
echo "=== [deploy] FAILED — health check timed out after ${HEALTH_TIMEOUT}s ==="
echo ""
echo "=== Container status ==="
docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || true
echo ""
echo "=== API logs (last 50 lines) ==="
docker compose -f "$COMPOSE_FILE" logs --tail=50 api 2>/dev/null || true
echo ""
echo "=== Web logs (last 20 lines) ==="
docker compose -f "$COMPOSE_FILE" logs --tail=20 web 2>/dev/null || true
exit 1
