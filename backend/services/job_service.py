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
from arq import create_pool
from arq.connections import RedisSettings

from models.job import (
    JobInitiateRequest, JobInitiateResponse, JobStartRequest, JobStartResponse,
    JobDetailsResponse, JobListResponse, JobProgressResponse, JobResultsResponse,
    JobStatus, ProcessingMode, FileUploadResponse, JobListItem, JobFieldInfo,
    ExtractionTaskResult, JobFileInfo, FileStatus, TaskInfo
)
from models.db_models import (
    ExtractionJob, SourceFile, JobField, ExtractionTask, SourceFileToTask,
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
from arq import create_pool
from arq.connections import RedisSettings

logger = logging.getLogger(__name__)

class JobService:
    """Service for managing extraction jobs"""
    
    def __init__(self):
        """Initialize job service"""
        self.storage_service = get_storage_service()
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_settings = RedisSettings.from_dsn(self.redis_url)
        logger.info("Job service initialized")

    def _get_session(self) -> Session:
        """Get database session - creates a fresh session each time"""
        return db_config.get_session()
    
    async def create_job(self, user_id: str, name: str = None) -> str:
        """Create new job starting at upload step"""
        db = self._get_session()
        try:
            job = ExtractionJob(
                user_id=user_id,
                name=name,
                config_step='upload',
                status='pending',
                last_active_at=datetime.utcnow()
            )
            db.add(job)
            db.commit()
            return str(job.id)
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error creating job: {e}")
            raise
        finally:
            db.close()
    
    async def advance_config_step(self, job_id: str, user_id: str, next_step: str, expected_version: int = None):
        """Advance wizard step with optimistic locking"""
        db = self._get_session()
        try:
            # Build update query with version check if provided
            query = update(ExtractionJob).where(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            )
            
            if expected_version is not None:
                query = query.where(ExtractionJob.version == expected_version)
            
            result = db.execute(
                query.values(
                    config_step=next_step,
                    version=ExtractionJob.version + 1,
                    last_active_at=datetime.utcnow()
                )
            )
            
            if result.rowcount == 0:
                if expected_version is not None:
                    raise ValueError("Job was modified by another session")
                else:
                    raise ValueError("Job not found or access denied")
            
            db.commit()
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error advancing config step: {e}")
            raise
        finally:
            db.close()
    
    def calculate_total_tasks(self, job: ExtractionJob) -> int:
        """Calculate total tasks based on files and processing mode"""
        if not job.extraction_tasks:
            # Fallback: assume one task per file
            return len(job.source_files) if job.source_files else 0
        
        total = 0
        for task in job.extraction_tasks:
            if task.processing_mode == 'individual':
                total += len(task.source_files_to_tasks)
            elif task.processing_mode == 'combined':
                total += 1  # One task for all files combined
        
        return max(total, len(job.source_files) if job.source_files else 0)
    
    async def submit_job_for_processing(self, job_id: str, user_id: str):
        """Submit completed wizard for processing using existing extraction tasks"""
        logger.info(f"submit_job_for_processing called for job {job_id} by user {user_id}")
        db = self._get_session()
        try:
            # Get job with related data
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError("Job not found")
            
            if job.config_step == 'submitted':
                raise ValueError("Job already submitted")
            
            # Count existing extraction tasks (created during field configuration)
            total_tasks = db.query(ExtractionTask).filter(
                ExtractionTask.job_id == job_id
            ).count()
            
            if total_tasks == 0:
                raise ValueError("No extraction tasks found. Please configure processing modes first.")
            
            # Update job for processing
            db.execute(
                update(ExtractionJob)
                .where(ExtractionJob.id == job_id)
                .values(
                    config_step='submitted',
                    status='in_progress',
                    tasks_total=total_tasks,
                    tasks_completed=0,
                    tasks_failed=0,
                    last_active_at=datetime.utcnow(),
                    version=ExtractionJob.version + 1
                )
            )
            
            db.commit()
            
            # Enqueue existing extraction tasks for processing
            await self._enqueue_existing_extraction_tasks(job_id)
            
            logger.info(f"Submitted job {job_id} with {total_tasks} existing extraction tasks")
            return job_id
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error submitting job: {e}")
            raise
        finally:
            db.close()

    async def _enqueue_existing_extraction_tasks(self, job_id: str) -> None:
        """Enqueue existing extraction tasks for background processing"""
        try:
            # Get Redis connection
            redis = await create_pool(self.redis_settings)
            
            # Get all pending tasks for this job
            db = self._get_session()
            try:
                tasks = db.query(ExtractionTask).filter(
                    ExtractionTask.job_id == job_id,
                    ExtractionTask.status == 'pending'
                ).all()
                
                logger.info(f"Found {len(tasks)} pending extraction tasks for job {job_id}")
                for task in tasks:
                    logger.info(f"Task {task.id}: processing_mode={task.processing_mode}")
                
                # Enqueue each task
                for task in tasks:
                    job_info = await redis.enqueue_job(
                        'process_extraction_task',
                        str(task.id)
                    )
                    logger.info(f"Enqueued extraction task {task.id} as job {job_info.job_id}")
                
                logger.info(f"Enqueued {len(tasks)} existing extraction tasks for job {job_id}")
                
            finally:
                db.close()
                await redis.close()
                
        except Exception as e:
            logger.error(f"Failed to enqueue existing tasks for job {job_id}: {e}")
            # Don't raise - job is still valid, tasks can be retried later
    
    async def increment_task_completion(self, job_id: str, success: bool = True):
        """Atomically update task progress from workers"""
        db = self._get_session()
        try:
            if success:
                db.execute(
                    update(ExtractionJob)
                    .where(ExtractionJob.id == job_id)
                    .values(
                        tasks_completed=ExtractionJob.tasks_completed + 1,
                        last_active_at=datetime.utcnow()
                    )
                )
            else:
                db.execute(
                    update(ExtractionJob)
                    .where(ExtractionJob.id == job_id)
                    .values(
                        tasks_failed=ExtractionJob.tasks_failed + 1,
                        last_active_at=datetime.utcnow()
                    )
                )
            
            # Check if job is complete and send SSE events
            job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
            if job and job.tasks_completed + job.tasks_failed >= job.tasks_total:
                final_status = 'completed' if job.tasks_failed == 0 else 'partially_completed'
                db.execute(
                    update(ExtractionJob)
                    .where(ExtractionJob.id == job_id)
                    .values(
                        status=final_status,
                        completed_at=datetime.utcnow() if final_status == 'completed' else None
                    )
                )
                
                # Send job completion SSE event
                try:
                    from services.sse_service import sse_manager
                    await sse_manager.send_job_completed(job_id)
                    logger.info(f"Job {job_id} completed - sent SSE event")
                except Exception as e:
                    logger.warning(f"Failed to send job_completed SSE event: {e}")
            
            db.commit()
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error updating task progress: {e}")
            raise
        finally:
            db.close()
    
    
    def get_resumable_jobs(self, user_id: str) -> list[ExtractionJob]:
        """Get all jobs user can resume (wizard incomplete OR processing incomplete/failed)"""
        db = self._get_session()
        try:
            return db.query(ExtractionJob).filter(
                ExtractionJob.user_id == user_id,
                or_(
                    # Wizard not complete
                    ExtractionJob.config_step != 'submitted',
                    # Processing incomplete/failed with remaining tasks
                    and_(
                        ExtractionJob.status.in_(['in_progress', 'partially_completed', 'failed']),
                        ExtractionJob.tasks_completed < ExtractionJob.tasks_total
                    )
                )
            ).order_by(ExtractionJob.last_active_at.desc()).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting resumable jobs: {e}")
            raise
        finally:
            db.close()
    
    def get_active_jobs(self, user_id: str) -> list[ExtractionJob]:
        """Get completed or fully processed jobs"""
        db = self._get_session()
        try:
            return db.query(ExtractionJob).filter(
                ExtractionJob.user_id == user_id,
                ExtractionJob.config_step == 'submitted',
                or_(
                    ExtractionJob.status.in_(['completed', 'cancelled']),
                    and_(
                        ExtractionJob.status == 'in_progress',
                        ExtractionJob.tasks_completed >= ExtractionJob.tasks_total
                    )
                )
            ).order_by(ExtractionJob.created_at.desc()).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting active jobs: {e}")
            raise
        finally:
            db.close()
    
    async def cleanup_old_jobs(self):
        """Mark old jobs for deletion instead of immediate delete"""
        db = self._get_session()
        try:
            thirty_days_ago = datetime.utcnow() - timedelta(days=30)
            
            # Mark abandoned wizard jobs as cancelled
            await db.execute(
                update(ExtractionJob)
                .where(
                    ExtractionJob.config_step != 'submitted',
                    ExtractionJob.last_active_at < thirty_days_ago,
                    ExtractionJob.status != 'cancelled'
                )
                .values(
                    status='cancelled',
                    persist_data=False  # Mark for physical deletion
                )
            )
            
            db.commit()
            logger.info("Marked old jobs for cleanup")
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error during job cleanup: {e}")
            raise
        finally:
            db.close()
    
    async def broadcast_workflow_progress(self, job_id: str, user_id: str):
        """Broadcast workflow progress update via SSE"""
        try:
            from services.sse_service import sse_manager
            
            # Get current job state
            db = self._get_session()
            try:
                job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
                if job:
                    await sse_manager.send_workflow_progress(job_id, {
                        'config_step': job.config_step,
                        'status': job.status,
                        'progress_percentage': job.progress_percentage,
                        'tasks_completed': job.tasks_completed,
                        'tasks_total': job.tasks_total,
                        'tasks_failed': job.tasks_failed,
                        'is_resumable': job.is_resumable,
                        'last_active_at': job.last_active_at.isoformat(),
                        'version': job.version
                    })
            finally:
                db.close()
                
        except Exception as e:
            logger.warning(f"Failed to broadcast workflow progress for job {job_id}: {e}")
    
    async def cancel_job(self, job_id: str, user_id: str):
        """Cancel job (soft delete)"""
        db = self._get_session()
        try:
            result = await db.execute(
                update(ExtractionJob)
                .where(
                    ExtractionJob.id == job_id,
                    ExtractionJob.user_id == user_id
                )
                .values(
                    status='cancelled',
                    last_active_at=datetime.utcnow()
                )
            )
            
            if result.rowcount == 0:
                raise ValueError("Job not found or access denied")
            
            db.commit()
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error cancelling job: {e}")
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
                name=request.name,  # Set the job name from request
                status='pending',  # Start with pending status
                config_step='upload'  # Start at upload step
            )
            db.add(job)
            db.flush()  # Get the job ID
            
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
                    job_id=job.id,
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

    async def start_job(self, user_id: str, job_id: str, request: JobStartRequest) -> JobStartResponse:
        """
        Step 2: Start job processing with configuration
        """
        db = self._get_session()
        try:
            # Get the job
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id,
                ExtractionJob.status == JobStatus.PENDING.value
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found or not in correct state")
            
            # Update job details
            job.persist_data = request.persist_data
            job.status = JobStatus.IN_PROGRESS.value
            
            # If template_id provided, link it
            if request.template_id:
                job.template_id = request.template_id
            
            # Snapshot field configuration into job_fields
            for field_config in request.fields:
                job_field = JobField(
                    job_id=job.id,
                    field_name=field_config.field_name,
                    data_type_id=field_config.data_type_id,
                    ai_prompt=field_config.ai_prompt,
                    display_order=field_config.display_order
                )
                db.add(job_field)
            
            # Create extraction tasks based on task definitions
            await self._create_extraction_tasks(db, job.id, request.task_definitions)
            
            db.commit()
            
            # Enqueue extraction tasks for background processing
            await self._enqueue_extraction_tasks(job.id)
            
            logger.info(f"Started job {job_id} with {len(request.fields)} fields and enqueued tasks")
            
            return JobStartResponse(
                message="Job processing has been successfully started.",
                job_id=job_id
            )
            
        except Exception as e:
            logger.error(f"Failed to start job {job_id}: {e}")
            db.rollback()
            raise
        finally:
            db.close()

    async def _create_extraction_tasks(self, db: Session, job_id: uuid.UUID, task_definitions: List) -> None:
        """Create extraction tasks based on task definitions"""
        # Get all source files for this job
        source_files = db.query(SourceFile).filter(SourceFile.job_id == job_id).all()
        
        # Group files by their folder paths
        files_by_path = {}
        for file in source_files:
            # Extract folder path from file path
            folder_path = self._get_folder_path(file.original_path)
            if folder_path not in files_by_path:
                files_by_path[folder_path] = []
            files_by_path[folder_path].append(file)
        
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
                        job_id=job_id,
                        processing_mode=task_def.mode.value,
                        status='pending'
                    )
                    db.add(task)
                    db.flush()  # Get task ID
                    
                    # Link file to task
                    file_to_task = SourceFileToTask(
                        source_file_id=file.id,
                        task_id=task.id,
                        document_order=0
                    )
                    db.add(file_to_task)
                    
            elif task_def.mode == ProcessingMode.COMBINED:
                # Create one task for all files in this path
                task = ExtractionTask(
                    job_id=job_id,
                    processing_mode=task_def.mode.value,
                    status='pending'
                )
                db.add(task)
                db.flush()  # Get task ID
                
                # Link all files to this task
                for i, file in enumerate(matching_files):
                    file_to_task = SourceFileToTask(
                        source_file_id=file.id,
                        task_id=task.id,
                        document_order=i
                    )
                    db.add(file_to_task)

    async def _enqueue_extraction_tasks(self, job_id: uuid.UUID) -> None:
        """Enqueue extraction tasks for background processing"""
        try:
            # Get Redis connection
            redis = await create_pool(self.redis_settings)
            
            # Get all pending tasks for this job
            db = self._get_session()
            try:
                tasks = db.query(ExtractionTask).filter(
                    ExtractionTask.job_id == job_id,
                    ExtractionTask.status == 'pending'
                ).all()
                
                # Enqueue each task
                for task in tasks:
                    job_info = await redis.enqueue_job(
                        'process_extraction_task',
                        str(task.id)
                    )
                    logger.info(f"Enqueued extraction task {task.id} as job {job_info.job_id}")
                
                logger.info(f"Enqueued {len(tasks)} extraction tasks for job {job_id}")
                
            finally:
                db.close()
                await redis.close()
                
        except Exception as e:
            logger.error(f"Failed to enqueue tasks for job {job_id}: {e}")
            # Don't raise - job is still valid, tasks can be retried later
            
    async def get_job_details(self, user_id: str, job_id: str) -> JobDetailsResponse:
        """Get detailed job information"""
        db = self._get_session()
        try:
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found")
            
            # Get job fields
            job_fields = db.query(JobField).filter(
                JobField.job_id == job.id
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
                ExtractionTask.job_id == job.id
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
            
            return JobDetailsResponse(
                id=str(job.id),
                name=job.name,
                status=JobStatus(job.status),
                persist_data=job.persist_data,
                created_at=job.created_at,
                completed_at=job.completed_at,
                job_fields=field_info,
                template_id=str(job.template_id) if job.template_id else None,
                extraction_tasks=unique_task_definitions
            )
            
        except Exception as e:
            logger.error(f"Failed to get job details for {job_id}: {e}")
            raise
        finally:
            db.close()

    async def list_user_jobs(self, user_id: str, limit: int = 25, offset: int = 0) -> JobListResponse:
        """List jobs for a user with pagination"""
        db = self._get_session()
        try:
            # Get total count
            total = db.query(ExtractionJob).filter(ExtractionJob.user_id == user_id).count()
            
            # Get jobs with processable file counts (excluding ZIP files)
            jobs_query = db.query(
                ExtractionJob,
                func.count(SourceFile.id).label('file_count')
            ).outerjoin(SourceFile).filter(
                ExtractionJob.user_id == user_id
            )
            
            # Apply processable files filter, allowing jobs with no files
            jobs_query = self._filter_processable_files(jobs_query, allow_null_files=True)
            
            jobs_query = jobs_query.group_by(ExtractionJob.id).order_by(
                ExtractionJob.created_at.desc()
            ).limit(limit).offset(offset)
            
            jobs_with_counts = jobs_query.all()
            
            job_items = [
                JobListItem(
                    id=str(job.id),
                    name=job.name,
                    status=JobStatus(job.status),
                    config_step=job.config_step,
                    created_at=job.created_at,
                    file_count=file_count or 0
                )
                for job, file_count in jobs_with_counts
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

    async def get_job_progress(self, user_id: str, job_id: str) -> JobProgressResponse:
        """Get job progress information"""
        db = self._get_session()
        try:
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found")
            
            # Get all tasks with their status
            # Get all tasks with their status
            tasks = db.query(ExtractionTask).filter(
                ExtractionTask.job_id == job.id
            ).all()
            
            # Debug: Print what we're reading from database
            print(f"DEBUG: Found {len(tasks)} tasks in database:")
            for task in tasks:
                print(f"  Task {task.id}: status='{task.status}' (type: {type(task.status)})")
            
            # Double-check with raw SQL to bypass any ORM caching
            from sqlalchemy import text
            raw_result = db.execute(
                text("SELECT id, status FROM extraction_tasks WHERE job_id = :job_id ORDER BY created_at"),
                {"job_id": str(job.id)}
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
                status=JobStatus(job.status),
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

    async def add_files_to_job(self, user_id: str, job_id: str, files: List[UploadFile]) -> List[Dict[str, Any]]:
        """
        Add more files to an existing job
        Immediately extracts ZIP files via ARQ workers
        """
        db = self._get_session()
        try:
            # Get the job
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id,
                ExtractionJob.status == JobStatus.PENDING.value
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found or not in correct state")
            
            uploaded_files = []
            storage_service = get_storage_service()
            
            for file in files:
                # Generate unique GCS object name
                file_extension = os.path.splitext(file.filename)[1] if file.filename else ""
                gcs_object_name = f"jobs/{job_id}/{uuid.uuid4()}{file_extension}"
                
                # Upload to GCS
                file_content = await file.read()
                await storage_service.upload_file_content(file_content, gcs_object_name)
                
                # Determine file type
                content_type = file.content_type or "application/octet-stream"
                
                # Create SourceFile record
                source_file = SourceFile(
                    job_id=job.id,
                    original_filename=file.filename or "unknown",
                    original_path=file.filename or "unknown",
                    gcs_object_name=gcs_object_name,
                    file_type=content_type,
                    file_size_bytes=len(file_content),
                    status=FileStatus.READY.value if not content_type.startswith("application/zip") else FileStatus.UNPACKING.value
                )
                
                db.add(source_file)
                db.flush()  # Get the ID
                
                uploaded_files.append({
                    "id": str(source_file.id),
                    "filename": source_file.original_filename,
                    "file_type": source_file.file_type,
                    "file_size": source_file.file_size_bytes,
                    "status": source_file.status
                })
                
                # If ZIP file, enqueue extraction task
                if content_type in ['application/zip', 'application/x-zip-compressed']:
                    await self._enqueue_zip_extraction(source_file.id)
                    logger.info(f"Enqueued ZIP extraction for file {source_file.id}")
            
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

    async def get_job_files(self, user_id: str, job_id: str, processable_only: bool = False) -> List[JobFileInfo]:
        """Get flat list of files in a job"""
        db = self._get_session()
        try:
            # Get the job
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found")
            
            # Get source files with optional filtering
            query = db.query(SourceFile).filter(SourceFile.job_id == job.id)
            
            if processable_only:
                # Filter out archive files that are only used for unpacking, not data extraction
                query = self._filter_processable_files(query)
            
            source_files = query.order_by(SourceFile.id).all()
            
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

    async def remove_file_from_job(self, user_id: str, job_id: str, file_id: str) -> None:
        """Remove a file from a job (synchronous deletion for now)"""
        db = self._get_session()
        try:
            # Get the job
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id,
                ExtractionJob.status == JobStatus.PENDING.value
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found or not in correct state")
            
            # Get the source file
            source_file = db.query(SourceFile).filter(
                SourceFile.id == file_id,
                SourceFile.job_id == job.id
            ).first()
            
            if not source_file:
                raise ValueError(f"File {file_id} not found in job {job_id}")
            
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

    async def _enqueue_zip_extraction(self, source_file_id: str) -> None:
        """Enqueue ZIP extraction task"""
        try:
            # Get Redis connection
            redis = await create_pool(self.redis_settings)
            
            try:
                # Enqueue to zip_queue
                job_info = await redis.enqueue_job(
                    'unpack_zip_file_task',
                    str(source_file_id),
                    _queue_name='zip_queue'
                )
                logger.info(f"Enqueued ZIP extraction task for file {source_file_id} as job {job_info.job_id}")
                
            finally:
                await redis.close()
                
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

    async def get_job_results(self, user_id: str, job_id: str, limit: int = 50, offset: int = 0) -> JobResultsResponse:
        """Get extraction results for a completed job"""
        db = self._get_session()
        try:
            # Verify job exists and user has access
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found")
            
            # Get extraction results with pagination
            results_query = db.query(ExtractionResult, ExtractionTask).join(
                ExtractionTask, ExtractionResult.task_id == ExtractionTask.id
            ).filter(
                ExtractionTask.job_id == job_id
            ).order_by(ExtractionResult.processed_at)
            
            # Get total count
            total_count = results_query.count()
            
            # Apply pagination
            results_with_tasks = results_query.offset(offset).limit(limit).all()
            
            # Calculate unique files processed count efficiently (excluding archive files)
            unique_files_query = db.query(SourceFile.id).filter(SourceFile.job_id == job_id)
            unique_files_query = self._filter_processable_files(unique_files_query).distinct()
            files_processed_count = unique_files_query.count()
            
            # Process results
            processed_results = []
            logger.info(f"Processing {len(results_with_tasks)} result records for job {job_id}")
            
            for result, task in results_with_tasks:
                # Parse the extracted_data JSONB field
                extracted_data = result.extracted_data
                logger.info(f"Processing task {result.task_id}, mode: {task.processing_mode}, data keys: {list(extracted_data.keys()) if extracted_data else 'None'}")
                
                # Handle simplified format: "results": [{row1}, {row2}, {row3}]
                # Both individual and combined modes use the same format now
                if "results" in extracted_data and isinstance(extracted_data["results"], list):
                    # Get source file info from the task
                    source_files = []
                    task_source_files = db.query(SourceFileToTask, SourceFile).join(
                        SourceFile, SourceFileToTask.source_file_id == SourceFile.id
                    ).filter(SourceFileToTask.task_id == task.id).order_by(SourceFileToTask.document_order).all()
                    
                    for _, source_file in task_source_files:
                        source_files.append(source_file.original_path)
                    
                    if not source_files:
                        source_files = ["Unknown"]
                    
                    # Process each row object in the results array
                    for row_data in extracted_data["results"]:
                        if isinstance(row_data, dict):
                            processed_results.append({
                                "task_id": str(result.task_id),
                                "source_files": source_files,
                                "processing_mode": task.processing_mode,
                                "extracted_data": row_data
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

    async def update_job_fields(self, job_id: str, user_id: str, fields: List[dict], template_id: str = None, processing_modes: dict = None) -> None:
        """Update job field configuration and processing modes during wizard steps"""
        db = self._get_session()
        try:
            # Get the job and verify ownership and state
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id,
                ExtractionJob.config_step != 'submitted'  # Only allow updates during wizard
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found or cannot be modified")
            
            # Delete existing job fields
            db.query(JobField).filter(JobField.job_id == job_id).delete()
            
            # Add new job fields
            for i, field_data in enumerate(fields):
                job_field = JobField(
                    job_id=job.id,
                    field_name=field_data.get('field_name', ''),
                    data_type_id=field_data.get('data_type_id', 'text'),
                    ai_prompt=field_data.get('ai_prompt', ''),
                    display_order=field_data.get('display_order', i)
                )
                db.add(job_field)
            
            # Delete existing extraction tasks
            db.query(ExtractionTask).filter(ExtractionTask.job_id == job_id).delete()
            
            # Debug: Log what we received
            logger.info(f"update_job_fields called with processing_modes: {processing_modes}")
            logger.info(f"processing_modes type: {type(processing_modes)}")
            logger.info(f"processing_modes is truthy: {bool(processing_modes)}")
            
            # Create extraction tasks with processing modes
            if processing_modes:
                logger.info(f"Processing modes received: {processing_modes}")
                
                # Get all source files for this job
                source_files = db.query(SourceFile).filter(SourceFile.job_id == job_id).all()
                logger.info(f"Found {len(source_files)} source files for job {job_id}")
                
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
                                job_id=job.id,
                                processing_mode=processing_mode,
                                status='pending'
                            )
                            db.add(extraction_task)
                            db.flush()  # Get task ID
                            
                            # Link file to task
                            file_to_task = SourceFileToTask(
                                source_file_id=file.id,
                                task_id=extraction_task.id,
                                document_order=0
                            )
                            db.add(file_to_task)
                    
                    elif processing_mode == 'combined':
                        # Create one task for all files in this folder
                        extraction_task = ExtractionTask(
                            job_id=job.id,
                            processing_mode=processing_mode,
                            status='pending'
                        )
                        db.add(extraction_task)
                        db.flush()  # Get task ID
                        
                        # Link all files to this task
                        for i, file in enumerate(matching_files):
                            file_to_task = SourceFileToTask(
                                source_file_id=file.id,
                                task_id=extraction_task.id,
                                document_order=i
                            )
                            db.add(file_to_task)
            
            # Update template reference if provided
            if template_id:
                job.template_id = template_id
            
            # Update last activity
            job.last_active_at = datetime.utcnow()
            
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