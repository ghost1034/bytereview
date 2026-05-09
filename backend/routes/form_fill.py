"""Routes for the Form Fill feature."""

from __future__ import annotations

import os
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from dependencies.auth import get_current_user_id
from models.form_fill import (
    FormFillExtractionSourcePreviewResponse,
    FormFillRunCreateResponse,
    FormFillRunListResponse,
    FormFillRunResponse,
    FormFillTemplateListResponse,
)
from services.form_fill_service import form_fill_service


router = APIRouter()


@router.get("/templates", response_model=FormFillTemplateListResponse)
async def list_form_fill_templates(user_id: str = Depends(get_current_user_id)):
    return FormFillTemplateListResponse(templates=form_fill_service.list_templates(user_id))


@router.delete("/templates/{template_id}")
async def delete_form_fill_template(template_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        form_fill_service.delete_template(user_id, template_id)
        return {"message": "Template deleted"}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete template: {str(exc)}")


@router.get("/extraction-source-preview", response_model=FormFillExtractionSourcePreviewResponse)
async def get_extraction_source_preview(
    job_id: str = Query(...),
    run_id: str = Query(...),
    task_id: str = Query(...),
    user_id: str = Depends(get_current_user_id),
):
    try:
        return form_fill_service.get_extraction_source_preview(
            user_id,
            job_id=job_id,
            run_id=run_id,
            task_id=task_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load extraction preview: {str(exc)}")


@router.post("/runs", response_model=FormFillRunCreateResponse)
async def create_form_fill_run(
    source_files: list[UploadFile] | None = File(default=None),
    target_file: UploadFile | None = File(default=None),
    template_id: str | None = Form(default=None),
    output_format: str | None = Form(default=None),
    repeat_mode: str | None = Form(default=None),
    allow_docx_table_expansion: bool | None = Form(default=None),
    save_template_name: str | None = Form(default=None),
    save_template_description: str | None = Form(default=None),
    source_job_id: str | None = Form(default=None),
    source_run_id: str | None = Form(default=None),
    source_task_id: str | None = Form(default=None),
    user_id: str = Depends(get_current_user_id),
):
    try:
        run = await form_fill_service.create_run(
            user_id=user_id,
            source_files=source_files,
            target_file=target_file,
            template_id=template_id,
            output_format=output_format,
            repeat_mode=repeat_mode,
            allow_docx_table_expansion=allow_docx_table_expansion,
            save_template_name=save_template_name,
            save_template_description=save_template_description,
            source_job_id=source_job_id,
            source_run_id=source_run_id,
            source_task_id=source_task_id,
        )
        return FormFillRunCreateResponse(run=run, message="Form Fill run created")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create Form Fill run: {str(exc)}")


@router.get("/runs", response_model=FormFillRunListResponse)
async def list_form_fill_runs(
    user_id: str = Depends(get_current_user_id),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
):
    try:
        return form_fill_service.list_runs(user_id, limit=limit, offset=offset, status=status)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load Form Fill runs: {str(exc)}")


@router.get("/runs/{run_id}", response_model=FormFillRunResponse)
async def get_form_fill_run(run_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        return form_fill_service.get_run(user_id, run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load Form Fill run: {str(exc)}")


@router.get("/runs/{run_id}/download")
async def download_form_fill_run(run_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        run = form_fill_service.get_run_result_metadata(user_id, run_id)
        suffix = os.path.splitext(run.result_filename or "download")[1] or ".bin"
        handle = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        handle.close()
        await form_fill_service._download_to_local(run.result_gcs_object_name, handle.name)
        return FileResponse(
            handle.name,
            filename=run.result_filename,
            media_type=run.result_file_type or "application/octet-stream",
            background=BackgroundTask(os.unlink, handle.name),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to download Form Fill result: {str(exc)}")
