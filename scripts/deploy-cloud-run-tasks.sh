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
    "5" \
    "1" \
    "3600" \
    "false" \
    "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE \
     --vpc-connector=$VPC_CONNECTOR \
     --vpc-egress=private-ranges-only \
     --service-account=$SERVICE_ACCOUNT \
     --no-cpu-throttling \
     --set-secrets=DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
     --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GCS_TEMP_FOLDER=temp_uploads,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,CLOUD_RUN_REGION=$REGION"

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
     --set-secrets=DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_REDIRECT_URI=GOOGLE_REDIRECT_URI:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
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
     --set-secrets=DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_REDIRECT_URI=GOOGLE_REDIRECT_URI:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
     --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GCS_TEMP_FOLDER=temp_uploads,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,CLOUD_RUN_REGION=$REGION"

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
     --set-secrets=DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
     --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,CLOUD_RUN_REGION=$REGION"

# # Setup Cloud Tasks queues
# echo -e "${BLUE}=== Setting up Cloud Tasks Queues ===${NC}"
# python3 -c "
# import sys
# sys.path.append('./backend')
# from services.cloud_run_task_service import cloud_run_task_service
# cloud_run_task_service.setup_task_queues()
# print('✅ Cloud Tasks queues set up successfully')
# "

# # Setup Cloud Pub/Sub topics and subscriptions
# echo -e "${BLUE}=== Setting up Cloud Pub/Sub Topics ===${NC}"
# python3 -c "
# import sys
# sys.path.append('./backend')
# from services.cloud_pubsub_service import cloud_pubsub_service
# import asyncio
# asyncio.run(cloud_pubsub_service.setup_topics_and_subscriptions())
# print('✅ Cloud Pub/Sub topics and subscriptions set up successfully')
# "

# # Setup Cloud Scheduler jobs with actual service URLs
# echo -e "${BLUE}=== Setting up Cloud Scheduler Jobs ===${NC}"

# # Get the actual maintenance service URL
# maintenance_url=$(gcloud run services describe task-maintenance --region=$REGION --format="value(status.url)")
# echo -e "${YELLOW}Maintenance service URL: ${maintenance_url}${NC}"

# # Create scheduled jobs with actual URLs
# gcloud scheduler jobs create http cpaautomation-free-user-period-reset \
#     --location=$REGION \
#     --schedule="30 0 * * *" \
#     --uri="${maintenance_url}/execute" \
#     --http-method=POST \
#     --headers="Content-Type=application/json" \
#     --message-body='{"task_type":"run_free_user_period_reset"}' \
#     --oidc-service-account-email="cpaautomation-runner@$PROJECT_ID.iam.gserviceaccount.com" \
#     --time-zone="UTC" \
#     --quiet || echo "Job may already exist"

# gcloud scheduler jobs create http cpaautomation-stripe-usage-reconciliation \
#     --location=$REGION \
#     --schedule="15 */2 * * *" \
#     --uri="${maintenance_url}/execute" \
#     --http-method=POST \
#     --headers="Content-Type=application/json" \
#     --message-body='{"task_type":"run_stripe_usage_reconciliation"}' \
#     --oidc-service-account-email="cpaautomation-runner@$PROJECT_ID.iam.gserviceaccount.com" \
#     --time-zone="UTC" \
#     --quiet || echo "Job may already exist"

# gcloud scheduler jobs create http cpaautomation-usage-counter-cleanup \
#     --location=$REGION \
#     --schedule="0 2 * * 0" \
#     --uri="${maintenance_url}/execute" \
#     --http-method=POST \
#     --headers="Content-Type=application/json" \
#     --message-body='{"task_type":"run_usage_counter_cleanup"}' \
#     --oidc-service-account-email="cpaautomation-runner@$PROJECT_ID.iam.gserviceaccount.com" \
#     --time-zone="UTC" \
#     --quiet || echo "Job may already exist"

# gcloud scheduler jobs create http cpaautomation-abandoned-cleanup \
#     --location=$REGION \
#     --schedule="0 1 * * *" \
#     --uri="${maintenance_url}/execute" \
#     --http-method=POST \
#     --headers="Content-Type=application/json" \
#     --message-body='{"task_type":"run_abandoned_cleanup"}' \
#     --oidc-service-account-email="cpaautomation-runner@$PROJECT_ID.iam.gserviceaccount.com" \
#     --time-zone="UTC" \
#     --quiet || echo "Job may already exist"

# gcloud scheduler jobs create http cpaautomation-artifact-cleanup \
#     --location=$REGION \
#     --schedule="0 3 * * *" \
#     --uri="${maintenance_url}/execute" \
#     --http-method=POST \
#     --headers="Content-Type=application/json" \
#     --message-body='{"task_type":"run_artifact_cleanup"}' \
#     --oidc-service-account-email="cpaautomation-runner@$PROJECT_ID.iam.gserviceaccount.com" \
#     --time-zone="UTC" \
#     --quiet || echo "Job may already exist"

# gcloud scheduler jobs create http cpaautomation-opt-out-cleanup \
#     --location=$REGION \
#     --schedule="0 4 * * 6" \
#     --uri="${maintenance_url}/execute" \
#     --http-method=POST \
#     --headers="Content-Type=application/json" \
#     --message-body='{"task_type":"run_opt_out_cleanup"}' \
#     --oidc-service-account-email="cpaautomation-runner@$PROJECT_ID.iam.gserviceaccount.com" \
#     --time-zone="UTC" \
#     --quiet || echo "Job may already exist"

# gcloud scheduler jobs create http cpaautomation-gmail-watch-renewal \
#     --location=$REGION \
#     --schedule="45 6 * * *" \
#     --uri="${maintenance_url}/execute" \
#     --http-method=POST \
#     --headers="Content-Type=application/json" \
#     --message-body='{"task_type":"run_gmail_watch_renewal"}' \
#     --oidc-service-account-email="cpaautomation-runner@$PROJECT_ID.iam.gserviceaccount.com" \
#     --time-zone="UTC" \
#     --quiet || echo "Job may already exist"

# echo -e "${GREEN}✅ Cloud Scheduler jobs set up successfully with URL: ${maintenance_url}${NC}"

# # Deployment summary
# echo -e "${GREEN}🎉 All Cloud Run Tasks deployed successfully!${NC}"
# echo ""
# echo -e "${BLUE}📋 Deployed services:${NC}"

# if [ "$ENVIRONMENT" = "staging" ]; then
#     echo -e "• Extract Tasks: task-extract-staging"
#     echo -e "• I/O Tasks: task-io-staging"
#     echo -e "• Automation Tasks: task-automation-staging"
#     echo -e "• Maintenance Tasks: task-maintenance-staging"
# else
#     echo -e "• Extract Tasks: task-extract"
#     echo -e "• I/O Tasks: task-io" 
#     echo -e "• Automation Tasks: task-automation"
#     echo -e "• Maintenance Tasks: task-maintenance"
# fi

# echo ""
# echo -e "${YELLOW}📝 Migration complete!${NC}"
# echo -e "1. Cloud Run Tasks replace ARQ workers"
# echo -e "2. Cloud Scheduler replaces ARQ cron jobs"
# echo -e "3. All services scale to zero when not in use"
# echo -e "4. Cost savings: ~80-90% reduction in baseline costs"
# echo ""

# # Get service URLs
# echo -e "${BLUE}🌐 Task Service URLs:${NC}"
# extract_service="task-extract"
# io_service="task-io"
# automation_service="task-automation"
# maintenance_service="task-maintenance"

# if [ "$ENVIRONMENT" = "staging" ]; then
#     extract_service="task-extract-staging"
#     io_service="task-io-staging"
#     automation_service="task-automation-staging"
#     maintenance_service="task-maintenance-staging"
# fi

# extract_url=$(gcloud run services describe $extract_service --region=$REGION --format="value(status.url)")
# io_url=$(gcloud run services describe $io_service --region=$REGION --format="value(status.url)")
# automation_url=$(gcloud run services describe $automation_service --region=$REGION --format="value(status.url)")
# maintenance_url=$(gcloud run services describe $maintenance_service --region=$REGION --format="value(status.url)")

# echo -e "• Extract Tasks: $extract_url"
# echo -e "• I/O Tasks: $io_url"
# echo -e "• Automation Tasks: $automation_url"
# echo -e "• Maintenance Tasks: $maintenance_url"
# echo ""
# echo -e "${GREEN}✨ Cloud Run Tasks deployment complete!${NC}"