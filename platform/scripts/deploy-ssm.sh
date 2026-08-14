#!/bin/bash
# Deploy GovUX to remote EC2 via SSM Run Command.
# Usage: ./scripts/deploy-ssm.sh [--timeout 600] [--no-build]
#
# Unlike `aws ssm wait`, this script polls with a configurable timeout and
# streams status updates so you know what's happening.

set -euo pipefail

REGION="${GOVUX_DEPLOY_REGION:-ap-south-2}"
INSTANCE_ID="${GOVUX_DEPLOY_INSTANCE:-i-0cc2319aa694bef7a}"
TIMEOUT_SECONDS="${GOVUX_DEPLOY_TIMEOUT:-600}"  # 10 minutes default
POLL_INTERVAL=15
BUILD_FLAG="--build"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/opt/govux/config/.env"
APP_DIR="/opt/govux/app/platform"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout)   TIMEOUT_SECONDS="$2"; shift 2 ;;
    --no-build)  BUILD_FLAG=""; shift ;;
    --region)    REGION="$2"; shift 2 ;;
    --instance)  INSTANCE_ID="$2"; shift 2 ;;
    *)           echo "Unknown option: $1"; exit 1 ;;
  esac
done

COMPOSE_CMD="cd ${APP_DIR} && docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up -d ${BUILD_FLAG} --remove-orphans"

echo "=== GovUX SSM Deploy ==="
echo "Region:    ${REGION}"
echo "Instance:  ${INSTANCE_ID}"
echo "Timeout:   ${TIMEOUT_SECONDS}s"
echo "Build:     ${BUILD_FLAG:-skip}"
echo "Command:   ${COMPOSE_CMD}"
echo ""

# Send command
COMMAND_ID=$(aws ssm send-command \
  --region "${REGION}" \
  --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript \
  --parameters "{\"commands\":[\"${COMPOSE_CMD}\"]}" \
  --timeout-seconds "${TIMEOUT_SECONDS}" \
  --query "Command.CommandId" \
  --output text)

echo "SSM Command ID: ${COMMAND_ID}"
echo "Polling every ${POLL_INTERVAL}s (max ${TIMEOUT_SECONDS}s)..."
echo ""

ELAPSED=0
while true; do
  # Get current status
  RESULT=$(aws ssm get-command-invocation \
    --region "${REGION}" \
    --command-id "${COMMAND_ID}" \
    --instance-id "${INSTANCE_ID}" \
    --output json 2>/dev/null || echo '{"Status":"Pending"}')

  STATUS=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('Status','Unknown'))" 2>/dev/null || echo "Unknown")

  printf "\r[%3ds] Status: %-12s" "${ELAPSED}" "${STATUS}"

  case "${STATUS}" in
    Success)
      echo ""
      echo ""
      echo "Deploy SUCCEEDED in ${ELAPSED}s"
      # Print stdout (truncated)
      STDOUT=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('StandardOutputContent','')[:2000])" 2>/dev/null)
      if [ -n "${STDOUT}" ]; then
        echo "--- Output (last 2000 chars) ---"
        echo "${STDOUT}"
      fi
      exit 0
      ;;
    Failed|TimedOut|Cancelled|Cancelling)
      echo ""
      echo ""
      echo "Deploy FAILED with status: ${STATUS}"
      # Print stderr
      STDERR=$(echo "${RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('StandardErrorContent','')[:3000])" 2>/dev/null)
      if [ -n "${STDERR}" ]; then
        echo "--- Error Output ---"
        echo "${STDERR}"
      fi
      exit 1
      ;;
    InProgress|Pending|Delayed)
      # Still running, continue polling
      ;;
    *)
      echo " (unexpected status, continuing...)"
      ;;
  esac

  if [ "${ELAPSED}" -ge "${TIMEOUT_SECONDS}" ]; then
    echo ""
    echo ""
    echo "LOCAL TIMEOUT after ${TIMEOUT_SECONDS}s — command may still be running on the instance."
    echo "Check manually: aws ssm get-command-invocation --region ${REGION} --command-id ${COMMAND_ID} --instance-id ${INSTANCE_ID}"
    exit 2
  fi

  sleep "${POLL_INTERVAL}"
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done
