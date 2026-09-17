#!/usr/bin/env bash
# GovUX email doctor — why is POST /v1/auth/otp/request returning 502?
#
# A 502 there means exactly one thing: send_otp() returned False, so the code row
# exists and no mail went out. Production has no fallback (GOVUX_ALLOW_CONSOLE_OTP
# is deliberately unset), so the failure surfaces instead of passing silently.
# This prints which of the four causes it is, and can fix the common one.
#
#   ./scripts/email-doctor.sh -f docker-compose.prod.yml               # diagnose
#   ./scripts/email-doctor.sh -f docker-compose.prod.yml --set         # configure the relay
#   ./scripts/email-doctor.sh -f docker-compose.prod.yml --test a@gov.in
#
# Never prints a password: only whether one is present and whether it decrypts.
set -u
cd "$(cd "$(dirname "$0")/.." && pwd)"        # the compose files live in platform/
COMPOSE_FILE="docker-compose.yml"; MODE="diagnose"; TEST_TO=""
while [ $# -gt 0 ]; do
  case "$1" in
    -f|--file) shift; COMPOSE_FILE="${1:-}" ;;
    --set)     MODE="set" ;;
    --test)    MODE="test"; shift; TEST_TO="${1:-}" ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
  esac; shift
done
ENV_FILE="${GOVUX_ENV_FILE:-}"
DC="docker compose -f $COMPOSE_FILE"
[ -n "$ENV_FILE" ] && DC="$DC --env-file $ENV_FILE"

# ── configure the relay ─────────────────────────────────────────────────────
# Through settings_store, not SQL: it encrypts under THIS instance's
# GOVUX_SECRET_KEY and drops the Redis settings cache. A raw UPDATE does
# neither, which is how a "fixed" instance keeps failing for another hour.
if [ "$MODE" = "set" ]; then
  read -rp "SMTP host           [smtp.mgovcloud.in]: " M_HOST; M_HOST="${M_HOST:-smtp.mgovcloud.in}"
  read -rp "SMTP port           [465]: "               M_PORT; M_PORT="${M_PORT:-465}"
  read -rp "SMTP user (full address): "                M_USER
  read -rp "From address        [$M_USER]: "           M_FROM; M_FROM="${M_FROM:-$M_USER}"
  read -rsp "SMTP password (not echoed, not stored): " M_PASS; echo
  if [ -z "$M_USER" ] || [ -z "$M_PASS" ]; then echo "user and password are required"; exit 1; fi
  # Fed through stdin, never argv and never the environment: both are readable
  # by any other user on the box via ps / /proc.
  printf '%s\n%s\n%s\n%s\n%s\n' "$M_HOST" "$M_PORT" "$M_USER" "$M_FROM" "$M_PASS" \
  | $DC exec -T api python -c '
import sys
from app.database import SessionLocal
from app.services import settings_store as s
host, port, user, frm, pw = [l.rstrip("\n") for l in sys.stdin]
db = SessionLocal()
for k, v in (("email_provider", "smtp"), ("email_from", frm), ("smtp_host", host),
             ("smtp_port", port), ("smtp_user", user), ("smtp_password", pw)):
    s.set_value(k, v, db)
db.close()
print("saved (password encrypted at rest, settings cache dropped)")
'
  echo; echo "Now verify:  $0 -f $COMPOSE_FILE --test you@gov.in"; exit $?
fi

# ── send a real test message ────────────────────────────────────────────────
if [ "$MODE" = "test" ]; then
  [ -z "$TEST_TO" ] && { echo "--test needs an address"; exit 1; }
  TEST_TO="$TEST_TO" $DC exec -T -e TEST_TO api python - <<'PY'
import os
from app.services import email
r = email.send_test(os.environ["TEST_TO"])
print(r)
print("\nOK — sign-in mail will work." if r.get("ok") else
      "\nStill failing. The error above is verbatim from the relay:\n"
      "  authentication failed  -> wrong user/password (an app password, not the account one)\n"
      "  timed out / refused    -> egress to that host:port is blocked on this server\n"
      "  wrong version number   -> port/TLS mismatch (465 is implicit SSL, 587 is STARTTLS)")
PY
  exit $?
fi

# ── diagnose ────────────────────────────────────────────────────────────────
$DC exec -T api python - <<'PY'
import socket
from app.config import settings
from app.database import SessionLocal
from app import models
from app.services import settings_store as s

prov = s.get_str("email_provider", "console")
host, port = s.get_str("smtp_host"), s.get_int("smtp_port", 587)
user, frm = s.get_str("smtp_user"), s.get_str("email_from")
pw = s.get_str("smtp_password")            # decrypted; only its length is printed

db = SessionLocal()
row = db.get(models.AppSetting, "smtp_password")
db.close()
stored = row.value if row and row.value else ""

print(f"  env               {settings.env}")
print(f"  email_provider    {prov or '(unset -> console)'}")
print(f"  smtp_host:port    {host or '(unset)'}:{port}")
print(f"  smtp_user         {user or '(unset)'}")
print(f"  email_from        {frm or '(unset)'}")
print(f"  smtp_password     {'stored, ' + ('encrypted' if stored.startswith('enc:') else 'PLAINTEXT') if stored else 'not set'}"
      f"{f', decrypts to {len(pw)} chars' if stored else ''}")

reach = "not checked"
if host:
    try:
        socket.create_connection((host, port), 8).close(); reach = "reachable"
    except Exception as e:
        reach = f"UNREACHABLE ({type(e).__name__}: {e})"
print(f"  egress {host}:{port}  {reach}" if host else "")

print("\nVERDICT")
if settings.env != "production":
    print("  Not a production instance — 502 here would not be the same bug.")
elif prov == "console":
    print("  >> THIS IS THE 502. email_provider is 'console', which production")
    print("     refuses to use: it would write the OTP — the only auth factor —")
    print("     to the server log (SAST-003). No mail is sent, so send_otp()")
    print("     returns False and the endpoint 502s for every address.")
    print("     app_settings is per-database: configuring email on another")
    print("     instance did nothing here.  Fix:  email-doctor.sh --set")
elif prov == "smtp" and not host:
    print("  >> smtp selected but smtp_host is unset.  Fix: email-doctor.sh --set")
elif stored.startswith("enc:") and not pw:
    print("  >> The stored password will not decrypt under this instance's")
    print("     GOVUX_SECRET_KEY — the row was copied from another instance.")
    print("     decrypt() returns empty, so the relay sees a blank password.")
    print("     Fix: email-doctor.sh --set  (re-enter it here)")
elif reach.startswith("UNREACHABLE"):
    print("  >> Config is complete but this server cannot reach the relay.")
    print("     No setting fixes that — the egress needs whitelisting.")
else:
    print("  Config looks complete. Send a real one:  email-doctor.sh --test you@gov.in")
    print("  If that fails, the relay's own error is the answer.")
PY
echo
echo "--- recent mail/OTP log lines -------------------------------------------"
$DC logs api --since 30m 2>/dev/null | grep -iE 'OTP|smtp|email send error|NOT sent' | tail -15
