#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?PROJECT_ID is required}"
REGION="${REGION:-us-central1}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-cpaautomation-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
API_IMAGE="${TAXATLAS_API_IMAGE:?TAXATLAS_API_IMAGE is required}"
BROWSER_IMAGE="${TAXATLAS_BROWSER_IMAGE:?TAXATLAS_BROWSER_IMAGE is required}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-${PROJECT_ID}:${REGION}:cpaautomation-db}"
KMS_KEY_RESOURCE_NAME="${KMS_KEY_RESOURCE_NAME:?KMS_KEY_RESOURCE_NAME is required}"
TAXATLAS_JOB_SECRETS="${TAXATLAS_JOB_SECRETS:-DATABASE_URL=DATABASE_URL:latest}"

deploy_job() {
  local name="$1"
  local command="$2"
  local image="$3"
  gcloud run jobs deploy "$name" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --image="$image" \
    --service-account="$SERVICE_ACCOUNT" \
    --command=python \
    --args=-m,taxatlas.jobs,"$command" \
    --max-retries=1 \
    --task-timeout=3600s \
    --set-cloudsql-instances="$CLOUD_SQL_INSTANCE" \
    --set-secrets="$TAXATLAS_JOB_SECRETS" \
    --set-env-vars="ENVIRONMENT=production,TAXATLAS_APP_ENV=production,GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID},CLOUD_RUN_REGION=${REGION},KMS_KEY_RESOURCE_NAME=${KMS_KEY_RESOURCE_NAME}" \
    --quiet
}

deploy_job taxatlas-crawl crawl "$API_IMAGE"
deploy_job taxatlas-crawl-news crawl-news "$API_IMAGE"
deploy_job taxatlas-crawl-browser crawl-browser "$BROWSER_IMAGE"
deploy_job taxatlas-rates-watch rates-watch "$API_IMAGE"
deploy_job taxatlas-dispatch dispatch "$API_IMAGE"
deploy_job taxatlas-translate translate "$API_IMAGE"
deploy_job taxatlas-seed seed "$API_IMAGE"

schedule_job() {
  local scheduler="$1"
  local cron="$2"
  local job="$3"
  local uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${job}:run"
  if gcloud scheduler jobs describe "$scheduler" --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$scheduler" --project="$PROJECT_ID" --location="$REGION" \
      --schedule="$cron" --uri="$uri" --http-method=POST \
      --oauth-service-account-email="$SERVICE_ACCOUNT" --quiet
  else
    gcloud scheduler jobs create http "$scheduler" --project="$PROJECT_ID" --location="$REGION" \
      --schedule="$cron" --uri="$uri" --http-method=POST \
      --oauth-service-account-email="$SERVICE_ACCOUNT" --quiet
  fi
}

schedule_job taxatlas-crawl-hourly '0 * * * *' taxatlas-crawl
schedule_job taxatlas-news-six-hourly '10 */6 * * *' taxatlas-crawl-news
schedule_job taxatlas-browser-six-hourly '25 */6 * * *' taxatlas-crawl-browser
schedule_job taxatlas-rate-watch-weekly '40 3 * * 0' taxatlas-rates-watch
schedule_job taxatlas-dispatch-minute '* * * * *' taxatlas-dispatch

# Seed only after the shared Alembic migration has completed. The command is
# checksum-idempotent and records every applied dataset version.
gcloud run jobs execute taxatlas-seed --project="$PROJECT_ID" --region="$REGION" --wait --quiet

PROJECT_ID="$PROJECT_ID" \
  TAXATLAS_NOTIFICATION_CHANNELS="${TAXATLAS_NOTIFICATION_CHANNELS:-}" \
  "$(dirname "$0")/../infra/taxatlas/configure-monitoring.sh"

echo "TaxAtlas jobs, schedules, seed, metrics, and alert policies deployed."
