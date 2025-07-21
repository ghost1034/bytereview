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
    ExtractionTaskResult, JobFileInfo, FileStatus
)
from models.db_models import (
    ExtractionJob, SourceFile, JobField, ExtractionTask, SourceFileToTask,
    ExtractionResult, Template, TemplateField
)
from core.database import db_config
from services.gcs_service import get_storage_service
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import func
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
        """Get database session"""
        return db_config.get_session()

    def _normalize_path(self, path: str) -> str:
        """Normalize file path for consistent storage"""
        # Replace backslashes with forward slashes and remove leading/trailing slashes
        normalized = path.replace('\\', '/').strip('/')
        return normalized

    def _filter_processable_files(self, query):
        """Filter out archive files that are only used for unpacking, not data extraction"""
        return query.filter(
            ~SourceFile.file_type.in_([
                'application/zip', 
                'application/x-zip-compressed',
                'application/x-7z-compressed',
                'application/x-rar-compressed'
            ])
        )

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
                status=JobStatus.PENDING_CONFIGURATION.value  # Start with pending_configuration status
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
                ExtractionJob.status == JobStatus.PENDING_CONFIGURATION.value
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found or not in pending configuration state")
            
            # Update job details
            job.persist_data = request.persist_data
            job.status = JobStatus.PROCESSING.value
            
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
            folder_path = os.path.dirname(file.original_path) or "/"
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
            
            return JobDetailsResponse(
                id=str(job.id),
                name=job.name,
                status=JobStatus(job.status),
                persist_data=job.persist_data,
                created_at=job.created_at,
                completed_at=job.completed_at,
                job_fields=field_info
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
            
            # Get jobs with file counts
            jobs_query = db.query(
                ExtractionJob,
                func.count(SourceFile.id).label('file_count')
            ).outerjoin(SourceFile).filter(
                ExtractionJob.user_id == user_id
            ).group_by(ExtractionJob.id).order_by(
                ExtractionJob.created_at.desc()
            ).limit(limit).offset(offset)
            
            jobs_with_counts = jobs_query.all()
            
            job_items = [
                JobListItem(
                    id=str(job.id),
                    name=job.name,
                    status=JobStatus(job.status),
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
            
            # Count tasks by status
            task_counts = db.query(
                ExtractionTask.status,
                func.count(ExtractionTask.id)
            ).filter(
                ExtractionTask.job_id == job.id
            ).group_by(ExtractionTask.status).all()
            
            total_tasks = sum(count for _, count in task_counts)
            completed = sum(count for status, count in task_counts if status == 'completed')
            failed = sum(count for status, count in task_counts if status == 'failed')
            
            return JobProgressResponse(
                total_tasks=total_tasks,
                completed=completed,
                failed=failed,
                status=JobStatus(job.status)
            )
            
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
                ExtractionJob.status == JobStatus.PENDING_CONFIGURATION.value
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
                ExtractionJob.status == JobStatus.PENDING_CONFIGURATION.value
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