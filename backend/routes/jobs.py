"""
Job management routes for ByteReview
New asynchronous job-based extraction workflow
"""
from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile, Request
from fastapi.responses import StreamingResponse, Response
from typing import Optional, List
import json
import asyncio
import csv
import openpyxl
import logging
from io import StringIO, BytesIO
from dependencies.auth import get_current_user_id, verify_token_string
from core.database import get_db
from sqlalchemy.orm import Session
from models.db_models import ExtractionJob, SourceFile, JobExport
from services.job_service import JobService
from services.sse_service import sse_manager
from services.google_service import google_service
from services.export_service import generate_csv_content, generate_excel_content, generate_export_filename
from models.job import (
    JobInitiateRequest, JobInitiateResponse,
    JobStartRequest, JobStartResponse,
    JobDetailsResponse, JobListResponse,
    JobProgressResponse, JobResultsResponse,
    JobFilesResponse, FileStatus,
    JobRunListResponse, JobRunDetailsResponse,
    JobRunCreateRequest, JobRunCreateResponse
)
from pydantic import BaseModel
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize job service
job_service = JobService()

# Request/Response models for resumable workflow
class ConfigStepRequest(BaseModel):
    config_step: str
    version: int = None

class ResumableJobResponse(BaseModel):
    id: str
    name: str = None
    config_step: str
    status: str
    progress_percentage: float
    tasks_completed: int
    tasks_total: int
    tasks_failed: int
    is_resumable: bool
    created_at: str
    last_active_at: str

@router.post("/initiate", response_model=JobInitiateResponse)
async def initiate_job(
    request: JobInitiateRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Step 1: Initiate a new extraction job and get pre-signed upload URLs
    """
    try:
        logger.info(f"Initiating job for user {user_id} with {len(request.files)} files")
        response = await job_service.initiate_job(user_id, request)
        return response
    except Exception as e:
        logger.error(f"Failed to initiate job for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to initiate job: {str(e)}")

@router.get("/{job_id}", response_model=JobDetailsResponse)
async def get_job_details(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    run_id: Optional[str] = Query(None, description="Specific run ID (defaults to latest)")
):
    """
    Get detailed information about a specific job
    """
    try:
        response = await job_service.get_job_details(user_id, job_id, run_id)
        return response
    except ValueError as e:
        logger.warning(f"Job {job_id} not found for user {user_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get job details for {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get job details: {str(e)}")

# ===================================================================
# Job Run Endpoints
# ===================================================================

@router.get("/{job_id}/runs", response_model=JobRunListResponse)
async def get_job_runs(
    job_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get all job runs for a specific job
    """
    try:
        runs = job_service.get_job_runs(job_id, user_id)
        latest_run_id = runs[0].id if runs else None
        
        from models.job import JobRunListItem
        run_items = [
            JobRunListItem(
                id=str(run.id),
                status=run.status,
                config_step=run.config_step,
                tasks_total=run.tasks_total,
                tasks_completed=run.tasks_completed,
                tasks_failed=run.tasks_failed,
                created_at=run.created_at,
                completed_at=run.completed_at,
                template_id=str(run.template_id) if run.template_id else None
            )
            for run in runs
        ]
        
        return JobRunListResponse(
            runs=run_items,
            total=len(runs),
            latest_run_id=str(latest_run_id) if latest_run_id else ""
        )
    except Exception as e:
        logger.error(f"Failed to get job runs for {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get job runs: {str(e)}")

@router.post("/{job_id}/runs", response_model=JobRunCreateResponse)
async def create_job_run(
    job_id: str,
    request: JobRunCreateRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Create a new job run
    """
    try:
        run_id = await job_service.create_job_run(
            job_id=job_id,
            user_id=user_id,
            clone_from_run_id=request.clone_from_run_id,
            template_id=request.template_id
        )
        
        return JobRunCreateResponse(
            job_run_id=run_id,
            message="Job run created successfully"
        )
    except ValueError as e:
        logger.warning(f"Invalid create job run request for {job_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create job run for {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create job run: {str(e)}")

@router.get("/{job_id}/runs/{run_id}", response_model=JobRunDetailsResponse)
async def get_job_run_details(
    job_id: str,
    run_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get detailed information about a specific job run
    """
    try:
        run = job_service.get_job_run(job_id, run_id, user_id)
        if not run:
            raise HTTPException(status_code=404, detail="Job run not found")
        
        # Get job fields for this run
        from core.database import get_db
        db = next(get_db())
        try:
            from models.db_models import JobField
            job_fields = db.query(JobField).filter(
                JobField.job_run_id == run.id
            ).order_by(JobField.display_order).all()
            
            from models.job import JobFieldInfo
            field_info = [
                JobFieldInfo(
                    field_name=field.field_name,
                    data_type_id=field.data_type_id,
                    ai_prompt=field.ai_prompt,
                    display_order=field.display_order
                )
                for field in job_fields
            ]
            
            return JobRunDetailsResponse(
                id=str(run.id),
                job_id=str(run.job_id),
                status=run.status,
                config_step=run.config_step,
                persist_data=run.persist_data,
                tasks_total=run.tasks_total,
                tasks_completed=run.tasks_completed,
                tasks_failed=run.tasks_failed,
                created_at=run.created_at,
                completed_at=run.completed_at,
                job_fields=field_info,
                template_id=str(run.template_id) if run.template_id else None,
                description=run.description if hasattr(run, 'description') else None,
                extraction_tasks=[]  # TODO: Add extraction tasks if needed
            )
        finally:
            db.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get job run details for {job_id}/{run_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get job run details: {str(e)}")

@router.get("", response_model=JobListResponse)
async def list_jobs(
    user_id: str = Depends(get_current_user_id),
    limit: int = Query(default=25, ge=1, le=100, description="Number of jobs to return"),
    offset: int = Query(default=0, ge=0, description="Number of jobs to skip"),
    status: Optional[str] = Query(default=None, description="Filter by job status"),
    include_field_status: bool = Query(default=False, description="Include field configuration status for automation selection")
):
    """
    List jobs for the current user with pagination and filtering
    """
    try:
        # TODO: Implement status filtering when needed
        response = await job_service.list_user_jobs(user_id, limit, offset, include_field_status)
        return response
    except Exception as e:
        logger.error(f"Failed to list jobs for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list jobs: {str(e)}")

@router.get("/{job_id}/progress", response_model=JobProgressResponse)
async def get_job_progress(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    run_id: Optional[str] = Query(None, description="Specific run ID (defaults to latest)")
):
    """
    Get job progress information for real-time updates
    """
    try:
        response = await job_service.get_job_progress(user_id, job_id, run_id)
        return response
    except ValueError as e:
        logger.warning(f"Job {job_id} not found for user {user_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get job progress for {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get job progress: {str(e)}")

@router.post("/{job_id}/files")
async def add_files_to_job(
    job_id: str,
    files: List[UploadFile] = File(...),
    user_id: str = Depends(get_current_user_id)
):
    """
    Add more files to an existing job
    Immediately extracts ZIP files via ARQ workers
    """
    try:
        logger.info(f"Received request to add {len(files)} files to job {job_id} for user {user_id}")
        
        # Log file details
        for i, file in enumerate(files):
            logger.info(f"File {i+1}: {file.filename}, size: {file.size if hasattr(file, 'size') else 'unknown'}, type: {file.content_type}")
        
        uploaded_files = await job_service.add_files_to_job(user_id, job_id, files)
        
        logger.info(f"Successfully added {len(uploaded_files)} files to job {job_id}")
        return {"files": uploaded_files, "message": f"Added {len(uploaded_files)} files"}
    except ValueError as e:
        logger.warning(f"Invalid add files request for {job_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to add files to job {job_id}: {e}")
        logger.error(f"Exception type: {type(e).__name__}")
        logger.error(f"Exception args: {e.args}")
        raise HTTPException(status_code=500, detail=f"Failed to add files: {str(e)}")

@router.get("/{job_id}/files", response_model=JobFilesResponse)
async def get_job_files(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    processable: bool = Query(default=False, description="Only return files that can be processed for data extraction (excludes ZIP files)"),
    run_id: Optional[str] = Query(None, description="Specific run ID (defaults to latest)")
):
    """Get flat list of files in a job run"""
    try:
        files = await job_service.get_job_files(job_id, processable_only=processable, user_id=user_id, run_id=run_id)
        return JobFilesResponse(files=files)
    except ValueError as e:
        logger.warning(f"Job {job_id} not found for user {user_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get files for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get files: {str(e)}")

@router.delete("/{job_id}/files/{file_id}")
async def remove_file_from_job(
    job_id: str,
    file_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Remove a file from a job (synchronous deletion for now)"""
    try:
        logger.info(f"Removing file {file_id} from job {job_id}")
        await job_service.remove_file_from_job(user_id, job_id, file_id)
        return {"message": "File removed successfully"}
    except ValueError as e:
        logger.warning(f"File {file_id} not found in job {job_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to remove file {file_id} from job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove file: {str(e)}")

@router.get("/{job_id}/events")
async def stream_job_events(
    job_id: str,
    token: str = Query(...),
    include_full_state: bool = Query(default=False, description="Include full_state snapshot (only needed on Processing page)")
):
    """Simplified Server-Sent Events stream for real-time job updates"""
    try:
        # Verify the token and get user_id
        from dependencies.auth import verify_token_string
        user_id = await verify_token_string(token)
        
        # Verify user has access to this job
        await job_service.verify_job_access(user_id, job_id)
        
        async def event_generator():
            try:
                # Get SSE manager and listen for events
                from services.sse_service import sse_manager
                
                async for event in sse_manager.listen_for_job_events(job_id, include_full_state=include_full_state):
                    yield f"data: {json.dumps(event)}\n\n"
                    
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.error(f"Error in SSE stream for job {job_id}: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                return

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Cache-Control"
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to start SSE stream for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start event stream: {str(e)}")

@router.get("/{job_id}/results", response_model=JobResultsResponse)
async def get_job_results(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    limit: int = Query(default=50, ge=1, le=1000, description="Number of results to return"),
    offset: int = Query(default=0, ge=0, description="Number of results to skip"),
    run_id: Optional[str] = Query(None, description="Specific run ID (defaults to latest)")
):
    """Get extraction results for a completed job run"""
    logger.info(f"Getting results for job {job_id}, user {user_id}, run {run_id}")
    try:
        response = await job_service.get_job_results(user_id, job_id, limit, offset, run_id)
        logger.info(f"Returning response: total={response.total}, results_count={len(response.results)}")
        return response
    except ValueError as e:
        logger.warning(f"Job {job_id} not found for user {user_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get results for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get results: {str(e)}")

@router.delete("/{job_id}")
async def delete_job(job_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete a job and all its data"""
    try:
        logger.info(f"Deleting job {job_id} for user {user_id}")
        await job_service.delete_job(user_id, job_id)
        return {"message": "Job deleted successfully"}
    except ValueError as e:
        logger.warning(f"Job {job_id} not found for user {user_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to delete job {job_id} for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete job: {str(e)}")

@router.put("/{job_id}/config-step")
async def update_config_step(
    job_id: str,
    request: ConfigStepRequest,
    user_id: str = Depends(get_current_user_id),
    run_id: Optional[str] = Query(None, description="Specific run ID (defaults to latest)")
):
    """Update job run configuration step"""
    try:
        await job_service.advance_config_step(
            job_id=job_id,
            user_id=user_id,
            next_step=request.config_step,
            run_id=run_id
        )
        return {"message": "Configuration step updated successfully"}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating config step: {e}")
        raise HTTPException(status_code=500, detail="Failed to update configuration step")

@router.post("/{job_id}/submit")
async def submit_job_for_processing(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    run_id: Optional[str] = Query(None, description="Specific run ID (defaults to latest)")
):
    """Submit job run for processing"""
    try:
        result_run_id = await job_service.submit_manual_job(job_id, user_id, run_id)
        return {
            "message": "Job run submitted for processing",
            "job_run_id": result_run_id
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error submitting job: {e}")
        raise HTTPException(status_code=500, detail="Failed to submit job")

@router.put("/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Cancel job (soft delete)"""
    try:
        # Update job status to cancelled
        await job_service.cancel_job(job_id, user_id)
        return {"message": "Job cancelled successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error cancelling job: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel job")

# New endpoints for saving workflow configuration data

class JobFieldsUpdateRequest(BaseModel):
    fields: List[dict]
    template_id: Optional[str] = None
    processing_modes: dict = None  # folder_path -> processing_mode mapping
    description: Optional[str] = None

class JobNameUpdateRequest(BaseModel):
    name: str

@router.put("/{job_id}/fields")
async def update_job_fields(
    job_id: str,
    request: JobFieldsUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    run_id: Optional[str] = Query(None, description="Specific run ID (defaults to latest)")
):
    """Update job field configuration and processing modes"""
    try:
        await job_service.update_job_fields(
            job_id=job_id,
            user_id=user_id,
            fields=request.fields,
            template_id=request.template_id,
            processing_modes=request.processing_modes,
            run_id=run_id,
            description=request.description
        )
        return {"message": "Job configuration updated successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating job configuration: {e}")
        raise HTTPException(status_code=500, detail="Failed to update job configuration")

@router.patch("/{job_id}")
async def update_job_details(
    job_id: str,
    request: JobNameUpdateRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Update job details like name"""
    try:
        await job_service.update_job_name(job_id, user_id, request.name)
        return {"message": "Job updated successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating job: {e}")
        raise HTTPException(status_code=500, detail="Failed to update job")

# Helper functions for export generation

@router.get("/{job_id}/export/csv")
async def export_job_results_csv(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id),
    run_id: Optional[str] = Query(None, description="Specific run ID (defaults to latest)"),
    db: Session = Depends(get_db)
):
    """Export job run results to CSV format"""
    try:
        # Get job results for specific run
        results_response = await job_service.get_job_results(current_user_id, job_id, run_id=run_id)
        
        # Generate CSV content using helper function
        csv_content = generate_csv_content(results_response)
        
        # Build filename using job name and export timestamp
        job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id, ExtractionJob.user_id == current_user_id).first()
        job_name = job.name if job and job.name else str(job_id)
        from datetime import datetime
        filename = generate_export_filename(job_name, datetime.utcnow(), "csv")
        
        # Return as downloadable file
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"CSV export error for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"CSV export failed: {str(e)}")

@router.get("/{job_id}/export/excel")
async def export_job_results_excel(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id),
    run_id: Optional[str] = Query(None, description="Specific run ID (defaults to latest)"),
    db: Session = Depends(get_db)
):
    """Export job run results to Excel format"""
    try:
        # Get job results for specific run
        results_response = await job_service.get_job_results(current_user_id, job_id, run_id=run_id)
        
        # Generate Excel content using helper function
        excel_content = generate_excel_content(results_response)
        
        # Build filename using job name and export timestamp
        job = db.query(ExtractionJob).filter(ExtractionJob.id == job_id, ExtractionJob.user_id == current_user_id).first()
        job_name = job.name if job and job.name else str(job_id)
        from datetime import datetime
        filename = generate_export_filename(job_name, datetime.utcnow(), "xlsx")
        
        # Return as downloadable file
        return Response(
            content=excel_content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Excel export error for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Excel export failed: {str(e)}")

@router.get("/{job_id}/export/gdrive/csv")
async def export_job_results_to_drive_csv(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    folder_id: Optional[str] = Query(None, description="Google Drive folder ID (optional)")
):
    """Export job results to Google Drive as CSV format (async)"""
    try:
        # Verify job exists and user has access
        job = db.query(ExtractionJob).filter(
            ExtractionJob.id == job_id,
            ExtractionJob.user_id == current_user_id
        ).first()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Enqueue export job using Cloud Run Tasks
        from services.cloud_run_task_service import cloud_run_task_service
        
        task_name = await cloud_run_task_service.enqueue_export_task(
            job_id=job_id,
            user_id=current_user_id,
            file_type='csv',
            folder_id=folder_id
        )
        
        logger.info(f"Enqueued Google Drive CSV export task {task_name} for job {job_id}")
        
        return {
            "success": True,
            "message": "Export started. You will be notified when it completes.",
            "export_task_name": task_name,
            "status": "processing"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start Google Drive CSV export for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.get("/{job_id}/export/gdrive/excel")
async def export_job_results_to_drive_excel(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    folder_id: Optional[str] = Query(None, description="Google Drive folder ID (optional)")
):
    """Export job results to Google Drive as Excel format (async)"""
    try:
        # Verify job exists and user has access
        job = db.query(ExtractionJob).filter(
            ExtractionJob.id == job_id,
            ExtractionJob.user_id == current_user_id
        ).first()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Enqueue export job using Cloud Run Tasks
        from services.cloud_run_task_service import cloud_run_task_service
        
        task_name = await cloud_run_task_service.enqueue_export_task(
            job_id=job_id,
            user_id=current_user_id,
            file_type='xlsx',
            folder_id=folder_id
        )
        
        logger.info(f"Enqueued Google Drive Excel export task {task_name} for job {job_id}")
        
        return {
            "success": True,
            "message": "Export started. You will be notified when it completes.",
            "export_task_name": task_name,
            "status": "processing"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start Google Drive Excel export for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

# ===================================================================
# File Import Endpoints (Epic 3)
# ===================================================================

@router.post("/{job_id}/files:gdrive")
async def import_drive_files(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Import files from Google Drive for a job
    """
    try:
        # Verify job exists and user has access
        job = db.query(ExtractionJob).filter(
            ExtractionJob.id == job_id,
            ExtractionJob.user_id == current_user_id
        ).first()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Parse request body
        body = await request.json()
        drive_file_ids = body.get("file_ids", [])
        
        if not drive_file_ids:
            raise HTTPException(status_code=400, detail="No file IDs provided")
        
        # Enqueue import job using Cloud Run Tasks
        from services.cloud_run_task_service import cloud_run_task_service
        
        task_name = await cloud_run_task_service.enqueue_import_task(
            task_type="import_drive_files",
            job_id=job_id,
            user_id=current_user_id,
            import_data={"drive_file_ids": drive_file_ids}
        )
        
        logger.info(f"Enqueued Drive import task {task_name} for {len(drive_file_ids)} files")
        
        return {
            "success": True,
            "import_task_name": task_name,
            "message": f"Import started for {len(drive_file_ids)} files",
            "file_count": len(drive_file_ids)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start Drive import for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

@router.post("/{job_id}/files:gmail")
async def import_gmail_attachments(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Import attachments from Gmail for a job
    """
    try:
        # Verify job exists and user has access
        job = db.query(ExtractionJob).filter(
            ExtractionJob.id == job_id,
            ExtractionJob.user_id == current_user_id
        ).first()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Parse request body
        body = await request.json()
        attachments = body.get("attachments", [])
        
        if not attachments:
            raise HTTPException(status_code=400, detail="No attachments provided")
        
        # Validate attachment data structure
        for attachment in attachments:
            required_fields = ['messageId', 'attachmentId', 'filename']
            for field in required_fields:
                if field not in attachment:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Missing required field '{field}' in attachment data"
                    )
        
        # Enqueue import job using Cloud Run Tasks
        from services.cloud_run_task_service import cloud_run_task_service
        
        task_name = await cloud_run_task_service.enqueue_import_task(
            task_type="import_gmail_attachments",
            job_id=job_id,
            user_id=current_user_id,
            import_data={"attachment_data": attachments}
        )
        
        logger.info(f"Enqueued Gmail import task {task_name} for {len(attachments)} attachments")
        
        return {
            "success": True,
            "import_task_name": task_name,
            "message": f"Import started for {len(attachments)} attachments",
            "attachment_count": len(attachments)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start Gmail import for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

@router.get("/{job_id}/import-status")
async def get_import_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Get import status for a job's source files
    """
    try:
        # Verify job exists and user has access
        job = db.query(ExtractionJob).filter(
            ExtractionJob.id == job_id,
            ExtractionJob.user_id == current_user_id
        ).first()
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Get source files with their import status
        source_files = db.query(SourceFile).filter(
            SourceFile.job_id == job_id
        ).all()
        
        # Group by source type and status
        status_summary = {
            'total_files': len(source_files),
            'by_source': {},
            'by_status': {},
            'files': []
        }
        
        for file in source_files:
            # Count by source type
            if file.source_type not in status_summary['by_source']:
                status_summary['by_source'][file.source_type] = 0
            status_summary['by_source'][file.source_type] += 1
            
            # Count by status
            if file.status not in status_summary['by_status']:
                status_summary['by_status'][file.status] = 0
            status_summary['by_status'][file.status] += 1
            
            # Add file details
            status_summary['files'].append({
                'id': str(file.id),
                'filename': file.original_filename,
                'source_type': file.source_type,
                'status': file.status,
                'file_size': file.file_size_bytes,
                'updated_at': file.updated_at.isoformat() if file.updated_at else None
            })
        
        return status_summary
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get import status for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get import status: {str(e)}")