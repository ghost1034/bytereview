"""Authenticated and public APIs for Tasklytic project management."""

from __future__ import annotations

import asyncio
import html
import os
import re
import secrets
import uuid
from datetime import timedelta
from pathlib import PurePath
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.database import get_db
from core.runtime import frontend_base_url, is_local
from dependencies.auth import verify_firebase_token
from models.tasklytic import TasklyticEntityRecord, TasklyticFileUpload, TasklyticInvitation, TasklyticWorkspace, TasklyticWorkspaceMember
from services.email_service import email_service
from services.billing_service import PlanLimitExceeded
from services.gcs_service import get_storage_service
from services.rate_limit import rate_limiter
from services.tasklytic_ai_service import generate_tasklytic_response
from services.tasklytic_service import (
    ENTITY_POLICIES,
    bootstrap,
    clear_user_data,
    delete_record,
    get_membership,
    invitation_payload,
    list_records,
    provision_bundle,
    replace_collection,
    require_admin,
    resolve_workspace_id,
    token_hash,
    upsert_record,
    utcnow,
    validate_id,
    validate_kind,
    validate_payload,
    workspace_payload,
    _find_record,
    authorize_record,
    authorize_mutation,
)


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_REQUEST_BYTES = 12 * 1024 * 1024
BLOCKED_EXTENSIONS = {
    ".app", ".bat", ".cmd", ".com", ".cpl", ".dll", ".dmg", ".exe", ".hta", ".jar",
    ".js", ".jse", ".lnk", ".msi", ".msp", ".ps1", ".reg", ".scr", ".sh", ".vbs", ".wsf",
}
BLOCKED_MIME_PREFIXES = ("application/x-executable", "application/x-msdownload", "application/x-sh")
PUBLIC_RATE_LIMIT = 20
PUBLIC_RATE_WINDOW_SECONDS = 60


def _enforce_request_size(request: Request) -> None:
    raw_length = request.headers.get("content-length")
    if raw_length:
        try:
            if int(raw_length) > MAX_REQUEST_BYTES:
                raise HTTPException(status_code=413, detail="Tasklytic request body is too large")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header")


router = APIRouter(
    prefix="/api/tasklytic",
    tags=["tasklytic"],
    dependencies=[Depends(_enforce_request_size)],
)


def _commit(db: Session) -> None:
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def _expired(value) -> bool:
    now = utcnow()
    if getattr(value, "tzinfo", None) is None:
        now = now.replace(tzinfo=None)
    return value <= now


def _validate_upload(filename: Any, mime_type: Any, size: Any) -> tuple[str, str, int]:
    if not isinstance(filename, str) or not filename.strip() or len(filename) > 512:
        raise HTTPException(status_code=422, detail="A valid filename is required")
    safe_name = PurePath(filename.replace("\\", "/")).name
    if PurePath(safe_name.lower()).suffix in BLOCKED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Executable files are not allowed")
    if not isinstance(mime_type, str) or not mime_type or any(mime_type.lower().startswith(v) for v in BLOCKED_MIME_PREFIXES):
        raise HTTPException(status_code=415, detail="This file type is not allowed")
    if not isinstance(size, int) or isinstance(size, bool) or size < 0 or size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 100 MB limit")
    return safe_name, mime_type[:255], size


def _get_upload(db: Session, object_name: str, *, lock: bool = False) -> TasklyticFileUpload:
    query = db.query(TasklyticFileUpload).filter_by(object_name=object_name)
    if lock:
        query = query.with_for_update()
    row = query.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Upload was not found")
    return row


async def _verify_completed_object(row: TasklyticFileUpload) -> None:
    storage = get_storage_service()
    blob = storage.bucket.blob(row.object_name)
    await asyncio.to_thread(blob.reload)
    if not blob.exists():
        raise HTTPException(status_code=409, detail="The uploaded object does not exist")
    if int(blob.size or -1) != int(row.size_bytes):
        raise HTTPException(status_code=409, detail="Uploaded object size does not match the initiated upload")
    content_type = getattr(blob, "content_type", None)
    if content_type and content_type != row.mime_type:
        raise HTTPException(status_code=409, detail="Uploaded object MIME type does not match")


def _public_form_row(db: Session, form_key: str) -> TasklyticEntityRecord:
    rows = db.query(TasklyticEntityRecord).filter_by(entity_kind="forms").all()
    for row in rows:
        data = row.payload or {}
        if (data.get("id") == form_key or data.get("publicSlug") == form_key) and data.get("isPublic") is True:
            return row
    raise HTTPException(status_code=404, detail="Published form not found")


def _sanitize_public_form(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": data.get("id"),
        "name": data.get("name"),
        "description": data.get("description"),
        "fields": data.get("fields") or [],
        "isPublic": True,
        "publicSlug": data.get("publicSlug"),
        "confirmationMessage": data.get("confirmationMessage") or "Thanks for your submission.",
        "branding": data.get("branding"),
        "copyAnswersToDescription": False,
        "createdAt": data.get("createdAt"),
    }


def _validate_public_answers(form: dict[str, Any], answers: Any) -> dict[str, Any]:
    if not isinstance(answers, dict):
        raise HTTPException(status_code=422, detail="answers must be an object")
    fields = form.get("fields") or []
    known = {field.get("id") for field in fields if isinstance(field, dict)}
    if any(key not in known for key in answers):
        raise HTTPException(status_code=422, detail="answers contain an unknown field")
    for field in fields:
        field_id, field_type = field.get("id"), field.get("type")
        value = answers.get(field_id)
        missing = value is None or value == "" or value == []
        if field.get("required") and missing:
            raise HTTPException(status_code=422, detail=f"{field.get('label', 'Field')} is required")
        if missing:
            continue
        if field_type in {"short_text", "long_text"} and (not isinstance(value, str) or len(value) > 20_000):
            raise HTTPException(status_code=422, detail=f"{field.get('label')} must be text")
        if field_type == "number" and (not isinstance(value, (int, float)) or isinstance(value, bool)):
            raise HTTPException(status_code=422, detail=f"{field.get('label')} must be a number")
        if field_type == "date" and (not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)):
            raise HTTPException(status_code=422, detail=f"{field.get('label')} must be a date")
        allowed = {option.get("id") for option in field.get("options") or []}
        if field_type == "dropdown" and value not in allowed:
            raise HTTPException(status_code=422, detail=f"{field.get('label')} has an invalid option")
        if field_type == "multi_select" and (not isinstance(value, list) or any(v not in allowed for v in value)):
            raise HTTPException(status_code=422, detail=f"{field.get('label')} has an invalid option")
        if field_type == "attachment":
            values = value if isinstance(value, list) else [value]
            if any(not isinstance(v, dict) or not isinstance(v.get("uploadRef"), str) or not isinstance(v.get("uploadToken"), str) for v in values):
                raise HTTPException(status_code=422, detail="Attachments must use completed one-time upload references")
    return answers


def _check_public_rate(request: Request, form_key: str) -> None:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    client = forwarded or (request.client.host if request.client else "unknown")
    if not rate_limiter.check(f"tasklytic_public:{form_key}", client, PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail="Too many submissions; try again shortly")


@router.get("/public/forms/{form_key}")
def get_public_form(form_key: str, db: Session = Depends(get_db)):
    return _sanitize_public_form(_public_form_row(db, form_key).payload or {})


@router.post("/public/forms/{form_key}/files:initiate")
async def initiate_public_form_file(form_key: str, request: Request, body: dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    _check_public_rate(request, f"upload:{form_key}")
    form_row = _public_form_row(db, form_key)
    filename, mime_type, size = _validate_upload(body.get("filename"), body.get("content_type"), body.get("size"))
    upload_id = uuid.uuid4()
    public_token = secrets.token_urlsafe(32)
    object_name = f"tasklytic/{form_row.workspace_id}/public/{upload_id}/{quote(filename, safe='._-')}"
    row = TasklyticFileUpload(
        id=upload_id,
        object_name=object_name,
        workspace_id=form_row.workspace_id,
        uploader_id=None,
        scope_type="form",
        scope_id=str((form_row.payload or {}).get("id")),
        filename=filename,
        mime_type=mime_type,
        size_bytes=size,
        public_token_hash=token_hash(public_token),
        expires_at=utcnow() + timedelta(hours=1),
    )
    db.add(row)
    db.flush()
    upload_url = await get_storage_service().generate_presigned_put_url(object_name, expiration_minutes=15, content_type=mime_type)
    _commit(db)
    return {"object_name": object_name, "upload_url": upload_url, "upload_token": public_token, "content_type": mime_type}


@router.post("/public/files:complete")
async def complete_public_file(body: dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    row = _get_upload(db, str(body.get("object_name") or ""), lock=True)
    supplied = str(body.get("upload_token") or "")
    if not row.public_token_hash or not secrets.compare_digest(row.public_token_hash, token_hash(supplied)):
        raise HTTPException(status_code=403, detail="Invalid public upload token")
    if _expired(row.expires_at) or row.state != "initiated":
        raise HTTPException(status_code=409, detail="Upload is expired or already completed")
    await _verify_completed_object(row)
    row.state = "completed"
    row.completed_at = utcnow()
    _commit(db)
    return {"ok": True}


@router.post("/public/forms/{form_key}/submit")
def submit_public_form(
    form_key: str,
    request: Request,
    body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
):
    _check_public_rate(request, form_key)
    form_row = _public_form_row(db, form_key)
    form = form_row.payload or {}
    answers = _validate_public_answers(form, body.get("answers"))
    key = (idempotency_key or body.get("idempotencyKey") or "").strip()
    if not key or len(key) > 128:
        raise HTTPException(status_code=422, detail="A valid Idempotency-Key header is required")
    submission_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:{form_row.workspace_id}:{form.get('id')}:{key}"))
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        # Serialize identical submissions before the existence check so a
        # concurrent retry observes the first committed result.
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": submission_id})
    existing = _find_record(db, "formSubmissions", submission_id, form_row.workspace_id)
    if existing:
        return {"taskId": (existing.payload or {}).get("taskId"), "submissionId": submission_id, "replayed": True}
    project = _find_record(db, "projects", str(form.get("projectId")), form_row.workspace_id)
    if project is None:
        raise HTTPException(status_code=409, detail="The form target project no longer exists")
    project_data = project.payload or {}
    actor_id = str(project_data.get("ownerId") or "")
    get_membership(db, form_row.workspace_id, actor_id)
    title_field = form.get("taskTitleFieldId") or ((form.get("fields") or [{}])[0].get("id"))
    title = str(answers.get(title_field) or form.get("name") or "Form submission").strip()[:500]
    task_id = str(uuid.uuid4())
    section_id = form.get("defaultSectionId")
    if not section_id:
        section = db.query(TasklyticEntityRecord).filter_by(entity_kind="sections", workspace_id=form_row.workspace_id).all()
        section_id = next((r.record_id for r in section if (r.payload or {}).get("projectId") == project.record_id), None)
    now_text = utcnow().isoformat()
    task = {
        "id": task_id, "workspaceId": form_row.workspace_id, "name": title,
        "resourceSubtype": "default_task", "completed": False,
        "assigneeId": form.get("defaultAssigneeId"), "collaboratorIds": [],
        "projectIds": [project.record_id], "sectionIdByProject": {project.record_id: section_id},
        "tagIds": [], "customFieldValues": {}, "dependencyIds": [], "dependentIds": [],
        "attachmentIds": [], "likedByIds": [], "createdAt": now_text, "modifiedAt": now_text,
    }
    # Establish the task parent before attachment records are validated.
    upsert_record(db, "tasks", task, actor_id, form_row.workspace_id)
    attachment_ids: list[str] = []
    for field in form.get("fields") or []:
        if field.get("type") != "attachment" or not answers.get(field.get("id")):
            continue
        values = answers[field["id"]] if isinstance(answers[field["id"]], list) else [answers[field["id"]]]
        for value in values:
            upload = _get_upload(db, value["uploadRef"], lock=True)
            if upload.public_token_hash is None or not secrets.compare_digest(upload.public_token_hash, token_hash(value["uploadToken"])):
                raise HTTPException(status_code=403, detail="Invalid attachment upload token")
            if upload.scope_id != form.get("id") or upload.workspace_id != form_row.workspace_id or upload.state != "completed" or upload.consumed_at:
                raise HTTPException(status_code=409, detail="Attachment upload is incomplete, used, or belongs to another form")
            attachment_id = str(uuid.uuid4())
            attachment = {
                "id": attachment_id, "name": upload.filename, "size": upload.size_bytes,
                "mime": upload.mime_type, "storageRef": upload.object_name, "storage": "object_store",
                "uploadedBy": actor_id, "taskId": task_id, "createdAt": now_text,
            }
            upsert_record(db, "attachments", attachment, actor_id, form_row.workspace_id)
            upload.state = "consumed"
            upload.consumed_at = utcnow()
            upload.scope_type = "task"
            upload.scope_id = task_id
            attachment_ids.append(attachment_id)
    task["attachmentIds"] = attachment_ids
    if form.get("copyAnswersToDescription"):
        task["notes"] = "\n".join(
            f"{field.get('label')}: {answers.get(field.get('id'), '')}"
            for field in form.get("fields") or [] if field.get("type") != "attachment"
        )
    upsert_record(db, "tasks", task, actor_id, form_row.workspace_id)
    def safe_answer(value: Any) -> Any:
        if isinstance(value, dict) and value.get("uploadRef"):
            return {key: value.get(key) for key in ("name", "mime", "size", "uploadRef")}
        if isinstance(value, list):
            return [safe_answer(item) for item in value]
        return value

    submission = {
        "id": submission_id, "formId": form.get("id"),
        "answers": {field_id: safe_answer(value) for field_id, value in answers.items()},
        "taskId": task_id, "createdAt": now_text,
    }
    upsert_record(db, "formSubmissions", submission, actor_id, form_row.workspace_id)
    assignee_id = form.get("defaultAssigneeId")
    if assignee_id:
        notification = {
            "id": str(uuid.uuid4()), "userId": assignee_id, "actorId": actor_id,
            "type": "form_submission", "scope": {"type": "form", "id": form.get("id")},
            "message": f'New submission on "{form.get("name")}" created task "{title}"',
            "unread": True, "archived": False,
            "metadata": {"taskId": task_id, "formId": form.get("id"), "submissionId": submission_id},
            "createdAt": now_text,
        }
        upsert_record(db, "notifications", notification, actor_id, None)
    # Run the deterministic subset of form-triggered rules in the same transaction.
    for rule in db.query(TasklyticEntityRecord).filter_by(entity_kind="rules", workspace_id=form_row.workspace_id).all():
        data = rule.payload or {}
        trigger = data.get("trigger") or {}
        if (
            not data.get("enabled") or data.get("projectId") != project.record_id or
            trigger.get("type") != "form_submitted" or trigger.get("formId") != form.get("id")
        ):
            continue
        def condition_value(field: str) -> Any:
            if field.startswith("customField:"):
                wrapped = task["customFieldValues"].get(field.split(":", 1)[1])
                return wrapped.get("value") if isinstance(wrapped, dict) else None
            if field in {"assignee", "assigneeId"}:
                return task.get("assigneeId")
            if field == "sectionId":
                return task["sectionIdByProject"].get(project.record_id)
            if field == "projectId":
                return project.record_id
            return task.get(field)

        conditions_match = True
        for condition in data.get("conditions") or []:
            raw = condition_value(str(condition.get("field") or ""))
            expected = condition.get("value")
            op = condition.get("op")
            try:
                matched = (
                    (op == "eq" and raw == expected) or
                    (op == "neq" and raw != expected) or
                    (op == "gt" and float(raw) > float(expected)) or
                    (op == "lt" and float(raw) < float(expected)) or
                    (op == "in" and isinstance(expected, list) and raw in expected)
                )
            except (TypeError, ValueError):
                matched = False
            if not matched:
                conditions_match = False
                break
        if not conditions_match:
            continue
        for action in data.get("actions") or []:
            if action.get("type") == "assign_to":
                task["assigneeId"] = action.get("userId")
            elif action.get("type") == "move_to_section":
                task["sectionIdByProject"][project.record_id] = action.get("sectionId")
            elif action.get("type") == "set_due_in_days":
                days = max(0, min(int(action.get("days") or 0), 3650))
                task["dueOn"] = (utcnow() + timedelta(days=days)).date().isoformat()
            elif action.get("type") == "set_custom_field":
                task["customFieldValues"][str(action.get("customFieldId"))] = {
                    "type": "text", "value": str(action.get("value") or ""),
                }
            elif action.get("type") == "add_collaborator":
                task["collaboratorIds"] = list(dict.fromkeys(task["collaboratorIds"] + [action.get("userId")]))
            elif action.get("type") == "add_to_project":
                additional = _find_record(db, "projects", str(action.get("projectId")), form_row.workspace_id)
                if additional and additional.record_id not in task["projectIds"]:
                    task["projectIds"].append(additional.record_id)
                    first_section = ((additional.payload or {}).get("sectionIds") or [None])[0]
                    task["sectionIdByProject"][additional.record_id] = first_section
            elif action.get("type") == "send_notification":
                recipient = task.get("assigneeId") if action.get("userId") == "__assignee__" else action.get("userId")
                if recipient:
                    upsert_record(db, "notifications", {
                        "id": str(uuid.uuid4()), "userId": recipient, "actorId": actor_id,
                        "type": "rule_action", "scope": {"type": "task", "id": task_id},
                        "message": str(action.get("message") or "Rule action").replace("{{taskName}}", title),
                        "unread": True, "archived": False, "metadata": {"ruleId": rule.record_id},
                        "createdAt": now_text,
                    }, actor_id, None)
            elif action.get("type") == "create_subtask":
                subtask_id = str(uuid.uuid4())
                subtask = {
                    **task, "id": subtask_id, "name": str(action.get("templateName") or "Follow up").replace("{{taskName}}", title),
                    "parentId": task_id, "attachmentIds": [], "createdAt": now_text, "modifiedAt": now_text,
                }
                upsert_record(db, "tasks", subtask, actor_id, form_row.workspace_id)
        data["runCount"] = int(data.get("runCount") or 0) + 1
        data["lastRunAt"] = now_text
        upsert_record(db, "rules", data, actor_id, form_row.workspace_id)
    upsert_record(db, "tasks", task, actor_id, form_row.workspace_id)
    try:
        _commit(db)
    except IntegrityError:
        db.rollback()
        replay = _find_record(db, "formSubmissions", submission_id, form_row.workspace_id)
        if replay:
            return {"taskId": (replay.payload or {}).get("taskId"), "submissionId": submission_id, "replayed": True}
        raise
    return {"taskId": task_id, "submissionId": submission_id, "replayed": False}


@router.get("/bootstrap")
def get_bootstrap(
    workspace_id: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    return bootstrap(db, token["uid"], workspace_id)


@router.post("/provision")
def provision(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    result = provision_bundle(db, body.get("bundle", body), token)
    _commit(db)
    return result


@router.post("/invitations/send")
def send_invitations(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    require_admin(db, workspace_id, token["uid"])
    workspace = db.get(TasklyticWorkspace, workspace_id)
    emails = body.get("emails")
    role = body.get("role")
    if not isinstance(emails, list) or len(emails) > 50 or role not in {"admin", "member", "guest"}:
        raise HTTPException(status_code=422, detail="Valid recipients and role are required")
    team_id = body.get("teamId")
    if team_id:
        team = _find_record(db, "teams", validate_id(team_id, "teamId"), workspace_id)
        if team is None:
            raise HTTPException(status_code=422, detail="Invite team was not found in this workspace")
    results = []
    for raw_email in emails:
        email = str(raw_email).strip().lower()
        if not EMAIL_RE.fullmatch(email) or len(email) > 320:
            results.append({"email": email, "ok": False, "error": "Invalid email address"})
            continue
        plain_token = secrets.token_urlsafe(32)
        invite = TasklyticInvitation(
            workspace_id=workspace_id, email=email, role=role, team_id=team_id,
            invited_by_id=token["uid"], note=str(body.get("note") or "").strip()[:2000] or None,
            token_hash=token_hash(plain_token), expires_at=utcnow() + timedelta(days=7),
        )
        db.add(invite)
        db.flush()
        name = (workspace.payload or {}).get("name") or "a workspace"
        inviter = token.get("name") or token.get("email") or "A teammate"
        link = f"{frontend_base_url()}/dashboard/project-management/accept-invite?token={quote(plain_token)}"
        sent = email_service.send_html_email(
            email,
            f"{inviter} invited you to {name} on Tasklytic",
            f"<p>{html.escape(str(inviter))} invited you to join <strong>{html.escape(str(name))}</strong> as {html.escape(role)}.</p><p><a href=\"{html.escape(link)}\">Accept invitation</a></p>",
            f"{inviter} invited you to {name} as {role}. Accept: {link}",
        )
        invite.delivery_state = "sent" if sent else "failed"
        invite.delivery_error = None if sent else "Email delivery failed"
        results.append({"email": email, "ok": sent, "emailSent": sent, "error": None if sent else "Email delivery failed", "invitation": invitation_payload(invite)})
    _commit(db)
    return {"results": results}


@router.post("/invitations/accept")
def accept_invitation(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    plain = str(body.get("token") or "").strip()
    if len(plain) < 20:
        raise HTTPException(status_code=422, detail="Invitation token is invalid")
    invite = db.query(TasklyticInvitation).filter_by(token_hash=token_hash(plain)).with_for_update().one_or_none()
    if invite is None or invite.status != "pending":
        raise HTTPException(status_code=409, detail="This invitation is invalid or is no longer available")
    if _expired(invite.expires_at):
        invite.status = "expired"
        _commit(db)
        raise HTTPException(status_code=410, detail="This invitation has expired")
    email = str(token.get("email") or "").strip().lower()
    if not token.get("email_verified") or email != invite.email:
        raise HTTPException(status_code=403, detail=f"Sign in with the verified address {invite.email} to accept this invitation")
    membership = db.get(TasklyticWorkspaceMember, (invite.workspace_id, token["uid"]))
    if membership is None:
        membership = TasklyticWorkspaceMember(workspace_id=invite.workspace_id, user_id=token["uid"], role=invite.role)
        db.add(membership)
    elif membership.role != "admin":
        membership.role = invite.role
    if invite.team_id:
        team = _find_record(db, "teams", invite.team_id, invite.workspace_id)
        if team:
            data = dict(team.payload or {})
            data["memberIds"] = list(dict.fromkeys((data.get("memberIds") or []) + [token["uid"]]))
            if invite.role == "guest":
                data["guestIds"] = list(dict.fromkeys((data.get("guestIds") or []) + [token["uid"]]))
            team.payload = data
            team.revision += 1
    invite.status = "accepted"
    invite.accepted_by_id = token["uid"]
    invite.accepted_at = utcnow()
    _commit(db)
    return {"workspaceId": invite.workspace_id, "role": invite.role}


@router.post("/invitations/{invitation_id}/revoke")
def revoke_invitation(invitation_id: uuid.UUID, token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    invite = db.get(TasklyticInvitation, invitation_id)
    if invite is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    require_admin(db, invite.workspace_id, token["uid"])
    if invite.status == "pending":
        invite.status = "revoked"
    _commit(db)
    return invitation_payload(invite)


@router.post("/actions/deliver-notification")
def deliver_notification(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    notification = validate_payload(body.get("notification"))
    recipient = validate_id(body.get("recipientUserId"), "recipientUserId")
    if notification.get("userId") != recipient:
        raise HTTPException(status_code=422, detail="Notification recipient mismatch")
    result = upsert_record(db, "notifications", notification, token["uid"], None)
    _commit(db)
    return result


@router.post("/email/send")
def send_email(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    require_admin(db, workspace_id, token["uid"])
    recipients = body.get("to") if isinstance(body.get("to"), list) else [body.get("to")]
    ids = []
    for recipient in recipients:
        email = str(recipient or "").strip().lower()
        if not EMAIL_RE.fullmatch(email):
            raise HTTPException(status_code=422, detail="Invalid email recipient")
        sent = email_service.send_html_email(email, str(body.get("subject") or "")[:998], str(body.get("bodyHtml") or ""), str(body.get("bodyText") or ""))
        if not sent:
            raise HTTPException(status_code=502, detail="Email delivery failed")
        ids.append(str(uuid.uuid4()))
    return {"ids": ids}


@router.post("/files:initiate")
async def initiate_file(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    filename, mime_type, size = _validate_upload(body.get("filename"), body.get("content_type"), body.get("size"))
    workspace_id = validate_id(body.get("workspace_id"), "workspace_id")
    get_membership(db, workspace_id, token["uid"])
    scope_type = body.get("scope")
    parent_kind = {"task": "tasks", "comment": "comments", "project": "projects"}.get(scope_type)
    if not parent_kind:
        raise HTTPException(status_code=422, detail="Unsupported upload scope")
    parent = _find_record(db, parent_kind, validate_id(body.get("scope_id"), "scope_id"), workspace_id)
    if parent is None:
        raise HTTPException(status_code=422, detail="Upload scope was not found")
    authorize_mutation(db, parent_kind, parent.payload or {}, workspace_id, token["uid"], parent.payload or {})
    upload_id = uuid.uuid4()
    object_name = f"tasklytic/{workspace_id}/{upload_id}/{quote(filename, safe='._-')}"
    row = TasklyticFileUpload(
        id=upload_id, object_name=object_name, workspace_id=workspace_id, uploader_id=token["uid"],
        scope_type=scope_type, scope_id=parent.record_id, filename=filename, mime_type=mime_type,
        size_bytes=size, expires_at=utcnow() + timedelta(hours=1),
    )
    db.add(row)
    db.flush()
    upload_url = await get_storage_service().generate_presigned_put_url(object_name, expiration_minutes=15, content_type=mime_type)
    _commit(db)
    return {"object_name": object_name, "upload_url": upload_url, "content_type": mime_type}


@router.post("/files:complete")
async def complete_file(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    row = _get_upload(db, str(body.get("object_name") or ""), lock=True)
    if row.uploader_id != token["uid"] or row.state != "initiated" or _expired(row.expires_at):
        raise HTTPException(status_code=403, detail="Upload cannot be completed")
    await _verify_completed_object(row)
    row.state = "completed"
    row.completed_at = utcnow()
    _commit(db)
    return {"ok": True}


@router.get("/files:download-url")
async def download_file_url(
    object_name: str = Query(...), download: bool = Query(default=False), filename: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    row = _get_upload(db, object_name)
    get_membership(db, row.workspace_id, token["uid"])
    parent_kind = {"task": "tasks", "comment": "comments", "project": "projects", "form": "forms"}.get(row.scope_type)
    if parent_kind:
        parent = _find_record(db, parent_kind, row.scope_id, row.workspace_id)
        if parent:
            authorize_record(db, parent_kind, parent.payload or {}, row.workspace_id, token["uid"])
    if row.state not in {"completed", "consumed"}:
        raise HTTPException(status_code=409, detail="Upload is not complete")
    url = await get_storage_service().generate_presigned_get_url(object_name, expiration_minutes=15, download_filename=(filename or row.filename) if download else None)
    return {"url": url}


@router.delete("/files")
async def delete_file(object_name: str = Query(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    row = _get_upload(db, object_name, lock=True)
    member = get_membership(db, row.workspace_id, token["uid"])
    parent_kind = {"task": "tasks", "comment": "comments", "project": "projects"}.get(row.scope_type)
    parent = _find_record(db, parent_kind, row.scope_id, row.workspace_id) if parent_kind else None
    if parent:
        authorize_record(db, parent_kind, parent.payload or {}, row.workspace_id, token["uid"])
    if row.uploader_id != token["uid"] and member.role != "admin":
        raise HTTPException(status_code=403, detail="Only the uploader or an administrator may delete this file")
    await get_storage_service().delete_file(row.object_name)
    row.state = "deleted"
    _commit(db)
    return {"ok": True}


@router.post("/ai/generate")
async def ai_generate(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    prompt = body.get("prompt")
    history = body.get("history") or []
    scope = body.get("scope") or ((body.get("context") or {}).get("scope"))
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 20_000:
        raise HTTPException(status_code=422, detail="A valid prompt is required")
    if not isinstance(history, list) or len(history) > 20 or any(not isinstance(v, dict) or v.get("role") not in {"user", "assistant"} or not isinstance(v.get("content"), str) or len(v["content"]) > 20_000 for v in history):
        raise HTTPException(status_code=422, detail="Invalid AI history")
    if not isinstance(scope, dict):
        raise HTTPException(status_code=422, detail="An AI scope is required")
    try:
        return await asyncio.wait_for(generate_tasklytic_response(db, token["uid"], prompt.strip(), history, body.get("model"), scope), timeout=60)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI request timed out")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except PlanLimitExceeded as exc:
        raise HTTPException(status_code=402, detail=str(exc))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="AI service is temporarily unavailable")


@router.post("/clear")
def clear(token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    if not is_local() or os.getenv("ENVIRONMENT", "").lower() == "production":
        raise HTTPException(status_code=404, detail="Not found")
    clear_user_data(db, token["uid"])
    _commit(db)
    return {"ok": True}


# Generic routes deliberately come last so named specialized paths win.
@router.get("/{entity}")
def get_collection(
    entity: str, workspace_id: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    return list_records(db, entity, token["uid"], workspace_id)


@router.put("/{entity}")
def put_collection(
    entity: str, items: list[Any] = Body(...), workspace_id: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    result = replace_collection(db, entity, items, token["uid"], workspace_id)
    _commit(db)
    return result


@router.put("/{entity}/{record_id}")
def put_record(
    entity: str, record_id: str, body: dict[str, Any] = Body(...), workspace_id: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    validate_id(record_id)
    expected = body.get("id") or ("session" if entity == "session" else None)
    if expected != record_id:
        raise HTTPException(status_code=422, detail="Path id does not match payload id")
    result = upsert_record(db, entity, body, token["uid"], workspace_id)
    _commit(db)
    return result


@router.delete("/{entity}/{record_id}", status_code=204)
def remove_record(
    entity: str, record_id: str, workspace_id: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    delete_record(db, entity, record_id, token["uid"], workspace_id)
    _commit(db)
    return None
