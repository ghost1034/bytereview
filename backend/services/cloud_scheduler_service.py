"""
Cloud Scheduler service to replace ARQ cron jobs
Manages scheduled maintenance tasks
"""
import os
import json
import logging
from typing import Dict, Any, List
from google.cloud import scheduler_v1
from google.protobuf import timestamp_pb2
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

class CloudSchedulerService:
    """Service for managing Cloud Scheduler jobs"""
    
    def __init__(self):
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT_ID", "ace-rider-383100")
        self.region = os.getenv("CLOUD_RUN_REGION", "us-central1")
        self.scheduler_client = scheduler_v1.CloudSchedulerClient()
        
        # Maintenance task service URL
        self.maintenance_service_url = f"https://task-maintenance-{self.project_id}.{self.region}.run.app/execute"
        
        # Location path for scheduler
        self.location_path = f"projects/{self.project_id}/locations/{self.region}"

    def setup_scheduled_jobs(self):
        """Set up all scheduled maintenance jobs"""
        
        # Define all scheduled jobs (matching current ARQ cron schedule)
        scheduled_jobs = [
            {
                "name": "free-user-period-reset",
                "description": "Reset billing periods for free users",
                "schedule": "30 0 * * *",  # Daily at 00:30 UTC
                "timezone": "UTC",
                "task_type": "run_free_user_period_reset"
            },
            {
                "name": "stripe-usage-reconciliation", 
                "description": "Retry failed Stripe usage reports",
                "schedule": "15 */2 * * *",  # Every 2 hours at :15
                "timezone": "UTC",
                "task_type": "run_stripe_usage_reconciliation"
            },
            {
                "name": "usage-counter-cleanup",
                "description": "Clean up old usage counters",
                "schedule": "0 2 * * 0",  # Weekly on Sundays at 02:00 UTC
                "timezone": "UTC", 
                "task_type": "run_usage_counter_cleanup"
            },
            {
                "name": "abandoned-job-cleanup",
                "description": "Clean up abandoned jobs",
                "schedule": "0 1 * * *",  # Daily at 01:00 UTC
                "timezone": "UTC",
                "task_type": "run_abandoned_cleanup"
            },
            {
                "name": "artifact-cleanup",
                "description": "Clean up old artifacts",
                "schedule": "0 3 * * *",  # Daily at 03:00 UTC
                "timezone": "UTC",
                "task_type": "run_artifact_cleanup"
            },
            {
                "name": "opt-out-data-cleanup",
                "description": "Clean up opt-out user data",
                "schedule": "0 4 * * 6",  # Weekly on Saturdays at 04:00 UTC
                "timezone": "UTC",
                "task_type": "run_opt_out_cleanup"
            },
            {
                "name": "gmail-watch-renewal", 
                "description": "Renew Gmail watch subscriptions",
                "schedule": "45 6 * * *",  # Daily at 06:45 UTC
                "timezone": "UTC",
                "task_type": "run_gmail_watch_renewal"
            }
        ]
        
        for job_config in scheduled_jobs:
            try:
                self._create_or_update_scheduled_job(job_config)
                logger.info(f"Set up scheduled job: {job_config['name']}")
            except Exception as e:
                logger.error(f"Failed to set up scheduled job {job_config['name']}: {e}")

    def _create_or_update_scheduled_job(self, job_config: Dict[str, Any]):
        """Create or update a single scheduled job"""
        
        job_name = f"{self.location_path}/jobs/cpaautomation-{job_config['name']}"
        
        # Prepare the HTTP request for the maintenance service
        http_request = {
            "uri": self.maintenance_service_url,
            "http_method": scheduler_v1.HttpMethod.POST,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "task_type": job_config["task_type"]
            }).encode(),
            "oidc_token": {
                "service_account_email": f"cpaautomation-runner@{self.project_id}.iam.gserviceaccount.com"
            }
        }
        
        # Create the job definition
        job = {
            "name": job_name,
            "description": job_config["description"],
            "schedule": job_config["schedule"],
            "time_zone": job_config["timezone"],
            "http_target": http_request,
            "retry_config": {
                "retry_count": 3,
                "max_retry_duration": "300s",
                "min_backoff_duration": "5s",
                "max_backoff_duration": "3600s",
                "max_doublings": 5
            }
        }
        
        try:
            # Try to get existing job
            self.scheduler_client.get_job(name=job_name)
            
            # Job exists, update it
            logger.info(f"Updating existing scheduled job: {job_config['name']}")
            self.scheduler_client.update_job(job=job)
            
        except Exception:
            # Job doesn't exist, create it
            logger.info(f"Creating new scheduled job: {job_config['name']}")
            request = scheduler_v1.CreateJobRequest(
                parent=self.location_path,
                job=job
            )
            self.scheduler_client.create_job(request=request)

    def trigger_manual_job(self, task_type: str) -> str:
        """Manually trigger a maintenance task (for testing/emergency use)"""
        try:
            from .cloud_run_task_service import cloud_run_task_service
            
            # Use the Cloud Run Task service to execute immediately
            task_name = cloud_run_task_service.enqueue_maintenance_task(
                task_type=task_type
            )
            
            logger.info(f"Manually triggered maintenance task: {task_type}")
            return task_name
            
        except Exception as e:
            logger.error(f"Failed to manually trigger task {task_type}: {e}")
            raise

    def pause_scheduled_job(self, job_name: str):
        """Pause a scheduled job"""
        full_job_name = f"{self.location_path}/jobs/cpaautomation-{job_name}"
        
        try:
            self.scheduler_client.pause_job(name=full_job_name)
            logger.info(f"Paused scheduled job: {job_name}")
        except Exception as e:
            logger.error(f"Failed to pause job {job_name}: {e}")
            raise

    def resume_scheduled_job(self, job_name: str):
        """Resume a paused scheduled job"""
        full_job_name = f"{self.location_path}/jobs/cpaautomation-{job_name}"
        
        try:
            self.scheduler_client.resume_job(name=full_job_name)
            logger.info(f"Resumed scheduled job: {job_name}")
        except Exception as e:
            logger.error(f"Failed to resume job {job_name}: {e}")
            raise

    def delete_scheduled_job(self, job_name: str):
        """Delete a scheduled job"""
        full_job_name = f"{self.location_path}/jobs/cpaautomation-{job_name}"
        
        try:
            self.scheduler_client.delete_job(name=full_job_name)
            logger.info(f"Deleted scheduled job: {job_name}")
        except Exception as e:
            logger.error(f"Failed to delete job {job_name}: {e}")
            raise

    def list_scheduled_jobs(self) -> List[Dict[str, Any]]:
        """List all scheduled jobs"""
        try:
            request = scheduler_v1.ListJobsRequest(parent=self.location_path)
            jobs = self.scheduler_client.list_jobs(request=request)
            
            job_list = []
            for job in jobs:
                if "cpaautomation-" in job.name:
                    job_list.append({
                        "name": job.name.split("/")[-1].replace("cpaautomation-", ""),
                        "description": job.description,
                        "schedule": job.schedule,
                        "state": job.state.name,
                        "last_attempt_time": job.last_attempt_time,
                        "next_execution_time": job.schedule_time
                    })
            
            return job_list
            
        except Exception as e:
            logger.error(f"Failed to list scheduled jobs: {e}")
            raise

# Global instance
cloud_scheduler_service = CloudSchedulerService()