### **Part 5: Full System Summary**

**Application:** **ByteReview**
**Mission:** A web application for users to extract structured data from PDF documents using the Google Gemini API. Users can define custom extraction templates, process files individually or as combined documents, and export the results.

**Core Technologies:**
*   **Frontend:** Next.js (React)
*   **Backend:** FastAPI (Python)
*   **Authentication:** Firebase Authentication
*   **Database:** PostgreSQL
*   **File Storage:** Google Cloud Storage (GCS)
*   **Background Jobs:** ARQ with Redis
*   **Deployment:** Google Cloud Run, with other GCP services (Cloud SQL, Memorystore, Cloud Scheduler)

---

#### **1. The Upload System**

The upload workflow is designed for speed, resilience, and scalability.

*   **User Input:** The system accepts single/multiple PDFs, nested folders, and ZIP archives.
*   **Mechanism:** It uses a multi-step, secure process:
    1.  The Next.js client discovers all file paths (using `webkitRelativePath` for folders) and informs the backend.
    2.  The backend creates database records for the job and files, then generates secure, time-limited **pre-signed GCS URLs** for each file.
    3.  The client uploads the files **directly to GCS** using these URLs. This offloads all bandwidth from the application server.
    4.  The upload process is both **batched** (to handle a high quantity of files without overwhelming the browser) and **streamed** (to handle large individual files with minimal browser memory).

---

#### **2. The Background Worker System**

All long-running and intensive tasks are handled asynchronously by a robust background worker system to ensure the UI remains fast and responsive.

*   **Architecture:** The system uses a **task queue (ARQ + Redis)** with **two specialized queues** to isolate different workloads.
    *   **AI Extraction Queue:** For fast, low-memory AI tasks.
    *   **ZIP Unpacking Queue:** For slow, high-memory unpacking tasks.
*   **Worker Pools:** Two separate, independently scalable pools of ARQ workers run on Google Cloud Run.
    *   A large pool of low-memory workers services the AI queue.
    *   A small pool of high-memory workers services the ZIP queue.
This separation prevents large file operations from blocking time-sensitive AI extractions, ensuring system stability and resource efficiency.
*   **Key Tasks:**
    *   **AI Data Extraction:** The core task. A worker receives a `task_id`, constructs a request with a system prompt, the GCS URIs of the relevant file(s), and a dynamically generated JSON Schema, and sends it to the Gemini API.
    *   **ZIP File Unpacking:** A specialized task that downloads a ZIP archive to a worker's **ephemeral local disk**, unpacks it, registers its contents as new source files, and uploads them back to GCS. The worker cleans up its temporary disk space after completion.
    *   **Scheduled Cleanup:** A suite of automated tasks, triggered by Google Cloud Scheduler, to maintain system hygiene.

---

#### **3. Database Schema & Data Model (PostgreSQL)**

The schema is designed for flexibility, immutability, and performance.

*   **Core Principle:** A job's configuration is **snapshotted** at the time of execution to ensure immutability and historical accuracy.
*   **Key Tables:**
    *   **`users`, `templates`, `template_fields`:** Standard tables for managing users and their reusable extraction templates.
    *   **`data_types`, `system_prompts`:** Managed content tables that store canonical lists of data types and base AI prompts, allowing for easy updates without code changes.
    *   **`extraction_jobs`:** A top-level record for each user session, containing a user-friendly `name` and data persistence preferences.
    *   **`job_fields`:** A **snapshot** of the exact field configuration (name, data type, prompt) used for a specific job. This is the source of truth for processing, decoupling the job from any later changes to the original template.
    *   **`source_files`:** A record for every uploaded file. It contains both a denormalized `original_filename` for fast searching and a full, normalized `original_path` for displaying hierarchy. The GCS path is a separate, non-semantic UUID.
    *   **`extraction_tasks`:** The central unit of work. A task represents a single call to Gemini. It contains a `processing_mode` (`individual` or `combined`) and is linked to one or more files.
    *   **`source_files_to_tasks`:** A many-to-many join table linking files to tasks. It crucially contains the `document_order` column to ensure that combined-document tasks are reproducible.
    *   **`extraction_results`:** Stores the final `JSONB` output from Gemini, linked one-to-one with a completed task.

---

#### **4. API & User Interface**

The API acts as a clean, RESTful contract between the frontend and backend. The UI is designed to guide the user through a logical workflow.

*   **API:** A comprehensive set of endpoints for managing users, templates, and the job lifecycle. It includes specific endpoints for initiating uploads, starting processing, checking progress, and exporting results. Communication for real-time status updates is handled via an efficient method like **Server-Sent Events (SSE)** (or short polling as a simpler alternative).
*   **UI Workflow:**
    1.  **Dashboard:** Users view and manage past and present jobs.
    2.  **New Job (Multi-Step):**
        *   **Upload:** A dedicated page for file uploads.
        *   **Configure:** Users name the job, select/create an extraction template, and set data persistence options.
        *   **Set Rules:** A final review step where users can specify the processing mode (`individual` vs. `combined`) for different folders.
    3.  **Job Details Page:** A dynamic page that shows real-time progress for active jobs and displays a paginated, searchable table of results for completed jobs, with options to export to CSV/XLSX.

---

#### **5. Deployment & Operations**

The system is designed for a modern, scalable cloud deployment on GCP.

*   **Containerization:** The entire backend application (FastAPI + ARQ) is packaged into a single Docker image.
*   **Deployment:** This single image is deployed as **three separate Google Cloud Run services**:
    *   A **Web Service** (`uvicorn`) for handling API requests.
    *   An **AI Worker Service** (`arq` listening to the default queue), provisioned with low memory and high-concurrency scaling.
    *   A **ZIP Worker Service** (`arq` listening to the `arq:zip_queue`), provisioned with high memory and low-concurrency scaling.
*   **Infrastructure:**
    *   **Database:** Managed Cloud SQL for PostgreSQL.
    *   **Queue:** Managed Memorystore for Redis.
    *   **Scheduling:** Google Cloud Scheduler is used to trigger the cleanup tasks via secure, authenticated HTTP requests.
*   **Cleanup:** A suite of three distinct, scheduled cleanup tasks ensures system health:
    1.  **Abandoned Job Cleanup:** Removes jobs never submitted for processing.
    2.  **Opt-Out Data Cleanup:** Deletes data for users who chose not to persist it, after a 24-hour grace period for them to download results.
    3.  **Artifact Cleanup:** Deletes "unpacked" ZIP file objects from GCS after they are no longer needed.
