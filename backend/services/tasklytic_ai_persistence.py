"""Persistence, validation, acceptance, and scheduling contracts for Tasklytic AI."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.tasklytic import (
    TasklyticAiAuditEvent,
    TasklyticAiMessage,
    TasklyticAiProposal,
    TasklyticAiSettings,
    TasklyticAiTeammateJob,
    TasklyticAiThread,
    TasklyticAiUsageEvent,
    TasklyticWorkspaceMember,
)
from services.tasklytic_ai_contracts import (
    DEFAULT_VERTEX_MODEL,
    PROPOSAL_TYPES,
    SUPPORTED_VERTEX_MODELS,
    select_vertex_model,
    validate_proposal_payload,
)
from services.tasklytic_service import (
    _find_record,
    authorize_record,
    get_membership,
    require_admin,
    upsert_record,
    utcnow,
)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _timestamp(value: Any, fallback: datetime | None = None) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return fallback or utcnow()
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def _clean_id(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 128:
        raise ValueError(f"{field} must be a non-empty id")
    return value.strip()


def authorize_ai_scope(db: Session, user_id: str, scope: Any) -> tuple[str, dict[str, Any]]:
    if not isinstance(scope, dict):
        raise ValueError("An AI scope is required")
    mapping = {
        "workspace": (None, "workspaceId"),
        "project": ("projects", "projectId"),
        "task": ("tasks", "taskId"),
        "goal": ("goals", "goalId"),
        "portfolio": ("portfolios", "portfolioId"),
        "dashboard": ("dashboards", "dashboardId"),
    }
    scope_type = scope.get("type")
    if scope_type not in mapping:
        raise ValueError("Unsupported AI scope")
    kind, id_field = mapping[scope_type]
    scope_id = _clean_id(scope.get(id_field), "AI scope id")
    if kind is None:
        get_membership(db, scope_id, user_id)
        return scope_id, {"id": scope_id}
    row = _find_record(db, kind, scope_id)
    if row is None or not row.workspace_id:
        raise ValueError("AI scope was not found")
    get_membership(db, row.workspace_id, user_id)
    authorize_record(db, kind, row.payload or {}, row.workspace_id, user_id)
    return row.workspace_id, dict(row.payload or {})


def get_or_create_settings(db: Session, workspace_id: str, user_id: str) -> TasklyticAiSettings:
    get_membership(db, workspace_id, user_id)
    row = db.get(TasklyticAiSettings, (workspace_id, user_id))
    if row is None:
        row = TasklyticAiSettings(workspace_id=workspace_id, user_id=user_id, model=DEFAULT_VERTEX_MODEL)
        db.add(row)
        db.flush()
    return row


def settings_payload(row: TasklyticAiSettings) -> dict[str, Any]:
    return {
        "workspaceId": row.workspace_id,
        "enabled": row.enabled,
        "paused": row.paused,
        "model": row.model,
        "models": list(SUPPORTED_VERTEX_MODELS),
        "localThreadsMigrated": row.migrated_at is not None,
        "migratedAt": _iso(row.migrated_at),
    }


def update_settings(db: Session, workspace_id: str, user_id: str, body: dict[str, Any]) -> TasklyticAiSettings:
    row = get_or_create_settings(db, workspace_id, user_id)
    if "enabled" in body:
        if not isinstance(body["enabled"], bool):
            raise ValueError("enabled must be boolean")
        row.enabled = body["enabled"]
    if "paused" in body:
        if not isinstance(body["paused"], bool):
            raise ValueError("paused must be boolean")
        row.paused = body["paused"]
    if "model" in body:
        if body["model"] not in {entry["id"] for entry in SUPPORTED_VERTEX_MODELS}:
            raise ValueError("Unsupported Vertex model")
        row.model = body["model"]
    db.flush()
    return row


def _thread_or_404(db: Session, thread_id: str, user_id: str, workspace_id: str | None = None) -> TasklyticAiThread:
    row = db.get(TasklyticAiThread, thread_id)
    if row is None:
        raise HTTPException(status_code=404, detail="AI thread not found")
    if row.user_id != user_id or (workspace_id and row.workspace_id != workspace_id):
        raise HTTPException(status_code=403, detail="AI thread access denied")
    get_membership(db, row.workspace_id, user_id)
    return row


def proposal_payload(row: TasklyticAiProposal) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "type": row.proposal_type,
        "title": row.title,
        "preview": row.preview,
        "reasoning": row.reasoning,
        "payload": row.payload,
        "status": row.status,
        "revision": row.revision,
        "acceptedResult": row.accepted_result,
        "createdAt": _iso(row.created_at),
        "updatedAt": _iso(row.updated_at),
    }


def thread_payload(db: Session, row: TasklyticAiThread) -> dict[str, Any]:
    messages = db.query(TasklyticAiMessage).filter_by(thread_id=row.id).order_by(
        TasklyticAiMessage.created_at, TasklyticAiMessage.id
    ).all()
    proposals = db.query(TasklyticAiProposal).filter_by(thread_id=row.id).all()
    by_message: dict[str, list[dict[str, Any]]] = {}
    for proposal in proposals:
        if proposal.message_id:
            by_message.setdefault(proposal.message_id, []).append(proposal_payload(proposal))
    return {
        "id": row.id,
        "workspaceId": row.workspace_id,
        "title": row.title,
        "contextScope": row.context_scope,
        "messages": [{
            "id": message.id,
            "role": message.role,
            "content": message.content,
            "reasoning": message.reasoning,
            "proposals": by_message.get(message.id, []),
            "createdAt": _iso(message.created_at),
        } for message in messages],
        "createdAt": _iso(row.created_at),
        "updatedAt": _iso(row.updated_at),
    }


def list_threads(db: Session, workspace_id: str, user_id: str) -> list[dict[str, Any]]:
    get_membership(db, workspace_id, user_id)
    rows = db.query(TasklyticAiThread).filter_by(workspace_id=workspace_id, user_id=user_id).order_by(
        TasklyticAiThread.updated_at.desc()
    ).all()
    return [thread_payload(db, row) for row in rows]


def create_thread(db: Session, workspace_id: str, user_id: str, body: dict[str, Any]) -> TasklyticAiThread:
    get_membership(db, workspace_id, user_id)
    title = str(body.get("title") or "New chat").strip()[:160]
    if not title:
        raise ValueError("AI thread title is required")
    scope = body.get("contextScope") or {"type": "workspace", "workspaceId": workspace_id}
    resolved_workspace, _ = authorize_ai_scope(db, user_id, scope)
    if resolved_workspace != workspace_id:
        raise ValueError("AI thread scope references another workspace")
    thread_id = _clean_id(body.get("id") or f"ai-{uuid.uuid4()}", "thread id")
    if db.get(TasklyticAiThread, thread_id):
        raise ValueError("AI thread id already exists")
    row = TasklyticAiThread(
        id=thread_id, workspace_id=workspace_id, user_id=user_id, title=title, context_scope=scope
    )
    db.add(row)
    db.flush()
    audit(db, workspace_id, user_id, "thread.created", "thread", thread_id)
    return row


def migrate_local_threads(
    db: Session, workspace_id: str, user_id: str, migration_key: str, threads: Any
) -> tuple[bool, list[dict[str, Any]]]:
    marker = _clean_id(migration_key, "migration key")
    settings = get_or_create_settings(db, workspace_id, user_id)
    if settings.migrated_at is not None:
        return False, list_threads(db, workspace_id, user_id)
    if not isinstance(threads, list) or len(threads) > 100:
        raise ValueError("Local AI threads must be an array of at most 100 threads")
    for raw in threads:
        if not isinstance(raw, dict) or raw.get("workspaceId") != workspace_id:
            raise ValueError("Local AI thread references another workspace")
        thread_id = _clean_id(raw.get("id"), "thread id")
        if db.get(TasklyticAiThread, thread_id):
            raise ValueError("A local AI thread id already exists on the server")
        scope = raw.get("contextScope") or {"type": "workspace", "workspaceId": workspace_id}
        resolved_workspace, _ = authorize_ai_scope(db, user_id, scope)
        if resolved_workspace != workspace_id:
            raise ValueError("Local AI thread scope references another workspace")
        messages = raw.get("messages") or []
        if not isinstance(messages, list) or len(messages) > 500:
            raise ValueError("Local AI thread has too many messages")
        updated_at = _timestamp(raw.get("updatedAt"))
        thread = TasklyticAiThread(
            id=thread_id,
            workspace_id=workspace_id,
            user_id=user_id,
            title=str(raw.get("title") or "New chat")[:160],
            context_scope=scope,
            created_at=_timestamp(raw.get("createdAt"), updated_at),
            updated_at=updated_at,
        )
        db.add(thread)
        db.flush()
        for message in messages:
            if not isinstance(message, dict) or message.get("role") not in {"user", "assistant"}:
                raise ValueError("Local AI message is invalid")
            content = message.get("content")
            if not isinstance(content, str) or not content or len(content) > 50_000:
                raise ValueError("Local AI message content is invalid")
            db.add(TasklyticAiMessage(
                id=_clean_id(message.get("id"), "message id"),
                thread_id=thread_id,
                role=message["role"],
                content=content,
                reasoning=str(message.get("reasoning"))[:50_000] if message.get("reasoning") else None,
                created_at=_timestamp(message.get("createdAt"), updated_at),
            ))
    db.flush()
    settings.migration_key = marker
    settings.migrated_at = utcnow()
    audit(db, workspace_id, user_id, "threads.migrated", "migration", marker, {"threadCount": len(threads)})
    db.flush()
    return True, list_threads(db, workspace_id, user_id)


def validate_proposal_for_workspace(
    db: Session, user_id: str, workspace_id: str, proposal: Any
) -> dict[str, Any]:
    if not isinstance(proposal, dict) or proposal.get("type") not in PROPOSAL_TYPES:
        raise ValueError("Model returned an unsupported proposal type")
    title, preview = proposal.get("title"), proposal.get("preview")
    if not isinstance(title, str) or not title.strip() or not isinstance(preview, str):
        raise ValueError("Model returned a malformed proposal")
    proposal_type = proposal["type"]
    raw_payload = proposal.get("payload")
    if not isinstance(raw_payload, dict):
        raise ValueError("AI proposal payload must be an object")
    payload = dict(raw_payload)
    if payload.get("workspaceId") and payload["workspaceId"] != workspace_id:
        raise ValueError("Model proposal references another workspace")
    refs = {
        "create_task": ("projects", payload.get("projectId")),
        "create_subtasks": ("tasks", payload.get("parentTaskId")),
        "update_description": ("tasks", payload.get("taskId")),
        "draft_status_update": ("projects", payload.get("projectId")),
        "create_rule": ("projects", payload.get("projectId")),
        "add_chart_to_dashboard": ("dashboards", payload.get("dashboardId")),
        "propose_assignees": ("tasks", payload.get("taskId")),
    }
    kind, record_id = refs.get(proposal_type, (None, None))
    if kind and record_id:
        row = _find_record(db, kind, str(record_id), workspace_id)
        if row is None:
            raise ValueError("Model proposal references an unknown record")
        authorize_record(db, kind, row.payload or {}, workspace_id, user_id)
    payload = validate_proposal_payload(proposal_type, payload)
    if proposal_type == "propose_assignees":
        for assignee_id in payload["assigneeIds"]:
            if db.get(TasklyticWorkspaceMember, (workspace_id, assignee_id)) is None:
                raise ValueError("Model proposal references an unknown assignee")
    return {**proposal, "title": title.strip()[:200], "preview": preview[:20_000], "payload": payload}


def persist_generated_exchange(
    db: Session,
    *,
    thread_id: str,
    user_id: str,
    prompt: str,
    response: dict[str, Any],
    model: str,
    usage: dict[str, int],
) -> dict[str, Any]:
    thread = _thread_or_404(db, thread_id, user_id)
    now = utcnow()
    user_message = TasklyticAiMessage(
        id=f"aim-{uuid.uuid4()}", thread_id=thread.id, role="user", content=prompt, created_at=now
    )
    assistant_message = TasklyticAiMessage(
        id=f"aim-{uuid.uuid4()}",
        thread_id=thread.id,
        role="assistant",
        content=response["text"],
        reasoning=response.get("reasoning"),
        created_at=now + timedelta(microseconds=1),
    )
    db.add_all([user_message, assistant_message])
    db.flush()
    persisted = []
    for raw in response.get("proposals") or []:
        proposal = validate_proposal_for_workspace(db, user_id, thread.workspace_id, raw)
        row = TasklyticAiProposal(
            workspace_id=thread.workspace_id,
            thread_id=thread.id,
            message_id=assistant_message.id,
            created_by=user_id,
            proposal_type=proposal["type"],
            title=proposal["title"],
            preview=proposal["preview"],
            reasoning=proposal.get("reasoning"),
            payload=proposal["payload"],
        )
        db.add(row)
        db.flush()
        persisted.append(proposal_payload(row))
    if thread.title == "New chat":
        thread.title = prompt[:48]
    thread.updated_at = now
    db.add(TasklyticAiUsageEvent(
        workspace_id=thread.workspace_id,
        user_id=user_id,
        event_type="assistant",
        model=model,
        thread_id=thread.id,
        prompt_tokens=max(0, int(usage.get("prompt_tokens") or 0)),
        output_tokens=max(0, int(usage.get("output_tokens") or 0)),
        total_tokens=max(0, int(usage.get("total_tokens") or 0)),
    ))
    audit(db, thread.workspace_id, user_id, "assistant.generated", "thread", thread.id, {"proposalCount": len(persisted), "model": model})
    db.flush()
    return {**response, "proposals": persisted, "threadId": thread.id}


def _proposal_or_404(db: Session, proposal_id: uuid.UUID, user_id: str, lock: bool = False) -> TasklyticAiProposal:
    query = db.query(TasklyticAiProposal).filter_by(id=proposal_id)
    if lock:
        query = query.with_for_update()
    row = query.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="AI proposal not found")
    get_membership(db, row.workspace_id, user_id)
    if row.created_by != user_id:
        raise HTTPException(status_code=403, detail="AI proposal access denied")
    return row


def edit_proposal(db: Session, proposal_id: uuid.UUID, user_id: str, body: dict[str, Any]) -> TasklyticAiProposal:
    row = _proposal_or_404(db, proposal_id, user_id, lock=True)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending proposals may be edited")
    candidate = {
        "type": row.proposal_type,
        "title": body.get("title", row.title),
        "preview": body.get("preview", row.preview),
        "reasoning": row.reasoning,
        "payload": body.get("payload", row.payload),
    }
    validated = validate_proposal_for_workspace(db, user_id, row.workspace_id, candidate)
    row.title, row.preview, row.payload = validated["title"], validated["preview"], validated["payload"]
    row.revision += 1
    audit(db, row.workspace_id, user_id, "proposal.edited", "proposal", str(row.id), {"revision": row.revision})
    db.flush()
    return row


def _new_entity_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4()}"


def accept_proposal(db: Session, proposal_id: uuid.UUID, user_id: str) -> TasklyticAiProposal:
    row = _proposal_or_404(db, proposal_id, user_id, lock=True)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="AI proposal has already been resolved")
    payload = validate_proposal_for_workspace(db, user_id, row.workspace_id, {
        "type": row.proposal_type, "title": row.title, "preview": row.preview, "payload": row.payload
    })["payload"]
    now = utcnow().isoformat()
    result: dict[str, Any]
    if row.proposal_type == "create_task":
        project_id = payload.get("projectId")
        task = {
            "id": payload.get("id") or _new_entity_id("task"), "workspaceId": row.workspace_id,
            "name": payload["name"], "completed": False, "resourceSubtype": "default_task",
            "projectIds": [project_id] if project_id else [], "sectionIdByProject": {},
            "assigneeId": payload.get("assigneeId"), "dueOn": payload.get("dueOn"),
            "collaboratorIds": [], "tagIds": [], "customFieldValues": {}, "attachmentIds": [],
            "dependencyIds": [], "dependentIds": [], "likedByIds": [], "createdAt": now, "modifiedAt": now,
        }
        result = upsert_record(db, "tasks", task, user_id, row.workspace_id)
    elif row.proposal_type == "create_subtasks":
        parent_row = _find_record(db, "tasks", payload["parentTaskId"], row.workspace_id)
        parent = dict(parent_row.payload or {}) if parent_row else {}
        created = []
        for name in payload["names"]:
            task = {
                "id": _new_entity_id("task"), "workspaceId": row.workspace_id, "name": name.strip(),
                "parentId": payload["parentTaskId"], "completed": False, "resourceSubtype": "default_task",
                "projectIds": list(parent.get("projectIds") or []),
                "sectionIdByProject": dict(parent.get("sectionIdByProject") or {}),
                "collaboratorIds": [], "tagIds": [], "customFieldValues": {}, "attachmentIds": [],
                "dependencyIds": [], "dependentIds": [], "likedByIds": [], "createdAt": now, "modifiedAt": now,
            }
            created.append(upsert_record(db, "tasks", task, user_id, row.workspace_id))
        result = {"tasks": created}
    elif row.proposal_type == "update_description":
        task_row = _find_record(db, "tasks", payload["taskId"], row.workspace_id)
        task = {**dict(task_row.payload or {}), "notes": payload["nextNotes"], "modifiedAt": now}
        result = upsert_record(db, "tasks", task, user_id, row.workspace_id)
    elif row.proposal_type == "draft_status_update":
        status = {
            "id": payload.get("id") or _new_entity_id("status"),
            "scope": {"type": "project", "id": payload["projectId"]},
            "status": payload["status"], "title": payload["title"], "summaryHtml": payload["summaryHtml"],
            "highlightsHtml": payload.get("highlightsHtml"), "blockersHtml": payload.get("blockersHtml"),
            "nextStepsHtml": payload.get("nextStepsHtml"), "authorId": user_id, "createdAt": now,
            "isDraft": True,
        }
        result = upsert_record(db, "statusUpdates", status, user_id, row.workspace_id)
    elif row.proposal_type == "add_custom_field":
        field = {
            **payload, "id": payload.get("id") or _new_entity_id("field"), "workspaceId": row.workspace_id,
            "createdAt": now,
        }
        result = upsert_record(db, "customFields", field, user_id, row.workspace_id)
    elif row.proposal_type == "create_rule":
        rule = {
            **payload, "id": payload.get("id") or _new_entity_id("rule"), "enabled": False,
            "conditions": payload.get("conditions") or [], "runCount": 0, "createdBy": user_id, "createdAt": now,
        }
        result = upsert_record(db, "rules", rule, user_id, row.workspace_id)
    elif row.proposal_type == "add_chart_to_dashboard":
        dashboard_row = _find_record(db, "dashboards", payload["dashboardId"], row.workspace_id)
        dashboard = dict(dashboard_row.payload or {})
        chart = {**payload["chart"], "id": payload["chart"].get("id") or _new_entity_id("chart")}
        dashboard["charts"] = [*(dashboard.get("charts") or []), chart]
        result = upsert_record(db, "dashboards", dashboard, user_id, row.workspace_id)
    elif row.proposal_type == "propose_assignees":
        task_row = _find_record(db, "tasks", payload["taskId"], row.workspace_id)
        assignee = payload.get("selectedAssigneeId") or payload["assigneeIds"][0]
        task = {**dict(task_row.payload or {}), "assigneeId": assignee, "modifiedAt": now}
        result = upsert_record(db, "tasks", task, user_id, row.workspace_id)
    else:
        result = {"summary": payload["summary"]}
    row.status = "accepted"
    row.accepted_at = utcnow()
    row.accepted_result = result
    audit(db, row.workspace_id, user_id, "proposal.accepted", "proposal", str(row.id), {"type": row.proposal_type})
    db.flush()
    return row


def discard_proposal(db: Session, proposal_id: uuid.UUID, user_id: str) -> TasklyticAiProposal:
    row = _proposal_or_404(db, proposal_id, user_id, lock=True)
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="AI proposal has already been resolved")
    row.status = "discarded"
    audit(db, row.workspace_id, user_id, "proposal.discarded", "proposal", str(row.id))
    db.flush()
    return row


def audit(
    db: Session, workspace_id: str, actor_id: str, event_type: str, subject_type: str,
    subject_id: str, details: dict[str, Any] | None = None,
) -> None:
    db.add(TasklyticAiAuditEvent(
        workspace_id=workspace_id, actor_id=actor_id, event_type=event_type,
        subject_type=subject_type, subject_id=subject_id, details=details or {},
    ))


def teammate_payload(row: TasklyticAiTeammateJob) -> dict[str, Any]:
    return {
        "id": str(row.id), "workspaceId": row.workspace_id, "teammate": row.teammate,
        "enabled": row.enabled, "scope": {"type": row.scope_type, "id": row.scope_id},
        "cadence": row.cadence, "timezone": row.timezone, "nextRunAt": _iso(row.next_run_at),
        "dailyLimit": row.daily_limit, "runsToday": row.runs_in_window, "config": row.config,
        "lastRunAt": _iso(row.last_run_at),
    }


def list_teammates(db: Session, workspace_id: str, user_id: str) -> list[dict[str, Any]]:
    get_membership(db, workspace_id, user_id)
    return [teammate_payload(row) for row in db.query(TasklyticAiTeammateJob).filter_by(
        workspace_id=workspace_id
    ).order_by(TasklyticAiTeammateJob.teammate).all()]


def upsert_teammate(db: Session, workspace_id: str, user_id: str, body: dict[str, Any]) -> TasklyticAiTeammateJob:
    require_admin(db, workspace_id, user_id)
    teammate = str(body.get("teammate") or "").lower()
    defaults = {"tria": ("event", "workspace"), "summarie": ("daily", "task"), "statura": ("weekly", "project")}
    if teammate not in defaults:
        raise ValueError("Unknown AI teammate")
    cadence = body.get("cadence") or defaults[teammate][0]
    scope = body.get("scope") or {"type": defaults[teammate][1], "id": workspace_id}
    if cadence not in {"event", "daily", "weekly"} or not isinstance(scope, dict):
        raise ValueError("AI teammate schedule is invalid")
    scope_type, scope_id = scope.get("type"), _clean_id(scope.get("id"), "AI teammate scope id")
    auth_scope = {"type": scope_type, f"{scope_type}Id": scope_id}
    if scope_type == "workspace":
        auth_scope = {"type": "workspace", "workspaceId": scope_id}
    resolved_workspace, _ = authorize_ai_scope(db, user_id, auth_scope)
    if resolved_workspace != workspace_id or scope_type not in {"workspace", "project", "task"}:
        raise ValueError("AI teammate scope references another workspace")
    daily_limit = int(body.get("dailyLimit") or 10)
    if not 1 <= daily_limit <= 100:
        raise ValueError("AI teammate daily limit must be between 1 and 100")
    try:
        job_id = uuid.UUID(str(body.get("id"))) if body.get("id") else None
    except ValueError as exc:
        raise ValueError("AI teammate job id is invalid") from exc
    row = db.get(TasklyticAiTeammateJob, job_id) if job_id else None
    if row and row.workspace_id != workspace_id:
        raise HTTPException(status_code=403, detail="AI teammate access denied")
    if row is None:
        row = db.query(TasklyticAiTeammateJob).filter_by(
            workspace_id=workspace_id, teammate=teammate, scope_type=scope_type, scope_id=scope_id
        ).one_or_none()
    next_run = _timestamp(body.get("nextRunAt"), utcnow())
    if row is None:
        row = TasklyticAiTeammateJob(
            workspace_id=workspace_id, teammate=teammate, scope_type=scope_type, scope_id=scope_id,
            cadence=cadence, timezone=str(body.get("timezone") or "UTC")[:64], next_run_at=next_run,
            daily_limit=daily_limit, config=body.get("config") or {}, created_by=user_id,
        )
        db.add(row)
    else:
        row.enabled = bool(body.get("enabled", row.enabled))
        row.cadence, row.timezone, row.next_run_at = cadence, str(body.get("timezone") or row.timezone)[:64], next_run
        row.daily_limit, row.config = daily_limit, body.get("config", row.config) or {}
    db.flush()
    audit(db, workspace_id, user_id, "teammate.configured", "teammate_job", str(row.id), {"teammate": teammate})
    return row


def audit_payload(row: TasklyticAiAuditEvent) -> dict[str, Any]:
    return {
        "id": str(row.id), "eventType": row.event_type, "actorId": row.actor_id,
        "subjectType": row.subject_type, "subjectId": row.subject_id, "details": row.details,
        "createdAt": _iso(row.created_at),
    }


def list_audit(db: Session, workspace_id: str, user_id: str) -> list[dict[str, Any]]:
    require_admin(db, workspace_id, user_id)
    return [audit_payload(row) for row in db.query(TasklyticAiAuditEvent).filter_by(
        workspace_id=workspace_id
    ).order_by(TasklyticAiAuditEvent.created_at.desc()).limit(250).all()]
