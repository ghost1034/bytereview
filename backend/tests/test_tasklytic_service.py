from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from models.db_models import Base
from models.tasklytic import (
    TasklyticEntityRecord,
    TasklyticFileUpload,
    TasklyticInvitation,
    TasklyticWorkspace,
    TasklyticWorkspaceMember,
)
from services.tasklytic_service import (
    ENTITY_POLICIES,
    bootstrap,
    list_records,
    provision_bundle,
    replace_collection,
    upsert_record,
    upsert_workspace,
    workspace_payload,
)
from core.database import get_db
from dependencies.auth import verify_firebase_token
from routes.tasklytic import router as tasklytic_router
from services.tasklytic_ai_service import build_authorized_context, validate_proposals


EXPECTED_KINDS = {
    "workspaces", "teams", "users", "projects", "sections", "tasks", "customFields",
    "comments", "activity", "attachments", "tags", "forms", "formSubmissions", "rules",
    "goals", "portfolios", "statusUpdates", "projectMessages", "notifications", "savedViews",
    "dashboards", "templates", "session", "pendingEmails", "workspaceInvitations", "timeEntries",
    "expenses", "invoices", "clients", "matters", "billingRates", "rateCards", "timesheets",
    "expenseReports", "payments", "trustTransactions", "reimbursementBatches", "billingInquiries",
    "teamJoinRequests",
}


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(
        engine,
        tables=[
            TasklyticWorkspace.__table__,
            TasklyticWorkspaceMember.__table__,
            TasklyticEntityRecord.__table__,
            TasklyticInvitation.__table__,
            TasklyticFileUpload.__table__,
        ],
    )
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def api(db):
    app = FastAPI()
    app.include_router(tasklytic_router)
    identity = {"uid": "owner", "email": "owner@example.com", "email_verified": True, "name": "Owner"}

    def override_db():
        yield db

    def override_auth():
        return identity

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[verify_firebase_token] = override_auth
    return TestClient(app), identity


def starter_bundle():
    return {
        "workspace": {"id": "w1", "name": "Acme", "memberIds": ["owner"], "adminIds": ["owner"], "createdAt": "2026-01-01T00:00:00Z"},
        "user": {"id": "owner", "name": "Owner", "email": "owner@example.com", "avatarColor": "#000", "role": "admin", "createdAt": "2026-01-01T00:00:00Z"},
        "team": {"id": "team1", "workspaceId": "w1", "name": "General", "memberIds": ["owner"], "adminIds": ["owner"], "privacy": "public"},
        "project": {"id": "project1", "workspaceId": "w1", "teamId": "team1", "name": "Start", "privacy": "private_to_members", "memberIds": ["owner"], "ownerId": "owner"},
        "sections": [{"id": "section1", "projectId": "project1", "name": "Todo", "order": 0, "collapsed": False}],
        "tasks": [{"id": "task1", "workspaceId": "w1", "name": "Kickoff", "projectIds": ["project1"], "sectionIdByProject": {"project1": "section1"}}],
        "notification": {"id": "notification1", "userId": "owner", "scope": {"type": "project", "id": "project1"}, "type": "status_update", "message": "Welcome"},
        "goal": {"id": "goal1", "workspaceId": "w1", "name": "Launch"},
        "portfolio": {"id": "portfolio1", "workspaceId": "w1", "name": "Portfolio"},
    }


def test_policy_registry_covers_locked_frontend_entity_union():
    assert set(ENTITY_POLICIES) == EXPECTED_KINDS


def test_provision_is_atomic_shape_and_idempotent(db):
    token = {"uid": "owner", "email": "owner@example.com"}
    first = provision_bundle(db, starter_bundle(), token)
    db.commit()
    second = provision_bundle(db, {"unexpected": True}, token)

    assert first["created"] is True
    assert second["created"] is False
    assert second["workspace"]["adminIds"] == ["owner"]
    assert second["bootstrap"]["collections"]["tasks"][0]["id"] == "task1"
    assert db.query(TasklyticWorkspace).count() == 1


def test_workspace_membership_is_authoritative_and_admin_mutable(db):
    token = {"uid": "owner", "email": "owner@example.com"}
    provision_bundle(db, starter_bundle(), token)
    forged = dict(workspace_payload(db, db.get(TasklyticWorkspace, "w1")))
    forged.update({"memberIds": ["owner", "member", "guest"], "adminIds": ["owner"], "guestIds": ["guest"]})
    upsert_workspace(db, forged, "owner")
    db.flush()

    returned = workspace_payload(db, db.get(TasklyticWorkspace, "w1"))
    assert set(returned["memberIds"]) == {"owner", "member", "guest"}
    assert returned["guestIds"] == ["guest"]
    with pytest.raises(HTTPException) as exc:
        upsert_workspace(db, {**returned, "adminIds": []}, "member")
    assert exc.value.status_code == 403


def test_private_project_and_dependents_are_hidden_from_guest(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    db.add(TasklyticWorkspaceMember(workspace_id="w1", user_id="guest", role="guest"))
    db.flush()

    snapshot = bootstrap(db, "guest", "w1")
    assert snapshot["collections"]["projects"] == []
    assert snapshot["collections"]["tasks"] == []
    assert snapshot["collections"]["sections"] == []


def test_cross_workspace_parent_reference_and_privilege_escalation_are_rejected(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    upsert_workspace(db, {"id": "w2", "name": "Other", "createdAt": "2026-01-01T00:00:00Z"}, "outsider")
    upsert_record(db, "teams", {"id": "team2", "workspaceId": "w2", "name": "T", "memberIds": ["outsider"], "privacy": "public"}, "outsider", "w2")
    upsert_record(db, "projects", {"id": "project2", "workspaceId": "w2", "teamId": "team2", "name": "P", "privacy": "public_to_workspace", "memberIds": ["outsider"], "ownerId": "outsider"}, "outsider", "w2")
    upsert_record(db, "tasks", {"id": "task2", "workspaceId": "w2", "name": "T", "projectIds": ["project2"], "sectionIdByProject": {}}, "outsider", "w2")
    with pytest.raises(HTTPException) as exc:
        upsert_record(db, "comments", {"id": "comment1", "taskId": "task2", "authorId": "owner", "bodyHtml": "x"}, "owner", "w1")
    assert exc.value.status_code == 422

    db.add(TasklyticWorkspaceMember(workspace_id="w1", user_id="member", role="member"))
    upsert_record(db, "users", {"id": "member", "name": "M", "email": "m@example.com", "role": "member"}, "owner", "w1")
    with pytest.raises(HTTPException) as exc:
        upsert_record(db, "users", {"id": "member", "name": "M", "email": "m@example.com", "role": "admin"}, "member", "w1")
    assert exc.value.status_code == 403


def test_collection_replace_removes_omitted_records_and_rejects_unknown_kind(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    replace_collection(db, "tags", [
        {"id": "tag1", "workspaceId": "w1", "name": "One", "color": "red"},
        {"id": "tag2", "workspaceId": "w1", "name": "Two", "color": "blue"},
    ], "owner", "w1")
    replace_collection(db, "tags", [{"id": "tag2", "workspaceId": "w1", "name": "Two", "color": "blue"}], "owner", "w1")
    assert [row["id"] for row in list_records(db, "tags", "owner", "w1")] == ["tag2"]
    with pytest.raises(HTTPException) as exc:
        list_records(db, "notARealEntity", "owner", "w1")
    assert exc.value.status_code == 404


def test_invitation_tokens_are_hashed_and_acceptance_is_single_use(db, api, monkeypatch):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    db.commit()
    captured = {}

    def capture_email(to, subject, html_body, text_body, reply_to=None):
        captured["text"] = text_body
        return True

    monkeypatch.setattr("routes.tasklytic.email_service.send_html_email", capture_email)
    sent = client.post(
        "/api/tasklytic/invitations/send",
        json={"workspaceId": "w1", "emails": ["new@example.com"], "role": "member"},
    )
    assert sent.status_code == 200
    response_text = sent.text
    assert "token" not in response_text.lower()
    plain = captured["text"].split("token=", 1)[1]
    row = db.query(TasklyticInvitation).one()
    assert row.token_hash != plain
    assert len(row.token_hash) == 64

    identity.update({"uid": "new-user", "email": "wrong@example.com"})
    assert client.post("/api/tasklytic/invitations/accept", json={"token": plain}).status_code == 403
    identity["email"] = "new@example.com"
    accepted = client.post("/api/tasklytic/invitations/accept", json={"token": plain})
    assert accepted.status_code == 200
    assert db.get(TasklyticWorkspaceMember, ("w1", "new-user")).role == "member"
    assert client.post("/api/tasklytic/invitations/accept", json={"token": plain}).status_code == 409


def test_public_form_is_sanitized_validated_and_idempotent(db, api):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    upsert_record(db, "forms", {
        "id": "form1", "projectId": "project1", "name": "Intake", "description": "Tell us",
        "fields": [{"id": "name", "type": "short_text", "label": "Name", "required": True}],
        "taskTitleFieldId": "name", "copyAnswersToDescription": True, "isPublic": True,
        "publicSlug": "intake", "confirmationMessage": "Thanks", "createdAt": "2026-01-01T00:00:00Z",
    }, "owner", "w1")
    db.commit()

    definition = client.get("/api/tasklytic/public/forms/intake")
    assert definition.status_code == 200
    assert "projectId" not in definition.json()
    assert client.post(
        "/api/tasklytic/public/forms/intake/submit",
        headers={"Idempotency-Key": "missing-name"}, json={"answers": {}},
    ).status_code == 422
    first = client.post(
        "/api/tasklytic/public/forms/intake/submit",
        headers={"Idempotency-Key": "same-request"}, json={"answers": {"name": "Tax return"}},
    )
    second = client.post(
        "/api/tasklytic/public/forms/intake/submit",
        headers={"Idempotency-Key": "same-request"}, json={"answers": {"name": "Tax return"}},
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["taskId"] == second.json()["taskId"]
    assert second.json()["replayed"] is True
    assert db.query(TasklyticEntityRecord).filter_by(entity_kind="formSubmissions").count() == 1


def test_ai_context_and_proposals_cannot_cross_private_scope(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    db.add(TasklyticWorkspaceMember(workspace_id="w1", user_id="guest", role="guest"))
    db.flush()
    with pytest.raises(HTTPException) as exc:
        build_authorized_context(db, "guest", {"type": "project", "projectId": "project1"})
    assert exc.value.status_code == 403
    with pytest.raises(ValueError, match="unknown record"):
        validate_proposals(db, "owner", "w1", [{
            "type": "update_description", "title": "Edit", "preview": "Edit task",
            "payload": {"taskId": "another-workspace-task"},
        }])


def test_file_lifecycle_checks_type_owner_scope_and_completion(db, api, monkeypatch):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    db.commit()

    class Blob:
        size = 4
        content_type = "text/plain"

        def reload(self):
            return None

        def exists(self):
            return True

    class Bucket:
        def blob(self, name):
            return Blob()

    class Storage:
        bucket = Bucket()

        async def generate_presigned_put_url(self, object_name, **kwargs):
            return f"https://upload.invalid/{object_name}"

        async def generate_presigned_get_url(self, object_name, **kwargs):
            return f"https://download.invalid/{object_name}"

        async def delete_file(self, object_name):
            return None

    monkeypatch.setattr("routes.tasklytic.get_storage_service", lambda: Storage())
    blocked = client.post("/api/tasklytic/files:initiate", json={
        "filename": "virus.exe", "content_type": "application/octet-stream", "size": 4,
        "workspace_id": "w1", "scope": "task", "scope_id": "task1",
    })
    assert blocked.status_code == 415
    initiated = client.post("/api/tasklytic/files:initiate", json={
        "filename": "notes.txt", "content_type": "text/plain", "size": 4,
        "workspace_id": "w1", "scope": "task", "scope_id": "task1",
    })
    assert initiated.status_code == 200
    object_name = initiated.json()["object_name"]

    db.add(TasklyticWorkspaceMember(workspace_id="w1", user_id="guest", role="guest"))
    db.commit()
    identity.update({"uid": "guest", "email": "guest@example.com"})
    assert client.post("/api/tasklytic/files:complete", json={"object_name": object_name}).status_code == 403
    identity.update({"uid": "owner", "email": "owner@example.com"})
    assert client.post("/api/tasklytic/files:complete", json={"object_name": object_name}).status_code == 200
    identity.update({"uid": "guest", "email": "guest@example.com"})
    assert client.get("/api/tasklytic/files:download-url", params={"object_name": object_name}).status_code == 403
