#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
apt-get update
apt-get install -y --no-install-recommends clamav-daemon python3-venv xfsprogs
# Match the product's 50 MiB attachment ceiling. MaxScanSize stays larger so
# archive/container overhead does not reject an otherwise permitted document.
sed -i 's/^MaxFileSize .*/MaxFileSize 50M/' /etc/clamav/clamd.conf
sed -i 's/^MaxScanSize .*/MaxScanSize 100M/' /etc/clamav/clamd.conf
sed -i 's/^StreamMaxLength .*/StreamMaxLength 50M/' /etc/clamav/clamd.conf
if [ -z "$(find /var/lib/clamav -maxdepth 1 -type f \( -name '*.cvd' -o -name '*.cld' \) -print -quit)" ]; then
  systemctl stop clamav-freshclam.service 2>/dev/null || true
  freshclam
fi
systemctl enable --now clamav-daemon clamav-freshclam

DATA_DEVICE=/dev/disk/by-id/google-hosted-claw-data
if ! blkid "$DATA_DEVICE" >/dev/null 2>&1; then
  mkfs.xfs -f "$DATA_DEVICE"
fi
mkdir -p /srv/hosted-claw
if ! mountpoint -q /srv/hosted-claw; then
  mount -o defaults,nodev,nosuid,prjquota "$DATA_DEVICE" /srv/hosted-claw
fi
mkdir -p /srv/hosted-claw/tenants /srv/hosted-claw/litellm-postgres /opt/hosted-claw /etc/hosted-claw /run/hosted-claw
chmod 700 /srv/hosted-claw/tenants

metadata_file() {
  local key="$1" destination="$2"
  curl -fsS -H 'Metadata-Flavor: Google' \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/${key}" \
    -o "$destination"
}

metadata_file hosted-claw-compose /opt/hosted-claw/docker-compose.yml
metadata_file hosted-claw-litellm-config /opt/hosted-claw/litellm-config.yaml
metadata_file hosted-claw-litellm-service /etc/systemd/system/hosted-claw-litellm.service
metadata_file hosted-claw-supervisor-service /etc/systemd/system/hosted-claw-supervisor.service
if ! dpkg-query -W google-cloud-ops-agent >/dev/null 2>&1; then
  curl -fsS https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh \
    -o /tmp/add-google-cloud-ops-agent-repo.sh
  bash /tmp/add-google-cloud-ops-agent-repo.sh --also-install --version='2.*.*'
  rm -f /tmp/add-google-cloud-ops-agent-repo.sh
fi
mkdir -p /etc/google-cloud-ops-agent
metadata_file hosted-claw-ops-agent-config /etc/google-cloud-ops-agent/config.yaml
chmod 0644 /opt/hosted-claw/docker-compose.yml /opt/hosted-claw/litellm-config.yaml \
  /etc/systemd/system/hosted-claw-litellm.service /etc/systemd/system/hosted-claw-supervisor.service \
  /etc/google-cloud-ops-agent/config.yaml
systemctl enable --now google-cloud-ops-agent
systemctl restart google-cloud-ops-agent

# The release pipeline places the supervisor package and root-owned environment
# file in /opt/hosted-claw. Startup refuses to invent or fetch tenant secrets.
if [ -f /opt/hosted-claw/requirements.txt ]; then
  python3 -m venv /opt/hosted-claw/.venv
  /opt/hosted-claw/.venv/bin/pip install -r /opt/hosted-claw/requirements.txt
fi
systemctl daemon-reload
systemctl enable hosted-claw-litellm hosted-claw-supervisor
if [ -f /etc/hosted-claw/worker.env ]; then
  chmod 0600 /etc/hosted-claw/worker.env
  # Let Docker pull immutable private images with the VM's least-privilege
  # service identity. No registry token is persisted in worker.env.
  supervisor_image="$(sed -n 's/^HOSTED_CLAW_SUPERVISOR_IMAGE=//p' /etc/hosted-claw/worker.env)"
  registry_host="${supervisor_image%%/*}"
  if [ -n "$registry_host" ] && command -v gcloud >/dev/null 2>&1; then
    gcloud auth configure-docker "$registry_host" --quiet >/dev/null
  fi
  # The supervisor controls Docker through the socket but intentionally does
  # not receive host registry credentials. Pre-pull every approved immutable
  # image while bootstrap still has the VM service identity available.
  for image_key in HOSTED_CLAW_SUPERVISOR_IMAGE HOSTED_CLAW_PROXY_IMAGE HOSTED_ACCOUNTINGCLAW_IMAGE HOSTED_LEGALCLAW_IMAGE; do
    image_ref="$(sed -n "s/^${image_key}=//p" /etc/hosted-claw/worker.env)"
    if [ -n "$image_ref" ]; then
      docker pull "$image_ref" >/dev/null
    fi
  done
  systemctl start hosted-claw-litellm hosted-claw-supervisor
else
  echo "Hosted Claw services installed but inactive: provision /etc/hosted-claw/worker.env and start both units."
fi
