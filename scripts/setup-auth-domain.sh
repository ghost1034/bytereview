#!/bin/bash
# Setup Firebase Auth Subdomain
# Complete setup guide for auth.cpaautomation.ai

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
AUTH_DOMAIN="auth.cpaautomation.ai"
PROJECT_ID="ace-rider-383100"
OAUTH_CLIENT_ID="399517492925-muq77olb80a1qe0j64lb4q4ev2852see.apps.googleusercontent.com"

echo -e "${BLUE}🔐 Setting up Firebase Auth Subdomain${NC}"
echo -e "${BLUE}Domain: ${AUTH_DOMAIN}${NC}"
echo ""

echo -e "${YELLOW}=== STEP 1: Deploy Firebase Hosting ===${NC}"
echo -e "Run: ${GREEN}./scripts/deploy-firebase-hosting.sh${NC}"
echo ""

echo -e "${YELLOW}=== STEP 2: Add Custom Domain in Firebase Console ===${NC}"
echo -e "1. Go to: ${BLUE}https://console.firebase.google.com/project/${PROJECT_ID}/hosting/main${NC}"
echo -e "2. Click 'Add custom domain'"
echo -e "3. Enter: ${GREEN}${AUTH_DOMAIN}${NC}"
echo -e "4. Follow verification steps"
echo -e "5. Copy the DNS target provided by Firebase"
echo ""

echo -e "${YELLOW}=== STEP 3: Configure DNS in GoDaddy ===${NC}"
echo -e "Add this CNAME record:"
echo -e "${GREEN}Type: CNAME${NC}"
echo -e "${GREEN}Host: auth${NC}"
echo -e "${GREEN}Value: [DNS target from Firebase Console]${NC}"
echo ""

echo -e "${YELLOW}=== STEP 4: Update Google OAuth Settings ===${NC}"
echo -e "1. Go to: ${BLUE}https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}${NC}"
echo -e "2. Click on OAuth client: ${OAUTH_CLIENT_ID}"
echo -e "3. Add to 'Authorized JavaScript origins':"
echo -e "   ${GREEN}https://${AUTH_DOMAIN}${NC}"
echo -e "4. Add to 'Authorized redirect URIs':"
echo -e "   ${GREEN}https://${AUTH_DOMAIN}/__/auth/handler${NC}"
echo -e "5. Save changes"
echo ""

echo -e "${YELLOW}=== STEP 5: Test Authentication ===${NC}"
echo -e "1. Visit: ${GREEN}https://cpaautomation.ai${NC}"
echo -e "2. Click 'Continue with Google'"
echo -e "3. Verify consent screen shows: ${GREEN}'Choose an account to continue to ${AUTH_DOMAIN}'${NC}"
echo ""

echo -e "${GREEN}✅ Setup complete! Your auth domain will be: ${AUTH_DOMAIN}${NC}"