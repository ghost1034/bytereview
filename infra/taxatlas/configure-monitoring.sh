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
  local display_name='TaxAtlas crawl success missing for 25 hours'
  local documentation='No successful TaxAtlas HTTP crawl was recorded for 25 hours. Inspect the daily Cloud Run Job and source failures.'
  local alert_name ids policy_id='' duplicate_ids='' candidate_id policy='{}'
  # Prefer the current alert; otherwise migrate an older alert in place.
  for alert_name in "$display_name" \
    'TaxAtlas crawl success missing for 26 hours' \
    'TaxAtlas crawl success missing for two hours'; do
    ids="$("${monitoring_policies[@]}" list --project="$project_id" \
      --filter="displayName=\"${alert_name}\"" --format='value(name)')"
    for candidate_id in $ids; do
      if [ -z "$policy_id" ]; then
        policy_id="$candidate_id"
      else
        duplicate_ids+=" $candidate_id"
      fi
    done
  done
  if [ -n "$policy_id" ]; then
    policy="$("${monitoring_policies[@]}" describe "$policy_id" --project="$project_id" --format=json)"
  fi
  # Metric-absence duration is capped at 23h30m, shorter than our daily cadence.
  # PromQL supports up to 25h of user-defined log metrics, giving one hour grace.
  policy="$(printf '%s' "$policy" | python3 -c '
import json, sys
policy = json.load(sys.stdin)
policy["displayName"] = sys.argv[1]
policy["documentation"] = {"content": sys.argv[2], "mimeType": "text/markdown"}
selector = (
    "logging_googleapis_com:user_taxatlas_crawl_successes"
    "{monitored_resource=\"cloud_run_job\",project_id=" + json.dumps(sys.argv[3]) + "}"
)
policy["conditions"] = [{
    "displayName": sys.argv[1],
    "conditionPrometheusQueryLanguage": {
        # Count successes, not samples: log metrics may contain zero-valued points.
        # An entirely missing series must also alert, including before its first success.
        "query": "(sum(sum_over_time(" + selector + "[25h])) or vector(0)) == 0",
        "duration": "0s",
        "evaluationInterval": "300s",
        "disableMetricValidation": True,
    },
}]
policy["combiner"] = "OR"
policy.setdefault("enabled", True)
print(json.dumps(policy))
' "$display_name" "$documentation" "$project_id")"
  if [ -n "$policy_id" ]; then
    # The full policy preserves existing notification channels and enabled state.
    "${monitoring_policies[@]}" update "$policy_id" --project="$project_id" --policy="$policy" >/dev/null
  else
    "${monitoring_policies[@]}" create "${create_args[@]}" --policy="$policy" >/dev/null
  fi
  # Retire duplicates only after successfully installing the replacement.
  for candidate_id in $duplicate_ids; do
    "${monitoring_policies[@]}" update "$candidate_id" --project="$project_id" --no-enabled >/dev/null
  done
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
