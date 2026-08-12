"""Tasklytic persistence, tenancy resolution and authorization policies."""

from __future__ import annotations

import copy
import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models.tasklytic import (
    TasklyticEntityRecord,
    TasklyticInvitation,
    TasklyticWorkspace,
    TasklyticWorkspaceMember,
)


MAX_JSON_BYTES = 2 * 1024 * 1024
MAX_COLLECTION_BYTES = 10 * 1024 * 1024
MAX_COLLECTION_ITEMS = 10_000
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
PRIVATE_KINDS = frozenset({"session", "notifications", "pendingEmails"})
DIRECT_WORKSPACE_KINDS = frozenset(
    {
        "teams", "projects", "tasks", "customFields", "tags", "goals", "portfolios",
        "dashboards", "timeEntries", "expenses", "invoices", "clients", "matters",
        "billingRates", "rateCards", "timesheets", "expenseReports", "payments",
        "trustTransactions", "reimbursementBatches", "billingInquiries", "teamJoinRequests",
    }
)


@dataclass(frozen=True)
class EntityPolicy:
    scope: str
    parent_kind: str | None = None
    parent_field: str | None = None


ENTITY_POLICIES: dict[str, EntityPolicy] = {
    "workspaces": EntityPolicy("membership"),
    "teams": EntityPolicy("workspace"),
    "users": EntityPolicy("workspace_parameter"),
    "projects": EntityPolicy("workspace"),
    "sections": EntityPolicy("parent", "projects", "projectId"),
    "tasks": EntityPolicy("workspace"),
    "customFields": EntityPolicy("workspace"),
    "comments": EntityPolicy("parent", "tasks", "taskId"),
    "activity": EntityPolicy("dynamic"),
    "attachments": EntityPolicy("dynamic"),
    "tags": EntityPolicy("workspace"),
    "forms": EntityPolicy("parent", "projects", "projectId"),
    "formSubmissions": EntityPolicy("parent", "forms", "formId"),
    "rules": EntityPolicy("parent", "projects", "projectId"),
    "goals": EntityPolicy("workspace"),
    "portfolios": EntityPolicy("workspace"),
    "statusUpdates": EntityPolicy("dynamic"),
    "projectMessages": EntityPolicy("parent", "projects", "projectId"),
    "notifications": EntityPolicy("private"),
    "savedViews": EntityPolicy("dynamic"),
    "dashboards": EntityPolicy("workspace"),
    "templates": EntityPolicy("workspace_parameter"),
    "session": EntityPolicy("private"),
    "pendingEmails": EntityPolicy("private"),
    "workspaceInvitations": EntityPolicy("invitations"),
    "timeEntries": EntityPolicy("workspace"),
    "expenses": EntityPolicy("workspace"),
    "invoices": EntityPolicy("workspace"),
    "clients": EntityPolicy("workspace"),
    "matters": EntityPolicy("workspace"),
    "billingRates": EntityPolicy("workspace"),
    "rateCards": EntityPolicy("workspace"),
    "timesheets": EntityPolicy("workspace"),
    "expenseReports": EntityPolicy("workspace"),
    "payments": EntityPolicy("workspace"),
    "trustTransactions": EntityPolicy("workspace"),
    "reimbursementBatches": EntityPolicy("workspace"),
    "billingInquiries": EntityPolicy("workspace"),
    "teamJoinRequests": EntityPolicy("workspace"),
}

PSA_BILLING_KINDS = frozenset(
    {"invoices", "billingRates", "rateCards", "payments", "trustTransactions", "reimbursementBatches"}
)
PRIVILEGE_USER_FIELDS = frozenset({"role", "roleFlags", "defaultHourlyRate", "timekeeperRole", "timekeeperId"})
MEMBERSHIP_PAYLOAD_FIELDS = frozenset({"memberIds", "adminIds", "guestIds"})
USER_ROLES = frozenset({"admin", "member", "guest"})


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def validate_kind(kind: str) -> EntityPolicy:
    policy = ENTITY_POLICIES.get(kind)
    if policy is None:
        raise HTTPException(status_code=404, detail="Unknown Tasklytic entity kind")
    return policy


def validate_id(value: Any, label: str = "id") -> str:
    if not isinstance(value, str) or not ID_RE.fullmatch(value):
        raise HTTPException(status_code=422, detail=f"Invalid {label}")
    return value


def validate_payload(payload: Any, *, require_id: bool = True) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Entity payload must be an object")
    try:
        encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Entity payload must be valid JSON")
    if len(encoded) > MAX_JSON_BYTES:
        raise HTTPException(status_code=413, detail="Entity payload is too large")
    if b"\\u0000" in encoded or b"\x00" in encoded:
        raise HTTPException(status_code=422, detail="Entity payload contains a NUL character")
    if require_id:
        validate_id(payload.get("id"))
    return copy.deepcopy(payload)


def get_membership(db: Session, workspace_id: str, user_id: str, *, required: bool = True) -> TasklyticWorkspaceMember | None:
    row = db.get(TasklyticWorkspaceMember, (workspace_id, user_id))
    if row is None and required:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    return row


def require_admin(db: Session, workspace_id: str, user_id: str) -> TasklyticWorkspaceMember:
    member = get_membership(db, workspace_id, user_id)
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="Workspace administrator permission required")
    return member


def workspace_payload(db: Session, row: TasklyticWorkspace) -> dict[str, Any]:
    result = copy.deepcopy(row.payload or {})
    result["id"] = row.id
    members = db.query(TasklyticWorkspaceMember).filter_by(workspace_id=row.id).all()
    result["memberIds"] = [m.user_id for m in members]
    result["adminIds"] = [m.user_id for m in members if m.role == "admin"]
    result["guestIds"] = [m.user_id for m in members if m.role == "guest"]
    return result


def list_workspaces(db: Session, user_id: str) -> list[dict[str, Any]]:
    rows = (
        db.query(TasklyticWorkspace)
        .join(TasklyticWorkspaceMember, TasklyticWorkspaceMember.workspace_id == TasklyticWorkspace.id)
        .filter(TasklyticWorkspaceMember.user_id == user_id)
        .order_by(TasklyticWorkspace.created_at, TasklyticWorkspace.id)
        .all()
    )
    return [workspace_payload(db, row) for row in rows]


def _find_record(db: Session, kind: str, record_id: str, workspace_id: str | None = None) -> TasklyticEntityRecord | None:
    query = db.query(TasklyticEntityRecord).filter_by(entity_kind=kind, record_id=record_id)
    if workspace_id:
        query = query.filter_by(workspace_id=workspace_id)
    rows = query.limit(2).all()
    if len(rows) > 1 and workspace_id is None:
        raise HTTPException(status_code=409, detail=f"Ambiguous {kind} reference")
    return rows[0] if rows else None


def _require_parent(db: Session, kind: str, record_id: Any, workspace_id: str | None) -> TasklyticEntityRecord:
    parent_id = validate_id(record_id, f"{kind} reference")
    row = _find_record(db, kind, parent_id, workspace_id)
    if row is None:
        raise HTTPException(status_code=422, detail=f"Referenced {kind} record does not exist")
    return row


def resolve_workspace_id(db: Session, kind: str, payload: dict[str, Any], requested_workspace_id: str | None) -> str | None:
    policy = validate_kind(kind)
    if policy.scope == "private":
        return None
    if policy.scope == "workspace":
        workspace_id = validate_id(payload.get("workspaceId"), "workspaceId")
    elif policy.scope == "workspace_parameter":
        workspace_id = validate_id(requested_workspace_id, "workspace_id")
    elif policy.scope == "parent":
        parent = _require_parent(db, policy.parent_kind or "", payload.get(policy.parent_field or ""), requested_workspace_id)
        workspace_id = parent.workspace_id
    elif policy.scope == "dynamic":
        parent_kind = None
        parent_id = None
        if kind == "activity":
            parent_kind, parent_id = ("tasks", payload.get("taskId")) if payload.get("taskId") else ("projects", payload.get("projectId"))
        elif kind == "attachments":
            if payload.get("taskId"):
                parent_kind, parent_id = "tasks", payload.get("taskId")
            elif payload.get("commentId"):
                parent_kind, parent_id = "comments", payload.get("commentId")
            else:
                parent_kind, parent_id = "projects", payload.get("projectId")
        elif kind in {"statusUpdates", "savedViews"}:
            scope = payload.get("scope") if kind == "statusUpdates" else payload.get("ownerScope")
            if not isinstance(scope, dict):
                raise HTTPException(status_code=422, detail="A valid scope is required")
            parent_kind = {"project": "projects", "portfolio": "portfolios", "goal": "goals"}.get(scope.get("type"))
            parent_id = scope.get("id")
        if not parent_kind:
            raise HTTPException(status_code=422, detail="A supported parent reference is required")
        workspace_id = _require_parent(db, parent_kind, parent_id, requested_workspace_id).workspace_id
    else:
        workspace_id = requested_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=422, detail="Unable to resolve workspace scope")
    if requested_workspace_id and workspace_id != requested_workspace_id:
        raise HTTPException(status_code=422, detail="Record references another workspace")
    return workspace_id


def _team_access(db: Session, workspace_id: str, team_id: str, user_id: str) -> bool:
    member = get_membership(db, workspace_id, user_id)
    if member.role == "admin":
        return True
    team = _find_record(db, "teams", team_id, workspace_id)
    if not team:
        return False
    data = team.payload or {}
    if data.get("privacy") == "public" and member.role != "guest":
        return True
    return user_id in (data.get("memberIds") or []) or user_id in (data.get("adminIds") or [])


def _project_access(db: Session, workspace_id: str, project: TasklyticEntityRecord, user_id: str) -> bool:
    member = get_membership(db, workspace_id, user_id)
    if member.role == "admin":
        return True
    data = project.payload or {}
    explicit = user_id == data.get("ownerId") or user_id in (data.get("memberIds") or [])
    team = _find_record(db, "teams", str(data.get("teamId") or ""), workspace_id)
    if team and (team.payload or {}).get("privacy") == "secret" and not _team_access(db, workspace_id, team.record_id, user_id):
        return explicit
    if member.role == "guest" or data.get("privacy") == "private_to_members":
        return explicit
    if data.get("privacy") == "public_to_team":
        return explicit or _team_access(db, workspace_id, str(data.get("teamId") or ""), user_id)
    return True


def _project_anchors(db: Session, kind: str, payload: dict[str, Any], workspace_id: str) -> list[TasklyticEntityRecord]:
    ids: list[str] = []
    if kind == "projects":
        ids = [str(payload.get("id"))]
    elif kind in {"sections", "forms", "rules", "projectMessages"}:
        ids = [str(payload.get("projectId"))]
    elif kind == "tasks":
        ids = [str(v) for v in payload.get("projectIds") or []]
    elif kind == "comments":
        task = _find_record(db, "tasks", str(payload.get("taskId")), workspace_id)
        ids = [str(v) for v in ((task.payload or {}).get("projectIds") if task else []) or []]
    elif kind == "formSubmissions":
        form = _find_record(db, "forms", str(payload.get("formId")), workspace_id)
        ids = [str((form.payload or {}).get("projectId"))] if form else []
    elif kind == "attachments":
        if payload.get("projectId"):
            ids = [str(payload["projectId"])]
        elif payload.get("taskId"):
            task = _find_record(db, "tasks", str(payload["taskId"]), workspace_id)
            ids = [str(v) for v in ((task.payload or {}).get("projectIds") if task else []) or []]
        elif payload.get("commentId"):
            comment = _find_record(db, "comments", str(payload["commentId"]), workspace_id)
            if comment:
                return _project_anchors(db, "comments", comment.payload or {}, workspace_id)
    elif kind in {"statusUpdates", "savedViews"}:
        scope = payload.get("scope") if kind == "statusUpdates" else payload.get("ownerScope")
        if isinstance(scope, dict) and scope.get("type") == "project":
            ids = [str(scope.get("id"))]
    return [row for value in ids if (row := _find_record(db, "projects", value, workspace_id))]


def authorize_record(db: Session, kind: str, payload: dict[str, Any], workspace_id: str, user_id: str) -> None:
    member = get_membership(db, workspace_id, user_id)
    if kind == "teams" and not _team_access(db, workspace_id, str(payload.get("id")), user_id):
        raise HTTPException(status_code=403, detail="Team access denied")
    projects = _project_anchors(db, kind, payload, workspace_id)
    if projects and not all(_project_access(db, workspace_id, project, user_id) for project in projects):
        raise HTTPException(status_code=403, detail="Project access denied")
    if member.role == "guest" and kind == "projects" and not projects:
        raise HTTPException(status_code=403, detail="Guest project access denied")
    if kind in {"timeEntries", "timesheets"} and member.role != "admin":
        if payload.get("userId") != user_id and not _user_flags(db, workspace_id, user_id).get("canViewAllTime"):
            raise HTTPException(status_code=403, detail="Time-entry access denied")
    if kind in {"expenses", "expenseReports", "billingInquiries"} and member.role == "guest" and payload.get("userId") != user_id:
        raise HTTPException(status_code=403, detail="PSA record access denied")
    if kind in PSA_BILLING_KINDS and member.role != "admin":
        flags = _user_flags(db, workspace_id, user_id)
        required = "canRecordPayments" if kind in {"payments", "trustTransactions"} else "canBill"
        if not flags.get(required):
            raise HTTPException(status_code=403, detail="PSA billing access denied")
    if member.role == "guest" and kind == "goals":
        if payload.get("privacy") != "public" and payload.get("ownerId") != user_id:
            raise HTTPException(status_code=403, detail="Goal access denied")
    if member.role == "guest" and kind == "dashboards":
        if payload.get("ownerId") != user_id and user_id not in (payload.get("sharedWith") or []):
            raise HTTPException(status_code=403, detail="Dashboard access denied")


def _assert_same_workspace_ref(db: Session, parent_kind: str, value: Any, workspace_id: str, *, optional: bool = True) -> None:
    if value in (None, "") and optional:
        return
    _require_parent(db, parent_kind, value, workspace_id)


def _assert_workspace_member(db: Session, value: Any, workspace_id: str, *, optional: bool = True) -> None:
    if value in (None, "") and optional:
        return
    user_id = validate_id(value, "user reference")
    if db.get(TasklyticWorkspaceMember, (workspace_id, user_id)) is None:
        raise HTTPException(status_code=422, detail="Referenced user is not a workspace member")


def validate_references(db: Session, kind: str, payload: dict[str, Any], workspace_id: str) -> None:
    if kind == "teams":
        for field in ("memberIds", "adminIds", "guestIds"):
            values = payload.get(field) or []
            if not isinstance(values, list):
                raise HTTPException(status_code=422, detail=f"team.{field} must be an array")
            for value in values:
                _assert_workspace_member(db, value, workspace_id, optional=False)
    elif kind == "projects":
        _assert_same_workspace_ref(db, "teams", payload.get("teamId"), workspace_id, optional=False)
        _assert_workspace_member(db, payload.get("ownerId"), workspace_id, optional=False)
        for value in payload.get("memberIds") or []:
            _assert_workspace_member(db, value, workspace_id, optional=False)
    elif kind == "sections":
        _assert_same_workspace_ref(db, "projects", payload.get("projectId"), workspace_id, optional=False)
    elif kind == "tasks":
        project_ids = payload.get("projectIds")
        if not isinstance(project_ids, list):
            raise HTTPException(status_code=422, detail="task.projectIds must be an array")
        for project_id in project_ids:
            _assert_same_workspace_ref(db, "projects", project_id, workspace_id, optional=False)
        _assert_same_workspace_ref(db, "tasks", payload.get("parentId"), workspace_id)
        for section_id in (payload.get("sectionIdByProject") or {}).values():
            _assert_same_workspace_ref(db, "sections", section_id, workspace_id)
        _assert_workspace_member(db, payload.get("assigneeId"), workspace_id)
        for value in payload.get("collaboratorIds") or []:
            _assert_workspace_member(db, value, workspace_id, optional=False)
    elif kind == "comments":
        _assert_same_workspace_ref(db, "tasks", payload.get("taskId"), workspace_id, optional=False)
    elif kind in {"forms", "rules", "projectMessages"}:
        _assert_same_workspace_ref(db, "projects", payload.get("projectId"), workspace_id, optional=False)
        if kind == "forms":
            _assert_workspace_member(db, payload.get("defaultAssigneeId"), workspace_id)
            _assert_same_workspace_ref(db, "sections", payload.get("defaultSectionId"), workspace_id)
    elif kind == "formSubmissions":
        _assert_same_workspace_ref(db, "forms", payload.get("formId"), workspace_id, optional=False)
        _assert_same_workspace_ref(db, "tasks", payload.get("taskId"), workspace_id)
    elif kind == "matters":
        _assert_same_workspace_ref(db, "projects", payload.get("projectId"), workspace_id, optional=False)
        _assert_same_workspace_ref(db, "clients", payload.get("clientId"), workspace_id, optional=False)
    elif kind in {"timeEntries", "expenses"}:
        _assert_same_workspace_ref(db, "projects", payload.get("projectId"), workspace_id)
        _assert_same_workspace_ref(db, "tasks", payload.get("taskId"), workspace_id)


def _user_flags(db: Session, workspace_id: str, user_id: str) -> dict[str, Any]:
    row = _find_record(db, "users", user_id, workspace_id)
    return ((row.payload or {}).get("roleFlags") or {}) if row else {}


def authorize_mutation(
    db: Session,
    kind: str,
    payload: dict[str, Any],
    workspace_id: str,
    user_id: str,
    previous: dict[str, Any] | None = None,
) -> None:
    member = get_membership(db, workspace_id, user_id)
    authorize_record(db, kind, previous or payload, workspace_id, user_id)
    mutation_projects = _project_anchors(db, kind, previous or payload, workspace_id)
    if member.role != "admin" and mutation_projects:
        for project in mutation_projects:
            project_data = project.payload or {}
            if project_data.get("ownerId") != user_id and user_id not in (project_data.get("memberIds") or []):
                raise HTTPException(status_code=403, detail="Project membership is required to modify this record")
    if kind == "projects" and previous is None and member.role != "admin":
        if payload.get("ownerId") != user_id and user_id not in (payload.get("memberIds") or []):
            raise HTTPException(status_code=403, detail="Project membership is required to create this project")
    if kind == "teams" and member.role != "admin":
        team_data = previous or payload
        if user_id not in (team_data.get("memberIds") or []) and user_id not in (team_data.get("adminIds") or []):
            raise HTTPException(status_code=403, detail="Team membership is required to modify this team")
    if kind == "users":
        target_id = str(payload.get("id"))
        changed_privileges = previous is not None and any(payload.get(k) != previous.get(k) for k in PRIVILEGE_USER_FIELDS)
        if target_id != user_id or changed_privileges:
            require_admin(db, workspace_id, user_id)
    if kind == "projects" and previous and payload.get("memberIds") != previous.get("memberIds"):
        if member.role != "admin" and previous.get("ownerId") != user_id:
            raise HTTPException(status_code=403, detail="Project membership may only be changed by an administrator or owner")
    if kind == "teams" and previous and any(payload.get(k) != previous.get(k) for k in MEMBERSHIP_PAYLOAD_FIELDS):
        team_admins = previous.get("adminIds") or []
        if member.role != "admin" and user_id not in team_admins:
            raise HTTPException(status_code=403, detail="Team membership may only be changed by an administrator")
    if kind in PSA_BILLING_KINDS and member.role != "admin":
        flags = _user_flags(db, workspace_id, user_id)
        required = "canRecordPayments" if kind in {"payments", "trustTransactions"} else "canBill"
        if not flags.get(required):
            raise HTTPException(status_code=403, detail="PSA billing permission required")
    if kind in {"timeEntries", "timesheets"} and member.role != "admin":
        owner_id = payload.get("userId")
        if owner_id != user_id and not _user_flags(db, workspace_id, user_id).get("canViewAllTime"):
            raise HTTPException(status_code=403, detail="Time-entry permission required")


def _private_owner(kind: str, payload: dict[str, Any], actor_id: str) -> str:
    if kind == "notifications":
        return validate_id(payload.get("userId"), "notification userId")
    return actor_id


def _authorize_notification_delivery(db: Session, payload: dict[str, Any], actor_id: str) -> None:
    target_id = validate_id(payload.get("userId"), "notification userId")
    if target_id == actor_id:
        return
    scope = payload.get("scope")
    if not isinstance(scope, dict):
        raise HTTPException(status_code=422, detail="Notification scope is required")
    kind = {"task": "tasks", "project": "projects", "portfolio": "portfolios", "goal": "goals", "form": "forms", "team": "teams"}.get(scope.get("type"))
    if not kind:
        raise HTTPException(status_code=422, detail="Unsupported notification scope")
    parent = _require_parent(db, kind, scope.get("id"), None)
    workspace_id = parent.workspace_id
    get_membership(db, workspace_id, actor_id)
    get_membership(db, workspace_id, target_id)
    authorize_record(db, kind, parent.payload or {}, workspace_id, actor_id)
    authorize_record(db, kind, parent.payload or {}, workspace_id, target_id)
    payload["actorId"] = actor_id


def list_invitations(db: Session, workspace_id: str, user_id: str) -> list[dict[str, Any]]:
    require_admin(db, workspace_id, user_id)
    rows = db.query(TasklyticInvitation).filter_by(workspace_id=workspace_id).order_by(TasklyticInvitation.created_at).all()
    return [invitation_payload(row) for row in rows]


def invitation_payload(row: TasklyticInvitation) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "workspaceId": row.workspace_id,
        "email": row.email,
        "role": row.role,
        "invitedById": row.invited_by_id,
        "teamId": row.team_id,
        "note": row.note,
        "status": row.status,
        "deliveryState": row.delivery_state,
        "expiresAt": row.expires_at.isoformat(),
        "createdAt": row.created_at.isoformat() if row.created_at else utcnow().isoformat(),
    }


def list_records(db: Session, kind: str, user_id: str, workspace_id: str | None = None) -> list[dict[str, Any]]:
    policy = validate_kind(kind)
    if kind == "workspaces":
        return list_workspaces(db, user_id)
    if kind == "workspaceInvitations":
        return list_invitations(db, validate_id(workspace_id, "workspace_id"), user_id)
    query = db.query(TasklyticEntityRecord).filter_by(entity_kind=kind)
    if policy.scope == "private":
        query = query.filter_by(user_id=user_id)
    else:
        workspace_id = validate_id(workspace_id, "workspace_id")
        get_membership(db, workspace_id, user_id)
        query = query.filter_by(workspace_id=workspace_id)
    result: list[dict[str, Any]] = []
    for row in query.order_by(TasklyticEntityRecord.created_at, TasklyticEntityRecord.record_id).all():
        payload = copy.deepcopy(row.payload or {})
        if policy.scope != "private":
            try:
                authorize_record(db, kind, payload, row.workspace_id, user_id)
            except HTTPException as exc:
                if exc.status_code == 403:
                    continue
                raise
        result.append(payload)
    return result


def upsert_workspace(db: Session, payload: dict[str, Any], user_id: str) -> dict[str, Any]:
    data = validate_payload(payload)
    workspace_id = data["id"]
    row = db.get(TasklyticWorkspace, workspace_id)
    if row is None:
        for field in MEMBERSHIP_PAYLOAD_FIELDS:
            data.pop(field, None)
        row = TasklyticWorkspace(id=workspace_id, payload=data)
        db.add(row)
        db.flush()
        db.add(TasklyticWorkspaceMember(workspace_id=workspace_id, user_id=user_id, role="admin"))
    else:
        require_admin(db, workspace_id, user_id)
        if any(field in data for field in MEMBERSHIP_PAYLOAD_FIELDS):
            member_ids = data.get("memberIds")
            admin_ids = data.get("adminIds")
            guest_ids = data.get("guestIds") or []
            if not isinstance(member_ids, list) or not isinstance(admin_ids, list) or not isinstance(guest_ids, list):
                raise HTTPException(status_code=422, detail="Workspace membership fields must be arrays")
            members = {validate_id(value, "member id") for value in member_ids}
            admins = {validate_id(value, "admin id") for value in admin_ids}
            guests = {validate_id(value, "guest id") for value in guest_ids}
            members |= admins | guests
            if not admins or not admins <= members or guests & admins:
                raise HTTPException(status_code=422, detail="Workspace must retain an administrator and roles may not overlap")
            existing_members = {m.user_id: m for m in db.query(TasklyticWorkspaceMember).filter_by(workspace_id=workspace_id).all()}
            for member_id in members:
                role = "admin" if member_id in admins else "guest" if member_id in guests else "member"
                membership = existing_members.pop(member_id, None)
                if membership is None:
                    db.add(TasklyticWorkspaceMember(workspace_id=workspace_id, user_id=member_id, role=role))
                else:
                    membership.role = role
            for membership in existing_members.values():
                db.delete(membership)
        for field in MEMBERSHIP_PAYLOAD_FIELDS:
            data.pop(field, None)
        row.payload = data
        row.revision += 1
    db.flush()
    return workspace_payload(db, row)


def upsert_record(
    db: Session,
    kind: str,
    payload: dict[str, Any],
    user_id: str,
    workspace_id: str | None,
) -> dict[str, Any]:
    validate_kind(kind)
    if kind in {"workspaces", "workspaceInvitations"}:
        if kind == "workspaces":
            return upsert_workspace(db, payload, user_id)
        raise HTTPException(status_code=405, detail="Use the invitation endpoints")
    data = validate_payload(payload, require_id=kind != "session")
    record_id = validate_id(data.get("id") or "session")
    if kind == "users" and data.get("role") not in USER_ROLES:
        raise HTTPException(status_code=422, detail="User role must be admin, member, or guest")
    if kind == "session":
        data["currentUserId"] = user_id
    if kind == "notifications":
        _authorize_notification_delivery(db, data, user_id)
    resolved_workspace_id = resolve_workspace_id(db, kind, data, workspace_id)
    owner_id = _private_owner(kind, data, user_id) if kind in PRIVATE_KINDS else None
    if resolved_workspace_id:
        actor_membership = get_membership(db, resolved_workspace_id, user_id)
        existing = _find_record(db, kind, record_id, resolved_workspace_id)
        if kind == "users" and existing is None and record_id == user_id and actor_membership.role != "admin":
            for field in PRIVILEGE_USER_FIELDS:
                data.pop(field, None)
            data["role"] = actor_membership.role
        authorize_mutation(db, kind, data, resolved_workspace_id, user_id, (existing.payload if existing else None))
        validate_references(db, kind, data, resolved_workspace_id)
        scope_key = f"w:{resolved_workspace_id}"
    else:
        existing = (
            db.query(TasklyticEntityRecord)
            .filter_by(entity_kind=kind, record_id=record_id, user_id=owner_id)
            .one_or_none()
        )
        scope_key = f"u:{owner_id}"
    if existing is None:
        existing = TasklyticEntityRecord(
            entity_kind=kind,
            record_id=record_id,
            scope_key=scope_key,
            workspace_id=resolved_workspace_id,
            user_id=owner_id,
            payload=data,
        )
        db.add(existing)
    else:
        existing.payload = data
        existing.revision += 1
    db.flush()
    return copy.deepcopy(data)


def replace_collection(
    db: Session,
    kind: str,
    items: Any,
    user_id: str,
    workspace_id: str | None,
) -> list[dict[str, Any]]:
    validate_kind(kind)
    if not isinstance(items, list) or len(items) > MAX_COLLECTION_ITEMS:
        raise HTTPException(status_code=422, detail="Collection payload must be an array of at most 10,000 items")
    try:
        if len(json.dumps(items, separators=(",", ":"), ensure_ascii=False).encode("utf-8")) > MAX_COLLECTION_BYTES:
            raise HTTPException(status_code=413, detail="Collection payload is too large")
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Collection payload must be valid JSON")
    if kind == "workspaceInvitations":
        raise HTTPException(status_code=405, detail="Use the invitation endpoints")
    if kind == "workspaces":
        rows = [upsert_workspace(db, item, user_id) for item in items]
        retained = {row["id"] for row in rows}
        owned = db.query(TasklyticWorkspaceMember).filter_by(user_id=user_id, role="admin").all()
        for membership in owned:
            if membership.workspace_id not in retained:
                workspace = db.get(TasklyticWorkspace, membership.workspace_id)
                if workspace:
                    db.delete(workspace)
        db.flush()
        return rows
    validated = [validate_payload(item, require_id=kind != "session") for item in items]
    ids = [str(item.get("id") or "session") for item in validated]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail="Collection contains duplicate ids")
    # Validate and upsert first.  The surrounding request transaction makes the
    # subsequent removal atomic with all reference/permission checks.
    rows = [upsert_record(db, kind, item, user_id, workspace_id) for item in validated]
    query = db.query(TasklyticEntityRecord).filter_by(entity_kind=kind)
    if kind in PRIVATE_KINDS:
        query = query.filter_by(user_id=user_id)
    else:
        workspace_id = validate_id(workspace_id, "workspace_id")
        get_membership(db, workspace_id, user_id)
        query = query.filter_by(workspace_id=workspace_id)
    if ids:
        query.filter(~TasklyticEntityRecord.record_id.in_(ids)).delete(synchronize_session=False)
    else:
        query.delete(synchronize_session=False)
    db.flush()
    return rows


def delete_record(db: Session, kind: str, record_id: str, user_id: str, workspace_id: str | None) -> None:
    validate_kind(kind)
    record_id = validate_id(record_id)
    if kind == "workspaces":
        row = db.get(TasklyticWorkspace, record_id)
        if row is None:
            return
        require_admin(db, record_id, user_id)
        db.delete(row)
        db.flush()
        return
    if kind == "workspaceInvitations":
        raise HTTPException(status_code=405, detail="Use the invitation revoke endpoint")
    if kind in PRIVATE_KINDS:
        row = db.query(TasklyticEntityRecord).filter_by(entity_kind=kind, record_id=record_id, user_id=user_id).one_or_none()
    else:
        workspace_id = validate_id(workspace_id, "workspace_id")
        get_membership(db, workspace_id, user_id)
        row = _find_record(db, kind, record_id, workspace_id)
        if row:
            authorize_mutation(db, kind, row.payload or {}, workspace_id, user_id, row.payload or {})
    if row:
        db.delete(row)
        db.flush()


def bootstrap(db: Session, user_id: str, workspace_id: str | None) -> dict[str, Any]:
    collections: dict[str, list[dict[str, Any]]] = {
        "workspaces": list_workspaces(db, user_id),
        "session": list_records(db, "session", user_id),
        "notifications": list_records(db, "notifications", user_id),
        "pendingEmails": list_records(db, "pendingEmails", user_id),
    }
    if workspace_id:
        workspace_id = validate_id(workspace_id, "workspace_id")
        membership = get_membership(db, workspace_id, user_id)
        for kind, policy in ENTITY_POLICIES.items():
            if kind not in collections and kind != "workspaces" and policy.scope != "private":
                if kind == "workspaceInvitations" and membership.role != "admin":
                    collections[kind] = []
                    continue
                collections[kind] = list_records(db, kind, user_id, workspace_id)
    return {"workspaceId": workspace_id, "collections": collections, "generatedAt": utcnow().isoformat()}


def provision_bundle(db: Session, bundle: Any, token: dict[str, Any]) -> dict[str, Any]:
    user_id = token["uid"]
    existing = db.query(TasklyticWorkspaceMember).filter_by(user_id=user_id).order_by(TasklyticWorkspaceMember.created_at).first()
    if existing:
        return {"workspace": workspace_payload(db, db.get(TasklyticWorkspace, existing.workspace_id)), "bootstrap": bootstrap(db, user_id, existing.workspace_id), "created": False}
    if not isinstance(bundle, dict) or not isinstance(bundle.get("workspace"), dict):
        raise HTTPException(status_code=422, detail="A starter-content bundle is required")
    workspace = validate_payload(bundle["workspace"])
    workspace_id = workspace["id"]
    for field in MEMBERSHIP_PAYLOAD_FIELDS:
        workspace.pop(field, None)
    db.add(TasklyticWorkspace(id=workspace_id, payload=workspace))
    db.flush()
    db.add(TasklyticWorkspaceMember(workspace_id=workspace_id, user_id=user_id, role="admin"))
    db.flush()
    ordered: list[tuple[str, Iterable[dict[str, Any]]]] = [
        ("users", [bundle.get("user")]), ("teams", [bundle.get("team")]),
        ("projects", [bundle.get("project")]), ("sections", bundle.get("sections") or []),
        ("tasks", bundle.get("tasks") or []), ("notifications", [bundle.get("notification")]),
        ("goals", [bundle.get("goal")]), ("portfolios", [bundle.get("portfolio")]),
    ]
    for kind, values in ordered:
        for value in values:
            if not isinstance(value, dict):
                continue
            item = copy.deepcopy(value)
            if kind == "users":
                item["id"] = user_id
                item["email"] = token.get("email") or item.get("email") or ""
                item["role"] = "admin"
            if kind == "notifications":
                item["userId"] = user_id
            upsert_record(db, kind, item, user_id, workspace_id)
    db.flush()
    return {"workspace": workspace_payload(db, db.get(TasklyticWorkspace, workspace_id)), "bootstrap": bootstrap(db, user_id, workspace_id), "created": True}


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def clear_user_data(db: Session, user_id: str) -> None:
    db.query(TasklyticEntityRecord).filter_by(user_id=user_id).delete(synchronize_session=False)
    owned_ids = [
        row.workspace_id
        for row in db.query(TasklyticWorkspaceMember).filter_by(user_id=user_id, role="admin").all()
        if db.query(TasklyticWorkspaceMember).filter_by(workspace_id=row.workspace_id).count() == 1
    ]
    if owned_ids:
        db.query(TasklyticWorkspace).filter(TasklyticWorkspace.id.in_(owned_ids)).delete(synchronize_session=False)
    db.flush()
