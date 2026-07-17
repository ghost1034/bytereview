#!/bin/bash
# CPAAutomation OpenConnector VM Setup Script
#
# One-time provisioning of the GCE VM that runs the shared OpenConnector
# runtime (connect.cpaautomation.ai). Creates:
#   - a static external IP (print it, then add the DNS A record)
#   - a persistent data disk for the runtime's SQLite store
#   - an e2-small Debian VM with Docker, /opt/openconnector seeded from
#     infra/openconnector/, and .env populated from Secret Manager
#   - firewall rules for 80/443
#   - the nightly SQLite backup cron (scripts/backup-openconnector.sh)
#
# Prereqs: gcloud authed against the project; the three runtime secrets exist
# in Secret Manager (create them first — see setup-secrets.sh, which generates
# them if missing).
#
# Idempotence: each resource is created only if absent; re-running refreshes
# /opt/openconnector and .env on the VM.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
ZONE="${ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-openconnector}"
DISK_NAME="${DISK_NAME:-openconnector-data}"
DISK_SIZE="${DISK_SIZE:-20GB}"
ADDRESS_NAME="${ADDRESS_NAME:-openconnector-ip}"
REGION="${ZONE%-*}"
BACKUP_BUCKET="${BACKUP_BUCKET:-gs://cpaautomation-openconnector-backups}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

gcloud config set project "$PROJECT_ID" >/dev/null

echo -e "${BLUE}=== Static IP ===${NC}"
if ! gcloud compute addresses describe "$ADDRESS_NAME" --region "$REGION" >/dev/null 2>&1; then
  gcloud compute addresses create "$ADDRESS_NAME" --region "$REGION"
fi
STATIC_IP="$(gcloud compute addresses describe "$ADDRESS_NAME" --region "$REGION" --format='value(address)')"
echo -e "${GREEN}✅ Static IP: ${STATIC_IP}${NC}"

echo -e "${BLUE}=== Data disk ===${NC}"
if ! gcloud compute disks describe "$DISK_NAME" --zone "$ZONE" >/dev/null 2>&1; then
  gcloud compute disks create "$DISK_NAME" --zone "$ZONE" --size "$DISK_SIZE" --type pd-balanced
fi
echo -e "${GREEN}✅ Disk ${DISK_NAME} ready${NC}"

echo -e "${BLUE}=== Firewall ===${NC}"
if ! gcloud compute firewall-rules describe allow-openconnector-web >/dev/null 2>&1; then
  gcloud compute firewall-rules create allow-openconnector-web \
    --allow tcp:80,tcp:443 --target-tags openconnector --direction INGRESS
fi
echo -e "${GREEN}✅ Firewall ready${NC}"

echo -e "${BLUE}=== Backup bucket ===${NC}"
if ! gsutil ls -b "$BACKUP_BUCKET" >/dev/null 2>&1; then
  gsutil mb -l "$REGION" "$BACKUP_BUCKET"
  gsutil lifecycle set /dev/stdin "$BACKUP_BUCKET" <<'LIFECYCLE'
{"rule": [{"action": {"type": "Delete"}, "condition": {"age": 30}}]}
LIFECYCLE
fi
echo -e "${GREEN}✅ Backup bucket ready${NC}"

echo -e "${BLUE}=== VM ===${NC}"
if ! gcloud compute instances describe "$VM_NAME" --zone "$ZONE" >/dev/null 2>&1; then
  gcloud compute instances create "$VM_NAME" \
    --zone "$ZONE" \
    --machine-type e2-small \
    --image-family debian-12 \
    --image-project debian-cloud \
    --tags openconnector \
    --address "$STATIC_IP" \
    --disk "name=${DISK_NAME},device-name=${DISK_NAME},mode=rw,boot=no" \
    --scopes "https://www.googleapis.com/auth/cloud-platform"
  echo "Waiting for SSH to come up..."
  sleep 30
fi
echo -e "${GREEN}✅ VM ${VM_NAME} ready${NC}"

echo -e "${BLUE}=== VM bootstrap (docker, disk mount, app dir) ===${NC}"
gcloud compute ssh "$VM_NAME" --zone "$ZONE" --command '
  set -euo pipefail
  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sudo sh
  fi
  # Format (first boot only) and mount the data disk.
  DEV=/dev/disk/by-id/google-'"$DISK_NAME"'
  if ! sudo blkid "$DEV" >/dev/null 2>&1; then
    sudo mkfs.ext4 -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard "$DEV"
  fi
  sudo mkdir -p /mnt/openconnector-data
  if ! mountpoint -q /mnt/openconnector-data; then
    sudo mount -o discard,defaults "$DEV" /mnt/openconnector-data
    echo "$DEV /mnt/openconnector-data ext4 discard,defaults,nofail 0 2" | sudo tee -a /etc/fstab >/dev/null
  fi
  sudo mkdir -p /opt/openconnector
'

echo -e "${BLUE}=== Seed /opt/openconnector from repo + Secret Manager ===${NC}"
gcloud compute scp \
  "$REPO_ROOT/infra/openconnector/docker-compose.yml" \
  "$REPO_ROOT/infra/openconnector/Caddyfile" \
  "$REPO_ROOT/scripts/backup-openconnector.sh" \
  "$VM_NAME:/tmp/" --zone "$ZONE"

gcloud compute ssh "$VM_NAME" --zone "$ZONE" --command '
  set -euo pipefail
  sudo mv /tmp/docker-compose.yml /tmp/Caddyfile /opt/openconnector/
  sudo mv /tmp/backup-openconnector.sh /opt/openconnector/
  sudo chmod +x /opt/openconnector/backup-openconnector.sh

  fetch() { gcloud secrets versions access latest --secret "$1"; }
  umask 077
  {
    echo "OOMOL_CONNECT_ORIGIN=https://connect.cpaautomation.ai"
    echo "OOMOL_CONNECT_ENCRYPTION_KEY=$(fetch OOMOL_CONNECT_ENCRYPTION_KEY)"
    echo "OOMOL_CONNECT_ADMIN_TOKEN=$(fetch OPENCONNECTOR_ADMIN_TOKEN)"
    echo "OOMOL_CONNECT_RUNTIME_TOKEN=$(fetch OPENCONNECTOR_RUNTIME_TOKEN)"
  } | sudo tee /opt/openconnector/.env >/dev/null
  sudo chmod 600 /opt/openconnector/.env

  cd /opt/openconnector && sudo docker compose up -d --pull always

  # Nightly SQLite backup at 03:17 UTC.
  echo "17 3 * * * root /opt/openconnector/backup-openconnector.sh >> /var/log/openconnector-backup.log 2>&1" \
    | sudo tee /etc/cron.d/openconnector-backup >/dev/null
'

echo -e "${GREEN}✅ OpenConnector runtime is starting${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Add DNS A record: connect.cpaautomation.ai -> ${STATIC_IP}"
echo "  2. Wait for Caddy to obtain TLS, then verify: curl https://connect.cpaautomation.ai/health"
echo "  3. Register provider OAuth apps via the CPAA admin routes (see infra/openconnector/README.md)"
