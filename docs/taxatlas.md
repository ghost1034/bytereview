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

`scripts/deploy-taxatlas-jobs.sh` deploys the HTTP crawl hourly, news and browser
crawls every six hours, the rate watcher weekly, and notification dispatch each
minute. Translation backfill remains operator-triggered. Browser crawling uses
`backend/Dockerfile.taxatlas-browser`; ordinary API and job images do not carry
Chromium. Every job uses a PostgreSQL advisory lock and emits a structured JSON
summary. Deployment also creates alerts for missing crawl success, failed jobs,
source failures, and dead-letter deliveries. The deploy command requires the
shared Cloud SQL instance, `DATABASE_URL` Secret Manager binding, and production
KMS key; optional SMTP and Redis secrets can be appended with
`TAXATLAS_JOB_SECRETS`.

TaxAtlas reuses the shared database, Firebase, billing, and KMS configuration.
Crawler, rate-limit, Redis, SMTP, translation, public URL, and job-name settings
are namespaced with `TAXATLAS_` and documented in `.env.example`.
