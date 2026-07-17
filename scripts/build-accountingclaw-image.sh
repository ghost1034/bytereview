#!/usr/bin/env bash
# Builds the AccountingClaw Hermes image with encrypted bundled skills.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
REGION="${REGION:-us-central1}"
ARTIFACT_REGISTRY_REPO="${ARTIFACT_REGISTRY_REPO:-cpa-docker}"
ARTIFACT_REGISTRY_URL="${ARTIFACT_REGISTRY_URL:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}}"
IMAGE_NAME="${ACCOUNTINGCLAW_IMAGE_NAME:-accountingclaw-hermes}"
DOCKERHUB_NAMESPACE="${DOCKERHUB_NAMESPACE:-cpaautomation}"
TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
CONTEXT_DIR="hermes/accountingclaw"
PLATFORM="${ACCOUNTINGCLAW_PLATFORM:-linux/amd64}"
PUSH="${PUSH:-true}"
PUSH_TARGET="${PUSH_TARGET:-dockerhub}"

ENV_FILE="backend/.env"
if [ -f "$ENV_FILE" ]; then
  CPAA_BUNDLE_SECRET="$(grep -m 1 '^CPAA_BUNDLE_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)"
  CPAA_BUNDLE_SECRET="${CPAA_BUNDLE_SECRET%\"}"; CPAA_BUNDLE_SECRET="${CPAA_BUNDLE_SECRET#\"}"
  CPAA_BUNDLE_SECRET="${CPAA_BUNDLE_SECRET%\'}"; CPAA_BUNDLE_SECRET="${CPAA_BUNDLE_SECRET#\'}"
fi
export CPAA_BUNDLE_SECRET

# CPAA_BUNDLE_SECRET encrypts the bundle at build time. The SAME value must be
# set as CPAA_BUNDLE_SECRET in the backend environment, because the activation
# resolve endpoint returns it to containers to decrypt this image. If the two
# diverge, activated containers will fail to decrypt the bundle.
if [ -z "${CPAA_BUNDLE_SECRET:-}" ]; then
  echo "CPAA_BUNDLE_SECRET is required in ${ENV_FILE} to encrypt the AccountingClaw bundle."
  exit 64
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running."
  exit 69
fi

local_tag="${DOCKERHUB_NAMESPACE}/${IMAGE_NAME}:${TAG}"
local_latest="${DOCKERHUB_NAMESPACE}/${IMAGE_NAME}:latest"
artifact_registry_tag="${ARTIFACT_REGISTRY_URL}/${IMAGE_NAME}:${TAG}"
artifact_registry_latest="${ARTIFACT_REGISTRY_URL}/${IMAGE_NAME}:latest"
dockerhub_tag="${DOCKERHUB_NAMESPACE}/${IMAGE_NAME}:${TAG}"
dockerhub_latest="${DOCKERHUB_NAMESPACE}/${IMAGE_NAME}:latest"

output_flag="--load"
tags=(-t "$local_tag" -t "$local_latest")

if [ "$PUSH" = "true" ]; then
  output_flag="--push"
  case "$PUSH_TARGET" in
    artifact-registry)
      gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
      tags=(-t "$artifact_registry_tag" -t "$artifact_registry_latest")
      ;;
    dockerhub)
      tags=(-t "$dockerhub_tag" -t "$dockerhub_latest")
      ;;
    *)
      echo "Unsupported PUSH_TARGET: $PUSH_TARGET. Use artifact-registry or dockerhub."
      exit 64
      ;;
  esac
fi

docker buildx build \
  --platform "$PLATFORM" \
  -f "${CONTEXT_DIR}/Dockerfile" \
  --secret id=cpaa_bundle_secret,env=CPAA_BUNDLE_SECRET \
  "${tags[@]}" \
  "$output_flag" \
  "$CONTEXT_DIR"

if [ "$PUSH" = "true" ]; then
  if [ "$PUSH_TARGET" = "dockerhub" ]; then
    echo "Built and pushed ${dockerhub_tag} and ${dockerhub_latest}."
  else
    echo "Built and pushed ${artifact_registry_tag} and ${artifact_registry_latest}."
  fi
else
  echo "Built ${local_tag} and ${local_latest}."
fi
