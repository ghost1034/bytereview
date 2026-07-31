#!/usr/bin/env bash
# Provision the opt-in, single-instance hosted-Claw pilot data plane.
# This script creates no public ingress and grants no database, KMS decrypt,
# Slack-token, Secret Manager, or upstream-provider permissions to the worker.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ace-rider-383100}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
NETWORK="${NETWORK:-default}"
MIG_NAME="${MIG_NAME:-hosted-claw-pilot}"
TEMPLATE_NAME="${TEMPLATE_NAME:-hosted-claw-pilot-v1}"
WORKER_SA_NAME="${WORKER_SA_NAME:-hosted-claw-worker}"
WORKER_SA="${WORKER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
API_SA="${API_SA:-cpaautomation-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
DISK_NAME="${DISK_NAME:-hosted-claw-data}"
DISK_DEVICE_NAME="${DISK_DEVICE_NAME:-hosted-claw-data}"
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-${PROJECT_ID}-hosted-claw-artifacts}"
PUBSUB_TOPIC="${PUBSUB_TOPIC:-hosted-claw-jobs}"
PUBSUB_SUBSCRIPTION="${PUBSUB_SUBSCRIPTION:-hosted-claw-pilot}"
SNAPSHOT_POLICY="${SNAPSHOT_POLICY:-hosted-claw-daily-14d}"
API_SERVICE="${API_SERVICE:-cpa-api}"
ROUTER_NAME="${ROUTER_NAME:-hosted-claw-router}"
NAT_NAME="${NAT_NAME:-hosted-claw-nat}"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable compute.googleapis.com pubsub.googleapis.com artifactregistry.googleapis.com logging.googleapis.com monitoring.googleapis.com storage.googleapis.com >/dev/null
gcloud services enable cloudkms.googleapis.com >/dev/null

if ! gcloud compute routers describe "$ROUTER_NAME" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute routers create "$ROUTER_NAME" --region="$REGION" --network="$NETWORK"
fi
if ! gcloud compute routers nats describe "$NAT_NAME" --router="$ROUTER_NAME" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute routers nats create "$NAT_NAME" --router="$ROUTER_NAME" --region="$REGION" \
    --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges
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
  gcloud pubsub subscriptions create "$PUBSUB_SUBSCRIPTION" --topic="$PUBSUB_TOPIC" --ack-deadline=60 --message-retention-duration=1d
gcloud pubsub subscriptions add-iam-policy-binding "$PUBSUB_SUBSCRIPTION" \
  --member="serviceAccount:${WORKER_SA}" --role=roles/pubsub.subscriber >/dev/null

gcloud storage buckets describe "gs://${ARTIFACT_BUCKET}" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://${ARTIFACT_BUCKET}" --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets update "gs://${ARTIFACT_BUCKET}" --lifecycle-file="$(dirname "$0")/../infra/hosted-claw/gcs-lifecycle.json" >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${ARTIFACT_BUCKET}" \
  --member="serviceAccount:${API_SA}" --role=roles/storage.objectAdmin >/dev/null
gcloud pubsub topics add-iam-policy-binding "$PUBSUB_TOPIC" \
  --member="serviceAccount:${API_SA}" --role=roles/pubsub.publisher >/dev/null

if ! gcloud compute resource-policies describe "$SNAPSHOT_POLICY" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute resource-policies create snapshot-schedule "$SNAPSHOT_POLICY" \
    --region="$REGION" --daily-schedule --start-time=04:00 --max-retention-days=14 \
    --on-source-disk-delete=keep-auto-snapshots --storage-location="$REGION"
fi
if ! gcloud compute disks describe "$DISK_NAME" --zone="$ZONE" >/dev/null 2>&1; then
  gcloud compute disks create "$DISK_NAME" --zone="$ZONE" --size=250GB --type=pd-balanced \
    --resource-policies="$SNAPSHOT_POLICY"
fi

# The startup script installs Docker/ClamAV and starts a packaged supervisor.
# Provider credentials and the LiteLLM master key are injected by the operator
# at boot, not granted to tenant containers and not accessible through the API.
if ! gcloud compute instance-templates describe "$TEMPLATE_NAME" >/dev/null 2>&1; then
  gcloud compute instance-templates create "$TEMPLATE_NAME" \
    --machine-type=n2-standard-16 \
    --network="$NETWORK" --no-address \
    --service-account="$WORKER_SA" --scopes=cloud-platform \
    --image-family=debian-12 --image-project=debian-cloud \
    --boot-disk-size=30GB --boot-disk-type=pd-balanced \
    --disk="name=${DISK_NAME},device-name=${DISK_DEVICE_NAME},mode=rw,boot=no,auto-delete=no" \
    --metadata-from-file=startup-script="$(dirname "$0")/../infra/hosted-claw/startup.sh" \
    --metadata-from-file=hosted-claw-compose="$(dirname "$0")/../hosted_claw/docker-compose.yml" \
    --metadata-from-file=hosted-claw-litellm-config="$(dirname "$0")/../hosted_claw/litellm-config.yaml" \
    --metadata-from-file=hosted-claw-litellm-service="$(dirname "$0")/../infra/hosted-claw/hosted-claw-litellm.service" \
    --metadata-from-file=hosted-claw-supervisor-service="$(dirname "$0")/../infra/hosted-claw/hosted-claw-supervisor.service" \
    --labels=service=hosted-claw,pilot=true
fi

if ! gcloud compute instance-groups managed describe "$MIG_NAME" --zone="$ZONE" >/dev/null 2>&1; then
  gcloud compute instance-groups managed create "$MIG_NAME" --zone="$ZONE" --size=1 --template="$TEMPLATE_NAME"
  gcloud compute instance-groups managed update "$MIG_NAME" --zone="$ZONE" \
    --stateful-disk="device-name=${DISK_DEVICE_NAME},auto-delete=never"
fi

echo "Hosted-Claw pilot infrastructure is ready."
echo "Recovery target: recreate the size-one MIG and attach the newest <=24h snapshot within 30 minutes."
echo "Before enabling intake, set Cloud Run HOSTED_CLAW_* / Slack secrets, configure NAT/private Google access, and run isolation/load tests."
