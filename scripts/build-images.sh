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

# Get git hash from parameter or generate. The optional target flags let the
# deployment entry points avoid building an image they will not deploy.
GIT_HASH=""
BUILD_TARGET="all"

usage() {
    echo "Usage: $0 [IMAGE_TAG] [--frontend-only|--backend-only]"
}

set_target() {
    if [ "$BUILD_TARGET" != "all" ] && [ "$BUILD_TARGET" != "$1" ]; then
        echo -e "${RED}Cannot combine frontend-only and backend-only options${NC}"
        exit 1
    fi
    BUILD_TARGET="$1"
}

if [[ "${1:-}" != "" && "${1:-}" != -* ]]; then
    GIT_HASH="$1"
    shift
fi

while [[ $# -gt 0 ]]; do
    case "$1" in
        --frontend-only)
            set_target "frontend"
            shift
            ;;
        --backend-only)
            set_target "backend"
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

if [ -z "$GIT_HASH" ]; then
    GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || true)
fi

if [ -z "$GIT_HASH" ]; then
    echo -e "${RED}❌ No git hash provided and not in a git repository${NC}"
    exit 1
fi

echo -e "${BLUE}🏗️  Building CPAAutomation Docker images...${NC}"
echo -e "${BLUE}Git Hash: ${GIT_HASH}${NC}"
echo -e "${BLUE}Registry: ${ARTIFACT_REGISTRY_URL}${NC}"
echo -e "${BLUE}Target: ${BUILD_TARGET}${NC}"
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

if [ "$BUILD_TARGET" = "all" ] || [ "$BUILD_TARGET" = "backend" ]; then
    # Build backend image (API + Workers)
    echo -e "${BLUE}=== Building Backend (API + Workers) ===${NC}"
    build_and_push "backend" "backend/Dockerfile" "." ""
fi

if [ "$BUILD_TARGET" = "all" ] || [ "$BUILD_TARGET" = "frontend" ]; then
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
    if [ -n "$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" ]; then
        FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
    fi
    if [ -n "$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID" ]; then
        FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"
    fi
    if [ -n "$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" ]; then
        FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
    fi
    if [ -n "$NEXT_PUBLIC_API_URL" ]; then
        FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL"
    fi
    if [ -n "$NEXT_PUBLIC_GOOGLE_CLIENT_ID" ]; then
        FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID"
    fi
    if [ -n "$NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER" ]; then
        FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER=$NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER"
    fi
    if [ -n "$NEXT_PUBLIC_ACCOUNTINGCLAW_IMAGE" ]; then
        FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_ACCOUNTINGCLAW_IMAGE=$NEXT_PUBLIC_ACCOUNTINGCLAW_IMAGE"
    fi
    if [ -n "$NEXT_PUBLIC_LEGALCLAW_IMAGE" ]; then
        FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_LEGALCLAW_IMAGE=$NEXT_PUBLIC_LEGALCLAW_IMAGE"
    fi
    FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_TASKLYTIC_BACKEND=${NEXT_PUBLIC_TASKLYTIC_BACKEND:-1}"
    FRONTEND_BUILD_ARGS="$FRONTEND_BUILD_ARGS --build-arg NEXT_PUBLIC_FILE_STORAGE_ADAPTER=${NEXT_PUBLIC_FILE_STORAGE_ADAPTER:-object_store}"

    echo -e "${BLUE}Build args: ${FRONTEND_BUILD_ARGS}${NC}"
    build_and_push "frontend" "Dockerfile" "." "$FRONTEND_BUILD_ARGS"
fi

# Build summary
echo -e "${GREEN}🎉 ${BUILD_TARGET} image build completed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Built images:${NC}"
if [ "$BUILD_TARGET" = "all" ] || [ "$BUILD_TARGET" = "backend" ]; then
    echo -e "• Backend (API + Workers): ${ARTIFACT_REGISTRY_URL}/backend:${GIT_HASH}"
fi
if [ "$BUILD_TARGET" = "all" ] || [ "$BUILD_TARGET" = "frontend" ]; then
    echo -e "• Frontend: ${ARTIFACT_REGISTRY_URL}/frontend:${GIT_HASH}"
fi
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
TARGET_ARG=""
if [ "$BUILD_TARGET" = "frontend" ]; then
    TARGET_ARG=" --frontend-only"
elif [ "$BUILD_TARGET" = "backend" ]; then
    TARGET_ARG=" --backend-only"
fi
echo -e "1. Deploy services using: ./scripts/deploy-services.sh --image-tag ${GIT_HASH} --skip-build${TARGET_ARG}"
echo -e "2. Or deploy existing images: ./scripts/deploy.sh --deploy-only${TARGET_ARG}"
echo ""

echo -e "${GREEN}✨ Image building complete!${NC}"
