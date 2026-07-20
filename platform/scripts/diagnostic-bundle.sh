#!/usr/bin/env bash
# GovUX diagnostic bundle — structured, redacted support snapshot.
# Volume-11 §17 (diagnostic bundle & troubleshooting standard).
#
#   ./scripts/diagnostic-bundle.sh                       # dev compose
#   ./scripts/diagnostic-bundle.sh -f docker-compose.prod.yml
#
# Produces govux-diagnostics-<timestamp>/ and a .tar.gz. Secrets are masked.
set -u
cd "$(cd "$(dirname "$0")/.." && pwd)"   # run from the platform/ dir (compose files live here)
COMPOSE_FILE="docker-compose.yml"
while [ $# -gt 0 ]; do case "$1" in -f|--file) shift; COMPOSE_FILE="$1";; esac; shift; done
DC="docker compose -f $COMPOSE_FILE"

TS="$(date +%Y%m%d-%H%M%S 2>/dev/null || echo now)"
OUT="govux-diagnostics-$TS"
mkdir -p "$OUT"
echo "Collecting diagnostics into $OUT/ (compose: $COMPOSE_FILE) …"

# 1. version / build ---------------------------------------------------------
{
  echo "collected_at: $TS"
  echo "compose_file: $COMPOSE_FILE"
  echo "git_sha: $(git rev-parse --short HEAD 2>/dev/null || echo n/a)"
  echo "git_branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo n/a)"
  echo "docker: $(docker --version 2>/dev/null)"
  echo "compose: $(docker compose version --short 2>/dev/null)"
  echo "health: $(curl -s http://localhost:8000/healthz 2>/dev/null || echo unreachable)"
} > "$OUT/version.txt"

# 2. service status ----------------------------------------------------------
$DC ps > "$OUT/services.txt" 2>&1

# 3. adapter health ----------------------------------------------------------
{
  echo "== /healthz =="; curl -s http://localhost:8000/healthz 2>&1; echo
  echo "== postgres =="; $DC exec -T db pg_isready 2>&1 || echo "db unreachable"
  echo "== redis =="; $DC exec -T redis redis-cli ping 2>&1 || echo "redis unreachable"
  echo "== queue depth / dlq / pending =="
  $DC exec -T redis sh -c 'echo -n "audits="; redis-cli XLEN govux:audits; echo -n "dlq="; redis-cli XLEN govux:audits:dlq; echo -n "public="; redis-cli XLEN govux:public' 2>&1 || true
} > "$OUT/adapters.txt"

# 4. readiness / metrics snapshot -------------------------------------------
curl -s http://localhost:8000/metrics > "$OUT/metrics.txt" 2>&1 || echo "metrics unreachable (token-gated?)" > "$OUT/metrics.txt"

# 5. config summary WITHOUT secrets -----------------------------------------
$DC exec -T api sh -c 'env | grep -i "^GOVUX_\|^POSTGRES_" | sort' 2>/dev/null \
  | sed -E 's/(SECRET|PASSWORD|KEY|TOKEN)([A-Z_]*)=.*/\1\2=********(redacted)/I' \
  | sed -E 's#(://[^:/@]+:)[^@]+@#\1****@#g' \
  > "$OUT/config-redacted.txt" || echo "api container not running" > "$OUT/config-redacted.txt"

# 6. recent logs (last 300 lines/service) + error summary -------------------
mkdir -p "$OUT/logs"
for svc in api worker scheduler public-worker web db redis; do
  $DC logs --no-color --tail 300 "$svc" > "$OUT/logs/$svc.log" 2>&1 || true
done
{
  echo "== recent ERROR/CRITICAL across services =="
  grep -rhiE "error|critical|traceback|exception|unhandled" "$OUT/logs/" 2>/dev/null | tail -40 || echo "  (none found in tail window)"
} > "$OUT/error-summary.txt"

# 7. bundle ------------------------------------------------------------------
tar -czf "$OUT.tar.gz" "$OUT" 2>/dev/null && echo "✓ Bundle: $OUT.tar.gz"
echo "  Contents: version, services, adapters, metrics, config-redacted, logs/, error-summary"
echo "  Secrets are masked — safe to attach to a support ticket after a quick review."
