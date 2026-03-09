from fastapi import APIRouter, Depends

from dependencies.auth import get_current_user_id
from inkwise.schemas import (
    InkwisePlaceholderListResponse,
    InkwisePlaceholderResponse,
    build_placeholder_list_response,
    build_placeholder_response,
)

router = APIRouter(prefix="/documents", tags=["inkwise-documents"])


@router.get("", response_model=InkwisePlaceholderListResponse)
async def list_documents(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderListResponse:
    return build_placeholder_list_response(
        area="documents",
        action="list",
        message="Inkwise document listing scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )


@router.post("", response_model=InkwisePlaceholderResponse)
async def create_document(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="documents",
        action="create",
        message="Inkwise document creation scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )


@router.get("/{document_id}", response_model=InkwisePlaceholderResponse)
async def get_document(document_id: str, user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="documents",
        action="detail",
        message=f"Inkwise document detail scaffold is registered for document {document_id}.",
        user_id=user_id,
    )


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
