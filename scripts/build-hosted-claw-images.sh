#!/usr/bin/env bash
# Build and publish the private hosted product images from a digest-pinned base.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-hosted-claw}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short=12 HEAD)}"
HERMES_BASE_IMAGE="${HERMES_BASE_IMAGE:?set HERMES_BASE_IMAGE to an approved image@sha256:digest}"
PYTHON_BASE_IMAGE="${PYTHON_BASE_IMAGE:?set PYTHON_BASE_IMAGE to an approved Python image@sha256:digest}"

case "$HERMES_BASE_IMAGE" in
  *@sha256:*) ;;
  *) echo "HERMES_BASE_IMAGE must be pinned by digest" >&2; exit 2 ;;
esac
case "$PYTHON_BASE_IMAGE" in
  *@sha256:*) ;;
  *) echo "PYTHON_BASE_IMAGE must be pinned by digest" >&2; exit 2 ;;
esac

REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
gcloud artifacts repositories describe "$REPOSITORY" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPOSITORY" --location="$REGION" --repository-format=docker
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

for product in accountingclaw legalclaw; do
  docker buildx build \
    --platform linux/amd64 \
    --build-arg "HERMES_BASE_IMAGE=${HERMES_BASE_IMAGE}" \
    --file "hosted_claw/images/${product}.Dockerfile" \
    --tag "${REGISTRY}/hosted-${product}:${IMAGE_TAG}" \
    --push .
done

docker buildx build \
  --platform linux/amd64 \
  --build-arg "PYTHON_BASE_IMAGE=${PYTHON_BASE_IMAGE}" \
  --file hosted_claw/images/supervisor.Dockerfile \
  --tag "${REGISTRY}/hosted-supervisor:${IMAGE_TAG}" \
  --push .

echo "Published hosted images with tag ${IMAGE_TAG}. Resolve and deploy their immutable digests before starting the worker."
