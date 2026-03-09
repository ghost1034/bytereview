from fastapi import APIRouter, Depends

from dependencies.auth import get_current_user_id
from inkwise.schemas import InkwisePlaceholderListResponse, build_placeholder_list_response

router = APIRouter(prefix="/source-ingestions", tags=["inkwise-ingestion"])


@router.get("", response_model=InkwisePlaceholderListResponse)
async def list_source_ingestions(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderListResponse:
    return build_placeholder_list_response(
        area="ingestion",
        action="list",
        message="Inkwise ingestion tracking scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )
