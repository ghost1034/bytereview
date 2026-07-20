"""Append-only audit trail for e-signature envelopes.

Every signer/sender action writes an EsignEvent row inside the caller's
transaction. Unlike best-effort analytics audit logging, failures here are
FATAL on the signing path — an unrecorded signature is worse than a rejected
one, so exceptions propagate and roll back the surrounding action.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from models.db_models import EsignEvent, EsignEventType


@dataclass
class EsignRequestMeta:
    """Request-scoped evidence captured for the audit trail."""

    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    mfa_verified: Optional[bool] = None
    mfa_method: Optional[str] = None
    mfa_phone_last4: Optional[str] = None


def extract_request_meta(request: Request, token_data: Optional[dict] = None) -> EsignRequestMeta:
    """Build audit metadata from the HTTP request and the decoded Firebase token.

    IP comes from the first hop of X-Forwarded-For (Cloud Run sits behind a
    proxy, so request.client.host is the load balancer, not the user).
    MFA evidence comes from the token's firebase claims — phone MFA is enforced
    at login by dependencies/auth.py, so sign_in_second_factor is the proof.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip_address = forwarded.split(",")[0].strip() or None
    else:
        ip_address = request.client.host if request.client else None

    user_agent = request.headers.get("user-agent")

    mfa_verified: Optional[bool] = None
    mfa_method: Optional[str] = None
    mfa_phone_last4: Optional[str] = None
    if token_data:
        firebase_claims = token_data.get("firebase") or {}
        second_factor = firebase_claims.get("sign_in_second_factor")
        mfa_method = second_factor
        mfa_verified = second_factor == "phone"
        phone = token_data.get("phone_number")
        if phone and len(phone) >= 4:
            mfa_phone_last4 = phone[-4:]

    return EsignRequestMeta(
        ip_address=ip_address,
        user_agent=user_agent,
        mfa_verified=mfa_verified,
        mfa_method=mfa_method,
        mfa_phone_last4=mfa_phone_last4,
    )


def record_event(
    db: Session,
    *,
    envelope_id,
    event_type: EsignEventType,
    actor_user_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    recipient_id=None,
    meta: Optional[EsignRequestMeta] = None,
    details: Optional[dict[str, Any]] = None,
) -> EsignEvent:
    """Add an audit event to the current session (caller commits).

    Raises on failure — callers on the signing path must let this roll back
    the whole action.
    """
    event = EsignEvent(
        envelope_id=envelope_id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        actor_email=(actor_email or "").lower() or None,
        recipient_id=recipient_id,
        ip_address=meta.ip_address if meta else None,
        user_agent=meta.user_agent if meta else None,
        mfa_verified=meta.mfa_verified if meta else None,
        mfa_method=meta.mfa_method if meta else None,
        mfa_phone_last4=meta.mfa_phone_last4 if meta else None,
        details=details,
    )
    db.add(event)
    db.flush()  # surface DB errors (e.g. enum/constraint) inside the transaction
    # The outbox insert shares this transaction with the immutable event. A
    # webhook can therefore never observe an event that did not commit, nor can
    # a committed event silently miss an eligible delivery row.
    from services.esign.webhook_service import create_event_deliveries
    create_event_deliveries(db, event)
    return event
