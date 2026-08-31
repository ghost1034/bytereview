# TaxAtlas native module

TaxAtlas is a paid CPAAutomation product served at `/dashboard/taxatlas`. Its
REST contract is namespaced at `/api/taxatlas/v1` and is included in the shared
Swagger document at `/api/docs`.

## Identity and authorization

Browser requests use the current CPAAutomation Firebase bearer token. Machine
clients use a TaxAtlas API key created from the Account page. All requests
recheck the key owner's current CPAAutomation plan; `free` plans and billing
lookup failures fail closed. Account mutations require a Firebase session.

Read keys are available to every paid user. Admin keys and all global data
mutations, source toggles, correction proposals, and crawl triggers additionally
require the owner's current platform `is_system_admin` permission. Being a
system administrator never bypasses the paid-plan check.

Webhook targets are validated against SSRF, signed with HMAC, retried, and sent
to a dead-letter state after exhaustion. Secrets use the shared encryption
service and require Google Cloud KMS in production. Rotation retains the prior
secret only for the configured grace period.

## Data and provenance

All module tables use the `taxatlas_` prefix. Global records retain integer
identifiers; API keys, watchlists, notifications, and delivery channels refer to
the platform's string Firebase user ID. Rates and legal/trade content are
monitoring reference data, not tax, legal, or trade advice. The UI, API, and
exports retain source URLs, confidence, effective/as-of dates, and the reminder
to verify material decisions against the primary authority.

The idempotent seed is run with `npm run taxatlas:seed`. It records a version and
SHA-256 checksum, inserts missing reference records, protects audited
administrator corrections, and updates declarative source metadata without
changing enabled state, failure counters, ETags, or last-run timestamps.

## Operations

Local commands:

- `npm run taxatlas:seed`
- `npm run taxatlas:crawl`
- `npm run taxatlas:dispatch`
- `npm run test:taxatlas`

Production backend deployments (`scripts/deploy.sh` or
`scripts/deploy-services.sh`) build the browser image and invoke
`scripts/deploy-taxatlas-jobs.sh` after the shared Alembic migration. Frontend-only
and staging deployments do not modify the production TaxAtlas jobs. With
`--skip-build` / `--deploy-only`, both `backend:TAG` and `taxatlas-browser:TAG`
must already exist in Artifact Registry.

The TaxAtlas job script deploys the HTTP crawl hourly, news and browser
crawls every six hours, the rate watcher weekly, and notification dispatch each
minute. Translation backfill remains operator-triggered. Browser crawling uses
`backend/Dockerfile.taxatlas-browser`; ordinary API and job images do not carry
Chromium. Every job uses a PostgreSQL advisory lock and emits a structured JSON
summary. Deployment also creates alerts for missing crawl success, failed jobs,
source failures, and dead-letter deliveries. The deploy command requires the
shared Cloud SQL instance and VPC connector, plus the API's `DATABASE_URL` and
`ENCRYPTION_KEY` Secret Manager bindings. Set `KMS_KEY_RESOURCE_NAME` to the same
key as the API when KMS is configured; production webhook-secret creation still
requires KMS. Do not choose a different key just for the crawler. Optional SMTP
and Redis secrets can be appended with `TAXATLAS_JOB_SECRETS` (retain the shared
bindings). `TAXATLAS_PUBLIC_URL` defaults to `https://cpaautomation.ai` for jobs.
Chromium is installed in a shared path and smoke-tested as the non-root image
user; its job receives 2 CPUs and 2 GiB of memory.

To repair or update jobs without redeploying the API or frontend, use existing
image tags (build the browser image first if necessary):

```bash
PROJECT_ID=ace-rider-383100 \
TAXATLAS_API_IMAGE=us-central1-docker.pkg.dev/ace-rider-383100/cpa-docker/backend:TAG \
TAXATLAS_BROWSER_IMAGE=us-central1-docker.pkg.dev/ace-rider-383100/cpa-docker/taxatlas-browser:TAG \
./scripts/deploy-taxatlas-jobs.sh
```

The script seeds before creating schedules and grants the runner permission to
invoke each job. Verify `gcloud run jobs list --region=us-central1`, the five
TaxAtlas Cloud Scheduler schedules, and the structured summaries from executions.
An API error saying `Resource 'taxatlas-crawl' ... does not exist` means the jobs
were not deployed; redeploying the API alone does not create them.

TaxAtlas reuses the shared database, Firebase, billing, and KMS configuration.
Crawler, rate-limit, Redis, SMTP, translation, public URL, and job-name settings
are namespaced with `TAXATLAS_` and documented in `.env.example`.
