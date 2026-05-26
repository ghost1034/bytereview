"""CRUD service for `amortizations` rows + journal entry generation."""

from __future__ import annotations

import uuid
from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import Amortization, JournalEntry


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
    return row


def update_amortization(db: Session, firm_id, amortization_id: str, *, payload) -> Amortization:
    row = get_amortization(db, firm_id, amortization_id)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_amortization(db: Session, firm_id, amortization_id: str) -> None:
    row = get_amortization(db, firm_id, amortization_id)
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Journal entries (scoped to firm, optionally linked to amortization)
# ---------------------------------------------------------------------------


def list_journal_entries(db: Session, firm_id, amortization_id: str | None = None) -> List[JournalEntry]:
    q = db.query(JournalEntry).filter(JournalEntry.firm_id == firm_id)
    if amortization_id:
        q = q.filter(JournalEntry.amortization_id == amortization_id)
    return q.order_by(JournalEntry.created_at.desc()).all()


def create_journal_entry(db: Session, firm_id, *, payload) -> JournalEntry:
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
    return row
