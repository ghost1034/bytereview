"""Self-service account endpoints: API keys, watchlist, notifications.

Every object access is scoped to the signed-in user (`WHERE user_id = :me`); foreign ids return 404 rather
than 403 so the endpoint does not confirm that another user's object exists. These endpoints accept only an
interactive session token (`require_jwt_user`), never an API key, so a leaked key cannot mint more keys.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from taxatlas.api.deps import require_jwt_user
from taxatlas.api.v1._util import resolve_jurisdiction
from taxatlas.core.config import get_settings
from taxatlas.core.db import get_db
from taxatlas.core.security import generate_api_key
from taxatlas.models import ApiKey, ChangeEvent, Notification, TaxType, User, UserRole, WatchItem
from taxatlas.schemas.common import Message
from taxatlas.schemas.user import (
    ApiKeyCreated,
    ApiKeyCreateIn,
    ApiKeyOut,
    NotificationOut,
    WatchItemIn,
    WatchItemOut,
)
from taxatlas.services.changes import change_event_out

router = APIRouter(prefix="/account", tags=["account"])
settings = get_settings()

MAX_ACTIVE_KEYS = 10


def max_scopes_for(user: User) -> set[str]:
    """The widest scope set a user may grant to one of their API keys."""
    return {"read", "admin"} if bool(user.is_system_admin) else {"read"}


@router.get("/api-keys", response_model=list[ApiKeyOut])
def list_keys(user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    return list(db.scalars(select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc())))


@router.post("/api-keys", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_key(body: ApiKeyCreateIn, user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    """Create an API key. Scopes default to ['read']; 'admin' may be requested only by admin users."""
    active = db.scalar(
        select(func.count()).select_from(ApiKey).where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
    )
    if (active or 0) >= MAX_ACTIVE_KEYS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Maximum of {MAX_ACTIVE_KEYS} active API keys")
    requested = set(body.scopes or ["read"])
    allowed = max_scopes_for(user)
    if not requested <= allowed:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"Scope(s) not permitted for your role: {', '.join(sorted(requested - allowed))}"
        )
    scopes = [s for s in ("read", "admin") if s in requested]
    key, prefix, key_hash = generate_api_key()
    row = ApiKey(
        user_id=user.id,
        name=body.name,
        prefix=prefix,
        key_hash=key_hash,
        scopes=scopes,
        rate_limit_per_minute=settings.rate_limit_default,
    )
    db.add(row)
    db.commit()
    out = ApiKeyOut.model_validate(row).model_dump()
    return ApiKeyCreated(**out, key=key)


@router.delete("/api-keys/{key_id}", response_model=Message)
def revoke_key(key_id: int, user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    row = db.scalar(select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user.id))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found")
    if row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        db.commit()
    return Message(detail="revoked")


def _watch_out(w: WatchItem) -> WatchItemOut:
    out = WatchItemOut.model_validate(w)
    if w.jurisdiction:
        out.jurisdiction_code = w.jurisdiction.code
        out.jurisdiction_name = w.jurisdiction.name
    return out


@router.get("/watchlist", response_model=list[WatchItemOut])
def list_watch(user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    stmt = select(WatchItem).options(selectinload(WatchItem.jurisdiction)).where(WatchItem.user_id == user.id)
    return [_watch_out(w) for w in db.scalars(stmt)]


@router.post("/watchlist", response_model=WatchItemOut, status_code=status.HTTP_201_CREATED)
def add_watch(body: WatchItemIn, user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    jid = resolve_jurisdiction(db, body.jurisdiction_code).id if body.jurisdiction_code else None
    if body.tax_type and body.tax_type not in set(TaxType):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown tax_type '{body.tax_type}'")
    existing = db.scalar(
        select(WatchItem).where(
            WatchItem.user_id == user.id, WatchItem.jurisdiction_id == jid, WatchItem.tax_type == body.tax_type
        )
    )
    if existing:
        if existing.include_children != body.include_children:
            existing.include_children = body.include_children  # re-adding is an upsert of the scope preference
            db.commit()
            db.refresh(existing)
        return _watch_out(existing)
    w = WatchItem(user_id=user.id, jurisdiction_id=jid, tax_type=body.tax_type, include_children=body.include_children)
    db.add(w)
    db.commit()
    db.refresh(w)
    return _watch_out(w)


@router.delete("/watchlist/{item_id}", response_model=Message)
def remove_watch(item_id: int, user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    w = db.scalar(select(WatchItem).where(WatchItem.id == item_id, WatchItem.user_id == user.id))
    if not w:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Watch item not found")
    db.delete(w)
    db.commit()
    return Message(detail="removed")


@router.get("/notifications", response_model=list[NotificationOut])
def notifications(
    unread_only: bool = False,
    limit: int = Query(200, ge=1, le=500),
    user: User = Depends(require_jwt_user),
    db: Session = Depends(get_db),
):
    q = (
        select(Notification)
        .options(selectinload(Notification.change_event).selectinload(ChangeEvent.jurisdiction))
        .where(Notification.user_id == user.id)
    )
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    admin = bool(user.is_system_admin)
    return [
        NotificationOut(
            id=n.id,
            change_event=change_event_out(n.change_event, admin=admin),
            created_at=n.created_at,
            read_at=n.read_at,
        )
        for n in db.scalars(q.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit))
    ]


@router.post("/notifications/read-all", response_model=Message)
def read_all(user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    for n in db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))):
        n.read_at = now
    db.commit()
    return Message(detail="ok")


@router.post("/notifications/{notification_id}/read", response_model=Message)
def read_one(notification_id: int, user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    n = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    if n.read_at is None:
        n.read_at = datetime.now(UTC)
        db.commit()
    return Message(detail="ok")
