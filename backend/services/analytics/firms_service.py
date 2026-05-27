"""Firm CRUD + membership operations."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import AnalyticsUserPersona, AnalyticsUserRole, Firm, User
from services.analytics.firm_scope import get_or_create_user_firm

logger = logging.getLogger(__name__)


def get_current_firm(db: Session, user_id: str) -> Firm:
    _, firm = get_or_create_user_firm(db, user_id)
    return firm


def list_members(db: Session, firm_id) -> List[User]:
    return (
        db.query(User)
        .filter(User.firm_id == firm_id)
        .order_by(User.created_at.asc())
        .all()
    )


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


def remove_member(db: Session, firm_id, user_id: str) -> None:
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
    user.firm_id = None
    db.commit()


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
