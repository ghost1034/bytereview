"""
Job management routes for ByteReview
New asynchronous job-based extraction workflow
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from dependencies.auth import get_current_user_id
from services.job_service import JobService
from models.job import (
    JobInitiateRequest, JobInitiateResponse,
    JobStartRequest, JobStartResponse,
    JobDetailsResponse, JobListResponse,
    JobProgressResponse, JobResultsResponse
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

# TODO: Implement additional endpoints for Phase 2
# @router.get("/{job_id}/files")
# async def get_job_files(job_id: str, user_id: str = Depends(get_current_user_id)):
#     """Get list of files in a job"""
#     pass

# @router.get("/{job_id}/results")
# async def get_job_results(job_id: str, user_id: str = Depends(get_current_user_id)):
#     """Get extraction results for a completed job"""
#     pass

# @router.get("/{job_id}/export")
# async def export_job_results(job_id: str, format: str = "csv", user_id: str = Depends(get_current_user_id)):
#     """Export job results as CSV or XLSX"""
#     pass

# @router.delete("/{job_id}")
# async def delete_job(job_id: str, user_id: str = Depends(get_current_user_id)):
#     """Delete a job and all its data"""
#     pass

# @router.get("/{job_id}/stream-status")
# async def stream_job_status(job_id: str, user_id: str = Depends(get_current_user_id)):
#     """Server-Sent Events stream for real-time job status updates"""
#     pass