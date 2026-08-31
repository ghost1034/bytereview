#!/usr/bin/env bash
set -euo pipefail

# Resolve the same schedule definitions that the API reports to the interface.
# Fail before deploying anything if this configuration cannot be loaded.
job_schedules="$(python3 "$(dirname "$0")/../backend/taxatlas/schedules.py")"

PROJECT_ID="${PROJECT_ID:?PROJECT_ID is required}"
REGION="${REGION:-us-central1}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-cpaautomation-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
API_IMAGE="${TAXATLAS_API_IMAGE:?TAXATLAS_API_IMAGE is required}"
BROWSER_IMAGE="${TAXATLAS_BROWSER_IMAGE:?TAXATLAS_BROWSER_IMAGE is required}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-${PROJECT_ID}:${REGION}:cpaautomation-db}"
VPC_CONNECTOR="${VPC_CONNECTOR:-cpa-svpc}"
# Reuse the API's encryption configuration. Importing the shared models also
# initializes encryption, even for a crawl that never uses delivery channels.
# KMS remains required by the model for creating production webhook secrets.
KMS_KEY_RESOURCE_NAME="${KMS_KEY_RESOURCE_NAME:-}"
TAXATLAS_JOB_SECRETS="${TAXATLAS_JOB_SECRETS:-DATABASE_URL=DATABASE_URL:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest}"
TAXATLAS_PUBLIC_URL="${TAXATLAS_PUBLIC_URL:-https://cpaautomation.ai}"
JOB_ENV="ENVIRONMENT=production,TAXATLAS_APP_ENV=production,GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID},GOOGLE_CLOUD_PROJECT=${PROJECT_ID},CLOUD_RUN_REGION=${REGION},TAXATLAS_PUBLIC_URL=${TAXATLAS_PUBLIC_URL}"
if [ -n "$KMS_KEY_RESOURCE_NAME" ]; then
  JOB_ENV+=",KMS_KEY_RESOURCE_NAME=${KMS_KEY_RESOURCE_NAME}"
fi

deploy_job() {
  local name="$1"
  local command="$2"
  local image="$3"
  local cpu=1 memory=1Gi browser_enabled=false
  if [ "$command" = crawl-browser ]; then
    cpu=2
    memory=2Gi
    browser_enabled=true
  fi
  gcloud run jobs deploy "$name" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --image="$image" \
    --service-account="$SERVICE_ACCOUNT" \
    --command=python \
    --args=-m,taxatlas.jobs,"$command" \
    --tasks=1 --parallelism=1 --cpu="$cpu" --memory="$memory" \
    --max-retries=1 \
    --task-timeout=3600s \
    --set-cloudsql-instances="$CLOUD_SQL_INSTANCE" \
    --vpc-connector="$VPC_CONNECTOR" --vpc-egress=private-ranges-only \
    --set-secrets="$TAXATLAS_JOB_SECRETS" \
    --set-env-vars="${JOB_ENV},TAXATLAS_BROWSER_ENABLED=${browser_enabled}" \
    --quiet
  # OAuth scheduler calls and API triggers need permission to run each job.
  gcloud run jobs add-iam-policy-binding "$name" \
    --project="$PROJECT_ID" --region="$REGION" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" --role=roles/run.invoker --quiet >/dev/null
}

deploy_job taxatlas-crawl crawl "$API_IMAGE"
deploy_job taxatlas-crawl-news crawl-news "$API_IMAGE"
deploy_job taxatlas-crawl-browser crawl-browser "$BROWSER_IMAGE"
deploy_job taxatlas-rates-watch rates-watch "$API_IMAGE"
deploy_job taxatlas-dispatch dispatch "$API_IMAGE"
deploy_job taxatlas-translate translate "$API_IMAGE"
deploy_job taxatlas-seed seed "$API_IMAGE"

# Do not activate schedules until the shared schema and source seed are ready.
gcloud run jobs execute taxatlas-seed --project="$PROJECT_ID" --region="$REGION" --wait --quiet

schedule_job() {
  local scheduler="$1"
  local cron="$2"
  local timezone="$3"
  local job="$4"
  local uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${job}:run"
  if gcloud scheduler jobs describe "$scheduler" --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$scheduler" --project="$PROJECT_ID" --location="$REGION" \
      --schedule="$cron" --time-zone="$timezone" --uri="$uri" --http-method=POST \
      --oauth-service-account-email="$SERVICE_ACCOUNT" --quiet
  else
    gcloud scheduler jobs create http "$scheduler" --project="$PROJECT_ID" --location="$REGION" \
      --schedule="$cron" --time-zone="$timezone" --uri="$uri" --http-method=POST \
      --oauth-service-account-email="$SERVICE_ACCOUNT" --quiet
  fi
}

while IFS=$'\t' read -r scheduler cron timezone job; do
  schedule_job "$scheduler" "$cron" "$timezone" "$job"
done <<< "$job_schedules"

PROJECT_ID="$PROJECT_ID" \
  TAXATLAS_NOTIFICATION_CHANNELS="${TAXATLAS_NOTIFICATION_CHANNELS:-}" \
  "$(dirname "$0")/../infra/taxatlas/configure-monitoring.sh"

echo "TaxAtlas jobs, schedules, seed, metrics, and alert policies deployed."
