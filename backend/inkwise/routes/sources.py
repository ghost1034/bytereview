from fastapi import APIRouter, Depends

from dependencies.auth import get_current_user_id
from inkwise.schemas import (
    InkwisePlaceholderListResponse,
    InkwisePlaceholderResponse,
    build_placeholder_list_response,
    build_placeholder_response,
)

router = APIRouter(prefix="/sources", tags=["inkwise-sources"])


@router.get("", response_model=InkwisePlaceholderListResponse)
async def list_sources(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderListResponse:
    return build_placeholder_list_response(
        area="sources",
        action="list",
        message="Inkwise source library scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )


@router.post("", response_model=InkwisePlaceholderResponse)
async def create_source(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="sources",
        action="create",
        message="Inkwise source creation scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )


@router.post("/upload:init", response_model=InkwisePlaceholderResponse)
async def init_source_upload(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="sources",
        action="upload_init",
        message="Inkwise source upload-init scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )


@router.post("/{source_id}/upload:complete", response_model=InkwisePlaceholderResponse)
async def complete_source_upload(source_id: str, user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="sources",
        action="upload_complete",
        message=f"Inkwise upload-complete scaffold is registered for source {source_id}.",
        user_id=user_id,
    )


@router.get("/{source_id}/preview", response_model=InkwisePlaceholderResponse)
async def preview_source(source_id: str, user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="sources",
        action="preview",
        message=f"Inkwise source preview scaffold is registered for source {source_id}.",
        user_id=user_id,
    )


@router.post("/{source_id}/ingest", response_model=InkwisePlaceholderResponse)
async def enqueue_source_ingestion(source_id: str, user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="ingestion",
        action="enqueue",
        message=f"Inkwise source ingestion scaffold is registered for source {source_id}.",
        user_id=user_id,
    )
