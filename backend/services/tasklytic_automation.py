"""Server-authoritative Tasklytic rule events and execution.

Task and form mutations enqueue one durable command per matching rule.  The
command uniqueness constraint is the replay boundary; immutable command-run
rows retain every retry and terminal failure for the history UI.
"""

from __future__ import annotations

import re
import uuid
from datetime import timedelta
from typing import Any

from models.tasklytic import (
    TasklyticCommand,
    TasklyticEntityRecord,
    TasklyticWorkspaceEvent,
    TasklyticWorkspaceMember,
)
from services.email_service import email_service
from services.tasklytic_commands import enqueue_command
from services.tasklytic_service import _find_record, upsert_record, utcnow


AUTOMATION_RULE_RUN = "maintenance.rule_run"
ASSIGNEE_USER_ID = "__assignee__"
ROUND_ROBIN_USER_ID = "__round_robin__"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _workspace_actor(db, workspace_id: str, preferred: str | None) -> str:
    if preferred and db.get(TasklyticWorkspaceMember, (workspace_id, preferred)):
        return preferred
    member = (
        db.query(TasklyticWorkspaceMember)
        .filter_by(workspace_id=workspace_id, role="admin")
        .order_by(TasklyticWorkspaceMember.created_at)
        .first()
    )
    if member is None:
        raise RuntimeError(f"Workspace {workspace_id} has no administrator")
    return member.user_id


def _task_events(
    operation: str,
    previous: dict[str, Any] | None,
    current: dict[str, Any],
) -> list[dict[str, Any]]:
    previous = previous or {}
    events: list[dict[str, Any]] = []
    before_projects = set(previous.get("projectIds") or [])
    after_projects = set(current.get("projectIds") or [])
    for project_id in sorted(after_projects - before_projects):
        events.append({"type": "task_added_to_project", "projectId": project_id})
    if operation == "created" and not before_projects:
        # The difference above already includes every initial project.
        pass
    if operation == "updated" and current.get("completed") is True and previous.get("completed") is not True:
        events.append({"type": "task_completed"})
    before_sections = previous.get("sectionIdByProject") or {}
    after_sections = current.get("sectionIdByProject") or {}
    for project_id in sorted(after_projects) if operation == "updated" else []:
        section_id = after_sections.get(project_id)
        if section_id and section_id != before_sections.get(project_id):
            events.append({
                "type": "task_moved_to_section",
                "projectId": project_id,
                "sectionId": section_id,
            })
    before_fields = previous.get("customFieldValues") or {}
    after_fields = current.get("customFieldValues") or {}
    for field_id in sorted(set(before_fields) | set(after_fields)) if operation == "updated" else []:
        if before_fields.get(field_id) == after_fields.get(field_id):
            continue
        wrapped = after_fields.get(field_id)
        value = wrapped.get("value") if isinstance(wrapped, dict) else None
        events.append({
            "type": "custom_field_changed",
            "customFieldId": field_id,
            "toValue": value,
        })
    return events


def _rule_trigger_matches(rule: dict[str, Any], event: dict[str, Any]) -> bool:
    trigger = rule.get("trigger") or {}
    trigger_type = trigger.get("type")
    if trigger_type != event.get("type"):
        return False
    if trigger_type == "task_added_to_project":
        return rule.get("projectId") == event.get("projectId")
    if trigger_type == "task_moved_to_section":
        return (
            rule.get("projectId") == event.get("projectId")
            and trigger.get("sectionId") == event.get("sectionId")
        )
    if trigger_type == "custom_field_changed":
        return (
            trigger.get("customFieldId") == event.get("customFieldId")
            and ("toValue" not in trigger or trigger.get("toValue") == event.get("toValue"))
        )
    if trigger_type == "form_submitted":
        return trigger.get("formId") == event.get("formId")
    return trigger_type == "task_completed"


def enqueue_rule_commands_for_event(
    db,
    *,
    workspace_event: TasklyticWorkspaceEvent,
    previous: dict[str, Any] | None,
    current: dict[str, Any],
) -> int:
    """Translate a persisted workspace event into replay-protected rule jobs."""

    if workspace_event.entity_kind == "tasks":
        task_id = workspace_event.record_id
        events = _task_events(workspace_event.operation, previous, current)
    elif workspace_event.entity_kind == "formSubmissions":
        task_id = str(current.get("taskId") or "")
        events = [{"type": "form_submitted", "formId": current.get("formId")}]
    else:
        return 0
    if not task_id:
        return 0

    created = 0
    rows = (
        db.query(TasklyticEntityRecord)
        .filter_by(entity_kind="rules", workspace_id=workspace_event.workspace_id)
        .all()
    )
    for event_index, event in enumerate(events):
        for row in rows:
            rule = row.payload or {}
            if not rule.get("enabled") or not _rule_trigger_matches(rule, event):
                continue
            actor_id = _workspace_actor(db, workspace_event.workspace_id, rule.get("createdBy"))
            _, was_created = enqueue_command(
                db,
                command_type=AUTOMATION_RULE_RUN,
                deduplication_key=(
                    f"workspace-event:{workspace_event.id}:rule:{row.record_id}:event:{event_index}"
                ),
                payload={
                    "ruleId": row.record_id,
                    "taskId": task_id,
                    "taskName": current.get("name"),
                    "event": event,
                    "workspaceEventId": workspace_event.id,
                },
                actor_id=actor_id,
                workspace_id=workspace_event.workspace_id,
            )
            created += int(was_created)
    return created


def _task_field(task: dict[str, Any], project_id: str, field: str) -> Any:
    if field.startswith("customField:"):
        value = (task.get("customFieldValues") or {}).get(field.split(":", 1)[1])
        return value.get("value") if isinstance(value, dict) else None
    if field in {"assignee", "assigneeId"}:
        return task.get("assigneeId")
    if field == "sectionId":
        return (task.get("sectionIdByProject") or {}).get(project_id)
    if field == "projectId":
        return project_id
    return task.get(field)


def _condition_matches(task: dict[str, Any], project_id: str, condition: dict[str, Any]) -> bool:
    raw = _task_field(task, project_id, str(condition.get("field") or ""))
    expected, op = condition.get("value"), condition.get("op")
    try:
        return bool(
            (op == "eq" and raw == expected)
            or (op == "neq" and raw != expected)
            or (op == "gt" and float(raw) > float(expected))
            or (op == "lt" and float(raw) < float(expected))
            or (op == "in" and isinstance(expected, list) and raw in expected)
        )
    except (TypeError, ValueError):
        return False


def _interpolate(template: Any, task: dict[str, Any], assignee_name: str = "") -> str:
    today = utcnow().date()
    text = str(template or "")
    text = text.replace("{{taskName}}", str(task.get("name") or "Task"))
    text = text.replace("{{assigneeName}}", assignee_name)
    text = text.replace("{{today}}", today.isoformat())
    text = text.replace("{{dueDate}}", str(task.get("dueOn") or ""))
    return re.sub(
        r"\{\{dueIn:(\d+)\}\}",
        lambda match: (today + timedelta(days=min(int(match.group(1)), 3650))).isoformat(),
        text,
    )


def _resolve_assignee_name(db, workspace_id: str, task: dict[str, Any]) -> str:
    user = _find_record(db, "users", str(task.get("assigneeId") or ""), workspace_id)
    return str((user.payload or {}).get("name") or "") if user else ""


def _resolve_email_recipient(db, workspace_id: str, task: dict[str, Any], action: dict[str, Any]) -> str:
    raw = action.get("email") or action.get("recipient") or action.get("userId")
    if raw in {ASSIGNEE_USER_ID, "assignee"}:
        raw = task.get("assigneeId")
    if isinstance(raw, str) and EMAIL_RE.fullmatch(raw):
        return raw
    user = _find_record(db, "users", str(raw or ""), workspace_id)
    email = str((user.payload or {}).get("email") or "") if user else ""
    if not EMAIL_RE.fullmatch(email):
        raise RuntimeError("Rule email action has no valid recipient")
    return email


def execute_rule_command(db, command: TasklyticCommand) -> dict[str, Any]:
    """Execute one rule command. Database writes are rolled back on retry."""

    rule_row = _find_record(db, "rules", str(command.payload.get("ruleId")), command.workspace_id, lock=True)
    task_row = _find_record(db, "tasks", str(command.payload.get("taskId")), command.workspace_id, lock=True)
    if rule_row is None or task_row is None:
        return {"skipped": "rule_or_task_missing"}
    rule, task = dict(rule_row.payload or {}), dict(task_row.payload or {})
    project_id = str(rule.get("projectId") or "")
    if not rule.get("enabled"):
        return {"skipped": "rule_disabled", "ruleId": rule_row.record_id, "taskId": task_row.record_id}
    if (command.payload.get("event") or {}).get("type") == "task_due_in_days" and task.get("completed"):
        return {"skipped": "task_completed", "ruleId": rule_row.record_id, "taskId": task_row.record_id}
    if project_id not in (task.get("projectIds") or []):
        return {"skipped": "task_outside_project", "ruleId": rule_row.record_id, "taskId": task_row.record_id}
    if not all(_condition_matches(task, project_id, item) for item in rule.get("conditions") or []):
        return {"skipped": "conditions_not_met", "ruleId": rule_row.record_id, "taskId": task_row.record_id}

    now_text = utcnow().isoformat()
    applied: list[str] = []
    pending_emails: list[tuple[str, str, str, str]] = []
    for action_index, action in enumerate(rule.get("actions") or []):
        action_type = action.get("type")
        if action_type == "assign_to":
            user_id = action.get("userId")
            if user_id == ROUND_ROBIN_USER_ID:
                project = _find_record(db, "projects", project_id, command.workspace_id)
                members = list((project.payload or {}).get("memberIds") or []) if project else []
                user_id = members[int(rule.get("runCount") or 0) % len(members)] if members else None
            if user_id:
                task["assigneeId"] = user_id
                applied.append(f"assign_to:{user_id}")
        elif action_type == "move_to_section":
            task.setdefault("sectionIdByProject", {})[project_id] = action.get("sectionId")
            applied.append(f"move_to_section:{action.get('sectionId')}")
        elif action_type == "set_due_in_days":
            days = max(0, min(int(action.get("days") or 0), 3650))
            task["dueOn"] = (utcnow() + timedelta(days=days)).date().isoformat()
            applied.append(f"set_due_in_days:{days}")
        elif action_type == "set_custom_field":
            field_id = str(action.get("customFieldId") or "")
            existing_value = (task.get("customFieldValues") or {}).get(field_id)
            field = _find_record(db, "customFields", field_id, command.workspace_id)
            value_type = (
                existing_value.get("type") if isinstance(existing_value, dict)
                else (field.payload or {}).get("type") if field else "text"
            )
            raw_value = action.get("value")
            if value_type == "number":
                raw_value = float(raw_value)
            elif value_type == "checkbox":
                raw_value = bool(raw_value)
            task.setdefault("customFieldValues", {})[field_id] = {
                "type": value_type, "value": raw_value,
            }
            applied.append(f"set_custom_field:{field_id}")
        elif action_type == "add_collaborator":
            user_id = action.get("userId")
            task["collaboratorIds"] = list(dict.fromkeys((task.get("collaboratorIds") or []) + [user_id]))
            applied.append(f"add_collaborator:{user_id}")
        elif action_type == "add_to_project":
            additional_id = str(action.get("projectId") or "")
            additional = _find_record(db, "projects", additional_id, command.workspace_id)
            if additional and additional_id not in (task.get("projectIds") or []):
                task.setdefault("projectIds", []).append(additional_id)
                first_section = ((additional.payload or {}).get("sectionIds") or [None])[0]
                task.setdefault("sectionIdByProject", {})[additional_id] = first_section
            applied.append(f"add_to_project:{additional_id}")
        elif action_type == "send_notification":
            recipient = task.get("assigneeId") if action.get("userId") == ASSIGNEE_USER_ID else action.get("userId")
            if recipient:
                notification_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:{command.id}:notification:{action_index}:{recipient}"))
                upsert_record(db, "notifications", {
                    "id": notification_id,
                    "userId": recipient,
                    "actorId": command.actor_id,
                    "type": "rule_action",
                    "scope": {"type": "task", "id": task_row.record_id},
                    "message": _interpolate(action.get("message") or "Rule action", task, _resolve_assignee_name(db, command.workspace_id, task)),
                    "unread": True,
                    "archived": False,
                    "metadata": {"ruleId": rule_row.record_id, "commandId": str(command.id)},
                    "createdAt": now_text,
                }, command.actor_id, None, suppress_automation=True)
                applied.append(f"send_notification:{recipient}")
        elif action_type == "create_subtask":
            subtask_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:{command.id}:subtask:{action_index}"))
            assignee_name = _resolve_assignee_name(db, command.workspace_id, task)
            upsert_record(db, "tasks", {
                **task,
                "id": subtask_id,
                "name": _interpolate(action.get("templateName") or "Follow up", task, assignee_name),
                "parentId": task_row.record_id,
                "completed": False,
                "completedAt": None,
                "completedById": None,
                "attachmentIds": [],
                "dependencyIds": [],
                "dependentIds": [],
                "likedByIds": [],
                "createdAt": now_text,
                "modifiedAt": now_text,
            }, command.actor_id, command.workspace_id, suppress_automation=True)
            applied.append(f"create_subtask:{subtask_id}")
        elif action_type == "send_email":
            assignee_name = _resolve_assignee_name(db, command.workspace_id, task)
            recipient = _resolve_email_recipient(db, command.workspace_id, task, action)
            subject = _interpolate(action.get("subject") or "Task update", task, assignee_name)
            body = _interpolate(action.get("body") or action.get("bodyText") or "", task, assignee_name)
            pending_emails.append((recipient, subject, body.replace("\n", "<br/>"), body))
            applied.append(f"send_email:{recipient}")
        else:
            raise RuntimeError(f"Unsupported rule action: {action_type}")

    task["modifiedAt"] = now_text
    upsert_record(db, "tasks", task, command.actor_id, command.workspace_id, suppress_automation=True)
    rule["runCount"] = int(rule.get("runCount") or 0) + 1
    rule["lastRunAt"] = now_text
    upsert_record(db, "rules", rule, command.actor_id, command.workspace_id, suppress_automation=True)
    for recipient, subject, html_body, text_body in pending_emails:
        if not email_service.send_html_email(recipient, subject[:998], html_body, text_body):
            raise RuntimeError(f"Rule email delivery failed for {recipient}")
    return {
        "ruleId": rule_row.record_id,
        "taskId": task_row.record_id,
        "taskName": task.get("name"),
        "actionsApplied": applied,
        "event": command.payload.get("event"),
    }
