#!/bin/bash
# CPAAutomation Infrastructure Setup Script
# Sets up Google Cloud infrastructure: APIs, databases, Redis, networking, etc.

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
DB_INSTANCE_NAME="cpaautomation-db"
DB_NAME="cpaautomation"
DB_USER="cpaautomation-user"
REDIS_INSTANCE_NAME="cpaautomation-redis"
VPC_CONNECTOR_NAME="cpa-svpc"
ARTIFACT_REGISTRY_REPO="cpa-docker"

echo -e "${BLUE}🏗️  Setting up CPAAutomation infrastructure...${NC}"

# Function to check if resource exists
resource_exists() {
    local resource_type=$1
    local resource_name=$2
    local additional_flags=$3
    
    if gcloud $resource_type describe $resource_name $additional_flags >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Enable required APIs
echo -e "${YELLOW}📡 Enabling required Google Cloud APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    sqladmin.googleapis.com \
    servicenetworking.googleapis.com \
    redis.googleapis.com \
    logging.googleapis.com \
    monitoring.googleapis.com \
    certificatemanager.googleapis.com \
    domains.googleapis.com \
    compute.googleapis.com \
    vpcaccess.googleapis.com

echo -e "${GREEN}✓ APIs enabled${NC}"

# Create Artifact Registry repository
echo -e "${YELLOW}📦 Setting up Artifact Registry...${NC}"
if ! resource_exists "artifacts repositories" $ARTIFACT_REGISTRY_REPO "--location=$REGION"; then
    gcloud artifacts repositories create $ARTIFACT_REGISTRY_REPO \
        --repository-format=docker \
        --location=$REGION \
        --description="CPAAutomation Docker images"
    echo -e "${GREEN}✓ Artifact Registry repository created${NC}"
else
    echo -e "${GREEN}✓ Artifact Registry repository already exists${NC}"
fi

# Configure Docker authentication
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Create VPC Connector for Redis access
echo -e "${YELLOW}🌐 Setting up VPC Connector...${NC}"
if ! resource_exists "compute networks vpc-access connectors" $VPC_CONNECTOR_NAME "--region=$REGION"; then
    gcloud compute networks vpc-access connectors create $VPC_CONNECTOR_NAME \
        --region=$REGION \
        --network=default \
        --range=10.8.0.0/28
    echo -e "${GREEN}✓ VPC Connector created${NC}"
else
    echo -e "${GREEN}✓ VPC Connector already exists${NC}"
fi

# Create Cloud SQL instance
echo -e "${YELLOW}🗄️  Setting up Cloud SQL PostgreSQL...${NC}"
if ! resource_exists "sql instances" $DB_INSTANCE_NAME; then
    echo -e "${BLUE}Creating Cloud SQL instance (this may take several minutes)...${NC}"
    gcloud sql instances create $DB_INSTANCE_NAME \
        --database-version=POSTGRES_15 \
        --tier=db-f1-micro \
        --region=$REGION \
        --storage-type=SSD \
        --storage-size=20GB \
        --storage-auto-increase \
        --backup-start-time=03:00 \
        --maintenance-window-day=SUN \
        --maintenance-window-hour=04 \
        --deletion-protection
    echo -e "${GREEN}✓ Cloud SQL instance created${NC}"
else
    echo -e "${GREEN}✓ Cloud SQL instance already exists${NC}"
fi

# Create database
echo -e "${YELLOW}📊 Creating database...${NC}"
if ! gcloud sql databases describe $DB_NAME --instance=$DB_INSTANCE_NAME >/dev/null 2>&1; then
    gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE_NAME
    echo -e "${GREEN}✓ Database created${NC}"
else
    echo -e "${GREEN}✓ Database already exists${NC}"
fi

# Create database user (prompt for password)
echo -e "${YELLOW}👤 Setting up database user...${NC}"
if ! gcloud sql users describe $DB_USER --instance=$DB_INSTANCE_NAME >/dev/null 2>&1; then
    echo -e "${BLUE}Please enter a strong password for the database user:${NC}"
    read -s DB_PASSWORD
    echo ""
    gcloud sql users create $DB_USER \
        --instance=$DB_INSTANCE_NAME \
        --password=$DB_PASSWORD
    echo -e "${GREEN}✓ Database user created${NC}"
    echo -e "${YELLOW}⚠️  Please save this password securely and update your secrets!${NC}"
    echo -e "${YELLOW}   Database URL: postgresql://$DB_USER:$DB_PASSWORD@/$DB_NAME?host=/cloudsql/$PROJECT_ID:$REGION:$DB_INSTANCE_NAME${NC}"
else
    echo -e "${GREEN}✓ Database user already exists${NC}"
fi

# Create Redis instance
echo -e "${YELLOW}🔴 Setting up Redis (Memorystore)...${NC}"
if ! resource_exists "redis instances" $REDIS_INSTANCE_NAME "--region=$REGION"; then
    echo -e "${BLUE}Creating Redis instance (this may take several minutes)...${NC}"
    gcloud redis instances create $REDIS_INSTANCE_NAME \
        --size=1 \
        --region=$REGION \
        --redis-version=redis_7_0 \
        --network=default
    echo -e "${GREEN}✓ Redis instance created${NC}"
else
    echo -e "${GREEN}✓ Redis instance already exists${NC}"
fi

# Get Redis IP for configuration
REDIS_IP=$(gcloud redis instances describe $REDIS_INSTANCE_NAME --region=$REGION --format="value(host)")
echo -e "${BLUE}Redis IP: $REDIS_IP${NC}"
echo -e "${YELLOW}⚠️  Please update your Redis URL in secrets: redis://$REDIS_IP:6379${NC}"

# Create service account for Cloud Run services
echo -e "${YELLOW}🔐 Setting up service account...${NC}"
SERVICE_ACCOUNT_NAME="cpaautomation-runner"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL >/dev/null 2>&1; then
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name="CPAAutomation Runner"
    echo -e "${GREEN}✓ Service account created${NC}"
else
    echo -e "${GREEN}✓ Service account already exists${NC}"
fi

# Grant necessary IAM roles
echo -e "${YELLOW}🔑 Granting IAM permissions...${NC}"
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/cloudsql.client" \
    --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/storage.objectAdmin" \
    --quiet

echo -e "${GREEN}✓ IAM permissions granted${NC}"

# Create GCS bucket for file storage
echo -e "${YELLOW}🪣 Setting up Cloud Storage bucket...${NC}"
BUCKET_NAME="cpaautomation-files-prod"
if ! gsutil ls gs://$BUCKET_NAME >/dev/null 2>&1; then
    gsutil mb -l $REGION gs://$BUCKET_NAME
    # Set lifecycle policy for automatic cleanup
    if [ -f "backend/gcs-lifecycle.json" ]; then
        gsutil lifecycle set backend/gcs-lifecycle.json gs://$BUCKET_NAME
    fi
    echo -e "${GREEN}✓ Cloud Storage bucket created${NC}"
else
    echo -e "${GREEN}✓ Cloud Storage bucket already exists${NC}"
fi

echo -e "${GREEN}🎉 Infrastructure setup complete!${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "1. Create secrets in Secret Manager (run ./scripts/setup-secrets.sh)"
echo -e "2. Update environment variables with the values shown above"
echo -e "3. Build and deploy the application"
echo ""
echo -e "${BLUE}📊 Infrastructure Summary:${NC}"
echo -e "• Cloud SQL: $DB_INSTANCE_NAME"
echo -e "• Redis: $REDIS_INSTANCE_NAME (IP: $REDIS_IP)"
echo -e "• VPC Connector: $VPC_CONNECTOR_NAME"
echo -e "• Service Account: $SERVICE_ACCOUNT_EMAIL"
echo -e "• Storage Bucket: gs://$BUCKET_NAME"
echo -e "• Artifact Registry: $REGION-docker.pkg.dev/$PROJECT_ID/$ARTIFACT_REGISTRY_REPO"