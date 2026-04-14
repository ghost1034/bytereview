#!/bin/bash
# Deploy Inkwise inside the existing CPAAutomation platform.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
REGION="${REGION:-us-central1}"
ENVIRONMENT="${ENVIRONMENT:-production}"
ARTIFACT_REGISTRY_REPO="${ARTIFACT_REGISTRY_REPO:-cpa-docker}"
ARTIFACT_REGISTRY_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-cpaautomation-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
VPC_CONNECTOR="${VPC_CONNECTOR:-cpa-svpc}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-${PROJECT_ID}:${REGION}:cpaautomation-db}"
INKWISE_DERIVED_BUCKET="${INKWISE_DERIVED_BUCKET:-cpaautomation-files-prod}"
INKWISE_MAX_UPLOAD_MB="${INKWISE_MAX_UPLOAD_MB:-100}"
INKWISE_MAX_BOUND_SOURCES="${INKWISE_MAX_BOUND_SOURCES:-100}"
INKWISE_GEMINI_MODEL="${INKWISE_GEMINI_MODEL:-gemini-3-flash-preview}"
INKWISE_GROUNDED_MODEL="${INKWISE_GROUNDED_MODEL:-$INKWISE_GEMINI_MODEL}"
INKWISE_EMBEDDING_MODEL="${INKWISE_EMBEDDING_MODEL:-gemini-embedding-2-preview}"
INKWISE_EMBEDDING_LOCATION="${INKWISE_EMBEDDING_LOCATION:-us-central1}"
INKWISE_EMBEDDING_DIMENSION="${INKWISE_EMBEDDING_DIMENSION:-1536}"
INKWISE_EMBEDDING_QUERY_TASK_TYPE="${INKWISE_EMBEDDING_QUERY_TASK_TYPE:-RETRIEVAL_QUERY}"
INKWISE_EMBEDDING_DOCUMENT_TASK_TYPE="${INKWISE_EMBEDDING_DOCUMENT_TASK_TYPE:-RETRIEVAL_DOCUMENT}"
INKWISE_USE_LEXICAL_FUSION="${INKWISE_USE_LEXICAL_FUSION:-false}"
INKWISE_USE_VECTOR_RERANK="${INKWISE_USE_VECTOR_RERANK:-false}"
INKWISE_VECTOR_SEARCH_TOP_K="${INKWISE_VECTOR_SEARCH_TOP_K:-24}"
INKWISE_LEXICAL_SEARCH_TOP_K="${INKWISE_LEXICAL_SEARCH_TOP_K:-16}"
INKWISE_RERANK_TOP_K="${INKWISE_RERANK_TOP_K:-12}"
INKWISE_VECTOR_RERANK_MODEL="${INKWISE_VECTOR_RERANK_MODEL:-$INKWISE_GEMINI_MODEL}"
INKWISE_SEGMENT_PDF_WINDOW_PAGES="${INKWISE_SEGMENT_PDF_WINDOW_PAGES:-4}"
INKWISE_SEGMENT_PDF_WINDOW_OVERLAP_PAGES="${INKWISE_SEGMENT_PDF_WINDOW_OVERLAP_PAGES:-1}"
INKWISE_SEGMENT_TEXT_CHUNK_CHARS="${INKWISE_SEGMENT_TEXT_CHUNK_CHARS:-3000}"
API_TIMEOUT="${API_TIMEOUT:-900}"
SKIP_BUILD=false
SKIP_MIGRATE=false
ROTATE_TASK_TOKEN=false

if git -C "$ROOT_DIR" rev-parse --short HEAD >/dev/null 2>&1; then
  IMAGE_TAG_DEFAULT="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
else
  IMAGE_TAG_DEFAULT="latest"
fi
IMAGE_TAG="${IMAGE_TAG:-$IMAGE_TAG_DEFAULT}"

normalize_bucket_name() {
  local value="${1:-}"
  value="${value#gs://}"
  value="${value%/}"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s' "$value"
}

INKWISE_DERIVED_BUCKET="$(normalize_bucket_name "$INKWISE_DERIVED_BUCKET")"

usage() {
  cat <<EOF
Usage: ./scripts/deploy-inkwise.sh [options]

Options:
  --project-id ID           GCP project id (default: ${PROJECT_ID})
  --region REGION           GCP region (default: ${REGION})
  --image-tag TAG           Docker image tag to deploy (default: git sha)
  --environment ENV         production or staging (default: ${ENVIRONMENT})
  --skip-build              Reuse existing backend/frontend images
  --skip-migrate            Skip Alembic migration job
  --rotate-task-token       Force a new Inkwise task token secret version
  -h, --help                Show this help text
EOF
}

section() {
  echo -e "${YELLOW}===================================================${NC}"
  echo -e "${YELLOW}$1${NC}"
  echo -e "${YELLOW}===================================================${NC}"
}

info() {
  echo -e "${BLUE}$1${NC}"
}

ok() {
  echo -e "${GREEN}$1${NC}"
}

warn() {
  echo -e "${YELLOW}$1${NC}"
}

die() {
  echo -e "${RED}$1${NC}"
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

service_exists() {
  local service_name="$1"
  gcloud run services describe "$service_name" --region="$REGION" >/dev/null 2>&1
}

secret_exists() {
  local secret_name="$1"
  gcloud secrets describe "$secret_name" >/dev/null 2>&1
}

queue_exists() {
  local queue_name="$1"
  gcloud tasks queues describe "$queue_name" --location="$REGION" >/dev/null 2>&1
}

random_token() {
  openssl rand -hex 32
}

ensure_secret_value() {
  local secret_name="$1"
  local should_rotate="$2"
  local token

  if ! secret_exists "$secret_name"; then
    token="$(random_token)"
    printf '%s' "$token" | gcloud secrets create "$secret_name" --data-file=- >/dev/null
    ok "Created secret ${secret_name}"
    return
  fi

  if [ "$should_rotate" = true ]; then
    token="$(random_token)"
    printf '%s' "$token" | gcloud secrets versions add "$secret_name" --data-file=- >/dev/null
    ok "Rotated secret ${secret_name}"
  else
    ok "Secret ${secret_name} already exists"
  fi
}

ensure_queue() {
  local queue_name="$1"

  if queue_exists "$queue_name"; then
    gcloud tasks queues update "$queue_name" \
      --location="$REGION" \
      --max-dispatches-per-second=2 \
      --max-concurrent-dispatches=2 \
      --max-attempts=5 >/dev/null
    ok "Cloud Tasks queue ${queue_name} updated"
  else
    gcloud tasks queues create "$queue_name" \
      --location="$REGION" \
      --max-dispatches-per-second=2 \
      --max-concurrent-dispatches=2 \
      --max-attempts=5 >/dev/null
    ok "Cloud Tasks queue ${queue_name} created"
  fi
}

ensure_base_services() {
  local api_service="$1"
  local web_service="$2"

  if service_exists "$api_service" && service_exists "$web_service"; then
    ok "Base CPAAutomation services already exist"
    return
  fi

  warn "Base services are missing; bootstrapping CPAAutomation services first"
  "$ROOT_DIR/scripts/deploy-services.sh" "$IMAGE_TAG" "$ENVIRONMENT"
}

deploy_api() {
  local service_name="$1"
  local image_url="$2"
  local api_url="$3"
  local queue_name="$4"
  local token_secret_name="$5"
  local env_delim='^@^'
  local env_items
  local env_vars

  env_items=(
    "INKWISE_ENABLED=true"
    "INKWISE_DERIVED_BUCKET=${INKWISE_DERIVED_BUCKET}"
    "INKWISE_MAX_UPLOAD_MB=${INKWISE_MAX_UPLOAD_MB}"
    "INKWISE_MAX_BOUND_SOURCES=${INKWISE_MAX_BOUND_SOURCES}"
    "INKWISE_GEMINI_MODEL=${INKWISE_GEMINI_MODEL}"
    "INKWISE_GROUNDED_MODEL=${INKWISE_GROUNDED_MODEL}"
    "INKWISE_EMBEDDING_MODEL=${INKWISE_EMBEDDING_MODEL}"
    "INKWISE_EMBEDDING_LOCATION=${INKWISE_EMBEDDING_LOCATION}"
    "INKWISE_EMBEDDING_DIMENSION=${INKWISE_EMBEDDING_DIMENSION}"
    "INKWISE_EMBEDDING_QUERY_TASK_TYPE=${INKWISE_EMBEDDING_QUERY_TASK_TYPE}"
    "INKWISE_EMBEDDING_DOCUMENT_TASK_TYPE=${INKWISE_EMBEDDING_DOCUMENT_TASK_TYPE}"
    "INKWISE_QUERY_REWRITE_MODEL=${INKWISE_QUERY_REWRITE_MODEL:-${INKWISE_GEMINI_MODEL}}"
    "INKWISE_QUERY_REWRITE_ENABLED=${INKWISE_QUERY_REWRITE_ENABLED:-true}"
    "INKWISE_USE_LEXICAL_FUSION=${INKWISE_USE_LEXICAL_FUSION}"
    "INKWISE_USE_VECTOR_RERANK=${INKWISE_USE_VECTOR_RERANK}"
    "INKWISE_VECTOR_SEARCH_TOP_K=${INKWISE_VECTOR_SEARCH_TOP_K}"
    "INKWISE_LEXICAL_SEARCH_TOP_K=${INKWISE_LEXICAL_SEARCH_TOP_K}"
    "INKWISE_RERANK_TOP_K=${INKWISE_RERANK_TOP_K}"
    "INKWISE_VECTOR_RERANK_MODEL=${INKWISE_VECTOR_RERANK_MODEL}"
    "INKWISE_SEGMENT_PDF_WINDOW_PAGES=${INKWISE_SEGMENT_PDF_WINDOW_PAGES}"
    "INKWISE_SEGMENT_PDF_WINDOW_OVERLAP_PAGES=${INKWISE_SEGMENT_PDF_WINDOW_OVERLAP_PAGES}"
    "INKWISE_SEGMENT_TEXT_CHUNK_CHARS=${INKWISE_SEGMENT_TEXT_CHUNK_CHARS}"
    "CLOUD_TASKS_PROJECT=${PROJECT_ID}"
    "CLOUD_TASKS_LOCATION=${REGION}"
    "CLOUD_TASKS_QUEUE_INGEST=${queue_name}"
    "CLOUD_TASKS_SERVICE_URL=${api_url}"
    "INKWISE_INLINE_INGEST_FALLBACK_ENABLED=false"
    "INKWISE_TASKS_QUEUE=${queue_name}"
    "INKWISE_TASKS_SERVICE_URL=${api_url}"
  )

  local IFS='@'
  env_vars="${env_delim}${env_items[*]}"

  gcloud run services update "$service_name" \
    --region="$REGION" \
    --image="$image_url" \
    --timeout="${API_TIMEOUT}" \
    --update-env-vars="$env_vars" \
    --update-secrets="INKWISE_TASKS_TOKEN=${token_secret_name}:latest,TASKS_TOKEN=${token_secret_name}:latest" \
    >/dev/null

  ok "Updated ${service_name} with Inkwise runtime configuration"
}

deploy_web() {
  local service_name="$1"
  local image_url="$2"

  gcloud run services update "$service_name" \
    --region="$REGION" \
    --image="$image_url" \
    >/dev/null

  ok "Updated ${service_name} with the latest frontend image"
}

run_migrations() {
  local image_url="$1"
  local job_name="$2"

  local common_args=(
    --image="$image_url"
    --region="$REGION"
    --service-account="$SERVICE_ACCOUNT"
    --set-cloudsql-instances="$CLOUD_SQL_INSTANCE"
    --vpc-connector="$VPC_CONNECTOR"
    --vpc-egress=private-ranges-only
    --set-secrets=DATABASE_URL=DATABASE_URL:latest
    --command=alembic
    --args=-c,alembic.ini,upgrade,head
    --tasks=1
    --parallelism=1
    --max-retries=1
    --task-timeout=1200
  )

  if gcloud run jobs describe "$job_name" --region="$REGION" >/dev/null 2>&1; then
    gcloud run jobs update "$job_name" "${common_args[@]}" >/dev/null
  else
    gcloud run jobs create "$job_name" "${common_args[@]}" >/dev/null
  fi

  gcloud run jobs execute "$job_name" --region="$REGION" --wait >/dev/null
  ok "Alembic migrations executed via Cloud Run job ${job_name}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-id)
      PROJECT_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --image-tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --skip-migrate)
      SKIP_MIGRATE=true
      shift
      ;;
    --rotate-task-token)
      ROTATE_TASK_TOKEN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

ARTIFACT_REGISTRY_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-cpaautomation-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-${PROJECT_ID}:${REGION}:cpaautomation-db}"

API_SERVICE="cpa-api"
WEB_SERVICE="cpa-web"
QUEUE_NAME="inkwise-ingest"
TASK_TOKEN_SECRET="INKWISE_TASKS_TOKEN"
MIGRATION_JOB_NAME="cpa-inkwise-migrate"
if [ "$ENVIRONMENT" = "staging" ]; then
  API_SERVICE="cpa-api-staging"
  WEB_SERVICE="cpa-web-staging"
  QUEUE_NAME="inkwise-ingest-staging"
  TASK_TOKEN_SECRET="INKWISE_TASKS_TOKEN_STAGING"
  MIGRATION_JOB_NAME="cpa-inkwise-migrate-staging"
fi

BACKEND_IMAGE="${ARTIFACT_REGISTRY_URL}/backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${ARTIFACT_REGISTRY_URL}/frontend:${IMAGE_TAG}"

section "Checking prerequisites"
command_exists gcloud || die "gcloud CLI not found"
command_exists docker || die "docker not found"
command_exists openssl || die "openssl not found"

if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
  die "Not logged into gcloud. Run 'gcloud auth login' first."
fi

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudtasks.googleapis.com secretmanager.googleapis.com >/dev/null
ok "Using project ${PROJECT_ID} in ${REGION}"

if [ "$SKIP_BUILD" = false ]; then
  section "Building images"
  printf 'n\n' | "$ROOT_DIR/scripts/build-images.sh" "$IMAGE_TAG"
else
  warn "Skipping image build"
fi

section "Ensuring base services exist"
ensure_base_services "$API_SERVICE" "$WEB_SERVICE"

section "Preparing Inkwise infrastructure"
ensure_secret_value "$TASK_TOKEN_SECRET" "$ROTATE_TASK_TOKEN"
ensure_queue "$QUEUE_NAME"

API_URL="$(gcloud run services describe "$API_SERVICE" --region="$REGION" --format='value(status.url)')"
WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --region="$REGION" --format='value(status.url)')"
ok "API URL: ${API_URL}"
ok "Web URL: ${WEB_URL}"

section "Deploying Inkwise-enabled services"
deploy_api "$API_SERVICE" "$BACKEND_IMAGE" "$API_URL" "$QUEUE_NAME" "$TASK_TOKEN_SECRET"
deploy_web "$WEB_SERVICE" "$FRONTEND_IMAGE"

if [ "$SKIP_MIGRATE" = false ]; then
  section "Running Inkwise migrations"
  run_migrations "$BACKEND_IMAGE" "$MIGRATION_JOB_NAME"
else
  warn "Skipping Alembic migrations"
fi

section "Deployment complete"
ok "Inkwise is deployed into CPAAutomation."
echo -e "${BLUE}Next checks:${NC}"
echo -e "- API docs: ${API_URL}/api/docs"
echo -e "- Inkwise UI: ${WEB_URL}/dashboard/inkwise"
echo -e "- Queue: ${QUEUE_NAME}"
echo -e "- Migration job: ${MIGRATION_JOB_NAME}"
