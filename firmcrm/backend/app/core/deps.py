from __future__ import annotations

from collections.abc import Callable
from datetime import UTC

import jwt
from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import Forbidden
from app.core.security import decode_token
from app.models import RefreshToken, User, utcnow

ROLE_RANK = {"staff": 1, "marketing": 1, "manager": 2, "partner": 3, "admin": 4}


PASSWORD_CHANGE_ALLOWLIST = {"/api/auth/me", "/api/auth/change-password", "/api/auth/logout", "/api/auth/logout-all"}


def get_current_user(request: Request, authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Forbidden("Not authenticated", code="unauthenticated", status_code=401)
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise Forbidden("Access token expired", code="token_expired", status_code=401)
    except jwt.PyJWTError:
        raise Forbidden("Invalid token", code="unauthenticated", status_code=401)
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise Forbidden("User inactive", code="unauthenticated", status_code=401)
    # Reject access tokens minted before the most recent password change.
    if user.password_changed_at:
        issued_pwc = int(payload.get("pwc") or 0)
        if issued_pwc < int(user.password_changed_at.replace(tzinfo=UTC).timestamp()):
            raise Forbidden("Session invalidated by password change", code="token_expired", status_code=401)
    # Session binding: the token's refresh-token family must still have a live (unrevoked, unexpired) token.
    sid = payload.get("sid")
    if sid:
        live = db.scalar(select(RefreshToken.id).where(RefreshToken.family_id == sid, RefreshToken.revoked_at.is_(None),
                                                        RefreshToken.expires_at > utcnow()).limit(1))
        if live is None:
            raise Forbidden("Session has been signed out", code="token_expired", status_code=401)
    if user.must_change_password and request.url.path not in PASSWORD_CHANGE_ALLOWLIST:
        raise Forbidden("Password change required before continuing", code="password_change_required", status_code=403)
    request.state.user_id = user.id
    return user


def require_role(*roles: str) -> Callable:
    def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise Forbidden(f"Requires role: {', '.join(roles)}")
        return user

    return _guard


def at_least(role: str) -> Callable:
    def _guard(user: User = Depends(get_current_user)) -> User:
        if ROLE_RANK.get(user.role, 0) < ROLE_RANK[role]:
            raise Forbidden(f"Requires at least {role}")
        return user

    return _guard
