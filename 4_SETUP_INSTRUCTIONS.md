### **Part 4: Full Set of Instructions for Setup**

This guide is broken into two main sections: setting up a local development environment and deploying a production-ready system.

#### **I. Local Development Environment Setup**

**Goal:** To create a fast, easy-to-manage environment for writing and debugging code with instant feedback.

**Prerequisites:**
*   Python 3.10+
*   Node.js 18+ (for the Next.js frontend)
*   Docker and Docker Compose
*   An IDE like VSCode

**Step 1: Project Structure**

Organize your monorepo. This example assumes you're using `pnpm` workspaces, but `npm` or `yarn` workspaces work too.

```
/bytereview/
├── /backend/              # FastAPI, ARQ, etc.
│   ├── /your_app/
│   ├── Dockerfile
│   └── requirements.txt
├── /frontend/             # Next.js
│   ├── /app/
│   ├── next.config.js
│   └── package.json
├── docker-compose.yml     # For local services
└── package.json           # Root package.json for monorepo scripts
```

**Step 2: Setup Local Services with Docker Compose**

Create a `docker-compose.yml` file in your project root. This will manage your database and message broker so you don't have to install them on your machine.

`docker-compose.yml`:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    container_name: bytereview-postgres-dev
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=bytereview
      - POSTGRES_PASSWORD=bytereview
      - POSTGRES_DB=bytereview_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bytereview -d bytereview_dev"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: bytereview-redis-dev
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```
**Action:** Run `docker-compose up -d` in your root directory. This will start PostgreSQL and Redis in the background.

**Step 3: Setup the Backend**

1.  **Environment:** Create a `.env` file in the `/backend` directory.
    ```
    DATABASE_URL="postgresql://bytereview:bytereview@localhost:5432/bytereview_dev"
    REDIS_URL="redis://localhost:6379"
    # Path to your Firebase Admin SDK service account key
    GOOGLE_APPLICATION_CREDENTIALS="./path/to/your/firebase-adminsdk-key.json"
    ```
2.  **Dependencies:** `cd backend && pip install -r requirements.txt`
3.  **Database Migration:** Use a tool like Alembic to apply your schema to the database. Run your migration command (e.g., `alembic upgrade head`).
4.  **Run the Web Server:** In a terminal, run:
    `cd backend && uvicorn your_app.main:app --reload`
5.  **Run the Worker:** In a *second* terminal, run:
    `cd backend && arq your_app.worker.WorkerSettings --watch`

**Step 4: Setup the Frontend**

1.  **Dependencies:** `cd frontend && pnpm install` (or `npm install`/`yarn`)
2.  **Environment:** Next.js will automatically pick up environment variables, often from a `.env.local` file.
3.  **Run the Dev Server:** In a *third* terminal, run:
    `cd frontend && pnpm dev` (or `npm run dev`/`yarn dev`)

You now have the full application running locally. The Next.js app on `localhost:3000` can make API calls to the FastAPI server on `localhost:8000`, which can enqueue jobs that are instantly picked up by the ARQ worker.

---

### **II. Production Deployment Setup (Google Cloud Platform)**

**Goal:** To create a scalable, reliable, and automated production environment.

**Prerequisites:**
*   A Google Cloud Platform (GCP) project with billing enabled.
*   `gcloud` CLI installed and authenticated (`gcloud auth login`, `gcloud config set project YOUR_PROJECT_ID`).
*   All necessary APIs enabled (Cloud Build, Artifact Registry, Cloud Run, Cloud SQL, Memorystore, Cloud Scheduler).

**Step 1: Provision Core Infrastructure (The "One-Time Setup")**

1.  **Database (Cloud SQL for PostgreSQL):**
    *   Create a new Cloud SQL for PostgreSQL instance.
    *   Set a strong password for the `postgres` user.
    *   Create the `bytereview_prod` database.
    *   Configure its networking (e.g., Private IP).
2.  **Message Broker (Memorystore for Redis):**
    *   Create a new Memorystore for Redis instance within the same VPC as your Cloud SQL instance.
3.  **File Storage (Google Cloud Storage):**
    *   Create a GCS bucket to store all user file uploads.
    *   Configure CORS settings on the bucket to allow `PUT` requests from your frontend's domain.
    *   Configure Lifecycle rules to automatically delete old objects if desired.
4.  **Container Registry (Artifact Registry):**
    *   Create a new Docker repository in Artifact Registry to store your application's container images.

**Step 2: Containerize the Application**

*   Use the `Dockerfile` from the previous discussions to build your application image. This file should be in your `/backend` directory.

**Step 3: Automate Builds with Cloud Build**

*   Create a `cloudbuild.yaml` file in your project root. This tells Cloud Build how to build and push your Docker image whenever you push to your Git repository (e.g., the `main` branch).
    ```yaml
    steps:
    - name: 'gcr.io/cloud-builders/docker'
      args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/$PROJECT_ID/bytereview/bytereview-app:$COMMIT_SHA'
      - '.'
      - '-f'
      - 'backend/Dockerfile'
    images:
    - 'us-central1-docker.pkg.dev/$PROJECT_ID/bytereview/bytereview-app:$COMMIT_SHA'
    ```
*   Connect Cloud Build to your GitHub/GitLab repository and create a trigger.

**Step 4: Deploy Services to Cloud Run**

You will deploy your single container image as three separate Cloud Run services, creating specialized worker pools for different tasks.

1.  **Deploy the Web Service:**
    *   Use the `gcloud run deploy` command or the UI.
    *   Point it to the image in Artifact Registry.
    *   Set environment variables for `DATABASE_URL`, `REDIS_URL`, etc., using Secret Manager for sensitive values.
    *   Configure the VPC Connector to allow it to communicate with Cloud SQL and Memorystore.
    *   Use the default container command (`uvicorn your_app.main:app ...`).
    *   Configure min/max instances for autoscaling based on requests.

2.  **Deploy the AI Extraction Worker Service:**
    *   Deploy the same image as a new service (e.g., `bytereview-worker-ai`).
    *   **Override the container command** to be `arq your_app.worker.WorkerSettings --queue-name arq:queue`. This tells it to only listen to the default queue for AI tasks.
    *   Set the same environment variables and VPC connector.
    *   **Provisioning:** Configure with **low memory** (e.g., 1-2 GB).
    *   **Concurrency:** Can be set to a high value in your `WorkerSettings` (e.g., `max_jobs = 10`) as tasks are I/O-bound.
    *   **Scaling:** Configure to scale aggressively (e.g., 2-50 instances) based on CPU utilization to ensure high throughput.
    *   Set CPU to "always allocated".

3.  **Deploy the ZIP Unpacking Worker Service:**
    *   Deploy the same image again as a third service (e.g., `bytereview-worker-zip`).
    *   **Override the container command** to be `arq your_app.worker.WorkerSettings --queue-name arq:zip_queue`. This dedicates it to the ZIP unpacking queue.
    *   Set the same environment variables and VPC connector.
    *   **Provisioning:** Configure with **high memory** (e.g., 16 GB) to handle large files.
    *   **Concurrency:** Set to a very low value in `WorkerSettings` (e.g., `max_jobs = 1`) to prevent multiple large files from running on one instance.
    *   **Scaling:** Configure to scale conservatively (e.g., 0-5 instances) as these jobs are less frequent.
    *   Set CPU to "always allocated".

**Step 5: Configure Scheduled Cleanup Tasks**

1.  **Secure Endpoints:** Ensure your FastAPI app has the secure `/tasks/...` endpoints that require OIDC authentication.
2.  **Create Scheduler Jobs:** In Google Cloud Scheduler, create a job for each cleanup task (`abandoned`, `opt-out`, `artifacts`).
    *   **Target:** HTTP.
    *   **URL:** The full URL to your deployed web service's endpoint (e.g., `https://...run.app/tasks/cleanup/abandoned`).
    *   **Schedule:** Set the cron schedule (e.g., `0 2 * * *`).
    *   **Auth header:** Set to "OIDC token" and configure it with a dedicated service account that has permission to invoke your Cloud Run service.
