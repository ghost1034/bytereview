"""Role-based access control for CPA Analytics routes.

The permission matrix lives here. Every analytics router applies one of these
`require_role(...)` dependencies; the route's body assumes the role check has
already passed and proceeds with firm-scoped queries.

Role matrix (Phase 5.1):
  Admin     full access; only role permitted to mutate firm members or firm name
  Manager   read/write analytics resources; cannot manage firm
  Analyst   read/write analytics resources; cannot manage firm
  Reviewer  read everything; can stream LLM endpoints; cannot create/edit/delete
  Viewer    read-only across analytics; cannot run LLM endpoints

The role lives on `users.role` (added in migration 028). The Firebase token
identifies the user; this module loads the User row, validates the role, and
returns the row for the route to consume.
"""

from __future__ import annotations

from typing import Callable

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import get_current_user_id
from models.db_models import AnalyticsUserRole, User
from services.analytics.firm_scope import get_or_create_user_firm


# Convenience sets used by routers.
WRITER_ROLES = (
    AnalyticsUserRole.ADMIN,
    AnalyticsUserRole.MANAGER,
    AnalyticsUserRole.ANALYST,
)
LLM_ROLES = (
    AnalyticsUserRole.ADMIN,
    AnalyticsUserRole.MANAGER,
    AnalyticsUserRole.ANALYST,
    AnalyticsUserRole.REVIEWER,
)
READER_ROLES = (
    AnalyticsUserRole.ADMIN,
    AnalyticsUserRole.MANAGER,
    AnalyticsUserRole.ANALYST,
    AnalyticsUserRole.REVIEWER,
    AnalyticsUserRole.VIEWER,
)
APPROVER_ROLES = (
    AnalyticsUserRole.ADMIN,
    AnalyticsUserRole.MANAGER,
    AnalyticsUserRole.REVIEWER,
)


def _coerce_role(value) -> AnalyticsUserRole | None:
    if value is None:
        return None
    if isinstance(value, AnalyticsUserRole):
        return value
    try:
        return AnalyticsUserRole(value)
    except ValueError:
        return None


def require_role(*allowed: AnalyticsUserRole) -> Callable[..., User]:
    """FastAPI dependency factory that gates routes by analytics role.

    Resolves the user's firm (auto-creating a personal one on first use so the
    `firm_id` is always set after this dependency returns) and rejects with
    HTTP 403 if their role is not in `allowed`.
    """

    allowed_set = set(allowed)

    async def _dep(
        user_id: str = Depends(get_current_user_id),
        db: Session = Depends(get_db),
    ) -> User:
        user, _firm = get_or_create_user_firm(db, user_id)
        role = _coerce_role(user.role)
        if role is None or role not in allowed_set:
            raise HTTPException(
                status_code=403,
                detail="Insufficient role for this action",
            )
        return user

    return _dep


__all__ = [
    "APPROVER_ROLES",
    "LLM_ROLES",
    "READER_ROLES",
    "WRITER_ROLES",
    "require_role",
]
