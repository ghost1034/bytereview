"""Leased, idempotent Tasklytic maintenance runner."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from core.database import db_config
from models.tasklytic import (
    TasklyticAiAuditEvent,
    TasklyticAiTeammateJob,
    TasklyticAiUsageEvent,
    TasklyticCommand,
    TasklyticEntityRecord,
    TasklyticFileUpload,
    TasklyticWorkspaceMember,
)
from services.email_service import email_service
from services.gcs_service import get_storage_service
from services.tasklytic_commands import (
    claim_commands,
    enqueue_command,
    execute_claimed_command,
)
from services.tasklytic_automation import AUTOMATION_RULE_RUN, execute_rule_command
from services.tasklytic_ai_persistence import create_thread
from services.tasklytic_ai_service import generate_tasklytic_response
from services.tasklytic_reporting import build_dashboard_snapshot, next_dashboard_run
from services.tasklytic_service import _find_record, upsert_record, utcnow
from services.tasklytic_integrations import deliver_email_command


SCHEDULED_RULE = "maintenance.scheduled_rule"
DUE_DATE_NOTIFICATION = "maintenance.due_date_notification"
DASHBOARD_DIGEST = "maintenance.dashboard_digest"
AI_TEAMMATE = "maintenance.ai_teammate"
ABANDONED_UPLOAD = "maintenance.abandoned_upload"
INTEGRATION_RETRY = "maintenance.integration_retry"
INTEGRATION_EMAIL = "maintenance.integration_email"
MAINTENANCE_COMMAND_TYPES = frozenset({
    AUTOMATION_RULE_RUN,
    SCHEDULED_RULE,
    DUE_DATE_NOTIFICATION,
    DASHBOARD_DIGEST,
    AI_TEAMMATE,
    ABANDONED_UPLOAD,
    INTEGRATION_RETRY,
    INTEGRATION_EMAIL,
})


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return _aware(datetime.fromisoformat(str(value).replace("Z", "+00:00")))
    except (TypeError, ValueError):
        return None


def _next_run(frequency: str, now: datetime):
    if frequency == "monthly_1st":
        month = now.month + 1
        year = now.year + (1 if month == 13 else 0)
        month = 1 if month == 13 else month
        return now.replace(year=year, month=month, day=1)
    return now + timedelta(days=1 if frequency == "daily" else 7)


def _next_ai_run(cadence: str, now: datetime) -> datetime:
    return now + timedelta(days=7 if cadence == "weekly" else 1)


def _workspace_actor(db, workspace_id: str, preferred: str | None = None) -> str:
    if preferred and db.get(TasklyticWorkspaceMember, (workspace_id, preferred)):
        return preferred
    member = db.query(TasklyticWorkspaceMember).filter_by(
        workspace_id=workspace_id,
        role="admin",
    ).order_by(TasklyticWorkspaceMember.created_at).first()
    if member is None:
        raise RuntimeError(f"Workspace {workspace_id} has no administrator")
    return member.user_id


def enqueue_maintenance_commands(db, *, now: datetime | None = None) -> dict[str, int]:
    """Discover due work and insert stable, deduplicated outbox commands."""

    now = _aware(now or utcnow())
    counts = {kind: 0 for kind in MAINTENANCE_COMMAND_TYPES}

    dashboards = db.query(TasklyticEntityRecord).filter_by(entity_kind="dashboards").all()
    for row in dashboards:
        payload = row.payload or {}
        schedule = payload.get("schedule") or {}
        due = _parse_datetime(schedule.get("nextRunAt"))
        if due is None or due > now or not schedule.get("recipients"):
            continue
        actor_id = _workspace_actor(db, row.workspace_id, payload.get("ownerId"))
        _, created = enqueue_command(
            db,
            command_type=DASHBOARD_DIGEST,
            deduplication_key=f"dashboard:{row.record_id}:{schedule.get('nextRunAt')}",
            payload={"dashboardId": row.record_id, "scheduledFor": schedule.get("nextRunAt")},
            actor_id=actor_id,
            workspace_id=row.workspace_id,
        )
        counts[DASHBOARD_DIGEST] += int(created)

    tasks = db.query(TasklyticEntityRecord).filter_by(entity_kind="tasks").all()
    rules = db.query(TasklyticEntityRecord).filter_by(entity_kind="rules").all()
    for task_row in tasks:
        task = task_row.payload or {}
        if task.get("completed") or not task.get("dueOn"):
            continue
        try:
            due_date = datetime.fromisoformat(str(task["dueOn"])[:10]).date()
        except (TypeError, ValueError):
            continue
        assignee_id = task.get("assigneeId")
        if assignee_id and due_date <= now.date():
            actor_id = _workspace_actor(db, task_row.workspace_id)
            _, created = enqueue_command(
                db,
                command_type=DUE_DATE_NOTIFICATION,
                deduplication_key=f"task:{task_row.record_id}:due:{due_date}:notice:{now.date()}",
                payload={"taskId": task_row.record_id, "dueOn": due_date.isoformat(), "recipientUserId": assignee_id},
                actor_id=actor_id,
                workspace_id=task_row.workspace_id,
            )
            counts[DUE_DATE_NOTIFICATION] += int(created)
        project_ids = set(task.get("projectIds") or [])
        for rule_row in rules:
            if rule_row.workspace_id != task_row.workspace_id:
                continue
            rule = rule_row.payload or {}
            trigger = rule.get("trigger") or {}
            if not rule.get("enabled") or trigger.get("type") != "task_due_in_days":
                continue
            if rule.get("projectId") not in project_ids:
                continue
            try:
                days = max(0, min(int(trigger.get("days") or 0), 3650))
            except (TypeError, ValueError):
                continue
            if not 0 <= (due_date - now.date()).days <= days:
                continue
            actor_id = _workspace_actor(db, task_row.workspace_id, rule.get("createdBy"))
            _, created = enqueue_command(
                db,
                command_type=SCHEDULED_RULE,
                deduplication_key=(
                    f"rule:{rule_row.record_id}:task:{task_row.record_id}:due:{due_date}:run:{now.date()}"
                ),
                payload={
                    "ruleId": rule_row.record_id,
                    "taskId": task_row.record_id,
                    "taskName": task.get("name"),
                    "dueOn": due_date.isoformat(),
                    "event": {"type": "task_due_in_days", "days": days},
                },
                actor_id=actor_id,
                workspace_id=task_row.workspace_id,
            )
            counts[SCHEDULED_RULE] += int(created)

    users = db.query(TasklyticEntityRecord).filter_by(entity_kind="users").all()
    for row in users:
        payload = row.payload or {}
        if payload.get("role") != "ai" or payload.get("enabled", True) is False:
            continue
        name = str(payload.get("name") or row.record_id).lower()
        cadence = "weekly" if name == "statura" else "daily"
        bucket = now.date().isoformat() if cadence == "daily" else f"{now.isocalendar().year}-W{now.isocalendar().week:02d}"
        actor_id = _workspace_actor(db, row.workspace_id)
        _, created = enqueue_command(
            db,
            command_type=AI_TEAMMATE,
            deduplication_key=f"ai:{row.record_id}:{cadence}:{bucket}",
            payload={"userId": row.record_id, "name": payload.get("name"), "cadence": cadence, "scheduledFor": bucket},
            actor_id=actor_id,
            workspace_id=row.workspace_id,
        )
        counts[AI_TEAMMATE] += int(created)

    jobs = db.query(TasklyticAiTeammateJob).filter(
        TasklyticAiTeammateJob.enabled.is_(True), TasklyticAiTeammateJob.next_run_at <= now
    ).all()
    for job in jobs:
        if job.rate_window_date != now.date():
            job.rate_window_date = now.date()
            job.runs_in_window = 0
        if job.runs_in_window >= job.daily_limit:
            db.add(TasklyticAiAuditEvent(
                workspace_id=job.workspace_id, actor_id=job.created_by, event_type="teammate.rate_limited",
                subject_type="teammate_job", subject_id=str(job.id),
                details={"dailyLimit": job.daily_limit, "scheduledFor": _aware(job.next_run_at).isoformat()},
            ))
            job.next_run_at = _next_ai_run(job.cadence, now)
            continue
        scheduled_for = _aware(job.next_run_at).isoformat()
        _, created = enqueue_command(
            db,
            command_type=AI_TEAMMATE,
            deduplication_key=f"ai-job:{job.id}:{scheduled_for}",
            payload={"jobId": str(job.id), "teammate": job.teammate, "scheduledFor": scheduled_for},
            actor_id=job.created_by,
            workspace_id=job.workspace_id,
            max_attempts=3,
        )
        if created:
            job.runs_in_window += 1
            counts[AI_TEAMMATE] += 1

    expired = db.query(TasklyticFileUpload).filter(
        TasklyticFileUpload.state.in_(["initiated", "completed"]),
        TasklyticFileUpload.expires_at < now,
    ).all()
    for upload in expired:
        actor_id = _workspace_actor(db, upload.workspace_id, upload.uploader_id)
        _, created = enqueue_command(
            db,
            command_type=ABANDONED_UPLOAD,
            deduplication_key=f"upload:{upload.id}:expires:{_aware(upload.expires_at).isoformat()}",
            payload={"uploadId": str(upload.id), "objectName": upload.object_name},
            actor_id=actor_id,
            workspace_id=upload.workspace_id,
        )
        counts[ABANDONED_UPLOAD] += int(created)

    pending = db.query(TasklyticEntityRecord).filter_by(entity_kind="pendingEmails").all()
    for row in pending:
        payload = row.payload or {}
        if payload.get("status") not in {"failed", "retry"}:
            continue
        retry_at = _parse_datetime(payload.get("nextRetryAt"))
        if retry_at and retry_at > now:
            continue
        _, created = enqueue_command(
            db,
            command_type=INTEGRATION_RETRY,
            deduplication_key=f"integration:{row.record_id}:attempt:{payload.get('attemptCount', 0)}",
            payload={"recordId": row.record_id, "userId": row.user_id},
            actor_id=row.user_id,
            workspace_id=None,
        )
        counts[INTEGRATION_RETRY] += int(created)
    return counts


def _condition_matches(task: dict[str, Any], project_id: str, condition: dict[str, Any]) -> bool:
    field = str(condition.get("field") or "")
    if field.startswith("customField:"):
        value = (task.get("customFieldValues") or {}).get(field.split(":", 1)[1])
        raw = value.get("value") if isinstance(value, dict) else None
    elif field in {"assignee", "assigneeId"}:
        raw = task.get("assigneeId")
    elif field == "sectionId":
        raw = (task.get("sectionIdByProject") or {}).get(project_id)
    elif field == "projectId":
        raw = project_id
    else:
        raw = task.get(field)
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


def _run_scheduled_rule(db, command: TasklyticCommand) -> dict[str, Any]:
    rule_row = _find_record(db, "rules", str(command.payload.get("ruleId")), command.workspace_id)
    task_row = _find_record(db, "tasks", str(command.payload.get("taskId")), command.workspace_id, lock=True)
    if rule_row is None or task_row is None:
        return {"skipped": "rule_or_task_missing"}
    rule, task = dict(rule_row.payload or {}), dict(task_row.payload or {})
    project_id = str(rule.get("projectId") or "")
    if not rule.get("enabled") or task.get("completed"):
        return {"skipped": "disabled_or_completed"}
    if not all(_condition_matches(task, project_id, item) for item in rule.get("conditions") or []):
        return {"skipped": "conditions_not_met"}
    now_text = utcnow().isoformat()
    for action in rule.get("actions") or []:
        action_type = action.get("type")
        if action_type == "assign_to":
            task["assigneeId"] = action.get("userId")
        elif action_type == "move_to_section":
            task.setdefault("sectionIdByProject", {})[project_id] = action.get("sectionId")
        elif action_type == "set_due_in_days":
            days = max(0, min(int(action.get("days") or 0), 3650))
            task["dueOn"] = (utcnow() + timedelta(days=days)).date().isoformat()
        elif action_type == "set_custom_field":
            task.setdefault("customFieldValues", {})[str(action.get("customFieldId"))] = {
                "type": "text", "value": str(action.get("value") or ""),
            }
        elif action_type == "add_collaborator":
            task["collaboratorIds"] = list(dict.fromkeys((task.get("collaboratorIds") or []) + [action.get("userId")]))
        elif action_type == "add_to_project":
            additional_id = str(action.get("projectId") or "")
            additional = _find_record(db, "projects", additional_id, command.workspace_id)
            if additional and additional_id not in (task.get("projectIds") or []):
                task.setdefault("projectIds", []).append(additional_id)
                task.setdefault("sectionIdByProject", {})[additional_id] = ((additional.payload or {}).get("sectionIds") or [None])[0]
        elif action_type == "send_notification":
            recipient = task.get("assigneeId") if action.get("userId") == "__assignee__" else action.get("userId")
            if recipient:
                notification_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:{command.id}:notification:{recipient}"))
                upsert_record(db, "notifications", {
                    "id": notification_id, "userId": recipient, "actorId": command.actor_id,
                    "type": "rule_action", "scope": {"type": "task", "id": task_row.record_id},
                    "message": str(action.get("message") or "Rule action").replace("{{taskName}}", str(task.get("name") or "Task")),
                    "unread": True, "archived": False, "metadata": {"ruleId": rule_row.record_id, "commandId": str(command.id)},
                    "createdAt": now_text,
                }, command.actor_id, None)
        elif action_type == "create_subtask":
            subtask_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:{command.id}:subtask"))
            upsert_record(db, "tasks", {
                **task, "id": subtask_id,
                "name": str(action.get("templateName") or "Follow up").replace("{{taskName}}", str(task.get("name") or "Task")),
                "parentId": task_row.record_id, "attachmentIds": [], "createdAt": now_text, "modifiedAt": now_text,
            }, command.actor_id, command.workspace_id)
    task["modifiedAt"] = now_text
    upsert_record(db, "tasks", task, command.actor_id, command.workspace_id)
    rule["runCount"] = int(rule.get("runCount") or 0) + 1
    rule["lastRunAt"] = now_text
    upsert_record(db, "rules", rule, command.actor_id, command.workspace_id)
    return {"ruleId": rule_row.record_id, "taskId": task_row.record_id, "actions": len(rule.get("actions") or [])}


def _send_due_notification(db, command: TasklyticCommand) -> dict[str, Any]:
    task = _find_record(db, "tasks", str(command.payload.get("taskId")), command.workspace_id)
    if task is None or (task.payload or {}).get("completed"):
        return {"skipped": "task_missing_or_completed"}
    recipient = str(command.payload.get("recipientUserId") or "")
    notification_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:{command.deduplication_key}"))
    upsert_record(db, "notifications", {
        "id": notification_id,
        "userId": recipient,
        "actorId": command.actor_id,
        "type": "task_due",
        "scope": {"type": "task", "id": task.record_id},
        "message": f'"{(task.payload or {}).get("name", "Task")}" is due {(task.payload or {}).get("dueOn")}.',
        "unread": True,
        "archived": False,
        "metadata": {"commandId": str(command.id), "dueOn": command.payload.get("dueOn")},
        "createdAt": utcnow().isoformat(),
    }, command.actor_id, None)
    return {"notificationId": notification_id, "recipientUserId": recipient}


def _send_dashboard_digest(db, command: TasklyticCommand) -> dict[str, Any]:
    row = _find_record(db, "dashboards", str(command.payload.get("dashboardId")), command.workspace_id, lock=True)
    if row is None:
        return {"skipped": "dashboard_missing"}
    payload = dict(row.payload or {})
    schedule = dict(payload.get("schedule") or {})
    if str(schedule.get("nextRunAt")) != str(command.payload.get("scheduledFor")):
        return {"skipped": "schedule_changed"}
    title = str(payload.get("name") or "Dashboard")
    snapshot = build_dashboard_snapshot(db, row.workspace_id, payload)
    lines = "\n".join(f"• {item['title']}: {item['recordCount']} records" for item in snapshot.chart_summaries)
    body = f"Dashboard digest: {title}\n\n{lines or 'No charts configured.'}\n\n— CPAAutomation Project Management"
    html_body = (
        f"<h1>{title}</h1><p>Generated dashboard snapshot:</p>"
        '<p><img src="cid:dashboard-snapshot" alt="Dashboard snapshot" '
        'style="max-width:100%;height:auto" /></p>'
        + "<ul>"
        + "".join(f"<li>{item['title']}: {item['recordCount']} records</li>" for item in snapshot.chart_summaries)
        + "</ul>"
    )
    sent = 0
    for recipient in schedule.get("recipients") or []:
        if not email_service.send_html_email(
            str(recipient),
            f"[Tasklytic] Dashboard digest — {title}",
            html_body,
            body,
            inline_images=[("dashboard-snapshot", snapshot.content, snapshot.mime_type, "dashboard.png")],
        ):
            raise RuntimeError(f"Dashboard digest delivery failed for {recipient}")
        sent += 1
    schedule["nextRunAt"] = next_dashboard_run(
        str(schedule.get("frequency") or "weekly_mon"),
        _parse_datetime(command.payload.get("scheduledFor")) or utcnow(),
        utcnow(),
    ).isoformat()
    payload["schedule"] = schedule
    payload["lastSnapshot"] = {
        "generatedAt": snapshot.generated_at,
        "sha256": snapshot.sha256,
        "mimeType": snapshot.mime_type,
        "width": snapshot.width,
        "height": snapshot.height,
    }
    upsert_record(db, "dashboards", payload, command.actor_id, command.workspace_id, suppress_automation=True)
    return {
        "digestsSent": sent,
        "nextRunAt": schedule["nextRunAt"],
        "snapshot": payload["lastSnapshot"],
    }


async def _abandon_upload(db, command: TasklyticCommand) -> dict[str, Any]:
    try:
        upload_id = uuid.UUID(str(command.payload.get("uploadId")))
    except ValueError:
        return {"skipped": "invalid_upload_id"}
    upload = db.get(TasklyticFileUpload, upload_id)
    if upload is None or upload.state not in {"initiated", "completed"}:
        return {"skipped": "upload_missing_or_final"}
    if upload.state == "completed":
        attachments = db.query(TasklyticEntityRecord).filter_by(entity_kind="attachments", workspace_id=upload.workspace_id).all()
        if any((attachment.payload or {}).get("storageRef") == upload.object_name for attachment in attachments):
            return {"skipped": "upload_attached"}
    await get_storage_service().delete_file(upload.object_name)
    upload.state = "abandoned"
    return {"uploadId": str(upload.id), "objectDeleted": True}


async def _run_ai_teammate(db, command: TasklyticCommand) -> dict[str, Any]:
    job_id = command.payload.get("jobId")
    if job_id:
        try:
            job = db.get(TasklyticAiTeammateJob, uuid.UUID(str(job_id)))
        except ValueError:
            job = None
        if job is None or not job.enabled or job.workspace_id != command.workspace_id:
            return {"skipped": "ai_teammate_job_missing_or_disabled"}
        id_field = {"workspace": "workspaceId", "project": "projectId", "task": "taskId"}[job.scope_type]
        scope = {"type": job.scope_type, id_field: job.scope_id}
        prompts = {
            "tria": "Triage this scope. Return a concise assessment and only reviewable custom-field or assignee proposals.",
            "summarie": "Summarize the latest discussion and work in this scope as a reviewable summary proposal.",
            "statura": "Draft a status update for this project from current activity. Return it as a reviewable status proposal.",
        }
        thread = create_thread(db, job.workspace_id, command.actor_id, {
            "id": f"ai-job-{command.id}",
            "title": f"{job.teammate.title()} scheduled run",
            "contextScope": scope,
        })
        response = await generate_tasklytic_response(
            db, command.actor_id, prompts[job.teammate], [], None, scope, thread.id
        )
        job.last_run_at = utcnow()
        job.next_run_at = _next_ai_run(job.cadence, _aware(job.last_run_at))
        usage = db.query(TasklyticAiUsageEvent).filter_by(thread_id=thread.id).order_by(
            TasklyticAiUsageEvent.created_at.desc()
        ).first()
        if usage:
            usage.event_type = "teammate"
            usage.job_id = job.id
        db.add(TasklyticAiAuditEvent(
            workspace_id=job.workspace_id, actor_id=command.actor_id, event_type="teammate.succeeded",
            subject_type="teammate_job", subject_id=str(job.id),
            details={"teammate": job.teammate, "proposalCount": len(response.get("proposals") or [])},
        ))
        return {
            "jobId": str(job.id), "teammate": job.teammate, "threadId": thread.id,
            "proposalIds": [proposal["id"] for proposal in response.get("proposals") or []],
            "nextRunAt": _aware(job.next_run_at).isoformat(),
        }
    # Compatibility for Phase 3 AI-user schedules created before Phase 7.
    user = _find_record(db, "users", str(command.payload.get("userId")), command.workspace_id)
    if user is None or (user.payload or {}).get("enabled", True) is False:
        return {"skipped": "ai_teammate_missing_or_disabled"}
    return {"scheduled": True, "userId": user.record_id, "cadence": command.payload.get("cadence")}


def _record_ai_failure(db, command: TasklyticCommand) -> None:
    job_id = str(command.payload.get("jobId") or command.payload.get("userId") or command.id)
    db.add(TasklyticAiAuditEvent(
        workspace_id=command.workspace_id,
        actor_id=command.actor_id,
        event_type="teammate.failed",
        subject_type="teammate_job",
        subject_id=job_id,
        details={"failureCode": command.failure_code, "failureDetail": command.failure_detail},
    ))
    notification = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:ai-failure:{command.id}")),
        "userId": command.actor_id,
        "scope": {"type": "workspace", "id": command.workspace_id},
        "type": "ai_teammate_failed",
        "message": f"AI teammate run failed: {command.failure_detail or command.failure_code or 'unknown error'}",
        "read": False,
        "createdAt": utcnow().isoformat(),
    }
    upsert_record(db, "notifications", notification, command.actor_id, None, suppress_automation=True)


def _retry_integration(db, command: TasklyticCommand) -> dict[str, Any]:
    row = db.query(TasklyticEntityRecord).filter_by(
        entity_kind="pendingEmails",
        record_id=str(command.payload.get("recordId")),
        user_id=str(command.payload.get("userId")),
    ).with_for_update().one_or_none()
    if row is None:
        return {"skipped": "integration_record_missing"}
    payload = dict(row.payload or {})
    recipient = str(payload.get("to") or payload.get("recipient") or "")
    if not recipient:
        raise RuntimeError("Integration retry has no recipient")
    if not email_service.send_html_email(
        recipient,
        str(payload.get("subject") or "")[:998],
        str(payload.get("bodyHtml") or payload.get("body") or ""),
        str(payload.get("bodyText") or payload.get("body") or ""),
    ):
        raise RuntimeError("Integration delivery failed")
    payload["status"] = "sent"
    payload["sentAt"] = utcnow().isoformat()
    payload["attemptCount"] = int(payload.get("attemptCount") or 0) + 1
    row.payload = payload
    row.revision += 1
    return {"recordId": row.record_id, "status": "sent"}


MAINTENANCE_HANDLERS = {
    AUTOMATION_RULE_RUN: execute_rule_command,
    SCHEDULED_RULE: execute_rule_command,
    DUE_DATE_NOTIFICATION: _send_due_notification,
    DASHBOARD_DIGEST: _send_dashboard_digest,
    AI_TEAMMATE: _run_ai_teammate,
    ABANDONED_UPLOAD: _abandon_upload,
    INTEGRATION_RETRY: _retry_integration,
    INTEGRATION_EMAIL: deliver_email_command,
}


async def run_tasklytic_maintenance() -> dict[str, Any]:
    """Schedule due work, then drain one bounded batch through leased handlers."""

    db = db_config.get_session()
    worker_id = f"tasklytic-maintenance:{uuid.uuid4()}"
    scheduled: dict[str, int] = {}
    processed = succeeded = failed = retried = 0
    digests_sent = uploads_abandoned = 0
    try:
        scheduled = enqueue_maintenance_commands(db)
        db.commit()
        commands = claim_commands(
            db,
            worker_id=worker_id,
            limit=100,
            command_types=MAINTENANCE_COMMAND_TYPES,
        )
        db.commit()
        for claimed in commands:
            command_type = claimed.command_type
            outcome = await execute_claimed_command(db, claimed, worker_id=worker_id, handlers=MAINTENANCE_HANDLERS)
            db.commit()
            processed += 1
            if outcome.status == "succeeded":
                succeeded += 1
                if command_type == DASHBOARD_DIGEST:
                    digests_sent += int((outcome.result or {}).get("digestsSent") or 0)
                elif command_type == ABANDONED_UPLOAD and (outcome.result or {}).get("objectDeleted"):
                    uploads_abandoned += 1
            elif outcome.status == "failed":
                failed += 1
                if command_type == AI_TEAMMATE:
                    _record_ai_failure(db, outcome)
                    db.commit()
            else:
                retried += 1
        return {
            "scheduled": scheduled,
            "processed": processed,
            "succeeded": succeeded,
            "retried": retried,
            "failed": failed,
            # Backward-compatible keys used by existing scheduler callers.
            "digests_sent": digests_sent,
            "uploads_abandoned": uploads_abandoned,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
