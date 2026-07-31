#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
apt-get update
apt-get install -y --no-install-recommends clamav-daemon python3-venv xfsprogs
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
chmod 0644 /opt/hosted-claw/docker-compose.yml /opt/hosted-claw/litellm-config.yaml \
  /etc/systemd/system/hosted-claw-litellm.service /etc/systemd/system/hosted-claw-supervisor.service

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
  systemctl start hosted-claw-litellm hosted-claw-supervisor
else
  echo "Hosted Claw services installed but inactive: provision /etc/hosted-claw/worker.env and start both units."
fi
