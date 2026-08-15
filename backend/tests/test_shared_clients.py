from __future__ import annotations

import os
import uuid

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from models.analytics import ClientUpdateRequest
from models.db_models import AnalyticsUserRole, Base, Client, Firm, User
from models.tasklytic import (
    TasklyticEntityRecord,
    TasklyticWorkspace,
    TasklyticWorkspaceEvent,
    TasklyticWorkspaceMember,
)
from services.analytics import clients_service
from services.tasklytic_service import list_records, upsert_record


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(
        engine,
        tables=[
            Firm.__table__,
            User.__table__,
            Client.__table__,
            TasklyticWorkspace.__table__,
            TasklyticWorkspaceMember.__table__,
            TasklyticEntityRecord.__table__,
            TasklyticWorkspaceEvent.__table__,
        ],
    )
    # The production column is PostgreSQL JSONB. SQLite can exercise the same
    # mapped audit writes against a JSON-compatible column created directly.
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE analytics_audit_logs (
                id UUID PRIMARY KEY,
                firm_id UUID NOT NULL,
                user_id VARCHAR(128),
                action VARCHAR(128) NOT NULL,
                details JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
            """
        )
    session = sessionmaker(bind=engine)()
    firm_id = uuid.uuid4()
    session.add(Firm(id=firm_id, name="Shared Firm"))
    session.add(
        User(
            id="owner",
            email="owner@example.com",
            firm_id=firm_id,
            role=AnalyticsUserRole.ADMIN,
        )
    )
    session.add(
        TasklyticWorkspace(
            id="w1",
            firm_id=firm_id,
            payload={"id": "w1", "name": "Shared Firm", "defaultCurrency": "GBP"},
        )
    )
    session.add(TasklyticWorkspaceMember(workspace_id="w1", user_id="owner", role="admin"))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def test_tasklytic_lists_analytics_clients_with_psa_defaults(db):
    canonical = Client(
        id=uuid.uuid4(),
        firm_id=db.get(User, "owner").firm_id,
        name="Analytics Client",
        industry="Technology",
        contact_email="controller@example.com",
    )
    db.add(canonical)
    db.commit()

    analytics_ids = {str(client.id) for client in clients_service.list_clients(db, canonical.firm_id)}
    tasklytic = list_records(db, "clients", "owner", "w1")

    assert {client["id"] for client in tasklytic} == analytics_ids
    assert tasklytic == [
        {
            "id": str(canonical.id),
            "workspaceId": "w1",
            "name": "Analytics Client",
            "industry": "Technology",
            "contactName": None,
            "contactEmail": "controller@example.com",
            "contactPhone": None,
            "fiscalYearEnd": None,
            "notes": None,
            "type": "business",
            "paymentTerms": "net_30",
            "defaultCurrency": "GBP",
            "archived": False,
            "createdAt": canonical.created_at.isoformat(),
            "revision": 1,
        }
    ]


def test_tasklytic_client_crud_writes_through_to_analytics(db):
    client_id = str(uuid.uuid4())
    created = upsert_record(
        db,
        "clients",
        {
            "id": client_id,
            "workspaceId": "w1",
            "name": "Tasklytic Client",
            "industry": "Professional Services",
            "contactEmail": "finance@example.com",
            "type": "business",
            "paymentTerms": "net_45",
            "defaultCurrency": "USD",
            "archived": False,
            "createdAt": "2026-08-15T00:00:00Z",
        },
        "owner",
        "w1",
    )
    db.commit()

    canonical = db.get(Client, uuid.UUID(client_id))
    assert canonical is not None
    assert canonical.name == "Tasklytic Client"
    assert canonical.industry == "Professional Services"
    assert created["paymentTerms"] == "net_45"

    clients_service.update_client(
        db,
        canonical.firm_id,
        client_id,
        payload=ClientUpdateRequest(
            name="Shared Client",
            contact_name="Alex Rivera",
            fiscal_year_end="12/31",
        ),
        actor_user_id="owner",
    )
    [tasklytic] = list_records(db, "clients", "owner", "w1")
    assert tasklytic["name"] == "Shared Client"
    assert tasklytic["contactName"] == "Alex Rivera"
    assert tasklytic["fiscalYearEnd"] == "12/31"
    assert tasklytic["paymentTerms"] == "net_45"

    clients_service.delete_client(
        db, canonical.firm_id, client_id, actor_user_id="owner"
    )
    assert list_records(db, "clients", "owner", "w1") == []
    assert (
        db.query(TasklyticEntityRecord)
        .filter_by(entity_kind="clients", record_id=client_id)
        .count()
        == 0
    )
