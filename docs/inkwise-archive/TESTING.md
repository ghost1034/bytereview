# Inkwise V2 Testing Checklist

This document describes what to test for the deployed Inkwise V2 system (Next.js web + FastAPI API + Postgres + GCP).

Scope: end-to-end behavior, security posture, and operational correctness. It is written as a pragmatic checklist you can run in dev/staging/prod.

## Quick Smoke (10 minutes)

- Open web app
  - `/login` loads
  - Sign in works
  - `/write` loads and shows a document list

- Create + edit a document
  - Create a new doc
  - Type in title/body
  - Confirm autosave shows “Saved”
  - Refresh page: content persists

- Upload + ingest + chat
  - Upload a PDF in `/references`
  - Verify status progresses to `completed`
  - Bind it to a document in `/write/[id]`
  - Start a chat and ask a question; confirm streaming output + citations

- Export
  - Export PDF and DOCX from `/write/[id]`
  - Files download and open

If any of the above fails, check server logs for `request_id` and confirm load balancer routing for `/api/*` and `/internal/*`.

## Environments + Preconditions

### Accounts

- At least one normal test user.
- At least one sysadmin user (role `sysadmin`) for admin endpoint testing.

### Required Config/Secrets (prod-like)

- API
  - `APP_SECRET_KEY` set (Secret Manager)
  - `GEMINI_API_KEY` set (if testing writing tools)
    - also required for ingestion tree generation + grounded chat
  - `GCS_UPLOADS_BUCKET`, `GCS_DERIVED_BUCKET`, `GCS_EXPORTS_BUCKET` set
  - Cloud Tasks config set (or ingestion polling won’t run):
    - `CLOUD_TASKS_PROJECT`, `CLOUD_TASKS_LOCATION`, `CLOUD_TASKS_QUEUE_INGEST`, `CLOUD_TASKS_SERVICE_URL`
  - `TASKS_TOKEN` set and Cloud Tasks includes `X-Inkwise-Task-Token`

- Stripe (Phase 9)
  - `STRIPE_SECRET_KEY` set (for portal)
  - `STRIPE_WEBHOOK_SECRET` set (for webhook verification)

### Infrastructure

- Cloud SQL reachable from API (Cloud Run -> Cloud SQL connection works).
- Buckets exist and the API service account can read/write required objects.
- Cloud Tasks queue exists and API SA has `roles/cloudtasks.enqueuer`.
- Load balancer routing:
  - `/api/*` -> API
  - `/internal/*` -> API (required for Cloud Tasks callbacks)
  - `/*` -> Web

## Web App (Next.js)

### Navigation / Routing

- Unauthenticated visit to `/write` redirects to `/login?next=/write`.
- After login, app redirects back to `next` route.
- Top navigation works: Write, References, Templates, Help.

### Session Handling

- Closing/reopening tab keeps session (until access token expires); refresh path should keep you logged in.
- Logout clears cookies and returns to `/login`.

### Basic Responsiveness

- `/write/[id]` usable on mobile width (no blocking overflow; right panel still accessible).

## Auth + CSRF (API)

### Cookies

- Login sets cookies:
  - Access cookie: `iw_at` (HttpOnly)
  - Refresh cookie: `iw_rt` (HttpOnly; scoped to refresh path)
  - CSRF cookie: `iw_csrf` (not HttpOnly)

- In prod:
  - Cookies are `Secure`
  - SameSite policy matches deployment (typically `Lax` for same-origin)

### CSRF Protections

- All state-changing routes reject missing/invalid `X-CSRF-Token` (403).
- CSRF token can be issued via `GET /api/v2/auth/csrf`.

### Refresh Rotation

- Calling `POST /api/v2/auth/refresh` rotates refresh tokens.
- Old refresh token no longer works after rotation.

## Documents

- CRUD
  - `POST /api/v2/documents` creates
  - `GET /api/v2/documents` lists
  - `GET /api/v2/documents/{id}` reads
  - `PUT /api/v2/documents/{id}` updates
  - `DELETE /api/v2/documents/{id}` deletes

- Optimistic concurrency
  - Update with stale `version` returns `409 conflict`
  - Response contains `latest` with server version
  - UI shows conflict UX (reload latest or duplicate)

## Sources (Library)

### Upload Flow (direct-to-GCS)

- `POST /api/v2/sources/upload:init`
  - returns a signed PUT URL + headers
  - returned `storage_object` matches expected convention

- PUT bytes to signed URL
  - content-type header matches
  - upload succeeds for typical PDFs

- `POST /api/v2/sources/{id}/upload:complete`
  - updates checksum if provided
  - source remains accessible

### Signed Preview/Download

- `GET /api/v2/sources/{id}/preview` returns a working signed URL.
- `GET /api/v2/sources/{id}/download` returns a working signed URL.

### Deletion

- `DELETE /api/v2/sources/{id}` marks status `deleted`.
- Deleted sources can’t be bound / ingested.

## Ingestion (Treegen: PageIndex OSS + Gemini)

### Enqueue

- `POST /api/v2/sources/{id}/ingest` returns `202` and creates a `source_ingestions` row.
- `GET /api/v2/sources/{id}/ingestions` shows the attempt.

### Processing

- Source status transitions:
  - `queued` -> `processing` -> `completed` (or `failed`)

- Ingestion status transitions:
  - `queued` -> `processing` -> `completed` (or `failed`)

### Cloud Tasks Polling

- Queue receives tasks.
- Tasks call `POST /internal/tasks/source-ingestion`.
- `TASKS_TOKEN` is required and validated.

### Tree Cache

- On completion, `source_ingestions.tree_gcs_bucket/object/cached_at` is set.
- Tree JSON exists in derived bucket path and is readable.

### Failure Modes

- Unsupported file types fail with clear errors.
- Missing `GEMINI_API_KEY` fails cleanly.
- Missing GCS object path fails cleanly.
- Gemini/provider failures do not corrupt the DB; ingestion remains retryable.

## Bindings (Document <-> Sources)

- `POST /api/v2/documents/{id}/sources:bind`
  - binds multiple sources
  - idempotent if already bound

- `POST /api/v2/documents/{id}/sources:unbind`
  - removes bindings

- `GET /api/v2/documents/{id}/sources`
  - lists bound sources
  - `grounded_chat_ready=true` only when latest ingestion is `completed` and has `pageindex_doc_id`

## Grounded Chat (Gemini + In-House Retrieval, SSE)

### Threads

- Create/list threads for a document.
- Messages persist in DB.

### Streaming

- `POST /api/v2/chat/threads/{thread_id}/messages:stream` streams SSE:
  - emits `meta` first
  - emits many `token`
  - emits `meta` with `citations`
  - emits `done` with `message_id`

### Scoping

- Chat is scoped only to sources currently bound to the document.
- If no ready bound sources, request fails with `400 invalid_state`.

### Citations

- Responses include evidence-based citations (e.g. evidence IDs like `E03`).
- Backend stores:
  - `content`
  - `citations_json` (includes `retrieval_run_id` and resolved `(source_title, page_number, excerpt)`)

### Disconnect Handling

- If the client disconnects mid-stream, the partial assistant message is not persisted.

## Writing Tools (Gemini, SSE)

- `POST /api/v2/writing-tools:stream` streams SSE (`meta`, `token`, `done`).
- Tool output is explicitly treated as not grounded.
- Verify:
  - action enum rejects invalid values
  - missing `GEMINI_API_KEY` fails cleanly

## Templates

- My templates
  - create/list/update/delete
  - quota enforcement occurs on create

- System templates
  - list categories
  - list templates in category
  - get a system template

## Export (PDF/DOCX)

- `GET /api/v2/documents/{id}/export?type=pdf|docx`
  - returns correct mime type
  - returns `Content-Disposition` filename
  - document content is present in output
  - quota ledger records an `export` event

## Plans / Usage / Quotas

- `GET /api/v2/plans`
  - includes `active_plan_id` and cycle start/end

- `GET /api/v2/usage`
  - aggregates by `event_type` and `unit`

- Enforcement checks
  - intentionally exhaust a limit (e.g. create many docs/uploads) and confirm:
    - API returns `402 quota_exceeded`
    - payload includes used/limit/cycle_end

## Billing (Stripe)

### Webhook

- Send a signed test webhook and verify:
  - signature verification required
  - event is persisted in `stripe_events` once (idempotent)
  - endpoint returns 200 quickly

### Portal

- If user has `stripe_customer_id`, `/api/v2/billing/portal` returns a URL.
- If user lacks Stripe customer, returns `400 invalid_state`.

## Admin (sysadmin)

- User search returns expected matches.
- Disabling user blocks future authenticated access (401 on `/users/me`).
- Quota adjust creates a ledger entry.

## Operational / Observability

- Logs are JSON and include `request_id`.
- API responses include `X-Request-Id`.
- Cloud Run
  - health checks succeed (`/health`)
  - no crash loops
  - request latencies are sane

## Security Checks

- CORS
  - only expected origins in non-prod; in prod, ideally same-origin only

- Cookie security
  - `Secure` + `HttpOnly` in prod
  - refresh cookie path scoping works

- Secrets
  - no secrets returned in API responses
  - Secret Manager access is least-privileged

- Rate limiting (if enabled via Cloud Armor)
  - verify it doesn’t block normal usage but throttles obvious abuse

## Manual API Exercises (optional)

Examples assume same-origin deployment.

- Get CSRF token:

```sh
curl -i -c cookies.txt https://YOUR_DOMAIN/api/v2/auth/csrf
```

- Login:

```sh
curl -i -b cookies.txt -c cookies.txt https://YOUR_DOMAIN/api/v2/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}'
```

- Stream grounded chat (SSE):

```sh
curl -N -b cookies.txt https://YOUR_DOMAIN/api/v2/chat/threads/THREAD_ID/messages:stream \
  -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: CSRF_FROM_COOKIE' \
  -d '{"content":"What is this document about?"}'
```
