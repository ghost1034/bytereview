#!/usr/bin/env bash
# Provision the single-instance Hosted Claw + OpenConnector data plane.
# The lean pilot puts the shared VM in a dedicated VPC and, by default, assigns
# OpenConnector's static IP directly to the size-one stateful MIG. Set
# EDGE_MODE=private to retain the passthrough load balancer and Cloud NAT.
# The worker receives no database, KMS decrypt, Slack-token, Secret Manager, or
# upstream-provider permissions.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
NETWORK="${NETWORK:-hosted-claw-pilot}"
SUBNETWORK="${SUBNETWORK:-hosted-claw-pilot-us-central1}"
SUBNET_RANGE="${SUBNET_RANGE:-10.72.0.0/28}"
EDGE_MODE="${EDGE_MODE:-direct}"
APPLY_MIG_TEMPLATE="${APPLY_MIG_TEMPLATE:-true}"
TEMPLATE_NAME="${TEMPLATE_NAME:-hosted-claw-pilot-lean-v1}"
MIG_NAME="${MIG_NAME:-hosted-claw-pilot-lean}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-2}"
BOOT_DISK_SIZE_GB="${BOOT_DISK_SIZE_GB:-30}"
BOOT_DISK_TYPE="${BOOT_DISK_TYPE:-pd-standard}"
WORKER_SA_NAME="${WORKER_SA_NAME:-hosted-claw-worker}"
WORKER_SA="${WORKER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
API_SA="${API_SA:-cpaautomation-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
DISK_NAME="${DISK_NAME:-hosted-claw-data-lean}"
DISK_DEVICE_NAME="${DISK_DEVICE_NAME:-hosted-claw-data}"
DISK_SIZE_GB="${DISK_SIZE_GB:-30}"
DISK_TYPE="${DISK_TYPE:-pd-standard}"
OPENCONNECTOR_DISK_NAME="${OPENCONNECTOR_DISK_NAME:-openconnector-data-lean}"
OPENCONNECTOR_DISK_DEVICE_NAME="${OPENCONNECTOR_DISK_DEVICE_NAME:-openconnector-data}"
OPENCONNECTOR_DISK_SIZE_GB="${OPENCONNECTOR_DISK_SIZE_GB:-10}"
OPENCONNECTOR_DISK_TYPE="${OPENCONNECTOR_DISK_TYPE:-pd-standard}"
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-${PROJECT_ID}-hosted-claw-artifacts}"
OPENCONNECTOR_BACKUP_BUCKET="${OPENCONNECTOR_BACKUP_BUCKET:-cpaautomation-openconnector-backups}"
OPENCONNECTOR_ADDRESS_NAME="${OPENCONNECTOR_ADDRESS_NAME:-openconnector-ip}"
OPENCONNECTOR_HEALTH_CHECK="${OPENCONNECTOR_HEALTH_CHECK:-openconnector-tcp-health}"
OPENCONNECTOR_BACKEND_SERVICE="${OPENCONNECTOR_BACKEND_SERVICE:-openconnector-web-backend}"
OPENCONNECTOR_FORWARDING_RULE="${OPENCONNECTOR_FORWARDING_RULE:-openconnector-web}"
PUBSUB_TOPIC="${PUBSUB_TOPIC:-hosted-claw-jobs}"
PUBSUB_SUBSCRIPTION="${PUBSUB_SUBSCRIPTION:-hosted-claw-pilot}"
SNAPSHOT_POLICY="${SNAPSHOT_POLICY:-hosted-claw-daily-7d}"
API_SERVICE="${API_SERVICE:-cpa-api}"
ROUTER_NAME="${ROUTER_NAME:-hosted-claw-router}"
NAT_NAME="${NAT_NAME:-hosted-claw-nat}"

case "$EDGE_MODE" in
  direct|private) ;;
  *) echo "EDGE_MODE must be direct or private" >&2; exit 2 ;;
esac
case "$APPLY_MIG_TEMPLATE" in
  true|false) ;;
  *) echo "APPLY_MIG_TEMPLATE must be true or false" >&2; exit 2 ;;
esac

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable compute.googleapis.com pubsub.googleapis.com artifactregistry.googleapis.com \
  iap.googleapis.com logging.googleapis.com monitoring.googleapis.com storage.googleapis.com >/dev/null
gcloud services enable cloudkms.googleapis.com >/dev/null

if ! gcloud compute networks describe "$NETWORK" >/dev/null 2>&1; then
  gcloud compute networks create "$NETWORK" --subnet-mode=custom
fi
if ! gcloud compute networks subnets describe "$SUBNETWORK" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute networks subnets create "$SUBNETWORK" --region="$REGION" \
    --network="$NETWORK" --range="$SUBNET_RANGE" --enable-private-ip-google-access
fi
if ! gcloud compute firewall-rules describe hosted-claw-allow-web >/dev/null 2>&1; then
  gcloud compute firewall-rules create hosted-claw-allow-web \
    --network="$NETWORK" --allow=tcp:80,tcp:443 --target-tags=openconnector \
    --source-ranges=0.0.0.0/0 --direction=INGRESS
fi
if ! gcloud compute firewall-rules describe hosted-claw-allow-iap-ssh >/dev/null 2>&1; then
  gcloud compute firewall-rules create hosted-claw-allow-iap-ssh \
    --network="$NETWORK" --allow=tcp:22 --target-tags=hosted-claw-iap \
    --source-ranges=35.235.240.0/20 --direction=INGRESS
fi

if [ "$EDGE_MODE" = private ]; then
  if ! gcloud compute routers describe "$ROUTER_NAME" --region="$REGION" >/dev/null 2>&1; then
    gcloud compute routers create "$ROUTER_NAME" --region="$REGION" --network="$NETWORK"
  fi
  if ! gcloud compute routers nats describe "$NAT_NAME" --router="$ROUTER_NAME" --region="$REGION" >/dev/null 2>&1; then
    gcloud compute routers nats create "$NAT_NAME" --router="$ROUTER_NAME" --region="$REGION" \
      --auto-allocate-nat-external-ips --nat-custom-subnet-ip-ranges="$SUBNETWORK"
  fi
fi

if ! gcloud iam service-accounts describe "$WORKER_SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$WORKER_SA_NAME" --display-name="Hosted Claw pilot worker"
fi

# Narrow project roles: consume job hints, pull private images, emit metadata
# logs/metrics, and invoke only the Cloud Run control plane.
for role in roles/artifactregistry.reader roles/logging.logWriter roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${WORKER_SA}" --role="$role" --condition=None >/dev/null
done
gcloud run services add-iam-policy-binding "$API_SERVICE" --region="$REGION" --member="serviceAccount:${WORKER_SA}" --role=roles/run.invoker >/dev/null

gcloud kms keyrings describe hosted-claw --location="$REGION" >/dev/null 2>&1 || \
  gcloud kms keyrings create hosted-claw --location="$REGION"
gcloud kms keys describe control-plane --keyring=hosted-claw --location="$REGION" >/dev/null 2>&1 || \
  gcloud kms keys create control-plane --keyring=hosted-claw --location="$REGION" --purpose=encryption
gcloud kms keys add-iam-policy-binding control-plane --keyring=hosted-claw --location="$REGION" \
  --member="serviceAccount:${API_SA}" --role=roles/cloudkms.cryptoKeyEncrypterDecrypter >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$API_SA" \
  --member="serviceAccount:${API_SA}" --role=roles/iam.serviceAccountTokenCreator >/dev/null

gcloud pubsub topics describe "$PUBSUB_TOPIC" >/dev/null 2>&1 || gcloud pubsub topics create "$PUBSUB_TOPIC"
gcloud pubsub subscriptions describe "$PUBSUB_SUBSCRIPTION" >/dev/null 2>&1 || \
  gcloud pubsub subscriptions create "$PUBSUB_SUBSCRIPTION" --topic="$PUBSUB_TOPIC" --ack-deadline=60 \
    --message-retention-duration=1d --expiration-period=never
gcloud pubsub subscriptions update "$PUBSUB_SUBSCRIPTION" --ack-deadline=60 \
  --message-retention-duration=1d --expiration-period=never >/dev/null
gcloud pubsub subscriptions add-iam-policy-binding "$PUBSUB_SUBSCRIPTION" \
  --member="serviceAccount:${WORKER_SA}" --role=roles/pubsub.subscriber >/dev/null

gcloud storage buckets describe "gs://${ARTIFACT_BUCKET}" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://${ARTIFACT_BUCKET}" --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets update "gs://${ARTIFACT_BUCKET}" --lifecycle-file="$(dirname "$0")/../infra/hosted-claw/gcs-lifecycle.json" >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${ARTIFACT_BUCKET}" \
  --member="serviceAccount:${API_SA}" --role=roles/storage.objectAdmin >/dev/null
gcloud pubsub topics add-iam-policy-binding "$PUBSUB_TOPIC" \
  --member="serviceAccount:${API_SA}" --role=roles/pubsub.publisher >/dev/null

gcloud storage buckets describe "gs://${OPENCONNECTOR_BACKUP_BUCKET}" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://${OPENCONNECTOR_BACKUP_BUCKET}" --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets update "gs://${OPENCONNECTOR_BACKUP_BUCKET}" \
  --lifecycle-file="$(dirname "$0")/../infra/openconnector/gcs-lifecycle.json" >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${OPENCONNECTOR_BACKUP_BUCKET}" \
  --member="serviceAccount:${WORKER_SA}" --role=roles/storage.objectAdmin >/dev/null

if ! gcloud compute resource-policies describe "$SNAPSHOT_POLICY" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute resource-policies create snapshot-schedule "$SNAPSHOT_POLICY" \
    --region="$REGION" --daily-schedule --start-time=04:00 --max-retention-days=7 \
    --on-source-disk-delete=keep-auto-snapshots --storage-location="$REGION"
fi
if ! gcloud compute disks describe "$DISK_NAME" --zone="$ZONE" >/dev/null 2>&1; then
  gcloud compute disks create "$DISK_NAME" --zone="$ZONE" --size="${DISK_SIZE_GB}GB" --type="$DISK_TYPE" \
    --resource-policies="$SNAPSHOT_POLICY"
fi
if ! gcloud compute disks describe "$OPENCONNECTOR_DISK_NAME" --zone="$ZONE" >/dev/null 2>&1; then
  gcloud compute disks create "$OPENCONNECTOR_DISK_NAME" --zone="$ZONE" \
    --size="${OPENCONNECTOR_DISK_SIZE_GB}GB" --type="$OPENCONNECTOR_DISK_TYPE"
fi
if ! gcloud compute disks describe "$OPENCONNECTOR_DISK_NAME" --zone="$ZONE" \
  --format='value(resourcePolicies)' | grep -q "/${SNAPSHOT_POLICY}$"; then
  gcloud compute disks add-resource-policies "$OPENCONNECTOR_DISK_NAME" \
    --zone="$ZONE" --resource-policies="$SNAPSHOT_POLICY"
fi

if ! gcloud compute addresses describe "$OPENCONNECTOR_ADDRESS_NAME" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute addresses create "$OPENCONNECTOR_ADDRESS_NAME" --region="$REGION"
fi
# The startup script installs Docker/ClamAV and starts a packaged supervisor.
# Provider credentials and the LiteLLM master key are injected by the operator
# at boot, not granted to tenant containers and not accessible through the API.
if ! gcloud compute instance-templates describe "$TEMPLATE_NAME" >/dev/null 2>&1; then
  network_args=(
    --network="projects/${PROJECT_ID}/global/networks/${NETWORK}"
    --subnet="projects/${PROJECT_ID}/regions/${REGION}/subnetworks/${SUBNETWORK}"
  )
  if [ "$EDGE_MODE" = private ]; then
    network_args+=(--no-address)
  fi
  gcloud compute instance-templates create "$TEMPLATE_NAME" \
    --machine-type="$MACHINE_TYPE" \
    "${network_args[@]}" \
    --tags=openconnector,hosted-claw-iap \
    --service-account="$WORKER_SA" --scopes=cloud-platform \
    --image-family=debian-12 --image-project=debian-cloud \
    --boot-disk-size="${BOOT_DISK_SIZE_GB}GB" --boot-disk-type="$BOOT_DISK_TYPE" \
    --disk="name=${DISK_NAME},device-name=${DISK_DEVICE_NAME},mode=rw,boot=no,auto-delete=no" \
    --disk="name=${OPENCONNECTOR_DISK_NAME},device-name=${OPENCONNECTOR_DISK_DEVICE_NAME},mode=rw,boot=no,auto-delete=no" \
    --metadata-from-file="startup-script=$(dirname "$0")/../infra/hosted-claw/startup.sh,hosted-claw-compose=$(dirname "$0")/../hosted_claw/docker-compose.yml,hosted-claw-litellm-config=$(dirname "$0")/../hosted_claw/litellm-config.yaml,hosted-claw-litellm-service=$(dirname "$0")/../infra/hosted-claw/hosted-claw-litellm.service,hosted-claw-supervisor-service=$(dirname "$0")/../infra/hosted-claw/hosted-claw-supervisor.service,hosted-claw-activate=$(dirname "$0")/../infra/hosted-claw/activate-hosted-claw.sh,hosted-claw-clamav-memory=$(dirname "$0")/../infra/hosted-claw/clamav-memory.conf,container-metadata-block=$(dirname "$0")/../infra/hosted-claw/block-container-metadata.sh,container-metadata-service=$(dirname "$0")/../infra/hosted-claw/container-metadata-firewall.service,hosted-claw-ops-agent-config=$(dirname "$0")/../infra/hosted-claw/ops-agent-config.yaml,openconnector-compose=$(dirname "$0")/../infra/openconnector/docker-compose.yml,openconnector-caddy=$(dirname "$0")/../infra/openconnector/Caddyfile,openconnector-service=$(dirname "$0")/../infra/openconnector/openconnector.service,openconnector-backup-script=$(dirname "$0")/backup-openconnector.sh,openconnector-backup-service=$(dirname "$0")/../infra/openconnector/openconnector-backup.service,openconnector-backup-timer=$(dirname "$0")/../infra/openconnector/openconnector-backup.timer" \
    --labels=service=hosted-claw,pilot=true
fi

if ! gcloud compute instance-groups managed describe "$MIG_NAME" --zone="$ZONE" >/dev/null 2>&1; then
  gcloud compute instance-groups managed create "$MIG_NAME" --zone="$ZONE" --size=1 --template="$TEMPLATE_NAME"
  gcloud compute instance-groups managed update "$MIG_NAME" --zone="$ZONE" \
    --stateful-disk="device-name=${DISK_DEVICE_NAME},auto-delete=never" \
    --stateful-disk="device-name=${OPENCONNECTOR_DISK_DEVICE_NAME},auto-delete=never" \
    --update-policy-replacement-method=recreate --update-policy-max-surge=0 \
    --update-policy-max-unavailable=1
elif [ "$APPLY_MIG_TEMPLATE" = true ]; then
  # Instance templates are immutable. Point an existing pilot MIG at the
  # requested template so rerunning this script actually applies bootstrap
  # and service-unit changes instead of silently retaining an older template.
  gcloud compute instance-groups managed set-instance-template "$MIG_NAME" \
    --zone="$ZONE" --template="$TEMPLATE_NAME"
  gcloud compute instance-groups managed update "$MIG_NAME" --zone="$ZONE" \
    --stateful-disk="device-name=${DISK_DEVICE_NAME},auto-delete=never" \
    --stateful-disk="device-name=${OPENCONNECTOR_DISK_DEVICE_NAME},auto-delete=never" \
    --update-policy-replacement-method=recreate --update-policy-max-surge=0 \
    --update-policy-max-unavailable=1
else
  echo "Prepared $TEMPLATE_NAME without changing the live $MIG_NAME configuration."
fi

if [ "$EDGE_MODE" = private ]; then
  if ! gcloud compute health-checks describe "$OPENCONNECTOR_HEALTH_CHECK" --region="$REGION" >/dev/null 2>&1; then
    gcloud compute health-checks create tcp "$OPENCONNECTOR_HEALTH_CHECK" --region="$REGION" --port=80
  fi
  if ! gcloud compute backend-services describe "$OPENCONNECTOR_BACKEND_SERVICE" --region="$REGION" >/dev/null 2>&1; then
    gcloud compute backend-services create "$OPENCONNECTOR_BACKEND_SERVICE" \
      --load-balancing-scheme=EXTERNAL --protocol=TCP --region="$REGION" \
      --health-checks="$OPENCONNECTOR_HEALTH_CHECK" --health-checks-region="$REGION"
  fi
  if ! gcloud compute backend-services describe "$OPENCONNECTOR_BACKEND_SERVICE" --region="$REGION" \
    --format='value(backends[].group)' | grep -q "/instanceGroups/${MIG_NAME}$"; then
    gcloud compute backend-services add-backend "$OPENCONNECTOR_BACKEND_SERVICE" \
      --instance-group="$MIG_NAME" --instance-group-zone="$ZONE" --region="$REGION"
  fi
  if ! gcloud compute forwarding-rules describe "$OPENCONNECTOR_FORWARDING_RULE" --region="$REGION" >/dev/null 2>&1 \
    && [ -z "$(gcloud compute addresses describe "$OPENCONNECTOR_ADDRESS_NAME" --region="$REGION" --format='value(users)')" ]; then
    gcloud compute forwarding-rules create "$OPENCONNECTOR_FORWARDING_RULE" \
      --load-balancing-scheme=EXTERNAL --region="$REGION" --ip-protocol=TCP \
      --ports=80,443 --address="$OPENCONNECTOR_ADDRESS_NAME" \
      --backend-service="$OPENCONNECTOR_BACKEND_SERVICE"
  fi
elif [ "$APPLY_MIG_TEMPLATE" = true ] \
  && [ -z "$(gcloud compute addresses describe "$OPENCONNECTOR_ADDRESS_NAME" --region="$REGION" --format='value(users)')" ]; then
  instance="$(gcloud compute instance-groups managed list-instances "$MIG_NAME" --zone="$ZONE" --format='value(instance.basename())' | head -n1)"
  if ! gcloud compute instance-groups managed instance-configs list "$MIG_NAME" \
    --zone="$ZONE" --format='value(name)' | grep -Fxq "$instance"; then
    gcloud compute instance-groups managed instance-configs create "$MIG_NAME" \
      --zone="$ZONE" --instance="$instance" \
      --stateful-external-ip="interface-name=nic0,address=projects/${PROJECT_ID}/regions/${REGION}/addresses/${OPENCONNECTOR_ADDRESS_NAME},auto-delete=never"
  fi
fi

echo "Shared Hosted Claw + OpenConnector infrastructure is prepared."
echo "Recovery target: recreate the size-one MIG and attach the newest <=24h snapshot within 30 minutes."
echo "Before enabling intake, inject both root-owned environment files and run isolation/load tests."
