"""Routes for firm/team management within CPA Analytics."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.analytics_rbac import READER_ROLES, require_role
from dependencies.auth import verify_firebase_token
from models.analytics import (
    AuditLogEntry,
    AuditLogsResponse,
    FirmCreateRequest,
    FirmDetailResponse,
    FirmExportResponse,
    FirmInviteCodeResponse,
    FirmInviteRequest,
    FirmJoinRequest,
    FirmMemberResponse,
    FirmOnboardingStatusResponse,
    FirmPurgeResponse,
    FirmResponse,
    FirmUpdateRequest,
    MemberUpdateRequest,
)
from models.db_models import AnalyticsUserRole, Firm, User
from services.analytics import firms_service
from services.analytics.audit_service import list_audit_logs, record_audit
from services.analytics.firm_export_service import build_firm_export
from services.analytics.firm_purge_service import purge_firm
from services.analytics.firm_scope import ensure_user_row, get_or_create_user_firm, get_user_firm

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


def _firm_detail(db: Session, firm) -> FirmDetailResponse:
    firms_service.ensure_firm_has_admin(db, firm.id)
    members = firms_service.list_members(db, firm.id)
    return FirmDetailResponse(
        firm=_firm_to_response(firm),
        members=[_member_to_response(m) for m in members],
        invite_code=firms_service.get_invite_code(db, firm.id),
    )


@router.get("/onboarding-status", response_model=FirmOnboardingStatusResponse)
async def get_onboarding_status(
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    email = token_data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="User email not found in token")

    user = ensure_user_row(
        db,
        user_id=token_data["uid"],
        email=email,
        display_name=token_data.get("name"),
        photo_url=token_data.get("picture"),
    )
    if user.firm_id is None:
        return FirmOnboardingStatusResponse(needs_onboarding=True)
    firm = db.query(Firm).filter(Firm.id == user.firm_id).first()
    if firm is None:
        return FirmOnboardingStatusResponse(needs_onboarding=True)
    return FirmOnboardingStatusResponse(
        needs_onboarding=False,
        firm=_firm_to_response(firm),
    )


@router.post("/create", response_model=FirmDetailResponse)
async def create_firm(
    payload: FirmCreateRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    email = token_data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="User email not found in token")

    user = ensure_user_row(
        db,
        user_id=token_data["uid"],
        email=email,
        display_name=token_data.get("name"),
        photo_url=token_data.get("picture"),
    )
    firm, _code = firms_service.create_firm_for_user(db, user, payload.name)
    return _firm_detail(db, firm)


@router.post("/join", response_model=FirmDetailResponse)
async def join_firm(
    payload: FirmJoinRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    email = token_data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="User email not found in token")

    user = ensure_user_row(
        db,
        user_id=token_data["uid"],
        email=email,
        display_name=token_data.get("name"),
        photo_url=token_data.get("picture"),
    )
    firm = firms_service.join_firm_by_code(db, user, payload.code)
    return _firm_detail(db, firm)


@router.get("", response_model=FirmDetailResponse)
async def get_firm(
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    _, firm = get_user_firm(db, actor.id)
    return _firm_detail(db, firm)


@router.put("", response_model=FirmResponse)
async def update_firm(
    payload: FirmUpdateRequest,
    actor: User = Depends(require_role(AnalyticsUserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    _, firm = get_or_create_user_firm(db, actor.id)
    firm = firms_service.update_firm_name(db, firm.id, payload.name)
    return _firm_to_response(firm)


@router.post("/invite-code", response_model=FirmInviteCodeResponse)
async def generate_invite_code(
    actor: User = Depends(require_role(AnalyticsUserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    _, firm = get_user_firm(db, actor.id)
    code = firms_service.generate_invite_code(db, firm.id)
    return FirmInviteCodeResponse(code=code)


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


@router.get("/audit-logs", response_model=AuditLogsResponse)
async def get_audit_logs(
    limit: int = 50,
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    _, firm = get_or_create_user_firm(db, actor.id)
    rows = list_audit_logs(db, firm.id, limit=limit)
    return AuditLogsResponse(entries=[AuditLogEntry(**row) for row in rows])


@router.post("/export", response_model=FirmExportResponse)
async def export_firm(
    actor: User = Depends(require_role(AnalyticsUserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    _, firm = get_or_create_user_firm(db, actor.id)
    payload = build_firm_export(db, firm)
    record_audit(
        db,
        firm_id=firm.id,
        user_id=actor.id,
        action="firm.exported",
        details={"member_count": len(payload["members"])},
    )
    return FirmExportResponse(**payload)


@router.delete("", response_model=FirmPurgeResponse)
async def delete_firm(
    actor: User = Depends(require_role(AnalyticsUserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    _, firm = get_or_create_user_firm(db, actor.id)
    # Best-effort: record the purge intent before we actually delete the
    # audit_logs table below. The row is destroyed along with the rest, but it
    # may survive in WAL backups for forensic review.
    record_audit(
        db,
        firm_id=firm.id,
        user_id=actor.id,
        action="firm.purged",
        details={"firm_name": firm.name},
    )
    purge_firm(db, firm.id)
    return FirmPurgeResponse(success=True)
