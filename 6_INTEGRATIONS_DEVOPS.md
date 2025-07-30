# ByteReview Integration Phase

### Specification Document #6 – Dev Ops & Continuous Delivery

---

## 1 · Goals & guiding principles

|Objective|Rationale|
|---|---|
|**Repeatable infra**|Terraform IaC eliminates “snow-flake” drift across environments.|
|**Safety-first releases**|Canary deploys + database migration gates prevent outage from schema or API mismatches.|
|**Fast feedback**|CI pipeline < 10 min from commit-to-preview to keep dev loop tight.|
|**Observability by default**|SLOs alert before customers notice; logs/traces searchable across services.|
|**Cost-awareness**|Budgets & dashboards flag spend regressions; infra scales to zero when idle.|

---

## 2 · Environment topology

|Environment|GCP Project|Domain|Purpose|
|---|---|---|---|
|**dev**|`br-dev-<id>`|`dev.bytereview.ai`|Feature branches; preview URLs per PR.|
|**staging**|`br-stage-<id>`|`staging.bytereview.ai`|Pre-prod validation, load / security tests.|
|**prod**|`bytereview-prod`|`app.bytereview.ai` (`api.`)|Customer traffic.|

_Each project contains: Cloud Run services, Cloud SQL (Postgres), Memorystore (Redis), Artifact Registry, GCS buckets, Cloud KMS keys, Pub/Sub topics, Cloud Monitoring dashboards._

---

## 3 · Infrastructure provisioning (Terraform v1.8)

### 3.1 Repo layout

```
infra/
  envs/
    dev/     -> main.tfvars
    staging/
    prod/
  modules/
    cloud_run_service/
    cloud_sql_postgres/
    redis_memorystore/
    arq_cron/
    kms_key/
    pubsub_topic/
    monitoring_dashboards/
```

_Remote state_ stored in backend `gcs://bytereview-tf-state/` with **state locking** via Cloud Storage Object Lock; one state file per env.

### 3.2 Key module outputs

|Module|Output|Consumed by|
|---|---|---|
|`cloud_sql_postgres`|`connection_name`, `DB_PRIVATE_IP`|Cloud Run `DATABASE_URL` secret|
|`kms_key`|`kms_key_id`|API & worker containers (token encryption)|
|`cloud_run_service`|`service_url`, `revision_name`|Monitoring uptime checks & canary step|
|`redis_memorystore`|`host`, `port`|ARQ worker env vars|

**IAM bindings** baked into modules—e.g. `cloud_run_service` outputs SA and attaches roles `cloudsql.client`, `cloudkms.cryptoKeyDecrypter` automatically.

---

## 4 · CI / CD pipelines (GitHub Actions)

### 4.1 Pipeline stages

|Stage|Trigger|Jobs|
|---|---|---|
|**Lint & test**|PR|`python -m pytest`, `vitest run`, `bandit`, `semgrep`|
|**Build**|PR & `main`|`docker build` for: `api`, `frontend`, `worker-*`; push to `us-central1-docker.pkg.dev/<proj>/bytereview/<service>:<sha>`|
|**Preview deploy**|PR label `preview`|Terraform plan _dev_, Cloud Run revision with 0% traffic → ephemeral URL comment on PR|
|**Staging deploy**|Merge → `main`|_Build cache reuse_; `terraform apply -var-file=staging` ; Cloud Run **canary 10 %** traffic for 30 min; after health checks pass, shift to 100 %|
|**Prod deploy**|GitHub release tag `v*`|Same canary pattern, but 5 % → 50 % (15 min) → 100 %; blockers: migration sentinel success, error-budget burn < 2 %.|

### 4.2 Database migration strategy

1. **CI** runs `alembic upgrade head --sql` to generate migration SQL – ensures syntactic validity.
    
2. During deploy, step **`migrate-db`** executes migrations _before_ new containers receive traffic.
    
3. _Reversible_ migrations only. If a destructive change is unavoidable, deploy in two releases: add new columns → migrate code → drop olds.
    

### 4.3 Feature flags

_Centralised LaunchDarkly SDK_ in backend; flags:

- `INTEGRATIONS_PHASE` – gate new endpoints.
    
- `AUTOMATIONS_UI` – gate frontend routes.
    
- Flags are **boolean + gradual rollout** percentage to expose to beta customers.
    

---

## 5 · Roll-back & disaster recovery

|Asset|Backup / versioning|Restore target|
|---|---|---|
|Postgres|Point-in-time recovery (PITR) 7 days + daily dump to Cloud Storage|Auto-restore to new instance; run `terraform import`|
|GCS buckets|Object versioning 30 days|CLI copy previous generation|
|Terraform state|GCS versioning|`terraform state pull <ver>`|
|Container images|Tagged by SHA/semver|Re‐pin Cloud Run traffic to previous revision (1 command)|
|Vertex & Drive tokens|Not mission-critical; re-auth UI|—|

Disaster scen.: region outage → failover via duplicate _cold_ environment in `us-east1`; DNS cut-over scripted.

---

## 6 · Observability stack

### 6.1 Logging

- Cloud Run automatically streams STDOUT/ERR → Cloud Logging.
    
- Log entry fields enriched by middleware with `trace_id`, `uid`, `operation_id`.
    
- **Exclusions**: routine health-checks and progress polls to lower storage cost (~40 %).
    

### 6.2 Metrics & dashboards

|Dashboard|Key charts|
|---|---|
|**API SLO**|p95 latency, error rate (5xx), request rate|
|**Workers**|Queue depth per ARQ queue, job runtime P95, failures|
|**Vertex usage**|daily tokens, 429 rate|
|**GCP costs**|top N services, daily budget vs actual|

Terraform `monitoring_dashboards` module provisions JSON YAML definitions; dev/stage share but prod has dedicated workspace.

### 6.3 Alerting policies

|Alert|Threshold|Channel|
|---|---|---|
|API error rate|> 2 % 5-min window|PagerDuty critical|
|Worker queue depth|> 10 k items 10 min|Slack #ops|
|Redis memory|> 80 %|PagerDuty warn|
|Cloud Run cold-start latency|> 5 s p95|Slack|
|GCP budget|≥ 85 % month-to-date|Email finance|

Alert policies in Terraform, targets Cloud Monitoring Notification Channels (PagerDuty integration key in Secret Manager).

### 6.4 Distributed tracing

- **OpenTelemetry** Node/Go SDK in frontend Next.js (`next-otel`) & Python FastAPI.
    
- Exporter → Cloud Trace.
    
- Baggage keys: `job_id`, `run_id`, `op_id`, `uid`. 95 % sampling prod, 10 % staging, 0 % dev.
    

---

## 7 · Cost governance

- **Budgets**: $500 dev, $1 500 staging, $10 000 prod per month; alert at 50 / 75 / 90 %.
    
- **Recommender API** auto-generates IAM/pricing insights; weekly summary Slack.
    
- `cloudsql.auto_restart=false` on dev to allow stop during non-office hours via Cloud Scheduler (`gcloud sql instances patch --activation-policy=NEVER`).
    

_Alternative considered:_ pre-emptible Cloud Run VMs – not supported; autoscaling to 0 sufficient.

---

## 8 · Security & compliance integration

- **Dependency scanning** stage in CI updates GitHub Advisories weekly.
    
- **Terraform validate & tfsec** run pre-merge; blocks insecure IAM or public bucket flags.
    
- **Container image signing** with cosign; Cloud Run only allows signed images via Binary Authorization policy (enforced in prod).
    

---

## 9 · Alternative tooling considered

|Concern|Option A (chosen)|Option B|Notes|
|---|---|---|---|
|IaC|**Terraform Cloud**|Pulumi|Team is already Terraform-fluently; Pulumi would require TS expertise in ops team.|
|CI/CD|**GitHub Actions**|Cloud Build + Cloud Deploy|GitHub keeps code and CI together; Cloud Deploy would simplify canary YAML but adds new service.|
|Rollouts|Cloud Run traffic splits|Spinnaker|Built-in splitting + auto-rollback on 5xx cheaper and simpler.|

---

## 10 · Implementation checklist

1. **Create Terraform module skeletons** with input/output contract definitions.
    
2. **Set up remote state buckets** with `versioning`, `uniform access`.
    
3. **Provision dev project**; run `terraform apply -var-file=dev/main.tfvars`; confirm.
    
4. **Configure GitHub OIDC workload identity** for `bytereview-tf-deployer@` SA.
    
5. Implement **GitHub Actions workflows**, ensure plan step uses `-detailed-exitcode` gate.
    
6. **Add Binary Authorization policy** JSON in Terraform, enable on prod only.
    
7. Ship **monitoring dashboards & alerts**, verify via test incident.
    
8. Document **developer preview workflow** in `CONTRIBUTING.md`.
    
9. Run **load test** in staging, assert autoscaling, cost & alert behaviours.
    
10. Schedule **game-day** for rollback drill before first customer integration launch.
    

---
