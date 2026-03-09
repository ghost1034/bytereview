from fastapi import APIRouter, Depends

from dependencies.auth import get_current_user_id
from inkwise.schemas import (
    InkwisePlaceholderListResponse,
    InkwisePlaceholderResponse,
    build_placeholder_list_response,
    build_placeholder_response,
)

router = APIRouter(prefix="/chat", tags=["inkwise-chat"])


@router.get("/threads", response_model=InkwisePlaceholderListResponse)
async def list_threads(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderListResponse:
    return build_placeholder_list_response(
        area="chat",
        action="list_threads",
        message="Inkwise chat thread scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )


@router.post("/threads", response_model=InkwisePlaceholderResponse)
async def create_thread(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="chat",
        action="create_thread",
        message="Inkwise chat thread creation scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )


@router.post("/threads/{thread_id}/messages:stream", response_model=InkwisePlaceholderResponse)
async def stream_thread_message(thread_id: str, user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="chat",
        action="stream_message",
        message=f"Inkwise chat streaming scaffold is registered for thread {thread_id}.",
        user_id=user_id,
    )
