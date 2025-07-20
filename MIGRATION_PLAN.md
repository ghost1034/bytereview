### **Updated Migration Plan: From Prototype to Production-Ready Application**

This document outlines a five-phase migration process to refactor the existing prototype into the final target architecture. The key updates from the previous plan are the introduction of a dedicated file analysis step and a more sophisticated dual-queue background worker system.

---

### **Phase 1: Backend Foundation - Data Model Migration**

**Goal:** Replace the Firestore-based data layer with PostgreSQL. This phase is foundational and remains unchanged from the previous plan, as the database schema was designed to support this advanced workflow.

**Step 1.1: Setup Local Database Infrastructure**
1.  **Use Docker Compose:** In the project root, create the `docker-compose.yml` file as specified in `4_SETUP_INSTRUCTIONS.md`. This will launch local PostgreSQL and Redis containers.
2.  **Environment Configuration:** In `backend/.env`, update `DATABASE_URL` and `REDIS_URL` to point to the new local Docker containers.

**Step 1.2: Implement PostgreSQL Schema with SQLAlchemy and Alembic**
1.  **Add Dependencies:** Add `sqlalchemy`, `psycopg2-binary`, and `alembic` to `backend/requirements.txt` and install them.
2.  **Create ORM Models:** In the `backend/models/` directory, create new Python files to define SQLAlchemy models that mirror every table in the `1_DATABASE_SCHEMA.md` document.
3.  **Setup Alembic:** Initialize Alembic for database migrations. Create a first migration that generates the entire schema from your SQLAlchemy models. Run `alembic upgrade head` to apply the schema to your local PostgreSQL database.

**Step 1.3: Refactor Services to Use PostgreSQL**
1.  **`user_service.py`:** Rewrite all functions to use SQLAlchemy sessions to interact with the `users` table instead of Firestore.
2.  **`template_service.py`:** Rewrite all functions to use SQLAlchemy to interact with the `templates` and `template_fields` tables.

**Step 1.4: Refactor User Authentication Flow**
1.  **Modify User Sync Endpoint:** Change the `GET /api/users/me` endpoint. The initial user creation logic should be moved to a new, explicit endpoint: **`POST /api/users/me/sync`** as specified in `2_API_ROUTES.md`.
2.  **Update Logic:** This new endpoint will use the refactored `user_service` to create or update the user's record in the PostgreSQL `users` table upon login/signup.

**Step 1.5: Seed Initial Data**
1.  Create a simple Python script or an Alembic data migration to populate the `data_types` and `system_prompts` tables.

**Outcome of Phase 1:** The backend is now fully running on PostgreSQL. The core data layer is solid and ready for the new application logic.

---

### **Phase 2: Core Backend Logic - Asynchronous Jobs, Uploads, and Analysis**

**Goal:** Implement the asynchronous job system with a **dual-queue** model and the new multi-step upload/analysis workflow.

**Step 2.1: Integrate ARQ and Redis with Dual Queues**
1.  **Add ARQ:** Add `arq` to `backend/requirements.txt`.
2.  **Create Worker Module (`backend/worker.py`):**
    *   Define the `WorkerSettings` class, pointing to the Redis instance.
    *   In `WorkerSettings`, define two queues: the default queue (`arq:queue`) and a dedicated ZIP queue (`arq:zip_queue`).
    *   Define the skeleton functions for all background tasks, annotating the ZIP unpacking task to use the specific queue:
        ```python
        # In worker.py
        class WorkerSettings:
            functions = [
                # ... other tasks
                func(unpack_zip_file_task, queue_name='zip_queue')
            ]
            # ... other settings
        ```

**Step 2.2: Implement the New Upload System (Job Initiation)**
1.  **Refactor `gcs_service.py`:** Add a method `generate_presigned_put_url(gcs_object_name)`.
2.  **Create `POST /jobs/initiate` Endpoint:** In a new `jobs.py` router, this endpoint will:
    *   Create a record in `extraction_jobs` with status `pending_upload`.
    *   Create records in `source_files` for each intended upload.
    *   Generate and return a pre-signed URL for each file, along with the new `jobId`.

**Step 2.3: Implement the Analysis Trigger and ZIP Worker**
1.  **Create `POST /jobs/{job_id}/finalize-uploads` Endpoint:** This is a new, critical endpoint.
    *   It changes the job status to `pending_analysis`.
    *   It iterates through the job's `source_files`. If it finds a file with `type = 'application/zip'`, it enqueues the `unpack_zip_file_task` to the **`arq:zip_queue`**.
    *   Returns a `202 Accepted` response.
2.  **Implement `unpack_zip_file_task` in `worker.py`:**
    *   This task runs in the high-memory worker pool.
    *   It downloads the ZIP from GCS to the worker's ephemeral disk.
    *   It unpacks the contents locally.
    *   For each unpacked file, it creates a *new* record in the `source_files` table, linking it to the same `job_id`, and uploads that file back to a permanent location in GCS.
    *   It updates the original ZIP file's record status to `unpacked`.
    *   It cleans up the local temporary directory.

**Step 2.4: Implement the Analysis Status Endpoint**
1.  **Create `GET /jobs/{job_id}/analysis-status` Endpoint:**
    *   This endpoint provides a quick status check for the UI to poll.
    *   It checks the `status` of all `source_files` for the given `job_id`.
    *   If any file has a status of `pending_unpacking`, it returns `{ "isReady": false, "status": "unpacking", "message": "Unpacking files..." }`.
    *   If all files have a status of `uploaded` or `unpacked`, it updates the parent job's status to `pending_configuration` and returns `{ "isReady": true, "status": "complete" }`.

**Step 2.5: Implement Final Job Start Logic**
1.  **Create `POST /jobs/{job_id}/start` Endpoint:** This endpoint is now called *after* file analysis is complete.
    *   It snapshots the configuration into `job_fields` as before.
    *   It creates the `extraction_tasks` and links them.
    *   It enqueues `process_extraction_task` jobs to the **default `arq:queue`**.
    *   Returns `202 Accepted`.

**Step 2.6: Implement the AI Worker Task**
1.  Flesh out `process_extraction_task` in `worker.py` as before. This task will run in the low-memory AI worker pool. It reads from `job_fields`, calls Gemini, and saves results to `extraction_results`.

**Outcome of Phase 2:** The backend now fully supports the robust upload/analysis/start workflow and correctly separates high-memory and low-memory tasks into different processing queues.

---

### **Phase 3: Frontend Refactoring - Multi-Step UI with Analysis Step**

**Goal:** Adapt the frontend to the new API, introducing the "Analysis" step into the user flow.

**Step 3.1: Create New Pages for the Job Workflow**
1.  **Create Routes:** In the `app/` directory, create the folder structure for the new pages:
    *   `/jobs/new` (Upload)
    *   `/jobs/[jobId]/analysis` **(New)**
    *   `/jobs/[jobId]/configure`
    *   `/jobs/[jobId]/rules`
    *   `/jobs/[jobId]` (Details/Results)

**Step 3.2: Refactor the Upload Component and Flow**
1.  **Modify `FileUpload.tsx` on the `/jobs/new` page:**
    *   After the direct-to-GCS uploads are complete, it must now make a call to the new **`POST /jobs/{job_id}/finalize-uploads`** endpoint.
    *   On a successful response, it will navigate the user to the new analysis page: `/jobs/{jobId}/analysis`.

**Step 3.3: Build the NEW Analysis Page**
1.  **Create Page (`/jobs/[jobId]/analysis`):**
    *   This page will display a clean loading interface (e.g., a large spinner and status messages).
    *   It will implement a polling mechanism (e.g., `setInterval` calling an API hook every 3 seconds) that hits the **`GET /jobs/{job_id}/analysis-status`** endpoint.
    *   The UI will display the `message` from the polling response.
    *   When the polling response returns `isReady: true`, the interval is cleared, and the user is automatically navigated to `/jobs/{jobId}/configure`.

**Step 3.4: Adapt Configuration and Rules Pages**
1.  The `/configure` and `/rules` pages are largely the same, but they now exist in the new workflow order.
2.  The `FileTreeExplorer` on the `/rules` page will now correctly display the full, unpacked file hierarchy by calling `GET /jobs/{job_id}/files` *after* the analysis step is complete.

**Step 3.5: Adapt Job Details Page**
1.  This page remains the same, but its polling logic for `GET /jobs/{job_id}/progress` is now clearly for the **extraction progress**, distinct from the earlier analysis progress.

**Outcome of Phase 3:** The frontend now provides a seamless and informative user experience that correctly reflects the new, more complex backend processing flow.

---

### **Phase 4: Supporting Features & UI Polish**

**Goal:** Implement the remaining key features from the specification. This phase remains largely unchanged.

**Step 4.1: Refactor the Main Dashboard (`/dashboard`)**
1.  Refactor `dashboard.tsx` to be a list of all jobs, calling the `GET /jobs` endpoint. Each job card should link to `/jobs/{jobId}`.

**Step 4.2: Implement Job Deletion and Data Export**
1.  **Backend:** Create the `DELETE /jobs/{job_id}` and `GET /jobs/{job_id}/export` endpoints.
2.  **Frontend:** Add "Delete" and "Export" buttons to the UI.

**Step 4.3: Implement Scheduled Cleanup Tasks**
1.  **Backend:** Create the secure `/tasks/cleanup/...` endpoints and implement the logic for the corresponding ARQ tasks.

**Outcome of Phase 4:** The application is now feature-complete.

---

### **Phase 5: Finalization and Production Deployment with Dual Worker Pools**

**Goal:** Containerize and deploy the application to GCP using the specialized, multi-service worker architecture.

**Step 5.1 & 5.2: Containerize and Automate Builds**
1.  These steps remain the same. Create the `Dockerfile` and `cloudbuild.yaml` to build and push a single application image.

**Step 5.3: Provision GCP Infrastructure**
1.  This step remains the same. Provision Cloud SQL, Memorystore, and GCS.

**Step 5.4: Deploy to Cloud Run with Specialized Worker Pools**
1.  **Web Service:** Deploy the container to a Cloud Run service with the `uvicorn` command.
2.  **AI Worker Service:** Deploy the **same container image** as a second service (`bytereview-worker-ai`).
    *   Override the command to be `arq your_app.worker.WorkerSettings --queue-name arq:queue`.
    *   Provision with **low memory** and **high concurrency/scaling**.
3.  **ZIP Worker Service:** Deploy the **same container image** as a third service (`bytereview-worker-zip`).
    *   Override the command to be `arq your_app.worker.WorkerSettings --queue-name arq:zip_queue`.
    *   Provision with **high memory** and **low concurrency/scaling**.

**Step 5.5: Configure Cloud Scheduler**
1.  Create the three scheduler jobs to securely call the cleanup endpoints.

**Outcome of Phase 5:** The application is fully deployed as a resilient, scalable, and resource-efficient system on Google Cloud Platform.
