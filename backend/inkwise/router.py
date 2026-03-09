from fastapi import APIRouter, Depends

from dependencies.auth import get_current_user_id
from inkwise.routes import chat, documents, ingestion, internal_tasks, sources, templates, writing_tools
from inkwise.schemas import InkwisePlaceholderResponse, build_placeholder_response

router = APIRouter()


@router.get("", response_model=InkwisePlaceholderResponse, tags=["inkwise"])
async def inkwise_root(user_id: str = Depends(get_current_user_id)) -> InkwisePlaceholderResponse:
    return build_placeholder_response(
        area="module",
        action="root",
        message="Inkwise backend scaffold is mounted inside CPAAutomation and awaiting implementation.",
        user_id=user_id,
    )


router.include_router(documents.router)
router.include_router(sources.router)
router.include_router(ingestion.router)
router.include_router(internal_tasks.router)
router.include_router(chat.router)
router.include_router(templates.router)
router.include_router(writing_tools.router)
