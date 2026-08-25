"""Firm-scoped PBC evidence storage accounting and quota enforcement."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.db_models import BillingAccount, Firm, SubscriptionPlan, User
from models.pbc import PbcDocument
from services.pbc_service import utcnow


MEBIBYTE = 1024 * 1024
PBC_STORAGE_LIMITS = {
    "free": 20 * MEBIBYTE,
    "basic": 100 * MEBIBYTE,
    "pro": 1024 * MEBIBYTE,
}
ACTIVE_RESERVATION_AGE = timedelta(hours=24)


def _firm_plan(db: Session, firm_id: uuid.UUID) -> tuple[str, int]:
    """Return the firm's highest PBC entitlement across its member accounts."""
    rows = (
        db.query(BillingAccount.plan_code, SubscriptionPlan.pbc_storage_bytes_included)
        .join(User, User.id == BillingAccount.user_id)
        .join(SubscriptionPlan, SubscriptionPlan.code == BillingAccount.plan_code)
        .filter(User.firm_id == firm_id)
        .all()
    )
    if not rows:
        return "free", PBC_STORAGE_LIMITS["free"]
    plan_code, included = max(
        rows,
        key=lambda row: int(row[1] or PBC_STORAGE_LIMITS.get(str(row[0]), 0)),
    )
    return str(plan_code), int(included or PBC_STORAGE_LIMITS.get(str(plan_code), 0))


def pbc_storage_summary(db: Session, firm_id: uuid.UUID, *, lock: bool = False) -> dict[str, Any]:
    """Calculate lifetime evidence usage plus active direct-upload reservations."""
    if lock:
        # Upload initiations for one firm serialize on this row, preventing two
        # concurrent reservations from both observing the same remaining space.
        db.query(Firm.id).filter(Firm.id == firm_id).with_for_update().one()

    plan_code, included_bytes = _firm_plan(db, firm_id)
    used_bytes = int(
        db.query(func.coalesce(func.sum(PbcDocument.size_bytes), 0))
        .filter(PbcDocument.firm_id == firm_id, PbcDocument.state == "available")
        .scalar()
        or 0
    )
    reserved_bytes = int(
        db.query(func.coalesce(func.sum(PbcDocument.size_bytes), 0))
        .filter(
            PbcDocument.firm_id == firm_id,
            PbcDocument.state == "initiated",
            PbcDocument.created_at >= utcnow() - ACTIVE_RESERVATION_AGE,
        )
        .scalar()
        or 0
    )
    allocated_bytes = used_bytes + reserved_bytes
    return {
        "plan_code": plan_code,
        "used_bytes": used_bytes,
        "reserved_bytes": reserved_bytes,
        "included_bytes": included_bytes,
        "remaining_bytes": max(0, included_bytes - allocated_bytes),
    }


def require_pbc_storage(db: Session, firm_id: uuid.UUID, additional_bytes: int) -> dict[str, Any]:
    """Reserve-capacity guard used before issuing a direct-upload URL."""
    summary = pbc_storage_summary(db, firm_id, lock=True)
    if additional_bytes <= summary["remaining_bytes"]:
        return summary
    raise HTTPException(
        status_code=402,
        detail={
            "code": "pbc_storage_limit_exceeded",
            "message": "This upload exceeds the firm's PBC storage allowance. Upgrade the plan or reduce the file size.",
            **summary,
            "requested_bytes": int(additional_bytes),
        },
    )
