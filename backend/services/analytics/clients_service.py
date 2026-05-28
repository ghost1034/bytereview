"""CRUD service for Client rows (firm-scoped)."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from models.db_models import AnalyticsProjectStatus, Client, Project
from services.analytics.audit_service import record_audit


_AUDITED_FIELDS = (
    "name",
    "industry",
    "contact_name",
    "contact_email",
    "contact_phone",
    "fiscal_year_end",
    "notes",
)


def _active_project_count_expr():
    """Per-row count of non-archived projects, used in a GROUP BY query."""
    return func.coalesce(
        func.sum(
            case((Project.status != AnalyticsProjectStatus.ARCHIVED, 1), else_=0)
        ),
        0,
    )


def list_clients(db: Session, firm_id) -> List[Tuple[Client, int]]:
    rows = (
        db.query(Client, _active_project_count_expr())
        .outerjoin(Project, Project.client_id == Client.id)
        .filter(Client.firm_id == firm_id)
        .group_by(Client.id)
        .order_by(Client.created_at.desc())
        .all()
    )
    return [(client, int(count or 0)) for client, count in rows]


def count_active_projects(db: Session, firm_id, client_id: str) -> int:
    value = (
        db.query(func.count(Project.id))
        .filter(
            Project.firm_id == firm_id,
            Project.client_id == client_id,
            Project.status != AnalyticsProjectStatus.ARCHIVED,
        )
        .scalar()
    )
    return int(value or 0)


def get_client(db: Session, firm_id, client_id: str) -> Client:
    client = (
        db.query(Client)
        .filter(Client.id == client_id, Client.firm_id == firm_id)
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
    db.delete(client)
    db.commit()

    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="client.deleted",
        details=snapshot,
    )
