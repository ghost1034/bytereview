#!/usr/bin/env bash
# Build, publish, and deploy the private Hosted Claw images.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
REPOSITORY="${REPOSITORY:-hosted-claw}"
MIG_NAME="${MIG_NAME:-hosted-claw-pilot-lean}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short=12 HEAD)}"
INSTANCE="${INSTANCE:-}"
DRAIN_TIMEOUT="${DRAIN_TIMEOUT:-900}"
TUNNEL_THROUGH_IAP="${TUNNEL_THROUGH_IAP:-true}"

# Approved production bases, recovered from the deployed image provenance on
# 2026-08-03. Override explicitly to perform a reviewed base-image upgrade.
HERMES_BASE_IMAGE="${HERMES_BASE_IMAGE:-nousresearch/hermes-agent@sha256:f59eb17c55f90409bb805525b7c2bd12dcd61355ebd3d2604272bed5dc597b67}"
PYTHON_BASE_IMAGE="${PYTHON_BASE_IMAGE:-python@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7}"
CADDY_BASE_IMAGE="${CADDY_BASE_IMAGE:-caddy@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d}"

MODE="both"

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

By default this builds, pushes, resolves immutable digests, drains the live
worker, deploys all four images, and verifies the release.

Options:
  --build-only             Build and push without deploying
  --deploy-only            Deploy IMAGE_TAG without rebuilding
  --image-tag TAG          Tag to build or deploy (default: git SHA)
  --instance NAME          Target worker instead of discovering it from the MIG
  --drain-timeout SECONDS  Maximum active-turn drain wait (default: 900)
  -h, --help               Show this help

Environment overrides: PROJECT_ID, REGION, ZONE, REPOSITORY, MIG_NAME,
TUNNEL_THROUGH_IAP, HERMES_BASE_IMAGE, PYTHON_BASE_IMAGE, CADDY_BASE_IMAGE.
EOF
}

set_mode() {
  if [ "$MODE" != both ] && [ "$MODE" != "$1" ]; then
    echo "Cannot combine --build-only and --deploy-only" >&2
    exit 2
  fi
  MODE="$1"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --build-only|--skip-deploy)
      set_mode build
      shift
      ;;
    --deploy-only|--skip-build)
      set_mode deploy
      shift
      ;;
    --image-tag)
      [ "$#" -ge 2 ] || { echo "--image-tag requires a value" >&2; exit 2; }
      IMAGE_TAG="$2"
      shift 2
      ;;
    --instance)
      [ "$#" -ge 2 ] || { echo "--instance requires a value" >&2; exit 2; }
      INSTANCE="$2"
      shift 2
      ;;
    --drain-timeout)
      [ "$#" -ge 2 ] || { echo "--drain-timeout requires a value" >&2; exit 2; }
      DRAIN_TIMEOUT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

for command in gcloud git; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 1; }
done
if [ "$MODE" != deploy ]; then
  command -v docker >/dev/null 2>&1 || { echo "Missing required command: docker" >&2; exit 1; }
fi
if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
  echo "No active gcloud account. Run: gcloud auth login" >&2
  exit 1
fi
if [[ ! "$IMAGE_TAG" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "Invalid image tag: $IMAGE_TAG" >&2
  exit 2
fi
if [[ ! "$DRAIN_TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then
  echo "DRAIN_TIMEOUT must be a positive integer" >&2
  exit 2
fi
case "$TUNNEL_THROUGH_IAP" in
  true|false) ;;
  *) echo "TUNNEL_THROUGH_IAP must be true or false" >&2; exit 2 ;;
esac

validate_base() {
  name="$1"
  image="$2"
  if [[ ! "$image" =~ @sha256:[0-9a-f]{64}$ ]]; then
    echo "$name must be pinned by sha256 digest: $image" >&2
    exit 2
  fi
}
validate_base HERMES_BASE_IMAGE "$HERMES_BASE_IMAGE"
validate_base PYTHON_BASE_IMAGE "$PYTHON_BASE_IMAGE"
validate_base CADDY_BASE_IMAGE "$CADDY_BASE_IMAGE"

REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"

build_images() {
  gcloud artifacts repositories describe "$REPOSITORY" \
    --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1 || \
    gcloud artifacts repositories create "$REPOSITORY" --project="$PROJECT_ID" \
      --location="$REGION" --repository-format=docker
  PROJECT_ID="$PROJECT_ID" REGION="$REGION" \
    "${SCRIPT_DIR}/configure-artifact-registry-cleanup.sh" "$REPOSITORY"
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

  docker buildx build \
    --platform linux/amd64 \
    --build-arg "CADDY_BASE_IMAGE=${CADDY_BASE_IMAGE}" \
    --file hosted_claw/images/proxy.Dockerfile \
    --tag "${REGISTRY}/hosted-proxy:${IMAGE_TAG}" \
    --push .
}

resolve_image() {
  image_name="$1"
  tagged_ref="${REGISTRY}/${image_name}:${IMAGE_TAG}"
  digest="$(gcloud artifacts docker images describe "$tagged_ref" \
    --project="$PROJECT_ID" --format='value(image_summary.digest)')"
  if [[ ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    echo "Could not resolve immutable digest for $tagged_ref" >&2
    exit 1
  fi
  printf '%s@%s\n' "${REGISTRY}/${image_name}" "$digest"
}

discover_instance() {
  if [ -n "$INSTANCE" ]; then
    return
  fi
  instances="$(gcloud compute instance-groups managed list-instances "$MIG_NAME" \
    --project="$PROJECT_ID" --zone="$ZONE" --format='value(instance.basename())')"
  instance_count="$(printf '%s\n' "$instances" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [ "$instance_count" -ne 1 ]; then
    echo "Expected exactly one instance in $MIG_NAME; found $instance_count" >&2
    exit 1
  fi
  INSTANCE="$(printf '%s\n' "$instances" | sed -n '1p')"
}

deploy_images() {
  supervisor_ref="$(resolve_image hosted-supervisor)"
  accounting_ref="$(resolve_image hosted-accountingclaw)"
  legal_ref="$(resolve_image hosted-legalclaw)"
  proxy_ref="$(resolve_image hosted-proxy)"
  discover_instance

  iap_args=()
  if [ "$TUNNEL_THROUGH_IAP" = true ]; then
    iap_args+=(--tunnel-through-iap)
  fi
  remote_helper="/tmp/hosted-claw-deploy-images-${IMAGE_TAG}.sh"
  gcloud compute scp "${REPO_ROOT}/infra/hosted-claw/deploy-images.sh" \
    "${INSTANCE}:${remote_helper}" --project="$PROJECT_ID" --zone="$ZONE" \
    "${iap_args[@]}" --quiet

  printf -v remote_command 'sudo bash %q %q %q %q %q %q %q' \
    "$remote_helper" "$IMAGE_TAG" "$supervisor_ref" "$accounting_ref" \
    "$legal_ref" "$proxy_ref" "$DRAIN_TIMEOUT"
  gcloud compute ssh "$INSTANCE" --project="$PROJECT_ID" --zone="$ZONE" \
    "${iap_args[@]}" --command="$remote_command"

  stable="$(gcloud compute instance-groups managed describe "$MIG_NAME" \
    --project="$PROJECT_ID" --zone="$ZONE" --format='value(status.isStable)')"
  if [ "$stable" != True ] && [ "$stable" != true ]; then
    echo "Managed instance group is not stable after deployment" >&2
    exit 1
  fi

  echo "Deployed Hosted Claw ${IMAGE_TAG}:"
  echo "  supervisor:      $supervisor_ref"
  echo "  accountingclaw:  $accounting_ref"
  echo "  legalclaw:       $legal_ref"
  echo "  proxy:           $proxy_ref"
}

echo "Hosted Claw release ${IMAGE_TAG} (${MODE})"
if [ "$MODE" != deploy ]; then
  build_images
fi
if [ "$MODE" != build ]; then
  deploy_images
else
  echo "Published Hosted Claw images with tag ${IMAGE_TAG}."
fi
