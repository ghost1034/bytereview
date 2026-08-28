#!/usr/bin/env bash
set -euo pipefail

project_id="${PROJECT_ID:?PROJECT_ID is required}"
notification_channels="${TAXATLAS_NOTIFICATION_CHANNELS:-}"
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

if gcloud monitoring policies list --help >/dev/null 2>&1; then
  monitoring_policies=(gcloud monitoring policies)
elif gcloud alpha monitoring policies list --help >/dev/null 2>&1; then
  monitoring_policies=(gcloud alpha monitoring policies)
else
  echo "This gcloud installation does not provide Monitoring alert-policy commands" >&2
  exit 2
fi

upsert_metric() {
  local name="$1" description="$2" filter="$3"
  if gcloud logging metrics describe "$name" --project="$project_id" >/dev/null 2>&1; then
    gcloud logging metrics update "$name" --project="$project_id" \
      --description="$description" --log-filter="$filter" >/dev/null
  else
    gcloud logging metrics create "$name" --project="$project_id" \
      --description="$description" --log-filter="$filter" >/dev/null
  fi
}

create_args=(--project="$project_id")
if [ -n "$notification_channels" ]; then
  create_args+=(--notification-channels="$notification_channels")
fi

existing_alert_names="$("${monitoring_policies[@]}" list --project="$project_id" \
  --filter='displayName:"TaxAtlas"' --format='value(displayName)')"

ensure_threshold_alert() {
  local display_name="$1" metric_name="$2" documentation="$3"
  if printf '%s\n' "$existing_alert_names" | grep -Fqx "$display_name"; then return; fi
  "${monitoring_policies[@]}" create "${create_args[@]}" \
    --display-name="$display_name" --combiner=OR \
    --condition-display-name="$display_name" \
    --condition-filter="metric.type=\"logging.googleapis.com/user/${metric_name}\" AND resource.type=\"cloud_run_job\"" \
    --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_SUM","crossSeriesReducer":"REDUCE_SUM"}' \
    --if='> 0' --duration='0s' --trigger-count=1 --documentation="$documentation" >/dev/null
}

ensure_absence_alert() {
  local display_name='TaxAtlas crawl success missing for two hours'
  if printf '%s\n' "$existing_alert_names" | grep -Fqx "$display_name"; then return; fi
  "${monitoring_policies[@]}" create "${create_args[@]}" \
    --display-name="$display_name" --combiner=OR \
    --condition-display-name="$display_name" \
    --condition-filter='metric.type="logging.googleapis.com/user/taxatlas_crawl_successes" AND resource.type="cloud_run_job"' \
    --aggregation='{"alignmentPeriod":"3600s","perSeriesAligner":"ALIGN_SUM","crossSeriesReducer":"REDUCE_SUM"}' \
    --if=absent --duration='7200s' \
    --documentation='No successful TaxAtlas HTTP crawl was recorded for two hours. Inspect the hourly Cloud Run Job and source failures.' >/dev/null
}

job_filter='resource.type="cloud_run_job"'
upsert_metric taxatlas_crawl_successes \
  'Successful TaxAtlas HTTP crawl job summaries.' \
  "$job_filter AND jsonPayload.job=\"crawl\" AND jsonPayload.status=\"success\""
upsert_metric taxatlas_job_failures \
  'Failed TaxAtlas one-shot jobs, including all-source crawl failures.' \
  "$job_filter AND jsonPayload.job:* AND jsonPayload.status=\"failed\""
upsert_metric taxatlas_repeated_source_failures \
  'TaxAtlas jobs reporting one or more failed sources.' \
  "$job_filter AND jsonPayload.failed_sources:* AND jsonPayload.failed>0"
upsert_metric taxatlas_dead_letter_deliveries \
  'TaxAtlas notification deliveries that exhausted all retry attempts.' \
  "$job_filter AND jsonPayload.job=\"dispatch\" AND jsonPayload.dispatch.dead>0"

ensure_absence_alert
ensure_threshold_alert 'TaxAtlas job failure' taxatlas_job_failures \
  'A TaxAtlas one-shot job failed. Inspect its structured summary and Cloud Run Job logs.'
ensure_threshold_alert 'TaxAtlas source failures' taxatlas_repeated_source_failures \
  'A TaxAtlas crawl reported source failures. Inspect failed_sources and source failure streaks.'
ensure_threshold_alert 'TaxAtlas dead-letter delivery' taxatlas_dead_letter_deliveries \
  'A TaxAtlas notification exhausted its delivery retries and entered dead-letter state.'

echo "TaxAtlas monitoring configured for ${project_id}."
