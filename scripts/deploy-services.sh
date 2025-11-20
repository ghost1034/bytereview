#!/bin/bash
# CPAAutomation Services Deployment Script
# Deploys all Cloud Run services (API, Frontend, Workers)

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

echo -e "${BLUE}🚀 Deploying CPAAutomation services...${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Image tag: ${GIT_HASH}${NC}"
echo -e "${BLUE}Project: ${PROJECT_ID}${NC}"
echo ""

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

# Deploy Backend API
# echo -e "${BLUE}=== Deploying Backend API ===${NC}"
# deploy_service \
#     "cpa-api" \
#     "backend" \
#     "8000" \
#     "2Gi" \
#     "2" \
#     "1" \
#     "10" \
#     "80" \
#     "300" \
#     "true" \
#     "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE \
#      --vpc-connector=$VPC_CONNECTOR \
#      --vpc-egress=private-ranges-only \
#      --service-account=$SERVICE_ACCOUNT \
#      --set-secrets=DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_REDIRECT_URI=GOOGLE_REDIRECT_URI:latest,APP_SECRET=APP_SECRET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,ADMIN_TOKEN=ADMIN_TOKEN:latest,TASK_EXTRACT_URL=TASK_EXTRACT_URL:latest,TASK_IO_URL=TASK_IO_URL:latest,TASK_AUTOMATION_URL=TASK_AUTOMATION_URL:latest,TASK_MAINTENANCE_URL=TASK_MAINTENANCE_URL:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
#      --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GCS_TEMP_FOLDER=temp_uploads,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json"

# Deploy Frontend
echo -e "${BLUE}=== Deploying Frontend ===${NC}"
deploy_service \
    "cpa-web" \
    "frontend" \
    "3000" \
    "1Gi" \
    "1" \
    "1" \
    "5" \
    "100" \
    "60" \
    "true" \
    "--set-env-vars=NODE_ENV=production"

# # Deploy Extract Worker (AI tasks)
# echo -e "${BLUE}=== Deploying Extract Worker ===${NC}"
# deploy_service \
#     "worker-extract" \
#     "backend" \
#     "8000" \
#     "2Gi" \
#     "2" \
#     "1" \
#     "10" \
#     "1" \
#     "3600" \
#     "false" \
#     "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE \
#      --vpc-connector=$VPC_CONNECTOR \
#      --vpc-egress=private-ranges-only \
#      --service-account=$SERVICE_ACCOUNT \
#      --no-cpu-throttling \
#      --set-secrets=DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
#      --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GCS_TEMP_FOLDER=temp_uploads,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,WORKER_TYPE=extract \
#      --command=python \
#      --args=workers/entrypoint.py"

# # Deploy I/O Worker (imports, exports, ZIP)
# echo -e "${BLUE}=== Deploying I/O Worker ===${NC}"
# deploy_service \
#     "worker-io" \
#     "backend" \
#     "8000" \
#     "1Gi" \
#     "1" \
#     "1" \
#     "5" \
#     "1" \
#     "1800" \
#     "false" \
#     "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE \
#      --vpc-connector=$VPC_CONNECTOR \
#      --vpc-egress=private-ranges-only \
#      --service-account=$SERVICE_ACCOUNT \
#      --no-cpu-throttling \
#      --set-secrets=DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_REDIRECT_URI=GOOGLE_REDIRECT_URI:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
#      --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GCS_TEMP_FOLDER=temp_uploads,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,WORKER_TYPE=io \
#      --command=python \
#      --args=workers/entrypoint.py"

# # Deploy Maintenance Worker (cron tasks)
# echo -e "${BLUE}=== Deploying Maintenance Worker ===${NC}"
# deploy_service \
#     "worker-maint" \
#     "backend" \
#     "8000" \
#     "1Gi" \
#     "1" \
#     "1" \
#     "1" \
#     "1" \
#     "3600" \
#     "false" \
#     "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE \
#      --vpc-connector=$VPC_CONNECTOR \
#      --vpc-egress=private-ranges-only \
#      --service-account=$SERVICE_ACCOUNT \
#      --no-cpu-throttling \
#      --set-secrets=DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
#      --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,WORKER_TYPE=maint \
#      --command=python \
#      --args=workers/entrypoint.py"

# # Deploy Automation Worker (Gmail triggers, job initialization)
# echo -e "${BLUE}=== Deploying Automation Worker ===${NC}"
# deploy_service \
#     "worker-automation" \
#     "backend" \
#     "8000" \
#     "1Gi" \
#     "1" \
#     "1" \
#     "3" \
#     "1" \
#     "1800" \
#     "false" \
#     "--add-cloudsql-instances=$CLOUD_SQL_INSTANCE \
#      --vpc-connector=$VPC_CONNECTOR \
#      --vpc-egress=private-ranges-only \
#      --service-account=$SERVICE_ACCOUNT \
#      --no-cpu-throttling \
#      --set-secrets=DATABASE_URL=DATABASE_URL:latest,REDIS_URL=REDIS_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_REDIRECT_URI=GOOGLE_REDIRECT_URI:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,/var/secrets/google/service-account.json=FIREBASE_SERVICE_ACCOUNT:latest \
#      --set-env-vars=ENVIRONMENT=$ENVIRONMENT,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=cpaautomation-files-prod,GCS_TEMP_FOLDER=temp_uploads,GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json,WORKER_TYPE=automation \
#      --command=python \
#      --args=workers/entrypoint.py"

# # Run database migrations
# echo -e "${BLUE}=== Running Database Migrations ===${NC}"
# echo -e "${YELLOW}🔄 Running Alembic migrations...${NC}"

# # Create a temporary Cloud Run job to run migrations
# gcloud run jobs create migration-job \
#     --image=$ARTIFACT_REGISTRY_URL/backend:$GIT_HASH \
#     --region=$REGION \
#     --set-cloudsql-instances=$CLOUD_SQL_INSTANCE \
#     --vpc-connector=$VPC_CONNECTOR \
#     --vpc-egress=private-ranges-only \
#     --service-account=$SERVICE_ACCOUNT \
#     --set-secrets=DATABASE_URL=DATABASE_URL:latest \
#     --set-env-vars=ENVIRONMENT=$ENVIRONMENT \
#     --args=alembic,upgrade,head \
#     --max-retries=1 \
#     --parallelism=1 \
#     --tasks=1 \
#     --task-timeout=600 || true

# # Execute the migration job
# if gcloud run jobs describe migration-job --region=$REGION >/dev/null 2>&1; then
#     gcloud run jobs execute migration-job --region=$REGION --wait
#     echo -e "${GREEN}✅ Database migrations completed${NC}"
    
#     # Clean up migration job
#     gcloud run jobs delete migration-job --region=$REGION --quiet
# else
#     echo -e "${RED}❌ Failed to create migration job${NC}"
# fi

# Deployment summary
echo -e "${GREEN}🎉 All services deployed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Deployed services:${NC}"

if [ "$ENVIRONMENT" = "staging" ]; then
    echo -e "• API: cpa-api-staging"
    echo -e "• Frontend: cpa-web-staging"
    echo -e "• Extract Worker: worker-extract-staging"
    echo -e "• I/O Worker: worker-io-staging"
    echo -e "• Maintenance Worker: worker-maint-staging"
    echo -e "• Automation Worker: worker-automation-staging"
else
    echo -e "• API: cpa-api"
    echo -e "• Frontend: cpa-web"
    echo -e "• Extract Worker: worker-extract"
    echo -e "• I/O Worker: worker-io"
    echo -e "• Maintenance Worker: worker-maint"
    echo -e "• Automation Worker: worker-automation"
fi

echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "1. Configure domain mappings (run ./scripts/setup-domains.sh)"
echo -e "2. Test all services"
echo -e "3. Set up monitoring and alerts"
echo ""

# Get service URLs
echo -e "${BLUE}🌐 Service URLs:${NC}"
api_service="cpa-api"
web_service="cpa-web"
if [ "$ENVIRONMENT" = "staging" ]; then
    api_service="cpa-api-staging"
    web_service="cpa-web-staging"
fi

api_url=$(gcloud run services describe $api_service --region=$REGION --format="value(status.url)")
web_url=$(gcloud run services describe $web_service --region=$REGION --format="value(status.url)")

echo -e "• API: $api_url"
echo -e "• Frontend: $web_url"
echo ""
echo -e "${GREEN}✨ Services deployment complete!${NC}"