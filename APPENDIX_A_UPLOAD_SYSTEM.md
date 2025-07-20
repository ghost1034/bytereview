### **Appendix A: Full Description of the Upload System**

**Objective:** To provide a fast, reliable, and secure method for users to upload a wide variety of file structures (single files, multiple files, nested folders, ZIP archives) without crashing the browser or overloading the application server.

**Core Principles:**
1.  **Client-Side Lightness:** The user's browser should do as little heavy lifting as possible.
2.  **Server-Side Decoupling:** The web server should not be a bottleneck for large file transfers.
3.  **Security:** All uploads must be authenticated and authorized.
4.  **Resilience:** The system must gracefully handle both large individual files and a high quantity of files.

---

#### **The End-to-End Workflow**

The upload process is a carefully orchestrated, multi-step flow between the client (Next.js), the backend (FastAPI), and cloud storage (GCS).

**Step 1: User Action and Frontend File Discovery**

*   **Action:** A user interacts with the `FileUploadDropzone` component on the `/jobs/new` page by dragging & dropping content or using the file picker.
*   **File Discovery (Client-Side JavaScript):**
    *   **For Folders:** The frontend recursively traverses the folder structure. It uses the `File.webkitRelativePath` property to get the full, original path for every single file (e.g., `Client Reports/2024/Approved/invoice.pdf`).
    *   **For Individual Files:** The `original_path` is simply the `file.name`.
    *   **For ZIP Archives:** The frontend treats the ZIP as a single file. Its `original_path` is its filename. The internal structure is unknown to the client.
*   **Outcome:** The frontend now has an in-memory array of lightweight objects, each containing a `File` object handle and its discovered `original_path` string.

**Step 2: Job Initiation and URL Generation (API Call 1)**

*   **Action:** The frontend makes a single `POST /jobs/initiate` request to the backend.
*   **Request Payload:** The body of this request contains a JSON array listing the metadata for every file to be uploaded: `{ "files": [ { "path": "...", "size": ..., "type": "..." } ] }`.
*   **Backend Logic:**
    1.  Authenticates the user.
    2.  Creates a single `extraction_jobs` record in the database with an initial status of `pending_configuration`.
    3.  For each file in the payload, it performs two critical actions:
        a.  **Path Normalization:** It runs the `original_path` through the `normalize_path()` utility function to handle different OS separators (`\`, `/`) and case, ensuring a canonical path is stored.
        b.  **Record Creation:** It creates a corresponding `source_files` record in the database, linking it to the new job and storing the normalized path, filename, size, and type, with an initial `status` of `uploading`.
    4.  It generates a unique GCS object name for each file (e.g., `user_id/job_id/uuid.pdf`).
    5.  It generates a secure, time-limited **GCS Pre-Signed V4 URL** for `PUT` requests for each of these GCS objects.
*   **Response:** The backend responds with a JSON object containing the `jobId` and an array mapping each original path to its unique pre-signed upload URL.

**Step 3: Direct-to-Cloud Upload (Client-Side)**

*   **Action:** The frontend receives the list of pre-signed URLs. It now has everything it needs to perform the uploads.
*   **Execution - The "Both" Strategy for Resilience:**
    1.  **Batching/Queueing:** The frontend does not attempt to upload all files at once. It uses a queue and a small pool of concurrent workers (e.g., 5) to process the upload tasks. This prevents overwhelming the browser with thousands of simultaneous network connections when a large folder is uploaded.
    2.  **Streaming:** For each individual upload task, the worker uses the `fetch` API with the file's `ReadableStream` (`file.stream()`) as the request body. This ensures that even multi-gigabyte files are uploaded with minimal, constant memory usage in the browser.
*   **Target:** Each `fetch` request is made **directly to the GCS pre-signed URL**, not to the FastAPI backend. This offloads the entire data transfer from the application server, keeping it free to serve other API requests.
*   **UI Feedback:** The UI shows both individual file progress and overall job progress (e.g., "Uploading file 37 of 150...").

**Step 4: Finalizing the Job (API Call 2)**

*   **Action:** Once all files in the queue have been successfully uploaded, the frontend enables the "Next" button. When the user proceeds through the configuration steps and finally clicks "Start Extraction," the frontend makes a `POST /jobs/{job_id}/start` request.
*   **Purpose:** This call signals to the backend that the upload phase is complete and provides the final configuration (job name, field definitions, processing rules).
*   **Backend Logic:** The backend receives this call, snapshots the configuration into `job_fields`, creates the initial `extraction_tasks`, and enqueues them for the background worker system.
*   **Outcome:** The job is now fully in the hands of the backend processing system. The upload phase is complete.
