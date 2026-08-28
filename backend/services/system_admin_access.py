"""Platform-wide system-administrator authorization policy."""

from fastapi import HTTPException

from models.db_models import User


def ensure_system_admin(user: User | None) -> User:
    """Return a current platform admin or raise the shared policy response."""
    if user is None or not bool(user.is_system_admin):
        raise HTTPException(status_code=403, detail="System administrator access required")
    return user
