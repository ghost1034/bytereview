from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import DomainError, NotFound
from app.models import RefreshToken, User, utcnow
from app.schemas import LoginIn, TokenOut, UserOut
from app.services import auth as svc
from app.services.ratelimit import build_limiter

router = APIRouter(prefix="/auth", tags=["auth"])
_limiter = build_limiter(get_settings().login_rate_limit_per_minute, 60, get_settings().redis_url)


def _guard_rate(request: Request) -> str | None:
    ip = svc.client_ip(request)
    if not _limiter.allow(ip or "unknown"):
        raise DomainError("Too many attempts; try again in a minute", code="rate_limited", status_code=429)
    return ip


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=200)


class LogoutIn(BaseModel):
    refresh_token: str | None = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=256)


class SessionOut(BaseModel):
    id: int
    created_at: str
    expires_at: str
    ip: str | None
    user_agent: str | None


def _token_out(user: User, pair: svc.TokenPair) -> TokenOut:
    return TokenOut(access_token=pair.access_token, refresh_token=pair.refresh_token, expires_in=pair.expires_in,
                    user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = _guard_rate(request)
    user, pair = svc.login(db, body.email, body.password, ip=ip, user_agent=request.headers.get("user-agent"))
    return _token_out(user, pair)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, request: Request, db: Session = Depends(get_db)):
    ip = _guard_rate(request)
    user, pair = svc.refresh(db, body.refresh_token, ip=ip, user_agent=request.headers.get("user-agent"))
    return _token_out(user, pair)


@router.post("/logout", status_code=204)
def logout(body: LogoutIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    svc.logout(db, body.refresh_token, user)


@router.post("/logout-all")
def logout_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"revoked": svc.logout_all(db, user, user)}


@router.post("/change-password", response_model=TokenOut)
def change_password(body: ChangePasswordIn, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    svc.change_password(db, user, body.current_password, body.new_password)
    pair = svc.issue(db, user, ip=svc.client_ip(request), user_agent=request.headers.get("user-agent"))
    db.commit()
    return _token_out(user, pair)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/sessions", response_model=list[SessionOut])
def sessions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None),
                                                 RefreshToken.expires_at > utcnow()).order_by(RefreshToken.created_at.desc())).all()
    return [SessionOut(id=r.id, created_at=r.created_at.isoformat(), expires_at=r.expires_at.isoformat(), ip=r.ip, user_agent=r.user_agent) for r in rows]


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rt = db.get(RefreshToken, session_id)
    if not rt or rt.user_id != user.id:
        raise NotFound("Session not found")
    rt.revoked_at = utcnow()
    record(db, actor_id=user.id, action="auth.session_revoked", entity_type="user", entity_id=user.id, note=f"session={session_id}")
    db.commit()
