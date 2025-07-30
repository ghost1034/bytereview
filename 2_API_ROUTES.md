### **Part 2: Full Set of API Routes**

Here is a comprehensive list of the API routes required for ByteReview, grouped by resource.

#### **Resource: `users` (Integrated with Firebase Auth)**
*   **Authentication Mechanism:** All protected endpoints expect a Firebase ID Token in the `Authorization: Bearer <token>` header. The backend validates this token using the Firebase Admin SDK.

*   **`GET /users/me`**
    *   **Action:** Gets the app-specific profile details of the currently authenticated user from your PostgreSQL database.
    *   **Response:** `{ "id": "firebase_uid", "email": "...", "displayName": "...", "photoUrl": "..." }`

*   **`POST /users/me/sync`**
    *   **Action:** **(Crucial for linking Firebase to your DB)**. Called by the frontend after a user signs up or logs in. Creates or updates the user's profile in your PostgreSQL `users` table. This ensures your database has a record for every Firebase user who uses the app.
    *   **Request Body:** Empty. The user's identity is taken from the validated Firebase ID Token.
    *   **Response:** `200 OK` (for updates) or `201 Created` (for new user syncs).

---
#### **Resource: `data_types` & `system_prompts`**
*(Read-only endpoints for populating the UI)*
*   **`GET /data-types`**
    *   **Action:** Fetches the canonical list of all supported data types.
    *   **Response:** `200 OK`, `[ { "id": "currency", "displayName": "Currency", "description": "..." }, ... ]`
*   **`GET /system-prompts/active`**
    *   **Action:** Fetches the single, active system prompt to be used as the base for AI requests.
    *   **Response:** `200 OK`, `{ "id": "...", "template_text": "You are an expert..." }`

---
#### **Resource: `templates`**
*(CRUD for user-defined templates)*
*   **`POST /templates`**
    *   **Action:** Creates a new reusable template.
    *   **Request Body:** `{ "name": "Invoice Template", "fields": [ { "fieldName": "...", "dataTypeId": "...", "aiPrompt": "..." } ] }`
    *   **Response:** `201 Created`, returns the full template object with its new ID.
*   **`GET /templates`**
    *   **Action:** Lists all templates belonging to the current user.
    *   **Response:** `200 OK`, `[ { "id": "...", "name": "..." }, ... ]`
*   **`GET /templates/{template_id}`**
    *   **Action:** Gets the full details of a single template, including its fields.
    *   **Response:** `200 OK`, `{ "id": "...", "name": "...", "fields": [...] }`
*   **`PUT /templates/{template_id}`**
    *   **Action:** Updates an existing template (replaces all fields).
    *   **Request Body:** Same as `POST /templates`.
    *   **Response:** `200 OK`, returns the updated template object.
*   **`DELETE /templates/{template_id}`**
    *   **Action:** Deletes a template. (Jobs that used it will have their `template_id` set to `NULL`).
    *   **Response:** `204 No Content`.

---
#### **Resource: `jobs` (The Core Workflow)**

*   **`POST /jobs/initiate`**
    *   **Action:** **Step 1 of a new job.** The client signals its intent to upload files. The backend creates an `extraction_jobs` record in an initial `pending_upload` state.
    *   **Request Body:** `{ "files": [ { "filename": "report.pdf", "path": "folder/report.pdf", "size": 12345, "type": "application/pdf" } ] }`
    *   **Response:** `201 Created`, `{ "jobId": "...", "files": [ { "originalPath": "...", "uploadUrl": "https://gcs-presigned-url..." } ] }`
*   **`POST /jobs/{job_id}/finalize-uploads` (New)**
    *   **Action:** **Step 2: Pre-processing.** Called by the client after all GCS uploads are complete. This transitions the job to `pending_analysis` and kicks off any necessary background tasks, like ZIP unpacking.
    *   **Backend Logic:** Scans the job's files. If any ZIPs are found, it enqueues them in the `arq:zip_queue`.
    *   **Response:** `202 Accepted`, `{ "message": "File analysis and unpacking has begun." }`
*   **`GET /jobs/{job_id}/analysis-status` (For Polling)**
    *   **Action:** A simple endpoint for the client to poll to check the status of the pre-processing/unpacking stage.
    *   **Backend Logic:** Checks the status of all unpacking tasks for the job and returns the current state immediately.
    *   **Response:** `200 OK`, `{ "isReady": boolean, "status": "unpacking" | "complete" | "failed", "message": "..." }`

*   **`GET /jobs/{job_id}/stream-analysis-status` (For SSE)**
    *   **Action:** The advanced alternative to polling. Establishes a Server-Sent Events stream for real-time updates on the pre-processing/unpacking stage.
    *   **Response:** A streaming `text/event-stream` response, pushing events as unpacking progresses and sending a final `analysis_complete` event.
*   **`POST /jobs/{job_id}/start`**
    *   **Action:** **Step 3: Final Configuration & Execution.** Called by the client *after* file analysis, configuration, and rules are complete. The client provides the final configuration, and this transitions the job to `processing`.
    *   **Request Body:** `{ "name": "Q1 Invoice Run", "templateId": "..." (nullable), "persistData": true, "taskDefinitions": [ { "path": "...", "mode": "combined" or "individual" } ] }`
    *   **Backend Logic:** This is a critical endpoint. It updates the job's name, snapshots the configuration into `job_fields`, creates all the `extraction_tasks` based on the definitions, and enqueues them in ARQ.
    *   **Response:** `202 Accepted`, `{ "message": "Job processing has been successfully started." }`
*   **`GET /jobs`**
    *   **Action:** Lists all jobs for the current user. Supports filtering.
    *   **Query Params:** `?status=completed`, `?limit=20`, `?offset=0`
    *   **Response:** `200 OK`, `[ { "id": "...", "name": "...", "status": "...", "createdAt": "..." }, ... ]`
*   **`GET /jobs/{job_id}`**
    *   **Action:** Gets the full details of a single job, including its snapshotted configuration (`job_fields`).
    *   **Response:** `200 OK`, `{ "id": "...", "name": "...", "status": "...", "jobFields": [...] }`
*   **`DELETE /jobs/{job_id}`**
    *   **Action:** Deletes a job and all its associated data (files, tasks, results). Kicks off a background task for GCS cleanup.
    *   **Response:** `202 Accepted`, `{ "message": "Job deletion has been initiated." }`

---
#### **Resource: `job files & results`**
*(Endpoints to view the content of a job)*

*   **`GET /jobs/{job_id}/files`**
    *   **Action:** Fetches the list of all source files associated with a job. Used to build the file tree UI.
    *   **Response:** `200 OK`, `[ { "id": "...", "originalPath": "...", "originalFilename": "...", "status": "..." }, ... ]`
*   **`GET /jobs/{job_id}/results`**
    *   **Action:** Fetches the extracted results for a completed job. Supports pagination.
    *   **Query Params:** `?limit=50`, `?offset=0`
    *   **Response:** `200 OK`, ` { "total": 150, "results": [ { "taskId": "...", "sourceFiles": [...], "extractedData": {...} } ] }`

---
#### **Resource: `job status & export`**
*(Endpoints for real-time updates and data export)*

*   **`GET /jobs/{job_id}/stream-status` (For SSE)**
    *   **Action:** Establishes a Server-Sent Events stream for real-time **extraction** progress updates (after the job has started). This is separate from the analysis stream.
    *   **Response:** A streaming `text/event-stream` response.
*   **`GET /jobs/{job_id}/progress` (For Polling)**
    *   **Action:** Gets a quick, one-time summary of the extraction job's progress. This is the polling alternative to the SSE stream.
    *   **Response:** `200 OK`, `{ "totalTasks": 100, "completed": 50, "failed": 2, "status": "processing" }` or `{ "status": "completed" }`
*   **`GET /jobs/{job_id}/export`**
    *   **Action:** Downloads the final results as a file. The backend streams the response directly from the database.
    *   **Query Params:** `?format=csv` or `?format=xlsx`
    *   **Response:** A streaming response with `media_type="text/csv"` or the appropriate XLSX type, and `Content-Disposition` headers.

---
#### **Resource: `scheduled tasks` (Internal)**
*(Secure endpoints for Google Cloud Scheduler to call)*

*   **`POST /tasks/cleanup/abandoned`**
    *   **Action:** Enqueues the abandoned job cleanup task. Secured with OIDC token validation.
    *   **Response:** `202 Accepted`
*   **`POST /tasks/cleanup/opt-out`**
    *   **Action:** Enqueues the opt-out data cleanup task. Secured with OIDC token validation.
    *   **Response:** `202 Accepted`
*   **`POST /tasks/cleanup/artifacts`**
    *   **Action:** Enqueues the unpacked ZIP file cleanup task. Secured with OIDC token validation.
    *   **Response:** `202 Accepted`
