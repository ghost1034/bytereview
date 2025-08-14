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

if ! command_exists docker; then
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

# Parse command line arguments
SKIP_INFRA=false
SKIP_BUILD=false
SKIP_DEPLOY=false
ENVIRONMENT="production"

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-infra)
            SKIP_INFRA=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-deploy)
            SKIP_DEPLOY=true
            shift
            ;;
        --staging)
            ENVIRONMENT="staging"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --skip-infra    Skip infrastructure setup"
            echo "  --skip-build    Skip building images"
            echo "  --skip-deploy   Skip deploying services"
            echo "  --staging       Deploy to staging environment"
            echo "  -h, --help      Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}Deployment mode: ${ENVIRONMENT}${NC}"
echo ""

# Infrastructure setup
if [ "$SKIP_INFRA" = false ]; then
    print_section "Setting Up Infrastructure"
    ./scripts/setup-infrastructure.sh
else
    echo -e "${YELLOW}⏭️  Skipping infrastructure setup${NC}"
fi

# Build images
if [ "$SKIP_BUILD" = false ]; then
    print_section "Building Images"
    ./scripts/build-images.sh $GIT_HASH
else
    echo -e "${YELLOW}⏭️  Skipping image build${NC}"
fi

# Deploy services
if [ "$SKIP_DEPLOY" = false ]; then
    print_section "Deploying Services"
    ./scripts/deploy-services.sh $GIT_HASH $ENVIRONMENT
else
    echo -e "${YELLOW}⏭️  Skipping service deployment${NC}"
fi

print_section "Deployment Complete!"
echo -e "${GREEN}✅ CPAAutomation has been deployed successfully!${NC}"
echo ""
echo -e "${BLUE}🌐 Frontend: https://cpaautomation.ai${NC}"
echo -e "${BLUE}🔧 API: https://api.cpaautomation.ai${NC}"
echo -e "${BLUE}📊 Monitoring: https://console.cloud.google.com/run?project=${PROJECT_ID}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Configure DNS records (see DEPLOYMENT_PLAN.md)"
echo -e "2. Test all functionality"
echo -e "3. Set up monitoring alerts"
echo -e "4. Configure backups"
echo ""