#!/bin/bash
# CPAAutomation Main Deployment Script
# Deploys the complete application to Google Cloud Run

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="ace-rider-383100"
REGION="us-central1"
ARTIFACT_REGISTRY_REPO="cpa-docker"
ARTIFACT_REGISTRY_URL="us-central1-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --build-only     Build and push images without deploying"
    echo "  --deploy-only    Deploy existing images without rebuilding"
    echo "  --skip-build     Alias for --deploy-only"
    echo "  --skip-deploy    Alias for --build-only"
    echo "  --skip-migrate   Skip the database migration job"
    echo "  --staging        Use the staging environment"
    echo "  -h, --help       Show this help message"
}

set_mode() {
    if [ "$MODE" != "both" ] && [ "$MODE" != "$1" ]; then
        echo -e "${RED}Cannot combine build-only and deploy-only options${NC}"
        exit 1
    fi
    MODE="$1"
}

# Parse arguments before checking prerequisites so --help is always available.
MODE="both"
ENVIRONMENT="production"
SKIP_MIGRATE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --build-only|--skip-deploy)
            set_mode "build"
            shift
            ;;
        --deploy-only|--skip-build)
            set_mode "deploy"
            shift
            ;;
        --staging)
            ENVIRONMENT="staging"
            shift
            ;;
        --skip-migrate)
            SKIP_MIGRATE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

RUN_BUILD=false
RUN_DEPLOY=false
if [ "$MODE" = "both" ] || [ "$MODE" = "build" ]; then
    RUN_BUILD=true
fi
if [ "$MODE" = "both" ] || [ "$MODE" = "deploy" ]; then
    RUN_DEPLOY=true
fi

# Get git commit hash for image tagging
GIT_HASH=$(git rev-parse --short HEAD)
if [ -z "$GIT_HASH" ]; then
    echo -e "${RED}Error: Not in a git repository or no commits found${NC}"
    exit 1
fi

echo -e "${BLUE}🚀 CPAAutomation Deployment Script${NC}"
echo -e "${BLUE}Project: ${PROJECT_ID}${NC}"
echo -e "${BLUE}Region: ${REGION}${NC}"
echo -e "${BLUE}Git Hash: ${GIT_HASH}${NC}"
echo -e "${BLUE}Mode: ${MODE}${NC}"
echo ""

# Function to print section headers
print_section() {
    echo -e "${YELLOW}===================================================${NC}"
    echo -e "${YELLOW}$1${NC}"
    echo -e "${YELLOW}===================================================${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_section "Checking Prerequisites"

if ! command_exists gcloud; then
    echo -e "${RED}Error: gcloud CLI not found. Please install Google Cloud SDK.${NC}"
    exit 1
fi

if [ "$RUN_BUILD" = true ] && ! command_exists docker; then
    echo -e "${RED}Error: Docker not found. Please install Docker.${NC}"
    exit 1
fi

# Check if logged into gcloud
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${RED}Error: Not logged into gcloud. Run 'gcloud auth login' first.${NC}"
    exit 1
fi

# Set project
echo -e "${GREEN}✓ Setting project to ${PROJECT_ID}${NC}"
gcloud config set project $PROJECT_ID

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

echo -e "${BLUE}Deployment mode: ${ENVIRONMENT}${NC}"
echo ""

# NOTE: One-time foundational infrastructure (Cloud SQL, VPC connector, runner
# service account + IAM, GCS bucket, Artifact Registry repo) is NOT provisioned
# here. It rarely changes and is bootstrapped separately for new environments
# via ./scripts/setup-infrastructure.sh. Routine deploys assume it already exists.

# Build images
if [ "$RUN_BUILD" = true ]; then
    print_section "Building Images"
    ./scripts/build-images.sh "$GIT_HASH"
else
    echo -e "${YELLOW}⏭️  Skipping image build${NC}"
fi

# Deploy task services before API/frontend so new task types are available before
# cpa-api starts enqueueing them.
# Together these two steps replace the previous manual sequence of running
# `./scripts/deploy-services.sh && ./scripts/deploy-cloud-run-tasks.sh`.
if [ "$RUN_BUILD" = true ] && [ "$RUN_DEPLOY" = false ]; then
    print_section "Building Cloud Run Task Images"
    ./scripts/deploy-cloud-run-tasks.sh "$GIT_HASH" "$ENVIRONMENT" --skip-deploy
fi

if [ "$RUN_DEPLOY" = true ]; then
    print_section "Deploying Cloud Run Task Services"
    if [ "$RUN_BUILD" = true ]; then
        ./scripts/deploy-cloud-run-tasks.sh "$GIT_HASH" "$ENVIRONMENT"
    else
        ./scripts/deploy-cloud-run-tasks.sh "$GIT_HASH" "$ENVIRONMENT" --skip-build
    fi

    print_section "Deploying Services (API + Frontend)"
    # Images were already built above (or intentionally skipped), so tell
    # deploy-services.sh to reuse them rather than rebuild.
    DEPLOY_SERVICE_ARGS=(--image-tag "$GIT_HASH" --environment "$ENVIRONMENT" --skip-build)
    if [ "$SKIP_MIGRATE" = true ]; then
        DEPLOY_SERVICE_ARGS+=(--skip-migrate)
    fi
    ./scripts/deploy-services.sh "${DEPLOY_SERVICE_ARGS[@]}"
else
    echo -e "${YELLOW}⏭️  Skipping service deployment${NC}"
fi

if [ "$RUN_DEPLOY" = false ]; then
    print_section "Image Build Complete!"
    echo -e "${GREEN}✅ All images were built and pushed successfully!${NC}"
    if [ "$ENVIRONMENT" = "staging" ]; then
        echo -e "${YELLOW}Deploy them with: ./scripts/deploy.sh --deploy-only --staging${NC}"
    else
        echo -e "${YELLOW}Deploy them with: ./scripts/deploy.sh --deploy-only${NC}"
    fi
    exit 0
fi

print_section "Deployment Complete!"
echo -e "${GREEN}✅ CPAAutomation has been deployed successfully!${NC}"
echo ""
echo -e "${BLUE}🌐 Frontend: https://cpaautomation.ai${NC}"
echo -e "${BLUE}🔧 API: https://api.cpaautomation.ai${NC}"
echo -e "${BLUE}⚙️  Task services: task-extract, task-io, task-automation, task-maintenance${NC}"
echo -e "${BLUE}📊 Monitoring: https://console.cloud.google.com/run?project=${PROJECT_ID}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Configure DNS records (see DEPLOYMENT_PLAN.md)"
echo -e "2. Test all functionality"
echo -e "3. Set up monitoring alerts"
echo -e "4. Configure backups"
echo ""
