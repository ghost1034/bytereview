# Inkwise Integration Phase 1 Spec

This document freezes the module boundary and implementation contract for integrating Inkwise into CPAAutomation.

Phase 1 goal: define the target shape clearly enough that later phases can be completed without re-deciding auth, routing, storage, table naming, or provider boundaries.

## Outcome

Inkwise will be integrated as a first-class module inside CPAAutomation, not as a second standalone app.

The host platform remains responsible for:

- authentication
- primary navigation and dashboard shell
- core deployment and infrastructure
- Google Cloud credentials and storage
- background task orchestration
- billing account ownership

Inkwise remains responsible for:

- writing workspace UX
- source library and bindings
- ingestion pipeline
- PageIndex OSS tree generation
- retrieval and evidence building
- grounded chat and writing tools
- Inkwise-specific templates and export flows

## Phase 1 Decisions

### 1. Product positioning

- Inkwise is a CPAAutomation module.
- It lives inside the authenticated dashboard experience.
- It does not have its own login flow, top-level app shell, or separate billing surface in the initial integration.

### 2. Frontend route namespace

Inkwise frontend routes will live under the CPAAutomation dashboard:

- `/dashboard/inkwise`
- `/dashboard/inkwise/write`
- `/dashboard/inkwise/write/[documentId]`
- `/dashboard/inkwise/references`
- `/dashboard/inkwise/templates`
- `/dashboard/inkwise/templates/[templateId]`
- `/dashboard/inkwise/templates/system/[systemTemplateId]`
- `/dashboard/inkwise/help`

Navigation will be added to the shared sidebar in `components/layout/sidebar.tsx`.

### 3. Backend API namespace

Inkwise backend routes will live under a dedicated FastAPI namespace:

- `/api/inkwise/documents`
- `/api/inkwise/sources`
- `/api/inkwise/source-ingestions`
- `/api/inkwise/documents/{document_id}/sources`
- `/api/inkwise/chat/threads`
- `/api/inkwise/writing-tools:stream`
- `/api/inkwise/templates`
- `/api/inkwise/system-template-categories`
- `/api/inkwise/system-templates`

Internal task callbacks will be namespaced under:

- `/api/inkwise/internal/tasks/*`

Notes:

- We are not reusing Inkwise's original `/api/v2/*` prefix inside CPAAutomation.
- We are not exposing Inkwise's cookie-auth endpoints.

### 4. Authentication contract

- CPAAutomation Firebase auth is the single auth system.
- Inkwise endpoints will use `backend/dependencies/auth.py` dependencies.
- Inkwise will not use its existing cookie + refresh-token + CSRF stack from `inkwise/apps/api/app/api/routes/auth.py`.
- Inkwise frontend code will use CPAAutomation's existing auth context and `lib/api.ts` token attachment pattern.

### 5. Database ownership and naming

Inkwise tables will be added to the existing CPAAutomation database with an `inkwise_` prefix to avoid collisions.

Approved table names:

- `inkwise_documents`
- `inkwise_sources`
- `inkwise_source_ingestions`
- `inkwise_document_source_bindings`
- `inkwise_chat_threads`
- `inkwise_chat_messages`
- `inkwise_source_pages`
- `inkwise_source_tree_nodes`
- `inkwise_retrieval_runs`
- `inkwise_retrieval_evidence`
- `inkwise_templates`
- `inkwise_system_template_categories`
- `inkwise_system_templates`

Key schema rules:

- `user_id` columns will reference CPAAutomation `users.id` and use the same Firebase UID string type.
- Inkwise will not reuse CPAAutomation's existing `templates` table because the two products model templates differently.
- Inkwise will not reuse CPAAutomation's extraction job/run/task tables because Inkwise's document/source/chat model is a different bounded context.
- Alembic migrations will be written fresh in CPAAutomation; Inkwise's original migrations are reference material only.

### 6. Storage contract

- Inkwise will reuse CPAAutomation's GCS setup.
- Inkwise blobs will live under dedicated object prefixes inside the existing bucket strategy.

Approved object layout:

- `inkwise/uploads/{user_id}/{source_id}/original/{filename}`
- `inkwise/derived/{user_id}/{source_id}/pdf/{filename}`
- `inkwise/derived/{user_id}/{source_id}/tree/{ingestion_id}/tree.json`
- `inkwise/exports/{user_id}/{document_id}/{export_id}/{filename}`

Notes:

- We will not create a separate Inkwise storage bucket in the initial integration.
- Inkwise source upload APIs should align with CPAAutomation's existing signed-upload patterns where practical.

### 7. Background processing contract

- Inkwise async work will run on CPAAutomation infrastructure.
- Cloud Tasks remains the dispatch mechanism.
- Inkwise ingestion will eventually get its own task type and, preferably, its own queue/service pair to avoid interference with extraction jobs.

Phase 1 approval:

- short term: Inkwise can be wired through existing task infrastructure
- target shape: dedicated Inkwise task execution path in a later phase

### 8. AI provider contract

- Inkwise must use Vertex AI, not the Generative Language API key flow.
- All Gemini calls in Inkwise will be routed through a shared CPAAutomation-compatible Vertex wrapper.
- This includes:
  - grounded answer generation
  - writing tools
  - query rewrite
  - tree-search fallback
  - PageIndex OSS tree generation monkeypatch path

Not allowed after migration:

- `GEMINI_API_KEY`
- direct calls to `https://generativelanguage.googleapis.com`

### 9. Billing contract

- Inkwise will not ship with a separate standalone Stripe billing flow in the initial integration.
- CPAAutomation remains the billing authority.
- Inkwise usage accounting may be added later, but checkout, subscriptions, and portal flows stay platform-owned.

Phase 1 default policy:

- no separate Inkwise subscription page
- no copied Inkwise billing tables or webhook handlers
- usage metering decisions deferred to a later billing phase

## Reuse vs Rewrite

### Reuse directly or with light adaptation

From CPAAutomation:

- `backend/dependencies/auth.py`
- `backend/main.py`
- `backend/services/gcs_service.py`
- `backend/services/cloud_run_task_service.py`
- `lib/api.ts`
- `app/dashboard/layout.tsx`
- `components/layout/sidebar.tsx`

From Inkwise:

- `vendor/pageindex/`
- `inkwise/apps/api/app/services/pdf_extract.py`
- `inkwise/apps/api/app/services/ingestion.py`
- `inkwise/apps/api/app/services/pageindex_oss_treegen.py`
- `inkwise/apps/api/app/rag/retrieval.py`
- `inkwise/apps/api/app/services/exporter.py`
- `inkwise/apps/api/app/api/routes/chat.py`
- `inkwise/apps/api/app/api/routes/writing_tools.py`
- `inkwise/apps/api/app/api/routes/documents.py`
- `inkwise/apps/api/app/api/routes/sources.py`
- `inkwise/apps/api/app/api/routes/bindings.py`
- `inkwise/apps/api/app/api/routes/templates.py`
- archived Inkwise web components and routes (now copied into `components/inkwise/` and `app/dashboard/inkwise/`)

### Rewrite or replace

Do not port directly:

- `inkwise/apps/api/app/api/routes/auth.py`
- `inkwise/apps/api/app/api/deps.py`
- archived Inkwise standalone auth/shell components
- `inkwise/apps/api/app/services/gemini.py`
- `inkwise/apps/api/app/models/billing.py`
- `inkwise/apps/api/alembic/versions/0001_init.py`
- `inkwise/apps/api/alembic/versions/0002_ingestion_tree_cache.py`
- `inkwise/apps/api/alembic/versions/0003_treegen_rag_tables.py`

Reason:

- these areas conflict with CPAAutomation's auth, schema, billing, routing, or provider model

## Environment Variables

Inkwise module env vars will be namespaced to avoid collisions with CPAAutomation extraction settings.

Approved env vars:

- `INKWISE_ENABLED`
- `INKWISE_GEMINI_MODEL`
- `INKWISE_GROUNDED_MODEL`
- `INKWISE_TREEGEN_MODEL`
- `INKWISE_QUERY_REWRITE_MODEL`
- `INKWISE_TREE_SEARCH_MODEL`
- `INKWISE_SOURCE_PREFILTER_ENABLED`
- `INKWISE_QUERY_REWRITE_ENABLED`
- `INKWISE_TREE_SEARCH_ENABLED`
- `INKWISE_MAX_BOUND_SOURCES`
- `INKWISE_MAX_UPLOAD_MB`

Shared platform env vars Inkwise will reuse:

- `DATABASE_URL`
- `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_CLOUD_LOCATION`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `GCS_BUCKET_NAME`
- `CLOUD_RUN_REGION`
- existing task service URLs or future Inkwise task service URLs

Phase 1 decision:

- Inkwise provider config will be Vertex-based and project-scoped, not API-key-based.

## Module Directory Shape

Target CPAAutomation structure:

```text
app/dashboard/inkwise/
components/inkwise/
hooks/useInkwise*.ts
backend/inkwise/
backend/inkwise/routes/
backend/inkwise/services/
backend/inkwise/models/
backend/inkwise/schemas/
backend/alembic/versions/
```

The exact backend folder can be `backend/inkwise/` or `backend/modules/inkwise/`, but all Inkwise code should stay grouped under one module boundary.

## Phase 1 Acceptance Criteria

Phase 1 is complete when the following are true:

- route namespaces are fixed for frontend and backend
- auth approach is fixed to Firebase reuse
- table names are fixed and collision-safe
- storage prefixes are fixed
- provider migration target is fixed to Vertex AI
- reuse vs rewrite boundaries are documented
- later phases can proceed without revisiting these decisions

## Explicit Non-Goals For Phase 1

- no production code scaffolding yet
- no database migrations yet
- no placeholder routes yet
- no UI pages yet
- no provider implementation yet

Those belong to later phases.
