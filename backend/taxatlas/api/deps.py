"""TaxAtlas principals backed by Firebase sessions or revocable API keys."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Depends, Header, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from dependencies.auth import verify_firebase_token
from models.db_models import User
from services.paid_product_access import require_paid_plan
from services.system_admin_access import ensure_system_admin
from taxatlas.core.config import get_settings
from taxatlas.core.db import get_db
from taxatlas.core.ratelimit import client_ip, limiter
from taxatlas.core.security import API_KEY_PREFIX, hash_api_key
from taxatlas.models import ApiKey

settings = get_settings()


@dataclass
class TaxAtlasPrincipal:
    user: User
    api_key: ApiKey | None
    via: str


Principal = TaxAtlasPrincipal


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def _apply_rate_limit(request: Request, response: Response, key: str, limit: int) -> None:
    verdict = limiter.check(key, limit)
    response.headers["X-RateLimit-Limit"] = str(verdict.limit)
    response.headers["X-RateLimit-Remaining"] = str(verdict.remaining)
    response.headers["X-RateLimit-Reset"] = str(verdict.reset_seconds)
    if not verdict.allowed:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(verdict.reset_seconds)},
        )


def request_ip(request: Request) -> str:
    return client_ip(request, trusted_proxy=False)


def rate_limit_anon(request: Request, response: Response) -> None:
    _apply_rate_limit(request, response, f"ip:{request_ip(request)}", settings.rate_limit_anon)


def _paid(db: Session, user_id: str) -> None:
    require_paid_plan(
        db,
        user_id,
        product_code="taxatlas",
        product_name="TaxAtlas",
    )


def _load_api_key(db: Session, raw_key: str) -> ApiKey:
    key = db.scalar(select(ApiKey).where(ApiKey.key_hash == hash_api_key(raw_key)))
    if not key or key.revoked_at is not None or key.user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or revoked API key")
    _paid(db, key.user_id)
    return key


async def get_principal_optional(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> TaxAtlasPrincipal | None:
    token = _bearer(authorization)
    raw_key = x_api_key or (token if token and token.startswith(API_KEY_PREFIX) else None)
    if raw_key:
        key = _load_api_key(db, raw_key)
        _apply_rate_limit(request, response, f"key:{key.id}", key.rate_limit_per_minute)
        key.last_used_at = datetime.now(UTC)
        key.request_count = (key.request_count or 0) + 1
        db.commit()
        request.state.principal_type = "taxatlas_api_key"
        return TaxAtlasPrincipal(user=key.user, api_key=key, via="api_key")

    if not token:
        return None
    token_data = await verify_firebase_token(
        HTTPAuthorizationCredentials(credentials=token, scheme="Bearer")
    )
    user = db.get(User, token_data["uid"])
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "CPAAutomation profile not found")
    _paid(db, user.id)
    _apply_rate_limit(request, response, f"user:{user.id}", settings.rate_limit_default)
    request.state.principal_type = "firebase"
    return TaxAtlasPrincipal(user=user, api_key=None, via="firebase")


def get_principal(principal: TaxAtlasPrincipal | None = Depends(get_principal_optional)) -> TaxAtlasPrincipal:
    if principal is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Authentication required. Send a Firebase bearer token or TaxAtlas API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return principal


def get_current_user(principal: TaxAtlasPrincipal = Depends(get_principal)) -> User:
    return principal.user


def principal_scopes(principal: TaxAtlasPrincipal) -> set[str]:
    role_max = {"read", "admin"} if bool(principal.user.is_system_admin) else {"read"}
    if principal.api_key is None:
        return role_max
    return role_max & set(principal.api_key.scopes or ["read"])


def require_admin(principal: TaxAtlasPrincipal = Depends(get_principal)) -> User:
    user = ensure_system_admin(principal.user)
    if "admin" not in principal_scopes(principal):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "API key lacks admin scope")
    return user


def require_jwt_user(principal: TaxAtlasPrincipal = Depends(get_principal)) -> User:
    if principal.via != "firebase":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This endpoint requires a Firebase session token")
    return principal.user
