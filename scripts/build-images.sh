#!/bin/bash
# CPAAutomation Image Building Script
# Builds and pushes Docker images to Artifact Registry

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
ARTIFACT_REGISTRY_REPO="cpa-docker"
ARTIFACT_REGISTRY_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}"

# Get git hash from parameter or generate
GIT_HASH=${1:-$(git rev-parse --short HEAD)}

if [ -z "$GIT_HASH" ]; then
    echo -e "${RED}❌ No git hash provided and not in a git repository${NC}"
    exit 1
fi

echo -e "${BLUE}🏗️  Building CPAAutomation Docker images...${NC}"
echo -e "${BLUE}Git Hash: ${GIT_HASH}${NC}"
echo -e "${BLUE}Registry: ${ARTIFACT_REGISTRY_URL}${NC}"
echo ""

# Function to build and push image
build_and_push() {
    local service_name=$1
    local dockerfile_path=$2
    local context_path=$3
    local image_tag="${ARTIFACT_REGISTRY_URL}/${service_name}:${GIT_HASH}"
    local latest_tag="${ARTIFACT_REGISTRY_URL}/${service_name}:latest"
    
    echo -e "${YELLOW}🔨 Building ${service_name}...${NC}"
    echo -e "${BLUE}Context: ${context_path}${NC}"
    echo -e "${BLUE}Dockerfile: ${dockerfile_path}${NC}"
    echo -e "${BLUE}Tag: ${image_tag}${NC}"
    
    # Build the image
    docker build \
        -f "${dockerfile_path}" \
        -t "${image_tag}" \
        -t "${latest_tag}" \
        "${context_path}"
    
    echo -e "${YELLOW}📤 Pushing ${service_name}...${NC}"
    
    # Push both tags
    docker push "${image_tag}"
    docker push "${latest_tag}"
    
    echo -e "${GREEN}✅ ${service_name} built and pushed successfully${NC}"
    echo ""
}

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Authenticate Docker with Artifact Registry
echo -e "${YELLOW}🔐 Authenticating Docker with Artifact Registry...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
echo -e "${GREEN}✅ Docker authentication complete${NC}"
echo ""

# Build backend image (API + Workers)
echo -e "${BLUE}=== Building Backend (API + Workers) ===${NC}"
build_and_push "backend" "backend/Dockerfile" "backend"

# Build frontend image
echo -e "${BLUE}=== Building Frontend ===${NC}"
build_and_push "frontend" "Dockerfile" "."

# Build summary
echo -e "${GREEN}🎉 All images built and pushed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Built images:${NC}"
echo -e "• Backend (API + Workers): ${ARTIFACT_REGISTRY_URL}/backend:${GIT_HASH}"
echo -e "• Frontend: ${ARTIFACT_REGISTRY_URL}/frontend:${GIT_HASH}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "1. Deploy services using: ./scripts/deploy-services.sh ${GIT_HASH}"
echo -e "2. Or run full deployment: ./scripts/deploy.sh --skip-infra --skip-build"
echo ""

# Optional: Clean up local images to save space
echo -e "${BLUE}🧹 Clean up local images? (y/N):${NC}"
read -r cleanup
if [[ $cleanup =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cleaning up local images...${NC}"
    docker rmi "${ARTIFACT_REGISTRY_URL}/backend:${GIT_HASH}" "${ARTIFACT_REGISTRY_URL}/backend:latest" || true
    docker rmi "${ARTIFACT_REGISTRY_URL}/frontend:${GIT_HASH}" "${ARTIFACT_REGISTRY_URL}/frontend:latest" || true
    echo -e "${GREEN}✅ Local images cleaned up${NC}"
fi

echo -e "${GREEN}✨ Image building complete!${NC}"