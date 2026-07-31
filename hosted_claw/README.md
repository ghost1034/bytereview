# Hosted Claw pilot supervisor

This directory contains the single-VM pilot data plane. The Cloud Run API is
the control plane; the supervisor has no database, KMS, Slack-token, or
provider-key access. It authenticates to `/api/internal/hosted-claw` with its
GCE service identity and receives only one claimed tenant job at a time.

Tenant containers are one CPAAutomation user plus one product, use opaque Docker
volumes, and are attached only to the internal hosted network. The supervisor
starts them with a read-only root filesystem, non-root UID, all capabilities
dropped, `no-new-privileges`, one CPU, 2 GiB memory, and 256 PIDs. It never
mounts the Docker socket into a tenant.

Set `HOSTED_CLAW_API_URL`, `HOSTED_CLAW_INTERNAL_AUDIENCE`, the two private image
references, `LITELLM_TENANT_ORIGIN`, and `LITELLM_MASTER_KEY`. The VM startup
process provides the LiteLLM master key without putting it in tenant
containers. A per-tenant proxy injects the revocable virtual model key and
hosted connector token, so neither credential appears in the tenant process.

`HOSTED_CLAW_PROXY_IMAGE` must also be a digest-pinned Caddy image. The
supervisor creates a private network and a credential-injecting proxy sidecar
per tenant. Tenant containers receive neither connector nor LiteLLM keys and
cannot join the shared outbound network.

Build each image with a digest-pinned base, for example:

```sh
docker build --build-arg HERMES_BASE_IMAGE='nousresearch/hermes-agent@sha256:…' \
  -f hosted_claw/images/accountingclaw.Dockerfile -t REGION-docker.pkg.dev/PROJECT/REPO/hosted-accountingclaw:TAG .
```

`setup-hosted-claw-pilot.sh` documents the one-VM infrastructure defaults,
least-privilege service account roles, daily snapshots, Pub/Sub subscription,
and alert policies. It is intentionally opt-in and does not run from the normal
Cloud Run deployment.
