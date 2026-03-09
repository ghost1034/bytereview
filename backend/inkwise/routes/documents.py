import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import get_current_user_id, verify_firebase_token
from inkwise.schemas import (
    InkwiseDocumentCreateRequest,
    InkwiseDocumentOut,
    InkwiseDocumentUpdateRequest,
    InkwiseMessageResponse,
    InkwisePaginatedDocuments,
    InkwisePlaceholderListResponse,
    InkwisePlaceholderResponse,
    build_placeholder_list_response,
    build_placeholder_response,
)
from inkwise.services.document_service import InkwiseDocumentService
from inkwise.services.source_service import InkwiseSourceService

router = APIRouter(prefix="/documents", tags=["inkwise-documents"])
document_service = InkwiseDocumentService()
user_support = InkwiseSourceService()


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
        user_support.ensure_user_record(db, user_id=token_data["uid"], email=token_data.get("email"))
        document = document_service.create_document(db, user_id=token_data["uid"], body=body)
        return InkwiseDocumentOut.model_validate(document)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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


@router.get("/{document_id}/sources", response_model=InkwisePlaceholderListResponse)
async def list_document_sources(document_id: str, user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderListResponse:
    return build_placeholder_list_response(
        area="bindings",
        action="list",
        message=f"Inkwise document-source binding scaffold is registered for document {document_id}.",
        user_id=user_id,
    )


@router.post("/{document_id}/sources:bind", response_model=InkwisePlaceholderResponse)
async def bind_document_sources(document_id: str, user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="bindings",
        action="bind",
        message=f"Inkwise bind-sources scaffold is registered for document {document_id}.",
        user_id=user_id,
    )


@router.post("/{document_id}/sources:unbind", response_model=InkwisePlaceholderResponse)
async def unbind_document_sources(document_id: str, user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="bindings",
        action="unbind",
        message=f"Inkwise unbind-sources scaffold is registered for document {document_id}.",
        user_id=user_id,
    )
