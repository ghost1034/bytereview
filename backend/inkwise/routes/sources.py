import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import verify_firebase_token
from inkwise.schemas import (
    InkwiseMessageResponse,
    InkwisePaginatedSources,
    InkwisePlaceholderResponse,
    InkwiseSignedUrlResponse,
    InkwiseSourceCreateRequest,
    InkwiseSourceOut,
    InkwiseSourceIngestionOut,
    InkwiseUploadInfo,
    InkwiseSourceUploadCompleteRequest,
    InkwiseSourceUploadInitRequest,
    InkwiseSourceUploadInitResponse,
    build_placeholder_response,
)
from inkwise.services.ingestion_service import InkwiseIngestionService
from inkwise.services.source_service import InkwiseSourceService
from inkwise.services.task_service import enqueue_ingestion_task
from inkwise.settings import get_inkwise_settings

router = APIRouter(prefix="/sources", tags=["inkwise-sources"])
source_service = InkwiseSourceService()
ingestion_service = InkwiseIngestionService()


@router.get("", response_model=InkwisePaginatedSources)
async def list_sources(
    page: int = 1,
    limit: int = 20,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwisePaginatedSources:
    user_id = token_data["uid"]
    try:
        items, total = source_service.list_sources(db, user_id=user_id, page=page, limit=limit)
        return InkwisePaginatedSources(
            items=[InkwiseSourceOut.model_validate(item) for item in items],
            page=page,
            limit=limit,
            total=total,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("", response_model=InkwiseSourceOut)
async def create_source(
    body: InkwiseSourceCreateRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSourceOut:
    user_id = token_data["uid"]
    try:
        source_service.ensure_user_record(db, user_id=user_id, email=token_data.get("email"))
        source = source_service.create_source(db, user_id=user_id, body=body)
        return InkwiseSourceOut.model_validate(source)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create source: {exc}") from exc


@router.get("/{source_id}", response_model=InkwiseSourceOut)
async def get_source(
    source_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSourceOut:
    user_id = token_data["uid"]
    try:
        source = source_service.get_source_or_404(db, user_id=user_id, source_id=source_id)
        return InkwiseSourceOut.model_validate(source)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{source_id}", response_model=InkwiseMessageResponse)
async def delete_source(
    source_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseMessageResponse:
    user_id = token_data["uid"]
    try:
        source_service.delete_source(db, user_id=user_id, source_id=source_id)
        return InkwiseMessageResponse(message="Source deleted successfully")
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete source: {exc}") from exc


@router.post("/upload:init", response_model=InkwiseSourceUploadInitResponse)
async def init_source_upload(
    body: InkwiseSourceUploadInitRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSourceUploadInitResponse:
    user_id = token_data["uid"]
    try:
        source_service.ensure_user_record(db, user_id=user_id, email=token_data.get("email"))
        source, upload = source_service.init_upload(db, user_id=user_id, body=body)
        return InkwiseSourceUploadInitResponse(
            source=InkwiseSourceOut.model_validate(source),
            upload=InkwiseUploadInfo(
                method="PUT",
                url=upload.url,
                headers=upload.headers,
                expires_at=upload.expires_at,
            ),
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to initialize upload: {exc}") from exc


@router.post("/{source_id}/upload:complete", response_model=InkwiseSourceOut)
async def complete_source_upload(
    source_id: uuid.UUID,
    body: InkwiseSourceUploadCompleteRequest | None = None,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSourceOut:
    user_id = token_data["uid"]
    try:
        source = source_service.complete_upload(
            db,
            user_id=user_id,
            source_id=source_id,
            checksum_sha256=body.checksum_sha256 if body else None,
        )
        return InkwiseSourceOut.model_validate(source)
    except FileNotFoundError as exc:
        db.rollback()
        status_code = 404 if str(exc) == "Source not found" else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to finalize upload: {exc}") from exc


@router.get("/{source_id}/preview", response_model=InkwiseSignedUrlResponse)
async def preview_source(
    source_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSignedUrlResponse:
    user_id = token_data["uid"]
    try:
        signed = source_service.signed_preview(db, user_id=user_id, source_id=source_id)
        return InkwiseSignedUrlResponse(url=signed.url, expires_at=signed.expires_at)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create preview URL: {exc}") from exc


@router.get("/{source_id}/download", response_model=InkwiseSignedUrlResponse)
async def download_source(
    source_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSignedUrlResponse:
    user_id = token_data["uid"]
    try:
        signed = source_service.signed_download(db, user_id=user_id, source_id=source_id)
        return InkwiseSignedUrlResponse(url=signed.url, expires_at=signed.expires_at)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create download URL: {exc}") from exc


@router.post("/{source_id}/ingest", response_model=InkwiseSourceIngestionOut, status_code=202)
async def enqueue_source_ingestion(
    source_id: uuid.UUID,
    request: Request,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSourceIngestionOut:
    user_id = token_data["uid"]
    try:
        ingestion = ingestion_service.enqueue_ingestion(db, user_id=user_id, source_id=source_id)
        settings = get_inkwise_settings()
        enqueued = enqueue_ingestion_task(
            settings=settings,
            ingestion_id=str(ingestion.id),
            delay_seconds=0,
            service_url=str(request.base_url).rstrip("/"),
        )
        if not enqueued.created:
            ingestion_id = uuid.UUID(str(ingestion.id))
            ingestion = ingestion_service.process_source_ingestion_once(db, ingestion_id=ingestion_id)
        return InkwiseSourceIngestionOut.model_validate(ingestion)
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to enqueue ingestion: {exc}") from exc
