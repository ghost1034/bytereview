"""
CPE Tracker routes for ByteReview
Provides a simplified single-page workflow for CPE certificate tracking
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
import logging
import os

from dependencies.auth import get_current_user_id
from core.database import get_db, db_config
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from models.db_models import (
    ExtractionJob, JobRun, Template, TemplateField, JobField,
    SourceFile, ExtractionTask
)
from models.cpe import (
    CpeStateResponse, CpeStatesListResponse,
    CpeSheetListItem, CpeSheetsListResponse,
    CreateCpeSheetRequest, CreateCpeSheetResponse,
    StartCpeSheetResponse
)
from services.job_service import JobService

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize job service
job_service = JobService()


@router.get("/states", response_model=CpeStatesListResponse)
async def get_cpe_states(
    user_id: str = Depends(get_current_user_id)
):
    """
    Get list of available CPE state templates
    Returns public templates with template_type='cpe'
    """
    db = db_config.get_session()
    try:
        templates = db.query(Template).filter(
            Template.template_type == 'cpe',
            Template.is_public == True
        ).order_by(Template.name).all()

        states = [
            CpeStateResponse(
                template_id=str(t.id),
                name=t.name
            )
            for t in templates
        ]

        return CpeStatesListResponse(states=states)

    except Exception as e:
        logger.error(f"Failed to get CPE states: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get CPE states: {str(e)}")
    finally:
        db.close()


@router.get("/sheets", response_model=CpeSheetsListResponse)
async def list_cpe_sheets(
    user_id: str = Depends(get_current_user_id)
):
    """
    List user's CPE sheets (jobs with job_type='cpe')
    """
    db = db_config.get_session()
    try:
        # Subquery for latest run per job
        latest_runs_subquery = db.query(
            JobRun.job_id,
            func.max(JobRun.created_at).label('latest_created_at')
        ).group_by(JobRun.job_id).subquery()

        # Get CPE jobs with latest run data
        jobs_query = db.query(
            ExtractionJob,
            JobRun.id.label('latest_run_id'),
            JobRun.status.label('latest_status'),
            JobRun.config_step.label('latest_config_step'),
            JobRun.template_id.label('latest_template_id')
        ).join(
            latest_runs_subquery, ExtractionJob.id == latest_runs_subquery.c.job_id
        ).join(
            JobRun, and_(
                JobRun.job_id == ExtractionJob.id,
                JobRun.created_at == latest_runs_subquery.c.latest_created_at
            )
        ).filter(
            ExtractionJob.user_id == user_id,
            ExtractionJob.job_type == 'cpe'
        ).order_by(
            ExtractionJob.created_at.desc()
        )

        jobs_with_runs = jobs_query.all()

        # Get template names for state display
        template_ids = [r.latest_template_id for r in jobs_with_runs if r.latest_template_id]
        template_names = {}
        if template_ids:
            templates = db.query(Template.id, Template.name).filter(Template.id.in_(template_ids)).all()
            template_names = {str(t.id): t.name for t in templates}

        sheets = [
            CpeSheetListItem(
                job_id=str(job.id),
                name=job.name or "Untitled CPE Sheet",
                state_name=template_names.get(str(latest_template_id)) if latest_template_id else None,
                status=latest_status,
                config_step=latest_config_step,
                created_at=job.created_at,
                latest_run_id=str(latest_run_id) if latest_run_id else None
            )
            for job, latest_run_id, latest_status, latest_config_step, latest_template_id in jobs_with_runs
        ]

        return CpeSheetsListResponse(
            sheets=sheets,
            total=len(sheets)
        )

    except Exception as e:
        logger.error(f"Failed to list CPE sheets for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list CPE sheets: {str(e)}")
    finally:
        db.close()


@router.post("/sheets", response_model=CreateCpeSheetResponse)
async def create_cpe_sheet(
    request: CreateCpeSheetRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Create a new CPE sheet (extraction job with job_type='cpe')
    """
    db = db_config.get_session()
    try:
        # Validate template exists and is a CPE template
        template = db.query(Template).filter(
            Template.id == request.template_id,
            Template.template_type == 'cpe'
        ).first()

        if not template:
            raise HTTPException(status_code=404, detail="CPE state template not found")

        if not template.is_public and template.user_id != user_id:
            raise HTTPException(status_code=403, detail="Template not accessible")

        # Create the job with job_type='cpe'
        job_name = request.name or f"CPE Tracker - {template.name}"
        job = ExtractionJob(
            name=job_name,
            user_id=user_id,
            job_type='cpe'
        )
        db.add(job)
        db.flush()

        # Create initial job run with the template
        job_run = JobRun(
            job_id=job.id,
            template_id=template.id,
            config_step='upload',
            status='pending'
        )
        db.add(job_run)
        db.commit()

        logger.info(f"Created CPE sheet {job.id} for user {user_id} with template {template.name}")

        return CreateCpeSheetResponse(
            job_id=str(job.id),
            run_id=str(job_run.id),
            message=f"CPE sheet created for {template.name}"
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create CPE sheet: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create CPE sheet: {str(e)}")
    finally:
        db.close()


@router.delete("/sheets/{job_id}")
async def delete_cpe_sheet(
    job_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Delete a CPE sheet
    """
    db = db_config.get_session()
    try:
        # Verify job exists, belongs to user, and is a CPE job
        job = db.query(ExtractionJob).filter(
            ExtractionJob.id == job_id,
            ExtractionJob.user_id == user_id,
            ExtractionJob.job_type == 'cpe'
        ).first()

        if not job:
            raise HTTPException(status_code=404, detail="CPE sheet not found")

        # Use the job service to delete (handles cascade cleanup)
        await job_service.delete_job(user_id, job_id)

        return {"message": "CPE sheet deleted successfully"}

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to delete CPE sheet {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete CPE sheet: {str(e)}")
    finally:
        db.close()


@router.post("/sheets/{job_id}/start", response_model=StartCpeSheetResponse)
async def start_cpe_sheet(
    job_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Start processing a CPE sheet.
    - If the latest run is not editable, creates a new run with append_results=true
    - Sets up fields from the state template
    - Creates extraction tasks for all files
    - Submits the run for processing
    """
    db = db_config.get_session()
    try:
        # Verify job exists, belongs to user, and is a CPE job
        job = db.query(ExtractionJob).filter(
            ExtractionJob.id == job_id,
            ExtractionJob.user_id == user_id,
            ExtractionJob.job_type == 'cpe'
        ).first()

        if not job:
            raise HTTPException(status_code=404, detail="CPE sheet not found")

        # Get latest run
        latest_run = job_service.get_latest_run(job_id, user_id)
        if not latest_run:
            raise HTTPException(status_code=400, detail="No run found for this CPE sheet")

        # Check if we need to create a new run (append mode)
        active_run = latest_run
        if latest_run.config_step == 'submitted' or latest_run.status in ('in_progress', 'completed', 'failed'):
            # Create a new run that appends to previous results
            new_run_id = await job_service.create_job_run(
                job_id=job_id,
                user_id=user_id,
                clone_from_run_id=str(latest_run.id),
                template_id=str(latest_run.template_id) if latest_run.template_id else None,
                append_results=True
            )
            # Refresh to get the new run
            active_run = job_service.get_job_run(job_id, new_run_id, user_id)
            logger.info(f"Created new append run {new_run_id} for CPE sheet {job_id}")

        # Get the template for this run
        template_id = active_run.template_id
        if not template_id:
            raise HTTPException(status_code=400, detail="No state template associated with this CPE sheet")

        template = db.query(Template).filter(Template.id == template_id).first()
        if not template:
            raise HTTPException(status_code=400, detail="State template not found")

        # Get template fields
        template_fields = db.query(TemplateField).filter(
            TemplateField.template_id == template_id
        ).order_by(TemplateField.display_order).all()

        if not template_fields:
            raise HTTPException(status_code=400, detail="No fields defined in state template")

        # Convert template fields to the format expected by update_job_fields
        fields = [
            {
                "field_name": tf.field_name,
                "data_type_id": tf.data_type_id,
                "ai_prompt": tf.ai_prompt,
                "display_order": tf.display_order
            }
            for tf in template_fields
        ]

        # Get processable files for this run
        files = await job_service.get_job_files(
            job_id,
            processable_only=True,
            user_id=user_id,
            run_id=str(active_run.id)
        )

        if not files:
            raise HTTPException(
                status_code=400,
                detail="No files uploaded. Please upload CPE certificates before starting."
            )

        # Build processing_modes - all folders set to 'individual'
        # Group files by folder path
        folder_paths = set()
        for f in files:
            path = f.original_path
            folder = os.path.dirname(path) if path else ""
            folder_paths.add(folder or "/")

        processing_modes = {folder: 'individual' for folder in folder_paths}

        # Update job fields and create tasks
        await job_service.update_job_fields(
            job_id=job_id,
            user_id=user_id,
            fields=fields,
            template_id=str(template_id),
            processing_modes=processing_modes,
            run_id=str(active_run.id),
            description=f"CPE certificate extraction for {template.name}"
        )

        # Submit the job for processing
        result_run_id = await job_service.submit_manual_job(job_id, user_id, str(active_run.id))

        logger.info(f"Started CPE sheet {job_id}, run {result_run_id}")

        return StartCpeSheetResponse(
            active_run_id=result_run_id,
            message="CPE sheet processing started"
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to start CPE sheet {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start CPE sheet: {str(e)}")
    finally:
        db.close()
