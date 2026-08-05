#!/usr/bin/env bash
# Install Hosted Claw cron log-based metrics and alert policies.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_id="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
notification_channels="${HOSTED_CLAW_NOTIFICATION_CHANNELS:-}"

if [ -z "$project_id" ]; then
  echo "PROJECT_ID or a gcloud default project is required" >&2
  exit 2
fi

# Alert-policy commands are still exposed through the alpha command group in
# some Cloud SDK releases (including 577.0.0), even though other releases also
# expose the same commands through the GA monitoring group.
if gcloud monitoring policies list --help >/dev/null 2>&1; then
  monitoring_policies=(gcloud monitoring policies)
elif gcloud alpha monitoring policies list --help >/dev/null 2>&1; then
  monitoring_policies=(gcloud alpha monitoring policies)
else
  echo "This gcloud installation does not provide Monitoring alert-policy commands" >&2
  exit 2
fi

upsert_counter() {
  local name="$1"
  local description="$2"
  local filter="$3"
  if gcloud logging metrics describe "$name" --project="$project_id" >/dev/null 2>&1; then
    gcloud logging metrics update "$name" \
      --project="$project_id" \
      --description="$description" \
      --log-filter="$filter" >/dev/null
  else
    gcloud logging metrics create "$name" \
      --project="$project_id" \
      --description="$description" \
      --log-filter="$filter" >/dev/null
  fi
}

upsert_distribution() {
  local name="hosted_claw_cron_due_to_start_seconds"
  local config="$script_dir/cron-due-to-start-metric.yaml"
  if gcloud logging metrics describe "$name" --project="$project_id" >/dev/null 2>&1; then
    gcloud logging metrics update "$name" --project="$project_id" --config-from-file="$config" >/dev/null
  else
    gcloud logging metrics create "$name" --project="$project_id" --config-from-file="$config" >/dev/null
  fi
}

ensure_alert() {
  local display_name="$1"
  local metric_name="$2"
  local threshold="$3"
  local aligner="$4"
  local reducer="$5"
  local existing
  existing="$("${monitoring_policies[@]}" list \
    --project="$project_id" \
    --filter="displayName=\"${display_name}\"" \
    --limit=1 \
    --format='value(name)')"
  if [ -n "$existing" ]; then
    return
  fi
  # Keep this array non-empty: macOS Bash 3.2 treats an empty array expansion
  # as an unbound variable when nounset is enabled.
  local create_args=(--project="$project_id")
  if [ -n "$notification_channels" ]; then
    create_args+=(--notification-channels="$notification_channels")
  fi
  "${monitoring_policies[@]}" create \
    "${create_args[@]}" \
    --display-name="$display_name" \
    --combiner=OR \
    --condition-display-name="$display_name" \
    --condition-filter="metric.type=\"logging.googleapis.com/user/${metric_name}\" AND resource.type=\"cloud_run_revision\"" \
    --aggregation="{\"alignmentPeriod\":\"60s\",\"perSeriesAligner\":\"${aligner}\",\"crossSeriesReducer\":\"${reducer}\"}" \
    --if="> ${threshold}" \
    --duration="0s" \
    --trigger-count=1 \
    --documentation="Hosted Claw native cron signal ${metric_name} crossed its rollout threshold. Inspect only opaque occurrence/runtime IDs and error codes in Cloud Logging." \
    >/dev/null
}

cloud_run_filter='resource.type="cloud_run_revision"'
upsert_counter \
  hosted_claw_cron_schedule_sync_failures \
  "Hosted Claw native schedule reconciliation or wake publication failures." \
  "$cloud_run_filter AND (textPayload:\"hosted_cron_schedule_sync_failed\" OR textPayload:\"hosted_cron_manual_publish_failed\" OR textPayload:\"hosted_cron_wake_publish_failed\")"
upsert_counter \
  hosted_claw_cron_unknown_executions \
  "Hosted cron executions quarantined after an ambiguous post-claim failure." \
  "$cloud_run_filter AND textPayload:\"hosted_cron_unknown_executions\""
upsert_counter \
  hosted_claw_cron_delivery_failures \
  "Hosted cron text deliveries that failed before confirmation." \
  "$cloud_run_filter AND textPayload:\"hosted_cron_delivery_failed\""
upsert_counter \
  hosted_claw_cron_admission_rejections \
  "Hosted cron executions rejected for budget or entitlement changes." \
  "$cloud_run_filter AND textPayload:\"hosted_cron_rejected\""
upsert_distribution

ensure_alert "Hosted Claw cron schedule sync failures" hosted_claw_cron_schedule_sync_failures 0 ALIGN_SUM REDUCE_SUM
ensure_alert "Hosted Claw cron unknown execution" hosted_claw_cron_unknown_executions 0 ALIGN_SUM REDUCE_SUM
ensure_alert "Hosted Claw cron delivery failures" hosted_claw_cron_delivery_failures 0 ALIGN_SUM REDUCE_SUM
ensure_alert "Hosted Claw cron admission rejections" hosted_claw_cron_admission_rejections 0 ALIGN_SUM REDUCE_SUM
ensure_alert "Hosted Claw cron due-to-start p99 over 180s" hosted_claw_cron_due_to_start_seconds 180 ALIGN_PERCENTILE_99 REDUCE_MAX

echo "Hosted Claw cron metrics and alert policies configured for ${project_id}."
