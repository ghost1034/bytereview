#!/bin/bash
# CPAAutomation Domain Setup Script
# Sets up domain mappings and SSL certificates for Cloud Run services

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
DOMAIN="cpaautomation.ai"
API_DOMAIN="api.cpaautomation.ai"

echo -e "${BLUE}🌐 Setting up domains for CPAAutomation...${NC}"
echo -e "${BLUE}Main domain: ${DOMAIN}${NC}"
echo -e "${BLUE}API domain: ${API_DOMAIN}${NC}"
echo ""

# Function to create domain mapping
create_domain_mapping() {
    local domain=$1
    local service=$2
    local description=$3
    
    echo -e "${YELLOW}🔗 Creating domain mapping for ${domain} → ${service}...${NC}"
    
    if gcloud run domain-mappings describe $domain --region=$REGION >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Domain mapping for ${domain} already exists${NC}"
        return 0
    fi
    
    gcloud run domain-mappings create \
        --service=$service \
        --domain=$domain \
        --region=$REGION
    
    echo -e "${GREEN}✅ Domain mapping created for ${domain}${NC}"
    echo ""
}

# Function to get DNS records
get_dns_records() {
    local domain=$1
    
    echo -e "${BLUE}📋 DNS records for ${domain}:${NC}"
    gcloud run domain-mappings describe $domain --region=$REGION --format="value(spec.routePolicy.ingress)" || true
    echo ""
}

# Check if services exist
echo -e "${YELLOW}🔍 Checking if services exist...${NC}"

if ! gcloud run services describe cpa-web --region=$REGION >/dev/null 2>&1; then
    echo -e "${RED}❌ Frontend service 'cpa-web' not found. Please deploy services first.${NC}"
    exit 1
fi

if ! gcloud run services describe cpa-api --region=$REGION >/dev/null 2>&1; then
    echo -e "${RED}❌ API service 'cpa-api' not found. Please deploy services first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Services found${NC}"
echo ""

# Create domain mappings
echo -e "${BLUE}=== Creating Domain Mappings ===${NC}"

create_domain_mapping $DOMAIN "cpa-web" "Frontend service"
create_domain_mapping $API_DOMAIN "cpa-api" "API service"

# Wait for domain mappings to be ready
echo -e "${YELLOW}⏳ Waiting for domain mappings to be ready...${NC}"
echo -e "${BLUE}This may take a few minutes while SSL certificates are provisioned...${NC}"

# Check status of domain mappings
check_domain_status() {
    local domain=$1
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        local status=$(gcloud run domain-mappings describe $domain --region=$REGION --format="value(status.conditions[0].status)" 2>/dev/null || echo "Unknown")
        
        case $status in
            "True")
                echo -e "${GREEN}✅ ${domain} is ready${NC}"
                return 0
                ;;
            "False")
                local reason=$(gcloud run domain-mappings describe $domain --region=$REGION --format="value(status.conditions[0].reason)" 2>/dev/null || echo "Unknown")
                echo -e "${RED}❌ ${domain} failed: ${reason}${NC}"
                return 1
                ;;
            *)
                echo -e "${YELLOW}⏳ ${domain} status: ${status} (attempt ${attempt}/${max_attempts})${NC}"
                sleep 30
                ;;
        esac
        
        ((attempt++))
    done
    
    echo -e "${RED}❌ Timeout waiting for ${domain} to be ready${NC}"
    return 1
}

# Check both domains
check_domain_status $DOMAIN
check_domain_status $API_DOMAIN

echo ""
echo -e "${GREEN}🎉 Domain mappings created successfully!${NC}"
echo ""

# Display DNS configuration instructions
echo -e "${BLUE}=== DNS Configuration Required ===${NC}"
echo -e "${YELLOW}You need to configure the following DNS records at your domain registrar (GoDaddy):${NC}"
echo ""

echo -e "${BLUE}For ${DOMAIN} (apex domain):${NC}"
echo -e "Add these A records:"
echo -e "  A     @    216.239.32.21"
echo -e "  A     @    216.239.34.21"
echo -e "  A     @    216.239.36.21"
echo -e "  A     @    216.239.38.21"
echo ""

echo -e "${BLUE}For ${API_DOMAIN} (subdomain):${NC}"
echo -e "Add this CNAME record:"
echo -e "  CNAME  api   ghs.googlehosted.com"
echo ""

# Get specific DNS records from Cloud Run (if available)
echo -e "${BLUE}=== Specific DNS Records from Cloud Run ===${NC}"
echo -e "${YELLOW}If the generic records above don't work, use these specific ones:${NC}"
echo ""

get_dns_records $DOMAIN
get_dns_records $API_DOMAIN

# SSL Certificate status
echo -e "${BLUE}=== SSL Certificate Status ===${NC}"
echo -e "${YELLOW}Checking SSL certificate provisioning...${NC}"

check_ssl_status() {
    local domain=$1
    
    echo -e "${BLUE}SSL status for ${domain}:${NC}"
    gcloud run domain-mappings describe $domain --region=$REGION --format="table(status.conditions[].type,status.conditions[].status,status.conditions[].reason)" 2>/dev/null || echo "Unable to get SSL status"
    echo ""
}

check_ssl_status $DOMAIN
check_ssl_status $API_DOMAIN

# Final instructions
echo -e "${GREEN}✨ Domain setup complete!${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "1. Configure DNS records at your domain registrar as shown above"
echo -e "2. Wait for DNS propagation (usually 5-60 minutes)"
echo -e "3. SSL certificates will be automatically provisioned once DNS is configured"
echo -e "4. Test your domains:"
echo -e "   • https://${DOMAIN}"
echo -e "   • https://${API_DOMAIN}/health"
echo ""
echo -e "${YELLOW}⚠️  Important notes:${NC}"
echo -e "• DNS propagation can take up to 48 hours (usually much faster)"
echo -e "• SSL certificates are automatically managed by Google"
echo -e "• You can check status anytime with: gcloud run domain-mappings list --region=${REGION}"
echo ""
echo -e "${BLUE}🔍 Monitoring commands:${NC}"
echo -e "• Check domain status: gcloud run domain-mappings describe ${DOMAIN} --region=${REGION}"
echo -e "• Check SSL status: gcloud run domain-mappings describe ${API_DOMAIN} --region=${REGION}"
echo -e "• List all mappings: gcloud run domain-mappings list --region=${REGION}"