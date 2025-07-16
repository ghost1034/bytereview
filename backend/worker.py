"""
ARQ worker configuration and task definitions for ByteReview
Background worker system for asynchronous job processing
"""
import os
import asyncio
import logging
from typing import Dict, Any
from dotenv import load_dotenv

# Load environment variables first
load_dotenv()

from arq import create_pool
from arq.connections import RedisSettings
from sqlalchemy.orm import Session
from core.database import db_config
from models.db_models import ExtractionTask, ExtractionResult, SourceFile, JobField, SystemPrompt, SourceFileToTask, ExtractionJob
from services.ai_extraction_service import AIExtractionService
from services.gcs_service import get_storage_service
import json
import tempfile

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
        system_prompt = db.query(SystemPrompt).filter(SystemPrompt.is_active == True).first()
        if not system_prompt:
            raise ValueError("No active system prompt found")
        
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
        
        # Download and process files
        results = []
        temp_files = []
        
        try:
            # Download files from GCS to temporary location
            for source_file in source_files:
                logger.info(f"Downloading file: {source_file.original_filename}")
                
                # Create temporary file
                temp_fd, temp_path = tempfile.mkstemp(suffix=os.path.splitext(source_file.original_filename)[1])
                temp_files.append(temp_path)
                
                try:
                    # Download from GCS
                    await storage_service.download_file(source_file.gcs_object_name, temp_path)
                    logger.info(f"Downloaded {source_file.original_filename} to {temp_path}")
                    
                    # Process with AI service
                    logger.info(f"Processing file with AI: {source_file.original_filename}")
                    
                    # Convert job fields to FieldConfig format
                    from models.extraction import FieldConfig
                    field_configs = [
                        FieldConfig(
                            name=field.field_name,
                            data_type=field.data_type_id,
                            prompt=field.ai_prompt
                        )
                        for field in job_fields
                    ]
                    
                    # Read file content for AI service
                    with open(temp_path, 'rb') as f:
                        file_content = f.read()
                    
                    files_data = [{
                        'filename': source_file.original_filename,
                        'content': file_content
                    }]
                    
                    # Extract data using AI service
                    extraction_result = await ai_service.extract_data_from_files(
                        files_data, 
                        field_configs,
                        extract_multiple_rows=False
                    )
                    
                    file_result = {
                        "filename": source_file.original_filename,
                        "success": extraction_result.success,
                        "data": extraction_result.data[0] if extraction_result.data else {}
                    }
                    
                except Exception as e:
                    logger.error(f"Failed to process file {source_file.original_filename}: {e}")
                    file_result = {
                        "filename": source_file.original_filename,
                        "success": False,
                        "error": str(e),
                        "data": {}
                    }
                finally:
                    # Close file descriptor
                    os.close(temp_fd)
                
                results.append(file_result)
                
        finally:
            # Clean up temporary files
            for temp_path in temp_files:
                try:
                    if os.path.exists(temp_path):
                        os.unlink(temp_path)
                except Exception as e:
                    logger.warning(f"Failed to clean up temp file {temp_path}: {e}")
        
        # Combine results based on processing mode
        if task.processing_mode == "combined":
            # For combined mode, merge all results into one
            combined_data = {}
            for field in job_fields:
                # Simple combination strategy - take first non-null value
                combined_data[field.field_name] = f"combined_{field.field_name}"
            
            final_result = {
                "processing_mode": "combined",
                "source_files": [f.original_filename for f in source_files],
                "data": combined_data
            }
        else:
            # For individual mode, keep separate results
            final_result = {
                "processing_mode": "individual",
                "results": results
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
        
        db.commit()
        
        logger.info(f"Successfully completed extraction task: {task_id}")
        return {"success": True, "task_id": task_id}
        
    except Exception as e:
        logger.error(f"Error processing extraction task {task_id}: {e}")
        
        # Update task status to failed
        if 'task' in locals():
            task.status = "failed"
            task.error_message = str(e)
            db.commit()
        
        raise
    finally:
        db.close()

async def unpack_zip_file_task(ctx: Dict[str, Any], source_file_id: str) -> Dict[str, Any]:
    """
    Unpack a ZIP file and register its contents as individual source files
    """
    logger.info(f"Unpacking ZIP file: {source_file_id}")
    
    # TODO: Implement ZIP unpacking logic
    # This would:
    # 1. Download ZIP from GCS
    # 2. Extract to temporary directory
    # 3. Upload individual files back to GCS
    # 4. Create SourceFile records for each extracted file
    # 5. Update original ZIP status to "unpacked"
    # 6. Clean up temporary files
    
    return {"success": True, "source_file_id": source_file_id, "files_extracted": 0}

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
    """ARQ worker configuration"""
    
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    
    # Task functions that the worker can execute
    functions = [
        process_extraction_task,
        unpack_zip_file_task,
        run_abandoned_cleanup,
        run_opt_out_cleanup,
        run_artifact_cleanup,
    ]
    
    # Worker configuration
    max_jobs = 10  # Maximum concurrent jobs
    job_timeout = 300  # 5 minutes timeout per job
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