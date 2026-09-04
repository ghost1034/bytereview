"""Authentication flows: login with lockout, rotating refresh tokens with reuse detection, logout, password change.

Every security-relevant event is written to the audit log (actor may be None for failed logins).
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.config import get_settings
from app.core.errors import DomainError, Forbidden
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    new_refresh_token,
    validate_password_policy,
    verify_password,
)
from app.models import RefreshToken, User, utcnow


class TokenPair:
    def __init__(self, access: str, refresh: str, expires_in: int):
        self.access_token, self.refresh_token, self.expires_in = access, refresh, expires_in


def issue(db: Session, user: User, *, family_id: str | None = None, ip: str | None, user_agent: str | None) -> TokenPair:
    s = get_settings()
    raw = new_refresh_token()
    rt = RefreshToken(user_id=user.id, token_hash=hash_token(raw), family_id=family_id or uuid.uuid4().hex,
                      expires_at=utcnow() + timedelta(days=s.refresh_token_days), ip=ip, user_agent=(user_agent or "")[:255])
    db.add(rt)
    access = create_access_token(user.id, user.role, pw_changed_at=user.password_changed_at, session_id=rt.family_id)
    return TokenPair(access, raw, s.access_token_minutes * 60)


def login(db: Session, email: str, password: str, *, ip: str | None, user_agent: str | None) -> tuple[User, TokenPair]:
    s = get_settings()
    user = db.scalars(select(User).where(User.email == email.lower().strip())).first()
    generic = Forbidden("Invalid email or password", code="invalid_credentials", status_code=401)
    if not user or not user.is_active:
        record(db, actor_id=None, action="auth.login_failed", entity_type="user", entity_id=None, note=f"unknown/inactive {email[:80]} ip={ip}")
        db.commit()
        raise generic
    if user.locked_until and user.locked_until > utcnow():
        record(db, actor_id=None, action="auth.login_locked", entity_type="user", entity_id=user.id, note=f"ip={ip}")
        db.commit()
        raise Forbidden("Account temporarily locked due to repeated failed logins. Try again later.", code="locked", status_code=423)
    if not verify_password(password, user.password_hash):
        user.failed_login_count = (user.failed_login_count or 0) + 1
        note = f"ip={ip} failures={user.failed_login_count}"
        if user.failed_login_count >= s.login_max_failures:
            user.locked_until = utcnow() + timedelta(minutes=s.lockout_minutes)
            user.failed_login_count = 0
            record(db, actor_id=None, action="auth.locked", entity_type="user", entity_id=user.id, note=note)
        else:
            record(db, actor_id=None, action="auth.login_failed", entity_type="user", entity_id=user.id, note=note)
        db.commit()
        raise generic
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = utcnow()
    pair = issue(db, user, ip=ip, user_agent=user_agent)
    record(db, actor_id=user.id, action="auth.login", entity_type="user", entity_id=user.id, note=f"ip={ip}")
    db.commit()
    return user, pair


def refresh(db: Session, raw_token: str, *, ip: str | None, user_agent: str | None) -> tuple[User, TokenPair]:
    rt = db.scalars(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token))).first()
    invalid = Forbidden("Invalid refresh token", code="invalid_refresh", status_code=401)
    if not rt:
        raise invalid
    if rt.revoked_at is not None:
        # Reuse of a rotated token => the chain is compromised; revoke the whole family.
        for t in db.scalars(select(RefreshToken).where(RefreshToken.family_id == rt.family_id, RefreshToken.revoked_at.is_(None))).all():
            t.revoked_at = utcnow()
        record(db, actor_id=rt.user_id, action="auth.refresh_reuse_detected", entity_type="user", entity_id=rt.user_id, note=f"family={rt.family_id} ip={ip}")
        db.commit()
        raise invalid
    if rt.expires_at < utcnow():
        raise Forbidden("Refresh token expired", code="refresh_expired", status_code=401)
    user = db.get(User, rt.user_id)
    if not user or not user.is_active:
        raise invalid
    rt.revoked_at = utcnow()
    pair = issue(db, user, family_id=rt.family_id, ip=ip, user_agent=user_agent)
    db.commit()
    return user, pair


def logout(db: Session, raw_token: str | None, actor: User | None) -> None:
    if raw_token:
        rt = db.scalars(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token))).first()
        if rt and rt.revoked_at is None:
            rt.revoked_at = utcnow()
            record(db, actor_id=actor.id if actor else rt.user_id, action="auth.logout", entity_type="user", entity_id=rt.user_id)
    db.commit()


def revoke_all_sessions(db: Session, user: User) -> int:
    rows = db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))).all()
    for t in rows:
        t.revoked_at = utcnow()
    return len(rows)


def logout_all(db: Session, user: User, actor: User) -> int:
    n = revoke_all_sessions(db, user)
    record(db, actor_id=actor.id, action="auth.logout_all", entity_type="user", entity_id=user.id, note=f"sessions={n}")
    db.commit()
    return n


def change_password(db: Session, user: User, current: str, new: str) -> None:
    if not verify_password(current, user.password_hash):
        raise DomainError("Current password is incorrect", code="invalid_current_password", status_code=400)
    validate_password_policy(new, email=user.email)
    if verify_password(new, user.password_hash):
        raise DomainError("New password must differ from the current password", code="weak_password")
    user.password_hash = hash_password(new)
    user.password_changed_at = utcnow()
    user.must_change_password = False
    revoke_all_sessions(db, user)  # caller re-issues tokens for this session
    record(db, actor_id=user.id, action="auth.password_changed", entity_type="user", entity_id=user.id)


def admin_set_password(db: Session, target: User, new: str, actor: User) -> None:
    validate_password_policy(new, email=target.email)
    target.password_hash = hash_password(new)
    target.password_changed_at = utcnow()
    target.must_change_password = True
    revoke_all_sessions(db, target)
    record(db, actor_id=actor.id, action="auth.password_reset_by_admin", entity_type="user", entity_id=target.id)


def client_ip(request) -> str | None:
    s = get_settings()
    if s.trust_proxy_headers:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()[:64]
    return request.client.host if request.client else None
