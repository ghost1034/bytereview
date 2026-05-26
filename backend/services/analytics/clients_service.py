"""CRUD service for Client rows (firm-scoped)."""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import Client


def list_clients(db: Session, firm_id) -> List[Client]:
    return (
        db.query(Client)
        .filter(Client.firm_id == firm_id)
        .order_by(Client.created_at.desc())
        .all()
    )


def get_client(db: Session, firm_id, client_id: str) -> Client:
    client = (
        db.query(Client)
        .filter(Client.id == client_id, Client.firm_id == firm_id)
        .first()
    )
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


def create_client(db: Session, firm_id, *, payload) -> Client:
    client = Client(
        id=uuid.uuid4(),
        firm_id=firm_id,
        name=payload.name,
        industry=payload.industry,
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        fiscal_year_end=payload.fiscal_year_end,
        notes=payload.notes,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def update_client(db: Session, firm_id, client_id: str, *, payload) -> Client:
    client = get_client(db, firm_id, client_id)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(client, k, v)
    db.commit()
    db.refresh(client)
    return client


def delete_client(db: Session, firm_id, client_id: str) -> None:
    client = get_client(db, firm_id, client_id)
    db.delete(client)
    db.commit()
