"""CRUD service for Client rows (firm-scoped)."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import Client
from services.analytics.audit_service import record_audit
from services.shared_clients import delete_tasklytic_client_profiles


_AUDITED_FIELDS = (
    "name",
    "industry",
    "contact_name",
    "contact_email",
    "contact_phone",
    "fiscal_year_end",
    "notes",
)


def list_clients(db: Session, firm_id) -> List[Client]:
    return (
        db.query(Client)
        .filter(Client.firm_id == firm_id)
        .order_by(Client.created_at.desc())
        .all()
    )


def get_client(db: Session, firm_id, client_id: str) -> Client:
    try:
        parsed_client_id = uuid.UUID(client_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Client not found") from None
    client = (
        db.query(Client)
        .filter(Client.id == parsed_client_id, Client.firm_id == firm_id)
        .first()
    )
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


def create_client(db: Session, firm_id, *, payload, actor_user_id: str) -> Client:
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

    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="client.created",
        details={"client_id": str(client.id), "name": client.name},
    )
    return client


def update_client(
    db: Session, firm_id, client_id: str, *, payload, actor_user_id: str
) -> Client:
    client = get_client(db, firm_id, client_id)
    data = payload.model_dump(exclude_unset=True)
    before: Dict[str, Any] = {k: getattr(client, k) for k in _AUDITED_FIELDS if k in data}
    for k, v in data.items():
        setattr(client, k, v)
    db.commit()
    db.refresh(client)

    after = {k: getattr(client, k) for k in before}
    diff = {k: {"before": before[k], "after": after[k]} for k in before if before[k] != after[k]}
    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="client.updated",
        details={
            "client_id": str(client.id),
            "name": client.name,
            "diff": diff,
        },
    )
    return client


def delete_client(db: Session, firm_id, client_id: str, *, actor_user_id: str) -> None:
    client = get_client(db, firm_id, client_id)
    snapshot = {"client_id": str(client.id), "name": client.name}
    from firmcrm.services.shared_clients import require_client_unlinked
    require_client_unlinked(db, client.id)
    delete_tasklytic_client_profiles(db, firm_id, str(client.id))
    db.delete(client)
    db.commit()

    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="client.deleted",
        details=snapshot,
    )
