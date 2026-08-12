from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from models.db_models import Base
from models.tasklytic import (
    TasklyticEntityRecord, TasklyticWorkspace, TasklyticWorkspaceEvent,
    TasklyticWorkspaceMember, TasklyticInvitation,
)
from services.tasklytic_psa import execute_psa_action
from services.tasklytic_service import delete_record, provision_bundle, upsert_record


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[
        TasklyticWorkspace.__table__, TasklyticWorkspaceMember.__table__,
        TasklyticEntityRecord.__table__, TasklyticWorkspaceEvent.__table__,
        TasklyticInvitation.__table__,
    ])
    session = sessionmaker(bind=engine)()
    provision_bundle(session, {
        "workspace": {"id": "w1", "name": "PSA", "memberIds": ["owner"], "adminIds": ["owner"], "createdAt": "2026-01-01T00:00:00Z"},
        "user": {"id": "owner", "name": "Owner", "email": "owner@example.com", "avatarColor": "#000", "role": "admin", "createdAt": "2026-01-01T00:00:00Z"},
        "team": {"id": "team1", "workspaceId": "w1", "name": "General", "memberIds": ["owner"], "adminIds": ["owner"], "privacy": "public"},
        "project": {"id": "p1", "workspaceId": "w1", "teamId": "team1", "name": "PSA", "privacy": "private_to_members", "memberIds": ["owner"], "ownerId": "owner"},
    }, {"uid": "owner", "email": "owner@example.com"})
    roles = {
        "member": {},
        "approver": {"canApprove": True},
        "billing": {"canBill": True},
        "unauthorized": {},
    }
    for user_id, flags in roles.items():
        session.add(TasklyticWorkspaceMember(workspace_id="w1", user_id=user_id, role="guest" if user_id == "unauthorized" else "member"))
        upsert_record(session, "users", {
            "id": user_id, "name": user_id.title(), "email": f"{user_id}@example.com",
            "avatarColor": "#123", "role": "guest" if user_id == "unauthorized" else "member",
            "roleFlags": flags, "createdAt": "2026-01-01T00:00:00Z",
        }, "owner", "w1")
    session.commit()
    yield session
    session.close()


ACTION_CASES = [
    ("timeEntries", "edit", "draft", {"patch": {"description": "Edited"}}, {"member", "approver", "billing"}),
    ("timeEntries", "duplicate", "approved", {}, {"member", "approver", "billing"}),
    ("timeEntries", "submit", "draft", {}, {"member", "approver", "billing"}),
    ("timeEntries", "approve", "submitted", {}, {"approver"}),
    ("timeEntries", "reject", "submitted", {"reason": "Fix narrative"}, {"approver"}),
    ("timeEntries", "write-off", "approved", {"reason": "Courtesy"}, {"billing"}),
    ("timesheets", "edit", "draft", {"patch": {"notes": "Edited"}}, {"member", "approver", "billing"}),
    ("timesheets", "duplicate", "approved", {}, {"member", "approver", "billing"}),
    ("timesheets", "submit", "draft", {}, {"member", "approver", "billing"}),
    ("timesheets", "approve", "submitted", {}, {"approver"}),
    ("timesheets", "reject", "submitted", {"reason": "Missing time"}, {"approver"}),
    ("timesheets", "partial-approve", "submitted", {"reason": "One item needs work"}, {"approver"}),
    ("timesheets", "lock", "approved", {}, {"billing"}),
    ("expenses", "edit", "draft", {"patch": {"description": "Edited"}}, {"member", "approver", "billing"}),
    ("expenses", "duplicate", "reimbursed", {}, {"member", "approver", "billing"}),
    ("expenses", "manual-receipt", "draft", {"receipt": {"vendor": "Taxi", "date": "2026-08-12", "subtotal": 20, "tax": 2, "total": 22, "currency": "USD"}}, {"member", "approver", "billing"}),
    ("expenses", "submit", "draft", {}, {"member", "approver", "billing"}),
    ("expenses", "approve", "submitted", {}, {"approver"}),
    ("expenses", "reject", "submitted", {"reason": "Receipt required"}, {"approver"}),
    ("expenses", "write-off", "approved", {"reason": "Nonbillable"}, {"billing"}),
    ("expenses", "reimburse", "approved", {"method": "ach", "reference": "ACH-1"}, {"billing"}),
    ("expenseReports", "edit", "draft", {"patch": {"name": "Edited"}}, {"member", "approver", "billing"}),
    ("expenseReports", "duplicate", "approved", {}, {"member", "approver", "billing"}),
    ("expenseReports", "submit", "draft", {}, {"member", "approver", "billing"}),
    ("expenseReports", "approve", "submitted", {}, {"approver"}),
    ("expenseReports", "reject", "submitted", {"reason": "Policy exception"}, {"approver"}),
    ("expenseReports", "partial-approve", "submitted", {"reason": "One item rejected"}, {"approver"}),
    ("expenseReports", "reimburse", "approved", {"method": "payroll", "reference": "PAY-1"}, {"billing"}),
]


def _payload(kind: str, record_id: str, owner_id: str, status: str) -> dict:
    common = {"id": record_id, "workspaceId": "w1", "userId": owner_id, "status": status}
    if kind == "timeEntries":
        return {**common, "description": "Work", "hours": 1, "date": "2026-08-12", "billable": True, "amount": 100, "createdAt": "2026-08-12T00:00:00Z"}
    if kind == "timesheets":
        return {**common, "periodStart": "2026-08-10", "periodEnd": "2026-08-16", "totalHours": 2, "billableHours": 2, "nonBillableHours": 0, "totalAmount": 200, "utilizationPercent": 5, "targetHours": 40}
    if kind == "expenses":
        return {**common, "description": "Taxi", "amount": 22, "totalAmount": 22, "category": "travel_ground", "date": "2026-08-12", "billable": True, "reimbursable": True, "createdAt": "2026-08-12T00:00:00Z"}
    return {**common, "name": "August", "expenseIds": [], "totalAmount": 44, "reimbursableAmount": 44, "currency": "USD"}


def _seed_case(db, kind: str, action: str, status: str, actor: str, index: int) -> tuple[str, dict]:
    record_id = f"{kind}-{action}-{actor}-{index}"
    owner_id = actor if action in {"edit", "duplicate", "submit", "manual-receipt"} else "member"
    payload = _payload(kind, record_id, owner_id, status)
    db.add(TasklyticEntityRecord(entity_kind=kind, record_id=record_id, scope_key="w:w1", workspace_id="w1", payload=payload))
    body: dict = {}
    if kind in {"timesheets", "expenseReports"}:
        child_kind, parent_field = ("timeEntries", "timesheetId") if kind == "timesheets" else ("expenses", "expenseReportId")
        child_ids = []
        for child_index in range(2):
            child_id = f"{record_id}-child-{child_index}"
            child = _payload(child_kind, child_id, owner_id, status if status in {"draft", "submitted", "approved"} else "draft")
            child[parent_field] = record_id
            db.add(TasklyticEntityRecord(entity_kind=child_kind, record_id=child_id, scope_key="w:w1", workspace_id="w1", payload=child))
            child_ids.append(child_id)
        if kind == "expenseReports": payload["expenseIds"] = child_ids
        if action == "partial-approve": body = {"approvedIds": [child_ids[0]], "rejectedIds": [child_ids[1]]}
    db.flush()
    return record_id, body


@pytest.mark.parametrize(("kind", "action", "status", "payload", "allowed_roles"), ACTION_CASES)
def test_every_psa_lifecycle_action_has_a_four_role_capability_matrix(db, kind, action, status, payload, allowed_roles):
    for index, actor in enumerate(("member", "approver", "billing", "unauthorized")):
        record_id, generated = _seed_case(db, kind, action, status, actor, index)
        body = {**generated, **payload}
        if actor in allowed_roles:
            result = execute_psa_action(db, kind=kind, record_id=record_id, action=action, body=body, actor_id=actor, workspace_id="w1")
            assert result["record"]["id"]
            if action == "partial-approve":
                assert {child["status"] for child in result["children"]} == {"approved", "rejected"}
        else:
            with pytest.raises(HTTPException) as exc:
                execute_psa_action(db, kind=kind, record_id=record_id, action=action, body=body, actor_id=actor, workspace_id="w1")
            assert exc.value.status_code == 403
        db.rollback()


@pytest.mark.parametrize("kind", ["timeEntries", "expenses"])
def test_billed_psa_records_are_immutable_but_can_be_duplicated(db, kind):
    record_id, _ = _seed_case(db, kind, "immutable", "billed", "member", 0)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        execute_psa_action(db, kind=kind, record_id=record_id, action="edit", body={"patch": {"description": "tamper"}}, actor_id="member", workspace_id="w1")
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "billed_record_immutable"
    duplicate = execute_psa_action(db, kind=kind, record_id=record_id, action="duplicate", body={}, actor_id="member", workspace_id="w1")
    assert duplicate["record"]["status"] == "draft"
    assert duplicate["record"]["id"] != record_id
    with pytest.raises(HTTPException) as delete_exc:
        delete_record(db, kind, record_id, "member", "w1", 1)
    assert delete_exc.value.detail["code"] == "billed_record_immutable"


def test_psa_reporting_sources_are_registered():
    from services.tasklytic_reporting import reporting_sources_payload
    sources = {source["id"] for source in reporting_sources_payload()}
    assert {"time", "expenses", "utilization", "wip"} <= sources


def test_self_approval_is_denied_unless_workspace_policy_enables_it(db):
    record_id, _ = _seed_case(db, "timeEntries", "approve-self", "submitted", "approver", 0)
    # Override the normal approval-test owner to make this a true self-approval.
    row = db.query(TasklyticEntityRecord).filter_by(entity_kind="timeEntries", record_id=record_id).one()
    row.payload = {**row.payload, "userId": "approver"}
    db.flush()
    with pytest.raises(HTTPException) as exc:
        execute_psa_action(db, kind="timeEntries", record_id=record_id, action="approve", body={}, actor_id="approver", workspace_id="w1")
    assert exc.value.detail["code"] == "self_approval_denied"
    workspace = db.get(TasklyticWorkspace, "w1")
    workspace.payload = {**workspace.payload, "approvalSettings": {"allowSelfApproval": True}}
    db.flush()
    approved = execute_psa_action(db, kind="timeEntries", record_id=record_id, action="approve", body={}, actor_id="approver", workspace_id="w1")
    assert approved["record"]["status"] == "approved"


def test_configured_approval_route_is_enforced_in_addition_to_capability(db):
    record_id, _ = _seed_case(db, "expenses", "approve-route", "submitted", "approver", 0)
    workspace = db.get(TasklyticWorkspace, "w1")
    workspace.payload = {**workspace.payload, "approvalSettings": {"expenseApproverIds": ["owner"]}}
    db.flush()
    with pytest.raises(HTTPException) as exc:
        execute_psa_action(db, kind="expenses", record_id=record_id, action="approve", body={}, actor_id="approver", workspace_id="w1")
    assert exc.value.detail == {"code": "approval_route_denied", "route": "expenseApproverIds"}
    workspace.payload = {**workspace.payload, "approvalSettings": {"expenseApproverIds": ["approver"]}}
    db.flush()
    result = execute_psa_action(db, kind="expenses", record_id=record_id, action="approve", body={}, actor_id="approver", workspace_id="w1")
    assert result["record"]["status"] == "approved"


def test_manual_receipt_satisfies_submission_policy_without_vertex(db):
    record_id, _ = _seed_case(db, "expenses", "receipt-policy", "draft", "member", 0)
    workspace = db.get(TasklyticWorkspace, "w1")
    workspace.payload = {**workspace.payload, "expenseReceiptRequiredAbove": 10}
    db.flush()
    with pytest.raises(HTTPException) as exc:
        execute_psa_action(db, kind="expenses", record_id=record_id, action="submit", body={}, actor_id="member", workspace_id="w1")
    assert exc.value.detail["code"] == "receipt_required"
    execute_psa_action(db, kind="expenses", record_id=record_id, action="manual-receipt", body={"receipt": {
        "vendor": "Taxi", "date": "2026-08-12", "subtotal": 20, "tax": 2, "total": 22, "currency": "USD",
    }}, actor_id="member", workspace_id="w1")
    submitted = execute_psa_action(db, kind="expenses", record_id=record_id, action="submit", body={}, actor_id="member", workspace_id="w1")
    assert submitted["record"]["status"] == "submitted"
