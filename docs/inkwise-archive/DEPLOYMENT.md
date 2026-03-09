# Inkwise V2 Deployment (GCP)

This guide describes how to deploy **Inkwise V2** (Next.js + FastAPI + Postgres) to **Google Cloud Platform** using the infrastructure scaffold in `infra/terraform/`.

Source of truth for V2 architecture: `INKWISE_V2_DOCS.md`.

## Contents

- [What Gets Deployed](#what-gets-deployed)
- [Prerequisites](#prerequisites)
- [Environments](#environments)
- [Step 1: Create/Select GCP Projects](#step-1-createselect-gcp-projects)
- [Step 2: Terraform State (Recommended)](#step-2-terraform-state-recommended)
- [Step 3: Build & Publish Container Images](#step-3-build--publish-container-images)
- [Step 4: Provision Infrastructure (Terraform)](#step-4-provision-infrastructure-terraform)
- [Step 5: Populate Secrets (Secret Manager)](#step-5-populate-secrets-secret-manager)
- [Step 6: Connect to Cloud SQL + Set DATABASE_URL](#step-6-connect-to-cloud-sql--set-database_url)
- [Step 7: Run Migrations (Alembic)](#step-7-run-migrations-alembic)
- [Step 8: Bootstrap a First User (Sysadmin)](#step-8-bootstrap-a-first-user-sysadmin)
- [Step 9: Routing, Domains, and Cookies](#step-9-routing-domains-and-cookies)
- [Step 10: Cloud Storage CORS (Required for Browser Uploads)](#step-10-cloud-storage-cors-required-for-browser-uploads)
- [Step 11: Verify the Deployment (Smoke Tests)](#step-11-verify-the-deployment-smoke-tests)
- [Operations](#operations)
- [Troubleshooting](#troubleshooting)

## What Gets Deployed

V2 code lives under `apps/`:

- `apps/web`: Next.js (App Router) frontend.
- `apps/api`: FastAPI backend (`/api/v2/*`) + internal task callbacks (`/internal/tasks/*`).

Terraform (`infra/terraform/modules/inkwise`) provisions (per environment):

- Artifact Registry repo: `inkwise`
- Cloud Run services:
  - `inkwise-{env}-web`
  - `inkwise-{env}-api`
- Cloud Run jobs (currently scaffolds):
  - `inkwise-{env}-ingest`
  - `inkwise-{env}-export`
- Cloud SQL Postgres 16 instance + database
- Cloud Storage buckets: uploads / derived / exports
- Secret Manager secret containers (values added separately)
- Cloud Tasks queue for ingestion polling
- Optional external HTTPS load balancer (same-origin routing):
  - `/api/*` and `/internal/*` -> API
  - everything else -> Web

Important current limitations in the repo:

- `jobs/*` are still scaffolds; ingestion currently runs in the API + Cloud Tasks polling.
- Browser uploads use signed `PUT` URLs to GCS; you must configure allowed web origins via `uploads_cors_origins` (and/or the load balancer domain).

This guide includes practical workarounds for these gaps.

## Prerequisites

Local tools:

- `gcloud` CLI (and authenticated access)
- Terraform 1.6+
- Docker (if building with Dockerfiles)
- `pnpm` (repo uses `pnpm@9`, see `package.json`)
- Python 3.12 (for running Alembic/migrations locally)

Accounts/keys you will need:

- A GCP project (or separate projects for dev/staging/prod) with billing enabled
- Gemini API key (tree generation + grounded chat + writing tools; current implementation uses the Generative Language HTTP API)
- (Optional now, needed later) Stripe secret key + webhook signing secret

## Environments

The Terraform roots are:

- `infra/terraform/environments/dev`
- `infra/terraform/environments/staging`
- `infra/terraform/environments/prod`

Recommended approach:

- Use **separate GCP projects** for `dev`, `staging`, `prod`.
- Use `enable_load_balancer=true` (plus a domain) for staging/prod so web and API share the same origin.

## Step 1: Create/Select GCP Projects

1) Create the project(s) (console or CLI):

```sh
gcloud projects create YOUR_PROJECT_ID
gcloud billing projects link YOUR_PROJECT_ID --billing-account YOUR_BILLING_ACCOUNT_ID
gcloud config set project YOUR_PROJECT_ID
```

2) Authenticate:

```sh
gcloud auth login
gcloud auth application-default login
```

Terraform will enable required APIs automatically (see `infra/terraform/modules/inkwise/main.tf`).

## Step 2: Terraform State (Recommended)

Do not keep Terraform state only on your laptop for real environments.

Recommended: store state in a dedicated GCS bucket.

Example (one-time per environment/project):

```sh
PROJECT_ID=your-gcp-project-id
STATE_BUCKET=${PROJECT_ID}-tfstate

gcloud storage buckets create gs://${STATE_BUCKET} --project ${PROJECT_ID} --location us-central1
gcloud storage buckets update gs://${STATE_BUCKET} --versioning
```

This repo includes `backend "gcs" {}` blocks in each environment root. Configure the bucket/prefix at init time.

Example:

```sh
ENV=dev
terraform -chdir=infra/terraform/environments/${ENV} init \
  -backend-config="bucket=your-project-id-tfstate" \
  -backend-config="prefix=inkwise/${ENV}"
```

## Step 3: Build & Publish Container Images

Terraform expects image references (see `infra/terraform/environments/*/terraform.tfvars.example`).

Artifact Registry image host depends on the **repository location**:

- If your repo location is `us-central1`, the host is `us-central1-docker.pkg.dev`.
- If your repo location is the multi-region `us`, the host is `us-docker.pkg.dev`.

In this repo, Terraform sets the Artifact Registry repo location to `var.region`.

### Option A (Recommended): Add Dockerfiles and build images

This repo includes Dockerfiles for V2:

- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- (optional placeholders) `jobs/ingest/Dockerfile`, `jobs/export/Dockerfile`

Minimal example Dockerfile for `apps/api` (FastAPI):

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (keep small; add build deps only if needed)
RUN pip install --no-cache-dir --upgrade pip

COPY apps/api/pyproject.toml apps/api/alembic.ini /app/apps/api/
COPY apps/api/app /app/apps/api/app
COPY apps/api/alembic /app/apps/api/alembic

RUN pip install --no-cache-dir \
    -e /app/apps/api

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips=*"]
```

Minimal example Dockerfile for `apps/web` (Next.js):

```dockerfile
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

# Simpler (but reliable) monorepo build: copy the repo, then install.
COPY . /repo
RUN pnpm install --frozen-lockfile
RUN pnpm -C apps/web build

FROM node:22-alpine AS run
WORKDIR /repo
RUN corepack enable
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /repo /repo

EXPOSE 8080
CMD ["pnpm", "-C", "apps/web", "start", "-p", "8080"]
```

Build/push (example, from repo root):

```sh
ENV=dev
PROJECT_ID=your-gcp-project-id
REGION=us-central1

AR_HOST=${REGION}-docker.pkg.dev
REPO=inkwise

gcloud auth configure-docker ${AR_HOST}

docker build -f apps/api/Dockerfile -t ${AR_HOST}/${PROJECT_ID}/${REPO}/inkwise-api:${ENV} .
docker push ${AR_HOST}/${PROJECT_ID}/${REPO}/inkwise-api:${ENV}

docker build -f apps/web/Dockerfile -t ${AR_HOST}/${PROJECT_ID}/${REPO}/inkwise-web:${ENV} .
docker push ${AR_HOST}/${PROJECT_ID}/${REPO}/inkwise-web:${ENV}
```

For job images, you can temporarily reuse a placeholder image until `jobs/` is implemented.

### Option B: Use `gcloud run deploy --source` (Buildpacks)

Cloud Run can build containers from source without Dockerfiles.

This is fine for experimentation, but it will bypass Terraform as the deployment driver.
If you prefer Terraform-driven deployments, use Dockerfiles (Option A) or Cloud Build to produce deterministic images.

## Step 4: Provision Infrastructure (Terraform)

1) Copy tfvars for your env:

```sh
cp infra/terraform/environments/dev/terraform.tfvars.example \
  infra/terraform/environments/dev/terraform.tfvars
```

2) Edit `infra/terraform/environments/dev/terraform.tfvars`:

- `project_id`
- `region`
- `web_image`, `api_image`, `ingest_image`, `export_image`
- (optional) `enable_load_balancer=true` and `domain_name="dev.yourdomain.com"`

3) Apply:

```sh
terraform -chdir=infra/terraform/environments/dev init
terraform -chdir=infra/terraform/environments/dev apply
```

If you have not built images yet: either build first, or temporarily point `*_image` at a known public image and update after images are published.

After apply, capture key outputs:

```sh
terraform -chdir=infra/terraform/environments/dev output
```

## Step 5: Populate Secrets (Secret Manager)

Terraform creates the secret containers and writes initial secret versions needed for a deploy:

- `inkwise-{env}-app-secret-key` (generated)
- `inkwise-{env}-tasks-token` (generated)
- `inkwise-{env}-database-url` (generated, based on a managed SQL user)

For Gemini/Stripe/bootstrap, Terraform writes an empty placeholder version by default.
To enable an integration, add a newer secret version (it becomes `latest`).

Follow `infra/terraform/SECRETS.md`.

To enable core features:

- `inkwise-{env}-gemini-api-key` (required for ingestion tree generation + grounded chat + writing tools)

Stripe can be added later:

- `inkwise-{env}-stripe-secret-key`
- `inkwise-{env}-stripe-webhook-secret`

After adding secret versions, redeploy Cloud Run services so they pick up `latest`.

## Step 6: Connect to Cloud SQL + Set DATABASE_URL

### Configuration reference (API)

The API reads env vars via Pydantic settings (`apps/api/app/config.py`). Commonly used in deployment:

- `INKWISE_ENV`: `dev|staging|prod`
- `DATABASE_URL`: required
- `APP_SECRET_KEY`: required (Secret Manager)
- `GEMINI_API_KEY`: required for ingestion tree generation + grounded chat + writing tools
- `GCS_UPLOADS_BUCKET`, `GCS_DERIVED_BUCKET`, `GCS_EXPORTS_BUCKET`: required for uploads/caching/exports
- `CLOUD_TASKS_PROJECT`, `CLOUD_TASKS_LOCATION`, `CLOUD_TASKS_QUEUE_INGEST`: required for Cloud Tasks polling
- `CLOUD_TASKS_SERVICE_URL`: optional (API prefers request base URL when enqueueing tasks)
- `TASKS_TOKEN`: required if you want `/internal/tasks/*` protected
- Cookie behavior:
  - `COOKIE_SECURE` (set `true` for HTTPS)
  - `COOKIE_SAMESITE` (`lax|strict|none`)
  - `COOKIE_DOMAIN` (usually leave unset)

### Configuration reference (Web)

`apps/web` calls the API at `/api/v2/...` on the same origin.

- If you are not using the HTTPS load balancer path routing, Terraform sets `INKWISE_API_ORIGIN` on the web service so Next.js rewrites `/api/*` to the API service (see `apps/web/next.config.mjs`).

Inkwise API requires `DATABASE_URL`.

Terraform currently creates:

- Cloud SQL instance `inkwise-{env}-pg`
- Database (default name `inkwise`)

This repo now wires Cloud Run to Cloud SQL and injects `DATABASE_URL` from Secret Manager.

### 6.1 DATABASE_URL secret (default)

When using the Cloud SQL connector, connect over the Unix socket mounted at `/cloudsql/<connection_name>`.

Example `DATABASE_URL`:

```text
postgresql+asyncpg://inkwise:YOUR_PASSWORD@/inkwise?host=/cloudsql/YOUR_PROJECT:REGION:INSTANCE
```

Notes:

- The API runtime uses SQLAlchemy async + `asyncpg`.
- Alembic migrations use a **sync** engine; you will want a separate migration step that has `psycopg` installed, or run migrations locally (next section).

Terraform provisions:

- a SQL user (default `inkwise`)
- a generated password
- a Secret Manager version for `inkwise-{env}-database-url`

If you prefer to manage DB credentials yourself, set `create_database_user=false` and `create_database_url_secret_version=false` in Terraform and populate `inkwise-{env}-database-url` manually.

## Step 7: Run Migrations (Alembic)

The API schema is managed by Alembic (`apps/api/alembic`).

### Option A (Recommended now): Run migrations from your machine via Cloud SQL Auth Proxy

1) Start Cloud SQL Auth Proxy:

Install `cloud-sql-proxy` (example):

```sh
brew install cloud-sql-proxy
```

```sh
PROJECT_ID=your-gcp-project-id
CONN_NAME=$(gcloud sql instances describe inkwise-dev-pg --project ${PROJECT_ID} --format='value(connectionName)')

cloud-sql-proxy ${CONN_NAME} --port 5432
```

2) Run migrations (note: Alembic expects a **sync** URL and requires `psycopg` installed):

```sh
python -m pip install -e "./apps/api[dev]"

export DATABASE_URL='postgresql+psycopg://inkwise:YOUR_PASSWORD@127.0.0.1:5432/inkwise'
(cd apps/api && python -m alembic -c alembic.ini upgrade head)
```

### Option B: Run migrations in CI/CD

Create a dedicated "migrate" step/container that can reach Cloud SQL.

This repo now includes a Terraform-provisioned Cloud Run Job:

- `inkwise-{env}-migrate` (runs `alembic upgrade head`)

## Step 8: Bootstrap a First User (Sysadmin)

V2 currently has **login**, but no public sign-up endpoint.

Recommended: run the Terraform-provisioned Cloud Run Job:

- `inkwise-{env}-bootstrap`

It reads these secrets:

- `inkwise-{env}-bootstrap-admin-email`
- `inkwise-{env}-bootstrap-admin-password`

Roles are pre-seeded by migrations:

- `roles.key = 'user'`
- `roles.key = 'sysadmin'`

### 8.1 Bootstrap via Cloud Run Job

1) Add secret versions:

```sh
ENV=dev
PROJECT_ID=your-gcp-project-id

printf '%s' 'admin@example.com' | gcloud secrets versions add "inkwise-${ENV}-bootstrap-admin-email" \
  --data-file=- --project "${PROJECT_ID}"

printf '%s' 'CHANGE_ME' | gcloud secrets versions add "inkwise-${ENV}-bootstrap-admin-password" \
  --data-file=- --project "${PROJECT_ID}"
```

2) Execute the job:

```sh
gcloud run jobs execute inkwise-dev-bootstrap --project your-gcp-project-id --region us-central1
```

If the bootstrap job fails with bcrypt-related errors, rebuild and redeploy the API image (it pins a compatible bcrypt version for Passlib).

### 8.2 Manual bootstrap (psql)

If you prefer to create the first user manually, use `psql` (via Cloud SQL Auth Proxy).

Generate a password hash:

```sh
python -m pip install -e "./apps/api[dev]"
python -c "from app.security.crypto import hash_password; print(hash_password('CHANGE_ME'))"
```

Insert the user + bind the sysadmin role:

```sql
-- Replace UUIDs and values.
INSERT INTO users (id, email, password_hash, name, is_active, is_verified)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'admin@example.com',
  '$2b$12$...bcrypt-hash...',
  'Admin',
  true,
  true
);

-- Attach sysadmin role. Find the sysadmin role id:
--   SELECT id FROM roles WHERE key='sysadmin';
INSERT INTO user_roles (id, user_id, role_id)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM roles WHERE key='sysadmin')
);
```

Then you can log in from `/login` in the web app.

## Step 9: Routing, Domains, and Cookies

Inkwise V2 is designed for **same-origin** web + API.

### No Domain Yet (Recommended): Use Cloud Run URLs + Next.js Proxy

You can deploy and use Inkwise without a custom domain.

- Keep `enable_load_balancer=false` and `domain_name=null`.
- Use the Cloud Run URL of the web service (`cloud_run.web.uri`) as your app URL.
- The web service proxies `/api/*` to the API service via `INKWISE_API_ORIGIN` (Terraform sets this automatically when the load balancer is disabled).

Important:

- Do not browse the API Cloud Run URL for normal usage; it is a different origin, so cookies set there will not apply to the web URL.
- Cloud Run provides HTTPS by default; leave `COOKIE_DOMAIN` unset.

### Recommended: HTTPS Load Balancer (Terraform)

Set in your env tfvars:

```hcl
enable_load_balancer = true
domain_name          = "app.yourdomain.com"
```

Apply Terraform, then:

1) Point DNS `A` record for `domain_name` to the Terraform output `load_balancer.ip`.
2) Wait for Google-managed SSL cert provisioning (can take minutes to hours).
3) Once HTTPS is live, set API cookie flags for production:

- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=lax` (works for same-origin)

These are API env vars (see `apps/api/app/config.py`).

Also ensure Cloud Tasks callbacks have a stable URL:

- With the LB enabled, `CLOUD_TASKS_SERVICE_URL` is intended to be `https://<domain_name>`.

### Alternative (no LB): Next.js rewrite proxy

If you do not use the load balancer, you can still get "same origin" behavior by letting Next.js proxy `/api/*` to the API service.

Terraform sets `INKWISE_API_ORIGIN` on the web service to the API service URI.

If you need to override it manually:

```sh
gcloud run services update inkwise-dev-web \
  --project your-gcp-project-id \
  --region us-central1 \
  --set-env-vars INKWISE_API_ORIGIN='https://YOUR_API_SERVICE_URL'
```

1) Ensure your API cookies are compatible with this setup (usually leaving `COOKIE_DOMAIN` unset is best).
2) For Cloud Tasks, you can set `cloud_tasks_service_url` in Terraform, but the API also passes the request base URL when enqueueing tasks.

## Step 10: Cloud Storage CORS (Required for Browser Uploads)

`apps/web` uploads PDFs directly to GCS using a signed `PUT` URL (`/sources/upload:init`).

Browsers require a bucket CORS policy allowing your origin to `PUT` objects.

You can configure this in Terraform via `uploads_cors_origins` (per environment). If you enable the HTTPS load balancer, Terraform automatically adds `https://{domain_name}` as an allowed origin.

If you do not have a domain yet:

- Deploy once to get your web URL (Cloud Run `...a.run.app`).
- Set `uploads_cors_origins = ["https://YOUR_WEB_RUN_URL"]` in your env tfvars.
- Re-run `terraform apply` to update bucket CORS.

Note:

- If `uploads_cors_origins` only includes `http://localhost:3000`, browser uploads from the deployed web URL will fail CORS preflight. Add the deployed web origin.

To get the web URL:

```sh
gcloud run services describe inkwise-dev-web --region us-central1 --format='value(status.url)'
```

Example CORS JSON (`cors.json`):

```json
[
  {
    "origin": [
      "https://app.yourdomain.com",
      "http://localhost:3000"
    ],
    "method": ["GET", "PUT", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Disposition", "x-goog-resumable"],
    "maxAgeSeconds": 3600
  }
]
```

Apply it to the uploads bucket:

```sh
gcloud storage buckets update gs://inkwise-dev-uploads --cors-file=cors.json
```

If you see browser errors like "CORS policy: No 'Access-Control-Allow-Origin'", this is the fix.

## Step 11: Verify the Deployment (Smoke Tests)

Backend:

- `GET /health` returns `{ ok: true }`.
- `GET /api/v2/auth/csrf` sets `iw_csrf` cookie.
- Login at `POST /api/v2/auth/login` sets `iw_at` and `iw_rt` cookies.

Frontend:

- Open `/login` and sign in with the bootstrapped user.
- Create a document and verify autosave (document version increments).
- Upload a PDF in `/references`:
   - upload to GCS succeeds
   - ingestion enqueues
   - ingestion extracts page text + generates a tree (PageIndex OSS + Gemini)
- Bind a completed source to a document and test grounded chat:
  - create a thread
  - call `/api/v2/chat/threads/{thread_id}/messages:stream`
  - verify `event: token` streams and citations appear in `event: meta`
- Test writing tools endpoint (`/api/v2/writing-tools:stream`) (requires `GEMINI_API_KEY`).
- Export a document (`/api/v2/documents/{id}/export?type=pdf|docx`).

Stripe (later):

- Configure Stripe webhook to `https://<domain>/api/v2/billing/stripe/webhook`.

## Operations

### CI/CD Deploys (GitHub Actions)

This repo includes a manual deploy workflow: `.github/workflows/v2-deploy.yml`.

It:

- builds/pushes `apps/api` and `apps/web` images to Artifact Registry
- runs Terraform plan/apply for the selected environment
- optionally executes `inkwise-{env}-migrate` and `inkwise-{env}-bootstrap`

You must configure GitHub environment secrets for each environment (dev/staging/prod), including:

- `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GCP_PROJECT_ID` (and optionally `GCP_REGION`)
- `TF_STATE_BUCKET`
- `ENABLE_LOAD_BALANCER` and (if true) `DOMAIN_NAME`

To bootstrap Workload Identity Federation + the deploy service account, use:

- `infra/terraform/bootstrap/github_actions`

Optional integration secrets (can be left unset):

- `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`

### Deploying Updates

Recommended flow (image-tag driven):

1) Build and push new images (tag with a git SHA).
2) Update the `*_image` values in `infra/terraform/environments/<env>/terraform.tfvars`.
3) `terraform apply`.

Rollback: set images back to a previous tag and `terraform apply`.

### Backups and Safety

- Cloud SQL backups are enabled by Terraform; point-in-time recovery is enabled for `prod`.
- Consider setting `deletion_protection=true` in Terraform for `prod` once stable.

### Observability

- Cloud Run logs go to Cloud Logging; the API logs JSON with `request_id`.
- Add error alerting and budgets early.

## Troubleshooting

### 403 CSRF errors

- Ensure the browser has an `iw_csrf` cookie and you send `X-CSRF-Token` with state-changing requests.
- In the web app, this is done automatically in `apps/web/lib/csrf.ts`.

### Upload fails with CORS

- Configure bucket CORS (see Step 10).

### Upload init fails with `signed_url_failed`

- Signed URL generation failed (service account cannot sign).
- Ensure:
  - IAMCredentials API is enabled
  - API service account has `roles/iam.serviceAccountTokenCreator` on the signing service account (Terraform grants self)
  - Cloud Run is using that service account

### Ingestion never progresses

- If Cloud Tasks is not configured, the API falls back to an in-process poll loop (not ideal for prod).
- Ensure these are set on the API service:
  - `CLOUD_TASKS_PROJECT`
  - `CLOUD_TASKS_LOCATION`
  - `CLOUD_TASKS_QUEUE_INGEST`
  - `CLOUD_TASKS_SERVICE_URL` (optional)
  - `TASKS_TOKEN`

### Cloud Tasks returns 401

- `TASKS_TOKEN` must match `X-Inkwise-Task-Token` header (Cloud Tasks adds it).
- Confirm the secret version exists and Cloud Run picked it up.

### PageIndex OSS tree generation

Inkwise V2 uses vendored PageIndex OSS tree generation from `vendor/pageindex/` and does not call the PageIndex SaaS API.
