#!/bin/bash
# Deploy Firebase Hosting for Authentication Subdomain
# Sets up auth.cpaautomation.ai for Firebase Auth while keeping main domain on Cloud Run

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID="ace-rider-383100"
AUTH_DOMAIN="auth.cpaautomation.ai"

echo -e "${BLUE}🔥 Deploying Firebase Hosting for Authentication...${NC}"
echo -e "${BLUE}Auth domain: ${AUTH_DOMAIN}${NC}"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${YELLOW}📦 Firebase CLI not found. Installing...${NC}"
    npm install -g firebase-tools
fi

# Login to Firebase (if not already logged in)
echo -e "${YELLOW}🔐 Checking Firebase authentication...${NC}"
firebase login --reauth

# Set the project
echo -e "${YELLOW}📦 Setting Firebase project...${NC}"
firebase use $PROJECT_ID

# Deploy hosting
echo -e "${YELLOW}🚀 Deploying Firebase Hosting...${NC}"
firebase deploy --only hosting

echo -e "${GREEN}✅ Firebase Hosting deployed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "1. Add custom domain '${AUTH_DOMAIN}' in Firebase Console"
echo -e "2. Configure DNS CNAME record: auth.cpaautomation.ai → (Firebase hosting target)"
echo -e "3. Update Google OAuth settings to include ${AUTH_DOMAIN}"
echo -e "4. Test authentication flow"
echo ""
echo -e "${YELLOW}🌐 After DNS setup, your auth flow will show:${NC}"
echo -e "${GREEN}   'Choose an account to continue to ${AUTH_DOMAIN}'${NC}"