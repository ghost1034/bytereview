"""Routes for firm/team management within CPA Analytics."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.analytics_rbac import READER_ROLES, require_role
from models.analytics import (
    FirmDetailResponse,
    FirmInviteRequest,
    FirmMemberResponse,
    FirmResponse,
    FirmUpdateRequest,
    MemberUpdateRequest,
)
from models.db_models import AnalyticsUserRole, User
from services.analytics import firms_service
from services.analytics.firm_scope import get_or_create_user_firm

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/firm", tags=["analytics-firm"])


def _firm_to_response(firm) -> FirmResponse:
    return FirmResponse(
        id=str(firm.id),
        name=firm.name,
        created_at=firm.created_at,
        updated_at=firm.updated_at,
    )


def _member_to_response(user) -> FirmMemberResponse:
    role_value = user.role.value if hasattr(user.role, "value") else (user.role or "analyst")
    persona_value = (
        user.persona.value if hasattr(user.persona, "value") and user.persona else None
    )
    return FirmMemberResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        photo_url=user.photo_url,
        role=role_value,
        persona=persona_value,
        title=user.title,
        created_at=user.created_at,
    )


@router.get("", response_model=FirmDetailResponse)
async def get_firm(
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    _, firm = get_or_create_user_firm(db, actor.id)
    members = firms_service.list_members(db, firm.id)
    return FirmDetailResponse(
        firm=_firm_to_response(firm),
        members=[_member_to_response(m) for m in members],
    )


@router.put("", response_model=FirmResponse)
async def update_firm(
    payload: FirmUpdateRequest,
    actor: User = Depends(require_role(AnalyticsUserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    _, firm = get_or_create_user_firm(db, actor.id)
    firm = firms_service.update_firm_name(db, firm.id, payload.name)
    return _firm_to_response(firm)


@router.post("/invite", response_model=FirmMemberResponse | None)
async def invite_member(
    payload: FirmInviteRequest,
    actor: User = Depends(require_role(AnalyticsUserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    _, firm = get_or_create_user_firm(db, actor.id)
    user = firms_service.invite_member_by_email(db, firm.id, payload.email)
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="No CPAAutomation user found with that email. Ask them to sign up first.",
        )
    return _member_to_response(user)


@router.put("/members/{member_user_id}", response_model=FirmMemberResponse)
async def update_member(
    member_user_id: str,
    payload: MemberUpdateRequest,
    actor: User = Depends(require_role(AnalyticsUserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    _, firm = get_or_create_user_firm(db, actor.id)
    fields = payload.model_dump(exclude_unset=True)
    user = firms_service.update_member(
        db,
        firm.id,
        member_user_id,
        role=fields.get("role"),
        persona=fields.get("persona"),
        title=fields.get("title"),
        set_role="role" in fields,
        set_persona="persona" in fields,
        set_title="title" in fields,
    )
    return _member_to_response(user)


@router.delete("/members/{member_user_id}")
async def remove_member(
    member_user_id: str,
    actor: User = Depends(require_role(AnalyticsUserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    _, firm = get_or_create_user_firm(db, actor.id)
    firms_service.remove_member(db, firm.id, member_user_id)
    return {"success": True}
