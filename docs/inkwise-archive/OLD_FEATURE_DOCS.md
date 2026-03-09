# Inkwise Original Feature Documentation

This document describes Inkwise product features as implemented in the original version. It is written to be both user/workflow oriented and engineering-useful (feature-to-endpoint mapping).

See also: `OLD_TECHNICAL_DOCS.md` for architecture, local dev, and deeper implementation notes.

## Table of Contents

- [Inkwise Original Feature Documentation](#inkwise-original-feature-documentation)
  - [Table of Contents](#table-of-contents)
  - [At A Glance](#at-a-glance)
  - [Web App Features (Current UI)](#web-app-features-current-ui)
    - [Login](#login)
    - [Sidebar: Document List + Navigation](#sidebar-document-list--navigation)
    - [Editor Workspace](#editor-workspace)
    - [Reference Tab (Per-Document)](#reference-tab-per-document)
    - [Templates Page](#templates-page)
    - [Reference Library Page](#reference-library-page)
    - [Help Page](#help-page)
  - [AI Writing Features](#ai-writing-features)
    - [AI Tools (Selection-Based)](#ai-tools-selection-based)
    - [Predict (Non-Streaming)](#predict-non-streaming)
    - [AI Chat (SSE) With History](#ai-chat-sse-with-history)
  - [References (Library + Document-Scoped Retrieval)](#references-library--document-scoped-retrieval)
    - [Uploading a Reference File (General Files)](#uploading-a-reference-file-general-files)
    - [Inkwise References (File / Website / Image)](#inkwise-references-file--website--image)
    - [Binding References to a Document (For Grounded AI)](#binding-references-to-a-document-for-grounded-ai)
  - [Templates (My Templates + System Templates)](#templates-my-templates--system-templates)
    - [My Templates](#my-templates)
    - [System Templates](#system-templates)
  - [Exporting Documents (PDF/DOCX)](#exporting-documents-pdfdocx)
  - [Accounts, Auth, and Roles](#accounts-auth-and-roles)
    - [Authentication Methods](#authentication-methods)
    - [User Management](#user-management)
    - [Roles and RBAC](#roles-and-rbac)
  - [Plans, Quotas, and Billing (Stripe)](#plans-quotas-and-billing-stripe)
    - [Plans (User-Facing)](#plans-user-facing)
    - [Quotas](#quotas)
    - [Stripe Subscription](#stripe-subscription)
    - [Plans (Admin)](#plans-admin)
  - [Files and Images (General Storage APIs)](#files-and-images-general-storage-apis)
    - [Files](#files)
    - [Images](#images)
  - [Background Processing (Worker)](#background-processing-worker)
  - [Hurrylegal Module (Separate Product Area)](#hurrylegal-module-separate-product-area)
  - [Known Integration Gaps / Mismatches](#known-integration-gaps--mismatches)
  - [Appendix: Endpoint Map by Feature](#appendix-endpoint-map-by-feature)

## At A Glance

Inkwise is an AI-assisted writing app centered on:

- Documents: create and edit rich-text documents (Tiptap-based editor with autosave).
- References: upload or collect source materials and use them for AI-grounded writing and chat.
- Templates: start documents from personal or system templates.
- Export: download documents as PDF or DOCX.
- Plans/Billing: quotas for uploads/chats, subscription via Stripe.

Core components:

- Frontend SPA: `frontend/` (Vue 3 + Vite + Element Plus).
- Backend API: `backend/` (FastAPI).
- Worker: `backend/src/worker/` (Celery + Redis) for file/reference processing and embeddings.

API base paths (as deployed):

- Backend is configured with `root_path = "/api/v1"`.
- Typical browser calls are made to `/api/v1/...` (frontend uses `/api` base + `/v1/...` paths).

## Web App Features (Current UI)

Frontend routes are defined in `frontend/src/router.js`.

### Login

What the user sees:

- Username/password login form.
- On success, the app stores a JWT in a cookie and redirects to the main workspace.

Frontend behavior:

- Login view: `frontend/src/views/login/index2.vue`.
- Stores cookies: `auth_token` (JWT), `userName`.
- Route guard checks `auth_token` and redirects to `/login` if missing.

Backend endpoints:

- `POST /api/v1/auth/login` (form-encoded OAuth2 password flow).
- `POST /api/v1/auth/refresh-token`.
- `POST /api/v1/auth/logout`.

Notes:

- Backend also sets an HttpOnly `access_token` cookie on login; current frontend primarily uses `auth_token` cookie.

### Sidebar: Document List + Navigation

What the user sees:

- Left sidebar with:
  - "New Document" button.
  - "All Documents" list with per-doc actions (Export, Duplicate, Delete).
  - Navigation to Templates, Reference library, Help.
  - User dropdown with Logout.

Frontend implementation:

- Layout: `frontend/src/components/layout/index.vue` and `frontend/src/components/layout/LeftContent.vue`.
- Document list state: `frontend/src/components/layout/index.js`.

Backend endpoints:

- List documents: `GET /api/v1/iw/doc/items?page=&limit=`.
- Create document: `POST /api/v1/iw/doc/items`.
- Delete document: `DELETE /api/v1/iw/doc/items/{doc_id}`.
- Export document: `GET /api/v1/iw/doc/files/export/{document_id}?export_type=pdf|docx`.
- Duplicate document (implemented client-side as a create with copied fields): `POST /api/v1/iw/doc/items`.

### Editor Workspace

What the user sees:

- Central editor with a rich-text editing surface.
- Autosave indicator.
- Document settings (prompt + language).
- "More" menu (Export, Duplicate, Delete).
- A right-side panel with:
  - Reference tab (document-specific selected references).
  - AI Chat tab (chat history + new chat messages).

Frontend implementation:

- Workspace shell: `frontend/src/views/write/index.vue`.
- Editor core: `frontend/src/views/write/components/CenterContent.vue`.
- Right panel: `frontend/src/views/write/components/RightContent.vue`.
- Document settings dialog: `frontend/src/components/layout/PromptDialog.vue`.

Backend endpoints:

- Read document: `GET /api/v1/iw/doc/items/{doc_id}`.
- Update document (autosave): `PUT /api/v1/iw/doc/items/{doc_id}`.
- Export: `GET /api/v1/iw/doc/files/export/{document_id}`.

Autosave behavior:

- Editor debounces saves (about 2 seconds) and updates:
  - `content` (HTML)
  - `title` (derived from the first heading, else "Untitled")

### Reference Tab (Per-Document)

What the user sees:

- A list of references available to the current document.
- Upload a new reference (PDF/DOC/DOCX) or select from the reference library.
- Per-item actions (Download, Delete/unbind).
- Status chips for background processing (Pending/Processing/Failed).

Frontend implementation:

- Panel: `frontend/src/views/write/components/RightContent.vue`.
- Add Reference dialog: `frontend/src/views/write/components/AddReferenceDialog.vue`.
- Select from library dialog: `frontend/src/views/write/components/SelectReferenceDialog.vue`.

Backend endpoints (current frontend calls):

- List document-bound items: `GET /api/v1/iw/doc/files/{document_id}` (frontend call).
- Bind: `POST /api/v1/iw/doc/files/bind` (frontend call).
- Unbind: `POST /api/v1/iw/doc/files/unbind` (frontend call).

Important:

- The backend currently exposes document binding under `/api/v1/iw/doc/refs/*` (see [Known Integration Gaps / Mismatches](#known-integration-gaps--mismatches)).

### Templates Page

What the user sees:

- Template library with tabs:
  - "My templates"
  - System template categories
- Upload "My Template" (PDF/DOCX) and annotate with icon/title/description.
- Use a template to create a new document.

Frontend implementation:

- Templates page: `frontend/src/views/templates/index.vue`.
- Upload dialog: `frontend/src/views/templates/UploadTemplateDialog.vue`.

Backend endpoints:

- List categories: `GET /api/v1/iw/template/categories/items`.
- List user templates: `GET /api/v1/iw/template/items`.
- Create user template (from processed file content): `POST /api/v1/iw/template/items`.
- List system templates for a category: `GET /api/v1/iw/template/sys/items?c={category_id}`.
- Read a system template: `GET /api/v1/iw/template/sys/items/{id}?c={category_id}`.
- Delete user template: `DELETE /api/v1/iw/template/items/{id}`.

### Reference Library Page

What the user sees:

- A grid of uploaded reference files.
- Upload reference files.
- Preview in a new window (presigned URL).
- Download and delete.
- Status polling while processing completes.

Frontend implementation:

- Reference library: `frontend/src/views/references/index.vue`.

Backend endpoints (current frontend calls):

- Upload: `POST /api/v1/file/upload`.
- List: `GET /api/v1/file/list?output_type=text`.
- Status: `GET /api/v1/file/task_status/{file_id}`.
- Preview: `GET /api/v1/file/preview/{file_id}`.
- Download: `GET /api/v1/file/download/{file_id}`.
- Delete (soft-delete): `DELETE /api/v1/file/delete/{file_id}`.

Note:

- Inkwise also has a dedicated reference system under `/api/v1/iw/ref/*`; the current UI page uses general `/file/*` APIs.

### Help Page

- Present as a placeholder in `frontend/src/views/help/index.vue`.

## AI Writing Features

Inkwise supports two primary AI modes:

1) "AI Tools" actions that operate on current editor selection/content.
2) Document-scoped AI chat with (optional) reference grounding.

### AI Tools (Selection-Based)

What the user sees:

- A BubbleMenu "AI Tools" dropdown when text is selected.
- Tools implemented in the UI:
  - Improve fluency
  - Make longer
  - Write opposing argument
- Results appear in a popover with actions:
  - Insert below
  - Replace selection
  - Try again

Frontend implementation:

- Menu: `frontend/src/views/write/components/ToolMenuBar.vue`.
- Result popover: `frontend/src/views/write/components/AiContentPopper.vue`.
- SSE request helper: `frontend/src/views/write/components/write.js`.
  - Note: `aiWriteRequest(...)` is built for SSE (`fetchEventSource`) and is not compatible with `action=predict`.

Backend endpoint:

- `POST /api/v1/iw/writer/write` (SSE for most actions; JSON when `action=predict`).

Writer actions (backend enum):

- `improve`, `longer`, `opposing_argument`, `translate`, `concise`, `human`, `auto`, `chat`, `other`, `predict`.

### Predict (Non-Streaming)

What it is:

- A writer mode that returns a single JSON response instead of streaming SSE.
- Useful for “one-shot” predictions/suggestions where the UI does not need incremental tokens.

Backend behavior:

- Endpoint: `POST /api/v1/iw/writer/write`.
- When `action=predict`, the backend:
  - Runs retrieval (if references are available via partition/scoping) and builds a prediction prompt.
  - Returns JSON (FastAPI `ResponseModel`) where `data` is the final output string.
  - Still counts toward plan chat quota checks (quota is enforced before branching on action).

### AI Chat (SSE) With History

What the user sees:

- Chat thread per document.
- Messages stream in as the AI writes.
- Ability to select which references (files) should be used.
- "Add to document" button to insert AI output into the editor.

Frontend implementation:

- Chat panel: `frontend/src/views/write/components/AiChatPanel.vue`.
- Uses SSE via `@microsoft/fetch-event-source`.

Backend endpoints:

- Send chat/action (SSE): `POST /api/v1/iw/writer/write`.
- Read chat history: `GET /api/v1/iw/writer/history/{document_id}?action=chat&page=&limit=`.
- Clear chat memory/checkpoints: `GET /api/v1/iw/writer/cache_clear/{document_id}`.

How citations/metadata are surfaced:

- Backend emits SSE events:
  - `event: chat` with cumulative content.
  - `event: meta` on tool start/end; end may include reference metadata.
- Frontend renders inline reference indices and shows hover popovers for cited snippets.

Grounding model (high level):

- When references are bound to a document in the vector store partition, retrieval can be constrained by document ID.
- Optionally, requests can include `file_ids` to further filter retrieval.

## References (Library + Document-Scoped Retrieval)

There are two reference concepts present in this repo:

1) General uploaded files (`/api/v1/file/*`) used by the current Reference Library UI.
2) Inkwise references (`/api/v1/iw/ref/*`) designed for document-scoped retrieval and (file/website/image) sources.

### Uploading a Reference File (General Files)

User workflow:

- Upload a file in the Reference Library page.
- The UI polls task status until processing is done.
- Preview opens a presigned URL.

Backend flow:

- Upload: `POST /api/v1/file/upload` stores bytes in S3, creates a `file` row, enqueues Celery processing.
- Poll: `GET /api/v1/file/task_status/{file_id}`.

Supported:

- Size: up to 30MB (backend enforced).
- Many MIME types supported (PDF, Office docs, code/text, images); see `SUPPORTED_FILE_TYPES` in `backend/src/general_api/routes/file.py`.

### Inkwise References (File / Website / Image)

Inkwise reference APIs support:

- `ref_type=file`: upload a file; extract content; embed into vector store.
- `ref_type=website`: store and scrape a URL; embed content.
- `ref_type=image`: accepted by API; processing depends on worker capabilities.

Endpoints:

- Upload: `POST /api/v1/iw/ref/upload`.
- List: `GET /api/v1/iw/ref/list`.
- Status: `GET /api/v1/iw/ref/task_status/{reference_id}`.
- Preview: `GET /api/v1/iw/ref/preview/{reference_id}`.
- Download: `GET /api/v1/iw/ref/download/{reference_id}`.
- Delete (soft-delete): `DELETE /api/v1/iw/ref/delete/{reference_id}`.

Special handling for PDF references:

- PDFs may be submitted to an external processing service (Cobbling).
- Cobbling calls back to: `POST /api/v1/iw/ref/pdf/callback`.
- On completion, markdown is embedded and reference status updated.

### Binding References to a Document (For Grounded AI)

Intended behavior (backend implementation):

- A document binds selected reference chunk IDs to a `partition_id` equal to the document ID.
- The writer retriever can search within that partition, optionally filtering by reference IDs.

Backend endpoints:

- List document-bound references: `GET /api/v1/iw/doc/refs/{document_id}`.
- Bind references: `POST /api/v1/iw/doc/refs/bind`.
- Unbind a reference: `POST /api/v1/iw/doc/refs/unbind`.

Important:

- Current frontend uses `/api/v1/iw/doc/files/*` routes which are not present in backend as checked in; see [Known Integration Gaps / Mismatches](#known-integration-gaps--mismatches).

## Templates (My Templates + System Templates)

Templates exist in two layers:

- My Templates: per-user templates created from processed uploaded files.
- System Templates: shared templates grouped by categories.

### My Templates

User workflow:

- Upload a PDF/DOCX.
- Wait for file processing to complete.
- Create a template record referencing the processed content.
- Use a template to create a new document.

Backend endpoints:

- Upload file for markdown output: `POST /api/v1/file/upload` with `output_type=markdown`.
- Create template from file content: `POST /api/v1/iw/template/items` (expects `file_id`, plus metadata).
- List templates: `GET /api/v1/iw/template/items`.
- Delete template: `DELETE /api/v1/iw/template/items/{id}`.

### System Templates

User workflow:

- Browse categories.
- List templates by category.
- Use a system template to create a new document.

Backend endpoints:

- List categories: `GET /api/v1/iw/template/categories/items`.
- List templates: `GET /api/v1/iw/template/sys/items?c={category_id}`.
- Read template: `GET /api/v1/iw/template/sys/items/{id}?c={category_id}`.

System template ingestion (admin/curation flow):

- Upload and ingest: `POST /api/v1/iw/file/template/sys/upload`.
  - Accepts PDF/DOCX.
  - Worker converts to markdown and creates `SystemTemplate`.

## Exporting Documents (PDF/DOCX)

User workflow:

- Click Export.
- Choose PDF or Word.
- Browser downloads the file.

Frontend implementation:

- Export dialog: `frontend/src/views/write/components/ExportDialog.vue`.

Backend endpoint:

- `GET /api/v1/iw/doc/files/export/{document_id}?export_type=pdf|docx`.

Implementation notes (feature-relevant):

- Document content is stored as HTML and converted:
  - PDF: WeasyPrint renders HTML.
  - DOCX: HTML parsed and written with `python-docx`.

## Accounts, Auth, and Roles

### Authentication Methods

1) Username/password (JWT)

- Login: `POST /api/v1/auth/login`.
- Refresh: `POST /api/v1/auth/refresh-token`.
- Logout: `POST /api/v1/auth/logout`.

2) Auth0 OIDC (backend-supported)

- Start login: `GET /api/v1/auth0/login`.
- Callback: `GET /api/v1/auth0/callback`.
- Logout: `GET /api/v1/auth0/logout`.

Note:

- Frontend has Auth0 wiring in `frontend/src/main.js` / `frontend/src/views/login/index.vue` but it is not currently used by the main router route (which uses `index2.vue`).

### User Management

Endpoints:

- Me: `GET /api/v1/user/me`.
- Update me: `PATCH /api/v1/user/me`.
- Delete me: `DELETE /api/v1/user/me`.
- Admin list: `GET /api/v1/user/list` (requires sysadmin role).

Email verification + registration (token-based):

- Send code: `POST /api/v1/user/register/send_code`.
- Verify code: `POST /api/v1/user/register/verify_code`.
- Register: `POST /api/v1/user/register`.

Password utilities:

- Forgot password: `POST /api/v1/auth/forgot_password`.
- Reset password: `POST /api/v1/auth/reset_password`.

### Roles and RBAC

RBAC is enforced by route dependencies.

Endpoints:

- Create role: `POST /api/v1/role/add`.
- List roles: `GET /api/v1/role/list`.
- Delete role: `DELETE /api/v1/role/{role_id}`.
- Choose initial role: `POST /api/v1/role/choose_init_role`.
- Change user roles: `PUT /api/v1/role/change_user_roles`.

## Plans, Quotas, and Billing (Stripe)

### Plans (User-Facing)

- List sale plans + current user status: `GET /api/v1/iw/plan/list`.

### Quotas

Quota enforcement points:

- File uploads: `POST /api/v1/file/upload` checks plan `max_upload_files` for the current cycle.
- Inkwise reference uploads: `POST /api/v1/iw/ref/upload` checks plan `max_upload_files`.
- Writer chats/actions: `POST /api/v1/iw/writer/write` checks plan `max_chats`.

Plan fields present (not all enforced everywhere):

- `max_upload_files`, `max_chats`, `max_documents`, `max_templates`.

### Stripe Subscription

Endpoints:

- Start checkout: `GET /api/v1/iw/order/subscribe/{plan_id}`.
- Cancel subscription: `GET /api/v1/iw/order/subscribe/cancel/{plan_id}`.
- Webhook callback: `POST /api/v1/iw/order/pay/stripe/callback/`.

Behavior:

- Checkout returns a Stripe URL for the frontend to redirect.
- Webhook updates orders and user plan association; uses a Redis lock for idempotency.

### Plans (Admin)

Admin plan CRUD is provided under `/api/v1/plan/*`.

- Create: `POST /api/v1/plan/`.
- Read: `GET /api/v1/plan/{plan_id}`.
- List: `GET /api/v1/plan/list/all`.
- Update: `PUT /api/v1/plan/{plan_id}`.
- Delete: `DELETE /api/v1/plan/{plan_id}`.
- Assign plan to user: `POST /api/v1/plan/user/add_plan`.

## Files and Images (General Storage APIs)

### Files

This is a general-purpose upload + processing pipeline used by the Reference Library UI and by template creation.

Endpoints:

- Upload: `POST /api/v1/file/upload`.
- List: `GET /api/v1/file/list`.
- Task status: `GET /api/v1/file/task_status/{file_id}`.
- Preview (presigned URL): `GET /api/v1/file/preview/{file_id}`.
- Download: `GET /api/v1/file/download/{file_id}`.
- Delete (soft): `DELETE /api/v1/file/delete/{file_id}`.

### Images

Two styles of image handling exist:

- Private images tied to a user (preview via presigned URL).
- Public uploads returning a CDN URL.

Endpoints:

- Private upload: `POST /api/v1/img/upload`.
- Private preview (redirect to presigned URL): `GET /api/v1/img/preview/{image_id}`.
- Public upload (returns CDN URL): `POST /api/v1/img/upload_public`.

Note:

- There is also `/api/v1/file/image/upload` which uploads public images to S3 and returns `image_url`.

## Background Processing (Worker)

Inkwise uses Celery tasks for long-running operations: extraction, conversion, thumbnailing, chunking, embeddings.

User-visible effects:

- After upload, files/references show a processing status.
- UI polls task status until success/failure.

Key tasks (Celery):

- `process_file_task`: extract text + embed.
- `process_file_to_markdown_task`: convert to markdown.
- `add_to_system_template_task`: convert to markdown + create system template.
- `process_reference_task`: process Inkwise reference (file/website/image).

Status polling endpoints:

- Files: `GET /api/v1/file/task_status/{file_id}`.
- Inkwise references: `GET /api/v1/iw/ref/task_status/{reference_id}`.

Dependencies required in most deployments:

- Redis: broker/result backend and other app features.
- Postgres + pgvector: relational data and vector store.
- S3-compatible storage: file bytes.
- LLM/embeddings provider: OpenAI used in current implementation.

## Hurrylegal Module (Separate Product Area)

Inkwise includes a second backend module mounted at `/api/v1/hl`.

Concept:

- Create/publish a lawyer/agent profile.
- Upload knowledge files into an agent knowledge base.
- Bind knowledge to an agent partition (vector store).
- Chat with the agent via SSE; support chat threads and history.

Key endpoints:

- Agent management:
  - `POST /api/v1/hl/agent/add`
  - `POST /api/v1/hl/agent/get_my_agent`
  - `PUT /api/v1/hl/agent/{aid}`
  - `PUT /api/v1/hl/agent/publish/{aid}`
  - `DELETE /api/v1/hl/agent/{aid}`
- Knowledge base:
  - `POST /api/v1/hl/agent/{aid}/upload_knowledge_file`
  - `GET /api/v1/hl/agent/get_knowledge_file_status/{file_id}`
  - `POST /api/v1/hl/agent/{aid}/knowledge_file_bind`
  - `GET /api/v1/hl/agent/{aid}/knowledge_file_list`
- Chat:
  - `POST /api/v1/hl/chat/agent/{aid}/chat` (SSE)
  - `POST /api/v1/hl/chat/agent/{aid}/test_chat` (SSE)
  - `POST /api/v1/hl/chat/chat` (global chat, SSE)
- Chat threads + history helpers:
  - `POST /api/v1/hl/chat/generate_my_chat_thread`
  - `GET /api/v1/hl/chat/agent/{aid}/my_chat_threads`
  - `GET /api/v1/hl/chat/agent/{aid}/thread/{tid}`

## Known Integration Gaps / Mismatches

These items are important for feature expectations because they affect whether a UI flow works against the current backend code.

1) Document reference binding route mismatch

- Backend provides document binding for Inkwise references under:
  - `GET /api/v1/iw/doc/refs/{document_id}`
  - `POST /api/v1/iw/doc/refs/bind`
  - `POST /api/v1/iw/doc/refs/unbind`
- Frontend (Right panel) currently calls:
  - `GET /api/v1/iw/doc/files/{document_id}`
  - `POST /api/v1/iw/doc/files/bind`
  - `POST /api/v1/iw/doc/files/unbind`

Impact:

- Unless the backend has additional routes not present in this repo, the per-document reference panel may not function end-to-end as intended.

2) Two parallel "reference library" concepts

- Frontend "Reference library" page uses general files (`/api/v1/file/*`).
- Backend Inkwise references exist under `/api/v1/iw/ref/*` with website/PDF callback support.

Impact:

- Uploading files via the UI will populate `file` rows, not `iw_reference` rows, and will not participate in the Inkwise reference binding + partitioned retrieval pipeline unless an integration layer is added.

3) Token/cookie naming differences

- Frontend uses `auth_token` cookie and sends `Authorization: Bearer <token>`.
- Backend sets `access_token` HttpOnly cookie on login.

Impact:

- This is workable (the Authorization header is sufficient), but cookie-based flows and Auth0 flows can feel inconsistent.

## Appendix: Endpoint Map by Feature

This section is a compact cross-reference.

Documents:

- Create: `POST /api/v1/iw/doc/items`
- List: `GET /api/v1/iw/doc/items`
- Read: `GET /api/v1/iw/doc/items/{doc_id}`
- Update: `PUT /api/v1/iw/doc/items/{doc_id}`
- Delete: `DELETE /api/v1/iw/doc/items/{doc_id}`
- Export: `GET /api/v1/iw/doc/files/export/{document_id}`

Writer / AI:

- Action/chat (SSE): `POST /api/v1/iw/writer/write`
- Predict (JSON): `POST /api/v1/iw/writer/write` with `action=predict`
- History: `GET /api/v1/iw/writer/history/{document_id}`
- Clear cache: `GET /api/v1/iw/writer/cache_clear/{document_id}`

Inkwise references:

- Upload: `POST /api/v1/iw/ref/upload`
- List: `GET /api/v1/iw/ref/list`
- Task status: `GET /api/v1/iw/ref/task_status/{reference_id}`
- Preview: `GET /api/v1/iw/ref/preview/{reference_id}`
- Download: `GET /api/v1/iw/ref/download/{reference_id}`
- Delete: `DELETE /api/v1/iw/ref/delete/{reference_id}`
- PDF callback: `POST /api/v1/iw/ref/pdf/callback`

Document binding (backend-implemented):

- List doc refs: `GET /api/v1/iw/doc/refs/{document_id}`
- Bind refs: `POST /api/v1/iw/doc/refs/bind`
- Unbind ref: `POST /api/v1/iw/doc/refs/unbind`

Templates:

- Categories: `GET /api/v1/iw/template/categories/items`
- My templates list: `GET /api/v1/iw/template/items`
- Create my template: `POST /api/v1/iw/template/items`
- Delete my template: `DELETE /api/v1/iw/template/items/{id}`
- System templates list: `GET /api/v1/iw/template/sys/items?c={category_id}`
- System template read: `GET /api/v1/iw/template/sys/items/{id}?c={category_id}`
- System template ingest: `POST /api/v1/iw/file/template/sys/upload`

Files (general):

- Upload: `POST /api/v1/file/upload`
- List: `GET /api/v1/file/list`
- Task status: `GET /api/v1/file/task_status/{file_id}`
- Preview: `GET /api/v1/file/preview/{file_id}`
- Download: `GET /api/v1/file/download/{file_id}`
- Delete: `DELETE /api/v1/file/delete/{file_id}`

Images:

- Upload: `POST /api/v1/img/upload`
- Preview: `GET /api/v1/img/preview/{image_id}`
- Upload public: `POST /api/v1/img/upload_public`

Plans/Billing:

- User plan list: `GET /api/v1/iw/plan/list`
- Subscribe: `GET /api/v1/iw/order/subscribe/{plan_id}`
- Cancel: `GET /api/v1/iw/order/subscribe/cancel/{plan_id}`
- Stripe webhook: `POST /api/v1/iw/order/pay/stripe/callback/`
- Admin plan CRUD: `/api/v1/plan/*`

Auth/User/Roles:

- Login: `POST /api/v1/auth/login`
- Refresh: `POST /api/v1/auth/refresh-token`
- User me: `GET /api/v1/user/me`
- Roles: `/api/v1/role/*`
- Auth0: `/api/v1/auth0/*`
