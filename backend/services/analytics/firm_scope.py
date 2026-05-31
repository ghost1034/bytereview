"""Firm-scoping helper used by every analytics route.

Users get a `firm_id` from firm onboarding (create or join with invitation code),
from admin flows, or from the legacy auto-create path the first time they use
analytics without a firm.
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import AnalyticsUserRole, Firm, User

logger = logging.getLogger(__name__)


def _personal_firm_name(user: User) -> str:
    if user.display_name:
        return f"{user.display_name}'s Firm"
    if user.email:
        local = user.email.split("@", 1)[0]
        return f"{local}'s Firm"
    return "Personal Firm"


def ensure_user_row(
    db: Session,
    *,
    user_id: str,
    email: str,
    display_name: Optional[str] = None,
    photo_url: Optional[str] = None,
) -> User:
    """Ensure a Firebase user has a PostgreSQL profile row."""
    normalized_email = (email or "").strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=400, detail="User email not found in token")

    user = db.query(User).filter(User.id == user_id).first()
    if user is not None:
        changed = False
        if display_name and not user.display_name:
            user.display_name = display_name
            changed = True
        if photo_url and not user.photo_url:
            user.photo_url = photo_url
            changed = True
        if changed:
            db.commit()
            db.refresh(user)
        return user

    user = User(
        id=user_id,
        email=normalized_email,
        display_name=display_name,
        photo_url=photo_url,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_firm(db: Session, user_id: str) -> Tuple[User, Firm]:
    """Resolve a user's firm. Raises if onboarding is still required."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User profile not found")

    if user.firm_id is None:
        raise HTTPException(status_code=403, detail="Firm onboarding required")

    firm = db.query(Firm).filter(Firm.id == user.firm_id).first()
    if firm is None:
        raise HTTPException(status_code=403, detail="Firm onboarding required")

    return user, firm


def get_or_create_user_firm(db: Session, user_id: str) -> Tuple[User, Firm]:
    """Resolve a user's firm, creating a personal firm on first analytics use."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User profile not found")

    if user.firm_id is not None:
        firm = db.query(Firm).filter(Firm.id == user.firm_id).first()
        if firm is not None:
            return user, firm
        logger.warning("User %s has stale firm_id %s; creating new firm", user_id, user.firm_id)

    firm = Firm(id=uuid.uuid4(), name=_personal_firm_name(user))
    db.add(firm)
    db.flush()
    user.firm_id = firm.id
    user.role = AnalyticsUserRole.ADMIN
    db.commit()
    db.refresh(firm)
    db.refresh(user)
    return user, firm


def require_firm_id(db: Session, user_id: str) -> uuid.UUID:
    """Convenience wrapper returning just the firm_id."""
    _, firm = get_or_create_user_firm(db, user_id)
    return firm.id
