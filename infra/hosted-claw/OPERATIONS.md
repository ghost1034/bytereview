# Hosted Claw pilot operations

The pilot is intentionally a size-one, stateful managed instance group in
`us-central1`, defaulting to `n2-standard-16`, a 250 GB balanced persistent
disk, daily encrypted snapshots, and 14-day snapshot retention. The worker
service account can consume Pub/Sub, pull private images, invoke the internal
Cloud Run API, and emit logs/metrics. It has no Cloud SQL, KMS decrypt, Slack
token, Secret Manager, or provider credential role.

After provisioning, copy `worker.env.example` to the VM as
`/etc/hosted-claw/worker.env`, replace every placeholder, and set mode `0600`.
All runtime, supervisor, proxy, LiteLLM, and PostgreSQL image references must be
resolved to immutable digests. Then start `hosted-claw-litellm` followed by
`hosted-claw-supervisor`. The environment file is the operator-injected secret
boundary; it is never mounted into a tenant container.

For Slack, replace `API_HOST` in `slack-app-manifest.yaml`, import the manifest
into the CPAAutomation Slack app, and enable unlisted distribution for the
pilot. Do not add channel scopes or channel event subscriptions; v1 intake is
DM-only. Marketplace publication is not required.

Alert when there is no unexpired worker lease, oldest queue age exceeds 60
seconds, disk reaches 80%, an entitlement budget is exhausted, a runtime
restarts repeatedly, Slack returns authorization failures, or the rolling turn
failure ratio exceeds 5%. Logs and metrics must include only job/runtime opaque
IDs, durations, queue/cold-start delays, token and cost totals, action IDs,
approval decisions, restart counts, rate-limit status, disk pressure, and error
codes. Never emit prompts, document content, credentials, or raw arguments.

Roll back by setting `HOSTED_CLAW_ENABLED=false`, waiting for claimed work to
finish or cancelling it through the user/admin endpoints, revoking all
`hosted_runtime` connector and LiteLLM virtual keys, and scaling the MIG to
zero. Desktop and self-hosted Claw are independent.

Recovery target for the pilot is 30 minutes RTO and 24 hours RPO. Recreate the
MIG from the approved template, attach a disk restored from the newest snapshot,
restart LiteLLM and the supervisor, and verify tenant-path and connector-token
isolation before reopening intake. Deleted blocks may remain only in snapshots
until the 14-day policy expires.
