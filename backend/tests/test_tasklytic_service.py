from __future__ import annotations

import os
import asyncio
from datetime import datetime, timedelta, timezone

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
    TasklyticAiAuditEvent,
    TasklyticAiMessage,
    TasklyticAiProposal,
    TasklyticAiSettings,
    TasklyticAiTeammateJob,
    TasklyticAiThread,
    TasklyticAiUsageEvent,
    TasklyticCommand,
    TasklyticCommandRun,
    TasklyticEntityRecord,
    TasklyticFileUpload,
    TasklyticInvitation,
    TasklyticWorkspace,
    TasklyticWorkspaceEvent,
    TasklyticWorkspaceMember,
)
from services.tasklytic_service import (
    ENTITY_POLICIES,
    _find_record,
    bootstrap,
    capabilities_for_user,
    list_workspace_events,
    list_records,
    parse_revision_etag,
    provision_bundle,
    require_capability,
    replace_collection,
    upsert_record,
    upsert_workspace,
    workspace_payload,
)
from core.database import get_db
from dependencies.auth import verify_firebase_token
from routes.tasklytic import _event_cursor, router as tasklytic_router
from services.tasklytic_ai_service import build_authorized_context, validate_proposals
from services.tasklytic_ai_contracts import PROPOSAL_TYPES, SUPPORTED_VERTEX_MODEL_IDS
from services.tasklytic_ai_persistence import (
    accept_proposal,
    create_thread,
    persist_generated_exchange,
    upsert_teammate,
)
from services.tasklytic_commands import (
    claim_commands,
    enqueue_command,
    execute_claimed_command,
    execute_inline_command,
    fail_command,
    mutation_command_type,
)
from services.tasklytic_maintenance import (
    ABANDONED_UPLOAD,
    AI_TEAMMATE,
    DASHBOARD_DIGEST,
    DUE_DATE_NOTIFICATION,
    INTEGRATION_RETRY,
    MAINTENANCE_COMMAND_TYPES,
    SCHEDULED_RULE,
    enqueue_maintenance_commands,
    MAINTENANCE_HANDLERS,
    _record_ai_failure,
)
from services.tasklytic_automation import (
    AUTOMATION_RULE_RUN,
    enqueue_rule_commands_for_event,
)
from services.tasklytic_reporting import build_dashboard_snapshot, reporting_sources_payload


EXPECTED_KINDS = {
    "workspaces", "teams", "users", "projects", "sections", "tasks", "customFields",
    "comments", "activity", "attachments", "tags", "forms", "formSubmissions", "rules",
    "goals", "portfolios", "statusUpdates", "projectMessages", "notifications", "savedViews",
    "dashboards", "templates", "session", "pendingEmails", "workspaceInvitations", "timeEntries",
    "expenses", "invoices", "clients", "matters", "billingRates", "rateCards", "timesheets",
    "expenseReports", "payments", "trustTransactions", "reimbursementBatches", "billingInquiries",
    "teamJoinRequests", "bundles",
    "activityCodes", "billingBudgets", "fxQuotes", "fxRateCache", "billingAuditRecords", "billingLocks",
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
            TasklyticWorkspaceEvent.__table__,
            TasklyticAiSettings.__table__,
            TasklyticAiThread.__table__,
            TasklyticAiMessage.__table__,
            TasklyticAiProposal.__table__,
            TasklyticAiTeammateJob.__table__,
            TasklyticAiAuditEvent.__table__,
            TasklyticAiUsageEvent.__table__,
            TasklyticInvitation.__table__,
            TasklyticFileUpload.__table__,
            TasklyticCommand.__table__,
            TasklyticCommandRun.__table__,
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


def test_authenticated_routes_reject_missing_firebase_identity(db):
    app = FastAPI()
    app.include_router(tasklytic_router)

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)

    assert client.get("/api/tasklytic/bootstrap").status_code == 401
    assert client.get("/api/tasklytic/workspaces/w1/events").status_code == 401
    assert client.get("/api/tasklytic/public/forms/not-published").status_code == 404


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

    with pytest.raises(HTTPException) as exc:
        upsert_record(db, "users", {
            "id": "member", "name": "M", "email": "m@example.com", "role": "trial"
        }, "owner", "w1")
    assert exc.value.status_code == 422


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
    submission_token = definition.json()["submissionToken"]
    assert client.post(
        "/api/tasklytic/public/forms/intake/submit",
        headers={"Idempotency-Key": "missing-name"}, json={"answers": {}, "submissionToken": submission_token},
    ).status_code == 422
    first = client.post(
        "/api/tasklytic/public/forms/intake/submit",
        headers={"Idempotency-Key": "same-request"}, json={"answers": {"name": "Tax return"}, "submissionToken": submission_token},
    )
    second = client.post(
        "/api/tasklytic/public/forms/intake/submit",
        headers={"Idempotency-Key": "same-request"}, json={"answers": {"name": "Tax return"}, "submissionToken": submission_token},
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["taskId"] == second.json()["taskId"]
    assert second.json()["replayed"] is True
    assert db.query(TasklyticEntityRecord).filter_by(entity_kind="formSubmissions").count() == 1


def test_saved_search_ownership_and_workspace_pinning_are_enforced(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    db.add(TasklyticWorkspaceMember(workspace_id="w1", user_id="member", role="member"))
    upsert_record(db, "users", {"id": "member", "name": "Member", "email": "member@example.com", "role": "member"}, "owner", "w1")
    personal = {
        "id": "personal-search", "ownerScope": {"type": "search", "id": "w1"},
        "name": "My overdue", "viewType": "list", "filters": [], "hiddenFields": [],
        "ownership": "personal", "pinned": True, "createdBy": "owner",
    }
    upsert_record(db, "savedViews", personal, "owner", "w1")
    assert [row["id"] for row in list_records(db, "savedViews", "owner", "w1")] == ["personal-search"]
    assert list_records(db, "savedViews", "member", "w1") == []
    with pytest.raises(HTTPException) as exc:
        upsert_record(db, "savedViews", {**personal, "name": "Stolen"}, "member", "w1")
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        upsert_record(db, "savedViews", {**personal, "id": "workspace-search", "ownership": "workspace", "createdBy": "member"}, "member", "w1")
    assert exc.value.status_code == 403
    upsert_record(db, "savedViews", {**personal, "id": "workspace-search", "ownership": "workspace"}, "owner", "w1")
    assert [row["id"] for row in list_records(db, "savedViews", "member", "w1")] == ["workspace-search"]


def test_team_admin_can_edit_member_capacity_but_regular_member_cannot(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    for user_id in ("manager", "worker", "outsider"):
        db.add(TasklyticWorkspaceMember(workspace_id="w1", user_id=user_id, role="member"))
        upsert_record(db, "users", {"id": user_id, "name": user_id.title(), "email": f"{user_id}@example.com", "role": "member"}, "owner", "w1")
    team = _find_record(db, "teams", "team1", "w1")
    team.payload = {**team.payload, "memberIds": ["owner", "manager", "worker"], "adminIds": ["manager"]}
    worker = _find_record(db, "users", "worker", "w1").payload
    updated = upsert_record(db, "users", {**worker, "capacityHoursPerWeek": 32, "timeOff": []}, "manager", "w1")
    assert updated["capacityHoursPerWeek"] == 32
    with pytest.raises(HTTPException) as exc:
        upsert_record(db, "users", {**updated, "capacityHoursPerWeek": 20}, "outsider", "w1")
    assert exc.value.status_code == 403


def test_workspace_only_form_and_public_spam_controls(db, api):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    base_form = {
        "id": "internal-form", "projectId": "project1", "name": "Internal", "fields": [
            {"id": "kind", "type": "dropdown", "label": "Kind", "required": True, "options": [{"id": "tax", "label": "Tax"}]},
            {"id": "detail", "type": "short_text", "label": "Detail", "required": True, "visibleIf": {"fieldId": "kind", "op": "eq", "value": "tax"}},
        ], "taskTitleFieldId": "detail", "copyAnswersToDescription": False, "isPublic": True,
        "accessMode": "workspace", "publicSlug": "internal", "confirmationMessage": "Thanks", "createdAt": "2026-01-01T00:00:00Z",
    }
    upsert_record(db, "forms", base_form, "owner", "w1")
    db.commit()
    assert client.get("/api/tasklytic/public/forms/internal").status_code == 401
    assert client.get("/api/tasklytic/forms/internal/definition").status_code == 200
    submitted = client.post(
        "/api/tasklytic/forms/internal/submit", headers={"Idempotency-Key": "auth-form-1"},
        json={"answers": {"kind": "tax", "detail": "Review nexus"}},
    )
    assert submitted.status_code == 200
    submission = _find_record(db, "formSubmissions", submitted.json()["submissionId"], "w1")
    assert submission.payload["submittedBy"] == "owner"

    upsert_record(db, "forms", {**base_form, "id": "public-form", "publicSlug": "public", "accessMode": "public"}, "owner", "w1")
    db.commit()
    definition = client.get("/api/tasklytic/public/forms/public").json()
    assert client.post(
        "/api/tasklytic/public/forms/public/submit", headers={"Idempotency-Key": "bot"},
        json={"answers": {"kind": "tax", "detail": "Bot"}, "submissionToken": definition["submissionToken"], "website": "spam.example"},
    ).status_code == 422
    assert client.post(
        "/api/tasklytic/public/forms/public/submit", headers={"Idempotency-Key": "bad-token"},
        json={"answers": {"kind": "tax", "detail": "Bot"}, "submissionToken": "invalid"},
    ).status_code == 422


def test_public_form_attachment_is_completed_once_and_linked_to_task(db, api, monkeypatch):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    upsert_record(db, "forms", {
        "id": "upload-form", "projectId": "project1", "name": "Upload", "fields": [
            {"id": "name", "type": "short_text", "label": "Name", "required": True},
            {"id": "files", "type": "attachment", "label": "Files", "required": True},
        ], "taskTitleFieldId": "name", "copyAnswersToDescription": False, "isPublic": True,
        "accessMode": "public", "publicSlug": "upload", "confirmationMessage": "Thanks", "createdAt": "2026-01-01T00:00:00Z",
    }, "owner", "w1")
    db.commit()

    class Blob:
        size = 4
        content_type = "text/plain"
        def reload(self):
            return None
        def exists(self):
            return True

    class Bucket:
        def blob(self, _name):
            return Blob()

    class Storage:
        bucket = Bucket()
        async def generate_presigned_put_url(self, object_name, **_kwargs):
            return f"https://upload.invalid/{object_name}"

    monkeypatch.setattr("routes.tasklytic.get_storage_service", lambda: Storage())
    definition = client.get("/api/tasklytic/public/forms/upload").json()
    initiated = client.post("/api/tasklytic/public/forms/upload/files:initiate", json={
        "filename": "evidence.txt", "content_type": "text/plain", "size": 4,
    })
    assert initiated.status_code == 200
    signed = initiated.json()
    assert client.post("/api/tasklytic/public/files:complete", json={
        "object_name": signed["object_name"], "upload_token": signed["upload_token"],
    }).status_code == 200
    attachment = {"name": "evidence.txt", "mime": "text/plain", "size": 4, "uploadRef": signed["object_name"], "uploadToken": signed["upload_token"]}
    submitted = client.post("/api/tasklytic/public/forms/upload/submit", headers={"Idempotency-Key": "with-file"}, json={
        "answers": {"name": "Evidence", "files": [attachment]}, "submissionToken": definition["submissionToken"],
    })
    assert submitted.status_code == 200
    created_task = _find_record(db, "tasks", submitted.json()["taskId"], "w1")
    assert len(created_task.payload["attachmentIds"]) == 1
    assert client.post("/api/tasklytic/public/forms/upload/submit", headers={"Idempotency-Key": "reuse-file"}, json={
        "answers": {"name": "Reuse", "files": [attachment]}, "submissionToken": definition["submissionToken"],
    }).status_code == 409

    upsert_record(db, "forms", {
        **(_find_record(db, "forms", "upload-form", "w1").payload),
        "id": "workspace-upload", "accessMode": "workspace", "publicSlug": "workspace-upload",
    }, "owner", "w1")
    db.commit()
    workspace_upload = client.post("/api/tasklytic/forms/workspace-upload/files:initiate", json={
        "filename": "private.txt", "content_type": "text/plain", "size": 4,
    })
    assert workspace_upload.status_code == 200
    private_signed = workspace_upload.json()
    assert client.post("/api/tasklytic/public/files:complete", json={
        "object_name": private_signed["object_name"], "upload_token": private_signed["upload_token"],
    }).status_code == 200
    authenticated_attachment = {
        "name": "private.txt", "mime": "text/plain", "size": 4,
        "uploadRef": private_signed["object_name"], "uploadToken": private_signed["upload_token"],
    }
    assert client.post("/api/tasklytic/forms/workspace-upload/submit", headers={"Idempotency-Key": "workspace-file"}, json={
        "answers": {"name": "Private evidence", "files": [authenticated_attachment]},
    }).status_code == 200


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


def test_revisions_are_exposed_and_conditional_writes_return_current_record(db, api):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    db.commit()

    snapshot = client.get("/api/tasklytic/bootstrap", params={"workspace_id": "w1"}).json()
    task = snapshot["collections"]["tasks"][0]
    assert task["revision"] == 1
    assert snapshot["collections"]["workspaces"][0]["revision"] == 1
    assert all(snapshot["capabilities"].values())

    updated = {**task, "name": "Server edit"}
    missing = client.put(
        "/api/tasklytic/tasks/task1",
        params={"workspace_id": "w1"},
        json=updated,
    )
    assert missing.status_code == 428

    saved = client.put(
        "/api/tasklytic/tasks/task1",
        params={"workspace_id": "w1"},
        headers={"If-Match": '"1"'},
        json=updated,
    )
    assert saved.status_code == 200
    assert saved.headers["etag"] == '"2"'
    assert saved.json()["revision"] == 2

    stale = client.put(
        "/api/tasklytic/tasks/task1",
        params={"workspace_id": "w1"},
        headers={"If-Match": 'W/"1"'},
        json={**task, "name": "Stale edit"},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"] == {
        "code": "revision_conflict",
        "current": saved.json(),
    }
    assert client.delete(
        "/api/tasklytic/tasks/task1",
        params={"workspace_id": "w1"},
    ).status_code == 428
    assert client.delete(
        "/api/tasklytic/tasks/task1",
        params={"workspace_id": "w1"},
        headers={"If-Match": '"1"'},
    ).status_code == 409
    assert client.delete(
        "/api/tasklytic/tasks/task1",
        params={"workspace_id": "w1"},
        headers={"If-Match": '"2"'},
    ).status_code == 204


def test_workspace_events_are_durable_cursor_ordered_and_tenant_isolated(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    upsert_workspace(db, {"id": "w2", "name": "Other"}, "other")
    db.commit()
    initial = list_workspace_events(db, "w1", "owner", 0)
    cursor = initial[-1].id

    task = list_records(db, "tasks", "owner", "w1")[0]
    saved = upsert_record(
        db,
        "tasks",
        {**task, "name": "Live edit"},
        "owner",
        "w1",
        task["revision"],
    )
    db.commit()
    events = list_workspace_events(db, "w1", "owner", cursor)
    assert [(event.entity_kind, event.record_id, event.operation) for event in events] == [
        ("tasks", "task1", "updated")
    ]
    assert events[0].revision == saved["revision"]
    other_events = list_workspace_events(db, "w2", "other", cursor)
    assert all(event.workspace_id == "w2" for event in other_events)
    assert not any(event.record_id == "task1" for event in other_events)
    with pytest.raises(HTTPException) as exc:
        list_workspace_events(db, "w1", "other", 0)
    assert exc.value.status_code == 403


def test_sse_cursor_prefers_explicit_cursor_and_validates_reconnect_values():
    assert _event_cursor(None, None) == 0
    assert _event_cursor(None, "17") == 17
    assert _event_cursor(23, "17") == 23
    with pytest.raises(HTTPException) as exc:
        _event_cursor(None, "not-an-id")
    assert exc.value.status_code == 422


def test_every_action_capability_is_centralized_and_enforced(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    db.add_all([
        TasklyticWorkspaceMember(workspace_id="w1", user_id="member", role="member"),
        TasklyticWorkspaceMember(workspace_id="w1", user_id="guest", role="guest"),
    ])
    db.flush()
    upsert_record(db, "users", {
        "id": "member", "name": "Member", "email": "member@example.com", "role": "member",
        "roleFlags": {
            "canApprove": True,
            "canBill": True,
            "canRecordPayments": True,
            "canManageTrust": True,
            "canManageRates": True,
        },
    }, "owner", "w1")
    upsert_record(db, "users", {
        "id": "guest", "name": "Guest", "email": "guest@example.com", "role": "guest",
    }, "owner", "w1")

    admin = capabilities_for_user(db, "w1", "owner")
    assert set(admin) == {
        "view", "edit", "submit", "approve", "bill", "payment", "trust", "rate",
        "workspace-administration",
    }
    assert all(admin.values())
    assert capabilities_for_user(db, "w1", "member") == {
        "view": True,
        "edit": True,
        "submit": True,
        "approve": True,
        "bill": True,
        "payment": True,
        "trust": True,
        "rate": True,
        "workspace-administration": False,
    }
    guest = capabilities_for_user(db, "w1", "guest")
    assert guest == {
        "view": True,
        "edit": False,
        "submit": False,
        "approve": False,
        "bill": False,
        "payment": False,
        "trust": False,
        "rate": False,
        "workspace-administration": False,
    }
    for capability, allowed in guest.items():
        if allowed:
            require_capability(db, "w1", "guest", capability)
        else:
            with pytest.raises(HTTPException) as exc:
                require_capability(db, "w1", "guest", capability)
            assert exc.value.status_code == 403


def test_revision_etag_parser_rejects_missing_or_malformed_values():
    assert parse_revision_etag('"4"') == 4
    assert parse_revision_etag('W/"5"') == 5
    with pytest.raises(HTTPException) as exc:
        parse_revision_etag(None)
    assert exc.value.status_code == 428
    with pytest.raises(HTTPException) as exc:
        parse_revision_etag("*")
    assert exc.value.status_code == 400


def test_transactional_command_rolls_back_every_domain_write_on_failure(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    db.commit()

    def broken_operation():
        upsert_record(db, "tasks", {
            "id": "atomic-extra", "workspaceId": "w1", "name": "Must roll back",
            "projectIds": ["project1"], "sectionIdByProject": {"project1": "section1"},
        }, "owner", "w1")
        raise RuntimeError("forced rollback")

    with pytest.raises(RuntimeError, match="forced rollback"):
        execute_inline_command(
            db,
            command_type="domain.test.atomic",
            deduplication_key="atomic-1",
            payload={},
            actor_id="owner",
            workspace_id="w1",
            operation=broken_operation,
        )
    db.commit()

    assert _find_record(db, "tasks", "atomic-extra", "w1") is None
    command = db.query(TasklyticCommand).filter_by(command_type="domain.test.atomic").one()
    assert command.status == "failed"
    assert command.failure_code == "RuntimeError"
    assert db.query(TasklyticCommandRun).filter_by(command_id=command.id, status="failed").count() == 1


def test_command_deduplication_prevents_duplicate_dispatch(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    db.commit()
    first, created = enqueue_command(
        db,
        command_type="maintenance.test",
        deduplication_key="same-event",
        payload={"value": 1},
        actor_id="owner",
        workspace_id="w1",
    )
    db.commit()
    duplicate, duplicate_created = enqueue_command(
        db,
        command_type="maintenance.test",
        deduplication_key="same-event",
        payload={"value": 2},
        actor_id="owner",
        workspace_id="w1",
    )
    assert created is True
    assert duplicate_created is False
    assert duplicate.id == first.id
    assert duplicate.payload == {"value": 1}
    assert db.query(TasklyticCommand).filter_by(command_type="maintenance.test").count() == 1


@pytest.mark.parametrize(("kind", "payload", "previous", "expected"), [
    ("rules", {"id": "r1"}, None, "domain.rule.execute"),
    ("invoices", {"id": "i1", "status": "draft"}, None, "domain.invoice.execute"),
    ("payments", {"id": "p1"}, None, "domain.payment.execute"),
    ("expenseReports", {"id": "e1", "status": "approved"}, {"status": "submitted"}, "domain.approval.execute"),
    ("timesheets", {"id": "t1", "status": "locked"}, {"status": "approved"}, "domain.lock.execute"),
])
def test_sensitive_workflows_share_the_transactional_command_boundary(kind, payload, previous, expected):
    assert mutation_command_type(kind, payload, previous) == expected


def test_psa_lifecycle_endpoint_is_transactional_and_idempotent(db, api):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    upsert_record(db, "timeEntries", {
        "id": "phase8-time", "workspaceId": "w1", "userId": "owner",
        "description": "Prepare return", "hours": 2, "date": "2026-08-12",
        "billable": True, "status": "draft", "createdAt": "2026-08-12T00:00:00Z",
    }, "owner", "w1")
    db.commit()

    headers = {"Idempotency-Key": "submit-phase8-time"}
    first = client.post(
        "/api/tasklytic/psa/timeEntries/phase8-time:submit",
        headers=headers, json={"workspaceId": "w1"},
    )
    assert first.status_code == 200
    assert first.json()["record"]["status"] == "submitted"
    assert first.json()["replayed"] is False
    replay = client.post(
        "/api/tasklytic/psa/timeEntries/phase8-time:submit",
        headers=headers, json={"workspaceId": "w1"},
    )
    assert replay.status_code == 200
    assert replay.json()["record"]["status"] == "submitted"
    assert replay.json()["replayed"] is True
    commands = db.query(TasklyticCommand).filter_by(command_type="domain.psa.timeEntries.submit").all()
    assert len(commands) == 1
    assert commands[0].status == "succeeded"


def test_command_leases_exclude_concurrent_workers(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    enqueue_command(
        db,
        command_type="maintenance.test",
        deduplication_key="lease-once",
        payload={},
        actor_id="owner",
        workspace_id="w1",
    )
    db.commit()
    first = claim_commands(db, worker_id="worker-a", limit=1)
    db.commit()
    second = claim_commands(db, worker_id="worker-b", limit=1)
    assert len(first) == 1
    assert second == []
    assert first[0].lease_owner == "worker-a"
    assert first[0].attempt_count == 1


def test_retry_exhaustion_preserves_every_failure_attempt(db):
    now = datetime(2026, 8, 12, 12, tzinfo=timezone.utc)
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    enqueue_command(
        db,
        command_type="maintenance.test",
        deduplication_key="exhaust",
        payload={},
        actor_id="owner",
        workspace_id="w1",
        max_attempts=2,
        available_at=now,
    )
    db.commit()

    first = claim_commands(db, worker_id="worker", now=now)[0]
    db.commit()
    failed_once = fail_command(db, first.id, worker_id="worker", error=RuntimeError("first"), now=now)
    assert failed_once.status == "retry"
    failed_once.available_at = now
    db.commit()

    second = claim_commands(db, worker_id="worker", now=now)[0]
    db.commit()
    exhausted = fail_command(db, second.id, worker_id="worker", error=RuntimeError("second"), now=now)
    db.commit()
    assert exhausted.status == "failed"
    assert exhausted.attempt_count == exhausted.max_attempts == 2
    assert exhausted.failure_details["retryable"] is False
    assert [run.status for run in db.query(TasklyticCommandRun).filter_by(command_id=exhausted.id).order_by(TasklyticCommandRun.attempt)] == ["retry", "failed"]


def test_background_handler_failure_rolls_back_domain_writes_and_records_retry(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    enqueue_command(
        db,
        command_type="maintenance.atomic-handler",
        deduplication_key="handler-failure",
        payload={},
        actor_id="owner",
        workspace_id="w1",
        max_attempts=2,
    )
    db.commit()
    claimed = claim_commands(db, worker_id="worker")[0]
    db.commit()

    def broken_handler(session, _command):
        upsert_record(session, "tasks", {
            "id": "background-extra", "workspaceId": "w1", "name": "Must roll back",
            "projectIds": ["project1"], "sectionIdByProject": {"project1": "section1"},
        }, "owner", "w1")
        raise RuntimeError("handler failed")

    outcome = asyncio.run(execute_claimed_command(
        db,
        claimed,
        worker_id="worker",
        handlers={"maintenance.atomic-handler": broken_handler},
    ))
    db.commit()
    assert outcome.status == "retry"
    assert outcome.failure_code == "RuntimeError"
    assert _find_record(db, "tasks", "background-extra", "w1") is None
    assert db.query(TasklyticCommandRun).filter_by(command_id=outcome.id, status="retry").count() == 1


def test_every_scheduled_maintenance_category_is_idempotently_enqueued(db):
    now = datetime(2026, 8, 12, 12, tzinfo=timezone.utc)
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    task = _find_record(db, "tasks", "task1", "w1")
    task.payload = {
        **task.payload,
        "assigneeId": "owner",
        "completed": False,
        "dueOn": now.date().isoformat(),
    }
    db.add_all([
        TasklyticEntityRecord(
            entity_kind="rules", record_id="due-rule", scope_key="w:w1", workspace_id="w1",
            payload={
                "id": "due-rule", "projectId": "project1", "name": "Due rule", "enabled": True,
                "trigger": {"type": "task_due_in_days", "days": 1}, "conditions": [], "actions": [],
                "runCount": 0, "createdBy": "owner", "createdAt": now.isoformat(),
            },
        ),
        TasklyticEntityRecord(
            entity_kind="dashboards", record_id="dashboard1", scope_key="w:w1", workspace_id="w1",
            payload={
                "id": "dashboard1", "workspaceId": "w1", "name": "Daily", "ownerId": "owner", "charts": [],
                "schedule": {"frequency": "daily", "recipients": ["owner@example.com"], "nextRunAt": (now - timedelta(minutes=1)).isoformat()},
            },
        ),
        TasklyticEntityRecord(
            entity_kind="users", record_id="tria", scope_key="w:w1", workspace_id="w1",
            payload={"id": "tria", "name": "Tria", "role": "ai", "enabled": True},
        ),
        TasklyticEntityRecord(
            entity_kind="pendingEmails", record_id="email-retry", scope_key="u:owner", user_id="owner",
            payload={"id": "email-retry", "status": "failed", "attemptCount": 1, "to": "owner@example.com"},
        ),
        TasklyticFileUpload(
            object_name="tasklytic/w1/expired/file.txt", workspace_id="w1", uploader_id="owner",
            scope_type="task", scope_id="task1", filename="file.txt", mime_type="text/plain",
            size_bytes=4, expires_at=now - timedelta(hours=1),
        ),
    ])
    db.commit()

    first = enqueue_maintenance_commands(db, now=now)
    db.commit()
    second = enqueue_maintenance_commands(db, now=now)
    assert set(first) == MAINTENANCE_COMMAND_TYPES
    assert all(first[kind] == 1 for kind in (
        SCHEDULED_RULE, DUE_DATE_NOTIFICATION, DASHBOARD_DIGEST,
        AI_TEAMMATE, ABANDONED_UPLOAD, INTEGRATION_RETRY,
    ))
    assert all(value == 0 for value in second.values())


def test_command_diagnostics_are_admin_only_and_include_run_history(db, api):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    command, _ = enqueue_command(
        db,
        command_type="maintenance.test",
        deduplication_key="diagnostic",
        payload={"secret": "admin-visible"},
        actor_id="owner",
        workspace_id="w1",
    )
    claim_commands(db, worker_id="diagnostic-worker")
    db.add(TasklyticWorkspaceMember(workspace_id="w1", user_id="member", role="member"))
    db.commit()

    listed = client.get("/api/tasklytic/commands", params={"workspace_id": "w1"})
    assert listed.status_code == 200
    assert listed.json()["commands"][0]["id"] == str(command.id)
    detail = client.get(f"/api/tasklytic/commands/{command.id}")
    assert detail.status_code == 200
    assert detail.json()["payload"] == {"secret": "admin-visible"}
    assert detail.json()["runs"][0]["workerId"] == "diagnostic-worker"

    identity.update({"uid": "member", "email": "member@example.com"})
    assert client.get("/api/tasklytic/commands", params={"workspace_id": "w1"}).status_code == 403
    assert client.get(f"/api/tasklytic/commands/{command.id}").status_code == 403


def test_event_rules_are_enqueued_once_and_execute_from_the_job_pipeline(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    upsert_record(db, "rules", {
        "id": "created-rule", "projectId": "project1", "name": "Created rule", "enabled": True,
        "trigger": {"type": "task_added_to_project"}, "conditions": [],
        "actions": [{"type": "set_due_in_days", "days": 7}], "runCount": 0,
        "createdBy": "owner", "createdAt": "2026-08-12T00:00:00Z",
    }, "owner", "w1")
    upsert_record(db, "tasks", {
        "id": "event-task", "workspaceId": "w1", "name": "Event task", "completed": False,
        "projectIds": ["project1"], "sectionIdByProject": {"project1": "section1"},
        "collaboratorIds": [], "tagIds": [], "customFieldValues": {}, "attachmentIds": [],
    }, "owner", "w1")
    db.commit()

    command = db.query(TasklyticCommand).filter_by(command_type=AUTOMATION_RULE_RUN).one()
    event = db.query(TasklyticWorkspaceEvent).filter_by(entity_kind="tasks", record_id="event-task").one()
    count = db.query(TasklyticCommand).filter_by(command_type=AUTOMATION_RULE_RUN).count()
    enqueue_rule_commands_for_event(
        db, workspace_event=event, previous=None,
        current=_find_record(db, "tasks", "event-task", "w1").payload,
    )
    db.commit()
    assert db.query(TasklyticCommand).filter_by(command_type=AUTOMATION_RULE_RUN).count() == count

    claimed = claim_commands(db, worker_id="rule-worker", command_types={AUTOMATION_RULE_RUN})[0]
    db.commit()
    outcome = asyncio.run(execute_claimed_command(
        db, claimed, worker_id="rule-worker", handlers=MAINTENANCE_HANDLERS,
    ))
    db.commit()
    assert outcome.id == command.id
    assert outcome.status == "succeeded"
    assert _find_record(db, "tasks", "event-task", "w1").payload["dueOn"]
    assert _find_record(db, "rules", "created-rule", "w1").payload["runCount"] == 1
    assert db.query(TasklyticCommandRun).filter_by(command_id=command.id, status="succeeded").count() == 1


def test_dashboard_viewer_editor_and_sharing_permissions_are_distinct(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    for user_id in ("viewer", "editor", "outsider"):
        db.add(TasklyticWorkspaceMember(workspace_id="w1", user_id=user_id, role="member"))
        upsert_record(db, "users", {
            "id": user_id, "name": user_id.title(), "email": f"{user_id}@example.com", "role": "member",
        }, "owner", "w1")
    dashboard = upsert_record(db, "dashboards", {
        "id": "secure-dashboard", "workspaceId": "w1", "name": "Secure", "ownerId": "owner",
        "charts": [], "layout": [], "sharedWith": ["editor"], "editorIds": ["editor"],
        "viewerIds": ["viewer"], "visibility": "people", "createdAt": "2026-08-12T00:00:00Z",
    }, "owner", "w1")
    assert [row["id"] for row in list_records(db, "dashboards", "viewer", "w1")] == ["secure-dashboard"]
    assert list_records(db, "dashboards", "outsider", "w1") == []
    edited = upsert_record(db, "dashboards", {**dashboard, "name": "Edited"}, "editor", "w1")
    assert edited["name"] == "Edited"
    with pytest.raises(HTTPException, match="editor permission"):
        upsert_record(db, "dashboards", {**edited, "name": "Viewer edit"}, "viewer", "w1")
    with pytest.raises(HTTPException, match="owner can change sharing"):
        upsert_record(db, "dashboards", {**edited, "viewerIds": ["viewer", "outsider"]}, "editor", "w1")


def test_reporting_registry_chart_repair_and_real_digest_snapshot(db, monkeypatch):
    now = datetime(2026, 8, 12, 12, tzinfo=timezone.utc)
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    chart = {
        "id": "chart1", "title": "Tasks by owner", "type": "bar", "source": "tasks",
        "filters": [], "xField": "assigneeId", "measure": "count", "measureField": "week", "topN": 5,
    }
    dashboard = upsert_record(db, "dashboards", {
        "id": "digest-dashboard", "workspaceId": "w1", "name": "Operations", "ownerId": "owner",
        "charts": [chart], "layout": [], "sharedWith": [], "visibility": "private",
        "schedule": {"frequency": "daily", "recipients": ["owner@example.com"], "nextRunAt": (now - timedelta(minutes=1)).isoformat()},
        "createdAt": now.isoformat(),
    }, "owner", "w1")
    assert dashboard["charts"][0]["xAxis"] == "assigneeId"
    assert dashboard["charts"][0]["granularity"] == "week"
    assert dashboard["charts"][0]["measureField"] is None
    assert {source["id"] for source in reporting_sources_payload()} == {
        "tasks", "projects", "time", "expenses", "utilization", "wip",
        "invoices", "payments", "realization", "effective_rate", "ar_aging",
    }
    snapshot = build_dashboard_snapshot(db, "w1", dashboard)
    assert snapshot.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert snapshot.width == 960 and snapshot.height == 540
    assert snapshot.chart_summaries[0]["recordCount"] == 1

    delivered = {}
    def capture_email(to, subject, html_body, text_body, reply_to=None, inline_images=None):
        delivered.update({"to": to, "html": html_body, "inline": inline_images})
        return True
    monkeypatch.setattr("services.tasklytic_maintenance.email_service.send_html_email", capture_email)
    enqueue_maintenance_commands(db, now=now)
    db.query(TasklyticCommand).filter_by(command_type=DASHBOARD_DIGEST).one().available_at = now
    db.commit()
    claimed = claim_commands(db, worker_id="digest-worker", command_types={DASHBOARD_DIGEST}, now=now)[0]
    db.commit()
    outcome = asyncio.run(execute_claimed_command(
        db, claimed, worker_id="digest-worker", handlers=MAINTENANCE_HANDLERS,
    ))
    db.commit()
    refreshed = _find_record(db, "dashboards", "digest-dashboard", "w1").payload
    assert outcome.status == "succeeded"
    assert delivered["inline"][0][1].startswith(b"\x89PNG")
    assert "cid:dashboard-snapshot" in delivered["html"]
    assert refreshed["lastSnapshot"]["sha256"] == outcome.result["snapshot"]["sha256"]
    assert datetime.fromisoformat(refreshed["schedule"]["nextRunAt"]) > now


def test_rule_history_endpoint_exposes_attempts_to_project_members(db, api):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    upsert_record(db, "rules", {
        "id": "history-rule", "projectId": "project1", "name": "History", "enabled": True,
        "trigger": {"type": "task_completed"}, "conditions": [], "actions": [], "runCount": 0,
        "createdBy": "owner", "createdAt": "2026-08-12T00:00:00Z",
    }, "owner", "w1")
    command, _ = enqueue_command(
        db, command_type=AUTOMATION_RULE_RUN, deduplication_key="history-event",
        payload={"ruleId": "history-rule", "taskId": "task1", "taskName": "Kickoff"},
        actor_id="owner", workspace_id="w1",
    )
    claimed = claim_commands(db, worker_id="history-worker", command_types={AUTOMATION_RULE_RUN})[0]
    complete = asyncio.run(execute_claimed_command(
        db, claimed, worker_id="history-worker", handlers=MAINTENANCE_HANDLERS,
    ))
    db.commit()
    response = client.get("/api/tasklytic/automation/rules/history-rule/runs", params={"workspace_id": "w1"})
    assert complete.status == "succeeded"
    assert response.status_code == 200
    assert response.json()["runs"][0]["id"] == str(command.id)
    assert response.json()["runs"][0]["runs"][0]["status"] == "succeeded"


def test_phase7_local_thread_migration_is_atomic_once_and_owner_isolated(db, api):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    db.add(TasklyticWorkspaceMember(workspace_id="w1", user_id="member", role="member"))
    db.commit()

    invalid = client.post("/api/tasklytic/ai/threads:migrate", json={
        "workspaceId": "w1", "migrationId": "migration-1",
        "threads": [{"id": "local-bad", "workspaceId": "w2", "title": "Bad", "messages": []}],
    })
    assert invalid.status_code == 422
    assert client.get("/api/tasklytic/ai/settings", params={"workspace_id": "w1"}).json()["localThreadsMigrated"] is False

    local = [{
        "id": "local-thread", "workspaceId": "w1", "title": "Imported",
        "contextScope": {"type": "workspace", "workspaceId": "w1"},
        "updatedAt": "2026-08-12T12:00:00Z",
        "messages": [{
            "id": "local-message", "role": "user", "content": "Remember this",
            "createdAt": "2026-08-12T12:00:00Z",
        }],
    }]
    migrated = client.post("/api/tasklytic/ai/threads:migrate", json={
        "workspaceId": "w1", "migrationId": "migration-1", "threads": local,
    })
    repeated = client.post("/api/tasklytic/ai/threads:migrate", json={
        "workspaceId": "w1", "migrationId": "migration-1", "threads": local,
    })
    assert migrated.status_code == 200 and migrated.json()["migrated"] is True
    assert repeated.status_code == 200 and repeated.json()["migrated"] is False
    assert db.query(TasklyticAiThread).count() == 1
    assert db.query(TasklyticAiMessage).count() == 1

    identity.update({"uid": "member", "email": "member@example.com"})
    own = client.get("/api/tasklytic/ai/threads", params={"workspace_id": "w1"})
    assert own.status_code == 200 and own.json()["threads"] == []


def test_phase7_all_proposal_contracts_are_editable_permission_checked_and_accepted(db, api):
    client, identity = api
    provision_bundle(db, starter_bundle(), identity)
    dashboard = upsert_record(db, "dashboards", {
        "id": "ai-dashboard", "workspaceId": "w1", "name": "AI", "ownerId": "owner",
        "charts": [], "layout": [], "sharedWith": [], "visibility": "private", "createdAt": "2026-08-12T00:00:00Z",
    }, "owner", "w1")
    thread = create_thread(db, "w1", "owner", {
        "id": "proposal-thread", "contextScope": {"type": "workspace", "workspaceId": "w1"},
    })
    db.commit()

    def add_proposal(kind, payload):
        row = TasklyticAiProposal(
            workspace_id="w1", thread_id=thread.id, created_by="owner", proposal_type=kind,
            title=f"Proposal {kind}", preview="Review", payload=payload,
        )
        db.add(row)
        db.flush()
        return row

    proposals = {
        "create_task": {"workspaceId": "w1", "projectId": "project1", "name": "AI task"},
        "create_subtasks": {"parentTaskId": "task1", "names": ["First child", "Second child"]},
        "update_description": {"taskId": "task1", "nextNotes": "Clearer description"},
        "draft_status_update": {"projectId": "project1", "status": "on_track", "title": "Weekly", "summaryHtml": "On plan"},
        "add_custom_field": {"workspaceId": "w1", "name": "Risk", "fieldType": "text"},
        "create_rule": {"projectId": "project1", "name": "Review", "trigger": {"type": "task_completed"}, "actions": []},
        "add_chart_to_dashboard": {"dashboardId": dashboard["id"], "chart": {
            "title": "Tasks", "type": "bar", "source": "tasks", "filters": [], "xAxis": "completed", "measure": "count",
        }},
        "summarize": {"summary": "The project is on track."},
        "propose_assignees": {"taskId": "task1", "assigneeIds": ["owner"]},
    }
    assert set(proposals) == PROPOSAL_TYPES
    assert "gemini-2.5-flash" in SUPPORTED_VERTEX_MODEL_IDS
    rows = {kind: add_proposal(kind, payload) for kind, payload in proposals.items()}
    db.commit()

    edited = client.patch(f"/api/tasklytic/ai/proposals/{rows['create_task'].id}", json={
        "payload": {**proposals["create_task"], "name": "Edited AI task"},
    })
    assert edited.status_code == 200 and edited.json()["revision"] == 2
    for kind, row in rows.items():
        accepted = client.post(f"/api/tasklytic/ai/proposals/{row.id}:accept")
        assert accepted.status_code == 200, (kind, accepted.text)
        assert accepted.json()["status"] == "accepted"
    assert any(task["name"] == "Edited AI task" for task in list_records(db, "tasks", "owner", "w1"))
    assert _find_record(db, "tasks", "task1", "w1").payload["notes"] == "Clearer description"
    assert len(_find_record(db, "dashboards", "ai-dashboard", "w1").payload["charts"]) == 1
    assert db.query(TasklyticAiAuditEvent).filter_by(event_type="proposal.accepted").count() == len(PROPOSAL_TYPES)
    assert client.post(f"/api/tasklytic/ai/proposals/{rows['create_task'].id}:accept").status_code == 409

    db.add(TasklyticWorkspaceMember(workspace_id="w1", user_id="member", role="member"))
    private = add_proposal("summarize", {"summary": "Private"})
    db.commit()
    identity.update({"uid": "member", "email": "member@example.com"})
    assert client.patch(f"/api/tasklytic/ai/proposals/{private.id}", json={"payload": {"summary": "stolen"}}).status_code == 403


def test_phase7_teammate_rate_usage_audit_and_failure_notification(db):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    now = datetime(2026, 8, 12, 12, tzinfo=timezone.utc)
    job = upsert_teammate(db, "w1", "owner", {
        "teammate": "tria", "scope": {"type": "workspace", "id": "w1"}, "cadence": "daily",
        "dailyLimit": 1, "nextRunAt": now.isoformat(),
    })
    db.commit()
    first = enqueue_maintenance_commands(db, now=now)
    db.commit()
    second = enqueue_maintenance_commands(db, now=now)
    db.commit()
    assert first[AI_TEAMMATE] == 1
    assert second[AI_TEAMMATE] == 0
    assert db.query(TasklyticAiAuditEvent).filter_by(event_type="teammate.rate_limited").count() == 1

    command = db.query(TasklyticCommand).filter_by(command_type=AI_TEAMMATE).one()
    command.max_attempts = 1
    command.available_at = now
    db.commit()
    claimed = claim_commands(db, worker_id="ai-worker", command_types={AI_TEAMMATE}, now=now)[0]
    db.commit()

    def fail_handler(_db, _command):
        raise RuntimeError("Vertex unavailable")

    failed = asyncio.run(execute_claimed_command(
        db, claimed, worker_id="ai-worker", handlers={AI_TEAMMATE: fail_handler},
    ))
    db.commit()
    assert failed.status == "failed"
    _record_ai_failure(db, failed)
    db.commit()
    assert db.query(TasklyticAiAuditEvent).filter_by(event_type="teammate.failed", subject_id=str(job.id)).count() == 1
    notification = next(
        row for row in db.query(TasklyticEntityRecord).filter_by(entity_kind="notifications", user_id="owner").all()
        if (row.payload or {}).get("type") == "ai_teammate_failed"
    )
    assert notification.payload["type"] == "ai_teammate_failed"

    thread = create_thread(db, "w1", "owner", {
        "id": "usage-thread", "contextScope": {"type": "workspace", "workspaceId": "w1"},
    })
    persist_generated_exchange(
        db, thread_id=thread.id, user_id="owner", prompt="Summarize",
        response={"text": "Summary", "proposals": []}, model="gemini-2.5-flash",
        usage={"prompt_tokens": 7, "output_tokens": 5, "total_tokens": 12},
    )
    db.commit()
    usage = db.query(TasklyticAiUsageEvent).filter_by(thread_id=thread.id).one()
    assert (usage.prompt_tokens, usage.output_tokens, usage.total_tokens) == (7, 5, 12)


def test_phase7_teammate_handler_uses_scoped_context_and_advances_schedule(db, monkeypatch):
    provision_bundle(db, starter_bundle(), {"uid": "owner", "email": "owner@example.com"})
    now = datetime(2026, 8, 12, 12, tzinfo=timezone.utc)
    job = upsert_teammate(db, "w1", "owner", {
        "teammate": "statura", "scope": {"type": "project", "id": "project1"},
        "cadence": "weekly", "dailyLimit": 2, "nextRunAt": now.isoformat(),
    })
    enqueue_maintenance_commands(db, now=now)
    command = db.query(TasklyticCommand).filter_by(command_type=AI_TEAMMATE).one()
    command.available_at = now
    db.commit()
    captured = {}

    async def fake_generate(_db, user_id, prompt, history, model, scope, thread_id):
        captured.update({"userId": user_id, "prompt": prompt, "scope": scope, "threadId": thread_id})
        return {"text": "Draft ready", "proposals": []}

    monkeypatch.setattr("services.tasklytic_maintenance.generate_tasklytic_response", fake_generate)
    claimed = claim_commands(db, worker_id="statura-worker", command_types={AI_TEAMMATE}, now=now)[0]
    db.commit()
    outcome = asyncio.run(execute_claimed_command(
        db, claimed, worker_id="statura-worker", handlers=MAINTENANCE_HANDLERS,
    ))
    db.commit()
    assert outcome.status == "succeeded"
    assert captured["scope"] == {"type": "project", "projectId": "project1"}
    assert captured["threadId"].startswith("ai-job-")
    assert (job.next_run_at.replace(tzinfo=timezone.utc) if job.next_run_at.tzinfo is None else job.next_run_at) > now
    assert db.query(TasklyticAiAuditEvent).filter_by(event_type="teammate.succeeded", subject_id=str(job.id)).count() == 1
