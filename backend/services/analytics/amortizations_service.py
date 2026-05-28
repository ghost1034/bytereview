"""CRUD service for `amortizations` rows + journal entry generation."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import Amortization, JournalEntry
from services.analytics.audit_service import record_audit


# Scalar columns small enough to capture diffs for in the audit log. Schedule
# blobs and type_specific stay out — only their presence is recorded.
_AUDITED_FIELDS = (
    "asset_name",
    "asset_type",
    "status",
    "approval_status",
    "client_id",
    "cost_basis",
    "useful_life_months",
    "gaap_method",
    "tax_method",
    "start_date",
)
_PAYLOAD_FIELDS = ("schedule", "tax_schedule", "type_specific")


def list_amortizations(db: Session, firm_id) -> List[Amortization]:
    return (
        db.query(Amortization)
        .filter(Amortization.firm_id == firm_id)
        .order_by(Amortization.updated_at.desc())
        .all()
    )


def get_amortization(db: Session, firm_id, amortization_id: str) -> Amortization:
    row = (
        db.query(Amortization)
        .filter(
            Amortization.id == amortization_id,
            Amortization.firm_id == firm_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Amortization not found")
    return row


def create_amortization(db: Session, firm_id, user_id: str, *, payload) -> Amortization:
    row = Amortization(
        id=uuid.uuid4(),
        firm_id=firm_id,
        client_id=payload.client_id,
        created_by_user_id=user_id,
        asset_name=payload.asset_name,
        asset_type=payload.asset_type,
        cost_basis=payload.cost_basis,
        salvage_value=payload.salvage_value,
        useful_life_months=payload.useful_life_months,
        gaap_method=payload.gaap_method,
        tax_method=payload.tax_method,
        start_date=payload.start_date,
        vendor=payload.vendor,
        status=payload.status or "draft",
        approval_status=payload.approval_status or "pending",
        type_specific=payload.type_specific,
        schedule=payload.schedule,
        tax_schedule=payload.tax_schedule,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    record_audit(
        db,
        firm_id=firm_id,
        user_id=user_id,
        action="amortization.created",
        details={
            "amortization_id": str(row.id),
            "asset_name": row.asset_name,
            "asset_type": row.asset_type,
        },
    )
    return row


def update_amortization(
    db: Session,
    firm_id,
    amortization_id: str,
    *,
    payload,
    actor_user_id: Optional[str] = None,
) -> Amortization:
    row = get_amortization(db, firm_id, amortization_id)
    data = payload.model_dump(exclude_unset=True)
    before: Dict[str, Any] = {k: getattr(row, k) for k in _AUDITED_FIELDS if k in data}
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)

    after = {k: getattr(row, k) for k in before}
    diff = {
        k: {"before": before[k], "after": after[k]}
        for k in before
        if before[k] != after[k]
    }
    payload_changed = [k for k in _PAYLOAD_FIELDS if k in data]
    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="amortization.updated",
        details={
            "amortization_id": str(row.id),
            "asset_name": row.asset_name,
            "diff": diff,
            "payload_changed": payload_changed,
        },
    )
    return row


def delete_amortization(
    db: Session, firm_id, amortization_id: str, *, actor_user_id: Optional[str] = None
) -> None:
    row = get_amortization(db, firm_id, amortization_id)
    snapshot = {
        "amortization_id": str(row.id),
        "asset_name": row.asset_name,
        "asset_type": row.asset_type,
    }
    db.delete(row)
    db.commit()

    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="amortization.deleted",
        details=snapshot,
    )


# ---------------------------------------------------------------------------
# Journal entries (scoped to firm, optionally linked to amortization)
# ---------------------------------------------------------------------------


def list_journal_entries(db: Session, firm_id, amortization_id: str | None = None) -> List[JournalEntry]:
    q = db.query(JournalEntry).filter(JournalEntry.firm_id == firm_id)
    if amortization_id:
        q = q.filter(JournalEntry.amortization_id == amortization_id)
    return q.order_by(JournalEntry.created_at.desc()).all()


def create_journal_entry(
    db: Session,
    firm_id,
    *,
    payload,
    actor_user_id: Optional[str] = None,
) -> JournalEntry:
    row = JournalEntry(
        id=uuid.uuid4(),
        firm_id=firm_id,
        client_id=payload.client_id,
        amortization_id=payload.amortization_id,
        period=payload.period,
        entries=payload.entries,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="amortization.journal_entry.created",
        details={
            "journal_entry_id": str(row.id),
            "amortization_id": str(payload.amortization_id) if payload.amortization_id else None,
            "period": payload.period,
            "line_count": len(payload.entries or []),
        },
    )
    return row
