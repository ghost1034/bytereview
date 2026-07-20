"""Firm CRUD + membership operations."""

from __future__ import annotations

import logging
import secrets
import string
import uuid
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import (
    AnalyticsUserPersona, AnalyticsUserRole, EsignAdminEvent, EsignBulkJob,
    EsignEnvelope, EsignEnvelopeGrant, EsignPermissionAssignment, EsignPowerForm,
    EsignTemplate, Firm, FirmInviteCode, User,
)
from services.analytics.firm_scope import get_user_firm

logger = logging.getLogger(__name__)

_INVITE_ALPHABET = string.ascii_uppercase + string.digits


def _generate_invite_code_value() -> str:
    return "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(6))


def get_current_firm(db: Session, user_id: str) -> Firm:
    _, firm = get_user_firm(db, user_id)
    return firm


def get_invite_code(db: Session, firm_id) -> Optional[str]:
    row = db.query(FirmInviteCode).filter(FirmInviteCode.firm_id == firm_id).first()
    return row.code if row else None


def generate_invite_code(db: Session, firm_id) -> str:
    """Create or replace the single invitation code for a firm."""
    db.query(FirmInviteCode).filter(FirmInviteCode.firm_id == firm_id).delete(
        synchronize_session=False
    )

    for _ in range(10):
        code = _generate_invite_code_value()
        existing = db.query(FirmInviteCode).filter(FirmInviteCode.code == code).first()
        if existing is None:
            db.add(FirmInviteCode(code=code, firm_id=firm_id))
            db.commit()
            return code

    raise HTTPException(status_code=500, detail="Failed to generate a unique invitation code")


def create_firm_for_user(db: Session, user: User, name: str) -> Tuple[Firm, str]:
    """Create a firm, assign the user as admin, and issue an invitation code."""
    if user.firm_id is not None:
        raise HTTPException(status_code=409, detail="Already belongs to a firm")

    trimmed = (name or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Firm name is required")

    firm = Firm(id=uuid.uuid4(), name=trimmed)
    db.add(firm)
    db.flush()

    user.firm_id = firm.id
    user.role = AnalyticsUserRole.ADMIN
    db.flush()

    code = generate_invite_code(db, firm.id)
    db.refresh(firm)
    db.refresh(user)
    return firm, code


def join_firm_by_code(db: Session, user: User, raw_code: str) -> Firm:
    """Attach a user without a firm to the firm identified by an invitation code."""
    if user.firm_id is not None:
        raise HTTPException(status_code=409, detail="Already belongs to a firm")

    code = (raw_code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Invitation code is required")

    invite = db.query(FirmInviteCode).filter(FirmInviteCode.code == code).first()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invalid invitation code")

    firm = db.query(Firm).filter(Firm.id == invite.firm_id).first()
    if firm is None:
        raise HTTPException(status_code=404, detail="Invalid invitation code")

    user.firm_id = firm.id
    if user.role is None:
        user.role = AnalyticsUserRole.ANALYST
    db.commit()
    db.refresh(user)
    db.refresh(firm)
    return firm


def list_members(db: Session, firm_id) -> List[User]:
    return (
        db.query(User)
        .filter(User.firm_id == firm_id)
        .order_by(User.created_at.asc())
        .all()
    )


def ensure_firm_has_admin(db: Session, firm_id) -> None:
    """Promote the founding member when a firm has no admin yet."""
    admin_count = (
        db.query(User)
        .filter(User.firm_id == firm_id, User.role == AnalyticsUserRole.ADMIN)
        .count()
    )
    if admin_count > 0:
        return

    members = list_members(db, firm_id)
    if len(members) == 1:
        members[0].role = AnalyticsUserRole.ADMIN
        db.commit()


def update_firm_name(db: Session, firm_id, name: str) -> Firm:
    firm = db.query(Firm).filter(Firm.id == firm_id).first()
    if firm is None:
        raise HTTPException(status_code=404, detail="Firm not found")
    firm.name = name
    db.commit()
    db.refresh(firm)
    return firm


def invite_member_by_email(db: Session, firm_id, email: str) -> Optional[User]:
    """Attach an existing user to this firm by email.

    Returns the User if found and attached, None otherwise. This is the v1
    minimum: a real invite-with-email flow can wrap this later.
    """
    normalized = (email or "").strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="Email is required")

    user = db.query(User).filter(User.email == normalized).first()
    if user is None:
        return None

    if user.firm_id and user.firm_id != firm_id:
        raise HTTPException(
            status_code=409,
            detail="User already belongs to another firm",
        )

    user.firm_id = firm_id
    # Invited users default to analyst unless an admin updates them later.
    if user.role is None:
        user.role = AnalyticsUserRole.ANALYST
    db.commit()
    db.refresh(user)
    return user


def remove_member(db: Session, firm_id, user_id: str, *, successor_user_id: str | None = None,
                  actor_user_id: str | None = None) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.firm_id != firm_id:
        raise HTTPException(status_code=403, detail="User is not in this firm")
    if _is_last_admin(db, firm_id, user):
        raise HTTPException(
            status_code=400,
            detail="Cannot remove the last admin of this firm",
        )
    owned = {
        "envelopes": db.query(EsignEnvelope).filter(EsignEnvelope.firm_id == firm_id, EsignEnvelope.user_id == user.id).count(),
        "templates": db.query(EsignTemplate).filter(EsignTemplate.firm_id == firm_id, EsignTemplate.user_id == user.id).count(),
        "bulk_jobs": db.query(EsignBulkJob).filter(EsignBulkJob.firm_id == firm_id, EsignBulkJob.user_id == user.id).count(),
        "powerforms": db.query(EsignPowerForm).filter(EsignPowerForm.firm_id == firm_id, EsignPowerForm.user_id == user.id).count(),
    }
    successor = None
    if any(owned.values()):
        if not successor_user_id:
            raise HTTPException(status_code=409, detail="A same-firm E-Signature custody successor is required")
        successor = db.query(User).filter(User.id == successor_user_id, User.firm_id == firm_id).first()
        if successor is None or successor.id == user.id:
            raise HTTPException(status_code=400, detail="Custody successor must be another member of this firm")
        for model in (EsignEnvelope, EsignTemplate, EsignBulkJob, EsignPowerForm):
            db.query(model).filter(model.firm_id == firm_id, model.user_id == user.id).update(
                {model.user_id: successor.id}, synchronize_session=False
            )
    db.query(EsignEnvelopeGrant).filter(EsignEnvelopeGrant.user_id == user.id).delete(synchronize_session=False)
    db.query(EsignPermissionAssignment).filter(EsignPermissionAssignment.user_id == user.id).delete(synchronize_session=False)
    user.firm_id = None
    db.add(EsignAdminEvent(id=uuid.uuid4(), firm_id=firm_id, actor_user_id=actor_user_id,
                           event_type="user.offboarded", target_type="user", target_id=user.id,
                           details={"successor_user_id": successor.id if successor else None, "transferred": owned}))
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def update_member(
    db: Session,
    firm_id,
    target_user_id: str,
    *,
    role: Optional[str],
    persona: Optional[str],
    title: Optional[str],
    set_role: bool,
    set_persona: bool,
    set_title: bool,
) -> User:
    user = db.query(User).filter(User.id == target_user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.firm_id != firm_id:
        raise HTTPException(status_code=403, detail="User is not in this firm")

    if set_role:
        if role is None:
            raise HTTPException(status_code=400, detail="role is required")
        new_role = AnalyticsUserRole(role)
        if new_role is not AnalyticsUserRole.ADMIN and _is_last_admin(db, firm_id, user):
            raise HTTPException(
                status_code=400,
                detail="Cannot demote the last admin of this firm",
            )
        user.role = new_role

    if set_persona:
        user.persona = AnalyticsUserPersona(persona) if persona else None

    if set_title:
        user.title = title

    db.commit()
    db.refresh(user)
    return user


def _is_last_admin(db: Session, firm_id, user: User) -> bool:
    if user.role != AnalyticsUserRole.ADMIN:
        return False
    admin_count = (
        db.query(User)
        .filter(User.firm_id == firm_id, User.role == AnalyticsUserRole.ADMIN)
        .count()
    )
    return admin_count <= 1
