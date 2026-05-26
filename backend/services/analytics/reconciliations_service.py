"""CRUD service for `reconciliations` rows."""

from __future__ import annotations

import uuid
from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import Reconciliation


def list_reconciliations(db: Session, firm_id) -> List[Reconciliation]:
    return (
        db.query(Reconciliation)
        .filter(Reconciliation.firm_id == firm_id)
        .order_by(Reconciliation.updated_at.desc())
        .all()
    )


def get_reconciliation(db: Session, firm_id, reconciliation_id: str) -> Reconciliation:
    row = (
        db.query(Reconciliation)
        .filter(
            Reconciliation.id == reconciliation_id,
            Reconciliation.firm_id == firm_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    return row


def create_reconciliation(db: Session, firm_id, user_id: str, *, payload) -> Reconciliation:
    row = Reconciliation(
        id=uuid.uuid4(),
        firm_id=firm_id,
        client_id=payload.client_id,
        created_by_user_id=user_id,
        name=payload.name,
        status=payload.status or "draft",
        source_a=payload.source_a,
        source_b=payload.source_b,
        rules=payload.rules,
        match_groups=payload.match_groups,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_reconciliation(db: Session, firm_id, reconciliation_id: str, *, payload) -> Reconciliation:
    row = get_reconciliation(db, firm_id, reconciliation_id)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_reconciliation(db: Session, firm_id, reconciliation_id: str) -> None:
    row = get_reconciliation(db, firm_id, reconciliation_id)
    db.delete(row)
    db.commit()
