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
from datetime import datetime, timezone
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
from core.database import db_config, get_db
from models.db_models import ExtractionTask, ExtractionResult, SourceFile, JobField, SystemPrompt, SourceFileToTask, ExtractionJob, DataType
from models.job import FileStatus
from services.ai_extraction_service import AIExtractionService
from services.gcs_service import get_storage_service
from services.google_service import google_service
import json
import io
from typing import List

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
        
        # Convert AI service result to new array-based format with column snapshot
        if extraction_result.data and isinstance(extraction_result.data, list):
            # Get field order from job configuration (snapshot at extraction time)
            field_order = [field.field_name for field in job_fields]
            
            # Convert object-based results to array-based results
            results_arrays = []
            for result_obj in extraction_result.data:
                if isinstance(result_obj, dict):
                    # Convert dict to array using field order
                    result_array = []
                    for field_name in field_order:
                        result_array.append(result_obj.get(field_name))
                    results_arrays.append(result_array)
                else:
                    # Fallback for unexpected format
                    results_arrays.append(result_obj)
            
            # Create new array-based format with column snapshot
            final_result = {
                "results": results_arrays,
                "columns": field_order
            }
        else:
            # Fallback for unexpected format
            final_result = {
                "results": [],
                "columns": [field.field_name for field in job_fields]
            }
        
        # Save results to database
        extraction_result = ExtractionResult(
            task_id=task_id,
            extracted_data=final_result
        )
        db.add(extraction_result)
        
        # Update task status
        task.status = "completed"
        task.processed_at = datetime.now(timezone.utc)
        
        # Increment job-level task completion counter
        try:
            from services.job_service import JobService
            job_service = JobService()
            await job_service.increment_task_completion(task.job_id, success=True)
            logger.info(f"Incremented task completion counter for job {task.job_id}")
        except Exception as e:
            logger.error(f"Failed to increment task completion counter: {e}")
        
        # Send SSE event for task completed
        try:
            from services.sse_service import sse_manager
            await sse_manager.send_task_completed(task.job_id, task_id, final_result)
        except Exception as e:
            logger.warning(f"Failed to send task_completed SSE event: {e}")
        
        db.commit()
        
        logger.info(f"Successfully completed extraction task: {task_id}")
        return {"success": True, "task_id": task_id}
        
    except Exception as e:
        logger.error(f"Error processing extraction task {task_id}: {e}")
        
        # Update task status to failed only if task exists
        if 'task' in locals() and task is not None:
            task.status = "failed"
            task.error_message = str(e)
            
            # Increment job-level task failure counter
            try:
                from services.job_service import JobService
                job_service = JobService()
                await job_service.increment_task_completion(task.job_id, success=False)
                logger.info(f"Incremented task failure counter for job {task.job_id}")
            except Exception as e:
                logger.error(f"Failed to increment task failure counter: {e}")
            
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

# ImportWorkerSettings will be defined after the functions

# ===================================================================
# Import Worker Functions (Drive, Gmail)
# ===================================================================

async def import_startup(ctx: Dict[str, Any]) -> None:
    """Initialize import worker resources"""
    logger.info("Import worker starting up...")

async def import_shutdown(ctx: Dict[str, Any]) -> None:
    """Cleanup import worker resources"""
    logger.info("Import worker shutting down...")

async def import_drive_files(
    ctx: Dict[str, Any],
    job_id: str, 
    user_id: str, 
    drive_file_ids: List[str]
) -> Dict[str, Any]:
    """
    Import files from Google Drive
    
    Args:
        job_id: Extraction job ID
        user_id: User ID for OAuth credentials
        drive_file_ids: List of Google Drive file IDs to import
        
    Returns:
        Dict with import results and status
    """
    logger.info(f"Starting Drive import for job {job_id}, {len(drive_file_ids)} files")
    
    results = {
        'job_id': job_id,
        'total_files': len(drive_file_ids),
        'successful': 0,
        'failed': 0,
        'errors': []
    }
    
    with next(get_db()) as db:
        try:
            # Verify job exists and user has access
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found or access denied")
            
            # Send import started event
            from services.sse_service import sse_manager
            await sse_manager.send_import_started(job_id, "Google Drive", len(drive_file_ids))
            
            # Process each Drive file
            for file_id in drive_file_ids:
                try:
                    await _import_single_drive_file(db, job_id, user_id, file_id)
                    results['successful'] += 1
                    logger.info(f"Successfully imported Drive file {file_id}")
                    
                except Exception as e:
                    logger.error(f"Failed to import Drive file {file_id}: {e}")
                    results['failed'] += 1
                    results['errors'].append({
                        'file_id': file_id,
                        'error': str(e)
                    })
            
            # Send import batch completed event
            await sse_manager.send_import_batch_completed(job_id, "Google Drive", results['successful'], results['total_files'])
            
            # Update job status
            if results['failed'] == 0:
                logger.info(f"Drive import completed successfully for job {job_id}")
            else:
                logger.warning(f"Drive import completed with {results['failed']} failures for job {job_id}")
            
            return results
            
        except Exception as e:
            logger.error(f"Drive import failed for job {job_id}: {e}")
            results['errors'].append({'general': str(e)})
            raise

async def import_gmail_attachments(
    ctx: Dict[str, Any],
    job_id: str,
    user_id: str,
    attachment_data: List[Dict[str, str]]
) -> Dict[str, Any]:
    """
    Import attachments from Gmail
    
    Args:
        job_id: Extraction job ID
        user_id: User ID for OAuth credentials
        attachment_data: List of dicts with message_id, attachment_id, filename
        
    Returns:
        Dict with import results and status
    """
    logger.info(f"Starting Gmail import for job {job_id}, {len(attachment_data)} attachments")
    
    results = {
        'job_id': job_id,
        'total_files': len(attachment_data),
        'successful': 0,
        'failed': 0,
        'errors': []
    }
    
    with next(get_db()) as db:
        try:
            # Verify job exists and user has access
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found or access denied")
            
            # Process each Gmail attachment
            for attachment in attachment_data:
                try:
                    await _import_single_gmail_attachment(
                        db, job_id, user_id, attachment
                    )
                    results['successful'] += 1
                    logger.info(f"Successfully imported Gmail attachment {attachment['filename']}")
                    
                except Exception as e:
                    logger.error(f"Failed to import Gmail attachment {attachment['filename']}: {e}")
                    results['failed'] += 1
                    results['errors'].append({
                        'filename': attachment['filename'],
                        'message_id': attachment['message_id'],
                        'error': str(e)
                    })
            
            # Update job status
            if results['failed'] == 0:
                logger.info(f"Gmail import completed successfully for job {job_id}")
            else:
                logger.warning(f"Gmail import completed with {results['failed']} failures for job {job_id}")
            
            return results
            
        except Exception as e:
            logger.error(f"Gmail import failed for job {job_id}: {e}")
            results['errors'].append({'general': str(e)})
            raise

async def _import_single_drive_file(
    db: Session, 
    job_id: str, 
    user_id: str, 
    file_id: str
) -> None:
    """Import a single file or folder from Google Drive"""
    
    try:
        logger.info(f"Getting metadata for Drive file {file_id}")
        # Get file metadata from Drive
        file_metadata = google_service.get_drive_file_metadata(db, user_id, file_id)
        if not file_metadata:
            raise ValueError(f"Could not get metadata for Drive file {file_id}")
        
        filename = file_metadata['name']
        file_size = int(file_metadata.get('size', 0))
        mime_type = file_metadata.get('mimeType', 'application/octet-stream')
        
        logger.info(f"Importing Drive item: {filename} ({file_size} bytes), MIME: {mime_type}")
        
        # Check if this is a folder
        if mime_type == 'application/vnd.google-apps.folder':
            logger.info(f"Processing Drive folder: {filename}")
            await _import_drive_folder(db, job_id, user_id, file_id, filename)
            return
        
        logger.info(f"Creating source file record for {filename}")
        # Create source file record for regular file
        source_file = SourceFile(
            job_id=job_id,
            original_filename=filename,
            original_path=filename,
            gcs_object_name=f"imports/{job_id}/{file_id}_{filename}",
            file_type=mime_type,
            file_size_bytes=file_size,
            status='importing',
            source_type='drive',
            external_id=file_id
        )
        db.add(source_file)
        logger.info(f"Committing source file record")
        db.commit()
        db.refresh(source_file)
        logger.info(f"Source file record created successfully")
    except Exception as e:
        logger.error(f"Error in metadata/record creation phase: {e}")
        raise
    
    try:
        # Download file from Drive
        file_content = google_service.download_drive_file(db, user_id, file_id)
        if not file_content:
            raise ValueError(f"Could not download Drive file {file_id}")
        
        # Upload to GCS
        storage_service = get_storage_service()
        await storage_service.upload_file_content(
            file_content=file_content,
            gcs_object_name=source_file.gcs_object_name
        )
        
        # Note: ZIP extraction is handled by the ZIP worker, not the import worker
        
        # Update status to ready
        source_file.status = 'ready'
        source_file.updated_at = datetime.now(timezone.utc)
        db.commit()
        
        # Handle ZIP detection using centralized logic
        from services.job_service import JobService
        job_service = JobService()
        await job_service._handle_zip_detection(db, source_file, mime_type, filename)
        
        # Send import completed event
        from services.sse_service import sse_manager
        await sse_manager.send_import_completed(
            job_id, 
            str(source_file.id), 
            filename, 
            file_size, 
            source_file.status,  # Use actual status (ready or unpacking)
            source_file.original_path  # Include original path
        )
        
        logger.info(f"Successfully imported Drive file {filename} to GCS")
        
    except Exception as e:
        # Update status to failed
        source_file.status = 'failed'
        source_file.updated_at = datetime.now(timezone.utc)
        db.commit()
        raise

async def _import_drive_folder(
    db: Session,
    job_id: str,
    user_id: str,
    folder_id: str,
    folder_name: str,
    parent_path: str = ""
) -> None:
    """Import all files from a Google Drive folder recursively"""
    
    logger.info(f"Processing Drive folder: {folder_name} (ID: {folder_id})")
    
    try:
        # Get folder contents from Google Drive
        folder_contents = google_service.list_drive_folder_contents(db, user_id, folder_id)
        if not folder_contents:
            logger.info(f"Folder {folder_name} is empty or inaccessible")
            return
        
        # Build current folder path
        current_path = os.path.join(parent_path, folder_name) if parent_path else folder_name
        
        # Process each item in the folder
        for item in folder_contents:
            item_id = item['id']
            item_name = item['name']
            item_mime_type = item.get('mimeType', 'application/octet-stream')
            item_size = int(item.get('size', 0))
            
            # Build full path for this item
            item_path = os.path.join(current_path, item_name)
            
            logger.info(f"Processing folder item: {item_path} (MIME: {item_mime_type})")
            
            if item_mime_type == 'application/vnd.google-apps.folder':
                # Recursively process subfolder
                logger.info(f"Found subfolder: {item_name}")
                await _import_drive_folder(db, job_id, user_id, item_id, item_name, current_path)
            else:
                # Process regular file
                logger.info(f"Found file: {item_name} ({item_size} bytes)")
                await _import_drive_file_from_folder(db, job_id, user_id, item_id, item_name, item_path, item_mime_type, item_size)
                
    except Exception as e:
        logger.error(f"Failed to process Drive folder {folder_name}: {e}")
        raise

async def _import_drive_file_from_folder(
    db: Session,
    job_id: str,
    user_id: str,
    file_id: str,
    filename: str,
    full_path: str,
    mime_type: str,
    file_size: int
) -> None:
    """Import a single file from within a Drive folder"""
    
    logger.info(f"Importing file from folder: {full_path}")
    
    try:
        # Create source file record
        source_file = SourceFile(
            job_id=job_id,
            original_filename=filename,
            original_path=full_path,  # Full path within folder structure
            gcs_object_name=f"imports/{job_id}/{file_id}_{filename}",
            file_type=mime_type,
            file_size_bytes=file_size,
            status='importing',
            source_type='drive',
            external_id=file_id
        )
        db.add(source_file)
        db.commit()
        db.refresh(source_file)
        
        # Download file from Drive
        file_content = google_service.download_drive_file(db, user_id, file_id)
        if not file_content:
            raise ValueError(f"Could not download Drive file {file_id}")
        
        # Upload to GCS
        storage_service = get_storage_service()
        await storage_service.upload_file_content(
            file_content=file_content,
            gcs_object_name=source_file.gcs_object_name
        )
        
        # Update status to ready
        source_file.status = 'ready'
        source_file.updated_at = datetime.now(timezone.utc)
        db.commit()
        
        # Handle ZIP detection using centralized logic
        from services.job_service import JobService
        job_service = JobService()
        await job_service._handle_zip_detection(db, source_file, mime_type, filename)
        
        # Send import completed event
        from services.sse_service import sse_manager
        await sse_manager.send_import_completed(
            job_id, 
            str(source_file.id), 
            filename, 
            file_size, 
            source_file.status,  # Use actual status (ready or unpacking)
            source_file.original_path  # Include original path
        )
        
        logger.info(f"Successfully imported file from folder: {full_path}")
        
    except Exception as e:
        # Update status to failed
        if 'source_file' in locals():
            source_file.status = 'failed'
            source_file.updated_at = datetime.now(timezone.utc)
            db.commit()
        logger.error(f"Failed to import file from folder {full_path}: {e}")
        raise

async def _import_single_gmail_attachment(
    db: Session,
    job_id: str,
    user_id: str,
    attachment: Dict[str, str]
) -> None:
    """Import a single attachment from Gmail"""
    
    message_id = attachment['message_id']
    attachment_id = attachment['attachment_id']
    filename = attachment['filename']
    
    logger.info(f"Importing Gmail attachment: {filename}")
    
    # Download attachment from Gmail
    file_content = google_service.download_gmail_attachment(
        db, user_id, message_id, attachment_id
    )
    if not file_content:
        raise ValueError(f"Could not download Gmail attachment {filename}")
    
    file_size = len(file_content)
    
    # Determine MIME type from filename
    mime_type = 'application/pdf' if filename.lower().endswith('.pdf') else 'application/octet-stream'
    
    # Create source file record
    source_file = SourceFile(
        job_id=job_id,
        original_filename=filename,
        original_path=filename,
        gcs_object_name=f"imports/{job_id}/{message_id}_{attachment_id}_{filename}",
        file_type=mime_type,
        file_size_bytes=file_size,
        status='importing',
        source_type='gmail',
        external_id=f"{message_id}:{attachment_id}"
    )
    db.add(source_file)
    db.commit()
    db.refresh(source_file)
    
    try:
        # Upload to GCS
        storage_service = get_storage_service()
        await storage_service.upload_file_content(
            file_content=file_content,
            gcs_object_name=source_file.gcs_object_name
        )
        
        # Note: ZIP extraction is handled by the ZIP worker, not the import worker
        
        # Update status to ready
        source_file.status = 'ready'
        source_file.updated_at = datetime.now(timezone.utc)
        db.commit()
        
        # Handle ZIP detection using centralized logic
        from services.job_service import JobService
        job_service = JobService()
        await job_service._handle_zip_detection(db, source_file, mime_type, filename)
        
        # Send import completed event
        from services.sse_service import sse_manager
        await sse_manager.send_import_completed(
            job_id, 
            str(source_file.id), 
            filename, 
            file_size, 
            source_file.status,  # Use actual status (ready or unpacking)
            source_file.original_path  # Include original path
        )
        
        logger.info(f"Successfully imported Gmail attachment {filename} to GCS")
        
    except Exception as e:
        # Update status to failed
        source_file.status = 'failed'
        source_file.updated_at = datetime.now(timezone.utc)
        db.commit()
        raise

async def _handle_zip_file(
    db: Session,
    source_file: SourceFile,
    zip_content: bytes
) -> None:
    """Handle ZIP file extraction and create individual source file records"""
    logger.info(f"Processing ZIP file: {source_file.original_filename}")
    
    try:
        with zipfile.ZipFile(io.BytesIO(zip_content), 'r') as zip_ref:
            for file_info in zip_ref.infolist():
                # Skip directories and hidden files
                if file_info.is_dir() or file_info.filename.startswith('.'):
                    continue
                
                # Extract individual file
                extracted_content = zip_ref.read(file_info.filename)
                extracted_filename = os.path.basename(file_info.filename)
                
                # Determine MIME type
                if extracted_filename.lower().endswith('.pdf'):
                    mime_type = 'application/pdf'
                else:
                    mime_type = 'application/octet-stream'
                
                # Create source file record for extracted file
                extracted_source_file = SourceFile(
                    job_id=source_file.job_id,
                    original_filename=extracted_filename,
                    original_path=file_info.filename,  # Full path within ZIP
                    gcs_object_name=f"imports/{source_file.job_id}/extracted_{extracted_filename}",
                    file_type=mime_type,
                    file_size_bytes=len(extracted_content),
                    status='importing',
                    source_type=source_file.source_type,
                    external_id=f"{source_file.external_id}:{file_info.filename}"
                )
                db.add(extracted_source_file)
                db.flush()  # Get ID without committing
                
                try:
                    # Upload extracted file to GCS
                    storage_service = get_storage_service()
                    await storage_service.upload_file_content(
                        file_content=extracted_content,
                        gcs_object_name=extracted_source_file.gcs_object_name
                    )
                    
                    extracted_source_file.status = 'ready'
                    logger.info(f"Extracted and uploaded: {extracted_filename}")
                    
                except Exception as e:
                    extracted_source_file.status = 'failed'
                    logger.error(f"Failed to upload extracted file {extracted_filename}: {e}")
            
            db.commit()
            logger.info(f"ZIP processing completed for {source_file.original_filename}")
            
    except Exception as e:
        logger.error(f"Failed to process ZIP file {source_file.original_filename}: {e}")
        raise

class ImportWorkerSettings:
    """ARQ worker configuration for import tasks (imports queue)"""
    
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    queue_name = "imports"  # Dedicated queue for import tasks
    
    # Task functions for import processing
    functions = [
        import_drive_files,
        import_gmail_attachments
    ]
    
    # Worker configuration for import tasks (moderate concurrency)
    max_jobs = 10  # Higher concurrency for I/O bound tasks
    job_timeout = 300  # 5 minutes timeout for import operations
    keep_result = 3600  # Keep results for 1 hour
    
    # Logging
    log_results = True

# ===================================================================
# Export Worker Functions (Google Drive, etc.)
# ===================================================================

async def export_startup(ctx: Dict[str, Any]) -> None:
    """Initialize export worker resources"""
    logger.info("Export worker starting up...")

async def export_shutdown(ctx: Dict[str, Any]) -> None:
    """Cleanup export worker resources"""
    logger.info("Export worker shutting down...")

async def export_job_to_google_drive(
    ctx: Dict[str, Any],
    job_id: str,
    user_id: str,
    file_type: str,  # 'csv' or 'xlsx'
    folder_id: str = None
) -> Dict[str, Any]:
    """
    Export job results to Google Drive as CSV or Excel
    
    Args:
        job_id: Extraction job ID
        user_id: User ID for OAuth credentials
        file_type: Export format ('csv' or 'xlsx')
        folder_id: Optional Google Drive folder ID
        
    Returns:
        Dict with export results and Google Drive file info
    """
    logger.info(f"Starting Google Drive export for job {job_id}, format: {file_type}")
    
    with next(get_db()) as db:
        try:
            # Import here to avoid circular imports
            from models.db_models import JobExport
            from services.job_service import JobService
            from services.google_service import google_service
            
            # Verify job exists and user has access
            job = db.query(ExtractionJob).filter(
                ExtractionJob.id == job_id,
                ExtractionJob.user_id == user_id
            ).first()
            
            if not job:
                raise ValueError(f"Job {job_id} not found or access denied")
            
            # Create JobExport record to track the export
            job_export = JobExport(
                job_id=job_id,
                dest_type="gdrive",
                file_type=file_type,
                status="processing"
            )
            db.add(job_export)
            db.commit()
            db.refresh(job_export)
            
            # Send export started event
            from services.sse_service import sse_manager
            await sse_manager.send_export_started(job_id, "Google Drive", file_type)
            
            # Get job results
            job_service = JobService()
            results_response = await job_service.get_job_results(user_id, job_id)
            
            if not results_response.results:
                raise ValueError("No results found for this job")
            
            # Generate export content based on file type
            if file_type == "csv":
                content = _generate_csv_content(results_response)
                filename = f"job_{job_id}_results.csv"
                mime_type = "text/csv"
                content_bytes = content.encode('utf-8')
            elif file_type == "xlsx":
                content_bytes = _generate_excel_content(results_response)
                filename = f"job_{job_id}_results.xlsx"
                mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            else:
                raise ValueError(f"Unsupported file type: {file_type}")
            
            # Upload to Google Drive
            drive_file = google_service.upload_to_drive(
                db=db,
                user_id=user_id,
                file_content=content_bytes,
                filename=filename,
                mime_type=mime_type,
                folder_id=folder_id
            )
            
            if not drive_file:
                raise ValueError("Failed to upload to Google Drive")
            
            # Update JobExport record with success
            job_export.status = "completed"
            job_export.external_id = drive_file.get('id')
            db.commit()
            
            # Send export completed event
            await sse_manager.send_export_completed(
                job_id, 
                "Google Drive", 
                file_type,
                drive_file.get('webViewLink')
            )
            
            logger.info(f"Successfully exported job {job_id} to Google Drive: {drive_file.get('id')}")
            
            return {
                "success": True,
                "job_id": job_id,
                "file_type": file_type,
                "drive_file_id": drive_file.get('id'),
                "drive_file_name": drive_file.get('name'),
                "web_view_link": drive_file.get('webViewLink'),
                "web_content_link": drive_file.get('webContentLink')
            }
            
        except Exception as e:
            logger.error(f"Google Drive export failed for job {job_id}: {e}")
            
            # Update JobExport record with failure
            if 'job_export' in locals():
                job_export.status = "failed"
                job_export.error_message = str(e)
                db.commit()
            
            # Send export failed event
            try:
                from services.sse_service import sse_manager
                await sse_manager.send_export_failed(job_id, "Google Drive", file_type, str(e))
            except Exception as sse_error:
                logger.warning(f"Failed to send export_failed SSE event: {sse_error}")
            
            raise

def _generate_csv_content(results_response) -> str:
    """Generate CSV content from job results (sync version for worker)"""
    import csv
    from io import StringIO
    
    if not results_response.results:
        raise ValueError("No results found for this job")
    
    # Create CSV content
    output = StringIO()
    
    # Determine field names from the first result
    first_result = results_response.results[0]
    if not first_result.extracted_data:
        raise ValueError("No extracted data found")
    
    # Get field names from the columns snapshot in extracted_data
    if "columns" not in first_result.extracted_data:
        raise ValueError("Invalid extracted data format - missing columns")
    
    field_names = first_result.extracted_data["columns"]
    
    # Process array-based results
    writer = csv.DictWriter(output, fieldnames=field_names)
    writer.writeheader()
    
    for result in results_response.results:
        if result.extracted_data and "results" in result.extracted_data:
            for result_array in result.extracted_data["results"]:
                row = {}
                for i, field_name in enumerate(field_names):
                    if i < len(result_array):
                        value = result_array[i]
                        row[field_name] = str(value) if value is not None else ""
                    else:
                        row[field_name] = ""
                writer.writerow(row)
    
    # Get CSV content
    csv_content = output.getvalue()
    output.close()
    return csv_content

def _generate_excel_content(results_response) -> bytes:
    """Generate Excel content from job results (sync version for worker)"""
    import openpyxl
    from io import BytesIO
    
    if not results_response.results:
        raise ValueError("No results found for this job")
    
    # Create Excel workbook
    workbook = openpyxl.Workbook()
    worksheet = workbook.active
    worksheet.title = "Extraction Results"
    
    # Determine field names from the first result
    first_result = results_response.results[0]
    if not first_result.extracted_data:
        raise ValueError("No extracted data found")
    
    # Get field names from the columns snapshot in extracted_data
    if "columns" not in first_result.extracted_data:
        raise ValueError("Invalid extracted data format - missing columns")
    
    field_names = first_result.extracted_data["columns"]
    
    # Write headers
    for col_idx, field_name in enumerate(field_names, 1):
        worksheet.cell(row=1, column=col_idx, value=field_name)
    
    # Process array-based results
    row_idx = 2
    for result in results_response.results:
        if result.extracted_data and "results" in result.extracted_data:
            for result_array in result.extracted_data["results"]:
                for col_idx, field_name in enumerate(field_names, 1):
                    if col_idx - 1 < len(result_array):
                        value = result_array[col_idx - 1]
                        cell_value = str(value) if value is not None else ""
                    else:
                        cell_value = ""
                    worksheet.cell(row=row_idx, column=col_idx, value=cell_value)
                row_idx += 1
    
    # Save to BytesIO
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output.getvalue()

class ExportWorkerSettings:
    """ARQ worker configuration for export tasks (exports queue)"""
    
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    queue_name = "exports"  # Dedicated queue for export tasks
    
    # Task functions for export processing
    functions = [
        export_job_to_google_drive
    ]
    
    # Worker configuration for export tasks (moderate concurrency)
    max_jobs = 5  # Moderate concurrency for export operations
    job_timeout = 600  # 10 minutes timeout for export operations (longer for large datasets)
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