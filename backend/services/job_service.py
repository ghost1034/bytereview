"""
Job service for ByteReview
Handles job lifecycle, file management, and task orchestration
"""
import os
import uuid
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from fastapi import UploadFile
from services.cloud_run_task_service import cloud_run_task_service

from models.job import (
    JobInitiateRequest, JobInitiateResponse, JobStartRequest, JobStartResponse,
    JobDetailsResponse, JobListResponse, JobProgressResponse, JobResultsResponse,
    JobStatus, ProcessingMode, FileUploadResponse, JobListItem, JobFieldInfo,
    ExtractionTaskResult, JobFileInfo, FileStatus, TaskInfo
)
from models.db_models import (
    ExtractionJob, JobRun, SourceFile, JobField, ExtractionTask, SourceFileToTask,
    ExtractionResult, Template, TemplateField
)
from core.database import db_config
from services.gcs_service import get_storage_service
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import func, update, and_, or_
from datetime import datetime
from typing import List, Optional, Dict, Any
import logging
import uuid
import os
# Removed ARQ imports - using Cloud Run Tasks instead

logger = logging.getLogger(__name__)

class JobService:
    """Service for managing extraction jobs"""
    
    def __init__(self):
        """Initialize job service"""
        self.storage_service = get_storage_service()
        logger.info("Job service initialized")

    def _get_session(self) -> Session:
        """Get database session - creates a fresh session each time"""
        return db_config.get_session()
    
    async def create_job(self, user_id: str, name: str = None) -> str:
        """Create new job with initial job run starting at upload step"""
        db = self._get_session()
        try:
            # Create extraction job
            job = ExtractionJob(
                user_id=user_id,
                name=name,
                last_active_at=datetime.utcnow()
            )
            db.add(job)
            db.flush()  # Get the job ID
            
            # Create initial job run
            initial_run = JobRun(
                job_id=job.id,
                config_step='upload',
                status='pending',
                last_active_at=datetime.utcnow()
            )
            db.add(initial_run)
            db.commit()
            
            logger.info(f"Created job {job.id} with initial run {initial_run.id}")
            return str(job.id)
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error creating job: {e}")
            raise
        finally:
            db.close()
    
    async def create_job_run(self, job_id: str, user_id: str, clone_from_run_id: str = None, template_id: str = None) -> str:
        """Create a new job run, optionally cloning configuration from an existing run"""
        db = self._get_session()
        try:
            # Verify job exists and user has access
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError("Job not found or access denied")
            
            # Create new job run
            new_run = JobRun(
                job_id=job.id,
                config_step='upload',
                status='pending',
                last_active_at=datetime.utcnow()
            )
            
            # If template_id is provided, use it
            if template_id:
                new_run.template_id = template_id
            
            db.add(new_run)
            db.flush()  # Get the run ID
            
            # Clone field configuration if requested
            if clone_from_run_id:
                source_run = db.query(JobRun).filter(
                    JobRun.id == clone_from_run_id,
                    JobRun.job_id == job.id  # Ensure same job
                ).first()
                
                if source_run:
                    # Copy template_id if not already set
                    if not new_run.template_id:
                        new_run.template_id = source_run.template_id
                    
                    # Clone job fields
                    source_fields = db.query(JobField).filter(
                        JobField.job_run_id == source_run.id
                    ).order_by(JobField.display_order).all()
                    
                    for source_field in source_fields:
                        new_field = JobField(
                            job_run_id=new_run.id,
                            field_name=source_field.field_name,
                            data_type_id=source_field.data_type_id,
                            ai_prompt=source_field.ai_prompt,
                            display_order=source_field.display_order
                        )
                        db.add(new_field)
                    
                    logger.info(f"Cloned {len(source_fields)} fields from run {clone_from_run_id} to new run {new_run.id}")
            elif not clone_from_run_id:
                # If no clone source specified, try to clone from latest run
                latest_run = self._get_latest_run_internal(db, job.id)
                if latest_run and latest_run.id != new_run.id:
                    # Copy template_id if not already set
                    if not new_run.template_id:
                        new_run.template_id = latest_run.template_id
                    
                    # Clone job fields from latest run
                    latest_fields = db.query(JobField).filter(
                        JobField.job_run_id == latest_run.id
                    ).order_by(JobField.display_order).all()
                    
                    for source_field in latest_fields:
                        new_field = JobField(
                            job_run_id=new_run.id,
                            field_name=source_field.field_name,
                            data_type_id=source_field.data_type_id,
                            ai_prompt=source_field.ai_prompt,
                            display_order=source_field.display_order
                        )
                        db.add(new_field)
                    
                    logger.info(f"Auto-cloned {len(latest_fields)} fields from latest run to new run {new_run.id}")
            
            db.commit()
            logger.info(f"Created new job run {new_run.id} for job {job_id}")
            return str(new_run.id)
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error creating job run: {e}")
            raise
        finally:
            db.close()
    
    def get_latest_run(self, job_id: str, user_id: str) -> Optional[JobRun]:
        """Get the latest job run for a job"""
        db = self._get_session()
        try:
            # Verify job access first
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                return None
            
            return self._get_latest_run_internal(db, job.id)
        finally:
            db.close()
    
    def _get_latest_run_internal(self, db: Session, job_id: str) -> Optional[JobRun]:
        """Internal helper to get latest run (requires active db session)"""
        return db.query(JobRun).filter(
            JobRun.job_id == job_id
        ).order_by(JobRun.created_at.desc()).first()
    
    def get_job_run(self, job_id: str, run_id: str, user_id: str) -> Optional[JobRun]:
        """Get a specific job run"""
        db = self._get_session()
        try:
            # Verify job access and get run
            run = db.query(JobRun).join(ExtractionJob).filter(
                JobRun.id == run_id,
                JobRun.job_id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            return run
        finally:
            db.close()
    
    def get_job_runs(self, job_id: str, user_id: str) -> List[JobRun]:
        """Get all job runs for a job, ordered by creation date (newest first)"""
        db = self._get_session()
        try:
            # Verify job access first
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                return []
            
            return db.query(JobRun).filter(
                JobRun.job_id == job.id
            ).order_by(JobRun.created_at.desc()).all()
        finally:
            db.close()

    async def advance_config_step(self, job_id: str, user_id: str, next_step: str, run_id: str = None):
        """Advance wizard step for a job run (defaults to latest run)"""
        db = self._get_session()
        try:
            # Get the target run (latest if not specified)
            if run_id:
                target_run = self.get_job_run(job_id, run_id, user_id)
            else:
                target_run = self.get_latest_run(job_id, user_id)
            
            if not target_run:
                raise ValueError("Job run not found or access denied")
            
            # Update the run's config step
            db.execute(
                update(JobRun)
                .where(JobRun.id == target_run.id)
                .values(
                    config_step=next_step,
                    last_active_at=datetime.utcnow()
                )
            )
            
            # Also update the parent job's last_active_at
            db.execute(
                update(ExtractionJob)
                .where(ExtractionJob.id == job_id)
                .values(last_active_at=datetime.utcnow())
            )
            
            db.commit()
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error advancing config step: {e}")
            raise
        finally:
            db.close()
    
    async def submit_manual_job(self, job_id: str, user_id: str, run_id: str = None) -> str:
        """Submit manually configured job run for processing"""
        logger.info(f"submit_manual_job called for job {job_id} by user {user_id}, run_id={run_id}")
        db = self._get_session()
        try:
            # Get the target run (latest if not specified)
            if run_id:
                target_run = self.get_job_run(job_id, run_id, user_id)
            else:
                target_run = self.get_latest_run(job_id, user_id)
            
            if not target_run:
                raise ValueError("Job run not found")
            
            # Manual job specific validations
            if target_run.config_step == 'submitted':
                raise ValueError("Job run already submitted")
            
            # Check if run is already running
            if target_run.status == 'in_progress':
                raise ValueError("Job run already in progress")
            
            # Delete any completed extraction tasks to allow re-running
            completed_tasks_deleted = db.query(ExtractionTask).filter(
                ExtractionTask.job_run_id == target_run.id,
                ExtractionTask.status == 'completed'
            ).delete()
            
            if completed_tasks_deleted > 0:
                logger.info(f"Deleted {completed_tasks_deleted} completed extraction tasks for run {target_run.id}")
            
            # Validate remaining configured tasks
            total_tasks = db.query(ExtractionTask).filter(
                ExtractionTask.job_run_id == target_run.id
            ).count()
            
            if total_tasks == 0:
                raise ValueError("No extraction tasks found. Please configure processing modes first.")
            
            # Check plan limits before starting job
            await self._check_job_run_plan_limits(db, target_run.id, user_id)
            
            # Update run for processing
            db.execute(
                update(JobRun)
                .where(JobRun.id == target_run.id)
                .values(
                    config_step='submitted',
                    status='in_progress',
                    tasks_total=total_tasks,
                    tasks_completed=0,
                    tasks_failed=0,
                    last_active_at=datetime.utcnow()
                )
            )
            
            # Update parent job last_active_at
            db.execute(
                update(ExtractionJob)
                .where(ExtractionJob.id == job_id)
                .values(last_active_at=datetime.utcnow())
            )
            
            db.commit()
            
            # Enqueue extraction tasks for processing
            await self._enqueue_extraction_tasks_for_processing(target_run.id)
            
            logger.info(f"Submitted manual job run {target_run.id} with {total_tasks} extraction tasks")
            return str(target_run.id)
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error submitting manual job: {e}")
            raise
        finally:
            db.close()

    async def submit_automation_job_run(self, job_run_id: str, user_id: str, automation_run_id: str) -> str:
        """Submit automation-triggered job run for processing"""
        logger.info(f"submit_automation_job_run called for job run {job_run_id} by user {user_id}, automation_run_id={automation_run_id}")
        db = self._get_session()
        try:
            # Get the job run and verify access
            job_run = db.query(JobRun).join(ExtractionJob).filter(
                JobRun.id == job_run_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job_run:
                raise ValueError("Job run not found or access denied")
            
            # Check if run is already running
            if job_run.status == 'in_progress':
                logger.warning(f"Job run {job_run_id} already in progress")
                from services.automation_service import automation_service
                await automation_service.update_automation_run_status(
                    db, automation_run_id, 'failed', 'Job run already in progress'
                )
                raise ValueError("Job run already in progress")
            
            # Create extraction tasks for all imported files in this job run
            await self._create_extraction_tasks_for_automation_run(db, job_run_id)
            
            # Count tasks after creation
            total_tasks = db.query(ExtractionTask).filter(
                ExtractionTask.job_run_id == job_run_id
            ).count()
            
            if total_tasks == 0:
                raise ValueError("No tasks available for processing")
            
            # Check plan limits before starting job run
            await self._check_job_run_plan_limits(db, job_run_id, user_id)
            
            # Update job run for processing
            db.execute(
                update(JobRun)
                .where(JobRun.id == job_run_id)
                .values(
                    config_step='submitted',
                    status='in_progress',
                    tasks_total=total_tasks,
                    tasks_completed=0,
                    tasks_failed=0,
                    last_active_at=datetime.utcnow()
                )
            )
            
            # Update parent job's last_active_at
            db.execute(
                update(ExtractionJob)
                .where(ExtractionJob.id == job_run.job_id)
                .values(last_active_at=datetime.utcnow())
            )
            
            db.commit()
            
            # Update automation run status
            from services.automation_service import automation_service
            await automation_service.update_automation_run_status(
                db, automation_run_id, 'running'
            )
            
            # Enqueue extraction tasks for processing
            await self._enqueue_extraction_tasks_for_processing(job_run_id, automation_run_id)
            
            logger.info(f"Submitted automation job run {job_run_id} with {total_tasks} extraction tasks")
            return job_run_id
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error submitting automation job run: {e}")
            
            # Update automation run status on failure
            try:
                from services.automation_service import automation_service
                await automation_service.update_automation_run_status(
                    db, automation_run_id, 'failed', str(e)
                )
            except Exception as status_error:
                logger.error(f"Failed to update automation run status: {status_error}")
            
            raise
        finally:
            db.close()



    async def _create_extraction_tasks_for_automation_run(self, db: Session, job_run_id: str) -> None:
        """Create extraction tasks for all imported files in an automation job run"""
        from models.db_models import Automation, AutomationRun
        
        # Get the automation run and related automation to determine processing mode
        automation_run = db.query(AutomationRun).filter(AutomationRun.job_run_id == job_run_id).first()
        if not automation_run:
            logger.error(f"No automation run found for job run {job_run_id}")
            return
            
        automation = db.query(Automation).filter(Automation.id == automation_run.automation_id).first()
        if not automation:
            logger.error(f"No automation found for automation run {automation_run.id}")
            return
        
        processing_mode = automation.processing_mode
        logger.info(f"Creating extraction tasks for job run {job_run_id} with processing mode: {processing_mode}")
        
        # Get all source files for this job run
        source_files_query = db.query(SourceFile).filter(SourceFile.job_run_id == job_run_id)
        
        # Filter to processable files only using existing method
        processable_files_query = self._filter_processable_files(source_files_query)
        processable_files = processable_files_query.all()
        
        if not processable_files:
            logger.info(f"No processable source files found for job run {job_run_id}")
            return
        
        import uuid
        from models.db_models import ExtractionTask, SourceFileToTask
        
        tasks_created = 0
        
        if processing_mode == 'individual':
            # Create one task per file
            for source_file in processable_files:
                extraction_task = ExtractionTask(
                    id=str(uuid.uuid4()),
                    job_run_id=job_run_id,
                    processing_mode='individual',
                    status='pending'
                )
                db.add(extraction_task)
                db.flush()  # Get ID
                
                # Create the many-to-many relationship
                source_file_to_task = SourceFileToTask(
                    source_file_id=source_file.id,
                    task_id=extraction_task.id
                )
                db.add(source_file_to_task)
                
                tasks_created += 1
                logger.info(f"Created individual extraction task {extraction_task.id} for file {source_file.original_filename}")
        
        elif processing_mode == 'combined':
            # Group files by their folder paths and create combined tasks
            files_by_folder = self._group_files_by_folder(processable_files)
            
            logger.info(f"Grouped {len(processable_files)} files into {len(files_by_folder)} folders: {list(files_by_folder.keys())}")
            
            # Create one task per folder
            for folder_path, folder_files in files_by_folder.items():
                extraction_task = ExtractionTask(
                    id=str(uuid.uuid4()),
                    job_run_id=job_run_id,
                    processing_mode='combined',
                    status='pending'
                )
                db.add(extraction_task)
                db.flush()  # Get ID
                
                # Link all files in this folder to the task
                for file in folder_files:
                    source_file_to_task = SourceFileToTask(
                        source_file_id=file.id,
                        task_id=extraction_task.id
                    )
                    db.add(source_file_to_task)
                
                tasks_created += 1
                logger.info(f"Created combined extraction task {extraction_task.id} for folder '{folder_path}' with {len(folder_files)} files")
        
        db.commit()
        logger.info(f"Created {tasks_created} extraction tasks for job run {job_run_id} using {processing_mode} mode")

    def _group_files_by_folder(self, source_files: List) -> Dict[str, List]:
        """
        Group source files by their folder paths
        Returns a dictionary mapping folder paths to lists of files
        """
        files_by_folder = {}
        for file in source_files:
            folder_path = self._get_folder_path(file.original_path)
            if folder_path not in files_by_folder:
                files_by_folder[folder_path] = []
            files_by_folder[folder_path].append(file)
        return files_by_folder

    async def _check_job_run_plan_limits(self, db: Session, run_id: str, user_id: str) -> None:
        """Check if starting this job run would exceed plan limits"""
        try:
            from services.billing_service import get_billing_service
            from models.db_models import SourceFileToTask
            
            # Calculate total pages for this job run (only files with page_count set)
            total_pages = db.query(func.sum(SourceFile.page_count)).join(
                SourceFileToTask, SourceFile.id == SourceFileToTask.source_file_id
            ).join(
                ExtractionTask, SourceFileToTask.task_id == ExtractionTask.id
            ).filter(
                ExtractionTask.job_run_id == run_id,
                SourceFile.page_count.isnot(None)
            ).scalar() or 0
            
            if total_pages <= 0:
                logger.info(f"No pages to process for job run {run_id}")
                return
            
            # Check limits through billing service
            billing_service = get_billing_service(db)
            can_process = billing_service.check_page_limit(user_id, total_pages)
            
            if not can_process:
                billing_info = billing_service.get_billing_info(user_id)
                plan_name = billing_info['plan_display_name']
                pages_used = billing_info['pages_used']
                pages_included = billing_info['pages_included']
                pages_remaining = max(0, pages_included - pages_used)
                
                if billing_info['plan_code'] == 'free':
                    raise ValueError(
                        f"Cannot start job: Processing {total_pages} pages would exceed your {plan_name} plan limit. "
                        f"You have {pages_remaining} pages remaining out of {pages_included}. "
                        f"Please upgrade your plan or reduce the number of files."
                    )
                else:
                    # For paid plans, this shouldn't happen since they allow overage
                    logger.warning(f"Paid user {user_id} hitting page limit check - this shouldn't normally happen")
            
            logger.info(f"Job run {run_id} plan limits check passed: {total_pages} pages for user {user_id}")
            
        except ValueError:
            # Re-raise plan limit errors
            raise
        except Exception as e:
            logger.error(f"Error checking job run plan limits for run {run_id}: {e}")
            # Default to allowing processing if we can't check limits
            logger.warning("Allowing job to start due to limit check failure")

    async def _enqueue_extraction_tasks_for_processing(self, run_id: str, automation_run_id: str = None) -> None:
        """Enqueue extraction tasks for background processing"""
        try:
            # Get all pending tasks for this job run
            db = self._get_session()
            try:
                tasks = db.query(ExtractionTask).filter(
                    ExtractionTask.job_run_id == run_id,
                    ExtractionTask.status == 'pending'
                ).all()
                
                logger.info(f"Found {len(tasks)} pending extraction tasks for job run {run_id}")
                
                # Enqueue each task using Cloud Run Tasks
                for task in tasks:
                    task_name = await cloud_run_task_service.enqueue_extraction_task(
                        task_id=str(task.id),
                        automation_run_id=automation_run_id
                    )
                    logger.info(f"Enqueued extraction task {task.id} as {task_name}")
                
                logger.info(f"Enqueued {len(tasks)} extraction tasks for job run {run_id}")
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Failed to enqueue tasks for job run {run_id}: {e}")
            # Don't raise - job run is still valid, tasks can be retried later
    
    async def increment_task_completion(self, run_id: str, success: bool = True, automation_run_id: str = None):
        """Atomically update task progress from workers for a specific job run"""
        db = self._get_session()
        try:
            if success:
                db.execute(
                    update(JobRun)
                    .where(JobRun.id == run_id)
                    .values(
                        tasks_completed=JobRun.tasks_completed + 1,
                        last_active_at=datetime.utcnow()
                    )
                )
            else:
                db.execute(
                    update(JobRun)
                    .where(JobRun.id == run_id)
                    .values(
                        tasks_failed=JobRun.tasks_failed + 1,
                        last_active_at=datetime.utcnow()
                    )
                )
            
            # Check if job run is complete and send SSE events
            job_run = db.query(JobRun).filter(JobRun.id == run_id).first()
            if job_run and job_run.tasks_completed + job_run.tasks_failed >= job_run.tasks_total:
                final_status = 'completed' if job_run.tasks_failed == 0 else 'partially_completed'
                db.execute(
                    update(JobRun)
                    .where(JobRun.id == run_id)
                    .values(
                        status=final_status,
                        completed_at=datetime.utcnow() if final_status == 'completed' else None
                    )
                )
                
                # Update parent job's last_active_at
                db.execute(
                    update(ExtractionJob)
                    .where(ExtractionJob.id == job_run.job_id)
                    .values(last_active_at=datetime.utcnow())
                )
                
                # Send job completion SSE event
                try:
                    from services.sse_service import sse_manager
                    await sse_manager.send_job_completed(str(job_run.job_id))
                    logger.info(f"Job run {run_id} completed - sent SSE event")
                except Exception as e:
                    logger.warning(f"Failed to send job_run_completed SSE event: {e}")
                
                # Handle automation completion and exports when job run finishes
                if final_status == 'completed':
                    try:
                        # Check if this job run completion should trigger automation exports
                        await self._trigger_automation_exports_if_needed(db, str(job_run.job_id), automation_run_id)
                        # Then complete automation runs (this will be handled by export completion)
                    except Exception as e:
                        logger.error(f"Failed to handle automation completion for job run {run_id}: {e}")
            
            db.commit()
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error updating task progress: {e}")
            raise
        finally:
            db.close()
    
    async def _complete_automation_runs_for_job_run(self, db: Session, job_run_id: str):
        """
        Mark all running automation runs as completed when a job run finishes
        This is called from increment_task_completion when all tasks are done
        """
        from models.db_models import AutomationRun
        
        # Find all running automation runs for this job run
        running_automation_runs = db.query(AutomationRun).filter(
            AutomationRun.job_run_id == job_run_id,
            AutomationRun.status == 'running'
        ).all()
        
        if not running_automation_runs:
            logger.info(f"No running automation runs found for completed job run {job_run_id}")
            return
        
        # Mark all running automation runs as completed
        from services.automation_service import automation_service
        for automation_run in running_automation_runs:
            await automation_service.update_automation_run_status(
                db, str(automation_run.id), 'completed'
            )
            logger.info(f"Marked automation run {automation_run.id} as completed (job run {job_run_id} finished)")
        
        logger.info(f"Completed {len(running_automation_runs)} automation runs for job run {job_run_id}")
    
    async def _trigger_automation_exports_if_needed(self, db: Session, job_id: str, automation_run_id: str = None):
        """
        Check if job completion should trigger automation exports
        """
        from models.db_models import AutomationRun, Automation
        
        try:
            if automation_run_id:
                # We have a specific automation run ID - use it directly
                automation_run = db.query(AutomationRun).join(
                    Automation, AutomationRun.automation_id == Automation.id
                ).filter(
                    AutomationRun.id == automation_run_id,
                    AutomationRun.status == 'running'
                ).first()
                
                if not automation_run:
                    logger.warning(f"Automation run {automation_run_id} not found or not running")
                    return
                
                automation = automation_run.automation
                
                # Check if export is configured
                if automation.dest_type:
                    logger.info(f"Triggering export for automation run {automation_run.id} to {automation.dest_type}")
                    
                    # Enqueue export based on destination type
                    if automation.dest_type == 'gdrive':
                        await self._enqueue_drive_export(automation_run, automation)
                    else:
                        logger.warning(f"Unsupported export destination: {automation.dest_type}")
                        # Mark as completed if export type not supported
                        from services.automation_service import automation_service
                        await automation_service.update_automation_run_status(
                            db, str(automation_run.id), 'completed'
                        )
                else:
                    # No export configured, mark as completed
                    from services.automation_service import automation_service
                    await automation_service.update_automation_run_status(
                        db, str(automation_run.id), 'completed'
                    )
                    logger.info(f"No export configured for automation run {automation_run.id}, marked as completed")
                    
            else:
                # Fallback: Find running automation runs for this job (for manual jobs or legacy)
                # Note: This uses job_id for legacy compatibility, but in practice automation_run_id should always be provided
                automation_runs = db.query(AutomationRun).join(
                    Automation, AutomationRun.automation_id == Automation.id
                ).join(
                    JobRun, AutomationRun.job_run_id == JobRun.id
                ).filter(
                    JobRun.job_id == job_id,
                    AutomationRun.status == 'running',
                    Automation.dest_type.isnot(None)  # Has export destination configured
                ).all()
                
                if not automation_runs:
                    logger.info(f"No running automation runs with exports found for job {job_id}")
                    # If no exports needed, complete automation runs normally - need to find job runs
                    job_runs = db.query(JobRun).filter(JobRun.job_id == job_id).all()
                    for job_run in job_runs:
                        await self._complete_automation_runs_for_job_run(db, str(job_run.id))
                    return
                
                for automation_run in automation_runs:
                    automation = automation_run.automation
                    logger.info(f"Triggering export for automation run {automation_run.id} to {automation.dest_type}")
                    
                    # Enqueue export based on destination type
                    if automation.dest_type == 'gdrive':
                        await self._enqueue_drive_export(automation_run, automation)
                    else:
                        logger.warning(f"Unsupported export destination: {automation.dest_type}")
                        # Mark as completed if export type not supported
                        from services.automation_service import automation_service
                        await automation_service.update_automation_run_status(
                            db, str(automation_run.id), 'completed'
                        )
                    
        except Exception as e:
            logger.error(f"Failed to trigger automation exports for job {job_id}: {e}")
            # Don't re-raise - export failure shouldn't break job completion
            if automation_run_id:
                # Mark specific automation run as failed
                from services.automation_service import automation_service
                await automation_service.update_automation_run_status(
                    db, automation_run_id, 'failed', f'Export trigger failed: {str(e)}'
                )
            else:
                # Complete automation runs normally as fallback - need to find job runs
                job_runs = db.query(JobRun).filter(JobRun.job_id == job_id).all()
                for job_run in job_runs:
                    await self._complete_automation_runs_for_job_run(db, str(job_run.id))
    
    async def _enqueue_drive_export(self, automation_run, automation):
        """
        Enqueue Google Drive export for an automation run
        """
        try:
            # Get export configuration (default to CSV for now)
            export_config = automation.export_config or {}
            file_type = export_config.get('file_type', 'csv')
            folder_id = export_config.get('folder_id')
            
            # Enqueue export using Cloud Run Tasks
            task_name = await cloud_run_task_service.enqueue_export_task(
                job_id=automation.job_id,
                user_id=automation.user_id,
                file_type=file_type,
                folder_id=folder_id,
                automation_run_id=str(automation_run.id)
            )
            
            logger.info(f"Enqueued Google Drive export for automation run {automation_run.id} as {task_name}")
            
        except Exception as e:
            logger.error(f"Failed to enqueue Drive export for automation run {automation_run.id}: {e}")
            # Mark automation run as failed
            from services.automation_service import automation_service
            await automation_service.update_automation_run_status(
                db, str(automation_run.id), 'failed', f'Export enqueue failed: {str(e)}'
            )
    
    
    def get_resumable_jobs(self, user_id: str) -> list[ExtractionJob]:
        """Get all jobs user can resume based on latest run status"""
        db = self._get_session()
        try:
            # Create subquery for latest run per job
            latest_runs_subquery = db.query(
                JobRun.job_id,
                func.max(JobRun.created_at).label('latest_created_at')
            ).group_by(JobRun.job_id).subquery()
            
            # Get jobs where latest run is resumable
            return db.query(ExtractionJob).join(
                latest_runs_subquery, ExtractionJob.id == latest_runs_subquery.c.job_id
            ).join(
                JobRun, and_(
                    JobRun.job_id == ExtractionJob.id,
                    JobRun.created_at == latest_runs_subquery.c.latest_created_at
                )
            ).filter(
                ExtractionJob.user_id == user_id,
                or_(
                    # Wizard not complete
                    JobRun.config_step != 'submitted',
                    # Processing incomplete/failed with remaining tasks
                    and_(
                        JobRun.status.in_(['in_progress', 'partially_completed', 'failed']),
                        JobRun.tasks_completed < JobRun.tasks_total
                    )
                )
            ).order_by(ExtractionJob.last_active_at.desc()).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting resumable jobs: {e}")
            raise
        finally:
            db.close()
    
    def get_active_jobs(self, user_id: str) -> list[ExtractionJob]:
        """Get completed or fully processed jobs based on latest run status"""
        db = self._get_session()
        try:
            # Create subquery for latest run per job
            latest_runs_subquery = db.query(
                JobRun.job_id,
                func.max(JobRun.created_at).label('latest_created_at')
            ).group_by(JobRun.job_id).subquery()
            
            # Get jobs where latest run is completed/active
            return db.query(ExtractionJob).join(
                latest_runs_subquery, ExtractionJob.id == latest_runs_subquery.c.job_id
            ).join(
                JobRun, and_(
                    JobRun.job_id == ExtractionJob.id,
                    JobRun.created_at == latest_runs_subquery.c.latest_created_at
                )
            ).filter(
                ExtractionJob.user_id == user_id,
                JobRun.config_step == 'submitted',
                or_(
                    JobRun.status.in_(['completed', 'cancelled']),
                    and_(
                        JobRun.status == 'in_progress',
                        JobRun.tasks_completed >= JobRun.tasks_total
                    )
                )
            ).order_by(ExtractionJob.created_at.desc()).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting active jobs: {e}")
            raise
        finally:
            db.close()
    
    async def cleanup_old_jobs(self):
        """Mark old job runs for deletion instead of immediate delete"""
        db = self._get_session()
        try:
            thirty_days_ago = datetime.utcnow() - timedelta(days=30)
            
            # Mark abandoned wizard job runs as cancelled
            db.execute(
                update(JobRun)
                .where(
                    JobRun.config_step != 'submitted',
                    JobRun.last_active_at < thirty_days_ago,
                    JobRun.status != 'cancelled'
                )
                .values(
                    status='cancelled',
                    persist_data=False  # Mark for physical deletion
                )
            )
            
            # Also update parent jobs' last_active_at for cleanup tracking
            db.execute(
                update(ExtractionJob)
                .where(
                    ExtractionJob.id.in_(
                        db.query(JobRun.job_id).filter(
                            JobRun.config_step != 'submitted',
                            JobRun.last_active_at < thirty_days_ago,
                            JobRun.status == 'cancelled'
                        )
                    )
                )
                .values(last_active_at=datetime.utcnow())
            )
            
            db.commit()
            logger.info("Marked old job runs for cleanup")
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error during job run cleanup: {e}")
            raise
        finally:
            db.close()
    
    async def broadcast_workflow_progress(self, job_id: str, user_id: str, run_id: str = None):
        """Broadcast workflow progress update via SSE for latest job run"""
        try:
            from services.sse_service import sse_manager
            
            # Get current job run state
            db = self._get_session()
            try:
                # Get the target run (latest if not specified)
                if run_id:
                    target_run = self.get_job_run(job_id, run_id, user_id)
                else:
                    target_run = self.get_latest_run(job_id, user_id)
                
                if target_run:
                    await sse_manager.send_workflow_progress(job_id, {
                        'config_step': target_run.config_step,
                        'status': target_run.status,
                        'progress_percentage': target_run.progress_percentage,
                        'tasks_completed': target_run.tasks_completed,
                        'tasks_total': target_run.tasks_total,
                        'tasks_failed': target_run.tasks_failed,
                        'is_resumable': target_run.is_resumable,
                        'last_active_at': target_run.last_active_at.isoformat(),
                        'run_id': str(target_run.id)
                    })
            finally:
                db.close()
                
        except Exception as e:
            logger.warning(f"Failed to broadcast workflow progress for job {job_id}: {e}")
    
    async def cancel_job(self, job_id: str, user_id: str, run_id: str = None):
        """Cancel job run (soft delete)"""
        db = self._get_session()
        try:
            # Get the target run (latest if not specified)
            if run_id:
                target_run = self.get_job_run(job_id, run_id, user_id)
            else:
                target_run = self.get_latest_run(job_id, user_id)
            
            if not target_run:
                raise ValueError("Job run not found or access denied")
            
            # Cancel the job run
            db.execute(
                update(JobRun)
                .where(JobRun.id == target_run.id)
                .values(
                    status='cancelled',
                    last_active_at=datetime.utcnow()
                )
            )
            
            # Update parent job's last_active_at
            db.execute(
                update(ExtractionJob)
                .where(ExtractionJob.id == job_id)
                .values(last_active_at=datetime.utcnow())
            )
            
            db.commit()
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error cancelling job run: {e}")
            raise
        finally:
            db.close()

    def _normalize_path(self, path: str) -> str:
        """Normalize file path for consistent storage"""
        # Replace backslashes with forward slashes and remove leading/trailing slashes
        normalized = path.replace('\\', '/').strip('/')
        return normalized
    
    def _get_folder_path(self, file_path: str) -> str:
        """Extract folder path from file path consistently across all methods"""
        return os.path.dirname(file_path) or "/"

    def _filter_processable_files(self, query, allow_null_files=False):
        """Filter out archive files that are only used for unpacking, not data extraction"""
        filter_condition = ~SourceFile.file_type.in_([
            'application/zip', 
            'application/x-zip-compressed',
            'application/x-7z-compressed',
            'application/x-rar-compressed'
        ])
        
        if allow_null_files:
            # For job listing where we want to include jobs with no files
            filter_condition = (SourceFile.id.is_(None)) | filter_condition
            
        return query.filter(filter_condition)

    async def initiate_job(self, user_id: str, request: JobInitiateRequest) -> JobInitiateResponse:
        """
        Step 1: Initiate a new job and generate pre-signed upload URLs
        """
        db = self._get_session()
        try:
            # Create extraction job
            job = ExtractionJob(
                user_id=user_id,
                name=request.name  # Set the job name from request
            )
            db.add(job)
            db.flush()  # Get the job ID
            
            # Create initial job run
            initial_run = JobRun(
                job_id=job.id,
                status='pending',  # Start with pending status
                config_step='upload'  # Start at upload step
            )
            db.add(initial_run)
            db.flush()  # Get the run ID
            
            job_id = str(job.id)
            upload_responses = []
            
            # Process each file and create database records
            for file_info in request.files:
                # Normalize the path
                normalized_path = self._normalize_path(file_info.path)
                
                # Generate unique GCS object name
                file_extension = os.path.splitext(file_info.filename)[1]
                gcs_object_name = f"jobs/{job_id}/{uuid.uuid4()}{file_extension}"
                
                # Create source file record
                source_file = SourceFile(
                    job_run_id=initial_run.id,
                    original_filename=file_info.filename,
                    original_path=normalized_path,
                    gcs_object_name=gcs_object_name,
                    file_type=file_info.type,
                    file_size_bytes=file_info.size,
                    status=FileStatus.UPLOADING.value
                )
                db.add(source_file)
                
                # Generate pre-signed upload URL
                upload_url = await self.storage_service.generate_presigned_put_url(gcs_object_name)
                
                upload_responses.append(FileUploadResponse(
                    original_path=normalized_path,
                    upload_url=upload_url
                ))
                
                # Note: Page counting will happen when files are actually uploaded via the upload URL
                # The page_count field will be updated in a separate process or webhook
            
            db.commit()
            logger.info(f"Initiated job {job_id} with {len(request.files)} files")
            
            return JobInitiateResponse(
                job_id=job_id,
                files=upload_responses
            )
            
        except Exception as e:
            logger.error(f"Failed to initiate job: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    async def _create_extraction_tasks(self, db: Session, job_run_id: uuid.UUID, task_definitions: List) -> None:
        """Create extraction tasks based on task definitions for a job run"""
        # Get all source files for this job run
        source_files = db.query(SourceFile).filter(SourceFile.job_run_id == job_run_id).all()
        
        # Group files by their folder paths using shared logic
        files_by_path = self._group_files_by_folder(source_files)
        
        # Create tasks based on definitions
        for task_def in task_definitions:
            target_path = self._normalize_path(task_def.path)
            
            # Find files that match this path
            matching_files = []
            for folder_path, files in files_by_path.items():
                if folder_path == target_path or folder_path.startswith(target_path + "/"):
                    matching_files.extend(files)
            
            if not matching_files:
                logger.warning(f"No files found for task definition path: {target_path}")
                continue
            
            if task_def.mode == ProcessingMode.INDIVIDUAL:
                # Create one task per file
                for file in matching_files:
                    task = ExtractionTask(
                        job_run_id=job_run_id,
                        processing_mode=task_def.mode.value,
                        status='pending'
                    )
                    db.add(task)
                    db.flush()  # Get task ID
                    
                    # Link file to task
                    file_to_task = SourceFileToTask(
                        source_file_id=file.id,
                        task_id=task.id
                    )
                    db.add(file_to_task)
                    
            elif task_def.mode == ProcessingMode.COMBINED:
                # Create one task for all files in this path
                task = ExtractionTask(
                    job_run_id=job_run_id,
                    processing_mode=task_def.mode.value,
                    status='pending'
                )
                db.add(task)
                db.flush()  # Get task ID
                
                # Link all files to this task
                for file in matching_files:
                    file_to_task = SourceFileToTask(
                        source_file_id=file.id,
                        task_id=task.id
                    )
                    db.add(file_to_task)

    async def _enqueue_extraction_tasks(self, job_run_id: uuid.UUID) -> None:
        """Enqueue extraction tasks for background processing"""
        try:
            # Get all pending tasks for this job run
            db = self._get_session()
            try:
                tasks = db.query(ExtractionTask).filter(
                    ExtractionTask.job_run_id == job_run_id,
                    ExtractionTask.status == 'pending'
                ).all()
                
                # Enqueue each task using Cloud Run Tasks
                for task in tasks:
                    task_name = await cloud_run_task_service.enqueue_extraction_task(
                        task_id=str(task.id)
                    )
                    logger.info(f"Enqueued extraction task {task.id} as {task_name}")
                
                logger.info(f"Enqueued {len(tasks)} extraction tasks for job run {job_run_id}")
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Failed to enqueue tasks for job run {job_run_id}: {e}")
            # Don't raise - job run is still valid, tasks can be retried later
            
    async def get_job_details(self, user_id: str, job_id: str, run_id: str = None) -> JobDetailsResponse:
        """Get detailed job run information"""
        db = self._get_session()
        try:
            # Get the target run (latest if not specified)
            if run_id:
                target_run = self.get_job_run(job_id, run_id, user_id)
            else:
                target_run = self.get_latest_run(job_id, user_id)
            
            if not target_run:
                raise ValueError(f"Job run not found")
            
            # Get job fields for this run
            job_fields = db.query(JobField).filter(
                JobField.job_run_id == target_run.id
            ).order_by(JobField.display_order).all()
            
            field_info = [
                JobFieldInfo(
                    field_name=field.field_name,
                    data_type_id=field.data_type_id,
                    ai_prompt=field.ai_prompt,
                    display_order=field.display_order
                )
                for field in job_fields
            ]
            
            # Get extraction tasks for processing mode display
            extraction_tasks = db.query(ExtractionTask).filter(
                ExtractionTask.job_run_id == target_run.id
            ).all()
            
            # Build task definitions by grouping files by folder and processing mode
            # This is much cleaner than creating individual task definitions and then aggregating
            folder_mode_files = {}
            
            for task in extraction_tasks:
                # Get files associated with this task
                task_files = db.query(SourceFileToTask, SourceFile).join(
                    SourceFile, SourceFileToTask.source_file_id == SourceFile.id
                ).filter(SourceFileToTask.task_id == task.id).all()
                
                if task_files:
                    # Use the folder path from the first file
                    first_file = task_files[0][1]  # SourceFile object
                    folder_path = self._get_folder_path(first_file.original_path)
                    
                    key = (folder_path, task.processing_mode)
                    if key not in folder_mode_files:
                        folder_mode_files[key] = 0
                    folder_mode_files[key] += len(task_files)
            
            # Convert to task definitions format
            unique_task_definitions = [
                {
                    'path': folder_path,
                    'mode': processing_mode,
                    'file_count': file_count
                }
                for (folder_path, processing_mode), file_count in folder_mode_files.items()
            ]
            
            # Get parent job for name and creation date
            parent_job = db.query(ExtractionJob).filter(ExtractionJob.id == target_run.job_id).first()
            
            return JobDetailsResponse(
                id=str(target_run.job_id),  # Return job ID for API compatibility
                name=parent_job.name if parent_job else None,
                status=JobStatus(target_run.status),
                persist_data=target_run.persist_data,
                created_at=target_run.created_at,
                completed_at=target_run.completed_at,
                job_fields=field_info,
                template_id=str(target_run.template_id) if target_run.template_id else None,
                extraction_tasks=unique_task_definitions
            )
            
        except Exception as e:
            logger.error(f"Failed to get job details for {job_id}: {e}")
            raise
        finally:
            db.close()

    async def list_user_jobs(self, user_id: str, limit: int = 25, offset: int = 0, include_field_status: bool = False) -> JobListResponse:
        """List jobs for a user with pagination, showing latest run status"""
        db = self._get_session()
        try:
            # Get total count
            total = db.query(ExtractionJob).filter(ExtractionJob.user_id == user_id).count()
            
            # Create subquery for latest run per job
            latest_runs_subquery = db.query(
                JobRun.job_id,
                func.max(JobRun.created_at).label('latest_created_at')
            ).group_by(JobRun.job_id).subquery()
            
            if include_field_status:
                # Get jobs with latest run data and field counts
                jobs_query = db.query(
                    ExtractionJob,
                    JobRun.status.label('latest_status'),
                    JobRun.config_step.label('latest_config_step'),
                    func.count(JobField.id).label('field_count')
                ).join(
                    latest_runs_subquery, ExtractionJob.id == latest_runs_subquery.c.job_id
                ).join(
                    JobRun, and_(
                        JobRun.job_id == ExtractionJob.id,
                        JobRun.created_at == latest_runs_subquery.c.latest_created_at
                    )
                ).outerjoin(JobField, JobField.job_run_id == JobRun.id).filter(
                    ExtractionJob.user_id == user_id
                ).group_by(
                    ExtractionJob.id, JobRun.status, JobRun.config_step
                ).order_by(
                    ExtractionJob.created_at.desc()
                ).limit(limit).offset(offset)
                
                jobs_with_counts = jobs_query.all()
                
                job_items = [
                    JobListItem(
                        id=str(job.id),
                        name=job.name,
                        status=JobStatus(latest_status),
                        config_step=latest_config_step,
                        created_at=job.created_at,
                        has_configured_fields=(field_count or 0) > 0
                    )
                    for job, latest_status, latest_config_step, field_count in jobs_with_counts
                ]
            else:
                # Get jobs with latest run data only
                jobs_query = db.query(
                    ExtractionJob,
                    JobRun.status.label('latest_status'),
                    JobRun.config_step.label('latest_config_step')
                ).join(
                    latest_runs_subquery, ExtractionJob.id == latest_runs_subquery.c.job_id
                ).join(
                    JobRun, and_(
                        JobRun.job_id == ExtractionJob.id,
                        JobRun.created_at == latest_runs_subquery.c.latest_created_at
                    )
                ).filter(
                    ExtractionJob.user_id == user_id
                ).order_by(
                    ExtractionJob.created_at.desc()
                ).limit(limit).offset(offset)
                
                jobs_with_runs = jobs_query.all()
                
                job_items = [
                    JobListItem(
                        id=str(job.id),
                        name=job.name,
                        status=JobStatus(latest_status),
                        config_step=latest_config_step,
                        created_at=job.created_at
                    )
                    for job, latest_status, latest_config_step in jobs_with_runs
                ]
            
            return JobListResponse(
                jobs=job_items,
                total=total
            )
            
        except Exception as e:
            logger.error(f"Failed to list jobs for user {user_id}: {e}")
            raise
        finally:
            db.close()

    async def get_job_progress(self, user_id: str, job_id: str, run_id: str = None) -> JobProgressResponse:
        """Get job run progress information"""
        db = self._get_session()
        try:
            # Get the target run (latest if not specified)
            if run_id:
                target_run = self.get_job_run(job_id, run_id, user_id)
            else:
                target_run = self.get_latest_run(job_id, user_id)
            
            if not target_run:
                raise ValueError(f"Job run not found")
            
            # Get all tasks with their status for this job run
            tasks = db.query(ExtractionTask).filter(
                ExtractionTask.job_run_id == target_run.id
            ).all()
            
            # Debug: Print what we're reading from database
            print(f"DEBUG: Found {len(tasks)} tasks in database:")
            for task in tasks:
                print(f"  Task {task.id}: status='{task.status}' (type: {type(task.status)})")
            
            # Double-check with raw SQL to bypass any ORM caching
            from sqlalchemy import text
            raw_result = db.execute(
                text("SELECT id, status FROM extraction_tasks WHERE job_run_id = :job_run_id ORDER BY created_at"),
                {"job_run_id": str(target_run.id)}
            ).fetchall()
            print(f"DEBUG: Raw SQL query results:")
            for row in raw_result:
                print(f"  Task {row[0]}: status='{row[1]}' (raw SQL)")
            
            # Count tasks by status
            total_tasks = len(tasks)
            completed = sum(1 for task in tasks if task.status == 'completed')
            failed = sum(1 for task in tasks if task.status == 'failed')
            
            # Create task info list
            task_info_list = [
                TaskInfo(id=str(task.id), status=task.status)
                for task in tasks
            ]
            
            response = JobProgressResponse(
                total_tasks=total_tasks,
                completed=completed,
                failed=failed,
                status=JobStatus(target_run.status),
                tasks=task_info_list
            )
            
            # Debug logging
            print(f"DEBUG: Job progress response for {job_id}: total={total_tasks}, completed={completed}, failed={failed}, tasks_count={len(task_info_list)}")
            print(f"DEBUG: Task details: {[f'{task.id}:{task.status}' for task in task_info_list]}")
            
            return response
            
        except Exception as e:
            logger.error(f"Failed to get job progress for {job_id}: {e}")
            raise
        finally:
            db.close()

    async def add_files_to_job(self, user_id: str, job_id: str, files: List[UploadFile], run_id: str = None) -> List[Dict[str, Any]]:
        """
        Add more files to an existing job run
        Immediately extracts ZIP files via ARQ workers
        """
        db = self._get_session()
        try:
            # Get the target run (latest if not specified)
            if run_id:
                target_run = self.get_job_run(job_id, run_id, user_id)
            else:
                target_run = self.get_latest_run(job_id, user_id)
            
            if not target_run:
                raise ValueError(f"Job run not found")
            
            uploaded_files = []
            storage_service = get_storage_service()
            
            for file in files:
                # Generate unique GCS object name
                file_extension = os.path.splitext(file.filename)[1] if file.filename else ""
                gcs_object_name = f"jobs/{job_id}/runs/{target_run.id}/{uuid.uuid4()}{file_extension}"
                
                # Upload to GCS
                file_content = await file.read()
                await storage_service.upload_file_content(file_content, gcs_object_name)
                
                # Determine file type
                content_type = file.content_type or "application/octet-stream"
                
                # Count pages in the file
                from services.page_counting_service import page_counting_service
                page_count = page_counting_service.count_pages_from_content(file_content, file.filename or "unknown")
                
                # Create SourceFile record (always start as ready, ZIP detection will update if needed)
                filename = file.filename or "unknown"
                source_file = SourceFile(
                    job_run_id=target_run.id,
                    original_filename=os.path.basename(filename),  # Just the filename
                    original_path=filename,  # Full path as uploaded
                    gcs_object_name=gcs_object_name,
                    file_type=content_type,
                    file_size_bytes=len(file_content),
                    page_count=page_count,
                    status=FileStatus.UPLOADED.value
                )
                
                db.add(source_file)
                db.flush()  # Get the ID
                
                # Handle ZIP detection and extraction using centralized logic
                await self._handle_zip_detection(db, source_file, content_type, file.filename or "unknown")
                
                uploaded_files.append({
                    "id": str(source_file.id),
                    "filename": source_file.original_filename,
                    "file_type": source_file.file_type,
                    "file_size": source_file.file_size_bytes,
                    "status": source_file.status
                })
            
            db.commit()
            logger.info(f"Added {len(uploaded_files)} files to job {job_id}")
            
            # No longer send SSE events for file uploads - handled directly by API response
            # SSE is now only used for background operations like ZIP extraction
            
            return uploaded_files
            
        except Exception as e:
            logger.error(f"Failed to add files to job {job_id}: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    async def get_job_files(self, job_id: str, processable_only: bool = False, user_id: str = None, run_id: str = None) -> List[JobFileInfo]:
        """Get flat list of files in a job run"""
        db = self._get_session()
        try:
            # Get the target run (latest if not specified)
            if run_id:
                target_run = self.get_job_run(job_id, run_id, user_id) if user_id else None
                if not target_run and user_id:
                    raise ValueError(f"Job run not found")
            else:
                target_run = self.get_latest_run(job_id, user_id) if user_id else None
                if not target_run and user_id:
                    raise ValueError(f"Job run not found")
            
            # If no user_id provided (internal use), get run directly
            if not user_id and run_id:
                target_run = db.query(JobRun).filter(JobRun.id == run_id).first()
            elif not user_id and not run_id:
                # Get latest run for job without user check
                target_run = db.query(JobRun).filter(JobRun.job_id == job_id).order_by(JobRun.created_at.desc()).first()
            
            if not target_run:
                raise ValueError(f"Job run not found")
            
            # Get source files with optional filtering
            query = db.query(SourceFile).filter(SourceFile.job_run_id == target_run.id)
            
            if processable_only:
                # Filter out archive files that are only used for unpacking, not data extraction
                query = self._filter_processable_files(query)
            
            source_files = query.order_by(SourceFile.original_path, SourceFile.id).all()
            
            files = []
            for source_file in source_files:
                files.append(JobFileInfo(
                    id=str(source_file.id),
                    original_filename=source_file.original_filename,
                    original_path=source_file.original_path,
                    file_size_bytes=source_file.file_size_bytes,
                    status=FileStatus(source_file.status)
                ))
            
            return files
            
        except Exception as e:
            logger.error(f"Failed to get files for job {job_id}: {e}")
            raise
        finally:
            db.close()

    async def remove_file_from_job(self, user_id: str, job_id: str, file_id: str, run_id: str = None) -> None:
        """Remove a file from a job run (synchronous deletion for now)"""
        db = self._get_session()
        try:
            # Get the target run (latest if not specified)
            if run_id:
                target_run = self.get_job_run(job_id, run_id, user_id)
            else:
                target_run = self.get_latest_run(job_id, user_id)
            
            if not target_run:
                raise ValueError(f"Job run not found")
            
            # Get the source file
            source_file = db.query(SourceFile).filter(
                SourceFile.id == file_id,
                SourceFile.job_run_id == target_run.id
            ).first()
            
            if not source_file:
                raise ValueError(f"File {file_id} not found in job run {target_run.id}")
            
            # Delete from GCS
            storage_service = get_storage_service()
            try:
                await storage_service.delete_file(source_file.gcs_object_name)
            except Exception as e:
                logger.warning(f"Failed to delete file from GCS: {e}")
                # Continue with database deletion even if GCS deletion fails
            
            # TODO: If this was a ZIP file, also delete all extracted files
            # This requires adding parent_zip_file_id to the SourceFile model
            # For now, extracted files will remain as orphaned files
            if source_file.file_type in ['application/zip', 'application/x-zip-compressed']:
                logger.info(f"Deleted ZIP file {file_id}, but extracted files remain (orphaned)")
            
            # Delete the source file record
            db.delete(source_file)
            db.commit()
            
            logger.info(f"Removed file {file_id} from job {job_id}")
            
            # No longer send SSE events for file deletion - handled directly by API response
            
        except Exception as e:
            logger.error(f"Failed to remove file {file_id} from job {job_id}: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    def _is_zip_file(self, mime_type: str, filename: str) -> bool:
        """Check if a file is a ZIP archive based on MIME type and extension"""
        return (
            mime_type in ['application/zip', 'application/x-zip-compressed'] or
            filename.lower().endswith('.zip')
        )

    async def _handle_zip_detection(self, db, source_file, mime_type: str, filename: str, automation_run_id: str = None) -> bool:
        """Handle ZIP file detection and enqueue extraction if needed"""
        if self._is_zip_file(mime_type, filename):
            # Update status to unpacking
            source_file.status = 'unpacking'
            db.commit()
            
            # Enqueue ZIP extraction task
            await self._enqueue_zip_extraction(str(source_file.id), automation_run_id)
            logger.info(f"Detected and enqueued ZIP extraction for file {source_file.id}")
            return True  # This is a ZIP file
        
        return False  # This is not a ZIP file

    async def _enqueue_zip_extraction(self, source_file_id: str, automation_run_id: str = None) -> None:
        """Enqueue ZIP extraction task"""
        try:
            # Enqueue using Cloud Run Tasks
            task_name = await cloud_run_task_service.enqueue_zip_unpack_task(
                source_file_id=source_file_id,
                automation_run_id=automation_run_id
            )
            logger.info(f"Enqueued ZIP extraction task for file {source_file_id} as {task_name}")
                
        except Exception as e:
            logger.error(f"Failed to enqueue ZIP extraction task: {e}")
            raise

    async def verify_job_access(self, user_id: str, job_id: str) -> None:
        """Verify that a user has access to a specific job"""
        db = self._get_session()
        try:
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found")
                
        except Exception as e:
            logger.error(f"Failed to verify job access for {job_id}: {e}")
            raise
        finally:
            db.close()

    async def get_job_results(self, user_id: str, job_id: str, limit: int = 50, offset: int = 0, run_id: str = None) -> JobResultsResponse:
        """Get extraction results for a completed job run"""
        db = self._get_session()
        try:
            # Get the target run (latest if not specified)
            if run_id:
                target_run = self.get_job_run(job_id, run_id, user_id)
            else:
                target_run = self.get_latest_run(job_id, user_id)
            
            if not target_run:
                raise ValueError(f"Job run not found")
            
            # Create subquery to get first source file path for each task
            first_file_subquery = db.query(
                SourceFileToTask.task_id,
                func.min(SourceFile.original_path).label('first_file_path')
            ).join(
                SourceFile, SourceFile.id == SourceFileToTask.source_file_id
            ).group_by(SourceFileToTask.task_id).subquery()
            
            # Get extraction results ordered by first source file path
            results_query = db.query(ExtractionResult, ExtractionTask).join(
                ExtractionTask, ExtractionResult.task_id == ExtractionTask.id
            ).join(
                first_file_subquery, first_file_subquery.c.task_id == ExtractionTask.id
            ).filter(
                ExtractionTask.job_run_id == target_run.id
            ).order_by(
                first_file_subquery.c.first_file_path,
                ExtractionResult.processed_at,
                ExtractionResult.id
            )
            
            # Get total count
            total_count = results_query.count()
            
            # Apply pagination
            results_with_tasks = results_query.offset(offset).limit(limit).all()
            
            # Calculate unique files processed count efficiently (excluding archive files)
            unique_files_query = db.query(SourceFile.id).filter(SourceFile.job_run_id == target_run.id)
            unique_files_query = self._filter_processable_files(unique_files_query).distinct()
            files_processed_count = unique_files_query.count()
            
            # Process results
            processed_results = []
            logger.info(f"Processing {len(results_with_tasks)} result records for job {job_id}")
            
            for result, task in results_with_tasks:
                # Parse the extracted_data JSONB field
                extracted_data = result.extracted_data
                logger.info(f"Processing task {result.task_id}, mode: {task.processing_mode}, data keys: {list(extracted_data.keys()) if extracted_data else 'None'}")
                
                # Handle new array-based format: "results": [[val1, val2], [val3, val4]], "columns": ["field1", "field2"]
                if "results" in extracted_data and "columns" in extracted_data:
                    # Get source file info from the task
                    source_files = []
                    task_source_files = db.query(SourceFileToTask, SourceFile).join(
                        SourceFile, SourceFileToTask.source_file_id == SourceFile.id
                    ).filter(SourceFileToTask.task_id == task.id).order_by(SourceFile.original_path, SourceFile.id).all()
                    
                    for _, source_file in task_source_files:
                        source_files.append(source_file.original_path)
                    
                    if not source_files:
                        source_files = ["Unknown"]
                    
                    # Keep the array-based format for API response
                    processed_results.append({
                        "task_id": str(result.task_id),
                        "source_files": source_files,
                        "processing_mode": task.processing_mode,
                        "extracted_data": extracted_data  # Keep the full array format with columns
                    })
            
            logger.info(f"Job {job_id} results debug: total_count={total_count}, files_processed_count={files_processed_count}, processed_results_count={len(processed_results)}")
            logger.info(f"First few processed results: {processed_results[:2] if processed_results else 'None'}")
            
            return JobResultsResponse(
                total=total_count,
                files_processed_count=files_processed_count,
                results=processed_results
            )
            
        except Exception as e:
            logger.error(f"Failed to get results for job {job_id}: {e}")
            raise
        finally:
            db.close()

    async def delete_job(self, user_id: str, job_id: str) -> bool:
        """Delete a job and all its associated data"""
        db = self._get_session()
        try:
            # Get the job and verify ownership
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found")
            
            # Delete the job (cascade will handle related records)
            db.delete(job)
            db.commit()
            
            logger.info(f"Deleted job {job_id} for user {user_id}")
            
            # TODO: Enqueue background task to clean up GCS files
            # For now, we'll just delete the database records
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete job {job_id}: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    async def update_job_fields(self, job_id: str, user_id: str, fields: List[dict], template_id: str = None, processing_modes: dict = None, run_id: str = None) -> None:
        """Update job run field configuration and processing modes during wizard steps"""
        db = self._get_session()
        try:
            # Get the target run (latest if not specified)
            if run_id:
                target_run = self.get_job_run(job_id, run_id, user_id)
            else:
                target_run = self.get_latest_run(job_id, user_id)
            
            if not target_run:
                raise ValueError("Job run not found or access denied")
            
            # Only allow updates during wizard (not submitted)
            if target_run.config_step == 'submitted':
                raise ValueError(f"Job run {target_run.id} cannot be modified after submission")
            
            # Delete existing job fields for this run
            db.query(JobField).filter(JobField.job_run_id == target_run.id).delete()
            
            # Add new job fields for this run
            for i, field_data in enumerate(fields):
                job_field = JobField(
                    job_run_id=target_run.id,
                    field_name=field_data.get('field_name', ''),
                    data_type_id=field_data.get('data_type_id', 'text'),
                    ai_prompt=field_data.get('ai_prompt', ''),
                    display_order=field_data.get('display_order', i)
                )
                db.add(job_field)
            
            # Delete existing extraction tasks for this run
            db.query(ExtractionTask).filter(ExtractionTask.job_run_id == target_run.id).delete()
            
            # Debug: Log what we received
            logger.info(f"update_job_fields called with processing_modes: {processing_modes}")
            logger.info(f"processing_modes type: {type(processing_modes)}")
            logger.info(f"processing_modes is truthy: {bool(processing_modes)}")
            
            # Create extraction tasks with processing modes
            if processing_modes:
                logger.info(f"Processing modes received: {processing_modes}")
                
                # Get all source files for this job run
                source_files = db.query(SourceFile).filter(SourceFile.job_run_id == target_run.id).all()
                logger.info(f"Found {len(source_files)} source files for job run {target_run.id}")
                
                # Group files by their folder paths
                files_by_folder = {}
                for file in source_files:
                    folder_path = self._get_folder_path(file.original_path)
                    if folder_path not in files_by_folder:
                        files_by_folder[folder_path] = []
                    files_by_folder[folder_path].append(file)
                    logger.info(f"File: {file.original_path} -> Folder: '{folder_path}'")
                
                logger.info(f"Files grouped by folder: {list(files_by_folder.keys())}")
                
                # Create extraction tasks based on processing modes
                for folder_path, processing_mode in processing_modes.items():
                    logger.info(f"Processing folder_path: '{folder_path}' with mode: {processing_mode}")
                    matching_files = files_by_folder.get(folder_path, [])
                    
                    if not matching_files:
                        logger.warning(f"No files found for folder path: '{folder_path}'. Available folders: {list(files_by_folder.keys())}")
                        continue
                    
                    logger.info(f"Found {len(matching_files)} matching files for folder '{folder_path}'")
                    
                    if processing_mode == 'individual':
                        # Create one task per file
                        for file in matching_files:
                            extraction_task = ExtractionTask(
                                job_run_id=target_run.id,
                                processing_mode=processing_mode,
                                status='pending'
                            )
                            db.add(extraction_task)
                            db.flush()  # Get task ID
                            
                            # Link file to task
                            file_to_task = SourceFileToTask(
                                source_file_id=file.id,
                                task_id=extraction_task.id
                            )
                            db.add(file_to_task)
                    
                    elif processing_mode == 'combined':
                        # Create one task for all files in this folder
                        extraction_task = ExtractionTask(
                            job_run_id=target_run.id,
                            processing_mode=processing_mode,
                            status='pending'
                        )
                        db.add(extraction_task)
                        db.flush()  # Get task ID
                        
                        # Link all files to this task
                        for i, file in enumerate(matching_files):
                            file_to_task = SourceFileToTask(
                                source_file_id=file.id,
                                task_id=extraction_task.id
                            )
                            db.add(file_to_task)
            
            # Update template reference and last activity on the job run using the active session
            db.execute(
                update(JobRun)
                .where(JobRun.id == target_run.id)
                .values(
                    template_id=template_id,
                    last_active_at=datetime.utcnow()
                )
            )
            
            # Also update parent job's last_active_at
            db.execute(
                update(ExtractionJob)
                .where(ExtractionJob.id == job_id)
                .values(last_active_at=datetime.utcnow())
            )
            
            db.commit()
            logger.info(f"Updated {len(fields)} fields and {len(processing_modes or {})} processing modes for job {job_id}")
            
        except Exception as e:
            logger.error(f"Failed to update job configuration for {job_id}: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    async def update_job_name(self, job_id: str, user_id: str, name: str) -> None:
        """Update job name"""
        db = self._get_session()
        try:
            # Get the job and verify ownership
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found")
            
            # Update job name and last activity
            job.name = name
            job.last_active_at = datetime.utcnow()
            
            db.commit()
            logger.info(f"Updated name for job {job_id} to '{name}'")
            
        except Exception as e:
            logger.error(f"Failed to update job name for {job_id}: {e}")
            db.rollback()
            raise
        finally:
            db.close()