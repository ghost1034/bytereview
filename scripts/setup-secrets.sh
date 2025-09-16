#!/bin/bash
# CPAAutomation Secrets Setup Script
# Creates and manages secrets in Google Secret Manager

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ID="ace-rider-383100"

echo -e "${BLUE}🔐 Setting up CPAAutomation secrets in Google Secret Manager...${NC}"

# Function to create secret if it doesn't exist
create_secret_if_not_exists() {
    local secret_name=$1
    local secret_value=$2
    local from_file=$3
    
    if gcloud secrets describe $secret_name >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Secret '$secret_name' already exists. Skipping...${NC}"
        return 0
    fi
    
    if [ "$from_file" = "true" ]; then
        if [ -f "$secret_value" ]; then
            gcloud secrets create $secret_name --data-file="$secret_value"
            echo -e "${GREEN}✓ Created secret '$secret_name' from file${NC}"
        else
            echo -e "${RED}❌ File '$secret_value' not found for secret '$secret_name'${NC}"
            return 1
        fi
    else
        if [ -n "$secret_value" ]; then
            printf '%s' "$secret_value" | gcloud secrets create $secret_name --data-file=-
            echo -e "${GREEN}✓ Created secret '$secret_name'${NC}"
        else
            echo -e "${RED}❌ No value provided for secret '$secret_name'${NC}"
            return 1
        fi
    fi
}

# Function to prompt for secret value
prompt_for_secret() {
    local secret_name=$1
    local description=$2
    local is_sensitive=${3:-true}
    
    echo -e "${BLUE}Enter value for '$secret_name' ($description):${NC}"
    if [ "$is_sensitive" = "true" ]; then
        read -s secret_value
        echo ""
    else
        read secret_value
    fi
    
    if [ -z "$secret_value" ]; then
        echo -e "${RED}❌ No value entered for '$secret_name'. Skipping...${NC}"
        return 1
    fi
    
    create_secret_if_not_exists $secret_name "$secret_value" false
}

# Function to generate random secret
generate_secret() {
    local secret_name=$1
    local description=$2
    local length=${3:-32}
    
    echo -e "${BLUE}Generating random value for '$secret_name' ($description)...${NC}"
    local secret_value=$(openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length)
    create_secret_if_not_exists $secret_name "$secret_value" false
    echo -e "${YELLOW}⚠️  Generated value: $secret_value${NC}"
    echo -e "${YELLOW}   Please save this value securely!${NC}"
}

# echo -e "${YELLOW}This script will create secrets in Google Secret Manager.${NC}"
# echo -e "${YELLOW}You can either provide values manually or skip secrets to create them later.${NC}"
# echo -e "${YELLOW}Press Enter to skip any secret, or Ctrl+C to exit.${NC}"
# echo ""

# # Database URL
# echo -e "${BLUE}=== Database Configuration ===${NC}"
# if ! gcloud secrets describe DATABASE_URL >/dev/null 2>&1; then
#     echo -e "${YELLOW}Please construct your database URL from the infrastructure setup:${NC}"
#     echo -e "${YELLOW}Format: postgresql://USER:PASSWORD@/DATABASE?host=/cloudsql/PROJECT:REGION:INSTANCE${NC}"
#     prompt_for_secret "DATABASE_URL" "Cloud SQL connection string" false
# fi

# # Redis URL
# if ! gcloud secrets describe REDIS_URL >/dev/null 2>&1; then
#     echo -e "${YELLOW}Please get Redis IP from infrastructure setup:${NC}"
#     echo -e "${YELLOW}Format: redis://REDIS_IP:6379${NC}"
#     prompt_for_secret "REDIS_URL" "Redis connection string" false
# fi

# # Google OAuth
# echo -e "${BLUE}=== Google OAuth Configuration ===${NC}"
# if ! gcloud secrets describe GOOGLE_CLIENT_ID >/dev/null 2>&1; then
#     prompt_for_secret "GOOGLE_CLIENT_ID" "Google OAuth client ID" false
# fi

# if ! gcloud secrets describe GOOGLE_CLIENT_SECRET >/dev/null 2>&1; then
#     prompt_for_secret "GOOGLE_CLIENT_SECRET" "Google OAuth client secret"
# fi

# if ! gcloud secrets describe GOOGLE_REDIRECT_URI >/dev/null 2>&1; then
#     echo -e "${YELLOW}Default redirect URI: https://cpaautomation.ai/integrations/google/callback${NC}"
#     echo -e "${BLUE}Press Enter to use default, or enter custom redirect URI:${NC}"
#     read custom_redirect
#     if [ -z "$custom_redirect" ]; then
#         redirect_uri="https://cpaautomation.ai/integrations/google/callback"
#     else
#         redirect_uri="$custom_redirect"
#     fi
#     create_secret_if_not_exists "GOOGLE_REDIRECT_URI" "$redirect_uri" false
# fi

# # Security keys
# echo -e "${BLUE}=== Security Configuration ===${NC}"
# if ! gcloud secrets describe ENCRYPTION_KEY >/dev/null 2>&1; then
#     echo -e "${BLUE}Do you want to generate a new encryption key? (y/N):${NC}"
#     read -r generate_key
#     if [[ $generate_key =~ ^[Yy]$ ]]; then
#         # Generate Fernet key
#         encryption_key=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
#         create_secret_if_not_exists "ENCRYPTION_KEY" "$encryption_key" false
#         echo -e "${YELLOW}⚠️  Generated encryption key: $encryption_key${NC}"
#     else
#         prompt_for_secret "ENCRYPTION_KEY" "Fernet encryption key"
#     fi
# fi

# if ! gcloud secrets describe APP_SECRET >/dev/null 2>&1; then
#     echo -e "${BLUE}Do you want to generate a new app secret? (y/N):${NC}"
#     read -r generate_secret
#     if [[ $generate_secret =~ ^[Yy]$ ]]; then
#         generate_secret "APP_SECRET" "Application secret key" 32
#     else
#         prompt_for_secret "APP_SECRET" "Application secret key"
#     fi
# fi

# # AI Configuration
# echo -e "${BLUE}=== AI Configuration ===${NC}"
# if ! gcloud secrets describe GEMINI_API_KEY >/dev/null 2>&1; then
#     prompt_for_secret "GEMINI_API_KEY" "Google Gemini API key"
# fi

# # Stripe Configuration
# echo -e "${BLUE}=== Stripe Configuration ===${NC}"
# echo -e "${YELLOW}Enter Stripe LIVE keys for production (not test keys):${NC}"

# if ! gcloud secrets describe STRIPE_SECRET_KEY >/dev/null 2>&1; then
#     prompt_for_secret "STRIPE_SECRET_KEY" "Stripe secret key (sk_live_...)"
# fi

# if ! gcloud secrets describe STRIPE_WEBHOOK_SECRET >/dev/null 2>&1; then
#     prompt_for_secret "STRIPE_WEBHOOK_SECRET" "Stripe webhook secret (whsec_...)"
# fi

# # Stripe Product and Pricing Configuration
# echo -e "${BLUE}=== Stripe Products and Pricing ===${NC}"

# if ! gcloud secrets describe STRIPE_METER_PAGES >/dev/null 2>&1; then
#     create_secret_if_not_exists "STRIPE_METER_PAGES" "mtr_61TCvkRSBZSDgrl3h41GfqNUmLOfJ3M0" false
# fi

# if ! gcloud secrets describe STRIPE_PRODUCT_BASIC >/dev/null 2>&1; then
#     create_secret_if_not_exists "STRIPE_PRODUCT_BASIC" "prod_SzWqchnuvtqGMG" false
# fi

# if ! gcloud secrets describe STRIPE_PRICE_BASIC_RECURRING >/dev/null 2>&1; then
#     create_secret_if_not_exists "STRIPE_PRICE_BASIC_RECURRING" "price_1S3Xn5GfqNUmLOfJj9RIJSUE" false
# fi

# if ! gcloud secrets describe STRIPE_PRICE_BASIC_METERED >/dev/null 2>&1; then
#     create_secret_if_not_exists "STRIPE_PRICE_BASIC_METERED" "price_1S3Xn5GfqNUmLOfJyqCDY0H5" false
# fi

# if ! gcloud secrets describe STRIPE_PRODUCT_PRO >/dev/null 2>&1; then
#     create_secret_if_not_exists "STRIPE_PRODUCT_PRO" "prod_SzWqpBo1oTdMbF" false
# fi

# if ! gcloud secrets describe STRIPE_PRICE_PRO_RECURRING >/dev/null 2>&1; then
#     create_secret_if_not_exists "STRIPE_PRICE_PRO_RECURRING" "price_1S3Xn6GfqNUmLOfJwGIkq78C" false
# fi

# if ! gcloud secrets describe STRIPE_PRICE_PRO_METERED >/dev/null 2>&1; then
#     create_secret_if_not_exists "STRIPE_PRICE_PRO_METERED" "price_1S3Xn6GfqNUmLOfJY3tQ66d0" false
# fi

# # Firebase Service Account
# echo -e "${BLUE}=== Firebase Configuration ===${NC}"
# if ! gcloud secrets describe FIREBASE_SERVICE_ACCOUNT >/dev/null 2>&1; then
#     echo -e "${BLUE}Do you have a Firebase service account JSON file? (y/N):${NC}"
#     read -r has_firebase
#     if [[ $has_firebase =~ ^[Yy]$ ]]; then
#         echo -e "${BLUE}Enter path to Firebase service account JSON file:${NC}"
#         read firebase_path
#         if [ -f "$firebase_path" ]; then
#             create_secret_if_not_exists "FIREBASE_SERVICE_ACCOUNT" "$firebase_path" true
#         else
#             echo -e "${RED}❌ File not found: $firebase_path${NC}"
#         fi
#     else
#         echo -e "${YELLOW}⚠️  Skipping Firebase service account. You can add it later.${NC}"
#     fi
# fi

# # Admin token
# echo -e "${BLUE}=== Admin Configuration ===${NC}"
# if ! gcloud secrets describe ADMIN_TOKEN >/dev/null 2>&1; then
#     echo -e "${BLUE}Do you want to generate an admin token? (y/N):${NC}"
#     read -r generate_admin
#     if [[ $generate_admin =~ ^[Yy]$ ]]; then
#         generate_secret "ADMIN_TOKEN" "Admin API token" 32
#     else
#         prompt_for_secret "ADMIN_TOKEN" "Admin API token"
#     fi
# fi

# Add Cloud Run Task Service URLs
echo -e "${BLUE}=== Cloud Run Task Service URLs ===${NC}"
gcloud secrets create TASK_EXTRACT_URL --data-file=- <<< "https://task-extract-oyrpyor7wq-uc.a.run.app" || \
gcloud secrets versions add TASK_EXTRACT_URL --data-file=- <<< "https://task-extract-oyrpyor7wq-uc.a.run.app"

gcloud secrets create TASK_IO_URL --data-file=- <<< "https://task-io-oyrpyor7wq-uc.a.run.app" || \
gcloud secrets versions add TASK_IO_URL --data-file=- <<< "https://task-io-oyrpyor7wq-uc.a.run.app"

gcloud secrets create TASK_AUTOMATION_URL --data-file=- <<< "https://task-automation-oyrpyor7wq-uc.a.run.app" || \
gcloud secrets versions add TASK_AUTOMATION_URL --data-file=- <<< "https://task-automation-oyrpyor7wq-uc.a.run.app"

gcloud secrets create TASK_MAINTENANCE_URL --data-file=- <<< "https://task-maintenance-oyrpyor7wq-uc.a.run.app" || \
gcloud secrets versions add TASK_MAINTENANCE_URL --data-file=- <<< "https://task-maintenance-oyrpyor7wq-uc.a.run.app"

# # List all created secrets
# echo ""
# echo -e "${GREEN}🎉 Secrets setup complete!${NC}"
# echo ""
# echo -e "${BLUE}📋 Created secrets:${NC}"
# gcloud secrets list --filter="name:DATABASE_URL OR name:REDIS_URL OR name:GOOGLE_CLIENT_ID OR name:GOOGLE_CLIENT_SECRET OR name:GOOGLE_REDIRECT_URI OR name:ENCRYPTION_KEY OR name:APP_SECRET OR name:GEMINI_API_KEY OR name:STRIPE_SECRET_KEY OR name:STRIPE_WEBHOOK_SECRET OR name:STRIPE_METER_PAGES OR name:STRIPE_PRODUCT_BASIC OR name:STRIPE_PRICE_BASIC_RECURRING OR name:STRIPE_PRICE_BASIC_METERED OR name:STRIPE_PRODUCT_PRO OR name:STRIPE_PRICE_PRO_RECURRING OR name:STRIPE_PRICE_PRO_METERED OR name:FIREBASE_SERVICE_ACCOUNT OR name:ADMIN_TOKEN" --format="table(name,createTime)"

# echo ""
# echo -e "${YELLOW}📝 Next steps:${NC}"
# echo -e "1. Verify all secrets are created correctly"
# echo -e "2. Test secret access: gcloud secrets versions access latest --secret=SECRET_NAME"
# echo -e "3. Build and deploy the application"
# echo ""
# echo -e "${YELLOW}⚠️  Security reminders:${NC}"
# echo -e "• Keep generated keys/tokens secure"
# echo -e "• Rotate secrets regularly"
# echo -e "• Monitor secret access logs"
# echo -e "• Use different secrets for staging/production"