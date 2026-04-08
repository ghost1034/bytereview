import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import verify_firebase_token
from inkwise.schemas import (
    InkwiseBindSourcesRequest,
    InkwiseBindSourcesResponse,
    InkwiseBoundSourceOut,
    InkwiseDocumentBoundSourcesOut,
    InkwiseDocumentCreateRequest,
    InkwiseDocumentFolderCreateRequest,
    InkwiseDocumentFolderListResponse,
    InkwiseDocumentFolderOut,
    InkwiseDocumentFolderUpdateRequest,
    InkwiseDocumentMoveRequest,
    InkwiseDocumentRevisionListResponse,
    InkwiseDocumentRevisionOut,
    InkwiseDocumentOut,
    InkwiseDocumentUpdateRequest,
    InkwiseMessageResponse,
    InkwisePaginatedDocuments,
    InkwiseSourceOut,
)
from inkwise.services.document_sources import InkwiseDocumentSourceService
from inkwise.services.document_service import InkwiseDocumentService
from inkwise.services.source_service import InkwiseSourceService
from services.user_service import DuplicatePhoneNumberError

router = APIRouter(prefix="/documents", tags=["inkwise-documents"])
document_service = InkwiseDocumentService()
document_source_service = InkwiseDocumentSourceService()
user_support = InkwiseSourceService()


@router.get("/folders", response_model=InkwiseDocumentFolderListResponse)
def list_document_folders(
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentFolderListResponse:
    items = document_service.list_folders(db, user_id=token_data["uid"])
    return InkwiseDocumentFolderListResponse(items=[InkwiseDocumentFolderOut.model_validate(item) for item in items])


@router.post("/folders", response_model=InkwiseDocumentFolderOut, status_code=201)
def create_document_folder(
    body: InkwiseDocumentFolderCreateRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentFolderOut:
    try:
        folder = document_service.create_folder(db, user_id=token_data["uid"], body=body)
        return InkwiseDocumentFolderOut.model_validate(folder)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/folders/{folder_id}", response_model=InkwiseDocumentFolderOut)
def update_document_folder(
    folder_id: uuid.UUID,
    body: InkwiseDocumentFolderUpdateRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentFolderOut:
    try:
        folder = document_service.update_folder(db, user_id=token_data["uid"], folder_id=folder_id, body=body)
        return InkwiseDocumentFolderOut.model_validate(folder)
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/folders/{folder_id}", response_model=InkwiseMessageResponse)
def delete_document_folder(
    folder_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseMessageResponse:
    try:
        document_service.delete_folder(db, user_id=token_data["uid"], folder_id=folder_id)
        return InkwiseMessageResponse(message="Folder deleted successfully")
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("", response_model=InkwisePaginatedDocuments)
def list_documents(
    page: int = 1,
    limit: int = 20,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwisePaginatedDocuments:
    try:
        items, total = document_service.list_documents(db, user_id=token_data["uid"], page=page, limit=limit)
        return InkwisePaginatedDocuments(
            items=[InkwiseDocumentOut.model_validate(item) for item in items],
            page=page,
            limit=limit,
            total=total,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("", response_model=InkwiseDocumentOut, status_code=201)
def create_document(
    body: InkwiseDocumentCreateRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentOut:
    try:
        user_support.ensure_user_record(
            db,
            user_id=token_data["uid"],
            email=token_data.get("email"),
            phone_number=token_data.get("phone_number"),
        )
        document = document_service.create_document(db, user_id=token_data["uid"], body=body)
        return InkwiseDocumentOut.model_validate(document)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DuplicatePhoneNumberError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create document: {exc}") from exc


@router.get("/{document_id}", response_model=InkwiseDocumentOut)
def get_document(
    document_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentOut:
    try:
        document = document_service.get_document_or_404(db, user_id=token_data["uid"], document_id=document_id)
        return InkwiseDocumentOut.model_validate(document)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/{document_id}", response_model=InkwiseDocumentOut)
def update_document(
    document_id: uuid.UUID,
    body: InkwiseDocumentUpdateRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentOut:
    try:
        document = document_service.update_document(
            db,
            user_id=token_data["uid"],
            document_id=document_id,
            body=body,
        )
        return InkwiseDocumentOut.model_validate(document)
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update document: {exc}") from exc


@router.delete("/{document_id}", response_model=InkwiseMessageResponse)
def delete_document(
    document_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseMessageResponse:
    try:
        document_service.delete_document(db, user_id=token_data["uid"], document_id=document_id)
        return InkwiseMessageResponse(message="Document deleted successfully")
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {exc}") from exc


@router.post("/{document_id}:move", response_model=InkwiseDocumentOut)
def move_document(
    document_id: uuid.UUID,
    body: InkwiseDocumentMoveRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentOut:
    try:
        document = document_service.move_document(db, user_id=token_data["uid"], document_id=document_id, body=body)
        return InkwiseDocumentOut.model_validate(document)
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{document_id}/sources", response_model=InkwiseDocumentBoundSourcesOut)
def list_document_sources(
    document_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentBoundSourcesOut:
    try:
        document_source_service.get_document_or_404(db, user_id=token_data["uid"], document_id=document_id)
        statuses = document_source_service.list_bound_source_statuses(
            db,
            document_id=document_id,
            user_id=token_data["uid"],
        )
        return InkwiseDocumentBoundSourcesOut(
            document_id=document_id,
            sources=[
                InkwiseBoundSourceOut(
                    binding_id=status.binding_id,
                    source=InkwiseSourceOut.model_validate(status.source),
                    is_active=status.is_active,
                    grounded_chat_ready=status.grounded_chat_ready,
                    grounded_chat_reason=status.grounded_chat_reason,
                )
                for status in statuses
            ],
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{document_id}/sources:bind", response_model=InkwiseBindSourcesResponse)
def bind_document_sources(
    document_id: uuid.UUID,
    body: InkwiseBindSourcesRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseBindSourcesResponse:
    try:
        bound = document_source_service.bind_sources(
            db,
            user_id=token_data["uid"],
            document_id=document_id,
            source_ids=body.source_ids,
        )
        return InkwiseBindSourcesResponse(document_id=document_id, bound_source_ids=bound)
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to bind sources: {exc}") from exc


@router.post("/{document_id}/sources:unbind", response_model=InkwiseBindSourcesResponse)
def unbind_document_sources(
    document_id: uuid.UUID,
    body: InkwiseBindSourcesRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseBindSourcesResponse:
    try:
        remaining = document_source_service.unbind_sources(
            db,
            user_id=token_data["uid"],
            document_id=document_id,
            source_ids=body.source_ids,
        )
        return InkwiseBindSourcesResponse(document_id=document_id, bound_source_ids=remaining)
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to unbind sources: {exc}") from exc


@router.get("/{document_id}/revisions", response_model=InkwiseDocumentRevisionListResponse)
def list_document_revisions(
    document_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentRevisionListResponse:
    try:
        items = document_service.list_revisions(db, user_id=token_data["uid"], document_id=document_id)
        return InkwiseDocumentRevisionListResponse(
            document_id=document_id,
            items=[InkwiseDocumentRevisionOut.model_validate(item) for item in items],
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{document_id}/revisions/{revision_id}", response_model=InkwiseDocumentRevisionOut)
def get_document_revision(
    document_id: uuid.UUID,
    revision_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentRevisionOut:
    try:
        revision = document_service.get_revision_or_404(
            db,
            user_id=token_data["uid"],
            document_id=document_id,
            revision_id=revision_id,
        )
        return InkwiseDocumentRevisionOut.model_validate(revision)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{document_id}/revisions/{revision_id}:restore", response_model=InkwiseDocumentOut)
def restore_document_revision(
    document_id: uuid.UUID,
    revision_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseDocumentOut:
    try:
        document = document_service.restore_revision(
            db,
            user_id=token_data["uid"],
            document_id=document_id,
            revision_id=revision_id,
        )
        return InkwiseDocumentOut.model_validate(document)
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to restore revision: {exc}") from exc
