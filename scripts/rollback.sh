#!/bin/bash
# CPAAutomation Rollback Script
# Rolls back services to previous revision or specific revision

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

echo -e "${BLUE}🔄 CPAAutomation Rollback Script${NC}"
echo ""

# Function to show service revisions
show_revisions() {
    local service_name=$1
    
    echo -e "${BLUE}📋 Revisions for ${service_name}:${NC}"
    gcloud run revisions list --service=$service_name --region=$REGION --format="table(metadata.name,status.conditions[0].lastTransitionTime,spec.template.metadata.annotations.'run.googleapis.com/execution-environment',status.allocatedTraffic)"
    echo ""
}

# Function to rollback service
rollback_service() {
    local service_name=$1
    local target_revision=$2
    
    if [ -z "$target_revision" ]; then
        echo -e "${YELLOW}Rolling back ${service_name} to previous revision...${NC}"
        gcloud run services update-traffic $service_name --to-revisions=LATEST=100 --region=$REGION
    else
        echo -e "${YELLOW}Rolling back ${service_name} to revision ${target_revision}...${NC}"
        gcloud run services update-traffic $service_name --to-revisions=$target_revision=100 --region=$REGION
    fi
    
    echo -e "${GREEN}✅ ${service_name} rollback complete${NC}"
    echo ""
}

# Parse command line arguments
SERVICE=""
REVISION=""
LIST_ONLY=false
ENVIRONMENT="production"

while [[ $# -gt 0 ]]; do
    case $1 in
        --service)
            SERVICE="$2"
            shift 2
            ;;
        --revision)
            REVISION="$2"
            shift 2
            ;;
        --list)
            LIST_ONLY=true
            shift
            ;;
        --staging)
            ENVIRONMENT="staging"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --service SERVICE   Rollback specific service (cpa-api, cpa-web, worker-extract, worker-io, worker-maint)"
            echo "  --revision REV      Rollback to specific revision (default: previous)"
            echo "  --list             List revisions only, don't rollback"
            echo "  --staging          Target staging environment"
            echo "  -h, --help         Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --list                           # List all service revisions"
            echo "  $0 --service cpa-api                # Rollback API to previous revision"
            echo "  $0 --service cpa-web --revision REV # Rollback frontend to specific revision"
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
if [ "$ENVIRONMENT" = "staging" ]; then
    SERVICES=("cpa-api-staging" "cpa-web-staging" "worker-extract-staging" "worker-io-staging" "worker-maint-staging")
fi

echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo ""

# List revisions mode
if [ "$LIST_ONLY" = true ]; then
    echo -e "${BLUE}=== Service Revisions ===${NC}"
    for service in "${SERVICES[@]}"; do
        if gcloud run services describe $service --region=$REGION >/dev/null 2>&1; then
            show_revisions $service
        else
            echo -e "${YELLOW}⚠️  Service ${service} not found${NC}"
        fi
    done
    exit 0
fi

# Rollback specific service
if [ -n "$SERVICE" ]; then
    # Add environment suffix if needed
    if [ "$ENVIRONMENT" = "staging" ] && [[ ! "$SERVICE" =~ -staging$ ]]; then
        SERVICE="${SERVICE}-staging"
    fi
    
    if ! gcloud run services describe $SERVICE --region=$REGION >/dev/null 2>&1; then
        echo -e "${RED}❌ Service ${SERVICE} not found${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}=== Rolling back ${SERVICE} ===${NC}"
    show_revisions $SERVICE
    
    if [ -z "$REVISION" ]; then
        echo -e "${YELLOW}⚠️  No specific revision provided. Rolling back to previous revision.${NC}"
        echo -e "${BLUE}Continue? (y/N):${NC}"
        read -r confirm
        if [[ ! $confirm =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Rollback cancelled${NC}"
            exit 0
        fi
    fi
    
    rollback_service $SERVICE $REVISION
    exit 0
fi

# Interactive rollback mode
echo -e "${BLUE}=== Interactive Rollback Mode ===${NC}"
echo -e "${YELLOW}This will show revisions for all services and allow you to rollback individually.${NC}"
echo ""

for service in "${SERVICES[@]}"; do
    if ! gcloud run services describe $service --region=$REGION >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Service ${service} not found, skipping...${NC}"
        continue
    fi
    
    echo -e "${BLUE}=== ${service} ===${NC}"
    show_revisions $service
    
    echo -e "${BLUE}Rollback ${service}? (y/N):${NC}"
    read -r rollback_confirm
    
    if [[ $rollback_confirm =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Enter revision name (or press Enter for previous):${NC}"
        read -r target_revision
        rollback_service $service $target_revision
    else
        echo -e "${YELLOW}Skipping ${service}${NC}"
        echo ""
    fi
done

echo -e "${GREEN}🎉 Rollback process complete!${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "1. Test the rolled-back services"
echo -e "2. Monitor for any issues"
echo -e "3. Consider fixing the issue and redeploying"
echo ""
echo -e "${BLUE}🔍 Monitoring:${NC}"
echo -e "• Check service status: gcloud run services list --region=${REGION}"
echo -e "• View logs: gcloud logging read 'resource.type=\"cloud_run_revision\"' --limit=50"
echo -e "• Monitor dashboard: https://console.cloud.google.com/monitoring/dashboards"