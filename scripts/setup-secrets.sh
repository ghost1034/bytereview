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
