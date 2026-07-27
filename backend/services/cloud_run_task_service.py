"""
Cloud Run Tasks service to replace ARQ workers
Handles task creation and execution coordination
"""
import os
import asyncio
import json
import logging
import hashlib
import uuid
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse
import httpx
from google.api_core.exceptions import NotFound
from google.cloud import tasks_v2
from google.protobuf import timestamp_pb2
from google.protobuf import field_mask_pb2
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

from core.runtime import require_cloud_value, task_backend

load_dotenv()

logger = logging.getLogger(__name__)

class CloudRunTaskService:
    """Service for managing Cloud Run Tasks execution"""
    
    def __init__(self):
        self.backend = task_backend()
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT_ID") or ("local" if self.backend == "local" else require_cloud_value("GOOGLE_CLOUD_PROJECT_ID"))
        self.region = os.getenv("CLOUD_RUN_REGION", "us-central1")
        self._tasks_client = None
        self._local_tasks: set[asyncio.Task] = set()
        
        # Task service URLs - get from environment variables (Secret Manager)
        self.task_services = {
            "extract": os.getenv("TASK_EXTRACT_URL") or ("http://127.0.0.1:8001" if self.backend == "local" else require_cloud_value("TASK_EXTRACT_URL")),
            "io": os.getenv("TASK_IO_URL") or ("http://127.0.0.1:8002" if self.backend == "local" else require_cloud_value("TASK_IO_URL")),
            "automation": os.getenv("TASK_AUTOMATION_URL") or ("http://127.0.0.1:8003" if self.backend == "local" else require_cloud_value("TASK_AUTOMATION_URL")),
            "maintenance": os.getenv("TASK_MAINTENANCE_URL") or ("http://127.0.0.1:8004" if self.backend == "local" else require_cloud_value("TASK_MAINTENANCE_URL")),
        }
        
        # Debug logging
        logger.info(f"Initialized CloudRunTaskService with URLs: {self.task_services}")
        
        # Cloud Tasks queue names
        self.queue_names = {
            "extract": f"projects/{self.project_id}/locations/{self.region}/queues/extract-tasks",
            "io": f"projects/{self.project_id}/locations/{self.region}/queues/io-tasks",
            "automation": f"projects/{self.project_id}/locations/{self.region}/queues/automation-tasks",
            "maintenance": f"projects/{self.project_id}/locations/{self.region}/queues/maintenance-tasks"
        }

        # Per-attempt dispatch deadlines (Cloud Tasks).
        # Recommended target runtime for extraction is 30 minutes (Cloud Tasks max dispatch deadline).
        try:
            self.extract_dispatch_deadline_seconds = int(os.getenv("TASK_EXTRACT_DISPATCH_DEADLINE_SECONDS", "1800"))
        except Exception:
            self.extract_dispatch_deadline_seconds = 1800

        self.extract_retry_config = self._build_extract_retry_config()

    @property
    def tasks_client(self):
        if self._tasks_client is None:
            self._tasks_client = tasks_v2.CloudTasksClient()
        return self._tasks_client

    def _env_int(self, name: str, default: int) -> int:
        try:
            return int(os.getenv(name, str(default)))
        except (TypeError, ValueError):
            return default

    def _env_float(self, name: str, default: float) -> float:
        try:
            return float(os.getenv(name, str(default)))
        except (TypeError, ValueError):
            return default

    def calculate_stagger_delay(
        self,
        index: int,
        *,
        batch_size_env: str,
        batch_delay_env: str,
        max_delay_env: str,
        jitter_env: str,
        default_batch_size: int = 5,
        default_batch_delay_seconds: int = 15,
        default_max_delay_seconds: int = 900,
        default_jitter_seconds: int = 5,
        jitter_seed: Optional[str] = None,
    ) -> int:
        """Calculate a deterministic delay for staggered Cloud Tasks enqueueing."""
        safe_index = max(0, int(index or 0))
        batch_size = max(1, self._env_int(batch_size_env, default_batch_size))
        batch_delay_seconds = max(0, self._env_int(batch_delay_env, default_batch_delay_seconds))
        max_delay_seconds = max(0, self._env_int(max_delay_env, default_max_delay_seconds))
        jitter_seconds = max(0, self._env_int(jitter_env, default_jitter_seconds))

        base_delay = (safe_index // batch_size) * batch_delay_seconds
        if max_delay_seconds > 0:
            base_delay = min(base_delay, max_delay_seconds)

        # Keep the first batch immediate; jitter later batches to avoid synchronized bursts.
        if base_delay <= 0 or jitter_seconds <= 0 or not jitter_seed:
            return base_delay

        digest = hashlib.sha256(str(jitter_seed).encode("utf-8")).hexdigest()
        jitter = int(digest[:8], 16) % (jitter_seconds + 1)
        delayed = base_delay + jitter
        return min(delayed, max_delay_seconds) if max_delay_seconds > 0 else delayed

    def _queue_rate_limits(self, queue_id: str) -> Dict[str, Any]:
        defaults = {
            "extract-tasks": (10.0, 100, 20),
            "io-tasks": (10.0, 100, 10),
            "automation-tasks": (10.0, 100, 10),
            "maintenance-tasks": (10.0, 100, 5),
        }
        env_prefixes = {
            "extract-tasks": "TASK_EXTRACT",
            "io-tasks": "TASK_IO",
            "automation-tasks": "TASK_AUTOMATION",
            "maintenance-tasks": "TASK_MAINTENANCE",
        }
        default_dispatches, default_burst, default_concurrent = defaults.get(queue_id, (10.0, 100, 5))
        env_prefix = env_prefixes.get(queue_id, "TASK")
        return {
            "max_dispatches_per_second": self._env_float(
                f"{env_prefix}_MAX_DISPATCHES_PER_SECOND",
                default_dispatches,
            ),
            "max_burst_size": max(1, self._env_int(f"{env_prefix}_MAX_BURST_SIZE", default_burst)),
            "max_concurrent_dispatches": max(
                1,
                self._env_int(f"{env_prefix}_MAX_CONCURRENT_DISPATCHES", default_concurrent),
            ),
        }

    def _build_extract_retry_config(self) -> Dict[str, Any]:
        max_attempts = max(1, self._env_int("TASK_EXTRACT_MAX_ATTEMPTS", 3))
        return {
            "max_attempts": max_attempts,
            "max_retry_duration": f"{max(0, self._env_int('TASK_EXTRACT_MAX_RETRY_DURATION_SECONDS', 7200))}s",
            "min_backoff": f"{max(1, self._env_int('TASK_EXTRACT_MIN_BACKOFF_SECONDS', 30))}s",
            "max_backoff": f"{max(1, self._env_int('TASK_EXTRACT_MAX_BACKOFF_SECONDS', 300))}s",
            "max_doublings": max(0, self._env_int("TASK_EXTRACT_MAX_DOUBLINGS", 5)),
        }

    async def enqueue_extraction_task(
        self, 
        task_id: str, 
        automation_run_id: str = None,
        delay_seconds: int = 0
    ) -> str:
        """Enqueue an extraction task"""
        task_data = {
            "task_type": "process_extraction_task",
            "task_id": str(task_id) if task_id is not None else None,
            "automation_run_id": str(automation_run_id) if automation_run_id is not None else None
        }
        
        return await self._create_cloud_task(
            queue_name=self.queue_names["extract"],
            service_url=f"{self.task_services['extract']}/execute",
            task_data=task_data,
            delay_seconds=delay_seconds,
            dispatch_deadline_seconds=self.extract_dispatch_deadline_seconds,
        )

    async def enqueue_form_fill_task(self, run_id: str, delay_seconds: int = 0) -> str:
        """Enqueue a Form Fill run for background processing."""
        task_data = {
            "task_type": "process_form_fill_run",
            "run_id": str(run_id) if run_id is not None else None,
        }

        return await self._create_cloud_task(
            queue_name=self.queue_names["extract"],
            service_url=f"{self.task_services['extract']}/execute",
            task_data=task_data,
            delay_seconds=delay_seconds,
            dispatch_deadline_seconds=self.extract_dispatch_deadline_seconds,
        )

    async def enqueue_form_fill_output_task(self, run_id: str, output_id: str, delay_seconds: int = 0) -> str:
        """Enqueue a single Form Fill output for background processing."""
        task_data = {
            "task_type": "process_form_fill_output",
            "run_id": str(run_id) if run_id is not None else None,
            "output_id": str(output_id) if output_id is not None else None,
        }

        return await self._create_cloud_task(
            queue_name=self.queue_names["extract"],
            service_url=f"{self.task_services['extract']}/execute",
            task_data=task_data,
            delay_seconds=delay_seconds,
            dispatch_deadline_seconds=self.extract_dispatch_deadline_seconds,
        )

    async def enqueue_inkwise_ingestion_task(self, ingestion_id: str, delay_seconds: int = 0) -> str:
        """Enqueue Inkwise source ingestion on task-extract."""
        task_data = {
            "task_type": "process_inkwise_source_ingestion",
            "ingestion_id": str(ingestion_id) if ingestion_id is not None else None,
        }

        return await self._create_cloud_task(
            queue_name=self.queue_names["extract"],
            service_url=f"{self.task_services['extract']}/execute",
            task_data=task_data,
            delay_seconds=delay_seconds,
            dispatch_deadline_seconds=self.extract_dispatch_deadline_seconds,
        )

    async def enqueue_envelope_seal_task(self, envelope_id: str, delay_seconds: int = 0) -> str:
        """Enqueue e-sign envelope sealing (flatten + certificate + PAdES seal)."""
        task_data = {
            "task_type": "process_envelope_seal",
            "envelope_id": str(envelope_id) if envelope_id is not None else None,
        }

        return await self._create_cloud_task(
            queue_name=self.queue_names["io"],
            service_url=f"{self.task_services['io']}/execute",
            task_data=task_data,
            delay_seconds=delay_seconds,
        )

    async def enqueue_esign_webhook_task(self, delivery_id: str, delay_seconds: int = 0) -> str:
        """Enqueue one idempotent outbound E-Signature webhook attempt."""
        return await self._create_cloud_task(
            queue_name=self.queue_names["io"],
            service_url=f"{self.task_services['io']}/execute",
            task_data={"task_type": "deliver_esign_webhook", "delivery_id": str(delivery_id)},
            delay_seconds=delay_seconds,
        )

    async def enqueue_zip_unpack_task(
        self, 
        source_file_id: str, 
        automation_run_id: str = None
    ) -> str:
        """Enqueue a ZIP unpacking task"""
        task_data = {
            "task_type": "unpack_zip_file_task",
            "source_file_id": str(source_file_id) if source_file_id is not None else None,
            "automation_run_id": str(automation_run_id) if automation_run_id is not None else None
        }
        
        return await self._create_cloud_task(
            queue_name=self.queue_names["io"],
            service_url=f"{self.task_services['io']}/execute",
            task_data=task_data
        )

    async def enqueue_import_task(
        self, 
        task_type: str,  # "import_drive_files" or "import_gmail_attachments"
        job_id: str,
        user_id: str,
        import_data: Dict[str, Any],
        automation_run_id: str = None
    ) -> str:
        """Enqueue an import task"""
        task_data = {
            "task_type": task_type,
            "job_id": str(job_id) if job_id is not None else None,
            "user_id": str(user_id) if user_id is not None else None,
            "import_data": import_data,
            "automation_run_id": str(automation_run_id) if automation_run_id is not None else None
        }
        
        return await self._create_cloud_task(
            queue_name=self.queue_names["io"],
            service_url=f"{self.task_services['io']}/execute",
            task_data=task_data
        )

    async def enqueue_export_task(
        self,
        job_id: str,
        user_id: str,
        file_type: str,
        folder_id: str = None,
        automation_run_id: str = None,
        run_id: str = None
    ) -> str:
        """Enqueue an export task"""
        task_data = {
            "task_type": "export_job_to_google_drive",
            "job_id": str(job_id) if job_id is not None else None,
            "user_id": str(user_id) if user_id is not None else None,
            "file_type": file_type,
            "folder_id": folder_id,
            "automation_run_id": str(automation_run_id) if automation_run_id is not None else None,
            "run_id": str(run_id) if run_id is not None else None
        }
        
        return await self._create_cloud_task(
            queue_name=self.queue_names["io"],
            service_url=f"{self.task_services['io']}/execute",
            task_data=task_data
        )

    async def enqueue_automation_task(
        self,
        task_type: str,  # "automation_trigger_worker" or "run_initializer_worker"
        user_id: str = None,
        message_data: Dict[str, Any] = None,
        job_id: str = None,
        automation_run_id: str = None
    ) -> str:
        """Enqueue an automation task"""
        task_data = {
            "task_type": task_type,
            "user_id": str(user_id) if user_id is not None else None,
            "message_data": message_data,
            "job_id": str(job_id) if job_id is not None else None,
            "automation_run_id": str(automation_run_id) if automation_run_id is not None else None
        }
        
        return await self._create_cloud_task(
            queue_name=self.queue_names["automation"],
            service_url=f"{self.task_services['automation']}/execute",
            task_data=task_data
        )

    async def enqueue_gmail_history_processing_task(
        self,
        notification_data: Dict[str, Any],
        delay_seconds: int = 0,
    ) -> str:
        """Enqueue Gmail Pub/Sub history processing on task-automation."""
        task_data = {
            "task_type": "process_gmail_push_notification",
            "notification_data": notification_data or {},
        }

        return await self._create_cloud_task(
            queue_name=self.queue_names["automation"],
            service_url=f"{self.task_services['automation']}/execute",
            task_data=task_data,
            delay_seconds=delay_seconds,
        )

    async def enqueue_maintenance_task(
        self,
        task_type: str,  # Any of the maintenance functions
        task_data: Dict[str, Any] = None
    ) -> str:
        """Enqueue a maintenance task"""
        task_payload = {
            "task_type": task_type,
            **(task_data or {})
        }
        
        return await self._create_cloud_task(
            queue_name=self.queue_names["maintenance"],
            service_url=f"{self.task_services['maintenance']}/execute",
            task_data=task_payload
        )

    async def _create_cloud_task(
        self,
        queue_name: str,
        service_url: str,
        task_data: Dict[str, Any],
        delay_seconds: int = 0,
        dispatch_deadline_seconds: Optional[int] = None,
    ) -> str:
        """Create a Cloud Task"""
        if self.backend == "local":
            parsed = urlparse(service_url)
            if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
                raise RuntimeError(f"Local task dispatch refused non-local URL: {service_url}")

            task_name = f"local/{uuid.uuid4()}"

            async def dispatch() -> None:
                if delay_seconds > 0:
                    await asyncio.sleep(delay_seconds)
                try:
                    async with httpx.AsyncClient(timeout=None) as client:
                        response = await client.post(
                            service_url,
                            json=json.loads(json.dumps(task_data, default=str)),
                            headers={"X-CloudTasks-TaskName": task_name},
                        )
                        response.raise_for_status()
                    logger.info("Completed local task %s", task_name)
                except Exception:
                    logger.exception("Local task %s failed", task_name)

            scheduled = asyncio.create_task(dispatch(), name=task_name)
            self._local_tasks.add(scheduled)
            scheduled.add_done_callback(self._local_tasks.discard)
            logger.info("Scheduled local task %s -> %s", task_name, service_url)
            return task_name

        try:
            # Debug logging
            logger.info(f"Creating Cloud Task with URL: {service_url}")
            logger.info(f"Queue: {queue_name}")
            # Ensure all values are JSON serializable (convert UUIDs)
            safe_task_data = json.loads(json.dumps(task_data, default=str))
            logger.info(f"Task data: {safe_task_data}")
            # Create the task
            task = {
                "http_request": {
                    "http_method": tasks_v2.HttpMethod.POST,
                    "url": service_url,
                    "headers": {
                        "Content-Type": "application/json",
                    },
                    "body": json.dumps(task_data, default=str).encode(),
                    "oidc_token": {
                        "service_account_email": f"cpaautomation-runner@{self.project_id}.iam.gserviceaccount.com"
                    }
                }
            }

            # Per-attempt deadline for the HTTP request.
            # Note: This is enforced by Cloud Tasks independently of Cloud Run's request timeout.
            if dispatch_deadline_seconds is not None:
                try:
                    secs = int(dispatch_deadline_seconds)
                    if secs > 0:
                        task["dispatch_deadline"] = f"{secs}s"
                except Exception:
                    pass
            
            # Add delay if specified
            if delay_seconds > 0:
                timestamp = timestamp_pb2.Timestamp()
                timestamp.FromDatetime(
                    datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
                )
                task["schedule_time"] = timestamp
            
            # Create the task
            request = tasks_v2.CreateTaskRequest(
                parent=queue_name,
                task=task
            )
            
            def create_task():
                return self.tasks_client.create_task(request=request)

            response = await asyncio.to_thread(create_task)
            task_name = response.name
            
            logger.info(f"Created Cloud Task: {task_name}")
            return task_name
            
        except Exception as e:
            logger.error(f"Failed to create Cloud Task: {e}")
            raise

    def setup_task_queues(self):
        """Set up Cloud Tasks queues (run once during deployment)"""
        try:
            location_path = f"projects/{self.project_id}/locations/{self.region}"
            
            # Queue IDs (just the names, not full paths)
            queue_ids = ["extract-tasks", "io-tasks", "automation-tasks", "maintenance-tasks"]
            
            for queue_id in queue_ids:
                queue = {
                    "name": f"{location_path}/queues/{queue_id}",
                    "rate_limits": self._queue_rate_limits(queue_id),
                    "retry_config": self.extract_retry_config if queue_id == "extract-tasks" else {
                        "max_attempts": 3,
                        "max_retry_duration": "300s",
                        "min_backoff": "1s",
                        "max_backoff": "60s",
                        "max_doublings": 5
                    }
                }
                # Full queue name for checking existence
                full_queue_name = f"{location_path}/queues/{queue_id}"

                try:
                    self.tasks_client.get_queue(name=full_queue_name)
                    update_request = tasks_v2.UpdateQueueRequest(
                        queue=queue,
                        update_mask=field_mask_pb2.FieldMask(paths=["rate_limits", "retry_config"])
                    )
                    self.tasks_client.update_queue(request=update_request)
                    logger.info(f"Queue {queue_id} already exists; updated rate and retry config")
                except NotFound:
                    # Create queue
                    request = tasks_v2.CreateQueueRequest(
                        parent=location_path,
                        queue=queue
                    )
                    
                    self.tasks_client.create_queue(request=request)
                    logger.info(f"Created queue: {queue_id}")
                    
        except Exception as e:
            logger.error(f"Failed to setup task queues: {e}")
            raise

# Global instance
cloud_run_task_service = CloudRunTaskService()
