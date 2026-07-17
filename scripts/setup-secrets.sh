#!/bin/bash
# CPAAutomation Secrets Setup Script
# One-time bootstrap of Google Secret Manager secrets.
#
# Seeds the TASK_*_URL secrets (the deployed task-service URLs) that
# deploy-services.sh mounts into the cpa-api backend. Other secrets
# (DATABASE_URL, OAuth, Stripe, Firebase, ENCRYPTION_KEY, ...) are provisioned
# out-of-band and are not managed by this script.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ID="ace-rider-383100"

echo -e "${BLUE}🔐 Setting up CPAAutomation secrets in Google Secret Manager...${NC}"

# Cloud Run Task Service URLs. Create on first run, add a new version otherwise.
echo -e "${BLUE}=== Cloud Run Task Service URLs ===${NC}"
gcloud secrets create TASK_EXTRACT_URL --data-file=- <<< "https://task-extract-oyrpyor7wq-uc.a.run.app" || \
gcloud secrets versions add TASK_EXTRACT_URL --data-file=- <<< "https://task-extract-oyrpyor7wq-uc.a.run.app"

gcloud secrets create TASK_IO_URL --data-file=- <<< "https://task-io-oyrpyor7wq-uc.a.run.app" || \
gcloud secrets versions add TASK_IO_URL --data-file=- <<< "https://task-io-oyrpyor7wq-uc.a.run.app"

gcloud secrets create TASK_AUTOMATION_URL --data-file=- <<< "https://task-automation-oyrpyor7wq-uc.a.run.app" || \
gcloud secrets versions add TASK_AUTOMATION_URL --data-file=- <<< "https://task-automation-oyrpyor7wq-uc.a.run.app"

gcloud secrets create TASK_MAINTENANCE_URL --data-file=- <<< "https://task-maintenance-oyrpyor7wq-uc.a.run.app" || \
gcloud secrets versions add TASK_MAINTENANCE_URL --data-file=- <<< "https://task-maintenance-oyrpyor7wq-uc.a.run.app"

echo -e "${GREEN}✅ Task service URL secrets ensured${NC}"

# OpenConnector integration secrets. The three tokens are generated once and
# then left alone (rotating OOMOL_CONNECT_ENCRYPTION_KEY requires the
# runtime's key-rotation flow — see infra/openconnector/README.md). The URL
# secret points the backend broker at the runtime VM.
echo -e "${BLUE}=== OpenConnector ===${NC}"
ensure_generated_secret() {
    local name="$1"
    if gcloud secrets describe "$name" >/dev/null 2>&1; then
        echo "Secret $name already exists (left unchanged)"
    else
        openssl rand -hex 32 | tr -d '\n' | gcloud secrets create "$name" --data-file=-
        echo "Created secret $name"
    fi
}
ensure_generated_secret OPENCONNECTOR_ADMIN_TOKEN
ensure_generated_secret OPENCONNECTOR_RUNTIME_TOKEN
ensure_generated_secret OOMOL_CONNECT_ENCRYPTION_KEY

gcloud secrets create OPENCONNECTOR_URL --data-file=- <<< "https://connect.cpaautomation.ai" || \
gcloud secrets versions add OPENCONNECTOR_URL --data-file=- <<< "https://connect.cpaautomation.ai"

echo -e "${GREEN}✅ OpenConnector secrets ensured${NC}"
