# Inkwise V2 Improvements (Next.js + FastAPI + Postgres on GCP, PageIndex-first RAG)

This document describes a comprehensive set of improvements to implement in Inkwise V2.

Constraints and guiding decisions:

- Functional parity with the current Inkwise UX flows described in `OLD_FEATURE_DOCS.md` (documents, editor + autosave, references/library + document binding, templates, export PDF/DOCX, AI tools, AI chat with citations/history, auth/RBAC, quotas + Stripe billing, background processing).
- Implementation does **not** need to match the existing repo; avoid copying quirks and security gaps.
- RAG approach:
  - PageIndex is used for tree generation, retrieval, and (document-grounded) output via PageIndex Chat.
  - Gemini is used where PageIndex is not a fit (selection-based writing tools, non-PDF sources, general reasoning not grounded in PageIndex docs, admin automations, etc.).

Non-functional goals (treat as requirements, not nice-to-haves):

- Security by default (cookies, secrets, least-privilege IAM, audited access).
- Reliability (idempotent jobs, explicit status tracking, no silent failures).
- Traceability (every AI output attributable to inputs, sources, and citations where applicable).
- Maintainability (typed contracts, migrations, tests, stable module boundaries).
- Cost control (budgets, provider usage caps, visibility into per-user/per-org spend).

---

## 1) Product + UX improvements

### 1.1 Workspace coherence

- Unify "Reference library" and "Document references" into a single mental model: a *Library* of sources and per-document *Bindings* (no parallel "file vs reference" concepts).
- Make the right panel explicit:
  - `References` tab: bind/unbind sources and view processing status.
  - `Chat` tab: document-grounded chat with citations and a clear "Add to document" action.
- Make citations first-class:
  - Display (doc name, page, section title) consistently.
  - Clicking a citation opens a preview anchored to the cited page/section.
- Preserve the high-signal, low-friction flows:
  - New document is always one click.
  - Autosave status is visible and trustworthy.
  - Export is always available from the document "More" menu.

### 1.2 Editor improvements (parity + correctness)

- Use a React-compatible rich-text editor with a stable schema and good collaboration with streaming content insertion (e.g., Tiptap for React).
- Make autosave robust:
  - Save on debounce and on navigation/unload.
  - Use optimistic UI with conflict handling (server versioning) rather than "last write wins".
  - Persist draft state locally to prevent data loss during network failures.
- Normalize HTML storage:
  - Store canonical HTML (or ProseMirror JSON) plus server-side sanitization.
  - Keep export conversion stable by controlling allowed nodes/marks.

### 1.3 AI affordances that feel deliberate

- Separate "Document grounded chat" (PageIndex Chat) from "Writing tools" (Gemini) but present them consistently:
  - Same input component, streaming behavior, and result actions.
  - Clear label in the UI for "Grounded in selected references" vs "Not grounded".
- Improve selection-based tools:
  - Expand tools to cover the existing enum set (improve, longer, opposing argument, translate, concise, humanize, etc.) but keep UI minimal.
  - Add "regenerate" and "apply" variants (replace selection / insert below / copy).
- Add "Explain citations" UX:
  - For a generated answer, allow the user to expand a citation to see the supporting excerpt.

### 1.4 Templates and onboarding

- Templates:
  - Keep "My templates" and "System templates by category".
  - Add a template preview page with "Use template" CTA.
  - Ensure templates are editable post-import (title/icon/description/content).
- Onboarding:
  - First-run checklist: create document, upload references, bind references, ask a grounded question, export.
  - Show quota state and what actions consume quota.

---

## 2) Domain model simplification (remove ambiguity)

### 2.1 Replace parallel "file" and "reference" systems

V2 should have one primary domain concept for user sources.

Proposed entities (high-level):

- `User`
- `Document` (the writing artifact)
- `Source` (a user-managed item in the library)
  - `type`: `upload` | `website` | `note` | `integration` (future)
  - `content_type`, `size`, `checksum`, `title`, `thumbnail`, `status`
  - storage fields (GCS object path or URL)
- `SourceIngestion` (immutable attempts with logs, errors, timings)
- `DocumentSourceBinding` (bind/unbind sources to a document)
- `ChatThread` (per document, or per document+mode)
- `ChatMessage` (append-only, streaming final persisted)
- `Template` and `SystemTemplate`
- `Plan`, `Subscription`, `QuotaLedger` (see billing)

Key improvement:

- Every source has a single canonical ID.
- Document bindings reference that ID.
- All UI lists and status polling are powered by these consistent objects.

Suggested minimal field sets (so the system is debuggable in production):

- `sources`
  - `id` (uuid)
  - `user_id` (uuid)
  - `type` (`upload|website|image|note`)
  - `title` (text)
  - `original_filename` (text, nullable)
  - `content_type` (text)
  - `size_bytes` (bigint)
  - `checksum_sha256` (text, nullable)
  - `storage_bucket` / `storage_object` (text, nullable)
  - `source_url` (text, nullable)
  - `status` (`queued|processing|completed|failed|deleted`)
  - `failure_code` / `failure_detail` (text, nullable)
  - `created_at` / `updated_at` (timestamptz)

- `source_ingestions`
  - `id` (uuid)
  - `source_id` (uuid)
  - `pipeline` (`pageindex|fallback`)
  - `status` (`queued|processing|completed|failed`)
  - `started_at` / `finished_at` (timestamptz, nullable)
  - `pageindex_doc_id` (text, nullable)
  - `page_count` (int, nullable)
  - `raw_result_json` (jsonb, nullable; only if safe)
  - `error_json` (jsonb, nullable)

- `document_source_bindings`
  - `id` (uuid)
  - `document_id` (uuid)
  - `source_id` (uuid)
  - `is_active` (bool)
  - `created_at` (timestamptz)

- `documents`
  - `id` (uuid)
  - `user_id` (uuid)
  - `title` (text)
  - `content_html` (text) and/or `content_json` (jsonb)
  - `init_prompt` (text, nullable)
  - `language` (text, nullable)
  - `version` (int; increments on write)
  - `created_at` / `updated_at` (timestamptz)

### 2.2 Add explicit processing states and provenance

- Use consistent status enums for ingestion: `queued`, `processing`, `completed`, `failed`, `deleted`.
- Keep the last error message and a user-safe error category.
- Store provenance fields:
  - who uploaded/created
  - when
  - which pipeline processed it (PageIndex vs fallback)
  - doc_id mappings (PageIndex `doc_id`, plus name)

---

## 3) RAG architecture improvements (PageIndex-first)

### 3.1 Clear separation of responsibilities

Document-grounded chat path:

1) User binds one or more sources to a document.
2) For each bound source that is PageIndex-eligible (PDF):
   - Upload to PageIndex, store returned `pageindex_doc_id`.
   - Poll until processing complete.
3) Chat requests pass the list of relevant `pageindex_doc_id`s to PageIndex Chat.
4) UI streams the PageIndex Chat response.
5) Citations are enabled and parsed into structured metadata.

Implementation improvements:

- Proxy PageIndex Chat through the backend so:
  - the browser never sees the PageIndex API key
  - you can enforce per-plan quotas and rate limits
  - you can standardize SSE events and persist messages/citations
- Cache PageIndex artifacts in Postgres for speed and debuggability:
  - store the latest tree (optionally with `node_summary`) for each `pageindex_doc_id`
  - store derived "document description" strings for multi-doc selection UX

Writing tools path:

- Selection-based rewrite/expand/translate/etc. uses Gemini with document context (selection + local surrounding text), and optionally the user's document settings prompt.
- These tools are not obligated to be grounded in PageIndex.

### 3.2 Handling non-PDF sources

PageIndex is PDF-first. V2 should define predictable behavior for other source types:

- Office docs / text files:
  - Convert to PDF for PageIndex where feasible (server-side conversion) OR
  - Use a fallback ingestion pipeline (text extraction + optional embeddings) for non-grounded utilities (search, preview, template creation).
- Websites:
  - Store URL + snapshot content + extracted title.
  - For grounded chat:
    - Either render to PDF and send to PageIndex, or keep as Gemini-grounded only (explicitly labeled).
- Images:
  - Offer OCR-based extraction for preview and optional conversion to PDF.
  - For grounded chat, prefer "convert to PDF then PageIndex" where practical.

Important UX improvement:

- When a bound source cannot participate in grounded PageIndex chat, surface that in the binding UI ("This source won't be used for grounded chat").

### 3.3 Citations, traceability, and evaluation

- Always request `enable_citations=True` for PageIndex Chat.
- Parse inline citations into a structured form (`doc_id`, `doc_name`, `page`, optional node/section).
- Persist:
  - final answer text
  - citation list
  - which bound sources were used
  - upstream provider metadata (PageIndex request id if available; model name/version if exposed)
- Add lightweight evaluation hooks:
  - record response latency, citation count, and user feedback (thumbs up/down)
  - store a "grounding confidence" heuristic (e.g., response has citations + they map to bound sources)

### 3.4 Retrieval scaling for multi-document libraries

PageIndex supports scoping chat to a list of doc IDs. In the future, V2 should add document selection helpers for large libraries:

- "Use only bound sources" default.
- Optional "search library" flow (future):
  - For small sets: description-based selection (PageIndex tree summaries -> one-sentence doc description).
  - For metadata-rich sets: store metadata in Postgres and use query-to-SQL selection.
  - For very large sets: semantic prefiltering (vector DB) as a separate optional module.

---

## 4) API improvements (FastAPI)

### 4.1 Clean, versioned API surface

- Adopt a single base prefix and stable semantics, e.g. `/api/v2/...`.
- Generate and publish OpenAPI with accurate schemas.
- Use consistent response shapes:
  - Prefer plain JSON resources (`{...}`) for CRUD.
  - For streaming endpoints, standardize SSE event types.

Suggested endpoint map (illustrative; finalize via OpenAPI):

- Auth
  - `POST /api/v2/auth/login`
  - `POST /api/v2/auth/logout`
  - `POST /api/v2/auth/refresh`

- Documents
  - `GET /api/v2/documents`
  - `POST /api/v2/documents`
  - `GET /api/v2/documents/{document_id}`
  - `PUT /api/v2/documents/{document_id}`
  - `DELETE /api/v2/documents/{document_id}`
  - `POST /api/v2/documents/{document_id}/export` (async) or `GET .../export?type=pdf|docx` (sync for small docs)

- Sources (Library)
  - `GET /api/v2/sources`
  - `POST /api/v2/sources/upload` (multipart)
  - `POST /api/v2/sources/website` (url)
  - `GET /api/v2/sources/{source_id}`
  - `DELETE /api/v2/sources/{source_id}`
  - `GET /api/v2/sources/{source_id}/preview` (signed url or proxied)
  - `GET /api/v2/sources/{source_id}/ingestions` (history)

- Bindings
  - `GET /api/v2/documents/{document_id}/sources`
  - `POST /api/v2/documents/{document_id}/sources:bind` (list of `source_id`)
  - `POST /api/v2/documents/{document_id}/sources:unbind`

- Chat (document-grounded via PageIndex)
  - `GET /api/v2/documents/{document_id}/chat/threads`
  - `POST /api/v2/documents/{document_id}/chat/threads` (create)
  - `GET /api/v2/chat/threads/{thread_id}/messages`
  - `POST /api/v2/chat/threads/{thread_id}/messages:stream` (SSE; proxies PageIndex)

- Writing tools (Gemini)
  - `POST /api/v2/writing-tools:stream` (SSE)

- Templates
  - `GET /api/v2/templates`
  - `POST /api/v2/templates`
  - `DELETE /api/v2/templates/{template_id}`
  - `GET /api/v2/system-templates/categories`
  - `GET /api/v2/system-templates?category_id=...`

- Plans / billing
  - `GET /api/v2/plans`
  - `GET /api/v2/billing/portal`
  - `POST /api/v2/billing/stripe/webhook`

### 4.2 Avoid known integration mismatches

The current repo has route mismatches (e.g., frontend calling `/iw/doc/files/*` while backend provides `/iw/doc/refs/*`). V2 should:

- Define the API contract first (OpenAPI), then generate typed clients.
- Enforce contract checks in CI (e.g., `openapi-diff` for breaking changes).

### 4.3 Streaming strategy

- Use SSE for:
  - Gemini writing tools streaming output.
  - PageIndex Chat streaming proxy (server streams through to the browser).
- Normalize streaming events:
  - `event: token` (incremental text)
  - `event: meta` (citations, tool status)
  - `event: done`
- Ensure backpressure and disconnect handling:
  - cancel upstream requests on client disconnect
  - cap maximum stream duration

---

## 5) Auth, sessions, and RBAC improvements

### 5.1 Secure session model

- Prefer HttpOnly, Secure cookies for session/JWT storage (avoid storing access tokens in JS-readable cookies).
- Add CSRF protection if using cookie-authenticated state-changing requests.
- If using bearer tokens, store them in memory (not persistent storage) and rotate frequently.

### 5.2 RBAC without fragile policy plumbing

- Keep roles (sysadmin, user) and expand only when needed.
- Use explicit permission checks in code + declarative role mapping.
- If Casbin is used, ensure policies are migration-managed and tested.

### 5.3 Rate limiting and abuse prevention

- Add per-user and per-IP rate limits for:
  - auth endpoints
  - upload endpoints
  - AI endpoints
- Add request size limits and content-type validation.

---

## 6) Background processing improvements (GCP-native)

### 6.1 Replace the ad-hoc worker stack with managed primitives

Current Inkwise uses Celery + Redis. In GCP, a simpler, more operable approach is:

- Cloud Run (API service)
- Cloud Run Jobs or Cloud Functions for batch conversion/ingestion tasks
- Cloud Tasks for reliable async dispatch
- Pub/Sub for fan-out pipelines (optional)

Design principles:

- Every long-running job has a DB record (`SourceIngestion`) with status + logs.
- Jobs are idempotent (safe to retry).
- Users poll a single status endpoint.

### 6.2 File conversion and export reliability

- Standardize conversion tools inside a dedicated "conversion" job image.
- Keep conversion deterministic and observable:
  - persist intermediate artifacts (optional)
  - store per-step timings

---

## 7) Storage improvements (GCS + Cloud SQL)

### 7.1 Use GCS for all blobs

- Store original uploads and derived artifacts (thumbnails, converted PDFs, export outputs) in GCS.
- Use signed URLs for preview and download.
- Keep a consistent object key layout:
  - `uploads/{user_id}/{source_id}/{filename}`
  - `derived/{user_id}/{source_id}/{artifact_type}/...`

### 7.2 Cloud SQL Postgres schema hygiene

- Use Alembic migrations from day one.
- Strong constraints:
  - foreign keys
  - unique indexes where appropriate (e.g., checksum+user scope)
  - explicit deletion semantics (soft-delete with filtered indexes, or hard delete with cascading)
- Use `timestamptz` for all timestamps.

---

## 8) Billing, quotas, and auditability

### 8.1 Make quota enforcement explainable

- Replace "count history rows" style quota checks with an explicit `QuotaLedger`:
  - each billable event writes a row (uploads, chat messages, tool calls)
  - monthly (or plan-cycle) aggregation is computed from ledger rows
  - users can see what consumed quota

### 8.2 Stripe integration hardening

- Use Stripe webhooks with:
  - signature verification
  - idempotency keys
  - replay-safe event handling
- Persist webhook events for debugging.
- Ensure plan state transitions are deterministic.

---

## 9) Export pipeline improvements (PDF/DOCX)

- Maintain parity: export PDF and DOCX from the stored document content.
- Improve correctness:
  - consistent handling of headings, lists, tables, images
  - stable font embedding and page breaks
- Improve performance:
  - async export job for large docs, with "download when ready"
- Add a "print stylesheet" (PDF) that matches the editor layout.

---

## 10) Frontend improvements (Next.js)

### 10.1 App architecture

- Use Next.js App Router with a clear route map:
  - `/login`
  - `/write` and `/write/[id]`
  - `/templates`
  - `/references`
  - `/help`
- Use a typed API client generated from OpenAPI.
- Centralize auth and route guards.

### 10.2 Streaming UX done right

- Use incremental rendering for streaming responses.
- Provide:
  - "Stop generating"
  - retry with last prompt
  - visible "grounded sources" list

### 10.3 State management and caching

- Use React Query (or equivalent) for:
  - document list
  - document detail
  - source lists + ingestion statuses
  - chat history
- Use optimistic updates where safe (document title changes, binding toggles).

---

## 11) Observability and operational excellence

- Structured logs (JSON) across all services.
- Correlation IDs:
  - propagate request ID from client to API to background jobs
- Metrics:
  - latency per endpoint
  - ingestion durations
  - PageIndex Chat latency and error rate
  - Gemini call latency and token usage
- Tracing:
  - OpenTelemetry traces for key flows (upload -> ingest -> ready; chat -> citations)
- Error reporting:
  - capture exceptions with context (user_id, document_id, source_id)

---

## 12) Security improvements (do not repeat known bad practices)

Non-negotiable changes compared to the existing repo's risks:

- Do not disable TLS verification in worker/util code.
- Do not hard-code signing keys in source.
- Do not commit example secrets that look real.

Additional improvements:

- Use GCP Secret Manager for:
  - DB creds
  - Stripe secrets
  - Gemini credentials
  - PageIndex API keys
- Enforce CORS strictly (environment-specific allowlist).
- Validate uploads:
  - file type allowlist
  - size limits
  - virus/malware scanning option (e.g., Cloud Storage + scanning service) for enterprise tiers

---

## 13) Testing and quality gates

- Backend:
  - unit tests for services
  - integration tests for routes (auth, documents, sources, bindings)
  - contract tests for streaming endpoints
- Frontend:
  - component tests for editor behaviors
  - e2e tests for core workflows (Playwright)
- CI:
  - lint + typecheck
  - run migrations in a test DB
  - smoke test OpenAPI client generation

---

## 14) Deployment and infrastructure (GCP)

### 14.1 Reference architecture

- Next.js:
  - deploy to Cloud Run (SSR) or to a static host (if mostly client-rendered) + CDN.
- FastAPI:
  - Cloud Run service with autoscaling.
- Postgres:
  - Cloud SQL (Postgres).
- Blob storage:
  - Cloud Storage.
- Async jobs:
  - Cloud Tasks + Cloud Run Jobs.
- Optional cache:
  - Memorystore (Redis) if chat/session features need it.

Edge and security improvements:

- Put services behind an HTTPS load balancer.
- Use Cloud Armor (WAF) for rate limiting and common threat protections.
- Use separate service accounts per service/job with least privilege.

### 14.2 IaC and environments

- Terraform for:
  - Cloud Run services
  - Cloud SQL
  - buckets
  - IAM
  - networking
- Environments:
  - dev, staging, prod with separate projects or strong IAM isolation.

---

## 15) Migration strategy (from V1 to V2)

Even if the implementation differs, preserve user-visible continuity.

- Data migration plan:
  - users
  - documents (HTML/content)
  - templates
  - sources/references
  - document bindings
  - chat history (if desired)
- Incremental rollout:
  - V2 in parallel with V1
  - per-user or per-org migration toggles
  - export/backups before migration

---

## 16) Concrete "fix the old pain" checklist

These are direct improvements derived from issues visible in the current repo docs:

- Single reference system (no split between general `/file/*` and Inkwise `/iw/ref/*`).
- No route mismatches between frontend and backend; OpenAPI is the contract.
- Token/cookie model is consistent and secure (no JS-readable auth cookie by default).
- Background processing uses idempotent jobs and durable status tracking.
- Security posture is improved (no TLS verification disabling; no hard-coded signing keys).

---

## 17) Suggested build order (high leverage first)

1) Define V2 API contract (OpenAPI) for documents, sources, bindings, chat, templates, export, billing.
2) Implement auth + RBAC + basic CRUD (documents, sources, templates).
3) Implement ingestion pipeline + status polling.
4) Implement PageIndex Chat proxy + citations parsing + persistence.
5) Implement editor autosave + export.
6) Implement quotas + Stripe.
7) Add observability + e2e tests.

---

## 18) Admin, support, and internal tooling

V2 should be operable without SSH-ing into boxes or reading raw DB rows.

- Admin endpoints (behind sysadmin role):
  - user search + disable/restore
  - plan assignment + overrides
  - quota adjustments (writes ledger entries with reason)
  - source ingestion re-run and poison-pill suppression (mark as permanently failed)
- Support tooling:
  - view a user's last N ingestion jobs with logs
  - view a chat transcript with citations and bound sources at the time of the request
  - export a GDPR-style "my data" bundle (documents, templates, sources metadata)

---

## 19) Provider management (PageIndex + Gemini) and prompt hygiene

- Centralize provider calls in a single backend module per provider.
- Persist model identifiers and versions used for:
  - Gemini writing tools
  - PageIndex Chat (if exposed)
- Prompt hygiene improvements:
  - maintain prompts as versioned templates
  - include structured inputs (document settings, selection, constraints)
  - keep "system" instructions minimal and auditable
- Implement safety boundaries:
  - never send secrets, tokens, or raw auth headers to providers
  - scrub PII when feasible for non-grounded tools (configurable)

---

## 20) Privacy, retention, and compliance posture

- Data retention controls:
  - per-source deletion cascades to derived artifacts and provider mappings where possible
  - configurable retention for chat logs (default retain; allow org-level policies)
- Audit trails:
  - record admin actions and billing changes
  - record export/download events for sources (who, when)
- Tenant isolation (future-proofing):
  - model DB schema so org/team features can be added without rewrites (e.g., `org_id` columns)

---

## 21) Cost controls and performance guardrails

- Hard limits:
  - max upload size and max pages for PageIndex ingestion
  - max bound sources per document (with a UX explanation)
  - max chat stream duration and max output size
- Budgets and metering:
  - per-user/per-org monthly caps
  - surface usage stats in the UI
- Caching:
  - cache signed preview URLs short-term
  - cache PageIndex trees and derived descriptions
- Performance targets:
  - document list and open doc under a second on warm cache
  - chat first token under a few seconds when upstream is healthy

---

## 22) Scope decisions carried forward from V1

The existing repo includes an additional module (`/hl`, "Hurrylegal"). V2 should make an explicit call:

- If it must be included for parity: isolate it as a separate bounded context with its own tables and routes.
- If it is not required: omit it from V2 initial scope to reduce complexity and risk.
