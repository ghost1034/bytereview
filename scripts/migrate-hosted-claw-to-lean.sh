#!/usr/bin/env bash
# Migrate the shared Hosted Claw/OpenConnector pilot to the lean always-on shape.
#
# Usage:
#   scripts/migrate-hosted-claw-to-lean.sh prepare
#   scripts/migrate-hosted-claw-to-lean.sh cutover
#   scripts/migrate-hosted-claw-to-lean.sh rollback
#   scripts/migrate-hosted-claw-to-lean.sh finalize

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
MIG_NAME="${MIG_NAME:-hosted-claw-pilot}"
LEAN_MIG_NAME="${LEAN_MIG_NAME:-hosted-claw-pilot-lean}"
OLD_TEMPLATE="${OLD_TEMPLATE:-hosted-claw-pilot-v7}"
LEAN_TEMPLATE="${LEAN_TEMPLATE:-hosted-claw-pilot-lean-v1}"
OLD_HOSTED_DISK="${OLD_HOSTED_DISK:-hosted-claw-data}"
OLD_CONNECTOR_DISK="${OLD_CONNECTOR_DISK:-openconnector-data}"
LEAN_HOSTED_DISK="${LEAN_HOSTED_DISK:-hosted-claw-data-lean}"
LEAN_CONNECTOR_DISK="${LEAN_CONNECTOR_DISK:-openconnector-data-lean}"
ADDRESS_NAME="${ADDRESS_NAME:-openconnector-ip}"
FORWARDING_RULE="${FORWARDING_RULE:-openconnector-web}"
BACKEND_SERVICE="${BACKEND_SERVICE:-openconnector-web-backend}"
HEALTH_CHECK="${HEALTH_CHECK:-openconnector-tcp-health}"
ROUTER_NAME="${ROUTER_NAME:-hosted-claw-router}"
NAT_NAME="${NAT_NAME:-hosted-claw-nat}"
ROLLBACK_SECONDS="${ROLLBACK_SECONDS:-604800}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

gcloud config set project "$PROJECT_ID" >/dev/null

shared_instance() {
  local group="${1:-$MIG_NAME}"
  gcloud compute instance-groups managed list-instances "$group" --zone="$ZONE" \
    --format='value(instance.basename())' | head -n1
}

wait_for_ssh() {
  local instance="$1"
  for _ in $(seq 1 90); do
    if gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
      --command='true' >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  echo "Timed out waiting for IAP SSH on $instance" >&2
  return 1
}

wait_for_startup() {
  local instance="$1"
  for _ in $(seq 1 120); do
    if gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
      --command='test -x /usr/local/sbin/activate-hosted-claw && ! systemctl is-active --quiet google-startup-scripts.service' \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  if gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
    --command='systemctl is-failed --quiet google-startup-scripts.service' >/dev/null 2>&1; then
    echo "Startup script failed on $instance" >&2
    return 1
  fi
  echo "Startup did not finish within 10 minutes" >&2
  return 1
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
  local remote_tmp="/tmp/$(basename "$remote_path").lean-migration"
  gcloud compute scp "$local_path" "$instance:$remote_tmp" --zone="$ZONE" \
    --tunnel-through-iap >/dev/null
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap --command="
    set -e
    sudo mkdir -p '$(dirname "$remote_path")'
    sudo mv '$remote_tmp' '$remote_path'
    sudo chown root:root '$remote_path'
    sudo chmod 0600 '$remote_path'
  " >/dev/null
}

ensure_worker_defaults() {
  local env_file="$1" key
  for key in \
    HOSTED_CLAW_MAX_TURNS=3 \
    HOSTED_CLAW_MAX_RESIDENT_RUNTIMES=3 \
    HOSTED_CLAW_IDLE_SECONDS=300 \
    HOSTED_CLAW_PROGRESS_DELAY_SECONDS=3; do
    if grep -q "^${key%%=*}=" "$env_file"; then
      sed -i.bak "s/^${key%%=*}=.*/$key/" "$env_file"
      rm -f -- "$env_file.bak"
    else
      printf '%s\n' "$key" >>"$env_file"
    fi
  done
}

attach_copy_disk() {
  local instance="$1" disk="$2" device="$3"
  if [ -z "$(gcloud compute disks describe "$disk" --zone="$ZONE" --format='value(users)')" ]; then
    gcloud compute instances attach-disk "$instance" --zone="$ZONE" --disk="$disk" \
      --device-name="$device" >/dev/null
  fi
}

detach_copy_disk() {
  local instance="$1" disk="$2"
  if [ -n "$(gcloud compute disks describe "$disk" --zone="$ZONE" --format='value(users)')" ]; then
    gcloud compute instances detach-disk "$instance" --zone="$ZONE" --disk="$disk" >/dev/null
  fi
}

sync_to_lean_disks() {
  local instance="$1"
  attach_copy_disk "$instance" "$LEAN_HOSTED_DISK" hosted-lean-copy
  attach_copy_disk "$instance" "$LEAN_CONNECTOR_DISK" connector-lean-copy
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap --command='
    set -euo pipefail
    hosted=/dev/disk/by-id/google-hosted-lean-copy
    connector=/dev/disk/by-id/google-connector-lean-copy
    for _ in $(seq 1 60); do
      [ -e "$hosted" ] && [ -e "$connector" ] && break
      sleep 1
    done
    [ -e "$hosted" ] && [ -e "$connector" ]
    sudo apt-get update -qq
    sudo apt-get install -y -qq rsync xfsprogs >/dev/null
    if ! sudo blkid "$hosted" >/dev/null 2>&1; then sudo mkfs.xfs -f "$hosted" >/dev/null; fi
    if ! sudo blkid "$connector" >/dev/null 2>&1; then sudo mkfs.ext4 -m 0 "$connector" >/dev/null; fi
    sudo mkdir -p /mnt/hosted-lean-copy /mnt/connector-lean-copy
    mountpoint -q /mnt/hosted-lean-copy || sudo mount "$hosted" /mnt/hosted-lean-copy
    mountpoint -q /mnt/connector-lean-copy || sudo mount "$connector" /mnt/connector-lean-copy
    sudo rsync -aHAX --numeric-ids --delete /srv/hosted-claw/ /mnt/hosted-lean-copy/
    sudo rsync -aHAX --numeric-ids --delete /mnt/openconnector-data/ /mnt/connector-lean-copy/
    sync
    sudo umount /mnt/hosted-lean-copy /mnt/connector-lean-copy
  ' >/dev/null
  detach_copy_disk "$instance" "$LEAN_HOSTED_DISK"
  detach_copy_disk "$instance" "$LEAN_CONNECTOR_DISK"
}

sync_back_to_old_disks() {
  local instance="$1"
  attach_copy_disk "$instance" "$OLD_HOSTED_DISK" hosted-old-copy
  attach_copy_disk "$instance" "$OLD_CONNECTOR_DISK" connector-old-copy
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap --command='
    set -euo pipefail
    hosted=/dev/disk/by-id/google-hosted-old-copy
    connector=/dev/disk/by-id/google-connector-old-copy
    for _ in $(seq 1 60); do
      [ -e "$hosted" ] && [ -e "$connector" ] && break
      sleep 1
    done
    [ -e "$hosted" ] && [ -e "$connector" ]
    sudo mkdir -p /mnt/hosted-old-copy /mnt/connector-old-copy
    sudo mount "$hosted" /mnt/hosted-old-copy
    sudo mount "$connector" /mnt/connector-old-copy
    sudo rsync -aHAX --numeric-ids --delete /srv/hosted-claw/ /mnt/hosted-old-copy/
    sudo rsync -aHAX --numeric-ids --delete /mnt/openconnector-data/ /mnt/connector-old-copy/
    sync
    sudo umount /mnt/hosted-old-copy /mnt/connector-old-copy
  ' >/dev/null
  detach_copy_disk "$instance" "$OLD_HOSTED_DISK"
  detach_copy_disk "$instance" "$OLD_CONNECTOR_DISK"
}

set_direct_ip_config() {
  local group="$1" instance="$2" apply_now="${3:-false}" address_ref hosted_ref connector_ref update_flag
  address_ref="projects/${PROJECT_ID}/regions/${REGION}/addresses/${ADDRESS_NAME}"
  hosted_ref="projects/${PROJECT_ID}/zones/${ZONE}/disks/${LEAN_HOSTED_DISK}"
  connector_ref="projects/${PROJECT_ID}/zones/${ZONE}/disks/${LEAN_CONNECTOR_DISK}"
  update_flag=--no-update-instance
  if [ "$apply_now" = true ]; then update_flag=--update-instance; fi
  if gcloud compute instance-groups managed instance-configs list "$group" --zone="$ZONE" \
    --format='value(name)' | grep -Fxq "$instance"; then
    gcloud compute instance-groups managed instance-configs update "$group" --zone="$ZONE" \
      --instance="$instance" "$update_flag" \
      --stateful-disk="device-name=hosted-claw-data,source=${hosted_ref},mode=rw,auto-delete=never" \
      --stateful-disk="device-name=openconnector-data,source=${connector_ref},mode=rw,auto-delete=never" \
      --stateful-external-ip="interface-name=nic0,address=${address_ref},auto-delete=never" >/dev/null
  else
    gcloud compute instance-groups managed instance-configs create "$group" --zone="$ZONE" \
      --instance="$instance" "$update_flag" \
      --stateful-disk="device-name=hosted-claw-data,source=${hosted_ref},mode=rw,auto-delete=never" \
      --stateful-disk="device-name=openconnector-data,source=${connector_ref},mode=rw,auto-delete=never" \
      --stateful-external-ip="interface-name=nic0,address=${address_ref},auto-delete=never" >/dev/null
  fi
}

wait_for_no_active_turns() {
  local instance="$1" active
  for _ in $(seq 1 180); do
    active="$(gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap \
      --command='sudo cat /run/hosted-claw/active-turns 2>/dev/null || echo unavailable' 2>/dev/null)"
    if [ "$active" = 0 ]; then return 0; fi
    if [ "$active" = unavailable ]; then
      echo "The deployed supervisor does not expose active-turn state; deploy the lean supervisor image first." >&2
      return 1
    fi
    sleep 2
  done
  echo "Hosted Claw still has an active turn; cutover aborted." >&2
  return 1
}

finish_cutover() {
  local lean_instance="$1" expected_ip actual_ip
  expected_ip="$(gcloud compute addresses describe "$ADDRESS_NAME" --region="$REGION" --format='value(address)')"
  actual_ip="$(gcloud compute instances describe "$lean_instance" --zone="$ZONE" \
    --format='value(networkInterfaces[0].accessConfigs[0].natIP)')"
  if [ "$actual_ip" != "$expected_ip" ]; then
    echo "$lean_instance does not own the reserved production IP; refusing cutover cleanup" >&2
    return 1
  fi
  curl -fsS --max-time 10 https://connect.cpaautomation.ai/health >/dev/null

  gcloud compute instance-groups managed resize "$MIG_NAME" --zone="$ZONE" --size=0 >/dev/null
  gcloud compute instance-groups managed wait-until "$MIG_NAME" --zone="$ZONE" \
    --stable --timeout=900 >/dev/null

  gcloud compute backend-services delete "$BACKEND_SERVICE" --region="$REGION" --quiet >/dev/null 2>&1 || true
  gcloud compute health-checks delete "$HEALTH_CHECK" --region="$REGION" --quiet >/dev/null 2>&1 || true
  gcloud compute routers nats delete "$NAT_NAME" --router="$ROUTER_NAME" --region="$REGION" --quiet >/dev/null 2>&1 || true
  gcloud compute routers delete "$ROUTER_NAME" --region="$REGION" --quiet >/dev/null 2>&1 || true
}

recreate_instance() {
  local old_instance="$1" instance
  gcloud compute instance-groups managed recreate-instances "$MIG_NAME" --zone="$ZONE" \
    --instances="$old_instance" >/dev/null
  gcloud compute instance-groups managed wait-until "$MIG_NAME" --zone="$ZONE" \
    --stable --timeout=900 >/dev/null
  instance="$(shared_instance)"
  test -n "$instance"
  wait_for_ssh "$instance"
  wait_for_startup "$instance"
  printf '%s\n' "$instance"
}

prepare() {
  APPLY_MIG_TEMPLATE=false EDGE_MODE=direct MIG_NAME="$MIG_NAME" TEMPLATE_NAME="$LEAN_TEMPLATE" \
    DISK_NAME="$LEAN_HOSTED_DISK" OPENCONNECTOR_DISK_NAME="$LEAN_CONNECTOR_DISK" \
    "$REPO_ROOT/scripts/setup-hosted-claw-pilot.sh"
  local instance
  instance="$(shared_instance)"
  test -n "$instance"
  sync_to_lean_disks "$instance"
  echo "Lean network, disks, and template prepared; the live MIG is unchanged."
}

cutover() {
  local instance lean_instance temp_dir stamp epoch hosted_snapshot connector_snapshot expected_ip actual_ip lean_size
  if gcloud compute instance-groups managed describe "$LEAN_MIG_NAME" --zone="$ZONE" >/dev/null 2>&1; then
    lean_size="$(gcloud compute instance-groups managed describe "$LEAN_MIG_NAME" --zone="$ZONE" \
      --format='value(targetSize)')"
    if [ "$lean_size" = 1 ]; then
      lean_instance="$(shared_instance "$LEAN_MIG_NAME")"
      test -n "$lean_instance"
      if curl -fsS --max-time 10 https://connect.cpaautomation.ai/health >/dev/null; then
        finish_cutover "$lean_instance"
        echo "Lean cutover resumed and completed on $lean_instance."
        echo "Do not run finalize until at least seven healthy days have elapsed."
        return
      fi
      echo "$LEAN_MIG_NAME already has a live instance, but production health failed; refusing to restart disk migration" >&2
      return 1
    fi
  fi
  instance="$(shared_instance)"
  test -n "$instance"
  wait_for_no_active_turns "$instance"
  temp_dir="$(mktemp -d)"
  trap 'rm -r -- "$temp_dir"' EXIT
  capture_root_file "$instance" /etc/hosted-claw/worker.env "$temp_dir/worker.env"
  capture_root_file "$instance" /etc/openconnector/openconnector.env "$temp_dir/openconnector.env"
  ensure_worker_defaults "$temp_dir/worker.env"

  gcloud compute instance-templates describe "$LEAN_TEMPLATE" >/dev/null
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap --command='
    set -e
    sudo systemctl stop hosted-claw-supervisor hosted-claw-litellm openconnector openconnector-backup.timer
  ' >/dev/null
  sync_to_lean_disks "$instance"

  stamp="$(date -u +%Y%m%d-%H%M%S)"
  epoch="$(date -u +%s)"
  hosted_snapshot="${OLD_HOSTED_DISK}-pre-lean-${stamp}"
  connector_snapshot="${OLD_CONNECTOR_DISK}-pre-lean-${stamp}"
  gcloud compute snapshots create "$hosted_snapshot" --source-disk="$OLD_HOSTED_DISK" \
    --source-disk-zone="$ZONE" --storage-location="$REGION" >/dev/null
  gcloud compute snapshots create "$connector_snapshot" --source-disk="$OLD_CONNECTOR_DISK" \
    --source-disk-zone="$ZONE" --storage-location="$REGION" >/dev/null
  for disk in "$OLD_HOSTED_DISK" "$OLD_CONNECTOR_DISK"; do
    gcloud compute disks add-labels "$disk" --zone="$ZONE" \
      --labels="lean-cutover-epoch=${epoch}" >/dev/null
  done

  gcloud compute forwarding-rules delete "$FORWARDING_RULE" --region="$REGION" --quiet >/dev/null 2>&1 || true
  if gcloud compute instance-groups managed instance-configs list "$MIG_NAME" --zone="$ZONE" \
    --format='value(name)' | grep -Fxq "$instance"; then
    gcloud compute instance-groups managed instance-configs delete "$MIG_NAME" --zone="$ZONE" \
      --instances="$instance" --no-update-instance >/dev/null
  fi
  if ! gcloud compute instance-groups managed describe "$LEAN_MIG_NAME" --zone="$ZONE" >/dev/null 2>&1; then
    gcloud compute instance-groups managed create "$LEAN_MIG_NAME" --zone="$ZONE" \
      --size=1 --template="$LEAN_TEMPLATE" >/dev/null
    gcloud compute instance-groups managed update "$LEAN_MIG_NAME" --zone="$ZONE" \
      --stateful-disk='device-name=hosted-claw-data,auto-delete=never' \
      --stateful-disk='device-name=openconnector-data,auto-delete=never' \
      --update-policy-replacement-method=recreate --update-policy-max-surge=0 \
      --update-policy-max-unavailable=1 >/dev/null
  else
    gcloud compute instance-groups managed resize "$LEAN_MIG_NAME" --zone="$ZONE" --size=1 >/dev/null
  fi
  gcloud compute instance-groups managed wait-until "$LEAN_MIG_NAME" --zone="$ZONE" \
    --stable --timeout=900 >/dev/null
  lean_instance="$(shared_instance "$LEAN_MIG_NAME")"
  test -n "$lean_instance"
  wait_for_ssh "$lean_instance"
  wait_for_startup "$lean_instance"
  set_direct_ip_config "$LEAN_MIG_NAME" "$lean_instance" true

  inject_root_file "$lean_instance" "$temp_dir/worker.env" /etc/hosted-claw/worker.env
  inject_root_file "$lean_instance" "$temp_dir/openconnector.env" /etc/openconnector/openconnector.env
  gcloud compute ssh "$lean_instance" --zone="$ZONE" --tunnel-through-iap --command='
    set -e
    sudo /usr/local/sbin/activate-hosted-claw
    sudo systemctl start openconnector openconnector-backup.timer
    sudo systemctl is-active --quiet hosted-claw-supervisor openconnector
  ' >/dev/null

  for _ in $(seq 1 60); do
    if curl -fsS --max-time 5 https://connect.cpaautomation.ai/health >/dev/null; then break; fi
    sleep 2
  done
  finish_cutover "$lean_instance"

  echo "Lean cutover complete on $lean_instance. Rollback snapshots: $hosted_snapshot, $connector_snapshot"
  echo "Do not run finalize until at least seven healthy days have elapsed."
}

rollback() {
  local instance old_instance temp_dir address
  instance="$(shared_instance "$LEAN_MIG_NAME")"
  test -n "$instance"
  temp_dir="$(mktemp -d)"
  trap 'rm -r -- "$temp_dir"' EXIT
  capture_root_file "$instance" /etc/hosted-claw/worker.env "$temp_dir/worker.env"
  capture_root_file "$instance" /etc/openconnector/openconnector.env "$temp_dir/openconnector.env"
  gcloud compute ssh "$instance" --zone="$ZONE" --tunnel-through-iap --command='
    set -e
    sudo systemctl stop hosted-claw-supervisor hosted-claw-litellm openconnector openconnector-backup.timer
  ' >/dev/null
  sync_back_to_old_disks "$instance"

  gcloud compute routers describe "$ROUTER_NAME" --region="$REGION" >/dev/null 2>&1 || \
    gcloud compute routers create "$ROUTER_NAME" --region="$REGION" --network=default >/dev/null
  gcloud compute routers nats describe "$NAT_NAME" --router="$ROUTER_NAME" --region="$REGION" >/dev/null 2>&1 || \
    gcloud compute routers nats create "$NAT_NAME" --router="$ROUTER_NAME" --region="$REGION" \
      --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges >/dev/null
  gcloud compute instance-groups managed instance-configs delete "$LEAN_MIG_NAME" --zone="$ZONE" \
    --instances="$instance" --no-update-instance >/dev/null
  gcloud compute instance-groups managed resize "$LEAN_MIG_NAME" --zone="$ZONE" --size=0 >/dev/null
  gcloud compute instance-groups managed wait-until "$LEAN_MIG_NAME" --zone="$ZONE" \
    --stable --timeout=900 >/dev/null
  gcloud compute instance-groups managed resize "$MIG_NAME" --zone="$ZONE" --size=1 >/dev/null
  gcloud compute instance-groups managed wait-until "$MIG_NAME" --zone="$ZONE" \
    --stable --timeout=900 >/dev/null
  old_instance="$(shared_instance "$MIG_NAME")"
  test -n "$old_instance"
  wait_for_ssh "$old_instance"
  wait_for_startup "$old_instance"
  inject_root_file "$old_instance" "$temp_dir/worker.env" /etc/hosted-claw/worker.env
  inject_root_file "$old_instance" "$temp_dir/openconnector.env" /etc/openconnector/openconnector.env
  gcloud compute ssh "$old_instance" --zone="$ZONE" --tunnel-through-iap --command='
    set -e
    sudo /usr/local/sbin/activate-hosted-claw
    sudo systemctl start openconnector openconnector-backup.timer
  ' >/dev/null

  gcloud compute health-checks create tcp "$HEALTH_CHECK" --region="$REGION" --port=80 >/dev/null 2>&1 || true
  gcloud compute backend-services create "$BACKEND_SERVICE" --load-balancing-scheme=EXTERNAL \
    --protocol=TCP --region="$REGION" --health-checks="$HEALTH_CHECK" \
    --health-checks-region="$REGION" >/dev/null 2>&1 || true
  gcloud compute backend-services add-backend "$BACKEND_SERVICE" --region="$REGION" \
    --instance-group="$MIG_NAME" --instance-group-zone="$ZONE" >/dev/null 2>&1 || true
  address="$(gcloud compute addresses describe "$ADDRESS_NAME" --region="$REGION" --format='value(address)')"
  gcloud compute forwarding-rules create "$FORWARDING_RULE" --load-balancing-scheme=EXTERNAL \
    --region="$REGION" --ip-protocol=TCP --ports=80,443 --address="$address" \
    --backend-service="$BACKEND_SERVICE" >/dev/null
  echo "Rollback complete on $old_instance using $OLD_TEMPLATE."
}

finalize() {
  local template old_size epoch now age disk vm status snapshot_names hermes_status
  template="$(gcloud compute instance-groups managed describe "$LEAN_MIG_NAME" --zone="$ZONE" \
    --format='value(instanceTemplate.basename())')"
  if [ "$template" != "$LEAN_TEMPLATE" ]; then
    echo "$LEAN_MIG_NAME is not using $LEAN_TEMPLATE; refusing finalization" >&2
    exit 1
  fi
  old_size="$(gcloud compute instance-groups managed describe "$MIG_NAME" --zone="$ZONE" \
    --format='value(targetSize)')"
  if [ "$old_size" != 0 ]; then
    echo "$MIG_NAME must remain scaled to zero before finalization" >&2
    exit 1
  fi
  epoch="$(gcloud compute disks describe "$OLD_HOSTED_DISK" --zone="$ZONE" \
    --format='value(labels.lean-cutover-epoch)')"
  now="$(date -u +%s)"
  test -n "$epoch"
  age=$((now - epoch))
  if [ "$age" -lt "$ROLLBACK_SECONDS" ]; then
    echo "The seven-day rollback window has not elapsed; refusing finalization" >&2
    exit 1
  fi
  for disk in "$OLD_HOSTED_DISK" "$OLD_CONNECTOR_DISK"; do
    if [ -n "$(gcloud compute disks describe "$disk" --zone="$ZONE" --format='value(users)')" ]; then
      echo "$disk is still attached; refusing finalization" >&2
      exit 1
    fi
  done
  gcloud compute instance-groups managed delete "$MIG_NAME" --zone="$ZONE" --quiet >/dev/null
  gcloud compute disks delete "$OLD_HOSTED_DISK" "$OLD_CONNECTOR_DISK" --zone="$ZONE" --quiet >/dev/null
  snapshot_names="$(gcloud compute snapshots list \
    --filter="name~'(${OLD_HOSTED_DISK}|${OLD_CONNECTOR_DISK})-pre-lean-'" --format='value(name)')"
  if [ -n "$snapshot_names" ]; then
    # shellcheck disable=SC2086
    gcloud compute snapshots delete $snapshot_names --quiet >/dev/null
  fi
  gcloud compute firewall-rules delete allow-openconnector-web --quiet >/dev/null 2>&1 || true

  if [ "${DELETE_LEGACY_RESOURCES:-false}" = true ]; then
    for vm in openclaw-gateway openconnector; do
      status="$(gcloud compute instances describe "$vm" --zone="$ZONE" --format='value(status)' 2>/dev/null || true)"
      if [ -n "$status" ] && [ "$status" != TERMINATED ]; then
        echo "$vm is not terminated; refusing legacy cleanup" >&2
        exit 1
      fi
    done
    hermes_status="$(gcloud compute instances describe hermes-vm --zone=us-west1-b --format='value(status)' 2>/dev/null || true)"
    if [ -n "$hermes_status" ] && [ "$hermes_status" != TERMINATED ]; then
      echo "hermes-vm is not terminated; refusing legacy cleanup" >&2
      exit 1
    fi
    for vm in openclaw-gateway openconnector; do
      gcloud compute instances delete "$vm" --zone="$ZONE" --quiet >/dev/null 2>&1 || true
    done
    gcloud compute instances delete hermes-vm --zone=us-west1-b --quiet >/dev/null 2>&1 || true
    gcloud compute snapshots delete snapshot-1 --quiet >/dev/null 2>&1 || true
  fi
  echo "Lean migration finalized; old shared data disks and rollback snapshots were deleted."
}

case "${1:-}" in
  prepare) prepare ;;
  cutover) cutover ;;
  rollback) rollback ;;
  finalize) finalize ;;
  *) echo "Usage: $0 {prepare|cutover|rollback|finalize}" >&2; exit 2 ;;
esac
