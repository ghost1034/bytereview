# Shared Hosted Claw and OpenConnector operations

The pilot is intentionally a size-one, stateful managed instance group in
`us-central1`, defaulting to `n2-standard-16`, a 250 GB balanced persistent
disk, daily encrypted snapshots, and 14-day snapshot retention. OpenConnector
uses a separate 20 GB stateful disk and keeps 30 days of application-consistent
SQLite backups in GCS. The worker
service account can consume Pub/Sub, pull private images, invoke the internal
Cloud Run API, and emit logs/metrics. It has no Cloud SQL, KMS decrypt, Slack
token, Secret Manager, or provider credential role.

After provisioning, copy `worker.env.example` to the VM as
`/etc/hosted-claw/worker.env`, replace every placeholder, and set mode `0600`.
All runtime, supervisor, proxy, LiteLLM, and PostgreSQL image references must be
resolved to immutable digests. Then start `hosted-claw-litellm` followed by
`hosted-claw-supervisor`. The environment file is the operator-injected secret
boundary; it is never mounted into a tenant container.

OpenConnector uses `/etc/openconnector/openconnector.env` (root `0600`) and the
`openconnector.service` unit. Its public IP terminates at a regional passthrough
load balancer forwarding TCP 80/443 to the private MIG; do not add an external
access configuration to the VM. `container-metadata-firewall.service` must be
active before any bridge-network container starts. It prevents OpenConnector,
LiteLLM, and tenant proxy containers from obtaining the worker service identity;
the host-network supervisor retains metadata access.

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
MIG from the approved shared template, attach both disks restored from their
newest snapshots, inject both root-owned environment files, and start the
metadata firewall, LiteLLM, supervisor, OpenConnector, and backup timer. Verify
load-balancer health, a connector action, tenant-path isolation, metadata
denial from bridge containers, and a GCS backup before reopening intake.
Deleted blocks may remain only in snapshots until the 14-day policy expires.

For migration operations use
`scripts/migrate-openconnector-to-hosted-claw.sh`. `prepare` is non-disruptive;
`cutover` snapshots both disks and retains the old VM stopped; `rollback` moves
the disk and IP back; and `finalize` deletes the stopped legacy VM after the
48-hour observation period.
