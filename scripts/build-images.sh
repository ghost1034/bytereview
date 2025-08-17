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
    local build_args=$4
    local image_tag="${ARTIFACT_REGISTRY_URL}/${service_name}:${GIT_HASH}"
    local latest_tag="${ARTIFACT_REGISTRY_URL}/${service_name}:latest"
    
    echo -e "${YELLOW}🔨 Building ${service_name}...${NC}"
    echo -e "${BLUE}Context: ${context_path}${NC}"
    echo -e "${BLUE}Dockerfile: ${dockerfile_path}${NC}"
    echo -e "${BLUE}Tag: ${image_tag}${NC}"
    
    # Build the image for AMD64 (Cloud Run compatible)
    docker buildx build \
        --platform linux/amd64 \
        -f "${dockerfile_path}" \
        -t "${image_tag}" \
        -t "${latest_tag}" \
        ${build_args} \
        --push \
        "${context_path}"
    
    echo -e "${GREEN}✅ ${service_name} built and pushed successfully${NC}"
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

# Authenticate Docker with Artifact Registry
echo -e "${YELLOW}🔐 Authenticating Docker with Artifact Registry...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
echo -e "${GREEN}✅ Docker authentication complete${NC}"
echo ""

# Build backend image (API + Workers)
echo -e "${BLUE}=== Building Backend (API + Workers) ===${NC}"
build_and_push "backend" "backend/Dockerfile" "backend" ""

# Build frontend image with environment variables
echo -e "${BLUE}=== Building Frontend ===${NC}"

# Load environment variables from .env.local for build args
if [ -f ".env.local" ]; then
    echo -e "${BLUE}Loading environment variables from .env.local...${NC}"
    export $(grep -v '^#' .env.local | grep 'NEXT_PUBLIC_' | xargs)
fi

# Prepare build args for frontend
FRONTEND_BUILD_ARGS=""
if [ -n "$NEXT_PUBLIC_FIREBASE_API_KEY" ]; then
    FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY"
fi
if [ -n "$NEXT_PUBLIC_FIREBASE_PROJECT_ID" ]; then
    FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID"
fi
if [ -n "$NEXT_PUBLIC_FIREBASE_APP_ID" ]; then
    FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID"
fi
if [ -n "$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" ]; then
    FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
fi
if [ -n "$NEXT_PUBLIC_GOOGLE_CLIENT_ID" ]; then
    FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID"
fi

echo -e "${BLUE}Build args: ${FRONTEND_BUILD_ARGS}${NC}"
build_and_push "frontend" "Dockerfile" "." "$FRONTEND_BUILD_ARGS"

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

# Optional: Clean up buildx cache to save space
echo -e "${BLUE}🧹 Clean up buildx cache? (y/N):${NC}"
read -r cleanup
if [[ $cleanup =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cleaning up buildx cache...${NC}"
    docker buildx prune -f || true
    echo -e "${GREEN}✅ Buildx cache cleaned up${NC}"
fi

echo -e "${GREEN}✨ Image building complete!${NC}"