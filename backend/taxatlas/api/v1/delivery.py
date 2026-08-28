"""Notification delivery channels (webhook / email) for watchlist alerts.

All endpoints require a signed-in session (JWT), not an API key. Channels are strictly per-user:
another user's channel id returns 404.

API contract (prefix /api/taxatlas/v1/account/delivery)
    GET    /                 -> [DeliveryChannelOut]            list my channels (secret never returned)
    POST   /                 -> DeliveryChannelCreated (201)    body: DeliveryChannelIn
                                 webhook: returns `secret` ONCE; store it to verify X-TaxAtlas-Signature
                                 400 on invalid URL/email, SSRF-guarded URL, bad filters, or >10 channels
    PATCH  /{id}             -> DeliveryChannelOut              body: DeliveryChannelPatch
                                 (target, digest, enabled, filters; clear_filters=true removes filters;
                                  enabled=true also clears disabled_reason / consecutive_failures)
    DELETE /{id}             -> {"detail": "deleted"}
    POST   /{id}/rotate-secret -> DeliveryChannelCreated        webhook only: new HMAC secret, returned ONCE;
                                 for 24 h the old secret also signs X-TaxAtlas-Signature-V2-Previous
                                 (previous_secret_expires_at in the response) so receivers can switch over
    POST   /{id}/test        -> DeliveryTestResult              sends a signed `test` event synchronously
    GET    /{id}/attempts    -> [DeliveryAttemptOut]            last 50 attempts, newest first

DeliveryChannelIn  {kind: "webhook"|"email", target: str, digest: "instant"|"daily" = "instant",
                    enabled: bool = true, filters?: {tax_types?: [str], jurisdiction_codes?: [str], change_types?: [str]}}
DeliveryChannelOut {id, kind, target, enabled, digest, filters|null, has_secret, created_at, last_delivered_at,
                    last_error, consecutive_failures, disabled_reason}
DeliveryAttemptOut {id, channel_id, notification_id, attempt_no, status: pending|sent|failed|dead|skipped,
                    http_status, error, created_at, next_attempt_at}
DeliveryTestResult {ok, event_id, status_code, error, duration_ms}

Webhook payload + signature scheme: see app/services/notifications.py module docstring.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from taxatlas.api.deps import require_jwt_user
from taxatlas.core.db import get_db
from taxatlas.models import Jurisdiction, User
from taxatlas.models.delivery import DeliveryAttempt, DeliveryChannel, DeliveryKind
from taxatlas.schemas.common import Message
from taxatlas.schemas.delivery import (
    DeliveryAttemptOut,
    DeliveryChannelCreated,
    DeliveryChannelIn,
    DeliveryChannelOut,
    DeliveryChannelPatch,
    DeliveryFilters,
    DeliveryTestResult,
)
from taxatlas.services.notifications import (
    SECRET_ROTATION_GRACE,
    generate_secret,
    send_test_event,
    utcnow,
    validate_target_url,
)

router = APIRouter(prefix="/account/delivery", tags=["account"], dependencies=[Depends(require_jwt_user)])

MAX_CHANNELS_PER_USER = 10
_email_adapter = TypeAdapter(EmailStr)


def _out(ch: DeliveryChannel) -> DeliveryChannelOut:
    out = DeliveryChannelOut.model_validate(ch)
    out.has_secret = bool(ch.secret)
    return out


def _get_owned(db: Session, user: User, channel_id: int) -> DeliveryChannel:
    ch = db.get(DeliveryChannel, channel_id)
    if ch is None or ch.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Delivery channel not found")
    return ch


def _validate_target(kind: str, target: str) -> str:
    target = target.strip()
    if kind == DeliveryKind.WEBHOOK:
        try:
            return validate_target_url(target)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    try:
        return _email_adapter.validate_python(target)
    except ValidationError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Target must be a valid email address")


def _validate_filters(db: Session, filters: DeliveryFilters | None) -> dict | None:
    if filters is None:
        return None
    data = filters.model_dump(exclude_none=True)
    codes = data.get("jurisdiction_codes") or []
    if codes:
        known = set(db.scalars(select(func.upper(Jurisdiction.code)).where(func.upper(Jurisdiction.code).in_(codes))))
        unknown = sorted(set(codes) - known)
        if unknown:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown jurisdiction codes: {', '.join(unknown)}")
    return data or None


@router.get("", response_model=list[DeliveryChannelOut])
def list_channels(user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(DeliveryChannel).where(DeliveryChannel.user_id == user.id).order_by(DeliveryChannel.id.asc())
    )
    return [_out(c) for c in rows]


@router.post("", response_model=DeliveryChannelCreated, status_code=status.HTTP_201_CREATED)
def create_channel(body: DeliveryChannelIn, user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    count = db.scalar(select(func.count(DeliveryChannel.id)).where(DeliveryChannel.user_id == user.id)) or 0
    if count >= MAX_CHANNELS_PER_USER:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Maximum of {MAX_CHANNELS_PER_USER} delivery channels")
    target = _validate_target(body.kind, body.target)
    filters = _validate_filters(db, body.filters)
    secret = generate_secret() if body.kind == DeliveryKind.WEBHOOK else None
    ch = DeliveryChannel(
        user_id=user.id,
        kind=body.kind,
        target=target,
        secret=secret,
        enabled=body.enabled,
        digest=body.digest,
        filters=filters,
        consecutive_failures=0,
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    out = _out(ch).model_dump()
    return DeliveryChannelCreated(**out, secret=secret)


@router.patch("/{channel_id}", response_model=DeliveryChannelOut)
def update_channel(
    channel_id: int,
    body: DeliveryChannelPatch,
    user: User = Depends(require_jwt_user),
    db: Session = Depends(get_db),
):
    ch = _get_owned(db, user, channel_id)
    if body.target is not None:
        ch.target = _validate_target(ch.kind, body.target)
    if body.digest is not None:
        ch.digest = body.digest
    if body.clear_filters:
        ch.filters = None
    elif body.filters is not None:
        ch.filters = _validate_filters(db, body.filters)
    if body.enabled is not None:
        ch.enabled = body.enabled
        if body.enabled:
            ch.disabled_reason = None
            ch.consecutive_failures = 0
    db.commit()
    db.refresh(ch)
    return _out(ch)


@router.delete("/{channel_id}", response_model=Message)
def delete_channel(channel_id: int, user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    ch = _get_owned(db, user, channel_id)
    db.delete(ch)
    db.commit()
    return Message(detail="deleted")


@router.post("/{channel_id}/rotate-secret", response_model=DeliveryChannelCreated)
def rotate_secret(channel_id: int, user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    """Replace the webhook HMAC secret (returned once). The old secret keeps signing
    X-TaxAtlas-Signature-V2-Previous for SECRET_ROTATION_GRACE so the receiver can switch without losing events."""
    ch = _get_owned(db, user, channel_id)
    if ch.kind != DeliveryKind.WEBHOOK:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only webhook channels have a signing secret")
    ch.previous_secret = ch.secret
    ch.previous_secret_expires_at = utcnow() + SECRET_ROTATION_GRACE
    ch.secret = generate_secret()
    db.commit()
    db.refresh(ch)
    return DeliveryChannelCreated(**_out(ch).model_dump(), secret=ch.secret)


@router.post("/{channel_id}/test", response_model=DeliveryTestResult)
def test_channel(channel_id: int, user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    ch = _get_owned(db, user, channel_id)
    return DeliveryTestResult(**send_test_event(ch))


@router.get("/{channel_id}/attempts", response_model=list[DeliveryAttemptOut])
def list_attempts(channel_id: int, user: User = Depends(require_jwt_user), db: Session = Depends(get_db)):
    ch = _get_owned(db, user, channel_id)
    rows = db.scalars(
        select(DeliveryAttempt).where(DeliveryAttempt.channel_id == ch.id).order_by(DeliveryAttempt.id.desc()).limit(50)
    )
    return list(rows)
