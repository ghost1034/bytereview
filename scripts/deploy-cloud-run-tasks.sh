#!/bin/bash
# CPAAutomation Cloud Run Tasks Deployment Script
# Replaces ARQ workers with Cloud Run Tasks and Cloud Scheduler

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID="ace-rider-383100"
REGION="us-central1"
ARTIFACT_REGISTRY_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/cpa-docker"
SERVICE_ACCOUNT="cpaautomation-runner@${PROJECT_ID}.iam.gserviceaccount.com"
VPC_CONNECTOR="cpa-svpc"
CLOUD_SQL_INSTANCE="${PROJECT_ID}:${REGION}:cpaautomation-db"
TASK_EXTRACT_MAX_CONCURRENT_DISPATCHES=${TASK_EXTRACT_MAX_CONCURRENT_DISPATCHES:-20}
TASK_EXTRACT_MAX_DISPATCHES_PER_SECOND=${TASK_EXTRACT_MAX_DISPATCHES_PER_SECOND:-10}
# Cloud Tasks caps HTTP dispatch deadlines at 1800s. The Cloud Run request timeout
# must not exceed it, or a task that outlives the deadline is retried while the
# original is still running.
TASK_EXTRACT_DISPATCH_DEADLINE_SECONDS=${TASK_EXTRACT_DISPATCH_DEADLINE_SECONDS:-1800}
EXTRACTION_ENQUEUE_BATCH_SIZE=${EXTRACTION_ENQUEUE_BATCH_SIZE:-5}
EXTRACTION_ENQUEUE_BATCH_DELAY_SECONDS=${EXTRACTION_ENQUEUE_BATCH_DELAY_SECONDS:-15}
EXTRACTION_ENQUEUE_MAX_DELAY_SECONDS=${EXTRACTION_ENQUEUE_MAX_DELAY_SECONDS:-900}
EXTRACTION_ENQUEUE_JITTER_SECONDS=${EXTRACTION_ENQUEUE_JITTER_SECONDS:-5}
FORM_FILL_OUTPUT_ENQUEUE_BATCH_SIZE=${FORM_FILL_OUTPUT_ENQUEUE_BATCH_SIZE:-5}
FORM_FILL_OUTPUT_ENQUEUE_BATCH_DELAY_SECONDS=${FORM_FILL_OUTPUT_ENQUEUE_BATCH_DELAY_SECONDS:-15}
FORM_FILL_OUTPUT_ENQUEUE_MAX_DELAY_SECONDS=${FORM_FILL_OUTPUT_ENQUEUE_MAX_DELAY_SECONDS:-900}
FORM_FILL_OUTPUT_ENQUEUE_JITTER_SECONDS=${FORM_FILL_OUTPUT_ENQUEUE_JITTER_SECONDS:-5}
INKWISE_DERIVED_BUCKET=${INKWISE_DERIVED_BUCKET:-cpaautomation-files-prod}
INKWISE_MAX_UPLOAD_MB=${INKWISE_MAX_UPLOAD_MB:-100}
INKWISE_MAX_VIDEO_UPLOAD_MB=${INKWISE_MAX_VIDEO_UPLOAD_MB:-1000}
INKWISE_MAX_BOUND_SOURCES=${INKWISE_MAX_BOUND_SOURCES:-100}
INKWISE_GEMINI_MODEL=${INKWISE_GEMINI_MODEL:-gemini-3-flash-preview}
INKWISE_REFERENCE_METADATA_MODEL=${INKWISE_REFERENCE_METADATA_MODEL:-$INKWISE_GEMINI_MODEL}
INKWISE_REFERENCE_METADATA_AUTOFILL_ENABLED=${INKWISE_REFERENCE_METADATA_AUTOFILL_ENABLED:-true}
INKWISE_REFERENCE_METADATA_MAX_TEXT_CHARS=${INKWISE_REFERENCE_METADATA_MAX_TEXT_CHARS:-12000}
INKWISE_EMBEDDING_MODEL=${INKWISE_EMBEDDING_MODEL:-gemini-embedding-2-preview}
INKWISE_EMBEDDING_LOCATION=${INKWISE_EMBEDDING_LOCATION:-us-central1}
INKWISE_EMBEDDING_DIMENSION=${INKWISE_EMBEDDING_DIMENSION:-1536}
INKWISE_EMBEDDING_QUERY_TASK_TYPE=${INKWISE_EMBEDDING_QUERY_TASK_TYPE:-RETRIEVAL_QUERY}
INKWISE_EMBEDDING_DOCUMENT_TASK_TYPE=${INKWISE_EMBEDDING_DOCUMENT_TASK_TYPE:-RETRIEVAL_DOCUMENT}
INKWISE_OCR_ENABLED=${INKWISE_OCR_ENABLED:-true}
INKWISE_OCR_LANGUAGES=${INKWISE_OCR_LANGUAGES:-eng}
INKWISE_OCR_TIMEOUT_SECONDS=${INKWISE_OCR_TIMEOUT_SECONDS:-900}
INKWISE_OCR_FORCE=${INKWISE_OCR_FORCE:-false}
INKWISE_OCR_MIN_CHARS_PER_PAGE=${INKWISE_OCR_MIN_CHARS_PER_PAGE:-80}
INKWISE_OCR_EMPTY_PAGE_RATIO_THRESHOLD=${INKWISE_OCR_EMPTY_PAGE_RATIO_THRESHOLD:-0.2}
INKWISE_OCR_MIN_USABLE_PAGE_RATIO=${INKWISE_OCR_MIN_USABLE_PAGE_RATIO:-0.7}
INKWISE_SEGMENT_PDF_WINDOW_PAGES=${INKWISE_SEGMENT_PDF_WINDOW_PAGES:-4}
INKWISE_SEGMENT_PDF_WINDOW_OVERLAP_PAGES=${INKWISE_SEGMENT_PDF_WINDOW_OVERLAP_PAGES:-1}
INKWISE_SEGMENT_TEXT_CHUNK_CHARS=${INKWISE_SEGMENT_TEXT_CHUNK_CHARS:-3000}
INKWISE_AUDIO_CHUNK_SECONDS=${INKWISE_AUDIO_CHUNK_SECONDS:-60}
INKWISE_VIDEO_CHUNK_SECONDS=${INKWISE_VIDEO_CHUNK_SECONDS:-60}
INKWISE_MEDIA_CHUNK_OVERLAP_SECONDS=${INKWISE_MEDIA_CHUNK_OVERLAP_SECONDS:-2}
INKWISE_MEDIA_MAX_CLIPS_PER_SOURCE=${INKWISE_MEDIA_MAX_CLIPS_PER_SOURCE:-256}

# Get parameters
GIT_HASH=${1:-latest}
ENVIRONMENT=${2:-production}

echo -e "${BLUE}🚀 Deploying CPAAutomation Cloud Run Tasks...${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Image tag: ${GIT_HASH}${NC}"
echo -e "${BLUE}Project: ${PROJECT_ID}${NC}"
echo ""

# Function to build and push task service image
build_and_push_task_image() {
    local service_name=$1
    local dockerfile_name=$2
    
    echo -e "${YELLOW}🔨 Building ${service_name} image...${NC}"
    
    local image_name="task-${service_name}"
    local image_tag="${ARTIFACT_REGISTRY_URL}/${image_name}:${GIT_HASH}"
    local latest_tag="${ARTIFACT_REGISTRY_URL}/${image_name}:latest"
    local dockerfile_path="backend/task_services/${dockerfile_name}"
    
    echo -e "${BLUE}Context: ./backend/${NC}"
    echo -e "${BLUE}Dockerfile: ${dockerfile_path}${NC}"
    echo -e "${BLUE}Tag: ${image_tag}${NC}"
    
    # Build and push using buildx (same as build-images.sh)
    docker buildx build \
        --platform linux/amd64 \
        -f "${dockerfile_path}" \
        -t "${image_tag}" \
        -t "${latest_tag}" \
        --push \
        "./backend/"
    
    echo -e "${GREEN}✅ ${service_name} built and pushed successfully${NC}"
    echo ""
}

# Function to deploy Cloud Run service
deploy_service() {
    local service_name=$1
    local image_name=$2
    local port=$3
    local memory=$4
    local cpu=$5
    local min_instances=$6
    local max_instances=$7
    local concurrency=$8
    local timeout=$9
    local allow_unauthenticated=${10}
    local additional_args=${11}
    
    local full_service_name="${service_name}"
    if [ "$ENVIRONMENT" = "staging" ]; then
        full_service_name="${service_name}-staging"
    fi
    
    local image_url="${ARTIFACT_REGISTRY_URL}/${image_name}:${GIT_HASH}"
    
    echo -e "${YELLOW}🔄 Deploying ${full_service_name}...${NC}"
    echo -e "${BLUE}Image: ${image_url}${NC}"
    
    local auth_flag="--no-allow-unauthenticated"
    if [ "$allow_unauthenticated" = "true" ]; then
        auth_flag="--allow-unauthenticated"
    fi
    
    gcloud run deploy $full_service_name \
        --image=$image_url \
        --region=$REGION \
        --platform=managed \
        $auth_flag \
        --memory=$memory \
        --cpu=$cpu \
        --min-instances=$min_instances \
        --max-instances=$max_instances \
        --concurrency=$concurrency \
        --timeout=$timeout \
        --port=$port \
        $additional_args
    
    echo -e "${GREEN}✅ ${full_service_name} deployed successfully${NC}"
    
    # Get service URL
    local service_url=$(gcloud run services describe $full_service_name --region=$REGION --format="value(status.url)")
    echo -e "${BLUE}🌐 Service URL: ${service_url}${NC}"
    echo ""
}

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Set up Docker Buildx for multi-platform builds
echo -e "${YELLOW}🔧 Setting up Docker Buildx for multi-platform builds...${NC}"
docker buildx create --use --name cpa-builder --driver docker-container || true
docker buildx inspect --bootstrap
echo -e "${GREEN}✅ Docker Buildx setup complete${NC}"

echo -e "${YELLOW}🔐 Authenticating Docker with Artifact Registry...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
echo -e "${GREEN}✅ Docker authentication complete${NC}"
echo ""

# Build task service images
echo -e "${BLUE}=== Building Task Service Images ===${NC}"

build_and_push_task_image "extract" "Dockerfile.extract"
build_and_push_task_image "io" "Dockerfile.io" 
build_and_push_task_image "automation" "Dockerfile.automation"
build_and_push_task_image "maintenance" "Dockerfile.maintenance"

# Deploy task services
echo -e "${BLUE}=== Deploying Task Services ===${NC}"

# Deploy Extract Task Service
echo -e "${BLUE}=== Deploying Extract Task Service ===${NC}"
deploy_service \
    "task-extract" \
    "task-extract" \
    "8080" \
    "3Gi" \
    "2" \
    "0" \
    "20" \
    "1" \
    "$TASK_EXTRACT_DISPATCH_DEADLINE_SECONDS" \
    "false" \
    "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE \
     --vpc-connector=$VPC_CONNECTOR \
     --vpc-egress=private-ranges-only \
     --service-account=$SERVICE_ACCOUNT \
     --no-cpu-throttling \
     --set-secrets=DATABASE_URL=DATABASE_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
     --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=global,GCS_BUCKET_NAME=cpaautomation-files-prod,GCS_TEMP_FOLDER=temp_uploads,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,CLOUD_RUN_REGION=$REGION,TASK_EXTRACT_DISPATCH_DEADLINE_SECONDS=$TASK_EXTRACT_DISPATCH_DEADLINE_SECONDS,TASK_EXTRACT_MAX_ATTEMPTS=3,TASK_EXTRACT_MIN_BACKOFF_SECONDS=30,TASK_EXTRACT_MAX_BACKOFF_SECONDS=300,TASK_EXTRACT_MAX_RETRY_DURATION_SECONDS=7200,TASK_EXTRACT_MAX_CONCURRENT_DISPATCHES=$TASK_EXTRACT_MAX_CONCURRENT_DISPATCHES,TASK_EXTRACT_MAX_DISPATCHES_PER_SECOND=$TASK_EXTRACT_MAX_DISPATCHES_PER_SECOND,FORM_FILL_OUTPUT_ENQUEUE_BATCH_SIZE=$FORM_FILL_OUTPUT_ENQUEUE_BATCH_SIZE,FORM_FILL_OUTPUT_ENQUEUE_BATCH_DELAY_SECONDS=$FORM_FILL_OUTPUT_ENQUEUE_BATCH_DELAY_SECONDS,FORM_FILL_OUTPUT_ENQUEUE_MAX_DELAY_SECONDS=$FORM_FILL_OUTPUT_ENQUEUE_MAX_DELAY_SECONDS,FORM_FILL_OUTPUT_ENQUEUE_JITTER_SECONDS=$FORM_FILL_OUTPUT_ENQUEUE_JITTER_SECONDS,INKWISE_ENABLED=true,INKWISE_DERIVED_BUCKET=$INKWISE_DERIVED_BUCKET,INKWISE_MAX_UPLOAD_MB=$INKWISE_MAX_UPLOAD_MB,INKWISE_MAX_VIDEO_UPLOAD_MB=$INKWISE_MAX_VIDEO_UPLOAD_MB,INKWISE_MAX_BOUND_SOURCES=$INKWISE_MAX_BOUND_SOURCES,INKWISE_GEMINI_MODEL=$INKWISE_GEMINI_MODEL,INKWISE_REFERENCE_METADATA_MODEL=$INKWISE_REFERENCE_METADATA_MODEL,INKWISE_REFERENCE_METADATA_AUTOFILL_ENABLED=$INKWISE_REFERENCE_METADATA_AUTOFILL_ENABLED,INKWISE_REFERENCE_METADATA_MAX_TEXT_CHARS=$INKWISE_REFERENCE_METADATA_MAX_TEXT_CHARS,INKWISE_EMBEDDING_MODEL=$INKWISE_EMBEDDING_MODEL,INKWISE_EMBEDDING_LOCATION=$INKWISE_EMBEDDING_LOCATION,INKWISE_EMBEDDING_DIMENSION=$INKWISE_EMBEDDING_DIMENSION,INKWISE_EMBEDDING_QUERY_TASK_TYPE=$INKWISE_EMBEDDING_QUERY_TASK_TYPE,INKWISE_EMBEDDING_DOCUMENT_TASK_TYPE=$INKWISE_EMBEDDING_DOCUMENT_TASK_TYPE,INKWISE_OCR_ENABLED=$INKWISE_OCR_ENABLED,INKWISE_OCR_LANGUAGES=$INKWISE_OCR_LANGUAGES,INKWISE_OCR_TIMEOUT_SECONDS=$INKWISE_OCR_TIMEOUT_SECONDS,INKWISE_OCR_FORCE=$INKWISE_OCR_FORCE,INKWISE_OCR_MIN_CHARS_PER_PAGE=$INKWISE_OCR_MIN_CHARS_PER_PAGE,INKWISE_OCR_EMPTY_PAGE_RATIO_THRESHOLD=$INKWISE_OCR_EMPTY_PAGE_RATIO_THRESHOLD,INKWISE_OCR_MIN_USABLE_PAGE_RATIO=$INKWISE_OCR_MIN_USABLE_PAGE_RATIO,INKWISE_SEGMENT_PDF_WINDOW_PAGES=$INKWISE_SEGMENT_PDF_WINDOW_PAGES,INKWISE_SEGMENT_PDF_WINDOW_OVERLAP_PAGES=$INKWISE_SEGMENT_PDF_WINDOW_OVERLAP_PAGES,INKWISE_SEGMENT_TEXT_CHUNK_CHARS=$INKWISE_SEGMENT_TEXT_CHUNK_CHARS,INKWISE_AUDIO_CHUNK_SECONDS=$INKWISE_AUDIO_CHUNK_SECONDS,INKWISE_VIDEO_CHUNK_SECONDS=$INKWISE_VIDEO_CHUNK_SECONDS,INKWISE_MEDIA_CHUNK_OVERLAP_SECONDS=$INKWISE_MEDIA_CHUNK_OVERLAP_SECONDS,INKWISE_MEDIA_MAX_CLIPS_PER_SOURCE=$INKWISE_MEDIA_MAX_CLIPS_PER_SOURCE"

# Deploy I/O Task Service
echo -e "${BLUE}=== Deploying I/O Task Service ===${NC}"
deploy_service \
    "task-io" \
    "task-io" \
    "8080" \
    "1Gi" \
    "1" \
    "0" \
    "5" \
    "1" \
    "1800" \
    "false" \
    "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE \
     --vpc-connector=$VPC_CONNECTOR \
     --vpc-egress=private-ranges-only \
     --service-account=$SERVICE_ACCOUNT \
     --no-cpu-throttling \
     --set-secrets=DATABASE_URL=DATABASE_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_REDIRECT_URI=GOOGLE_REDIRECT_URI:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
     --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GCS_TEMP_FOLDER=temp_uploads,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,CLOUD_RUN_REGION=$REGION"

# Deploy Automation Task Service
echo -e "${BLUE}=== Deploying Automation Task Service ===${NC}"
deploy_service \
    "task-automation" \
    "task-automation" \
    "8080" \
    "1Gi" \
    "1" \
    "0" \
    "10" \
    "1" \
    "1800" \
    "false" \
    "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE \
     --vpc-connector=$VPC_CONNECTOR \
     --vpc-egress=private-ranges-only \
     --service-account=$SERVICE_ACCOUNT \
     --no-cpu-throttling \
     --set-secrets=DATABASE_URL=DATABASE_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_REDIRECT_URI=GOOGLE_REDIRECT_URI:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
     --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GCS_TEMP_FOLDER=temp_uploads,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,CLOUD_RUN_REGION=$REGION,EXTRACTION_ENQUEUE_BATCH_SIZE=$EXTRACTION_ENQUEUE_BATCH_SIZE,EXTRACTION_ENQUEUE_BATCH_DELAY_SECONDS=$EXTRACTION_ENQUEUE_BATCH_DELAY_SECONDS,EXTRACTION_ENQUEUE_MAX_DELAY_SECONDS=$EXTRACTION_ENQUEUE_MAX_DELAY_SECONDS,EXTRACTION_ENQUEUE_JITTER_SECONDS=$EXTRACTION_ENQUEUE_JITTER_SECONDS"

# Deploy Maintenance Task Service
echo -e "${BLUE}=== Deploying Maintenance Task Service ===${NC}"
deploy_service \
    "task-maintenance" \
    "task-maintenance" \
    "8080" \
    "1Gi" \
    "1" \
    "0" \
    "5" \
    "1" \
    "3600" \
    "false" \
    "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE \
     --vpc-connector=$VPC_CONNECTOR \
     --vpc-egress=private-ranges-only \
     --service-account=$SERVICE_ACCOUNT \
     --no-cpu-throttling \
     --set-secrets=DATABASE_URL=DATABASE_URL:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
     --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,CLOUD_RUN_REGION=$REGION"

echo -e "${BLUE}=== Updating Extract Task Queue Dispatch and Retry Policy ===${NC}"
gcloud tasks queues update extract-tasks \
    --location=$REGION \
    --max-concurrent-dispatches=$TASK_EXTRACT_MAX_CONCURRENT_DISPATCHES \
    --max-dispatches-per-second=$TASK_EXTRACT_MAX_DISPATCHES_PER_SECOND \
    --max-attempts=3 \
    --min-backoff=30s \
    --max-backoff=300s \
    --max-retry-duration=7200s
echo -e "${GREEN}✅ extract-tasks dispatch and retry policy updated${NC}"
