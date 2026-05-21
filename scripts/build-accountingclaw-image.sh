#!/usr/bin/env bash
# Builds the AccountingClaw Hermes image with encrypted bundled skills.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
REGION="${REGION:-us-central1}"
ARTIFACT_REGISTRY_REPO="${ARTIFACT_REGISTRY_REPO:-cpa-docker}"
ARTIFACT_REGISTRY_URL="${ARTIFACT_REGISTRY_URL:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}}"
IMAGE_NAME="${ACCOUNTINGCLAW_IMAGE_NAME:-accountingclaw-hermes}"
TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
CONTEXT_DIR="hermes/accountingclaw"
PLATFORM="${ACCOUNTINGCLAW_PLATFORM:-linux/amd64}"
PUSH="${PUSH:-false}"

if [ -z "${CPAA_BUNDLE_SECRET:-}" ]; then
  echo "CPAA_BUNDLE_SECRET is required to encrypt the AccountingClaw bundle."
  exit 64
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running."
  exit 69
fi

local_tag="cpaautomation/${IMAGE_NAME}:${TAG}"
local_latest="cpaautomation/${IMAGE_NAME}:latest"
remote_tag="${ARTIFACT_REGISTRY_URL}/${IMAGE_NAME}:${TAG}"
remote_latest="${ARTIFACT_REGISTRY_URL}/${IMAGE_NAME}:latest"

output_flag="--load"
tags=(-t "$local_tag" -t "$local_latest")

if [ "$PUSH" = "true" ]; then
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  output_flag="--push"
  tags=(-t "$remote_tag" -t "$remote_latest")
fi

docker buildx build \
  --platform "$PLATFORM" \
  -f "${CONTEXT_DIR}/Dockerfile" \
  --secret id=cpaa_bundle_secret,env=CPAA_BUNDLE_SECRET \
  "${tags[@]}" \
  "$output_flag" \
  "$CONTEXT_DIR"

if [ "$PUSH" = "true" ]; then
  echo "Built and pushed ${remote_tag} and ${remote_latest}."
else
  echo "Built ${local_tag} and ${local_latest}."
fi
