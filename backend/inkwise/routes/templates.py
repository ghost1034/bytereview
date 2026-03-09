from fastapi import APIRouter, Depends

from dependencies.auth import get_current_user_id
from inkwise.schemas import (
    InkwisePlaceholderListResponse,
    InkwisePlaceholderResponse,
    build_placeholder_list_response,
    build_placeholder_response,
)

router = APIRouter(tags=["inkwise-templates"])


@router.get("/templates", response_model=InkwisePlaceholderListResponse)
async def list_templates(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderListResponse:
    return build_placeholder_list_response(
        area="templates",
        action="list",
        message="Inkwise template listing scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )


@router.post("/templates", response_model=InkwisePlaceholderResponse)
async def create_template(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="templates",
        action="create",
        message="Inkwise template creation scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )


@router.get("/system-template-categories", response_model=InkwisePlaceholderListResponse)
async def list_system_template_categories(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderListResponse:
    return build_placeholder_list_response(
        area="templates",
        action="list_system_categories",
        message="Inkwise system template category scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )


@router.get("/system-templates", response_model=InkwisePlaceholderListResponse)
async def list_system_templates(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderListResponse:
    return build_placeholder_list_response(
        area="templates",
        action="list_system_templates",
        message="Inkwise system template listing scaffold is registered and awaiting implementation.",
        user_id=user_id,
    )
