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

wait_for_device() {
  local device="$1"
  for _ in $(seq 1 60); do
    [ -e "$device" ] && return 0
    sleep 1
  done
  echo "Timed out waiting for $device" >&2
  return 1
}

HOSTED_DATA_DEVICE=/dev/disk/by-id/google-hosted-claw-data
OPENCONNECTOR_DATA_DEVICE=/dev/disk/by-id/google-openconnector-data
wait_for_device "$HOSTED_DATA_DEVICE"
wait_for_device "$OPENCONNECTOR_DATA_DEVICE"

if ! blkid "$HOSTED_DATA_DEVICE" >/dev/null 2>&1; then
  mkfs.xfs -f "$HOSTED_DATA_DEVICE"
fi
if ! blkid "$OPENCONNECTOR_DATA_DEVICE" >/dev/null 2>&1; then
  mkfs.ext4 -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard "$OPENCONNECTOR_DATA_DEVICE"
fi

mkdir -p /srv/hosted-claw /mnt/openconnector-data
if ! mountpoint -q /srv/hosted-claw; then
  mount -o defaults,nodev,nosuid,prjquota "$HOSTED_DATA_DEVICE" /srv/hosted-claw
fi
if ! mountpoint -q /mnt/openconnector-data; then
  mount -o discard,defaults,nodev,nosuid "$OPENCONNECTOR_DATA_DEVICE" /mnt/openconnector-data
fi

mkdir -p /srv/hosted-claw/tenants /srv/hosted-claw/litellm-postgres \
  /mnt/openconnector-data/caddy-data /mnt/openconnector-data/caddy-config \
  /opt/hosted-claw /etc/hosted-claw /run/hosted-claw \
  /opt/openconnector /etc/openconnector
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
metadata_file hosted-claw-activate /usr/local/sbin/activate-hosted-claw
metadata_file container-metadata-block /usr/local/sbin/block-container-metadata
metadata_file container-metadata-service /etc/systemd/system/container-metadata-firewall.service
metadata_file openconnector-compose /opt/openconnector/docker-compose.yml
metadata_file openconnector-caddy /opt/openconnector/Caddyfile
metadata_file openconnector-service /etc/systemd/system/openconnector.service
metadata_file openconnector-backup-script /opt/openconnector/backup-openconnector.sh
metadata_file openconnector-backup-service /etc/systemd/system/openconnector-backup.service
metadata_file openconnector-backup-timer /etc/systemd/system/openconnector-backup.timer
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
  /etc/systemd/system/container-metadata-firewall.service \
  /opt/openconnector/docker-compose.yml /opt/openconnector/Caddyfile \
  /etc/systemd/system/openconnector.service /etc/systemd/system/openconnector-backup.service \
  /etc/systemd/system/openconnector-backup.timer /etc/google-cloud-ops-agent/config.yaml
chmod 0755 /usr/local/sbin/activate-hosted-claw /usr/local/sbin/block-container-metadata \
  /opt/openconnector/backup-openconnector.sh
systemctl enable --now google-cloud-ops-agent
systemctl restart google-cloud-ops-agent

# The release pipeline places the supervisor package and root-owned environment
# file in /opt/hosted-claw. Startup refuses to invent or fetch tenant secrets.
if [ -f /opt/hosted-claw/requirements.txt ]; then
  python3 -m venv /opt/hosted-claw/.venv
  /opt/hosted-claw/.venv/bin/pip install -r /opt/hosted-claw/requirements.txt
fi
systemctl daemon-reload
systemctl enable container-metadata-firewall hosted-claw-litellm hosted-claw-supervisor \
  openconnector openconnector-backup.timer
systemctl start container-metadata-firewall
systemctl start openconnector-backup.timer
if [ -f /etc/hosted-claw/worker.env ]; then
  /usr/local/sbin/activate-hosted-claw
else
  echo "Hosted Claw services installed but inactive: provision /etc/hosted-claw/worker.env and start both units."
fi
if [ -f /etc/openconnector/openconnector.env ]; then
  chmod 0600 /etc/openconnector/openconnector.env
  systemctl start openconnector
else
  echo "OpenConnector installed but inactive: provision /etc/openconnector/openconnector.env and start openconnector."
fi
