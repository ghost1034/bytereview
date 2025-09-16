"""
Cloud Run Tasks service to replace ARQ workers
Handles task creation and execution coordination
"""
import os
import json
import logging
from typing import Dict, Any, Optional, List
from google.cloud import run_v2
from google.cloud import tasks_v2
from google.protobuf import timestamp_pb2
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

class CloudRunTaskService:
    """Service for managing Cloud Run Tasks execution"""
    
    def __init__(self):
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT_ID")
        self.region = os.getenv("CLOUD_RUN_REGION", "us-central1")
        self.tasks_client = tasks_v2.CloudTasksClient()
        self.run_client = run_v2.ServicesClient()
        
        # Task service URLs (to be configured after deployment)
        self.task_services = {
            "extract": f"https://task-extract-{self.project_id}.{self.region}.run.app",
            "io": f"https://task-io-{self.project_id}.{self.region}.run.app", 
            "automation": f"https://task-automation-{self.project_id}.{self.region}.run.app",
            "maintenance": f"https://task-maintenance-{self.project_id}.{self.region}.run.app"
        }
        
        # Cloud Tasks queue names
        self.queue_names = {
            "extract": f"projects/{self.project_id}/locations/{self.region}/queues/extract-tasks",
            "io": f"projects/{self.project_id}/locations/{self.region}/queues/io-tasks",
            "automation": f"projects/{self.project_id}/locations/{self.region}/queues/automation-tasks",
            "maintenance": f"projects/{self.project_id}/locations/{self.region}/queues/maintenance-tasks"
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
            "task_id": task_id,
            "automation_run_id": automation_run_id
        }
        
        return await self._create_cloud_task(
            queue_name=self.queue_names["extract"],
            service_url=f"{self.task_services['extract']}/execute",
            task_data=task_data,
            delay_seconds=delay_seconds
        )

    async def enqueue_zip_unpack_task(
        self, 
        source_file_id: str, 
        automation_run_id: str = None
    ) -> str:
        """Enqueue a ZIP unpacking task"""
        task_data = {
            "task_type": "unpack_zip_file_task",
            "source_file_id": source_file_id,
            "automation_run_id": automation_run_id
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
            "job_id": job_id,
            "user_id": user_id,
            "import_data": import_data,
            "automation_run_id": automation_run_id
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
        automation_run_id: str = None
    ) -> str:
        """Enqueue an export task"""
        task_data = {
            "task_type": "export_job_to_google_drive",
            "job_id": job_id,
            "user_id": user_id,
            "file_type": file_type,
            "folder_id": folder_id,
            "automation_run_id": automation_run_id
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
            "user_id": user_id,
            "message_data": message_data,
            "job_id": job_id,
            "automation_run_id": automation_run_id
        }
        
        return await self._create_cloud_task(
            queue_name=self.queue_names["automation"],
            service_url=f"{self.task_services['automation']}/execute",
            task_data=task_data
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
        delay_seconds: int = 0
    ) -> str:
        """Create a Cloud Task"""
        try:
            # Create the task
            task = {
                "http_request": {
                    "http_method": tasks_v2.HttpMethod.POST,
                    "url": service_url,
                    "headers": {
                        "Content-Type": "application/json",
                    },
                    "body": json.dumps(task_data).encode(),
                    "oidc_token": {
                        "service_account_email": f"cpaautomation-runner@{self.project_id}.iam.gserviceaccount.com"
                    }
                }
            }
            
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
            
            response = self.tasks_client.create_task(request=request)
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
            
            for queue_type, queue_name in self.queue_names.items():
                try:
                    # Check if queue exists
                    self.tasks_client.get_queue(name=queue_name)
                    logger.info(f"Queue {queue_name} already exists")
                except:
                    # Create queue
                    queue = {
                        "rate_limits": {
                            "max_dispatches_per_second": 10.0,
                            "max_burst_size": 100,
                            "max_concurrent_dispatches": 50
                        },
                        "retry_config": {
                            "max_attempts": 3,
                            "max_retry_duration": "300s",
                            "min_backoff": "1s",
                            "max_backoff": "60s",
                            "max_doublings": 5
                        }
                    }
                    
                    request = tasks_v2.CreateQueueRequest(
                        parent=location_path,
                        queue=queue
                    )
                    
                    self.tasks_client.create_queue(request=request)
                    logger.info(f"Created queue: {queue_name}")
                    
        except Exception as e:
            logger.error(f"Failed to setup task queues: {e}")
            raise

# Global instance
cloud_run_task_service = CloudRunTaskService()