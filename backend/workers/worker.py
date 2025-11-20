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

# ARQ imports removed - now using Cloud Run Tasks
from sqlalchemy.orm import Session
from core.database import db_config, get_db
from models.db_models import ExtractionTask, ExtractionResult, SourceFile, JobField, SystemPrompt, SourceFileToTask, ExtractionJob, JobRun, DataType
from models.job import FileStatus
from services.ai_extraction_service import AIExtractionService
from services.gcs_service import get_storage_service
from services.google_service import google_service
import json
import io
from typing import List

logger = logging.getLogger(__name__)

# Redis configuration removed - using Cloud Run Tasks instead

async def process_extraction_task(ctx: Dict[str, Any], task_id: str, automation_run_id: str = None) -> Dict[str, Any]:
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
        
        # Get associated source files (natural order by original_path then id)
        source_files_query = db.query(SourceFile).join(
            SourceFileToTask, SourceFile.id == SourceFileToTask.source_file_id
        ).filter(
            SourceFileToTask.task_id == task_id
        ).order_by(SourceFile.original_path, SourceFile.id)
        
        source_files = source_files_query.all()
        
        # Update task status to processing
        task.status = "processing"
        db.commit()
        
        # Get the job ID for SSE events (need to get parent job from job run)
        job_run = db.query(JobRun).filter(JobRun.id == task.job_run_id).first()
        if not job_run:
            raise ValueError(f"Job run {task.job_run_id} not found")
        parent_job_id = str(job_run.job_id)
        
        # Send SSE event for task started
        try:
            from services.sse_service import sse_manager
            await sse_manager.send_task_started(parent_job_id, task_id)
        except Exception as e:
            logger.warning(f"Failed to send task_started SSE event: {e}")
        
        if not source_files:
            raise ValueError(f"No source files found for task {task_id}")
        
        # Get job fields from the job run (the snapshotted configuration)
        job_fields = db.query(JobField).filter(JobField.job_run_id == task.job_run_id).order_by(JobField.display_order).all()
        
        if not job_fields:
            raise ValueError(f"No job fields found for job run {task.job_run_id}")
        
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

        # Ensure GCS service supports URI construction (Vertex requires GCS URIs)
        if not hasattr(storage_service, 'construct_gcs_uri_for_object'):
            raise Exception("GCS is not available in this environment; Vertex AI extraction requires GCS URIs.")

        # Build files_data with GCS URIs; convert DOCX to PDF when necessary
        files_data = []
        from services.document_conversion_service import get_document_conversion_service, DOCX_MIME
        conv = get_document_conversion_service()

        for source_file in source_files:
            filename = source_file.original_filename
            mime_type = (source_file.file_type or '').lower()

            # Determine if conversion is required (DOCX)
            needs_docx_conv = mime_type == DOCX_MIME or (filename and filename.lower().endswith('.docx'))

            if needs_docx_conv:
                try:
                    # Build destination object name under conversions/
                    job_run_id = str(task.job_run_id)
                    dest_object = f"jobs/{job_run_id}/conversions/{source_file.id}.pdf"
                    # Convert: download docx, convert locally, upload pdf
                    await conv.convert_docx_gcs_to_pdf_gcs(
                        storage_service,
                        source_file.gcs_object_name,
                        dest_object,
                    )
                    # Use the converted PDF gs:// URI
                    gcs_uri = storage_service.construct_gcs_uri_for_object(dest_object)
                    files_data.append({
                        'filename': (filename[:-5] + '.pdf') if filename and filename.lower().endswith('.docx') else (filename + '.pdf' if filename else 'converted.pdf'),
                        'uri': gcs_uri,
                        'mime_type': 'application/pdf',
                    })
                    logger.info(f"Converted DOCX to PDF for {filename} -> {dest_object}")
                except Exception as e:
                    logger.error(f"DOCX conversion failed for {filename}: {e}")
                    # Mark this file as failed in document results later by leaving it out; AI will only see valid inputs.
                    continue
            else:
                # No conversion needed; use the original GCS URI
                try:
                    gcs_uri = storage_service.construct_gcs_uri_for_object(source_file.gcs_object_name)
                except Exception:
                    from services.gcs_service import construct_gcs_uri
                    gcs_uri = construct_gcs_uri(storage_service.get_bucket_name(), source_file.gcs_object_name)
                files_data.append({
                    'filename': filename,
                    'uri': gcs_uri,
                    'mime_type': mime_type or 'application/pdf',
                })

        logger.info(f"Processing {len(files_data)} files with AI via Vertex using GCS URIs")
        logger.info(f"Using processing mode: {task.processing_mode}")
        # Augment system prompt with run-level description if provided
        system_prompt_text = system_prompt_record.template_text
        if hasattr(job_run, 'description') and job_run.description:
            system_prompt_text = f"{system_prompt_text}\n\nExtraction purpose: {job_run.description}"
        
        extraction_result = await ai_service.extract_data_from_files(
            files_data,
            field_configs,
            data_types_map,
            system_prompt_text,
            processed_files=source_files,  # Pass source files for metadata
            processing_mode=task.processing_mode  # Pass processing mode for routing
        )
        
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
        
        # Record usage for billing (count pages processed)
        try:
            await _record_usage_for_task(db, task, source_files)
        except Exception as e:
            logger.error(f"Failed to record usage for billing: {e}")
            # Don't fail the task for billing errors
        
        # Persist results and task status before emitting any SSE or updating run counters
        db.commit()
        
        # Increment run-level task completion counter (uses its own DB session)
        try:
            from services.job_service import JobService
            job_service = JobService()
            automation_run_id = ctx.get('automation_run_id')
            await job_service.increment_task_completion(task.job_run_id, success=True, automation_run_id=automation_run_id)
            logger.info(f"Incremented task completion counter for job run {task.job_run_id}")
        except Exception as e:
            logger.error(f"Failed to increment task completion counter: {e}")
        
        # Send SSE event for task completed (after DB commit)
        try:
            from services.sse_service import sse_manager
            await sse_manager.send_task_completed(parent_job_id, task_id, final_result)
        except Exception as e:
            logger.warning(f"Failed to send task_completed SSE event: {e}")
        
        logger.info(f"Successfully completed extraction task: {task_id}")
        return {"success": True, "task_id": task_id}
        
    except Exception as e:
        logger.error(f"Error processing extraction task {task_id}: {e}")
        
        # Update task status to failed only if task exists
        if 'task' in locals() and task is not None:
            task.status = "failed"
            task.error_message = str(e)
            
            # Get parent job ID for SSE events
            job_run = db.query(JobRun).filter(JobRun.id == task.job_run_id).first()
            parent_job_id = str(job_run.job_id) if job_run else "unknown"
            
            # Increment run-level task failure counter
            try:
                from services.job_service import JobService
                job_service = JobService()
                automation_run_id = ctx.get('automation_run_id')
                await job_service.increment_task_completion(task.job_run_id, success=False, automation_run_id=automation_run_id)
                logger.info(f"Incremented task failure counter for job run {task.job_run_id}")
            except Exception as e:
                logger.error(f"Failed to increment task failure counter: {e}")
            
            db.commit()
            
            # Send SSE event for task failed
            try:
                from services.sse_service import sse_manager
                await sse_manager.send_task_failed(parent_job_id, task_id, str(e))
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

async def unpack_zip_file_task(ctx: Dict[str, Any], source_file_id: str, automation_run_id: str = None) -> Dict[str, Any]:
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
                    job_run_id = zip_file.job_run_id
                    file_extension = os.path.splitext(file)[1]
                    new_gcs_name = f"jobs/{job_run_id}/extracted/{uuid.uuid4()}{file_extension}"
                    
                    # Upload extracted file to GCS
                    await storage_service.upload_file(file_path, new_gcs_name)
                    logger.info(f"Uploaded extracted file: {normalized_path} -> {new_gcs_name}")
                    
                    # Get file size
                    file_size = os.path.getsize(file_path)
                    
                    # Determine MIME type
                    mime_type, _ = mimetypes.guess_type(file)
                    if not mime_type:
                        mime_type = "application/octet-stream"
                    
                    # Count pages in the extracted file
                    from services.page_counting_service import page_counting_service
                    with open(file_path, 'rb') as f:
                        file_content = f.read()
                    page_count = page_counting_service.count_pages_from_content(file_content, file)
                    
                    # Create new SourceFile record for extracted file
                    extracted_file = SourceFile(
                        job_run_id=job_run_id,
                        original_filename=file,
                        original_path=normalized_path,
                        gcs_object_name=new_gcs_name,
                        file_type=mime_type,
                        file_size_bytes=file_size,
                        page_count=page_count,
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
            
            # Get parent job ID for SSE events
            job_run = db.query(JobRun).filter(JobRun.id == zip_file.job_run_id).first()
            parent_job_id = str(job_run.job_id) if job_run else "unknown"
            
            # Query only the newly extracted files in canonical alphabetical order
            extracted_files = db.query(SourceFile).filter(
                SourceFile.job_run_id == zip_file.job_run_id,
                SourceFile.status == FileStatus.UPLOADED.value,  # Extracted files are marked as "uploaded"
                SourceFile.id != zip_file.id  # Exclude the original ZIP file
            ).order_by(SourceFile.original_path, SourceFile.id).all()
            
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
            await sse_manager.send_files_extracted(parent_job_id, files_data)
            logger.info(f"Sending file_status_changed event for ZIP file")
            await sse_manager.send_file_status_changed(parent_job_id, str(zip_file.id), "unpacked")
            logger.info(f"SSE events sent successfully for job {parent_job_id}")
            
            logger.info(f"Successfully unpacked ZIP file {source_file_id}: {files_extracted} files extracted")
            
            # If this is part of an automation, count the ZIP file as processed now that it's unpacked
            if automation_run_id:
                from services.google_service import google_service
                await google_service._update_automation_import_tracking(
                    db, automation_run_id, 
                    processed=1
                )
            
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
            
            # If this is part of an automation, count the ZIP file processing as failed
            if automation_run_id:
                from services.google_service import google_service
                await google_service._update_automation_import_tracking(
                    db, automation_run_id, 
                    processing_failed=1
                )
                logger.info(f"Marked ZIP processing as failed for automation run {automation_run_id}")
            
            # Send SSE event for extraction failure
            try:
                from services.sse_service import sse_manager
                # Get parent job ID for SSE events
                job_run = db.query(JobRun).filter(JobRun.id == zip_file.job_run_id).first()
                parent_job_id = str(job_run.job_id) if job_run else "unknown"
                await sse_manager.send_extraction_failed(parent_job_id, str(zip_file.id), str(e))
            except ImportError as import_err:
                logger.error(f"Could not import SSE service for error notification: {import_err}")
            except Exception as sse_err:
                logger.error(f"Failed to send SSE event for extraction failure: {sse_err}")
        
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

async def run_free_user_period_reset(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Reset billing periods for free users at month boundaries"""
    logger.info("Starting free user period reset")
    
    db = db_config.get_session()
    try:
        from services.billing_service import get_billing_service
        from datetime import datetime, timezone, timedelta
        from models.db_models import BillingAccount, UsageCounter
        
        billing_service = get_billing_service(db)
        now = datetime.now(timezone.utc)
        
        # Find free users whose periods have expired
        expired_accounts = db.query(BillingAccount).filter(
            BillingAccount.plan_code == 'free',
            BillingAccount.current_period_end < now
        ).all()
        
        updated_count = 0
        for account in expired_accounts:
            try:
                # Calculate new period boundaries (current month)
                period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)
                
                # Update billing account period
                account.current_period_start = period_start
                account.current_period_end = period_end
                
                # Create new usage counter for the new period
                new_counter = UsageCounter(
                    user_id=account.user_id,
                    period_start=period_start,
                    period_end=period_end,
                    pages_total=0
                )
                db.merge(new_counter)  # Use merge to handle conflicts
                
                updated_count += 1
                logger.info(f"Reset period for free user {account.user_id}: {period_start} to {period_end}")
                
            except Exception as e:
                logger.error(f"Failed to reset period for user {account.user_id}: {e}")
                continue
        
        db.commit()
        
        logger.info(f"Free user period reset completed: {updated_count} accounts updated")
        return {
            "success": True, 
            "message": f"Period reset completed for {updated_count} free users",
            "updated_count": updated_count
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Free user period reset failed: {e}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()

async def run_stripe_usage_reconciliation(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Retry failed Stripe usage reports and reconcile usage data"""
    logger.info("Starting Stripe usage reconciliation")
    
    db = db_config.get_session()
    try:
        from services.billing_service import get_billing_service
        from datetime import datetime, timezone, timedelta
        from models.db_models import BillingAccount, UsageEvent
        
        # Find usage events that failed to report to Stripe
        unreported_events = db.query(UsageEvent).filter(
            UsageEvent.stripe_reported == False,
            UsageEvent.occurred_at > datetime.now(timezone.utc) - timedelta(days=7)  # Only retry recent events
        ).all()
        
        retry_count = 0
        success_count = 0
        
        for event in unreported_events:
            try:
                # Get billing account to check if user is on paid plan
                billing_account = db.query(BillingAccount).filter(
                    BillingAccount.user_id == event.user_id
                ).first()
                
                if not billing_account or billing_account.plan_code == 'free':
                    # Mark as reported for free users (no Stripe reporting needed)
                    event.stripe_reported = True
                    continue
                
                if not billing_account.stripe_customer_id:
                    logger.warning(f"No Stripe customer ID for paid user {event.user_id}")
                    continue
                
                # Retry Stripe reporting
                billing_service = get_billing_service(db)
                billing_service._report_usage_to_stripe(
                    event.user_id,
                    event.pages,
                    str(event.id)
                )
                
                retry_count += 1
                success_count += 1
                logger.info(f"Successfully retried Stripe reporting for event {event.id}")
                
            except Exception as e:
                logger.error(f"Failed to retry Stripe reporting for event {event.id}: {e}")
                retry_count += 1
                continue
        
        db.commit()
        
        logger.info(f"Stripe usage reconciliation completed: {success_count}/{retry_count} events processed")
        return {
            "success": True,
            "message": f"Reconciliation completed: {success_count}/{retry_count} events processed",
            "retry_count": retry_count,
            "success_count": success_count
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Stripe usage reconciliation failed: {e}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()

async def run_usage_counter_cleanup(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Clean up old usage counters to prevent database bloat"""
    logger.info("Starting usage counter cleanup")
    
    db = db_config.get_session()
    try:
        from datetime import datetime, timezone, timedelta
        from models.db_models import UsageCounter
        
        # Remove usage counters older than 13 months (keep 1 year + current month)
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=395)  # ~13 months
        
        deleted_count = db.query(UsageCounter).filter(
            UsageCounter.period_start < cutoff_date
        ).delete()
        
        db.commit()
        
        logger.info(f"Usage counter cleanup completed: {deleted_count} old counters removed")
        return {
            "success": True,
            "message": f"Cleanup completed: {deleted_count} old usage counters removed",
            "deleted_count": deleted_count
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Usage counter cleanup failed: {e}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()

# ===================================================================
# Scheduled/Cron Task Wrappers
# ===================================================================

async def schedule_free_user_period_reset(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Scheduled task to reset free user billing periods
    Runs daily at 00:30 UTC to catch month rollovers
    """
    logger.info("Scheduled: Free user period reset")
    try:
        result = await run_free_user_period_reset(ctx)
        logger.info(f"Scheduled free user period reset completed: {result}")
        return result
    except Exception as e:
        logger.error(f"Scheduled free user period reset failed: {e}")
        return {"success": False, "error": str(e)}

async def schedule_stripe_usage_reconciliation(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Scheduled task to retry failed Stripe usage reports
    Runs every 2 hours to ensure usage is properly reported
    """
    logger.info("Scheduled: Stripe usage reconciliation")
    try:
        result = await run_stripe_usage_reconciliation(ctx)
        logger.info(f"Scheduled Stripe reconciliation completed: {result}")
        return result
    except Exception as e:
        logger.error(f"Scheduled Stripe reconciliation failed: {e}")
        return {"success": False, "error": str(e)}

async def schedule_usage_counter_cleanup(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Scheduled task to clean up old usage counters
    Runs weekly on Sundays at 02:00 UTC
    """
    logger.info("Scheduled: Usage counter cleanup")
    try:
        result = await run_usage_counter_cleanup(ctx)
        logger.info(f"Scheduled usage counter cleanup completed: {result}")
        return result
    except Exception as e:
        logger.error(f"Scheduled usage counter cleanup failed: {e}")
        return {"success": False, "error": str(e)}

async def schedule_abandoned_cleanup(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Scheduled task to clean up abandoned jobs
    Runs daily at 01:00 UTC
    """
    logger.info("Scheduled: Abandoned job cleanup")
    try:
        result = await run_abandoned_cleanup(ctx)
        logger.info(f"Scheduled abandoned cleanup completed: {result}")
        return result
    except Exception as e:
        logger.error(f"Scheduled abandoned cleanup failed: {e}")
        return {"success": False, "error": str(e)}

async def schedule_artifact_cleanup(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Scheduled task to clean up old artifacts
    Runs daily at 03:00 UTC
    """
    logger.info("Scheduled: Artifact cleanup")
    try:
        result = await run_artifact_cleanup(ctx)
        logger.info(f"Scheduled artifact cleanup completed: {result}")
        return result
    except Exception as e:
        logger.error(f"Scheduled artifact cleanup failed: {e}")
        return {"success": False, "error": str(e)}

async def schedule_opt_out_cleanup(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Scheduled task to clean up opt-out user data
    Runs weekly on Saturdays at 04:00 UTC
    """
    logger.info("Scheduled: Opt-out data cleanup")
    try:
        result = await run_opt_out_cleanup(ctx)
        logger.info(f"Scheduled opt-out cleanup completed: {result}")
        return result
    except Exception as e:
        logger.error(f"Scheduled opt-out cleanup failed: {e}")
        return {"success": False, "error": str(e)}

async def run_gmail_watch_renewal(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Check and renew Gmail watch subscription for the central mailbox
    """
    logger.info("Starting Gmail watch renewal check for central mailbox")
    
    try:
        from core.database import get_db
        from services.gmail_pubsub_service import gmail_pubsub_service
        from models.db_models import CentralMailboxState
        from datetime import datetime, timezone, timedelta
        
        # Get database session
        db = next(get_db())
        
        try:
            # Get current watch state for central mailbox
            mailbox_state = db.query(CentralMailboxState).filter(
                CentralMailboxState.mailbox_address == gmail_pubsub_service.CENTRAL_MAILBOX
            ).first()
            
            if not mailbox_state:
                logger.error("No central mailbox state found - watch not set up")
                return {
                    'success': False,
                    'error': 'Central mailbox watch not configured'
                }
            
            # Check if watch needs renewal (renew 1 day before expiration)
            now = datetime.now(timezone.utc)
            renewal_threshold = timedelta(days=1)
            
            if not mailbox_state.watch_expire_at:
                logger.warning("No watch expiration time found - setting up new watch")
                needs_renewal = True
            else:
                time_until_expiry = mailbox_state.watch_expire_at - now
                needs_renewal = time_until_expiry <= renewal_threshold
                
                logger.info(f"Central mailbox watch expires at: {mailbox_state.watch_expire_at}")
                logger.info(f"Time until expiry: {time_until_expiry}")
                logger.info(f"Needs renewal: {needs_renewal}")
            
            if needs_renewal:
                logger.info("Renewing central mailbox Gmail watch...")
                
                topic_name = 'gmail-central-notifications'
                success = gmail_pubsub_service.setup_central_mailbox_watch(db, topic_name)
                
                if success:
                    logger.info("✅ Central mailbox Gmail watch renewed successfully")
                    return {
                        'success': True,
                        'message': 'Central mailbox watch renewed successfully',
                        'mailbox': gmail_pubsub_service.CENTRAL_MAILBOX
                    }
                else:
                    logger.error("❌ Failed to renew central mailbox Gmail watch")
                    return {
                        'success': False,
                        'error': 'Failed to renew central mailbox watch'
                    }
            else:
                logger.info("✅ Central mailbox Gmail watch does not need renewal yet")
                return {
                    'success': True,
                    'message': 'Central mailbox watch does not need renewal yet',
                    'expires_at': mailbox_state.watch_expire_at.isoformat()
                }
                
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Failed to check/renew central mailbox Gmail watch: {e}")
        return {
            'success': False,
            'error': str(e)
        }

async def schedule_gmail_watch_renewal(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Scheduled task to renew Gmail watch subscriptions
    Runs daily to ensure watches stay active (Gmail watches expire after ~7 days)
    """
    logger.info("Scheduled: Gmail watch renewal")
    try:
        result = await run_gmail_watch_renewal(ctx)
        logger.info(f"Scheduled Gmail watch renewal completed: {result}")
        return result
    except Exception as e:
        logger.error(f"Scheduled Gmail watch renewal failed: {e}")
        return {"success": False, "error": str(e)}

# ARQ worker settings removed - using Cloud Run Tasks instead

# ZipWorkerSettings removed - using Cloud Run Tasks instead

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
    drive_file_ids: List[str],
    run_id: str = None
) -> Dict[str, Any]:
    """
    Import files from Google Drive (manual imports) for a job run
    
    Args:
        job_id: Extraction job ID
        user_id: User ID for OAuth credentials
        drive_file_ids: List of Google Drive file IDs to import
        run_id: Job run ID (defaults to latest)
        
    Returns:
        Dict with import results and status
    """
    logger.info(f"Starting Drive import for job {job_id}, run {run_id}, {len(drive_file_ids)} files")
    
    with next(get_db()) as db:
        try:
            # Get the target run (latest if not specified)
            from services.job_service import JobService
            job_service = JobService()
            
            if run_id:
                target_run = job_service.get_job_run(job_id, run_id, user_id)
            else:
                target_run = job_service.get_latest_run(job_id, user_id)
            
            if not target_run:
                raise ValueError(f"Job run not found or access denied")
            
            # Use service layer for actual import logic
            from services.google_service import google_service
            import_result = await google_service.import_drive_files(db, str(target_run.id), user_id, drive_file_ids)
            
            # Convert service result to worker result format
            results = {
                'job_id': job_id,
                'job_run_id': str(target_run.id),
                'total_files': import_result.get('total', len(drive_file_ids)),
                'successful': import_result.get('successful', 0),
                'failed': import_result.get('failed', 0),
                'errors': import_result.get('errors', [])
            }
            
            # Update job status
            if results['failed'] == 0:
                logger.info(f"Drive import completed successfully for job {job_id}")
            else:
                logger.warning(f"Drive import completed with {results['failed']} failures for job {job_id}")
            
            return results
            
        except Exception as e:
            logger.error(f"Drive import failed for job {job_id}: {e}")
            raise

async def import_gmail_attachments(
    ctx: Dict[str, Any],
    job_id: str,
    user_id: str,
    attachment_data: List[Dict[str, str]],
    automation_run_id: str = None,
    run_id: str = None
) -> Dict[str, Any]:
    """
    Import attachments from Gmail for job runs (manual imports or automation)
    
    Args:
        job_id: Extraction job ID
        user_id: User ID for OAuth credentials
        attachment_data: List of dicts with messageId, attachmentId, filename
        automation_run_id: Optional automation run ID
        run_id: Job run ID (for automation, this comes from automation_run)
        
    Returns:
        Dict with import results and status
    """
    logger.info(f"Starting Gmail import for job {job_id}, run {run_id}, {len(attachment_data)} attachments")
    
    with next(get_db()) as db:
        try:
            # Get the target run 
            target_run_id = run_id
            
            # If automation_run_id is provided, get run_id from automation_run
            if automation_run_id and not target_run_id:
                from models.db_models import AutomationRun
                automation_run = db.query(AutomationRun).filter(AutomationRun.id == automation_run_id).first()
                if automation_run:
                    target_run_id = str(automation_run.job_run_id)
                    logger.info(f"Gmail import: Found job_run_id {target_run_id} from automation_run {automation_run_id}")
            
            # If still no target_run_id, get latest run for manual imports
            if not target_run_id:
                from services.job_service import JobService
                job_service = JobService()
                target_run = job_service.get_latest_run(job_id, user_id)
                if target_run:
                    target_run_id = str(target_run.id)
                    logger.info(f"Gmail import: Using latest run {target_run_id} for manual import")
            
            if not target_run_id:
                raise ValueError(f"No job run ID available for Gmail import")
            
            # Use service layer for actual import logic
            from services.google_service import google_service
            logger.info(f"Gmail import worker: automation_run_id parameter = {automation_run_id}")
            import_result = await google_service.import_gmail_attachments(db, target_run_id, attachment_data, automation_run_id)
            
            # Convert service result to worker result format
            results = {
                'job_id': job_id,
                'job_run_id': target_run_id,
                'total_files': import_result.get('total', len(attachment_data)),
                'successful': import_result.get('successful', 0),
                'failed': import_result.get('failed', 0),
                'errors': import_result.get('errors', [])
            }
            
            # Update job status
            if results['failed'] == 0:
                logger.info(f"Gmail import completed successfully for job {job_id}")
            else:
                logger.warning(f"Gmail import completed with {results['failed']} failures for job {job_id}")
            
            return results
            
        except Exception as e:
            logger.error(f"Gmail import failed for job {job_id}: {e}")
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
                    job_run_id=source_file.job_run_id,
                    original_filename=extracted_filename,
                    original_path=file_info.filename,  # Full path within ZIP
                    gcs_object_name=f"imports/{source_file.job_run_id}/extracted_{extracted_filename}",
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
                    
                    extracted_source_file.status = 'unpacked'
                    logger.info(f"Extracted and uploaded: {extracted_filename}")
                    
                except Exception as e:
                    extracted_source_file.status = 'failed'
                    logger.error(f"Failed to upload extracted file {extracted_filename}: {e}")
            
            db.commit()
            logger.info(f"ZIP processing completed for {source_file.original_filename}")
            
    except Exception as e:
        logger.error(f"Failed to process ZIP file {source_file.original_filename}: {e}")
        raise


# ImportWorkerSettings removed - using Cloud Run Tasks instead

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
    folder_id: str = None,
    automation_run_id: str = None,
    run_id: str = None
) -> Dict[str, Any]:
    """
    Export job run results to Google Drive as CSV or Excel
    
    Args:
        job_id: Extraction job ID
        user_id: User ID for OAuth credentials
        file_type: Export format ('csv' or 'xlsx')
        folder_id: Optional Google Drive folder ID
        automation_run_id: Optional automation run ID
        run_id: Job run ID (defaults to latest, or from automation_run)
        
    Returns:
        Dict with export results and Google Drive file info
    """
    logger.info(f"Starting Google Drive export for job {job_id}, run {run_id}, format: {file_type}")
    
    with next(get_db()) as db:
        try:
            # Import here to avoid circular imports
            from models.db_models import JobExport, AutomationRun, ExtractionJob
            from services.job_service import JobService
            from services.google_service import google_service
            
            # Get the target run
            target_run_id = run_id
            
            # If automation_run_id is provided, get run_id from automation_run
            if automation_run_id and not target_run_id:
                automation_run = db.query(AutomationRun).filter(AutomationRun.id == automation_run_id).first()
                if automation_run:
                    target_run_id = str(automation_run.job_run_id)
                    logger.info(f"Export: Found job_run_id {target_run_id} from automation_run {automation_run_id}")
            
            # If still no target_run_id, get latest run
            if not target_run_id:
                job_service = JobService()
                target_run = job_service.get_latest_run(job_id, user_id)
                if target_run:
                    target_run_id = str(target_run.id)
                    logger.info(f"Export: Using latest run {target_run_id}")
            
            if not target_run_id:
                raise ValueError(f"No job run ID available for export")
            
            # Create JobExport record to track the export (linked to job run)
            job_export = JobExport(
                job_run_id=target_run_id,
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
            
            # Get job run results
            job_service = JobService()
            results_response = await job_service.get_job_results(user_id, job_id, run_id=target_run_id)
            
            if not results_response.results:
                raise ValueError("No results found for this job run")
            
            # Generate export content based on file type
            if file_type == "csv":
                from services.export_service import generate_csv_content, generate_export_filename
                content = generate_csv_content(results_response)
                from datetime import datetime
                # Use job name for filename when exporting
                job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
                job_name = job.name if job and job.name else str(job_id)
                filename = generate_export_filename(job_name, datetime.utcnow(), "csv")
                mime_type = "text/csv"
                content_bytes = content.encode('utf-8')
            elif file_type == "xlsx":
                from services.export_service import generate_excel_content, generate_export_filename
                from datetime import datetime
                content_bytes = generate_excel_content(results_response)
                job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
                job_name = job.name if job and job.name else str(job_id)
                filename = generate_export_filename(job_name, datetime.utcnow(), "xlsx")
                mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            else:
                raise ValueError(f"Unsupported file type: {file_type}")
            
            # Upload or update on Google Drive
            # See if a JobExport already exists for this run and type with an external_id
            existing_export = db.query(JobExport).filter(
                JobExport.job_run_id == target_run_id,
                JobExport.dest_type == 'gdrive',
                JobExport.file_type == file_type,
                JobExport.external_id.isnot(None)
            ).order_by(JobExport.created_at.desc()).first()

            if existing_export and existing_export.external_id:
                drive_file = google_service.update_file_in_drive(
                    db=db,
                    user_id=user_id,
                    file_id=existing_export.external_id,
                    file_content=content_bytes,
                    mime_type=mime_type
                )
            else:
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
            
            # Check if this export was triggered by an automation
            if automation_run_id:
                # This export was triggered by a specific automation run
                from services.automation_service import automation_service
                await automation_service.update_automation_run_status(
                    db, automation_run_id, 'completed'
                )
                logger.info(f"Marked automation run {automation_run_id} as completed after export")
            
            logger.info(f"Successfully exported job {job_id} run {target_run_id} to Google Drive: {drive_file.get('id')}")
            
            return {
                "success": True,
                "job_id": job_id,
                "job_run_id": target_run_id,
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


# ExportWorkerSettings removed - using Cloud Run Tasks instead

# ===================================================================
# Automation Worker Functions
# ===================================================================

async def automation_startup(ctx: Dict[str, Any]) -> None:
    """Initialize automation worker resources"""
    logger.info("Automation worker starting up...")

async def automation_shutdown(ctx: Dict[str, Any]) -> None:
    """Cleanup automation worker resources"""
    logger.info("Automation worker shutting down...")

async def automation_trigger_worker(
    ctx: Dict[str, Any],
    user_id: str,
    message_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Process Gmail email data and trigger automations
    
    Args:
        user_id: User ID for the Gmail account
        message_data: Parsed email data from Gmail Pub/Sub service
        
    Returns:
        Dict with processing results
    """
    logger.info(f"Processing Gmail trigger for user {user_id}")
    
    with next(get_db()) as db:
        try:
            from services.automation_service import automation_service
            
            # Get enabled automations for this user
            automations = await automation_service.get_enabled_automations(db, user_id)
            gmail_automations = [auto for auto in automations if auto.trigger_type == 'gmail_attachment']
            
            if not gmail_automations:
                logger.info(f"No Gmail automations found for user {user_id}")
                return {"processed": 0, "message": "No Gmail automations configured"}
            
            processed_count = 0
            
            # Extract email information from the new format
            message_id = message_data.get('message_id')
            sender_email = message_data.get('sender_email')
            subject = message_data.get('subject', '')
            attachments = message_data.get('attachments', [])
            
            if not message_id:
                logger.warning("No message_id in email data")
                return {"processed": 0, "message": "No message_id in email data"}
            
            if not sender_email:
                logger.warning("No sender_email in email data")
                return {"processed": 0, "message": "No sender_email in email data"}
            
            logger.info(f"Processing email from {sender_email} with subject: '{subject}' and {len(attachments)} attachments")
            
            # Process each automation
            logger.info(f"Found {len(gmail_automations)} Gmail automations for user {user_id}")
            for automation in gmail_automations:
                try:
                    # Extract Gmail query from trigger config
                    gmail_query = automation.trigger_config.get('query', '')
                    logger.info(f"Checking automation {automation.id} with query: '{gmail_query}'")
                    if not gmail_query:
                        logger.warning(f"Automation {automation.id} has no Gmail query configured")
                        continue
                    
                    email_matches = await _check_email_matches_gmail_query(message_data, gmail_query)
                    logger.info(f"Email matches automation {automation.id}: {email_matches}")
                    
                    if email_matches:
                        logger.info(f"Email matches automation {automation.id} query: '{gmail_query}'")
                        
                        # Check if we've already processed this message for this automation
                        from models.db_models import AutomationProcessedMessage
                        existing_processed = db.query(AutomationProcessedMessage).filter(
                            AutomationProcessedMessage.automation_id == automation.id,
                            AutomationProcessedMessage.message_id == message_id
                        ).first()
                        
                        if existing_processed:
                            logger.info(f"Message {message_id} already processed by automation {automation.id} at {existing_processed.processed_at}, skipping")
                            continue
                        
                        if not attachments:
                            logger.info(f"Email matches query but has no attachments")
                            continue
                        
                        logger.info(f"Email has {len(attachments)} attachments")
                        
                        # Mark message as processed BEFORE creating automation run
                        processed_message = AutomationProcessedMessage(
                            automation_id=automation.id,
                            message_id=message_id
                        )
                        db.add(processed_message)
                        db.commit()
                        
                        logger.info(f"Marked message {message_id} as processed for automation {automation.id}")
                        
                        # Check if job is currently running before proceeding
                        job = db.query(ExtractionJob).filter(ExtractionJob.id == automation.job_id).first()
                        # With job runs, jobs no longer have a direct 'status'. Check the latest run status instead.
                        if job:
                            from models.db_models import JobRun
                            latest_run = db.query(JobRun).filter(JobRun.job_id == job.id).order_by(JobRun.created_at.desc()).first()
                            if latest_run and latest_run.status == 'in_progress':
                                logger.warning(f"Latest run {latest_run.id} for job {automation.job_id} is currently in progress, skipping automation trigger")
                                continue
                        
                        # No need to clear data - each automation trigger creates a new job run
                        
                        # Create automation run with import tracking
                        automation_run = await automation_service.create_automation_run(
                            db, automation.id, automation.job_id
                        )
                        
                        # Convert attachment data to the format expected by import worker
                        attachment_data = []
                        for attachment in attachments:
                            attachment_data.append({
                                'messageId': message_id,
                                'attachmentId': attachment.get('attachment_id'),
                                'filename': attachment.get('filename'),
                                'mimeType': attachment.get('mime_type'),
                                'size': attachment.get('size', 0)
                            })
                        
                        # Initialize import tracking
                        automation_run.imports_total = len(attachment_data)
                        automation_run.imports_successful = 0
                        automation_run.imports_failed = 0
                        automation_run.imports_processed = 0
                        automation_run.imports_processing_failed = 0
                        db.commit()
                        
                        # Enqueue Gmail import using Cloud Run Tasks
                        from services.cloud_run_task_service import cloud_run_task_service
                        
                        await cloud_run_task_service.enqueue_import_task(
                            task_type="import_gmail_attachments",
                            job_id=automation.job_id,
                            user_id=user_id,
                            import_data={"attachment_data": attachment_data},
                            automation_run_id=str(automation_run.id)
                        )
                        processed_count += 1
                        
                        logger.info(f"Triggered automation {automation.id} for email {message_id}")
                
                except Exception as e:
                    logger.error(f"Failed to process automation {automation.id}: {e}")
                    continue
            
            return {
                "processed": processed_count,
                "message": f"Processed {processed_count} automation triggers"
            }
            
        except Exception as e:
            logger.error(f"Automation trigger worker failed for user {user_id}: {e}")
            raise

async def _check_email_matches_gmail_query(email_data: Dict[str, Any], gmail_query: str) -> bool:
    """
    Check if email matches Gmail query using Gmail's search API
    
    Args:
        email_data: Parsed email data
        gmail_query: Gmail search query
        
    Returns:
        True if email matches query, False otherwise
    """
    try:
        from services.gmail_pubsub_service import gmail_pubsub_service
        
        # Get Gmail service with service account
        gmail_service = gmail_pubsub_service._get_service_account_gmail_service()
        if not gmail_service:
            logger.error("Could not get Gmail service for query matching")
            return False
        
        message_id = email_data.get('message_id')
        if not message_id:
            logger.error("No message_id in email data for query matching")
            return False
        
        # Use Gmail's search API to check if this specific message matches the query
        # Instead of using rfc822msgid (which needs the actual Message-ID header), 
        # we'll search for the user's query and then check if our message ID is in the results
        logger.info(f"Testing Gmail query: '{gmail_query}'")
        
        try:
            # Search for messages matching the user's query
            search_response = gmail_service.users().messages().list(
                userId='me',
                q=gmail_query,
                maxResults=100  # Get more results to check if our message is in them
            ).execute()
            
            messages = search_response.get('messages', [])
            
            # Check if our specific message ID is in the search results
            message_matches = any(msg.get('id') == message_id for msg in messages)
            
            logger.info(f"Gmail query '{gmail_query}' returned {len(messages)} messages, our message {message_id} found: {message_matches}")
            return message_matches
            
        except Exception as search_error:
            logger.error(f"Gmail search API failed for query '{gmail_query}': {search_error}")
            return False
        
    except Exception as e:
        logger.error(f"Failed to check email query match using Gmail API: {e}")
        return False

async def run_initializer_worker(
    ctx: Dict[str, Any],
    job_id: str,
    automation_run_id: str = None
) -> Dict[str, Any]:
    """
    Initialize job run execution for automation triggers
    
    Args:
        job_id: Extraction job ID to initialize
        automation_run_id: Optional automation run ID if triggered by automation
        
    Returns:
        Dict with initialization results
    """
    logger.info(f"Initializing job run execution for job {job_id}, automation_run_id={automation_run_id}")
    
    with next(get_db()) as db:
        try:
            from services.job_service import JobService
            from models.db_models import AutomationRun
            
            # Get user_id from job
            job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
            if not job:
                raise ValueError(f"Job {job_id} not found")
            
            # Get the job run ID from the automation run
            job_run_id = None
            if automation_run_id:
                automation_run = db.query(AutomationRun).filter(AutomationRun.id == automation_run_id).first()
                if automation_run:
                    job_run_id = str(automation_run.job_run_id)
                else:
                    logger.warning(f"Automation run {automation_run_id} not found, proceeding without job run ID")
            
            if not job_run_id:
                raise ValueError(f"No job run ID found for automation run {automation_run_id}")
            
            # Use automation-specific job run service method
            job_service = JobService()
            result_run_id = await job_service.submit_automation_job_run(job_run_id, job.user_id, automation_run_id)
            
            # Count tasks for response (now scoped to the job run)
            tasks_count = db.query(ExtractionTask).filter(
                ExtractionTask.job_run_id == job_run_id
            ).count()
            
            logger.info(f"Initialized job run {job_run_id} with {tasks_count} tasks")
            
            return {
                "message": "Job run initialization successful",
                "job_run_id": result_run_id,
                "tasks_queued": tasks_count,
                "automation_run_id": automation_run_id
            }
            
        except Exception as e:
            logger.error(f"Job run initialization failed for job {job_id}: {e}")
            
            # Do not update automation run status here; submit_automation_job_run handles failure status
            # to avoid duplicate failure emails.
            raise


# AutomationWorkerSettings removed - using Cloud Run Tasks instead

async def main():
    """For testing the worker locally"""
    from services.cloud_run_task_service import cloud_run_task_service
    
    # Example: enqueue a test task using Cloud Run Tasks
    task_name = await cloud_run_task_service.enqueue_extraction_task('test-task-id')
    print(f"Enqueued task: {task_name}")


async def _record_usage_for_task(db: Session, task: ExtractionTask, source_files: List[SourceFile]):
    """
    Record usage for billing when an extraction task completes successfully
    """
    try:
        from services.billing_service import get_billing_service, PlanLimitExceeded
        
        # Calculate total pages processed
        total_pages = 0
        for source_file in source_files:
            if source_file.page_count:
                total_pages += source_file.page_count
            else:
                # Fallback: estimate 1 page per file if page_count not available
                total_pages += 1
                logger.warning(f"No page_count for file {source_file.id}, using 1 page estimate")
        
        if total_pages <= 0:
            logger.info("No pages to record for billing")
            return
        
        # Get user ID from the job via job run
        job_run = db.query(JobRun).filter(JobRun.id == task.job_run_id).first()
        if not job_run:
            logger.error(f"Job run {task.job_run_id} not found for usage recording")
            return
            
        job = db.query(ExtractionJob).filter(ExtractionJob.id == job_run.job_id).first()
        if not job:
            logger.error(f"Job {job_run.job_id} not found for usage recording")
            return
        
        # Record usage through billing service
        billing_service = get_billing_service(db)
        event_id = billing_service.record_usage(
            user_id=job.user_id,
            pages=total_pages,
            source="extraction_task",
            task_id=str(task.id),
            notes=f"Processed {len(source_files)} files"
        )
        
        logger.info(f"Recorded {total_pages} pages usage for user {job.user_id}, task {task.id}, event {event_id}")
        
    except PlanLimitExceeded as e:
        # This shouldn't happen since we check limits before starting tasks
        logger.error(f"Plan limit exceeded during task completion: {e}")
        raise  # Re-raise to fail the task
    except Exception as e:
        logger.error(f"Unexpected error recording usage: {e}")
        # Don't re-raise for other errors to avoid failing the extraction task

# Removed per-task limit checking - now handled at job start

# All ARQ worker settings classes removed - using Cloud Run Tasks and Cloud Scheduler instead

if __name__ == "__main__":
    asyncio.run(main())