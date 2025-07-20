### **Part 3: Full Description of the UI (Next.js)**

This UI design focuses on clarity, efficiency, and providing the user with constant, reassuring feedback throughout the extraction process.

#### **I. Core Layout & Components**

*   **Main Navigation (Persistent Sidebar):**
    *   **Dashboard/My Jobs:** The main landing page after login.
    *   **New Job:** Starts the upload and extraction workflow.
    *   **Templates:** A dedicated section to manage reusable extraction templates.
    *   **User/Account Icon:** Top-right, for profile settings and logout.

*   **Key Reusable Components:**
    *   **`FileUploadDropzone`:** A large drag-and-drop area that also functions as a standard file picker. Handles files, folders, and ZIPs.
    *   **`FileTreeExplorer`:** The recursive component used to display folder/file hierarchies.
    *   **`StatusBadge`:** A small, color-coded badge (`Completed`, `Processing`, `Failed`) used throughout the app.
    *   **`FieldEditor`:** A component for defining a single extraction field, containing inputs for Field Name, Data Type (dropdown), and AI Prompt (textarea).
    *   **`ProgressBar`:** A visual bar showing job progress (e.g., "55/100 files complete").

#### **II. Page-by-Page User Flow**

**0. Login / Signup Pages**
*   **Purpose:** To handle user authentication via Firebase.
*   **API Calls:** None to your backend. All calls are made directly from the client to Firebase services.
*   **Layout:** You will either use the pre-built **FirebaseUI Web** component for a quick, all-in-one solution or build custom forms that use the Firebase JS SDK functions (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, etc.).
*   **Crucial Flow:** After a successful login or signup, the frontend must immediately make a call to your backend's **`POST /users/me/sync`** endpoint to ensure the user's profile is created in your PostgreSQL database. This should be done before navigating the user to the dashboard.

**1. Dashboard / "My Jobs" Page (`/jobs`)**

*   **Purpose:** To give the user an overview of all their past and present extraction jobs.
*   **API Calls:** `GET /jobs` (with pagination and filtering).
*   **Layout:** A table or a list of cards, with each row/card representing a single job.
*   **Job Row/Card Content:**
    *   **Job Name:** The user-friendly name (e.g., "Q1 Invoice Run"). Falls back to "Job from {date}" if unnamed.
    *   **Status:** A `StatusBadge` (e.g., `Completed`, `Processing`).
    *   **Stats:** A brief summary (e.g., "150 files", "2 tasks failed").
    *   **Created Date:** Human-readable timestamp (e.g., "2 days ago").
    *   **Actions:**
        *   **`View Results` button:** Navigates to the Job Details Page (`/jobs/{job_id}`).
        *   **`Delete` button:** (with a confirmation modal). Calls `DELETE /jobs/{job_id}`.
*   **Features:**
    *   A prominent "Start New Job" button that navigates to the New Job page.
    *   Tabs or dropdowns to filter jobs by status (`All`, `Processing`, `Completed`, `Failed`).
    *   A notice at the top for any "draft" jobs (status `pending_configuration`): "You have an unfinished job. [Continue Configuration] or [Discard]".

**2. New Job Workflow (Multi-Step Page)**

This is the most complex workflow, broken into clear steps.

*   **Step 1: Upload Files (`/jobs/new`)**
    *   **Purpose:** Get files from the user.
    *   **API Calls:** `POST /jobs/initiate`.
    *   **Layout:** Dominated by the `FileUploadDropzone`.
    *   **Flow:**
        1.  User drops files/folders/ZIPs.
        2.  The frontend builds the file list and calls the `/jobs/initiate` endpoint.
        3.  Upon receiving the pre-signed URLs, it begins the uploads (using the batched, streaming method).
        4.  The UI shows a list of files being uploaded with individual progress bars.
        5.  Once all uploads are complete, the UI automatically calls **`POST /jobs/{job_id}/finalize-uploads`** and navigates to the new Analysis step.

*   **Step 2: Analyzing Files (`/jobs/{job_id}/analysis`)**
    *   **Purpose:** To provide feedback to the user while the backend unpacks ZIPs and prepares the file tree. The user must wait for this step to complete.
    *   **API Calls:** Repeatedly **polls** the **`GET /jobs/{job_id}/analysis-status`** endpoint (e.g., every 3 seconds) as the initial implementation. This can be upgraded to use the `stream-analysis-status` SSE endpoint later.
    *   **Layout:** A clean, centered loading page.
    *   **UI Feedback:** Displays messages from the latest polling response, e.g., "Analyzing file structure...", "Unpacking 'Q1_Reports.zip'...". If the poll response includes a failure status, it displays a clear error message and halts.
    *   **Flow:**
        1.  The page loads and starts a `setInterval` to poll the status endpoint.
        2.  It updates the UI with the message from each response.
        3.  When the poll response returns `isReady: true`, it clears the interval and automatically navigates the user to the configuration step.

*   **Step 3: Configure Job & Extraction Fields (`/jobs/{job_id}/configure`)**
    *   **Purpose:** To name the job, select a template (or not), and define the extraction fields.
    *   **API Calls:** `GET /templates`, `GET /templates/{template_id}` (if a template is selected).
    *   **Layout:** A two-column layout.
        *   **Left Column (Job Settings):**
            *   **Job Name:** A text input, pre-filled with a default like "Extraction {date}".
            *   **Data Persistence:** A checkbox "Save my source files and results for future access." (defaults to checked, sets `persistData`).
            *   **Template Selector:** A dropdown populated by `GET /templates`. Selecting one fetches its details and populates the field editor on the right. A "Manage Templates" link navigates to the Templates page.
        *   **Right Column (Field Configuration):**
            *   A list of `FieldEditor` components. If a template was chosen, this is pre-filled. Otherwise, it starts with one blank `FieldEditor`.
            *   Buttons to "Add Field" and "Remove Field".
            *   The Data Type dropdown in each `FieldEditor` is populated by `GET /data-types`.
    *   **Flow:** When the user is done, they click "Next: Set Processing Rules".

*   **Step 4: Set Processing Rules & Start (`/jobs/{job_id}/rules`)**
    *   **Purpose:** To let the user decide how files should be grouped.
    *   *   **API Calls:** **`GET /jobs/{job_id}/files`** (called when this step loads), `POST /jobs/{job_id}/start`.
    *   **Layout:**
        *   The `FileTreeExplorer` component displays the **full, unpacked hierarchy** of uploaded files.
        *   Next to each folder in the tree is a **"Process as:" dropdown** with two options: `Individual Files` and `Combined Document`.
        *   **(Future Feature):** If user-defined ordering is implemented, the files within a "Combined" group would be a re-orderable list.
    *   **Flow:**
        1.  The user configures the processing mode for each folder.
        2.  They click the final **"Start Extraction"** button.
        3.  The frontend constructs the `taskDefinitions` payload based on the user's choices and sends it to the `/jobs/{job_id}/start` endpoint.
        4.  Upon receiving a `202 Accepted` response, the user is automatically redirected to the Job Details Page.

**3. Job Details / Progress Page (`/jobs/{job_id}`)**

*   **Purpose:** To show real-time progress for an active job and display the final results for a completed one.
*   **API Calls:** `GET /jobs/{job_id}` (for initial data), **`GET /jobs/{job_id}/progress` (for polling)**, `GET /jobs/{job_id}/results` (for pagination of results). Can be upgraded to use the `stream-status` SSE endpoint in the future.
*   **Layout (During Processing):**
    *   **Top Bar:** Job Name, overall `StatusBadge`, and a `ProgressBar` showing `completed / total`.
    *   **Main View:** The `FileTreeExplorer` is shown, but now each file has its own small status indicator (`Pending`, `Processing`, `Completed`, `Failed`). This provides granular feedback.
*   **Layout (After Completion):**
    *   **Top Bar:** Job Name, final `StatusBadge`, and "Download" buttons (`CSV`, `XLSX`). These buttons trigger the `GET /jobs/{job_id}/export` endpoints.
    *   **Main View:** A paginated data table showing the results.
        *   **Columns:** One column for `Source File(s)`. For "combined" tasks, this cell would list all the source files. The subsequent columns correspond to the `job_fields` (e.g., `invoice_date`, `total_amount`).
        *   Each row represents one completed `extraction_task`.
        *   The user can click on a row to see the full extracted JSON in a modal or a side panel.

**4. Templates Page (`/templates`)**

*   **Purpose:** A dedicated area for users to manage their reusable extraction templates.
*   **API Calls:** `GET /templates`, `POST /templates`, `PUT /templates/{id}`, `DELETE /templates/{id}`.
*   **Layout:**
    *   A list of the user's existing templates.
    *   A "Create New Template" button.
    *   Clicking a template or "Create New" opens a modal or a separate page that uses the same `FieldEditor` components from the job configuration flow, allowing the user to define the template's name and fields.
