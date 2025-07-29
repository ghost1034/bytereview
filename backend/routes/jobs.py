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
from io import StringIO, BytesIO
from dependencies.auth import get_current_user_id, verify_token_string
from services.job_service import JobService
from services.sse_service import sse_manager
from models.job import (
    JobInitiateRequest, JobInitiateResponse,
    JobStartRequest, JobStartResponse,
    JobDetailsResponse, JobListResponse,
    JobProgressResponse, JobResultsResponse,
    JobFilesResponse, FileStatus
)
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

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

@router.post("/{job_id}/start", response_model=JobStartResponse)
async def start_job(
    job_id: str,
    request: JobStartRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Step 2: Start job processing with field configuration and task definitions
    """
    try:
        logger.info(f"Starting job {job_id} for user {user_id}")
        response = await job_service.start_job(user_id, job_id, request)
        return response
    except ValueError as e:
        logger.warning(f"Invalid job start request for {job_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to start job {job_id} for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start job: {str(e)}")

# New resumable workflow endpoints (must come before /{job_id} routes)

@router.get("/resumable")
async def list_resumable_jobs(
    user_id: str = Depends(get_current_user_id)
):
    """List jobs that can be resumed"""
    try:
        jobs = job_service.get_resumable_jobs(user_id)
        return {
            "jobs": [
                ResumableJobResponse(
                    id=str(job.id),
                    name=job.name,
                    config_step=job.config_step,
                    status=job.status,
                    progress_percentage=job.progress_percentage,
                    tasks_completed=job.tasks_completed,
                    tasks_total=job.tasks_total,
                    tasks_failed=job.tasks_failed,
                    is_resumable=job.is_resumable,
                    created_at=job.created_at.isoformat(),
                    last_active_at=job.last_active_at.isoformat()
                ) for job in jobs
            ]
        }
    except Exception as e:
        logger.error(f"Error listing resumable jobs: {e}")
        raise HTTPException(status_code=500, detail="Failed to list resumable jobs")

@router.get("/{job_id}", response_model=JobDetailsResponse)
async def get_job_details(
    job_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get detailed information about a specific job
    """
    try:
        response = await job_service.get_job_details(user_id, job_id)
        return response
    except ValueError as e:
        logger.warning(f"Job {job_id} not found for user {user_id}: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get job details for {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get job details: {str(e)}")

@router.get("", response_model=JobListResponse)
async def list_jobs(
    user_id: str = Depends(get_current_user_id),
    limit: int = Query(default=25, ge=1, le=100, description="Number of jobs to return"),
    offset: int = Query(default=0, ge=0, description="Number of jobs to skip"),
    status: Optional[str] = Query(default=None, description="Filter by job status")
):
    """
    List jobs for the current user with pagination and filtering
    """
    try:
        # TODO: Implement status filtering when needed
        response = await job_service.list_user_jobs(user_id, limit, offset)
        return response
    except Exception as e:
        logger.error(f"Failed to list jobs for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list jobs: {str(e)}")

@router.get("/{job_id}/progress", response_model=JobProgressResponse)
async def get_job_progress(
    job_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get job progress information for real-time updates
    """
    try:
        response = await job_service.get_job_progress(user_id, job_id)
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
    processable: bool = Query(default=False, description="Only return files that can be processed for data extraction (excludes ZIP files)")
):
    """Get flat list of files in a job"""
    try:
        files = await job_service.get_job_files(user_id, job_id, processable_only=processable)
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
    token: str = Query(...)
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
                
                async for event in sse_manager.listen_for_job_events(job_id):
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
    offset: int = Query(default=0, ge=0, description="Number of results to skip")
):
    """Get extraction results for a completed job"""
    logger.info(f"Getting results for job {job_id}, user {user_id}")
    try:
        response = await job_service.get_job_results(user_id, job_id, limit, offset)
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

# Duplicate resumable endpoint removed (moved above)

@router.put("/{job_id}/config-step")
async def update_config_step(
    job_id: str,
    request: ConfigStepRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Update job configuration step"""
    try:
        await job_service.advance_config_step(
            job_id=job_id,
            user_id=user_id,
            next_step=request.config_step,
            expected_version=request.version
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
    user_id: str = Depends(get_current_user_id)
):
    """Submit job for processing"""
    try:
        await job_service.submit_job_for_processing(job_id, user_id)
        return {"message": "Job submitted for processing"}
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
    template_id: str = None
    processing_modes: dict = None  # folder_path -> processing_mode mapping

class JobNameUpdateRequest(BaseModel):
    name: str

@router.put("/{job_id}/fields")
async def update_job_fields(
    job_id: str,
    request: JobFieldsUpdateRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Update job field configuration and processing modes"""
    try:
        await job_service.update_job_fields(
            job_id, 
            user_id, 
            request.fields, 
            request.template_id, 
            request.processing_modes
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

@router.get("/{job_id}/export/csv")
async def export_job_results_csv(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id)
):
    """Export job results to CSV format"""
    try:
        # Get job results
        results_response = await job_service.get_job_results(current_user_id, job_id)
        
        if not results_response.results:
            raise HTTPException(status_code=404, detail="No results found for this job")
        
        # Create CSV content
        output = StringIO()
        
        # Determine field names from the first result
        first_result = results_response.results[0]
        if not first_result.extracted_data:
            raise HTTPException(status_code=400, detail="No extracted data found")
        
        # Get field names from the columns snapshot in extracted_data
        if "columns" not in first_result.extracted_data:
            raise HTTPException(status_code=400, detail="Invalid extracted data format - missing columns")
        
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
        
        # Return as downloadable file
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=job_{job_id}_results.csv"}
        )
        
    except Exception as e:
        logger.error(f"CSV export error for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"CSV export failed: {str(e)}")

@router.get("/{job_id}/export/excel")
async def export_job_results_excel(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id)
):
    """Export job results to Excel format"""
    try:
        # Get job results
        results_response = await job_service.get_job_results(current_user_id, job_id)
        
        if not results_response.results:
            raise HTTPException(status_code=404, detail="No results found for this job")
        
        # Create Excel workbook
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.title = "Extraction Results"
        
        # Determine field names from the first result
        first_result = results_response.results[0]
        if not first_result.extracted_data:
            raise HTTPException(status_code=400, detail="No extracted data found")
        
        # Get field names from the columns snapshot in extracted_data
        if "columns" not in first_result.extracted_data:
            raise HTTPException(status_code=400, detail="Invalid extracted data format - missing columns")
        
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
        
        # Return as downloadable file
        return Response(
            content=output.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=job_{job_id}_results.xlsx"}
        )
        
    except Exception as e:
        logger.error(f"Excel export error for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Excel export failed: {str(e)}")