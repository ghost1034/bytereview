"""Firm-scoping helper used by every analytics route.

Per the integration plan, every analytics row is scoped by `firm_id`. Users
get a `firm_id` either from invite/admin flows or from this helper, which
auto-creates a personal firm the first time a user touches analytics.
"""

from __future__ import annotations

import logging
import uuid
from typing import Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import Firm, User

logger = logging.getLogger(__name__)


def _personal_firm_name(user: User) -> str:
    if user.display_name:
        return f"{user.display_name}'s Firm"
    if user.email:
        local = user.email.split("@", 1)[0]
        return f"{local}'s Firm"
    return "Personal Firm"


def get_or_create_user_firm(db: Session, user_id: str) -> Tuple[User, Firm]:
    """Resolve a user's firm, creating a personal firm on first analytics use.

    Returns (user, firm). Raises HTTP 404 if the Firebase user has no row in
    `users` yet — callers should ensure the auth/user provisioning ran first.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User profile not found")

    if user.firm_id is not None:
        firm = db.query(Firm).filter(Firm.id == user.firm_id).first()
        if firm is not None:
            return user, firm
        # Stale firm_id — fall through to recreate
        logger.warning("User %s has stale firm_id %s; creating new firm", user_id, user.firm_id)

    firm = Firm(id=uuid.uuid4(), name=_personal_firm_name(user))
    db.add(firm)
    db.flush()
    user.firm_id = firm.id
    db.commit()
    db.refresh(firm)
    db.refresh(user)
    return user, firm


def require_firm_id(db: Session, user_id: str) -> uuid.UUID:
    """Convenience wrapper returning just the firm_id."""
    _, firm = get_or_create_user_firm(db, user_id)
    return firm.id
