#!/usr/bin/env bash
# Move OpenConnector's stateful disk and static IP to the Hosted Claw MIG.
#
# Usage:
#   scripts/migrate-openconnector-to-hosted-claw.sh prepare
#   scripts/migrate-openconnector-to-hosted-claw.sh cutover
#   scripts/migrate-openconnector-to-hosted-claw.sh rollback
#   scripts/migrate-openconnector-to-hosted-claw.sh finalize

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
MIG_NAME="${MIG_NAME:-hosted-claw-pilot}"
SHARED_TEMPLATE="${SHARED_TEMPLATE:-hosted-claw-pilot-v7}"
HOSTED_ONLY_TEMPLATE="${HOSTED_ONLY_TEMPLATE:-hosted-claw-pilot-v5}"
LEGACY_VM="${LEGACY_VM:-openconnector}"
OPENCONNECTOR_DISK="${OPENCONNECTOR_DISK:-openconnector-data}"
OPENCONNECTOR_ADDRESS="${OPENCONNECTOR_ADDRESS:-openconnector-ip}"
FORWARDING_RULE="${FORWARDING_RULE:-openconnector-web}"
BACKEND_SERVICE="${BACKEND_SERVICE:-openconnector-web-backend}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

gcloud config set project "$PROJECT_ID" >/dev/null

shared_instance() {
  gcloud compute instance-groups managed list-instances "$MIG_NAME" --zone="$ZONE" \
    --filter='instanceStatus=RUNNING' --format='value(instance.basename())' | head -n1
}

wait_for_ssh() {
  local instance="$1"
  for _ in $(seq 1 60); do
    if gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
      --command='true' >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  echo "Timed out waiting for SSH on $instance" >&2
  return 1
}

forget_instance_host_key() {
  local instance="$1" instance_id known_hosts
  instance_id="$(gcloud compute instances describe "$instance" --zone="$ZONE" --format='value(id)')"
  known_hosts="${HOME}/.ssh/google_compute_known_hosts"
  if [ -n "$instance_id" ] && [ -f "$known_hosts" ]; then
    ssh-keygen -R "compute.${instance_id}" -f "$known_hosts" >/dev/null 2>&1 || true
  fi
}

capture_root_file() {
  local instance="$1" remote_path="$2" local_path="$3"
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
    --command="sudo cat '$remote_path'" >"$local_path"
  chmod 0600 "$local_path"
  test -s "$local_path"
}

inject_root_file() {
  local instance="$1" local_path="$2" remote_path="$3"
  local remote_tmp="/tmp/$(basename "$remote_path").migration"
  gcloud compute scp "$local_path" "$instance:$remote_tmp" --zone="$ZONE" --tunnel-through-iap >/dev/null
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap --command="
    set -e
    sudo mkdir -p '$(dirname "$remote_path")'
    sudo mv '$remote_tmp' '$remote_path'
    sudo chown root:root '$remote_path'
    sudo chmod 0600 '$remote_path'
  " >/dev/null
}

prepare() {
  MIG_NAME="$MIG_NAME" TEMPLATE_NAME="$SHARED_TEMPLATE" "$REPO_ROOT/scripts/setup-hosted-claw-pilot.sh"
  echo "Preparation complete. The current MIG remains on its existing VM until cutover."
}

cutover() {
  local instance temp_dir stamp hosted_snapshot connector_snapshot
  instance="$(shared_instance)"
  test -n "$instance"
  temp_dir="$(mktemp -d)"
  trap "rm -r -- '$temp_dir'" EXIT
  capture_root_file "$instance" /etc/hosted-claw/worker.env "$temp_dir/worker.env"
  capture_root_file "$LEGACY_VM" /opt/openconnector/.env "$temp_dir/openconnector.env"

  if gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
    --command="sudo docker ps --format '{{.Names}}' | grep -q '^hclaw-'"; then
    echo "Active Hosted Claw tenant containers exist; drain them before cutover." >&2
    exit 1
  fi

  gcloud compute instance-templates describe "$SHARED_TEMPLATE" >/dev/null
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  hosted_snapshot="hosted-claw-data-pre-merge-${stamp}"
  connector_snapshot="openconnector-data-pre-merge-${stamp}"

  echo "Stopping Hosted Claw and OpenConnector services..."
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap --command='sudo systemctl stop hosted-claw-supervisor hosted-claw-litellm' >/dev/null
  gcloud compute ssh "$LEGACY_VM" --zone="$ZONE" --command='
    set -e
    cd /opt/openconnector
    sudo docker compose down
    sudo mkdir -p /mnt/openconnector-data/caddy-data /mnt/openconnector-data/caddy-config
    for pair in "openconnector_caddy-data:caddy-data" "openconnector_caddy-config:caddy-config"; do
      volume="${pair%%:*}"
      destination="${pair#*:}"
      source="$(sudo docker volume inspect "$volume" --format "{{.Mountpoint}}")"
      sudo cp -a "$source"/. "/mnt/openconnector-data/$destination/"
    done
    sync
  ' >/dev/null

  echo "Creating pre-cutover disk snapshots..."
  gcloud compute snapshots create "$hosted_snapshot" --source-disk=hosted-claw-data --source-disk-zone="$ZONE" --storage-location="$REGION" >/dev/null
  gcloud compute snapshots create "$connector_snapshot" --source-disk="$OPENCONNECTOR_DISK" --source-disk-zone="$ZONE" --storage-location="$REGION" >/dev/null

  echo "Moving the OpenConnector disk and recreating the shared MIG instance..."
  gcloud compute instances stop "$LEGACY_VM" --zone="$ZONE" --quiet >/dev/null
  gcloud compute instances detach-disk "$LEGACY_VM" --zone="$ZONE" --disk="$OPENCONNECTOR_DISK" >/dev/null
  gcloud compute instances delete-access-config "$LEGACY_VM" --zone="$ZONE" --access-config-name=external-nat >/dev/null
  gcloud compute instance-groups managed set-instance-template "$MIG_NAME" --zone="$ZONE" --template="$SHARED_TEMPLATE" >/dev/null
  gcloud compute instance-groups managed recreate-instances "$MIG_NAME" --zone="$ZONE" --instances="$instance" >/dev/null
  gcloud compute instance-groups managed wait-until "$MIG_NAME" --zone="$ZONE" --stable --timeout=900 >/dev/null

  instance="$(shared_instance)"
  test -n "$instance"
  forget_instance_host_key "$instance"
  wait_for_ssh "$instance"
  for _ in $(seq 1 60); do
    if gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
      --command='test -x /usr/local/sbin/activate-hosted-claw && test -f /etc/systemd/system/openconnector.service' >/dev/null 2>&1; then
      break
    fi
    sleep 5
  done
  for _ in $(seq 1 120); do
    if ! gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
      --command='systemctl is-active --quiet google-startup-scripts.service' >/dev/null 2>&1; then
      break
    fi
    sleep 5
  done
  if gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
    --command='systemctl is-active --quiet google-startup-scripts.service' >/dev/null 2>&1; then
    echo "Shared VM startup script did not finish within 10 minutes." >&2
    exit 1
  fi
  if gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
    --command='systemctl is-failed --quiet google-startup-scripts.service' >/dev/null 2>&1; then
    echo "Shared VM startup script failed; inspect the serial console before continuing." >&2
    exit 1
  fi

  echo "Injecting operator-managed environments and starting services..."
  inject_root_file "$instance" "$temp_dir/worker.env" /etc/hosted-claw/worker.env
  inject_root_file "$instance" "$temp_dir/openconnector.env" /etc/openconnector/openconnector.env
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap --command='
    set -e
    sudo /usr/local/sbin/activate-hosted-claw
    sudo systemctl start openconnector openconnector-backup.timer
  ' >/dev/null

  if ! gcloud compute forwarding-rules describe "$FORWARDING_RULE" --region="$REGION" >/dev/null 2>&1; then
    gcloud compute forwarding-rules create "$FORWARDING_RULE" \
      --load-balancing-scheme=EXTERNAL --region="$REGION" --ip-protocol=TCP \
      --ports=80,443 --address="$OPENCONNECTOR_ADDRESS" --backend-service="$BACKEND_SERVICE" >/dev/null
  fi

  echo "Cutover complete. Pre-cutover snapshots: $hosted_snapshot, $connector_snapshot"
  echo "Keep $LEGACY_VM stopped for 48 hours, then run: $0 finalize"
}

rollback() {
  local instance temp_dir
  instance="$(shared_instance)"
  test -n "$instance"
  temp_dir="$(mktemp -d)"
  trap "rm -r -- '$temp_dir'" EXIT
  capture_root_file "$instance" /etc/hosted-claw/worker.env "$temp_dir/worker.env"

  gcloud compute forwarding-rules delete "$FORWARDING_RULE" --region="$REGION" --quiet >/dev/null 2>&1 || true
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
    --command='sudo systemctl stop openconnector hosted-claw-supervisor hosted-claw-litellm' >/dev/null
  gcloud compute instance-groups managed set-instance-template "$MIG_NAME" --zone="$ZONE" --template="$HOSTED_ONLY_TEMPLATE" >/dev/null
  gcloud compute instance-groups managed update "$MIG_NAME" --zone="$ZONE" \
    --remove-stateful-disks="$OPENCONNECTOR_DISK" >/dev/null
  gcloud compute instance-groups managed recreate-instances "$MIG_NAME" --zone="$ZONE" --instances="$instance" >/dev/null
  gcloud compute instance-groups managed wait-until "$MIG_NAME" --zone="$ZONE" --stable --timeout=900 >/dev/null
  instance="$(shared_instance)"
  forget_instance_host_key "$instance"
  wait_for_ssh "$instance"
  inject_root_file "$instance" "$temp_dir/worker.env" /etc/hosted-claw/worker.env
  gcloud compute scp "$REPO_ROOT/infra/hosted-claw/activate-hosted-claw.sh" \
    "$instance:/tmp/activate-hosted-claw" --zone="$ZONE" --tunnel-through-iap >/dev/null
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap --command='
    set -e
    sudo mv /tmp/activate-hosted-claw /usr/local/sbin/activate-hosted-claw
    sudo chown root:root /usr/local/sbin/activate-hosted-claw
    sudo chmod 0755 /usr/local/sbin/activate-hosted-claw
    sudo /usr/local/sbin/activate-hosted-claw
  ' >/dev/null

  gcloud compute instances attach-disk "$LEGACY_VM" --zone="$ZONE" \
    --disk="$OPENCONNECTOR_DISK" --device-name="$OPENCONNECTOR_DISK" >/dev/null
  address="$(gcloud compute addresses describe "$OPENCONNECTOR_ADDRESS" --region="$REGION" --format='value(address)')"
  gcloud compute instances add-access-config "$LEGACY_VM" --zone="$ZONE" --address="$address" >/dev/null
  gcloud compute instances start "$LEGACY_VM" --zone="$ZONE" >/dev/null
  echo "Rollback complete: OpenConnector is back on $LEGACY_VM."
}

finalize() {
  if [ "$(gcloud compute instances describe "$LEGACY_VM" --zone="$ZONE" --format='value(status)')" != TERMINATED ]; then
    echo "$LEGACY_VM must be stopped before finalization" >&2
    exit 1
  fi
  gcloud compute instances delete "$LEGACY_VM" --zone="$ZONE" --quiet >/dev/null
  project_number="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  gcloud storage buckets remove-iam-policy-binding gs://cpaautomation-openconnector-backups \
    --member="serviceAccount:${project_number}-compute@developer.gserviceaccount.com" \
    --role=roles/storage.objectAdmin >/dev/null 2>&1 || true
  echo "Legacy OpenConnector VM deleted; shared-host migration finalized."
}

case "${1:-}" in
  prepare) prepare ;;
  cutover) cutover ;;
  rollback) rollback ;;
  finalize) finalize ;;
  *) echo "Usage: $0 {prepare|cutover|rollback|finalize}" >&2; exit 2 ;;
esac
