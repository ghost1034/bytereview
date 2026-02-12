#!/bin/bash
# CPAAutomation Status Check Script
# Checks the health and status of all deployed services

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

echo -e "${BLUE}🔍 CPAAutomation Status Check${NC}"
echo -e "${BLUE}Project: ${PROJECT_ID}${NC}"
echo -e "${BLUE}Region: ${REGION}${NC}"
echo ""

# Function to check service status
check_service_status() {
    local service_name=$1
    local expected_url=$2
    
    echo -e "${YELLOW}🔍 Checking ${service_name}...${NC}"
    
    # Check if service exists
    if ! gcloud run services describe $service_name --region=$REGION >/dev/null 2>&1; then
        echo -e "${RED}❌ Service ${service_name} not found${NC}"
        return 1
    fi
    
    # Get service details
    local service_url=$(gcloud run services describe $service_name --region=$REGION --format="value(status.url)")
    local ready_condition=$(gcloud run services describe $service_name --region=$REGION --format="value(status.conditions[0].status)")
    local traffic_allocation=$(gcloud run services describe $service_name --region=$REGION --format="value(status.traffic[0].percent)")
    local latest_revision=$(gcloud run services describe $service_name --region=$REGION --format="value(status.latestReadyRevisionName)")
    
    echo -e "  URL: ${service_url}"
    echo -e "  Ready: ${ready_condition}"
    echo -e "  Traffic: ${traffic_allocation}%"
    echo -e "  Latest Revision: ${latest_revision}"
    
    # Health check if URL is provided
    if [ -n "$expected_url" ]; then
        echo -e "  ${BLUE}Testing health endpoint...${NC}"
        if curl -s -f "${expected_url}/health" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✅ Health check passed${NC}"
        else
            echo -e "  ${RED}❌ Health check failed${NC}"
        fi
    fi
    
    # Check if service is ready
    if [ "$ready_condition" = "True" ]; then
        echo -e "${GREEN}✅ ${service_name} is healthy${NC}"
    else
        echo -e "${RED}❌ ${service_name} is not ready${NC}"
    fi
    
    echo ""
}

# Function to check infrastructure status
check_infrastructure() {
    echo -e "${BLUE}=== Infrastructure Status ===${NC}"
    
    # Cloud SQL
    echo -e "${YELLOW}🗄️  Checking Cloud SQL...${NC}"
    local db_status=$(gcloud sql instances describe cpaautomation-db --format="value(state)" 2>/dev/null || echo "NOT_FOUND")
    if [ "$db_status" = "RUNNABLE" ]; then
        echo -e "${GREEN}✅ Cloud SQL is running${NC}"
    else
        echo -e "${RED}❌ Cloud SQL status: ${db_status}${NC}"
    fi
    
    # Redis
    echo -e "${YELLOW}🔴 Checking Redis...${NC}"
    local redis_status=$(gcloud redis instances describe cpaautomation-redis --region=$REGION --format="value(state)" 2>/dev/null || echo "NOT_FOUND")
    if [ "$redis_status" = "READY" ]; then
        echo -e "${GREEN}✅ Redis is ready${NC}"
    else
        echo -e "${RED}❌ Redis status: ${redis_status}${NC}"
    fi
    
    # VPC Connector
    echo -e "${YELLOW}🌐 Checking VPC Connector...${NC}"
    local vpc_status=$(gcloud compute networks vpc-access connectors describe cpa-svpc --region=$REGION --format="value(state)" 2>/dev/null || echo "NOT_FOUND")
    if [ "$vpc_status" = "READY" ]; then
        echo -e "${GREEN}✅ VPC Connector is ready${NC}"
    else
        echo -e "${RED}❌ VPC Connector status: ${vpc_status}${NC}"
    fi
    
    echo ""
}

# Function to check domain mappings
check_domains() {
    echo -e "${BLUE}=== Domain Status ===${NC}"
    
    local domains=("cpaautomation.ai" "api.cpaautomation.ai")
    
    for domain in "${domains[@]}"; do
        echo -e "${YELLOW}🌐 Checking ${domain}...${NC}"
        
        if gcloud run domain-mappings describe $domain --region=$REGION >/dev/null 2>&1; then
            local domain_status=$(gcloud run domain-mappings describe $domain --region=$REGION --format="value(status.conditions[0].status)")
            local ssl_status=$(gcloud run domain-mappings describe $domain --region=$REGION --format="value(status.conditions[1].status)" 2>/dev/null || echo "Unknown")
            
            echo -e "  Domain Status: ${domain_status}"
            echo -e "  SSL Status: ${ssl_status}"
            
            if [ "$domain_status" = "True" ]; then
                echo -e "${GREEN}✅ ${domain} is active${NC}"
                
                # Test HTTPS
                echo -e "  ${BLUE}Testing HTTPS...${NC}"
                if curl -s -f "https://${domain}" >/dev/null 2>&1; then
                    echo -e "  ${GREEN}✅ HTTPS accessible${NC}"
                else
                    echo -e "  ${RED}❌ HTTPS not accessible${NC}"
                fi
            else
                echo -e "${RED}❌ ${domain} is not ready${NC}"
            fi
        else
            echo -e "${RED}❌ ${domain} mapping not found${NC}"
        fi
        echo ""
    done
}

# Function to check secrets
check_secrets() {
    echo -e "${BLUE}=== Secrets Status ===${NC}"
    
    local required_secrets=("DATABASE_URL" "GOOGLE_CLIENT_SECRET" "GEMINI_API_KEY" "STRIPE_SECRET_KEY" "ENCRYPTION_KEY" "APP_SECRET")
    
    for secret in "${secrets[@]}"; do
        if gcloud secrets describe $secret >/dev/null 2>&1; then
            echo -e "${GREEN}✅ ${secret}${NC}"
        else
            echo -e "${RED}❌ ${secret} not found${NC}"
        fi
    done
    echo ""
}

# Function to show recent logs
show_recent_logs() {
    echo -e "${BLUE}=== Recent Error Logs ===${NC}"
    echo -e "${YELLOW}Showing recent errors from all services...${NC}"
    
    gcloud logging read 'resource.type="cloud_run_revision" AND (severity="ERROR" OR severity="CRITICAL") AND resource.labels.service_name=~"cpa-.*"' \
        --limit=10 \
        --format="table(timestamp,resource.labels.service_name,textPayload)" \
        --freshness=1h 2>/dev/null || echo "No recent errors found"
    
    echo ""
}

# Parse command line arguments
DETAILED=false
ENVIRONMENT="production"

while [[ $# -gt 0 ]]; do
    case $1 in
        --detailed)
            DETAILED=true
            shift
            ;;
        --staging)
            ENVIRONMENT="staging"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --detailed    Show detailed status including logs"
            echo "  --staging     Check staging environment"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Define services based on environment
SERVICES=("cpa-api" "cpa-web" "worker-extract" "worker-io" "worker-maint")
SERVICE_URLS=("https://api.cpaautomation.ai" "https://cpaautomation.ai" "" "" "")

if [ "$ENVIRONMENT" = "staging" ]; then
    SERVICES=("cpa-api-staging" "cpa-web-staging" "worker-extract-staging" "worker-io-staging" "worker-maint-staging")
    # Get staging URLs dynamically
    SERVICE_URLS=()
    for service in "${SERVICES[@]}"; do
        if gcloud run services describe $service --region=$REGION >/dev/null 2>&1; then
            url=$(gcloud run services describe $service --region=$REGION --format="value(status.url)")
            SERVICE_URLS+=("$url")
        else
            SERVICE_URLS+=("")
        fi
    done
fi

echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo ""

# Check infrastructure
check_infrastructure

# Check services
echo -e "${BLUE}=== Service Status ===${NC}"
for i in "${!SERVICES[@]}"; do
    check_service_status "${SERVICES[$i]}" "${SERVICE_URLS[$i]}"
done

# Check domains (only for production)
if [ "$ENVIRONMENT" = "production" ]; then
    check_domains
fi

# Detailed checks
if [ "$DETAILED" = true ]; then
    check_secrets
    show_recent_logs
fi

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "${YELLOW}Quick health check:${NC}"

# Count healthy services
healthy_count=0
total_count=${#SERVICES[@]}

for service in "${SERVICES[@]}"; do
    if gcloud run services describe $service --region=$REGION >/dev/null 2>&1; then
        ready_condition=$(gcloud run services describe $service --region=$REGION --format="value(status.conditions[0].status)")
        if [ "$ready_condition" = "True" ]; then
            ((healthy_count++))
        fi
    fi
done

echo -e "Services: ${healthy_count}/${total_count} healthy"

if [ $healthy_count -eq $total_count ]; then
    echo -e "${GREEN}🎉 All services are healthy!${NC}"
else
    echo -e "${YELLOW}⚠️  Some services need attention${NC}"
fi

echo ""
echo -e "${BLUE}🔍 Useful commands:${NC}"
echo -e "• View service logs: gcloud logging read 'resource.type=\"cloud_run_revision\"' --limit=50"
echo -e "• Monitor dashboard: https://console.cloud.google.com/monitoring/dashboards"
echo -e "• Service console: https://console.cloud.google.com/run?project=${PROJECT_ID}"
