from fastapi import APIRouter, Depends

from dependencies.auth import get_current_user_id
from inkwise.schemas import InkwisePlaceholderResponse, build_placeholder_response

router = APIRouter(tags=["inkwise-writing-tools"])


@router.post("/writing-tools:stream", response_model=InkwisePlaceholderResponse)
async def stream_writing_tool_output(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="writing_tools",
        action="stream",
        message="Inkwise writing-tools scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )
