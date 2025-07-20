### **Appendix B: Full Description of the Background Worker System**

**Objective:** To provide a scalable, reliable, and asynchronous system for executing long-running tasks such as ZIP file unpacking and AI-powered data extraction without blocking the web server or degrading the user experience.

**Core Principles:**
1.  **Asynchronicity:** The user should receive an immediate response from the web server, while tasks execute independently in the background.
2.  **Persistence & Reliability:** If a worker crashes or a task fails, the work should not be lost. The system must support retries and ensure eventual completion.
3.  **Scalability:** The system's processing power must be able to scale horizontally (by adding more machines/instances) to meet demand, independent of the web server's scaling.
4.  **Decoupling:** The workers should be generic "processors" that are fed tasks from a central queue, keeping them simple and focused.

---

#### **I. The Core Components**

The background worker system consists of three main components working in concert:

1.  **The Task Queue (Redis with ARQ):**
    *   **Role:** The central "mailbox" or "to-do list" for the entire application.
    *   **Technology:** We use Redis as the message broker. The ARQ library provides the Python interface. We will configure **two distinct queues** to separate different classes of work.
    *   **`arq:queue` (Default):** For high-throughput, low-memory tasks like AI data extraction.
    *   **`arq:zip_queue`:** For low-throughput, high-memory, resource-intensive tasks like ZIP file unpacking.
    *   **Function:** When the FastAPI server needs a long-running task done, it doesn't do it itself. It serializes the task's name and its arguments (e.g., `'process_extraction_task'`, `task_id='...'`) and places this message onto the Redis queue. This is a very fast operation.

2.  **The Worker Processes (ARQ on Cloud Run):**
    *   **Role:** The "back office staff." These are separate, long-running Python processes whose only job is to watch the Redis queue.
    *   **Deployment:** They are deployed as **two separate, specialized Google Cloud Run services** (worker pools).
    *   **AI Worker Pool:** A large pool of low-memory instances watching the default `arq:queue`.
    *   **ZIP Worker Pool:** A smaller pool of high-memory instances watching the `arq:zip_queue`.
    *   **Execution:** When a worker process sees a new message in the queue, it pulls the message, deserializes it, and executes the corresponding Python function with the provided arguments. Because they are `asyncio`-based, a single worker process can concurrently handle multiple I/O-bound tasks (like waiting for API calls).

3.  **The Task Functions (Python Code):**
    *   **Role:** These are the specific Python functions that contain the business logic for each type of background job. They are defined in our application code (e.g., in `your_app/worker.py`).

---

#### **II. The Primary Background Tasks**

**Task A: ZIP File Unpacking (`unpack_zip_file_task`)**

*   **Triggered by:** The main application enqueues this task to the **`arq:zip_queue`** immediately after a ZIP file is uploaded and its initial `source_files` record is created with `status = 'pending_unpacking'`.
*   **Worker's Workflow:**
    1.  Receives a `source_file_id` corresponding to the ZIP file.
    2.  **Downloads to Ephemeral Disk:** Downloads the ZIP from GCS to a unique, temporary directory on its own local filesystem (e.g., `/tmp/{uuid}/`). This is crucial for handling large archives without consuming memory.
    3.  **Unpacks Locally:** Extracts the archive's contents into the temporary directory.
    4.  **Registers Contents:** Iterates through the unpacked files. For each one:
        a.  Performs **path normalization**.
        b.  Creates a new `source_files` record in the database for this internal file.
        c.  Uploads the individual file from its temporary location to a new, permanent, flat path in GCS.
    5.  **Updates Status:** After successfully processing all contents, it updates the original ZIP file's status in the database to `unpacked`.
    6.  **Cleanup:** In a `finally` block, it **deletes the entire temporary directory** to free up disk space. This is a mandatory step.

**Task B: AI Data Extraction (`process_extraction_task`)**

*   **Triggered by:** The "Task Generation" logic enqueues this task to the **default `arq:queue`** when a user clicks "Start Extraction." The backend enqueues one task for each defined unit of work.
*   **Worker's Workflow:**
    1.  Receives a `task_id` from the queue.
    2.  **Fetches Task Definition:** Queries the `source_files_to_tasks` table to get the list of all `source_file_id`s associated with this task, ensuring they are ordered by the `document_order` column.
    3.  **Fetches System Prompt:** Retrieves the active `system_prompts` template from the database.
    4.  **Builds JSON Schema:** Fetches the field definitions for the job from the `job_fields` table and dynamically constructs a JSON Schema for Gemini's function-calling/tool-use feature. This ensures the output is structured correctly.
    5.  **Constructs AI Request:** Assembles the final request for the Gemini API. This includes:
        *   The system prompt.
        *   The list of GCS URIs for the source files (one for an individual task, many for a "combined document" task).
        *   The generated JSON Schema in the `tool_config`.
    6.  **Calls Gemini API:** Makes the call and waits for the response.
    7.  **Saves Results:** Parses the returned JSON data from Gemini and creates a single `extraction_results` record, linking it to the `task_id`.
    8.  **Updates Status:** Updates the `extraction_tasks` record's status to `completed` or `failed` (logging any errors).

**Task C: Scheduled Cleanup Tasks (`run_..._cleanup`)**

*   **Triggered by:** Google Cloud Scheduler making a secure HTTP request to a dedicated endpoint in the FastAPI app. The endpoint then enqueues the actual cleanup task into ARQ.
*   **Worker's Workflow:** Each cleanup task is a separate function that performs a specific duty:
    1.  **Abandoned Job Cleanup:** Finds jobs stuck in `pending_configuration` for too long, deletes their GCS files, and then deletes the job from the database.
    2.  **Opt-Out Data Cleanup:** Finds completed jobs where `persist_data = false` that are past their grace period (e.g., 24 hours), deletes their GCS files and all associated database records.
    3.  **Artifact Cleanup:** Finds `source_files` with `status = 'unpacked'` (i.e., old ZIPs) and deletes their corresponding GCS objects.
