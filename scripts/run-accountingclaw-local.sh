#!/usr/bin/env bash
# Runs the AccountingClaw Hermes image locally with persistent /opt/data.

set -euo pipefail

IMAGE="${1:-cpaautomation/accountingclaw-hermes:latest}"
if [ "$#" -gt 0 ]; then
  shift
fi

DATA_DIR="${ACCOUNTINGCLAW_DATA_DIR:-${PWD}/.accountingclaw-data}"
PORT="${ACCOUNTINGCLAW_PORT:-8642}"
CONTAINER_NAME="${ACCOUNTINGCLAW_CONTAINER_NAME:-accountingclaw-hermes}"

if [ -z "${CPAA_ACTIVATION_KEY:-}" ] && [ -z "${CPAA_BUNDLE_SECRET:-}" ]; then
  echo "Set CPAA_ACTIVATION_KEY to activate against the backend, or CPAA_BUNDLE_SECRET to"
  echo "decrypt directly (dev escape hatch)."
  echo "For a local backend set, e.g.:"
  echo "  CPAA_ACTIVATION_URL=http://host.docker.internal:8000/api/activation/resolve"
  exit 64
fi

mkdir -p "$DATA_DIR"

cmd=("$@")
if [ "${#cmd[@]}" -eq 0 ]; then
  cmd=(gateway run)
fi

docker run --rm -it \
  --name "$CONTAINER_NAME" \
  -v "$DATA_DIR:/opt/data" \
  -e CPAA_ACTIVATION_KEY \
  -e CPAA_ACTIVATION_URL \
  -e CPAA_BUNDLE_SECRET \
  -e OPENROUTER_API_KEY \
  -e OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY \
  -e GEMINI_API_KEY \
  -e API_SERVER_ENABLED \
  -e API_SERVER_HOST \
  -e API_SERVER_KEY \
  -e API_SERVER_CORS_ORIGINS \
  -p "${PORT}:8642" \
  "$IMAGE" \
  "${cmd[@]}"
