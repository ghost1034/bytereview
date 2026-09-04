"""Shared client boundary for AI Analytics and Tasklytic.

AI Analytics owns the firm-scoped client identity and contact fields. Tasklytic
keeps a workspace-scoped JSON profile for PSA-only settings, then overlays the
canonical fields when returning a client to its frontend.
"""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from models.db_models import AnalyticsAuditLog, Client, User
from models.tasklytic import (
    TasklyticEntityRecord,
    TasklyticWorkspace,
    TasklyticWorkspaceMember,
)


SHARED_CLIENT_FIELDS = {
    "name": "name",
    "industry": "industry",
    "contactName": "contact_name",
    "contactEmail": "contact_email",
    "contactPhone": "contact_phone",
    "fiscalYearEnd": "fiscal_year_end",
    "notes": "notes",
}


def analytics_tables_available(db: Session) -> bool:
    """Keep isolated Tasklytic tests/evaluation databases backwards compatible."""

    inspector = inspect(db.connection())
    return all(inspector.has_table(table) for table in ("users", "firms", "clients"))


def ensure_firm_for_token(db: Session, token: dict[str, Any]):
    """Ensure Tasklytic provisioning has the same firm boundary as Analytics."""

    if not analytics_tables_available(db):
        return None
    from services.analytics.firm_scope import ensure_user_row, get_or_create_user_firm

    user = ensure_user_row(
        db,
        user_id=token["uid"],
        email=str(token.get("email") or ""),
        display_name=token.get("name"),
        photo_url=token.get("picture"),
    )
    if user.firm_id is not None:
        return user.firm_id
    _user, firm = get_or_create_user_firm(db, user.id)
    return firm.id


def firm_id_for_user(db: Session, user_id: str):
    if not analytics_tables_available(db):
        return None
    user = db.get(User, user_id)
    return user.firm_id if user is not None else None


def firm_id_for_workspace(
    db: Session,
    workspace_id: str,
    *,
    actor_user_id: str | None = None,
):
    """Resolve and lazily backfill the firm that owns a Tasklytic workspace."""

    workspace = db.get(TasklyticWorkspace, workspace_id)
    if workspace is None:
        return None
    if workspace.firm_id is not None:
        return workspace.firm_id
    if not analytics_tables_available(db):
        return None

    firm_id = firm_id_for_user(db, actor_user_id) if actor_user_id else None
    if firm_id is None:
        firm_id = (
            db.query(User.firm_id)
            .join(TasklyticWorkspaceMember, TasklyticWorkspaceMember.user_id == User.id)
            .filter(
                TasklyticWorkspaceMember.workspace_id == workspace_id,
                TasklyticWorkspaceMember.role == "admin",
                User.firm_id.is_not(None),
            )
            .order_by(TasklyticWorkspaceMember.created_at)
            .limit(1)
            .scalar()
        )
    if firm_id is not None:
        workspace.firm_id = firm_id
        db.flush()
    return firm_id


def tasklytic_client_payload(
    client: Client,
    workspace: TasklyticWorkspace,
    profile: TasklyticEntityRecord | None,
) -> dict[str, Any]:
    workspace_payload = workspace.payload or {}
    billing_settings = workspace_payload.get("billingSettings")
    if not isinstance(billing_settings, dict):
        billing_settings = {}
    data = copy.deepcopy(profile.payload or {}) if profile is not None else {}
    data.update(
        {
            "id": str(client.id),
            "workspaceId": workspace.id,
            "name": client.name,
            "industry": client.industry,
            "contactName": client.contact_name,
            "contactEmail": client.contact_email,
            "contactPhone": client.contact_phone,
            "fiscalYearEnd": client.fiscal_year_end,
            "notes": client.notes,
            "type": data.get("type", "business"),
            "paymentTerms": data.get(
                "paymentTerms",
                billing_settings.get("defaultPaymentTerms", "net_30"),
            ),
            "defaultCurrency": data.get(
                "defaultCurrency", workspace_payload.get("defaultCurrency", "USD")
            ),
            "archived": bool(data.get("archived", False)),
            "createdAt": data.get("createdAt")
            or (client.created_at or datetime.now(timezone.utc)).isoformat(),
            "revision": profile.revision if profile is not None else 1,
        }
    )
    return data


def list_tasklytic_clients(
    db: Session,
    workspace_id: str,
    *,
    actor_user_id: str | None = None,
) -> list[dict[str, Any]] | None:
    """Return the firm's canonical clients with Tasklytic PSA metadata overlaid."""

    firm_id = firm_id_for_workspace(db, workspace_id, actor_user_id=actor_user_id)
    if firm_id is None:
        return None
    workspace = db.get(TasklyticWorkspace, workspace_id)
    profiles = {
        row.record_id: row
        for row in db.query(TasklyticEntityRecord)
        .filter_by(entity_kind="clients", workspace_id=workspace_id)
        .all()
    }
    clients = (
        db.query(Client)
        .filter(Client.firm_id == firm_id)
        .order_by(Client.created_at.desc(), Client.name, Client.id)
        .all()
    )
    return [
        tasklytic_client_payload(client, workspace, profiles.get(str(client.id)))
        for client in clients
    ]


def _optional_text(payload: dict[str, Any], key: str, max_length: int) -> str | None:
    value = payload.get(key)
    if value is None or value == "":
        return None
    if not isinstance(value, str) or len(value) > max_length:
        raise HTTPException(status_code=422, detail=f"Client {key} is invalid")
    return value


def _audit(
    db: Session,
    *,
    firm_id,
    user_id: str,
    action: str,
    client: Client,
    details: dict[str, Any] | None = None,
) -> None:
    if not inspect(db.connection()).has_table("analytics_audit_logs"):
        return
    db.add(
        AnalyticsAuditLog(
            id=uuid.uuid4(),
            firm_id=firm_id,
            user_id=user_id,
            action=action,
            details={
                "client_id": str(client.id),
                "name": client.name,
                "source": "tasklytic",
                **(details or {}),
            },
        )
    )


def sync_tasklytic_client(
    db: Session,
    workspace_id: str,
    payload: dict[str, Any],
    *,
    actor_user_id: str,
    profile: TasklyticEntityRecord,
) -> dict[str, Any]:
    """Create/update the canonical client after a Tasklytic profile mutation."""

    firm_id = firm_id_for_workspace(db, workspace_id, actor_user_id=actor_user_id)
    if firm_id is None:
        return copy.deepcopy(payload)
    try:
        client_id = uuid.UUID(str(payload.get("id") or ""))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Shared client ids must be UUIDs") from exc

    name = payload.get("name")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 255:
        raise HTTPException(status_code=422, detail="Client name is required")

    client = db.get(Client, client_id)
    created = client is None
    if client is not None and client.firm_id != firm_id:
        raise HTTPException(status_code=409, detail="Client id belongs to another firm")
    if client is None:
        client = Client(id=client_id, firm_id=firm_id, name=name.strip())
        db.add(client)

    before = {column: getattr(client, column) for column in SHARED_CLIENT_FIELDS.values()}
    client.name = name.strip()
    for tasklytic_key, column in SHARED_CLIENT_FIELDS.items():
        if column == "name":
            continue
        max_length = 64 if column == "contact_phone" else 32 if column == "fiscal_year_end" else 255
        if column == "notes":
            max_length = 2_000_000
        setattr(client, column, _optional_text(payload, tasklytic_key, max_length))
    db.flush()

    after = {column: getattr(client, column) for column in SHARED_CLIENT_FIELDS.values()}
    diff = {
        column: {"before": before[column], "after": after[column]}
        for column in before
        if before[column] != after[column]
    }
    if created:
        _audit(
            db,
            firm_id=firm_id,
            user_id=actor_user_id,
            action="client.created",
            client=client,
        )
    elif diff:
        _audit(
            db,
            firm_id=firm_id,
            user_id=actor_user_id,
            action="client.updated",
            client=client,
            details={"diff": diff},
        )
    return tasklytic_client_payload(client, db.get(TasklyticWorkspace, workspace_id), profile)


def delete_shared_client(
    db: Session,
    workspace_id: str,
    client_id: str,
    *,
    actor_user_id: str,
) -> None:
    firm_id = firm_id_for_workspace(db, workspace_id, actor_user_id=actor_user_id)
    if firm_id is None:
        return
    try:
        parsed_id = uuid.UUID(client_id)
    except ValueError:
        return
    client = db.get(Client, parsed_id)
    if client is None or client.firm_id != firm_id:
        return
    _audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="client.deleted",
        client=client,
    )
    from firmcrm.services.shared_clients import require_client_unlinked
    require_client_unlinked(db, client.id)
    db.delete(client)
    db.query(TasklyticEntityRecord).filter(
        TasklyticEntityRecord.entity_kind == "clients",
        TasklyticEntityRecord.record_id == client_id,
        TasklyticEntityRecord.workspace_id.in_(
            db.query(TasklyticWorkspace.id).filter(TasklyticWorkspace.firm_id == firm_id)
        ),
    ).delete(synchronize_session=False)


def delete_tasklytic_client_profiles(db: Session, firm_id, client_id: str) -> None:
    """Remove PSA metadata when AI Analytics deletes a canonical client."""

    inspector = inspect(db.connection())
    if not all(
        inspector.has_table(table)
        for table in ("tasklytic_entity_records", "tasklytic_workspaces")
    ):
        return
    db.query(TasklyticEntityRecord).filter(
        TasklyticEntityRecord.entity_kind == "clients",
        TasklyticEntityRecord.record_id == client_id,
        TasklyticEntityRecord.workspace_id.in_(
            db.query(TasklyticWorkspace.id).filter(TasklyticWorkspace.firm_id == firm_id)
        ),
    ).delete(synchronize_session=False)
