# Inkwise Original Technical Documentation

This document describes the Inkwise codebase as implemented in the original version. It covers architecture, local development, configuration, and the major backend/frontend modules.

Last updated: 2026-02-25

## Contents

- [Repository Layout](#repository-layout)
- [Tech Stack (High Level)](#tech-stack-high-level)
- [Running Locally (Developer Quickstart)](#running-locally-developer-quickstart)
- [Configuration](#configuration)
- [Backend Architecture](#backend-architecture)
- [API Conventions](#api-conventions)
- [API Catalog (Core Endpoints)](#api-catalog-core-endpoints)
- [Docker and Deployment (Backend)](#docker-and-deployment-backend)
- [Frontend Architecture](#frontend-architecture)
- [Frontend/Backend Integration](#frontendbackend-integration)
- [Background Processing Pipelines](#background-processing-pipelines)
- [Vector Store and Retrieval](#vector-store-and-retrieval)
- [Writer (SSE) and Agent Behavior](#writer-sse-and-agent-behavior)
- [Plans, Quotas, and Stripe Billing](#plans-quotas-and-stripe-billing)
- [Hurrylegal Module Overview](#hurrylegal-module-overview)
- [Relational Data Model (Key Tables)](#relational-data-model-key-tables)
- [CI/CD](#cicd)
- [Known Gaps and Integration Mismatches (Observed)](#known-gaps-and-integration-mismatches-observed)

## Repository Layout

Top-level directories:

- `backend/`: Python backend (FastAPI API + Celery worker) with Docker and GitHub Actions workflows.
- `frontend/`: Vue 3 single-page app (Vite) with GitHub Actions workflows.

## Tech Stack (High Level)

Backend (`backend/`):

- API framework: FastAPI (served with Uvicorn)
- Async jobs: Celery
- Database: PostgreSQL (pgvector image used in docker-compose)
- ORM: SQLAlchemy (async engine via `asyncpg`)
- Auth/authz: JWT/Auth0 integration; Casbin for authorization policy enforcement
- AI/document tooling (by dependencies): LangChain/LangGraph, OpenAI client, Unstructured, PyMuPDF, WeasyPrint, LibreOffice/Pandoc, NLTK
- Dependency manager: PDM

Frontend (`frontend/`):

- Framework: Vue 3
- Build tooling: Vite
- UI library: Element Plus
- Editor: Tiptap
- HTTP: Axios; SSE client via `@microsoft/fetch-event-source`
- Dependency manager: npm/pnpm (lockfiles present)

## Running Locally (Developer Quickstart)

### Backend

Backend is managed with PDM.

Prerequisites:

- Python: `3.12.x` (see `backend/pyproject.toml`).
- System libraries: if you run file conversion/exports locally (PDF/DOCX processing), you may need OS packages similar to those installed in `backend/Dockerfile` (Poppler, LibreOffice, Pandoc, wkhtmltopdf, etc.).

1) Create an environment file:

- Copy `backend/.env.example` to `backend/.env` (or otherwise provide env vars).

2) Start a local Postgres (pgvector) container:

```sh
cd backend
docker-compose -f docker-compose-db.yml up -d
```

This starts Postgres on `localhost:5432` with defaults from `backend/docker-compose-db.yml`.

Common env var format used by the backend:

- `DATABASE_URL` is expected to be the authority part only (no scheme, no DB name), e.g. `postgres:ai123456@127.0.0.1:5432`.
- `DATABASE_DB_NAME` is appended as the database name (default `test`).
- Async SQLAlchemy uses `postgresql+asyncpg://` internally; the worker uses `postgresql+psycopg://`.

3) Start Redis (required for Celery and several app features):

```sh
docker run --rm -d -p 6379:6379 redis:alpine
```

4) Install dependencies and run the API:

```sh
cd backend
pdm sync
pdm run start
```

Notes:

- `pdm run start` runs Uvicorn with `--reload` on port `3006` (see `backend/pyproject.toml`).
- The FastAPI app is configured with `root_path = "/api/v1"` (see `backend/src/main.py`). In practice, many deployments will serve endpoints under `/api/v1/...`.

5) Start the Celery worker:

```sh
cd backend
pdm run worker
```

Celery requires Redis; local Redis can be started via Docker (see `backend/docker-compose.yml`) or via your own Redis instance.

Run backend tests:

```sh
cd backend
pdm sync -d -G test
pdm run pytest tests
```

### Frontend

Frontend is a Vite dev server.

```sh
cd frontend
npm install
npm run dev
```

If you prefer pnpm (a `pnpm-lock.yaml` is present):

```sh
cd frontend
pnpm install
pnpm run dev
```

Notes:

- Vite is configured to run on port `3000` (see `frontend/vite.config.js`).
- A dev proxy is configured for `/api` to target `https://beta-api.inkwise.ai` (see `frontend/vite.config.js`).
  - To use a local backend, update the proxy target (for example `http://localhost:3006` when using `pdm run start`, or `http://localhost:5005` when using the backend compose file).

Common frontend scripts:

```sh
cd frontend
npm run lint
npm run build
```

## Configuration

Backend settings are primarily provided via environment variables and loaded using `python-dotenv` + Pydantic Settings.

Key files:

- `backend/.env.example`: example env var names (do not treat included values as safe to commit).
- `backend/src/config/auth_config.py`: loads settings such as CORS origins, Auth0 configuration, and session secret.

Important runtime notes:

- CORS: `backend/src/main.py` combines a hard-coded localhost origin with `APP_CORS` and (optionally) `APP_CORS_ALLOW_ORIGINS`.
- Sessions: Starlette `SessionMiddleware` is enabled and uses `APP_SECRET_KEY`.

### Security Notes (Config and Secrets)

- Do not commit real secrets: treat `.env` and any generated `.env.prod` as sensitive.
- `backend/.env.example` currently contains non-empty example values for several credentials; ensure these are rotated/invalid and not used in production.
- GitHub Actions workflows should not hard-code API keys or Stripe secrets; prefer GitHub `secrets` and `vars`.
- Some worker utilities disable TLS verification via `ssl._create_default_https_context = ssl._create_unverified_context` (see `backend/src/worker/file_tasks.py`, `backend/src/worker/untils/common.py`, `backend/src/worker/untils/file_loader.py`). This improves compatibility but weakens transport security.
- Registration token signing key is hard-coded as `registration_key` in `backend/src/user_manage/utils.py`; consider moving it to an environment variable.

### Environment Variables (Backend)

Backend loads env vars via `dotenv` (see `backend/src/config/auth_config.py`, `backend/src/db_util/db.py`). Common variables referenced in code and CI include:

- `DATABASE_URL`: Postgres connection authority (user/pass/host/port). Code appends DB name.
- `DATABASE_DB_NAME`: primary relational DB name.
- `VECTORSTORE_DB_NAME`: referenced in CI; vector store DB name (implementation documented later).
- `REDIS_HOST`, `REDIS_PORT`: Redis connection settings.
- `OPENAI_API_KEY`, `OPENAI_ORGANIZATION`: LLM provider credentials.
- `UNSTRUCTURED_URL`, `UNSTRUCTURED_API_KEY`: Unstructured API configuration.
- `AWS_BUCKET`, `AWS_BUCKET_PUB`, `AWS_PULIC_BUCKET`: S3 bucket names (private/public; note spelling in env var name).
- `PUBLIC_CDN_BASE_URL`: base URL used to build public asset URLs.
- `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_DOMAIN`, `AUTH0_CALLBACK_URL`: Auth0 OIDC app configuration.
- `APP_CORS`, `APP_CORS_ALLOW_ORIGINS`: additional CORS origin(s).
- `APP_FRONT_URI`: front-end base URL used for redirects.
- `APP_SECRET_KEY`: session secret for `SessionMiddleware`.
- `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`: JWT signing and token expiry.
- `MAIL_SENDER`: from-address for email sending.
- `COBBLING_URL`, `COBBLING_API_KEY`: PDF processing callback/integration.
- `CF_HOST`: Cobbling web-scrape host override (used for website references).
- `STRIPE_KEY`, `STRIPE_ENDPOINT_SECRET`, `SITE_FRONT_URL`: Stripe/webhook configuration (present in CI workflows).

## Backend Architecture

### Entry Point and Router Registration

The API entry point is `backend/src/main.py`.

- Creates `FastAPI(root_path="/api/v1", lifespan=...)`
- Adds CORS middleware (origins derived from env)
- Adds session middleware
- Includes routers:
  - `backend/src/general_api/main.py` mounted at the app root (tagged `general_api`)
  - `backend/src/inkwise` mounted under `/iw`
  - `backend/src/hurrylegal` mounted under `/hl`

### General API Router

`backend/src/general_api/main.py` composes the primary API surface, including:

- User management: `/user`, `/auth`, `/role`, `/auth0`
- Chat: `/chat_history`, `/chat_model`
- Files: `/file`
- Images: `/img`
- Planning: `/plan`

Each of these prefixes is added under the app root; see `## API Catalog (Core Endpoints)` for the concrete endpoints.

### Database Session Management

`backend/src/db_util/db.py` defines:

- An async SQLAlchemy engine/sessionmaker wrapper (`DatabaseSessionManager`)
- `get_async_session()` dependency for FastAPI routes
- Casbin adapter using the SQLAlchemy engine, and `get_casbin_e()` to load policies

Environment variables used here include:

- `DATABASE_URL`: expected to contain the user/password/host/port portion (without the database name)
- `DATABASE_DB_NAME`: appended as the database name

### Authentication and Authorization

Authentication (JWT):

- Token creation/verification is implemented in `backend/src/user_manage/service/security.py`.
- `OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")` is used for bearer-token auth on protected endpoints.
- Tokens are signed with `SECRET_KEY` and `ALGORITHM` from env (defaults exist in code).

Authorization (Casbin RBAC):

- Casbin model: `backend/src/db_util/rbac_model.conf` (subject-role, object-resource, action-method).
- Enforcer is created in `backend/src/db_util/db.py` via `casbin_async_sqlalchemy_adapter.Adapter`.
- Route protection uses `check_permissions(obj, ex_rule=None)`:
  - Subject(s): the user role keys (e.g. `role_sysadmin`).
  - Object: the string passed into `check_permissions(...)` by each router.
  - Action: HTTP method (or `ex_rule` override like `FILE_UPIMG`).

Session/Auth0:

- Auth0 OIDC flow is implemented under `backend/src/user_manage/auth0/` and uses Starlette sessions.
- Callback stores `access_token`/`id_token`/`userinfo` in `request.session` and then mints the app JWT.

### Async Worker (Celery)

Celery is used for background document/reference processing.

Key files:

- `backend/src/worker/celeryconfig.py`: Celery app configuration.
- `backend/src/worker/main.py`: task entrypoints registered with Celery.
- `backend/src/worker/file_tasks.py`: file parsing, chunking, embeddings, and DB updates.
- `backend/src/worker/reference_tasks.py`: reference parsing (file/url), chunking, embeddings, and DB updates.

Broker/result backend:

- Broker: `redis://$REDIS_HOST:$REDIS_PORT/0`
- Result backend: `redis://$REDIS_HOST:$REDIS_PORT/1`
- Results expire: 2 days (see `result_expires`)

Operational settings (not exhaustive):

- Concurrency: `worker_concurrency=1`, `worker_pool='solo'`, `worker_prefetch_multiplier=1`
- Late ack + reject on lost worker enabled
- Task time limits: `task_time_limit=6000`, `task_soft_time_limit=5900`

Registered tasks (names used by `send_task`):

- `process_file_task`: parse uploaded file -> store extracted text -> optionally add embeddings -> update `file` row.
- `process_file_to_markdown_task`: convert file to Markdown (`pdf`/`docx`) -> store Markdown -> update `file` row.
- `add_to_system_template_task`: convert file to Markdown and create a `SystemTemplate` record.
- `process_reference_task`: parse reference file/url -> store extracted text -> optionally add embeddings -> update `iw_reference` row.

### Redis Usage (Beyond Celery)

Redis is also used outside Celery:

- Writer conversation checkpoints: `backend/src/inkwise/service/agents.py` uses Redis DB `3` via `AsyncRedisSaver`.
- Email verification and registration tokens: `backend/src/user_manage/routes/user.py` uses Redis DB `4`.
- Stripe callback locking: `backend/src/inkwise/routes/order.py` uses Redis DB `10` for a short-lived lock.

## API Conventions

### Base Paths

- FastAPI is created with `root_path = "/api/v1"` in `backend/src/main.py`.
- Routers are included as:
  - General API: `/api/v1/...`
  - Inkwise: `/api/v1/iw/...`
  - Hurrylegal: `/api/v1/hl/...`

### Response Envelope

Many endpoints return a `ResponseModel` JSON envelope (see `backend/src/schemas/common.py`), typically:

- `message`: human-readable status
- `data`: object/array payload

## API Catalog (Core Endpoints)

Unless otherwise noted, endpoints:

- Are served under the FastAPI `root_path` (`/api/v1`).
- Use JSON responses wrapped by `ResponseModel` (`{"message": "...", "data": ...}`).
- Require `Authorization: Bearer <token>` when protected by `check_permissions(...)`.

### Auth

`POST /api/v1/auth/login`

- Body: `application/x-www-form-urlencoded` (`username`, `password`, `grant_type=password`)
- Response: `Token` (`access_token`, `refresh_token`, `token_type`, `expires_in`)
- Side effects: sets an HttpOnly cookie `access_token` scoped to the request's root domain (see `backend/src/user_manage/routes/auth.py`).

`POST /api/v1/auth/refresh-token`

- Header: `refresh_token: <token>`
- Response: new `Token`

`POST /api/v1/auth/logout`

- Clears server session.

Auth0:

- `GET /api/v1/auth0/login`: starts the Auth0 OIDC redirect.
- `GET /api/v1/auth0/callback`: completes login, creates an app JWT, and redirects to `APP_FRONT_URI`.
- `GET /api/v1/auth0/logout`: clears cookies/session and redirects to Auth0 logout.

### Users and Roles

Users (base `/api/v1/user`):

- `GET /api/v1/user/me`: returns the current user plus roles.
- `PATCH /api/v1/user/me`: updates the current user.
- `DELETE /api/v1/user/me`: deletes the current user.
- `GET /api/v1/user/list`: sysadmin-only list.
- `POST /api/v1/user/register/send_code`: sends an email verification code (stored in Redis DB 4).
- `POST /api/v1/user/register/verify_code`: verifies code and returns a registration token.
- `POST /api/v1/user/register`: completes registration using the token.

Roles (base `/api/v1/role`):

- `POST /api/v1/role/add`: create role.
- `GET /api/v1/role/list`: list roles.
- `DELETE /api/v1/role/{role_id}`: delete role (fails if users still bound).
- `POST /api/v1/role/choose_init_role`: user selects an initial role.
- `PUT /api/v1/role/change_user_roles`: admin changes a user's role bindings.

### Documents (Inkwise)

Base: `/api/v1/iw/doc`

`POST /api/v1/iw/doc/items`

- Body: `DocumentCreateDto` (`title?`, `init_prompt?`, `content?`, `language?`)
- Response: `DocumentModel`

`GET /api/v1/iw/doc/items`

- Query: `page` (default 1), `limit` (default 10)
- Response: list of `DocumentModel`-like rows

`GET /api/v1/iw/doc/items/{doc_id}`

- Response: `DocumentModel` (includes `content`)

`PUT /api/v1/iw/doc/items/{doc_id}`

- Body: `DocumentUpdateDto` (all optional)
- Response: `{ id, ...updated_fields }`

`DELETE /api/v1/iw/doc/items/{doc_id}`

- Response: `ResponseModel`

Export:

- `GET /api/v1/iw/doc/files/export/{document_id}?export_type=pdf|docx`
  - Streams a file (`application/pdf` or docx MIME type)
  - PDF uses WeasyPrint; DOCX uses a BeautifulSoup HTML traversal (see `backend/src/inkwise/service/document.py`).

References bound to a document:

- `GET /api/v1/iw/doc/refs/{document_id}`: lists bound references (`DocumentReferenceModel`).
- `POST /api/v1/iw/doc/refs/bind`: body `DocumentBindParitionDto` (`document_id`, `ref_ids`).
- `POST /api/v1/iw/doc/refs/unbind`: body `DocumentUnbindParitionDto` (`document_id`, `document_ref_id`).

### Writer (Inkwise)

Base: `/api/v1/iw/writer`

`POST /api/v1/iw/writer/write`

- Body: `WriterAction`
- Returns:
  - JSON response when `action=predict`
  - Otherwise SSE (`text/event-stream`) with `event: chat` and `event: meta`

`GET /api/v1/iw/writer/history/{document_id}`

- Query: `action`, `page`, `limit`
- Response: list of `WriterHistoryModel`

`GET /api/v1/iw/writer/cache_clear/{document_id}`

- Clears Redis checkpoints for `(user_id, document_id)`.

### Templates (Inkwise)

Base: `/api/v1/iw/template`

- `GET /api/v1/iw/template/categories/items`: list categories.
- `GET /api/v1/iw/template/items`: list user templates.
- `POST /api/v1/iw/template/items`: create user template from `file_id` (reads `file.content`).
- `GET /api/v1/iw/template/items/{id}` / `PUT .../{id}` / `DELETE .../{id}`

System templates:

- `GET /api/v1/iw/template/sys/items?c={category_id}`
- `GET /api/v1/iw/template/sys/items/{id}?c={category_id}`

System template ingestion:

- `POST /api/v1/iw/file/template/sys/upload`: uploads a PDF/DOCX, converts to Markdown in the worker, and creates a `SystemTemplate`.

Reference binding helper:

- `GET /api/v1/iw/file/ready_to_bind_files/{document_id}`: lists references that are not yet bound to the given document.

### Files (General)

Base: `/api/v1/file`

`POST /api/v1/file/upload`

- Multipart form:
  - `file`: upload
  - `output_type`: `text` or `markdown`
- Validates:
  - Size: 0 < size <= 30MB
  - MIME type: see `SUPPORTED_FILE_TYPES` in `backend/src/general_api/routes/file.py`
- Side effects:
  - Uploads original bytes to S3 key `files/{user_id}/{timestamp}_{filename}`
  - Inserts a `file` row
  - Enqueues Celery task `process_file_task` or `process_file_to_markdown_task` with `task_id = file.id`

`GET /api/v1/file/task_status/{file_id}`

- Returns Celery status and (when successful) the stored task result.

`GET /api/v1/file/list`

- Query: `output_type` (`text|markdown`), `page`, `limit`
- Response: list of `FileResponseDto`

`GET /api/v1/file/preview/{file_id}`

- Returns a presigned S3 URL (`preview_url`) valid for ~600s.

`GET /api/v1/file/download/{file_id}`

- Streams file bytes from S3 with `Content-Disposition`.

`DELETE /api/v1/file/delete/{file_id}`

- Soft-deletes the file (`is_deleted=true`).

Images (base `/api/v1/img`):

- `POST /api/v1/img/upload`: uploads an image into the private bucket.
- `GET /api/v1/img/preview/{image_id}`: redirects to a presigned URL (cookie-based auth variant is used in this route).
- `POST /api/v1/img/upload_public`: uploads an image into the public bucket and returns a public CDN URL.

### References (Inkwise)

Base: `/api/v1/iw/ref`

- `POST /api/v1/iw/ref/upload`: multipart form; fields depend on `ref_type` (`file` vs `website`).
- `GET /api/v1/iw/ref/list`: list references.
- `GET /api/v1/iw/ref/task_status/{reference_id}`: poll background processing.
- `GET /api/v1/iw/ref/preview/{reference_id}`: presigned URL for file refs; direct URL for website refs.
- `GET /api/v1/iw/ref/download/{reference_id}`: stream bytes.
- `DELETE /api/v1/iw/ref/delete/{reference_id}`: soft-delete.

### Orders and Billing (Inkwise)

Base: `/api/v1/iw/order`

- `GET /api/v1/iw/order/subscribe/{plan_id}`: returns a Stripe Checkout URL.
- `GET /api/v1/iw/order/subscribe/cancel/{plan_id}`: marks subscription cancellation and cancels in Stripe.
- `POST /api/v1/iw/order/pay/stripe/callback/`: Stripe webhook endpoint.

### Plans (Admin) and Plans (Inkwise)

Admin plan management (base `/api/v1/plan`, see `backend/src/general_api/routes/plan.py`):

- `POST /api/v1/plan/`: create plan.
- `GET /api/v1/plan/{plan_id}`: read plan.
- `GET /api/v1/plan/list/all`: list all plans.
- `PUT /api/v1/plan/{plan_id}`: update plan.
- `DELETE /api/v1/plan/{plan_id}`: delete plan.
- `POST /api/v1/plan/user/add_plan`: assign a plan to a user (optionally with expiration).

Inkwise plan listing:

- `GET /api/v1/iw/plan/list`: lists sale plans and marks the user's active subscription.

### Chat Model (Admin)

Base: `/api/v1/chat_model` (see `backend/src/general_api/routes/chat_model.py`)

- `POST /api/v1/chat_model/`: create a chat model (sysadmin-only).
- `GET /api/v1/chat_model/active_list`: list active chat models.
- `DELETE /api/v1/chat_model/{cmid}`: delete.

## Docker and Deployment (Backend)

Backend provides several docker-compose variants:

- `backend/docker-compose-db.yml`: pgvector Postgres on port `5432`
- `backend/docker-compose.yml`: API + worker + Redis + db; API exposed as host port `5005` -> container `3002`
- `backend/docker-compose-aws.yml`: API + worker + Redis (no db); API exposed as host port `80` -> container `3002`

### Local Docker Compose Stack

`backend/docker-compose.yml` expects an env file mounted at `backend/config/.env.prod`.

Typical local steps:

```sh
cd backend
mkdir -p config
cp .env.example config/.env.prod
docker-compose -f docker-compose.yml up -d --build
```

After startup:

- API is reachable on `http://localhost:5005/api/v1/...` (host) -> `:3002` (container).
- Postgres is reachable on `localhost:5432`.
- Redis is reachable on `localhost:6379`.

The `backend/Dockerfile` builds a production image using PDM, and installs system dependencies used for document conversion/rendering (Poppler, LibreOffice, Pandoc, wkhtmltopdf, etc.).

## Frontend Architecture

### App Initialization

- Entry: `frontend/src/main.js` creates the app, registers the router, and mounts `App.vue`.
- Auth0 wiring exists but is currently commented out in `frontend/src/main.js`.

### Routing

`frontend/src/router.js` defines routes including:

- `/login`
- `/write` and `/write/:id`
- `/templates`, `/references`, `/help`

A navigation guard checks for a cookie named `auth_token` and redirects to `/login` when missing.

### HTTP Client

`frontend/src/utils/request.js` wraps Axios:

- Sets `baseURL` to `/api` in development and `https://beta-api.inkwise.ai/api` in production.
- Adds `Authorization: Bearer <auth_token>` on every request.
- Redirects to `/login` on 401 responses.

Auto-import behavior:

- `frontend/vite.config.js` enables `unplugin-auto-import` for `./src/utils`, so functions/exports such as `requestInstance`, `downloadBlob`, and `formatFileSize` are often used without explicit imports.

### Major Views

- `frontend/src/views/login/index2.vue`: username/password login; stores `auth_token` + `userName` in cookies.
- `frontend/src/views/write/index.vue`: editor workspace (center editor + right sidebar panels).
- `frontend/src/views/templates/index.vue`: template library (my templates + system templates by category).
- `frontend/src/views/references/index.vue`: reference library UI (currently backed by general file APIs).

### Editor Workspace

Core pieces:

- `frontend/src/views/write/components/CenterContent.vue`: Tiptap editor instance, autosave, export/duplicate/delete.
- `frontend/src/views/write/components/RightContent.vue`: document reference binding panel + AI Chat panel.
- `frontend/src/views/write/components/AiChatPanel.vue`: asks the backend writer endpoint, renders markdown, and supports inserting AI output into the editor.

Autosave:

- Editor updates debounce-save to `PUT /api/v1/iw/doc/items/{id}` with `content` (HTML) and derived `title`.

AI Chat:

- Uses SSE via `fetchEventSource` to call `/api/v1/iw/writer/write`.
- Parses streamed `event: chat` and tool metadata `event: meta` to show reference indices.

## Frontend/Backend Integration

- Frontend stores the API JWT in a non-HttpOnly cookie `auth_token` (see `frontend/src/views/login/index2.vue`) and sends it as `Authorization: Bearer ...` via `frontend/src/utils/request.js`.
- Backend can also set an HttpOnly `access_token` cookie on login (see `backend/src/user_manage/routes/auth.py`). The frontend code currently does not read that cookie.
- Vite proxy routes `/api` to `https://beta-api.inkwise.ai` for local development (see `frontend/vite.config.js`).

Integration note: the frontend uses `/api` as a base and then calls paths like `/v1/...`, which aligns with the backend's `root_path="/api/v1"` when deployed behind a reverse proxy that mounts the backend at `/api`.

### Base URL and `root_path` Notes

Backend is configured with `root_path="/api/v1"` (`backend/src/main.py`). In Starlette/FastAPI this primarily:

- Influences URL generation (OpenAPI docs, redirects, etc.) for deployments behind a reverse proxy.
- Allows deployments where the proxy mounts the app under `/api/v1` and strips that prefix before forwarding.

In practice, Inkwise is typically deployed so the browser calls the backend at `/api/v1/...` on the same origin as the SPA. The SPA constructs these URLs by using `/api` as its base URL and then calling `/v1/...` paths.

## Background Processing Pipelines

This section documents how uploads flow through S3, Celery, the relational DB, and the vector store.

### File Upload -> Parse -> Embed

Main entrypoints:

- Upload: `POST /api/v1/file/upload` (see `backend/src/general_api/routes/file.py`)
- Status poll: `GET /api/v1/file/task_status/{file_id}`
- Worker task: `process_file_task` / `process_file_to_markdown_task` (see `backend/src/worker/main.py`)

Flow (text/embedding path):

1) API receives multipart upload.
2) API validates size/type, uploads original bytes to S3.
3) API inserts a `file` record (status initially implicit) and enqueues a Celery task with `task_id = file.id`.
4) Worker downloads bytes from S3, extracts content (Unstructured for most types), and builds `content` + `extra_info`.
5) Worker chunks content (size 4000, overlap 400) and embeds using OpenAI embeddings (`text-embedding-3-small`).
6) Worker writes `chunk_ids` back to the `file` row.

Notes:

- Vector store DB is configured separately via `VECTORSTORE_DB_NAME`; relational DB uses `DATABASE_DB_NAME`.
- The worker uses a synchronous SQLAlchemy engine (`psycopg`) for DB updates (see `backend/src/worker/db.py`).

### Reference Upload -> Parse -> Embed (Inkwise)

Main entrypoints:

- Upload: `POST /api/v1/iw/ref/upload` (see `backend/src/inkwise/routes/reference.py`)
- Worker: `process_reference_task` (see `backend/src/worker/main.py`)
- PDF special-case: `POST /api/v1/iw/ref/pdf/callback` (Cobbling integration)

Reference types:

- `file`: uploads to S3, then background parses.
- `website`: stores URL and background scrapes/reads.
- `image`: accepted by API; processing depends on worker capabilities.

PDF references special-case:

- PDF uploads are submitted to the Cobbling service (`COBBLING_URL`) which returns a `job_id`.
- The reference row stores `extra_info.job_id` and an initial `thumbnail`.
- When Cobbling calls back to `/iw/ref/pdf/callback`, the backend fetches markdown and adds it to the vector store.

### Website Reference -> Scrape

Website references use the Cobbling web-scrape endpoint (default `https://web-scoop.cobbling.ai`, see `backend/src/worker/untils/url_loader.py`). The worker stores `title`, `thumbnail`, and markdown content.

## Vector Store and Retrieval

Inkwise uses Postgres + pgvector via LangChain's `PGVector`, wrapped by `MyPGVector` (`backend/src/utils/vectorstore.py`).

### Storage Model

- Collections: `langchain_pg_collection` (one collection per user, commonly `u_{user_id}_knowlege`).
- Embeddings: `langchain_pg_embedding` with JSONB metadata (`cmetadata`) and `document` text.
- Partition mapping: `lc_embedding_partition` linking `embedding_id` -> `partition_id`.

Chunk identifiers:

- Workers generate UUID chunk IDs and store them in the source record (`file.chunk_ids` or `iw_reference.chunk_ids`).
- Each embedded chunk stores `chunk_id` in metadata and uses the chunk UUID as the embedding row primary key.

### Partitioning (Document-Scoped Retrieval)

`MyPGVector` can restrict retrieval by `partition_id`:

- A document binds the selected reference chunk IDs to `partition_id = document_id`.
- Retrieval tools instantiate the vector store with `partition_id=document_id`.

Binding happens in `backend/src/inkwise/routes/document.py`:

- `POST /iw/doc/refs/bind` adds `DocumentReference` rows, then calls `bind_partition_id(user_id, document_id, chunk_ids)`.
- `POST /iw/doc/refs/unbind` deletes the `DocumentReference` row, then calls `unbind_partition_id(...)`.

### Automatic Cleanup

`backend/src/utils/vectorstore.py` defines Postgres triggers intended to delete embeddings when files/references are deleted (hard delete) or soft-deleted (`is_deleted = true`).

## Writer (SSE) and Agent Behavior

Main endpoint: `POST /api/v1/iw/writer/write` (see `backend/src/inkwise/routes/writer.py`).

Request model: `WriterAction` (`backend/src/inkwise/schemas/writer.py`)

- `action`: one of `improve|longer|translate|opposing_argument|auto|chat|predict|concise|human|other`
- `document_id`: document UUID (string)
- `file_ids`: optional list of reference IDs to constrain retrieval
- `context`: optional editor selection / context
- `init_prompt`: optional user/document prompt configuration
- `prompt`: the user instruction/question

Response modes:

- `action=predict`: returns a normal JSON response.
- Other actions: returns `text/event-stream` with SSE events.

SSE event types produced by the agent (`backend/src/inkwise/service/agents.py`):

- `event: chat`: incremental generated content (the payload includes the full accumulated content).
- `event: meta`: emitted on tool start/end; on end it may include referenced document metadata.

State and memory:

- For `action=chat`, the agent uses a Redis-backed checkpointer keyed by `(user_id, document_id)`.
- The agent trims message history to the last ~6 messages before prompt execution.

Retrieval:

- The tool name exposed to the agent is `Reference_library`.
- Retrieval uses MMR search (`k=8`, `fetch_k=50`) in `MyPGVector`.
- When `file_ids` is provided, retrieval applies a metadata filter on `ref_id`.

## Plans, Quotas, and Stripe Billing

Plans:

- Plan data lives in `plans` and `user_plan_association` tables (see `backend/src/models/plan.py`).
- `get_plan_by_user` returns the current plan (unexpired) and its limits.

Quota enforcement points:

- Writer: `/iw/writer/write` enforces `max_chats` via `get_history_count_by_user(...)`.
- General file upload: `/file/upload` enforces a monthly-ish limit via plan `max_upload_files`.
- References: `/iw/ref/upload` enforces `max_upload_files` similarly.

Stripe:

- Checkout session creation: `/iw/order/subscribe/{plan_id}` (see `backend/src/inkwise/routes/order.py`).
- Webhook handler: `/iw/order/pay/stripe/callback/` verifies signatures and updates orders/subscriptions.
- Subscription cancel: `/iw/order/subscribe/cancel/{plan_id}` triggers `stripe_cancel_subscription(...)` and marks `is_cancel_subscribe=1`.

Idempotency/locking:

- Stripe callback uses a Redis lock keyed by Stripe payment/session/subscription ID to avoid double-processing.

## Hurrylegal Module Overview

The backend also contains a separate module mounted at `/api/v1/hl` (see `backend/src/main.py`, `backend/src/hurrylegal/routes/main.py`). Conceptually, it implements:

- Lawyer/agent profiles (`HLAgent`)
- A knowledge base of uploaded documents per agent (`HLKnowledgeBase`)
- Chat threads and chat history per agent
- An LLM chat agent with retrieval over the agent's bound knowledge

### Key Routes (`/api/v1/hl`)

Agent management (prefix `/hl/agent`):

- `POST /hl/agent/add`: create an agent for the current user.
- `GET /hl/agent/list_by_sysadmin`: admin list.
- `POST /hl/agent/get_my_agent`: fetch current user's agent.
- `GET /hl/agent/{aid}` / `PUT /hl/agent/{aid}` / `DELETE /hl/agent/{aid}`
- `PUT /hl/agent/publish/{aid}`

Knowledge base (also under prefix `/hl/agent`):

- `POST /hl/agent/{aid}/upload_knowledge_file`: uploads a file into the general `file` table and enqueues processing.
- `GET /hl/agent/get_knowledge_file_status/{file_id}`: polls Celery result for the processed file.
- `POST /hl/agent/{aid}/knowledge_file_bind`: binds a knowledge file's embeddings to the agent partition.
- `GET /hl/agent/{aid}/knowledge_file_list`: list knowledge base items.
- `DELETE /hl/agent/{aid}/knowledge_file/{kid}`: unbind + delete.

Chat (prefix `/hl/chat`):

- `POST /hl/chat/agent/{aid}/chat`: start chat with a published agent (SSE).
- `POST /hl/chat/agent/{aid}/test_chat`: owner test chat (SSE).
- `POST /hl/chat`: global chat mode (SSE) that may recommend lawyers.

Chat history (prefix `/hl/chat_history`):

- `GET /hl/chat_history/{tid}`: scroll chat history.

### Retrieval Model

Hurrylegal uses the same `MyPGVector` store and partition mechanism as Inkwise, but filters on `file_id` metadata (not `ref_id`).

- Upload processing stores embeddings with metadata including `file_id`.
- Binding knowledge sets `partition_id = agent_id`.
- Chat uses a `Knowledge_Base` tool that retrieves from the agent partition.

## Relational Data Model (Key Tables)

This section focuses on the tables that back Inkwise's primary flows. It is not intended to be a complete schema dump.

General conventions observed in the models:

- Primary keys are usually UUIDs (`uuid.uuid4`) for user/content records; some billing tables use integer autoincrement IDs.
- Most tables include `create_time` / `update_time` timestamps.
- Several tables implement soft-delete flags (commonly `is_deleted` or `is_delete`).
- Content-processing tables typically have a `status` field (e.g. `UPLOADED`, `PENDING`, `STARTED`, `FAILURE`, `SUCCESS`).

High-level relationships:

- `user` 1..N `file` (uploads) and 1..N `iw_reference` (reference library).
- `user` 1..N `iw_document` (documents).
- `iw_document` 1..N `iw_document_reference` -> `iw_reference` (selected references for a document).
- `iw_document` 1..N `iw_writer_history` (writer/chat actions for a document).
- `user` N..M `role` via `mid_user_role`; permissions enforced via `casbin_rule`.

### Identity, Roles, and Authorization

- `user` (`backend/src/user_manage/models/user.py`)
- Purpose: primary identity record.
- Key columns: `id` (UUID PK), `email` (unique + indexed), `hashed_password`, `is_active`, `is_verified`, `is_new`, profile fields (`name`, `avatar`, `description`, `ex_data`).

- `role` (`backend/src/user_manage/models/role.py`)
- Purpose: role definitions used by Casbin.
- Key columns: `id` (UUID PK), `role_key` (unique; values like `role_sysadmin`), `name`, `description`.

- `mid_user_role` (`backend/src/user_manage/models/role.py`)
- Purpose: user<->role mapping.
- Key columns: `id` (UUID PK), `uid` (user UUID), `rid` (role UUID).

- `casbin_rule` (`backend/src/user_manage/models/casbin.py`)
- Purpose: Casbin policy storage.
- Key columns: `id` (int PK), `ptype`, `v0..v5`.
- Typical interpretation in this codebase (RBAC model is `sub,obj,act`): `v0 = role_key`, `v1 = object`, `v2 = action` (HTTP method or override like `FILE_UPIMG`).

- `casbin_object`, `casbin_action` (`backend/src/user_manage/models/casbin.py`)
- Purpose: dictionary tables for resource/action metadata (naming, descriptions). Policies are enforced via `casbin_rule`.

### General File and Media Storage

- `file` (`backend/src/models/file.py`)
- Purpose: stores uploaded files and (optionally) extracted content + embedding chunk IDs.
- Key columns:
  - Identity/ownership: `id` (UUID PK), `user_id` (UUID).
  - Source: `source` (S3 key), `cfile_name` (cloud filename), `name`, `type` (MIME), `size`, `md5`.
  - Processing output: `status`, `output_type` (`text|markdown`), `content` (extracted text/markdown), `extra_info` (JSON), `thumbnail`.
  - Vector linkage: `chunk_ids` (array of chunk UUID strings).
  - Soft delete: `is_deleted`.

- `image` (`backend/src/models/image.py`)
- Purpose: image uploads (separate from `file`), primarily for embedding/preview/export.
- Key columns: `id` (UUID PK), `cos_key` (S3 key), `user_id` (UUID), `name`, `type`, `size`.

- `website` (`backend/src/models/website.py`)
- Purpose: persisted website content and scrape state (separate from Inkwise references).
- Key columns: `id` (UUID PK), `url`, `title`, `content`, `extra_info`, `status`, `md5`, `is_deleted`.

### Inkwise Domain Tables

- `iw_document` (`backend/src/inkwise/models/document.py`)
- Purpose: the primary authoring object in the Inkwise product.
- Key columns: `id` (UUID PK), `title` (default `Untitled`), `content` (HTML string), `init_prompt`, `language`.
- Ownership: `user_id` is stored as a string (commonly the UUID string of `user.id`).

- `iw_reference` (`backend/src/inkwise/models/reference.py`)
- Purpose: user-managed reference items (file uploads or website URLs) that can be embedded and retrieved.
- Key columns:
  - Identity/ownership: `id` (UUID PK), `user_id` (string).
  - Type/source: `ref_type` (enum `file|website|image`), `source` (S3 key or URL), `content_type`, `size`, `md5`.
  - Processing output: `status`, `content`, `thumbnail`, `extra_info` (JSON).
  - Vector linkage: `chunk_ids` (array of chunk UUID strings).
- Soft delete: `is_deleted`.

- `iw_document_file` (`backend/src/inkwise/models/document.py`)
- Purpose: binds general uploaded files (`file`) to an Inkwise document.
- Keys and relationships:
  - `id` (UUID PK)
  - `document_id` (string)
  - `user_id` (string; commonly the UUID string of `user.id`)
  - `file_id` (UUID FK to `file.id`, cascade delete)
- Denormalized metadata: duplicates `name`, `type`, `size`, `source`, `thumbnail`, `status`, `chunk_ids` for fast listing.
- Indexing: an index is declared on (`document_id`, `user_id`).

- `iw_document_reference` (`backend/src/inkwise/models/document.py`)
- Purpose: binds references to a document (the user's "selected library" for that doc).
- Keys and relationships:
  - `id` (UUID PK)
  - `document_id` (string; matches `iw_document.id` serialized)
  - `user_id` (string; commonly the UUID string of `user.id`)
  - `ref_id` (UUID FK to `iw_reference.id`, cascade delete)
- Denormalized metadata:
  - Duplicates display fields such as `title`, `thumbnail`, `size`, `content_type`, `source`, `ref_type`, and (optionally) `chunk_ids` / `status`.
  - This makes document reference lists independent of the main reference row shape and supports fast listing.
- Indexing: an index is declared on (`document_id`, `user_id`).

- `iw_writer_history` (`backend/src/inkwise/models/writer.py`)
- Purpose: audit/log of writer actions and chat interactions per document.
- Key columns: `id` (UUID PK), `document_id` (string), `user_id` (string), `action`, `prompt`, `context`, `output`.
- Retrieval metadata:
  - `file_ids` (array of strings) stores the reference IDs used for scoped retrieval.
  - `meta` (JSON) stores tool outputs (e.g. which references were cited).

### Templates

- `iw_template` (`backend/src/inkwise/models/template.py`)
- Purpose: user templates (often created from a processed `file.content`).
- Key columns: `id` (UUID PK), `user_id` (string), `title`, `icon`, `description`, `content`.
- Linkage: `file_id` is stored as a string (points to a `file.id` in practice).

- `iw_system_template` (`backend/src/inkwise/models/template.py`)
- Purpose: shared templates curated into categories.
- Key columns: `id` (UUID PK), `title`, `icon`, `description`, `content`, `category` (int).

- `iw_category` (`backend/src/inkwise/models/template.py`)
- Purpose: category catalog for system templates.
- Key columns: `id` (int PK), `name`.

### Chat Threads and History (General)

- `chat_thread` (`backend/src/models/chat.py`)
- Purpose: chat thread container; used by Hurrylegal flows and any other agent/chat modules.
- Key columns: `id` (UUID PK), `agent_id` (UUID), `user_id` (UUID), `custom_title`, `is_delete`.

- `chat_history` (`backend/src/models/chat_history.py`)
- Purpose: message history for non-Inkwise chat modules.
- Key columns: `id` (UUID PK), `thread_id` (UUID), `agent_id` (UUID), `user_id` (UUID), `prompt`, `output`, `file_ids`.

- `chat_model` (`backend/src/models/chat.py`)
- Purpose: admin-managed chat model entries.
- Key columns: `id` (UUID PK), `model`, `temperature`, `is_active`, `user_id`.

### Hurrylegal Domain Tables

- `hl_agent` (`backend/src/hurrylegal/models/hl_agent.py`)
- Purpose: lawyer/agent profile.
- Key columns: `id` (UUID PK), `user_id` (UUID), profile fields (`name`, `address`, `email`, `years_of_exp`, `introduction`, `areas_of_practice`), `status`, `is_delete`.

- `hl_knowledge_base` (`backend/src/hurrylegal/models/hl_agent.py`)
- Purpose: per-agent knowledge items backed by the general `file` table.
- Key columns: `id` (UUID PK), `aid` (agent UUID), `file_id` (UUID; references `file.id` logically), `file_name`, `is_bind`, `user_id`.

- `hl_chat_history` (`backend/src/hurrylegal/models/hl_chat_history.py`)
- Purpose: chat history for Hurrylegal.
- Key columns: `id` (UUID PK), `thread_id` (UUID), `agent_id` (UUID), `user_id` (UUID), `prompt`, `output`, `file_ids`.

### Plans and Billing

- `plans` (`backend/src/models/plan.py`)
- Purpose: subscription tiers and quotas.
- Key columns: `id` (int PK), quota limits (`max_upload_files`, `max_chats`, `max_documents`, `max_templates`), pricing (`price`, `unit`, `pay_type`, `price_id`, `coupon_ids`).

- `user_plan_association` (`backend/src/models/plan.py`)
- Purpose: user subscription history; the newest row is treated as current state.
- Key columns: `id` (int PK), `user_id` (UUID FK to `user.id`), `plan_id` (int FK), `create_time` (cycle start), `expiration_time`, `subscription`, `customer`, `is_cancel_subscribe`.

- `order` (`backend/src/models/order.py`)
- Purpose: order header.
- Key columns: `order_id` (UUID PK), `user_id` (UUID), `amount`, `pay_status`, `pay_amount`, `type_id`, `is_cancel`, `is_del`.

- `order_goods_plan` (`backend/src/models/order.py`)
- Purpose: the goods/plan line item attached to an order.
- Key columns: `order_goods_id` (UUID PK), `order_id` (UUID), `goods_id` (plan id), quota snapshot columns (max_*), `effective_time`, `unit`.

- `order_pay` (`backend/src/models/order.py`)
- Purpose: payment attempts/records for an order.
- Key columns: `order_pay_id` (UUID PK), `order_id` (UUID), `type_id`, `amount`, `currency`, `pay_status`, `feedback_time`, `payment_intent`, `pay_id`.

- `stripe_pay_info` (`backend/src/models/order.py`)
- Purpose: stores Stripe webhook-derived payment info for idempotency/audit.
- Key columns: `id` (UUID PK), `pay_id`, `payment_status`, `client_reference_id`, `payment_intent`, `amount_total`, `subscription`, `customer`.

## CI/CD

GitHub Actions workflows are present in:

- `backend/.github/workflows/`
- `frontend/.github/workflows/`

### Backend Workflows

- `backend/.github/workflows/python-app.yml`
  - Triggers: push/PR to `main`
  - Installs with PDM (`pdm sync -d -G test`)
  - Runs: `pytest tests`

- `backend/.github/workflows/manual.yml`
  - Trigger: manual (`workflow_dispatch`)
  - Purpose: run `docker-compose-aws.yml` on a self-hosted runner (test env)
  - Behavior:
    - Creates `backend/config/.env.prod` from GitHub `secrets` + `vars`
    - Runs `docker-compose -f docker-compose-aws.yml up -d --build` (or stop/restart)

- `backend/.github/workflows/prod.yml`
  - Trigger: manual (`workflow_dispatch`)
  - Purpose: run `docker-compose-aws.yml` on a self-hosted runner (prod env)
  - Behavior is similar to `manual.yml`, but uses prod-scoped variables and sets `APP_CORS`/`APP_FRONT_URI` for `https://app.inkwise.ai`.

- `backend/.github/workflows/aws.yml`
  - Trigger: manual (`workflow_dispatch`)
  - Purpose: example/manual deployment flow using an alternate set of GitHub variables.

### Frontend Workflows

- `frontend/.github/workflows/node.js.yml`
  - Trigger: manual (`workflow_dispatch`)
  - Uses Node 20 + pnpm 8
  - Builds the SPA (`pnpm build`)
  - Deploys to AWS using `bitovi/github-actions-deploy-static-site-to-aws` (Terraform apply), bucket `inkwise-web-site-pub`.

- `frontend/.github/workflows/prod.yml`
  - Trigger: manual (`workflow_dispatch`)
  - Uses Node 22 + pnpm 9
  - Builds and deploys similarly, bucket `inkwise-web-site-prod-pub`.

Security note: workflows generate `.env.prod` from GitHub secrets/vars; avoid hard-coding sensitive values directly in workflow YAML.

## Known Gaps and Integration Mismatches (Observed)

These are discrepancies observed by reading both `backend/` and `frontend/` as currently checked in. They may reflect in-progress refactors.

- Document binding endpoints: backend exposes `/api/v1/iw/doc/refs/*` while frontend calls `/api/v1/iw/doc/files/*` (constructed from base `/api` + path `/v1/iw/doc/files/*`; see `frontend/src/views/write/components/RightContent.vue`).
- Auth cookie naming: frontend uses `auth_token` while backend login sets an HttpOnly cookie named `access_token`.
- References page: frontend "Reference library" uses `/api/v1/file/*` (general files) rather than `/api/v1/iw/ref/*` (Inkwise references).
