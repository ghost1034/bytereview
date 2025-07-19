"""
Job management routes for ByteReview
New asynchronous job-based extraction workflow
"""
from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile
from fastapi.responses import StreamingResponse
from typing import Optional, List
import json
import asyncio
from dependencies.auth import get_current_user_id
from services.job_service import JobService
from models.job import (
    JobInitiateRequest, JobInitiateResponse,
    JobStartRequest, JobStartResponse,
    JobDetailsResponse, JobListResponse,
    JobProgressResponse, JobResultsResponse,
    JobFilesResponse, FileStatus
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize job service
job_service = JobService()

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
    user_id: str = Depends(get_current_user_id)
):
    """Get flat list of files in a job"""
    try:
        files = await job_service.get_job_files(user_id, job_id)
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

# TODO: Implement additional endpoints for Phase 3
# @router.get("/{job_id}/results")
# async def get_job_results(job_id: str, user_id: str = Depends(get_current_user_id)):
#     """Get extraction results for a completed job"""
#     pass

# @router.get("/{job_id}/export")
# async def export_job_results(job_id: str, format: str = "csv", user_id: str = Depends(get_current_user_id)):
#     """Export job results as CSV or XLSX"""
#     pass

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