"""
ARQ worker configuration and task definitions for ByteReview
Background worker system for asynchronous job processing
"""
import os
import asyncio
import logging
import uuid
import mimetypes
import tempfile
import zipfile
import shutil
from typing import Dict, Any
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

import sys
import os
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent  # Go up to backend/ directory
sys.path.insert(0, str(backend_dir))

from arq import create_pool
from arq.connections import RedisSettings
from sqlalchemy.orm import Session
from core.database import db_config
from models.db_models import ExtractionTask, ExtractionResult, SourceFile, JobField, SystemPrompt, SourceFileToTask, ExtractionJob, DataType
from models.job import FileStatus
from services.ai_extraction_service import AIExtractionService
from services.gcs_service import get_storage_service
import json

logger = logging.getLogger(__name__)

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

async def process_extraction_task(ctx: Dict[str, Any], task_id: str) -> Dict[str, Any]:
    """
    Process a single extraction task using AI
    This is the core background task for data extraction
    """
    logger.info(f"Processing extraction task: {task_id}")
    
    db = db_config.get_session()
    try:
        # Get the task from database
        task = db.query(ExtractionTask).filter(ExtractionTask.id == task_id).first()
        if not task:
            raise ValueError(f"Task {task_id} not found")
        
        # Update task status to processing
        task.status = "processing"
        db.commit()
        
        # Send SSE event for task started
        try:
            from services.sse_service import sse_manager
            await sse_manager.send_task_started(task.job_id, task_id)
        except Exception as e:
            logger.warning(f"Failed to send task_started SSE event: {e}")
        
        # Get associated source files (ordered by document_order)
        source_files_query = db.query(SourceFile, SourceFileToTask.document_order).join(
            SourceFileToTask, SourceFile.id == SourceFileToTask.source_file_id
        ).filter(
            SourceFileToTask.task_id == task_id
        ).order_by(SourceFileToTask.document_order)
        
        source_files_with_order = source_files_query.all()
        source_files = [sf for sf, _ in source_files_with_order]
        
        if not source_files:
            raise ValueError(f"No source files found for task {task_id}")
        
        # Get job fields (the snapshotted configuration)
        job_fields = db.query(JobField).filter(JobField.job_id == task.job_id).order_by(JobField.display_order).all()
        
        if not job_fields:
            raise ValueError(f"No job fields found for job {task.job_id}")
        
        # Get active system prompt
        system_prompt_record = db.query(SystemPrompt).filter(SystemPrompt.is_active == True).first()
        if not system_prompt_record:
            raise ValueError("No active system prompt found")
        
        # Get data types for JSON schema creation
        data_types = db.query(DataType).all()
        data_types_map = {
            dt.id: {
                "base_json_type": dt.base_json_type,
                "json_format": dt.json_format,
                "display_name": dt.display_name,
                "description": dt.description
            }
            for dt in data_types
        }
        
        # Convert job fields to FieldConfig format for AI service
        from models.extraction import FieldConfig
        field_configs = [
            FieldConfig(
                name=field.field_name,
                data_type=field.data_type_id,
                prompt=field.ai_prompt
            )
            for field in job_fields
        ]
        
        # Initialize services
        ai_service = AIExtractionService()
        storage_service = get_storage_service()
        
        # Download files from GCS and process them locally
        temp_dir = None
        files_data = []
        
        try:
            # Create temporary directory for downloaded files
            temp_dir = tempfile.mkdtemp(prefix=f"extraction_task_{task_id}_")
            logger.info(f"Created temporary directory for extraction: {temp_dir}")
            
            for source_file in source_files:
                logger.info(f"Downloading file for processing: {source_file.original_filename}")
                
                # Download file from GCS to temporary location
                file_extension = os.path.splitext(source_file.original_filename)[1]
                temp_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}{file_extension}")
                
                await storage_service.download_file(source_file.gcs_object_name, temp_file_path)
                logger.info(f"Downloaded {source_file.original_filename} to {temp_file_path}")
                
                # Read file content
                with open(temp_file_path, 'rb') as f:
                    file_content = f.read()
                
                files_data.append({
                    'filename': source_file.original_filename,
                    'content': file_content
                })
                
                logger.info(f"Prepared file data for {source_file.original_filename}, size: {len(file_content)} bytes")
            
            # Process files using downloaded content instead of GCS URIs
            logger.info(f"Processing {len(files_data)} files with AI using downloaded content")
            
            # Extract data using AI service with file content
            logger.info(f"Using processing mode: {task.processing_mode}")
            extraction_result = await ai_service.extract_data_from_files(
                files_data,
                field_configs,
                data_types_map,
                system_prompt_record.template_text,
                processed_files=source_files,  # Pass source files for metadata
                processing_mode=task.processing_mode  # Pass processing mode for routing
            )
            
        finally:
            # Clean up temporary directory
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                    logger.info(f"Cleaned up temporary directory: {temp_dir}")
                except Exception as e:
                    logger.warning(f"Failed to clean up temporary directory {temp_dir}: {e}")
        
        # Process the extraction result based on processing mode
        if not extraction_result.success:
            raise ValueError(f"AI extraction failed: {extraction_result.error}")
        
        # Convert AI service result to new simplified format: "results": [{row1}, {row2}]
        # The AI service returns data as an array of row objects, use it directly
        if extraction_result.data and isinstance(extraction_result.data, list):
            # AI returned array of row objects, use directly
            results_array = extraction_result.data
        else:
            # Fallback for unexpected format
            results_array = []
        
        # Create new simplified format for both individual and combined modes
        final_result = {
            "processing_mode": task.processing_mode,
            "results": results_array
        }
        
        # Save results to database
        extraction_result = ExtractionResult(
            task_id=task_id,
            extracted_data=final_result
        )
        db.add(extraction_result)
        
        # Update task status
        task.status = "completed"
        task.processed_at = datetime.utcnow()
        
        # Send SSE event for task completed
        try:
            from services.sse_service import sse_manager
            await sse_manager.send_task_completed(task.job_id, task_id, final_result)
        except Exception as e:
            logger.warning(f"Failed to send task_completed SSE event: {e}")
        
        # Check if all tasks for this job are completed
        job_tasks = db.query(ExtractionTask).filter(ExtractionTask.job_id == task.job_id).all()
        all_completed = all(t.status in ['completed', 'failed'] for t in job_tasks)
        
        if all_completed:
            # Update job status
            job = db.query(ExtractionJob).filter(ExtractionJob.id == task.job_id).first()
            if job:
                job.status = "completed"
                job.completed_at = datetime.utcnow()
                logger.info(f"Job {task.job_id} completed - all tasks finished")
                
                # Send SSE event for job completed
                try:
                    await sse_manager.send_job_completed(task.job_id)
                except Exception as e:
                    logger.warning(f"Failed to send job_completed SSE event: {e}")
        
        db.commit()
        
        logger.info(f"Successfully completed extraction task: {task_id}")
        return {"success": True, "task_id": task_id}
        
    except Exception as e:
        logger.error(f"Error processing extraction task {task_id}: {e}")
        
        # Update task status to failed only if task exists
        if 'task' in locals() and task is not None:
            task.status = "failed"
            task.error_message = str(e)
            db.commit()
            
            # Send SSE event for task failed
            try:
                from services.sse_service import sse_manager
                await sse_manager.send_task_failed(task.job_id, task_id, str(e))
            except Exception as e:
                logger.warning(f"Failed to send task_failed SSE event: {e}")
        else:
            logger.warning(f"Task {task_id} not found in database - likely stale queue item")
        
        # Don't re-raise for missing tasks to avoid infinite retries
        if "not found" in str(e):
            logger.info(f"Skipping missing task {task_id} to prevent retries")
            return {"success": False, "task_id": task_id, "error": "Task not found"}
        
        raise
    finally:
        db.close()

async def unpack_zip_file_task(ctx: Dict[str, Any], source_file_id: str) -> Dict[str, Any]:
    """
    Unpack a ZIP file and register its contents as individual source files
    This task runs in the high-memory ZIP worker pool
    """
    logger.info(f"Unpacking ZIP file: {source_file_id}")
    
    db = db_config.get_session()
    try:
        # Get the ZIP source file from database
        zip_file = db.query(SourceFile).filter(SourceFile.id == source_file_id).first()
        if not zip_file:
            raise ValueError(f"Source file {source_file_id} not found")
        
        # Update status to indicate unpacking has started
        zip_file.status = FileStatus.UNPACKING.value
        db.commit()
        
        # Initialize services
        storage_service = get_storage_service()
        
        temp_dir = None
        files_extracted = 0
        
        try:
            # Create temporary directory
            temp_dir = tempfile.mkdtemp(prefix=f"zip_extract_{source_file_id}_")
            logger.info(f"Created temporary directory: {temp_dir}")
            
            # Download ZIP file from GCS to temporary location
            zip_temp_path = os.path.join(temp_dir, "archive.zip")
            await storage_service.download_file(zip_file.gcs_object_name, zip_temp_path)
            logger.info(f"Downloaded ZIP file to: {zip_temp_path}")
            
            # Extract ZIP contents
            extract_dir = os.path.join(temp_dir, "extracted")
            os.makedirs(extract_dir, exist_ok=True)
            
            with zipfile.ZipFile(zip_temp_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
                logger.info(f"Extracted ZIP contents to: {extract_dir}")
            
            # Process extracted files
            for root, dirs, files in os.walk(extract_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    
                    # Skip hidden files and directories
                    if file.startswith('.'):
                        continue
                    
                    # Calculate relative path from extraction root
                    rel_path = os.path.relpath(file_path, extract_dir)
                    
                    # Normalize path separators
                    from services.gcs_service import normalize_path
                    normalized_path = normalize_path(rel_path)
                    
                    # Generate new GCS object name for extracted file
                    job_id = zip_file.job_id
                    file_extension = os.path.splitext(file)[1]
                    new_gcs_name = f"jobs/{job_id}/extracted/{uuid.uuid4()}{file_extension}"
                    
                    # Upload extracted file to GCS
                    await storage_service.upload_file(file_path, new_gcs_name)
                    logger.info(f"Uploaded extracted file: {normalized_path} -> {new_gcs_name}")
                    
                    # Get file size
                    file_size = os.path.getsize(file_path)
                    
                    # Determine MIME type
                    mime_type, _ = mimetypes.guess_type(file)
                    if not mime_type:
                        mime_type = "application/octet-stream"
                    
                    # Create new SourceFile record for extracted file
                    extracted_file = SourceFile(
                        job_id=job_id,
                        original_filename=file,
                        original_path=normalized_path,
                        gcs_object_name=new_gcs_name,
                        file_type=mime_type,
                        file_size_bytes=file_size,
                        status=FileStatus.UPLOADED.value  # Mark as uploaded since it's ready for processing
                    )
                    
                    db.add(extracted_file)
                    files_extracted += 1
            
            # Update original ZIP file status to "unpacked"
            zip_file.status = FileStatus.UNPACKED.value
            db.commit()
            
            # Send SSE events for extracted files
            try:
                from services.sse_service import sse_manager
            except ImportError:
                # Fallback for import issues
                import importlib.util
                spec = importlib.util.spec_from_file_location("sse_service", backend_dir / "services" / "sse_service.py")
                sse_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(sse_module)
                sse_manager = sse_module.sse_manager
            
            # Query the extracted files that were just added to the database
            extracted_files = db.query(SourceFile).filter(
                SourceFile.job_id == zip_file.job_id,
                SourceFile.status == "uploaded",
                SourceFile.id != zip_file.id  # Exclude the original ZIP file
            ).all()
            
            # Convert extracted files to dict format for SSE
            files_data = []
            for extracted_file in extracted_files:
                files_data.append({
                    "id": str(extracted_file.id),
                    "filename": extracted_file.original_filename,
                    "original_path": extracted_file.original_path,
                    "file_type": extracted_file.file_type,
                    "file_size": extracted_file.file_size_bytes,
                    "status": extracted_file.status
                })
            
            logger.info(f"Sending files_extracted event for {len(files_data)} files")
            await sse_manager.send_files_extracted(zip_file.job_id, files_data)
            logger.info(f"Sending file_status_changed event for ZIP file")
            await sse_manager.send_file_status_changed(zip_file.job_id, str(zip_file.id), "unpacked")
            logger.info(f"SSE events sent successfully for job {zip_file.job_id}")
            
            logger.info(f"Successfully unpacked ZIP file {source_file_id}: {files_extracted} files extracted")
            
        finally:
            # Clean up temporary directory
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                    logger.info(f"Cleaned up temporary directory: {temp_dir}")
                except Exception as e:
                    logger.warning(f"Failed to clean up temporary directory {temp_dir}: {e}")
        
        return {
            "success": True, 
            "source_file_id": source_file_id, 
            "files_extracted": files_extracted
        }
        
    except Exception as e:
        logger.error(f"Error unpacking ZIP file {source_file_id}: {e}")
        
        # Update status to failed
        if 'zip_file' in locals():
            zip_file.status = FileStatus.FAILED.value
            db.commit()
            
            # Send SSE event for extraction failure
            from services.sse_service import sse_manager
            try:
                from services.sse_service import sse_manager
                await sse_manager.send_extraction_failed(zip_file.job_id, str(zip_file.id), str(e))
            except ImportError as import_err:
                logger.error(f"Could not import SSE service for error notification: {import_err}")
        
        raise
    finally:
        db.close()

async def run_abandoned_cleanup(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Clean up abandoned jobs that were never started
    """
    logger.info("Running abandoned job cleanup")
    
    # TODO: Implement cleanup logic
    # Find jobs in 'pending_configuration' status older than X hours
    # Delete their files from GCS and remove from database
    
    return {"success": True, "jobs_cleaned": 0}

async def run_opt_out_cleanup(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Clean up data for users who opted out of data persistence
    """
    logger.info("Running opt-out data cleanup")
    
    # TODO: Implement cleanup logic
    # Find completed jobs where persist_data=false and older than grace period
    # Delete their files from GCS and remove from database
    
    return {"success": True, "jobs_cleaned": 0}

async def run_artifact_cleanup(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Clean up unpacked ZIP artifacts from GCS
    """
    logger.info("Running artifact cleanup")
    
    # TODO: Implement cleanup logic
    # Find source files with status='unpacked' (old ZIP files)
    # Delete their GCS objects
    
    return {"success": True, "artifacts_cleaned": 0}

# ARQ worker settings
class WorkerSettings:
    """ARQ worker configuration for AI extraction tasks (default queue)"""
    
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    
    # Task functions that the worker can execute
    functions = [
        process_extraction_task,
        run_abandoned_cleanup,
        run_opt_out_cleanup,
        run_artifact_cleanup,
    ]
    
    # Worker configuration for AI tasks (low memory, high concurrency)
    max_jobs = 5  # Reduce concurrent jobs to prevent Redis overload
    job_timeout = 300  # 5 minutes timeout per job
    keep_result = 3600  # Keep results for 1 hour
    
    # Logging
    log_results = True

class ZipWorkerSettings:
    """ARQ worker configuration for ZIP unpacking tasks (zip_queue)"""
    
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    queue_name = "zip_queue"  # Dedicated queue for ZIP tasks
    
    # Task functions for ZIP processing
    functions = [
        unpack_zip_file_task,
    ]
    
    # Worker configuration for ZIP tasks (high memory, low concurrency)
    max_jobs = 1  # Low concurrency to prevent memory issues
    job_timeout = 1800  # 30 minutes timeout for large ZIP files
    keep_result = 3600  # Keep results for 1 hour
    
    # Logging
    log_results = True

async def main():
    """For testing the worker locally"""
    redis = await create_pool(WorkerSettings.redis_settings)
    
    # Example: enqueue a test task
    job = await redis.enqueue_job('process_extraction_task', 'test-task-id')
    print(f"Enqueued job: {job}")
    
    await redis.close()

if __name__ == "__main__":
    asyncio.run(main())