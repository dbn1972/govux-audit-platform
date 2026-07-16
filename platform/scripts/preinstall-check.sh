#!/usr/bin/env bash
# GovUX pre-install validation — fail early, clearly, with remediation.
# Volume-11 §11 (pre-install validation). Separates BLOCKING vs WARNING.
#
#   ./scripts/preinstall-check.sh            # dev prerequisites
#   ./scripts/preinstall-check.sh --prod     # also validate .env secrets for prod
#   ./scripts/preinstall-check.sh --env-file /path/.env --prod
#
# Exit code 0 = ready, 1 = blocking issue(s).
set -u
cd "$(cd "$(dirname "$0")/.." && pwd)"   # run from the platform/ dir (compose files live here)
MODE="dev"; ENV_FILE=".env"
while [ $# -gt 0 ]; do
  case "$1" in
    --prod) MODE="prod" ;;
    --env-file) shift; ENV_FILE="$1" ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  esac; shift
done

PASS=0; WARN=0; FAIL=0
ok()   { printf "  \033[92m✔\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
warn() { printf "  \033[93m!\033[0m %s\n     ↳ %s\n" "$1" "$2"; WARN=$((WARN+1)); }
bad()  { printf "  \033[91m✗\033[0m %s\n     ↳ %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }

echo "── GovUX pre-install validation ($MODE) ─────────────────────────────"

# 1. container runtime -------------------------------------------------------
echo "Runtime:"
if command -v docker >/dev/null 2>&1; then ok "docker present ($(docker --version | awk '{print $3}' | tr -d ,))";
else bad "docker not found" "Install Docker Engine 24+ (https://docs.docker.com/engine/install/)"; fi
if docker compose version >/dev/null 2>&1; then ok "docker compose v2 present ($(docker compose version --short 2>/dev/null))";
else bad "docker compose v2 not found" "Install the Compose plugin (docker-compose-plugin)"; fi
if docker info >/dev/null 2>&1; then ok "docker daemon reachable"; else bad "docker daemon not reachable" "Start Docker / check permissions"; fi

# 2. resources ---------------------------------------------------------------
echo "Resources:"
MEM_GB=$(( $( (sysctl -n hw.memsize 2>/dev/null || echo $(( $(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}') * 1024 )) ) ) / 1073741824 ))
[ "${MEM_GB:-0}" -ge 4 ] && ok "RAM ${MEM_GB} GB (>=4 GB)" || warn "RAM ${MEM_GB:-?} GB" "Browsers are heavy; 4 GB+ recommended (8 GB+ for prod workers)"
DISK_GB=$(df -Pg . 2>/dev/null | awk 'NR==2{print $4}'); DISK_GB=${DISK_GB:-$(df -P . | awk 'NR==2{print int($4/1048576)}')}
[ "${DISK_GB:-0}" -ge 10 ] && ok "Free disk ${DISK_GB} GB (>=10 GB)" || warn "Free disk ${DISK_GB:-?} GB" "Playwright browsers + images need ~10 GB+"

# 3. ports free --------------------------------------------------------------
echo "Ports:"
port_busy() { { command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; } \
  || { command -v nc >/dev/null 2>&1 && nc -z localhost "$1" >/dev/null 2>&1; }; }
for pr in "3000:web" "8000:api" "5432:postgres" "6379:redis" "9000:minio"; do
  p="${pr%%:*}"; svc="${pr#*:}"
  if port_busy "$p"; then warn "port $p ($svc) in use" "Stop the conflicting service or remap the port in compose";
  else ok "port $p ($svc) free"; fi
done

# 4. prod secret posture -----------------------------------------------------
if [ "$MODE" = "prod" ]; then
  echo "Production secrets ($ENV_FILE):"
  if [ ! -f "$ENV_FILE" ]; then
    bad "$ENV_FILE not found" "cp .env.example $ENV_FILE and set real values"
  else
    # shellcheck disable=SC1090
    set -a; . "$ENV_FILE" 2>/dev/null; set +a
    req_nondefault() { # var, bad-default
      v="$(eval echo "\${$1:-}")"
      if [ -z "$v" ]; then bad "$1 is empty" "Set a strong value in $ENV_FILE";
      elif [ "$v" = "$2" ]; then bad "$1 is the default ($2)" "Generate one: python -c 'import secrets;print(secrets.token_urlsafe(48))'";
      else ok "$1 set"; fi
    }
    req_nondefault GOVUX_JWT_SECRET "change-me-in-prod"
    req_nondefault GOVUX_SECRET_KEY ""
    req_nondefault POSTGRES_PASSWORD ""
    if [ "${GOVUX_JWT_SECRET:-}" = "${GOVUX_SECRET_KEY:-}" ] && [ -n "${GOVUX_JWT_SECRET:-}" ]; then
      bad "GOVUX_SECRET_KEY equals GOVUX_JWT_SECRET" "They must differ (one signs tokens, one encrypts secrets at rest)"
    fi
    [ -n "${GOVUX_CORS_ORIGINS:-}" ] && ok "GOVUX_CORS_ORIGINS set" || warn "GOVUX_CORS_ORIGINS unset" "Set the real frontend origin, not localhost"
  fi
fi

echo "─────────────────────────────────────────────────────────────────────"
printf "  Result: \033[92m%d passed\033[0m · \033[93m%d warnings\033[0m · \033[91m%d blocking\033[0m\n" "$PASS" "$WARN" "$FAIL"
if [ "$FAIL" -gt 0 ]; then echo "  ✗ NOT READY — resolve the blocking items above."; exit 1; fi
echo "  ✓ Prerequisites satisfied. Run: docker compose up --build"
exit 0
