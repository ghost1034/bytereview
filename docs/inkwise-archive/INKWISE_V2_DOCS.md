# Inkwise V2 Technical Documentation

NOTE (2026-03): This document is partially outdated. Inkwise V2 no longer uses the PageIndex SaaS API.
See `INKWISE_V2_NO_PAGEINDEX_API.md` for the current architecture (vendored PageIndex OSS tree generation + in-house retrieval + Gemini grounded chat with evidence-id citations).

This document describes the target technical architecture and implementation details for **Inkwise V2**: a **Next.js** frontend, **FastAPI** backend, and **PostgreSQL** database hosted on **Google Cloud Platform (GCP)**.

Inputs:

- Current product behavior: `OLD_FEATURE_DOCS.md`
- Current implementation notes: `OLD_TECHNICAL_DOCS.md`
- V2 requirements and improvements: `INKWISE_V2_IMPROVEMENTS.md`
- RAG framework docs: `pageindex/` (PageIndex, vectorless RAG)

Explicit scope decision:

- The V1 `/hl` **Hurrylegal** module is **not** part of Inkwise V2.

---

## Goals

- Functional parity with the V1 Inkwise flows (documents + editor/autosave, sources library + per-document bindings, templates, export PDF/DOCX, AI writing tools, grounded chat with citations + history, auth/RBAC, quotas + Stripe, background processing).
- One coherent source system (remove the V1 split between general `/file/*` and Inkwise `/iw/ref/*`).
- PageIndex-first grounded chat for PDF sources (vectorless; no chunking/embeddings required for the primary RAG path).
- Secure-by-default, observable, and operable in production (idempotent jobs, explicit processing states, auditability).

Non-goals (initially):

- Collaborative multi-user editing (real-time multi-cursor). Design the schema to not block it later.
- Enterprise org/team tenancy UI. Keep the data model future-proof (optional `org_id`).

---

## High-Level Architecture

Request path (single domain, path routed):

```
Browser
  -> HTTPS Load Balancer
       /api/*  -> Cloud Run: inkwise-api (FastAPI)
       /*      -> Cloud Run: inkwise-web (Next.js)
  -> Cloud SQL (Postgres)
  -> Cloud Storage (GCS)
  -> Cloud Tasks -> Cloud Run Jobs (ingestion/conversion/export)
  -> PageIndex API (external)
  -> Vertex AI Gemini (writing tools)
  -> Stripe (billing)
```

Key design choice:

- **Same-origin** web + API (path routing) so auth cookies are simple (no cross-subdomain CORS/cookie pitfalls) and SSE streaming is reliable.

---

## Tech Stack

Frontend (Next.js):

- Next.js (App Router) + React + TypeScript
- Rich text editor: Tiptap for React (ProseMirror)
- Data fetching/cache: TanStack Query
- Forms/validation: zod
- Testing: Playwright (e2e), Vitest + React Testing Library (unit)

Backend (FastAPI):

- FastAPI + Uvicorn
- SQLAlchemy 2.x (async) + Alembic migrations
- Pydantic v2 (request/response models)
- httpx (provider calls)
- SSE streaming endpoints (Starlette streaming responses)
- Stripe Python SDK
- Google Cloud clients: Secret Manager, Cloud Storage, Cloud Tasks

Data + Infra (GCP):

- Cloud Run (web + API)
- Cloud SQL for PostgreSQL
- Cloud Storage for all blobs (uploads, derived artifacts, exports)
- Cloud Tasks for reliable async dispatch
- Cloud Run Jobs for long-running ingestion/conversion/export
- Secret Manager for all secrets
- Cloud Logging/Monitoring + OpenTelemetry
 - Terraform for IaC

AI providers:

- PageIndex for PDF ingestion + grounded chat + citations
- Vertex AI Gemini for selection-based writing tools and non-PageIndex flows

---

## Repository Layout (Proposed)

This is a suggested V2 layout; names can be adjusted.

```
apps/
  web/                 # Next.js app
  api/                 # FastAPI app
jobs/
  ingest/              # Cloud Run Job: source ingestion (PageIndex + conversions)
  export/              # Cloud Run Job: large document export
packages/
  contracts/           # OpenAPI artifacts + generated TS client
  ui/                  # shared UI primitives (optional)
infra/
  terraform/           # GCP IaC
  scripts/             # deploy helpers
docs/
  INKWISE_V2_DOCS.md
```

---

## Data Model (Postgres)

V2 centers on a single source-of-truth entity: `sources`.

### Core Entities

Users:

- `users`: identity + auth fields
- `roles`, `user_roles`: RBAC
- Optional future: `orgs`, `org_memberships`

Documents:

- `documents`: editor content + versioning

Sources (Library):

- `sources`: user library items (upload/website/image/note)
- `source_ingestions`: immutable ingestion attempts with logs, provider mappings, errors
- `document_source_bindings`: binds sources to a document

Chat:

- `chat_threads`: per-document threads (and/or per-mode)
- `chat_messages`: append-only message log with citations

Templates:

- `templates`: per-user templates
- `system_templates`, `system_template_categories`

Billing/Quota/Audit:

- `plans`, `subscriptions`
- `quota_ledger`: explainable quota accounting
- `stripe_events`: stored webhook events for debugging and idempotency
- `audit_log`: admin/support actions

### Suggested Table Shapes (Minimal-but-Debuggable)

`documents`:

- `id` uuid (pk)
- `user_id` uuid (fk)
- `title` text
- `content_json` jsonb (ProseMirror JSON)
- `content_html` text (derived/sanitized; optional if generated on export)
- `init_prompt` text null
- `language` text null
- `version` int not null default 1
- `created_at`, `updated_at` timestamptz

Concurrency rule:

- `PUT /documents/{id}` requires a `version` check. If the client version is stale, return `409 Conflict` with the latest server version.

`sources`:

- `id` uuid (pk)
- `user_id` uuid (fk)
- `type` text (`upload|website|image|note`)
- `title` text
- `original_filename` text null
- `content_type` text
- `size_bytes` bigint
- `checksum_sha256` text null
- `storage_bucket` text null
- `storage_object` text null
- `source_url` text null
- `status` text (`queued|processing|completed|failed|deleted`)
- `failure_code` text null
- `failure_detail` text null (user-safe)
- `created_at`, `updated_at` timestamptz

`source_ingestions`:

- `id` uuid (pk)
- `source_id` uuid (fk)
- `pipeline` text (`pageindex|fallback`)
- `status` text (`queued|processing|completed|failed`)
- `started_at`, `finished_at` timestamptz null
- Provider mappings:
  - `pageindex_doc_id` text null
  - `page_count` int null
  - `provider_document_name` text null
- Caching/debug:
  - `pageindex_tree_json` jsonb null (optional)
  - `pageindex_tree_fetched_at` timestamptz null
  - `doc_description` text null
  - `raw_result_json` jsonb null (only if safe and size-capped)
  - `error_json` jsonb null

`document_source_bindings`:

- `id` uuid (pk)
- `document_id` uuid (fk)
- `source_id` uuid (fk)
- `is_active` bool not null default true
- `created_at` timestamptz
- Unique constraint: `(document_id, source_id)`

`chat_threads`:

- `id` uuid (pk)
- `user_id` uuid (fk)
- `document_id` uuid (fk)
- `mode` text (`grounded|tools`) (optional; simplest is per-document grounded threads)
- `title` text null
- `created_at` timestamptz

`chat_messages`:

- `id` uuid (pk)
- `thread_id` uuid (fk)
- `role` text (`user|assistant|system`)
- `content` text (final, post-stream)
- `content_with_citations` text null (raw provider response if it includes inline citations)
- `citations_json` jsonb null (structured citations)
- `provider` text (`pageindex|gemini`)
- `provider_meta` jsonb null (request ids, model name, latency, etc.)
- `created_at` timestamptz

`quota_ledger`:

- `id` uuid (pk)
- `user_id` uuid (fk)
- `event_type` text (`source_upload|source_ingest|grounded_chat|writing_tool|export`)
- `quantity` int (or numeric)
- `unit` text (`files|pages|messages|tokens`)
- `ref_id` uuid null (document_id/source_id/thread_id/message_id)
- `provider_cost_usd` numeric null
- `meta` jsonb
- `created_at` timestamptz

Deletion semantics:

- Prefer soft delete for user content (`sources.status='deleted'`, `documents` optional soft delete).
- When a source is deleted:
  - revoke/stop future job attempts
  - delete derived GCS artifacts
  - optionally call PageIndex `delete_document(doc_id)` for associated ingestions (subject to retention policy)

---

## Blob Storage (GCS)

All binaries live in Cloud Storage.

Bucket/object layout (example):

- `uploads/{user_id}/{source_id}/original/{filename}`
- `derived/{user_id}/{source_id}/pdf/converted.pdf` (if conversion required)
- `derived/{user_id}/{source_id}/thumbnails/{...}`
- `exports/{user_id}/{document_id}/{export_id}/document.pdf`

Preview and download:

- Backend issues short-lived **signed URLs** (GET) for preview/download.
- For uploads, prefer **direct-to-GCS resumable uploads** with a backend-issued signed URL/policy.

Why direct-to-GCS:

- Cloud Run request size limits and timeouts are easier to avoid.
- Upload retry/resume is easier for large PDFs.

---

## Background Processing (Cloud Tasks + Cloud Run Jobs)

V2 replaces Celery/Redis with GCP-native primitives.

### Job Types

1) Source ingestion job (primary)

- Input: `source_ingestion_id`
- Output: `source_ingestions.status`, provider mappings, cached artifacts

2) Conversion job (supporting)

- Convert Office/text/images/websites to PDF where feasible.
- Store the resulting PDF in GCS and proceed with PageIndex ingestion.

3) Export job (optional async)

- For large documents, export runs asynchronously and produces a downloadable artifact in GCS.

### Idempotency and Retry

- Every job is keyed by an immutable DB record (`source_ingestions.id`, `export_jobs.id`).
- Cloud Tasks retries are safe because each handler checks current DB state before doing work.
- Store per-step timestamps and the last error category for user-safe display.

---

## PageIndex Integration (Vectorless RAG)

PageIndex provides:

- `submit_document(file_path)` -> `doc_id`
- `get_document(doc_id)` -> status, page count, name, createdAt
- `get_tree(doc_id, node_summary=False)` -> hierarchical tree when completed
- `chat_completions(messages, doc_id=..., stream=..., enable_citations=...)`
- `get_ocr(doc_id, format='page'|'node'|'raw')`
- `delete_document(doc_id)`

### Eligibility Rules

Base rule (initial V2):

- PageIndex-grounded chat is enabled for **PDF** sources, and for non-PDF sources only after a successful conversion to PDF.

User-visible labeling:

- Each bound source shows whether it is "Grounded chat ready".
- If not ready/eligible, the UI explains why (e.g., "Conversion failed" or "Not supported yet").

### Ingestion Pipeline (PDF)

1) Source created in DB with `status='queued'` and upload stored in GCS.
2) Create `source_ingestions` row:
   - `pipeline='pageindex'`, `status='queued'`
3) Cloud Task triggers ingestion job.
4) Ingestion job:
   - downloads (or reads) the PDF from GCS
   - calls PageIndex `submit_document(...)`
   - stores `pageindex_doc_id`
   - polls `get_document(doc_id)` until `completed|failed` (or schedules delayed poll tasks)
   - optionally fetches and caches `get_tree(doc_id, node_summary=True)`
   - optionally derives/stores `doc_description` using the tree (see "Doc Description")
5) Mark ingestion `completed` and update `sources.status='completed'`.

Polling strategy (recommended):

- Use Cloud Tasks to schedule exponential-backoff poll requests.
- Do not rely on end-user browser polling PageIndex directly.

### Doc Description (Small Multi-Doc Sets)

For future "search my library" flows, V2 stores a one-sentence description per PageIndex doc.

- Generate from the PageIndex tree (and node summaries) using a lightweight LLM prompt (pattern described in `pageindex/tutorials/doc-search/description.md`).
- Store in `source_ingestions.doc_description`.

### Grounded Chat via PageIndex Chat API

Backend proxies PageIndex Chat so the browser never sees provider keys and quotas can be enforced.

Request building:

- Determine active bindings for the document.
- Resolve to `pageindex_doc_id` list (from the latest successful ingestion per source).
- Call PageIndex `chat_completions(messages=..., doc_id=[...], stream=True, enable_citations=True)`.

Citation format:

- PageIndex inline citations look like: `<doc=file.pdf;page=1>` (as documented in `pageindex/sdk/chat.md`).

V2 persistence requirements:

- Store the assistant message:
  - raw content (including citations)
  - cleaned content (for display)
  - structured citations extracted into `citations_json`
- Store provenance:
  - which sources/doc_ids were scoped
  - provider metadata (latency, request ids when available)

Suggested citation structure (example):

```json
{
  "citations": [
    {
      "pageindex_doc_id": "pi-abc123def456",
      "doc_name": "contract.pdf",
      "page": 12,
      "source_id": "4b7c4b7e-...",
      "kind": "inline"
    }
  ]
}
```

### Streaming Normalization (SSE)

Even if providers stream differently, the frontend should consume a stable SSE envelope.

Proposed events:

- `event: token` incremental text chunks
- `event: meta` citations/tool status updates
- `event: done` stream finished

Example wire format:

```
event: token
data: {"text":"First chunk"}

event: token
data: {"text":" more text"}

event: meta
data: {"citations":[{"doc":"contract.pdf","page":12}]}

event: done
data: {"message_id":"..."}
```

Disconnect handling:

- On client disconnect, cancel the upstream provider request.
- Persist partial output only if explicitly desired (default: persist only final output).

---

## Gemini Writing Tools (Non-PageIndex)

Selection-based tools operate on editor selection/context and can optionally use the document's ready bound sources for grounded revisions.

Backend responsibilities:

- Validate tool/action enum
- Enforce quotas via `quota_ledger`
- Call Vertex AI Gemini with:
  - user prompt
  - selection + surrounding context
  - document settings (init_prompt, language)
- Stream tokens via SSE using the same normalized SSE format

Frontend UX parity:

- Show streaming output
- Provide actions: replace selection, insert below, copy, regenerate
- Clearly label whether the result used attached grounded sources or ran without grounding

---

## API Design (FastAPI, `/api/v2`)

Principles:

- OpenAPI is the contract; TS client is generated in CI.
- Consistent resource shapes for CRUD.
- Streaming endpoints use SSE with normalized event types.

OpenAPI draft (Phase 0): `docs/v2/openapi/inkwise-v2.openapi.yaml`.

### Auth

Recommended approach for V2:

- Cookie-based auth with HttpOnly, Secure cookies.
- Short-lived access token + refresh token rotation.
- CSRF protection for cookie-authenticated state-changing requests.

Endpoints:

- `POST /api/v2/auth/login`
- `POST /api/v2/auth/logout`
- `POST /api/v2/auth/refresh`
- `GET /api/v2/users/me`

### Documents

- `GET /api/v2/documents?page=&limit=`
- `POST /api/v2/documents`
- `GET /api/v2/documents/{document_id}`
- `PUT /api/v2/documents/{document_id}` (requires `version` match)
- `DELETE /api/v2/documents/{document_id}`

Export:

- `GET /api/v2/documents/{document_id}/export?type=pdf|docx` (sync for small)
- `POST /api/v2/documents/{document_id}/export` (async -> returns export job)

### Sources (Library)

Create/upload (direct-to-GCS recommended):

- `POST /api/v2/sources/upload:init` -> returns `source_id` + signed upload URL(s)
- Client uploads bytes to GCS
- `POST /api/v2/sources/{source_id}/upload:complete`

Other source types:

- `POST /api/v2/sources/website` (url + optional title)
- `POST /api/v2/sources/note` (inline text)

Read/list:

- `GET /api/v2/sources?page=&limit=`
- `GET /api/v2/sources/{source_id}`

Preview/download:

- `GET /api/v2/sources/{source_id}/preview` (signed URL)
- `GET /api/v2/sources/{source_id}/download` (signed URL)

Delete:

- `DELETE /api/v2/sources/{source_id}`

Ingestion:

- `POST /api/v2/sources/{source_id}/ingest` (enqueue ingestion)
- `GET /api/v2/sources/{source_id}/ingestions`
- `GET /api/v2/source-ingestions/{ingestion_id}`

### Document <-> Source Bindings

- `GET /api/v2/documents/{document_id}/sources`
- `POST /api/v2/documents/{document_id}/sources:bind` (list of `source_id`)
- `POST /api/v2/documents/{document_id}/sources:unbind`

### Chat (Grounded, PageIndex-proxied)

- `GET /api/v2/documents/{document_id}/chat/threads`
- `POST /api/v2/documents/{document_id}/chat/threads`
- `GET /api/v2/chat/threads/{thread_id}/messages?page=&limit=`
- `POST /api/v2/chat/threads/{thread_id}/messages:stream` (SSE)

### Writing Tools (Gemini)

- `POST /api/v2/writing-tools:stream` (SSE)

### Templates

- `GET /api/v2/templates`
- `POST /api/v2/templates`
- `GET /api/v2/templates/{template_id}`
- `PUT /api/v2/templates/{template_id}`
- `DELETE /api/v2/templates/{template_id}`

System templates:

- `GET /api/v2/system-template-categories`
- `GET /api/v2/system-templates?category_id=`
- `GET /api/v2/system-templates/{system_template_id}`

### Billing and Quotas

- `GET /api/v2/plans`
- `POST /api/v2/billing/stripe/webhook`
- `GET /api/v2/billing/portal` (Stripe customer portal URL)
- `GET /api/v2/usage` (quota usage breakdown from `quota_ledger`)

Admin (sysadmin role):

- user search/disable
- plan overrides
- ingestion reruns
- quota adjustments (ledger entries with reason)

---

## Frontend (Next.js) Implementation Notes

Routes:

- `/login`
- `/write` and `/write/[id]`
- `/templates`
- `/references` (Sources library)
- `/help`

State and data:

- Use TanStack Query for:
  - documents list/detail
  - sources list + ingestion status
  - bindings list
  - chat threads + messages

Editor autosave:

- Debounced save + save on navigation/unload.
- Send `version` with update requests.
- On `409 Conflict`, show a conflict resolution UX (reload server version or duplicate doc).
- Maintain a local offline draft cache (per-document) to prevent data loss.

Citations UX:

- Render citations consistently (doc name + page).
- Clicking opens a source preview view (PDF.js) anchored to the cited page.
- Provide "Explain citation" by showing the cited excerpt if available (future: use PageIndex OCR/node output).

---

## Export Pipeline (PDF/DOCX)

Parity requirement:

- Export to PDF and DOCX from stored document content.

Strategy:

- Keep a controlled editor schema to ensure stable HTML generation.
- Sanitize HTML server-side before rendering/export.

Implementation options:

- PDF: WeasyPrint or headless Chromium (Playwright) render with a print stylesheet.
- DOCX: HTML-to-DOCX via `python-docx` mapping; keep a stable subset (headings, lists, tables, images).

Async export:

- For large docs, enqueue an export job and return a status endpoint + signed download URL once ready.

---

## Security

Non-negotiables (explicitly addressing V1 risks):

- No TLS verification disabling anywhere.
- No hard-coded signing keys.
- No committing secrets (including realistic-looking example creds).

Controls:

- Secrets: GCP Secret Manager; bind to Cloud Run via least-privileged service accounts.
- Auth:
  - HttpOnly cookies
  - CSRF protection
  - strict CORS allowlist (if any cross-origin is required)
- Rate limits:
  - auth endpoints
  - upload init/complete
  - chat and writing tools
- Upload validation:
  - file type allowlist
  - size limits
  - optional malware scanning (tiered feature)
- IAM:
  - separate service accounts for web, api, and jobs
  - bucket-level permissions scoped to required prefixes

Auditability:

- Persist admin actions in `audit_log`.
- Persist Stripe webhook events in `stripe_events`.

---

## Observability

- Structured JSON logs with a correlation id (`x-request-id`).
- Metrics:
  - API latency per endpoint
  - ingestion durations and failure rates
  - PageIndex chat latency/errors
  - Gemini call latency and usage
- Tracing:
  - OpenTelemetry traces for upload -> ingest -> ready and chat -> citations flows
- Error reporting:
  - capture exceptions with user_id/document_id/source_id context (redacted where necessary)

---

## Deployment (GCP)

### Services

- `inkwise-web` (Cloud Run): Next.js
- `inkwise-api` (Cloud Run): FastAPI
- `inkwise-ingest` (Cloud Run Job): ingestion + conversion
- `inkwise-export` (Cloud Run Job): async export

### Data

- Cloud SQL (Postgres)
- Cloud Storage buckets:
  - uploads bucket
  - derived artifacts bucket (can be same with prefixes)
  - exports bucket

### Networking

- HTTPS Load Balancer routes `/api/*` to API, everything else to web.
- Cloud Armor for WAF and rate limiting.

### CI/CD

- GitHub Actions (or Cloud Build) builds containers and deploys to Cloud Run.
- Alembic migrations run as a controlled step (manual approval for prod).
- OpenAPI client generation is validated in CI.

Environments:

- dev, staging, prod (separate projects preferred, or strong IAM isolation).

Terraform (Phase 2 scaffold): `infra/terraform`.

---

## Testing Strategy

Backend:

- Unit tests for services (PageIndex client wrapper, ingestion orchestration, quota ledger)
- Integration tests:
  - auth
  - documents CRUD + versioning
  - sources upload workflow
  - bindings
  - SSE streaming contracts

Frontend:

- Component tests for editor behaviors and streaming UI
- Playwright e2e for:
  - login
  - create doc -> autosave
  - upload source -> ingest -> bind
  - grounded chat + citations -> open preview at cited page
  - export

---

## Migration Notes (V1 -> V2)

V2 implementation differs, but user-visible continuity matters.

Mapping (conceptual):

- V1 `iw_document` -> V2 `documents`
- V1 `file` and `iw_reference` -> V2 `sources`
- V1 document ref binding -> V2 `document_source_bindings`
- V1 writer history/chat -> V2 `chat_threads` + `chat_messages` (optional migration)

Provider migration:

- Existing PDFs should be re-ingested into PageIndex to obtain `pageindex_doc_id` mappings.
- During migration, V2 can show sources as "Processing" until PageIndex ingestion completes.

---

## Build Order (Suggested)

1) Finalize OpenAPI for documents, sources, bindings, chat streaming, templates
2) Implement auth + RBAC + core CRUD
3) Implement GCS upload flow + ingestion job plumbing
4) Implement PageIndex chat proxy + citations parsing + persistence
5) Implement editor autosave + conflict handling
6) Implement export pipeline
7) Implement Stripe + quota ledger + usage UI
8) Add observability + e2e + hardening

---

## Explicit Exclusions (V2)

- No `/hl` routes, tables, or UI (Hurrylegal module is removed).
- No pgvector dependency for the core grounded chat path (PageIndex is vectorless). Optional future: semantic library search can add embeddings as a separate module.
