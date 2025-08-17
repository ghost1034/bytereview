#!/bin/bash
# CPAAutomation Domain Setup Script
# Sets up domain mappings and SSL certificates for Cloud Run services

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID="ace-rider-383100"
REGION="us-central1"
DOMAIN="cpaautomation.ai"          # apex
WWW_DOMAIN="www.cpaautomation.ai"  # www subdomain -> frontend
API_DOMAIN="api.cpaautomation.ai"  # api subdomain -> backend

FRONTEND_SERVICE="cpa-web"
API_SERVICE="cpa-api"

echo -e "${BLUE}🌐 Setting up domains for CPAAutomation...${NC}"
echo -e "${BLUE}Main domain: ${DOMAIN}${NC}"
echo -e "${BLUE}WWW domain: ${WWW_DOMAIN}${NC}"
echo -e "${BLUE}API domain: ${API_DOMAIN}${NC}"
echo ""

# Ensure Google Cloud project & region are set
gcloud config set project "${PROJECT_ID}" >/dev/null
gcloud config set run/region "${REGION}" >/dev/null

# --- helpers ---

create_domain_mapping() {
  local domain="$1"
  local service="$2"

  echo -e "${YELLOW}🔗 Creating domain mapping for ${domain} → ${service}...${NC}"

  if gcloud beta run domain-mappings describe "${domain}" --region="${REGION}" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Domain mapping for ${domain} already exists, skipping create.${NC}"
    return 0
  fi

  if ! gcloud beta run domain-mappings create \
      --service="${service}" \
      --domain="${domain}" \
      --region="${REGION}"; then
    echo -e "${RED}❌ Failed to create domain mapping for ${domain}.${NC}"
    return 1
  fi

  echo -e "${GREEN}✅ Domain mapping created for ${domain}${NC}"
  echo ""
}

check_domain_status() {
  local domain="$1"
  local max_attempts=30
  local attempt=1

  echo -e "${YELLOW}⏳ Waiting for ${domain} to be Ready...${NC}"
  while [ "${attempt}" -le "${max_attempts}" ]; do
    local status
    status="$(gcloud beta run domain-mappings describe "${domain}" --region="${REGION}" --format="value(status.conditions[?type='Ready'].status)")" || status="Unknown"

    if [[ "${status}" == *"True"* ]]; then
      echo -e "${GREEN}✅ ${domain} is Ready${NC}"
      return 0
    fi

    if [[ "${status}" == *"False"* ]]; then
      local reason
      reason="$(gcloud beta run domain-mappings describe "${domain}" --region="${REGION}" --format="value(status.conditions[?type='Ready'].reason)")" || reason="Unknown"
      echo -e "${RED}❌ ${domain} failed: ${reason}${NC}"
      return 1
    fi

    echo -e "${YELLOW}⏳ ${domain} status: ${status:-Unknown} (attempt ${attempt}/${max_attempts})${NC}"
    sleep 30
    attempt=$((attempt+1))
  done

  echo -e "${RED}❌ Timeout waiting for ${domain} to be Ready${NC}"
  return 1
}

check_ssl_status() {
  local domain="$1"
  echo -e "${BLUE}🔐 SSL status for ${domain}:${NC}"
  gcloud beta run domain-mappings describe "${domain}" --region="${REGION}" \
    --format="table(status.conditions[].type,status.conditions[].status,status.conditions[].reason)"
  echo ""
}

print_dns_instructions() {
  echo -e "${BLUE}=== DNS Configuration (GoDaddy) ===${NC}"
  echo -e "${YELLOW}Configure these records in your GoDaddy DNS zone:${NC}\n"

  echo -e "${BLUE}Apex ${DOMAIN}:${NC}"
  cat <<EOF
Type   Host  Value
A      @     216.239.32.21
A      @     216.239.34.21
A      @     216.239.36.21
A      @     216.239.38.21
AAAA   @     2001:4860:4802:32::15
AAAA   @     2001:4860:4802:34::15
AAAA   @     2001:4860:4802:36::15
AAAA   @     2001:4860:4802:38::15
EOF
  echo ""

  echo -e "${BLUE}WWW ${WWW_DOMAIN}:${NC}"
  cat <<EOF
Type    Host  Value
CNAME   www   ghs.googlehosted.com.
EOF
  echo ""

  echo -e "${BLUE}API ${API_DOMAIN}:${NC}"
  cat <<EOF
Type    Host  Value
CNAME   api   ghs.googlehosted.com.
EOF
  echo ""

  echo -e "${YELLOW}Keep existing MX/SPF/DMARC/TXT verifications you already use for Gmail and Google verification.${NC}"
  echo -e "Remove GoDaddy 'Parked' A record if present.\n"
}

# --- checks ---

echo -e "${YELLOW}🔍 Verifying services exist...${NC}"
if ! gcloud run services describe "${FRONTEND_SERVICE}" --region="${REGION}" >/dev/null 2>&1; then
  echo -e "${RED}❌ Frontend service '${FRONTEND_SERVICE}' not found. Deploy it first.${NC}"
  exit 1
fi
if ! gcloud run services describe "${API_SERVICE}" --region="${REGION}" >/dev/null 2>&1; then
  echo -e "${RED}❌ API service '${API_SERVICE}' not found. Deploy it first.${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Services found${NC}\n"

# --- create mappings ---

echo -e "${BLUE}=== Creating Domain Mappings ===${NC}"
create_domain_mapping "${DOMAIN}"     "${FRONTEND_SERVICE}"   # apex -> frontend
create_domain_mapping "${WWW_DOMAIN}" "${FRONTEND_SERVICE}"   # www  -> frontend
create_domain_mapping "${API_DOMAIN}" "${API_SERVICE}"        # api  -> backend

# --- show DNS guidance ---

print_dns_instructions

echo -e "${YELLOW}⏳ Waiting for domain mappings to become Ready (after DNS is set)...${NC}"
check_domain_status "${DOMAIN}"     || true
check_domain_status "${WWW_DOMAIN}" || true
check_domain_status "${API_DOMAIN}" || true

# --- SSL status ---

echo -e "${BLUE}=== SSL Certificate Status ===${NC}"
check_ssl_status "${DOMAIN}"
check_ssl_status "${WWW_DOMAIN}"
check_ssl_status "${API_DOMAIN}"

echo -e "${GREEN}✨ Domain setup completed (pending DNS/SSL propagation).${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "1) Update DNS in GoDaddy as shown above."
echo -e "2) Wait for DNS to propagate (5–60 minutes typically)."
echo -e "3) Once DNS is correct, SSL will auto-provision (status → Ready)."
echo -e "4) Test:"
echo -e "   • https://${DOMAIN}"
echo -e "   • https://${WWW_DOMAIN}"
echo -e "   • https://${API_DOMAIN}/health"
