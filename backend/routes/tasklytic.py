"""Authenticated and public APIs for Tasklytic project management."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import uuid
from collections.abc import Callable
from datetime import timedelta
from decimal import Decimal
from pathlib import PurePath
from typing import Any
from urllib.parse import quote

import stripe
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.database import db_config, get_db
from core.runtime import frontend_base_url, is_local
from dependencies.auth import verify_firebase_token
from models.tasklytic import (
    TasklyticCommand,
    TasklyticCommandRun,
    TasklyticAiUsageEvent,
    TasklyticEntityRecord,
    TasklyticFileUpload,
    TasklyticInvitation,
    TasklyticIntegrationConnection,
    TasklyticWorkspace,
    TasklyticWorkspaceMember,
)
from services.email_service import email_service
from services.billing_service import PlanLimitExceeded
from services.gcs_service import get_storage_service
from services.rate_limit import rate_limiter
from services.tasklytic_ai_service import generate_tasklytic_response
from services.tasklytic_ai_contracts import SUPPORTED_VERTEX_MODELS
from services.tasklytic_ai_persistence import (
    accept_proposal,
    create_thread,
    discard_proposal,
    edit_proposal,
    get_or_create_settings,
    list_audit,
    list_teammates,
    list_threads,
    migrate_local_threads,
    proposal_payload,
    settings_payload,
    teammate_payload,
    thread_payload,
    update_settings,
    upsert_teammate,
)
from services.tasklytic_automation import AUTOMATION_RULE_RUN
from services.tasklytic_commands import (
    command_payload,
    command_run_payload,
    execute_inline_command,
    mutation_command_type,
    retry_failed_command,
)
from services.tasklytic_reporting import reporting_sources_payload
from services.tasklytic_psa import execute_psa_action
from services.tasklytic_billing import (
    create_fx_quote,
    finalize_invoice_delivery,
    generate_invoice,
    invoice_action,
    invoice_pdf,
    record_payment,
    record_trust_transaction,
    reverse_payment,
    reverse_trust_transaction,
)
from services.tasklytic_integrations import (
    SUPPORTED_PROVIDERS,
    create_stripe_payment_link,
    extract_receipt,
    import_google_drive_files,
    integration_capabilities,
    list_google_drive_files,
    queue_email_delivery,
    reconcile_stripe_event,
    record_usage_event,
    upsert_connection,
)
from services.shared_clients import ensure_firm_for_token
from services.tasklytic_service import (
    ENTITY_POLICIES,
    append_workspace_event,
    bootstrap,
    capabilities_for_user,
    clear_user_data,
    delete_record,
    get_membership,
    invitation_payload,
    format_revision_etag,
    list_workspace_events,
    list_records,
    provision_bundle,
    parse_revision_etag,
    require_admin,
    resolve_workspace_id,
    token_hash,
    upsert_record,
    utcnow,
    validate_id,
    validate_kind,
    validate_payload,
    workspace_payload,
    workspace_event_payload,
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
    if row.scope_type == "invoice_brand":
        content = await asyncio.to_thread(blob.download_as_bytes)
        signature_ok = (
            row.mime_type == "image/png" and content.startswith(b"\x89PNG\r\n\x1a\n")
        ) or (
            row.mime_type == "image/jpeg" and content.startswith(b"\xff\xd8\xff")
        )
        if not signature_ok:
            raise HTTPException(status_code=415, detail="Invoice logos must be valid PNG or JPEG images")


def _published_form_row(db: Session, form_key: str) -> TasklyticEntityRecord:
    rows = db.query(TasklyticEntityRecord).filter_by(entity_kind="forms").all()
    for row in rows:
        data = row.payload or {}
        if (data.get("id") == form_key or data.get("publicSlug") == form_key) and data.get("isPublic") is True:
            return row
    raise HTTPException(status_code=404, detail="Published form not found")


def _public_form_row(db: Session, form_key: str) -> TasklyticEntityRecord:
    row = _published_form_row(db, form_key)
    if (row.payload or {}).get("accessMode", "public") != "public":
        raise HTTPException(status_code=401, detail="Sign in is required for this form")
    workspace = db.get(TasklyticWorkspace, row.workspace_id)
    settings = ((workspace.payload or {}).get("settings") or {}) if workspace else {}
    if settings.get("allowPublicForms") is False:
        raise HTTPException(status_code=401, detail="Sign in is required for this form")
    return row


def _form_spam_secret() -> bytes:
    return os.getenv("TASKLYTIC_FORM_SPAM_SECRET", os.getenv("SECRET_KEY", "tasklytic-test-form-secret")).encode()


def _submission_token(row: TasklyticEntityRecord) -> str:
    issued = int(utcnow().timestamp())
    value = f"{row.workspace_id}:{row.record_id}:{issued}"
    signature = hmac.new(_form_spam_secret(), value.encode(), hashlib.sha256).hexdigest()
    return f"{issued}.{signature}"


def _validate_submission_token(row: TasklyticEntityRecord, supplied: Any) -> None:
    try:
        issued_text, signature = str(supplied or "").split(".", 1)
        issued = int(issued_text)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="A valid submission token is required")
    age = int(utcnow().timestamp()) - issued
    value = f"{row.workspace_id}:{row.record_id}:{issued}"
    expected = hmac.new(_form_spam_secret(), value.encode(), hashlib.sha256).hexdigest()
    if age < 0 or age > 86400 or not secrets.compare_digest(signature, expected):
        raise HTTPException(status_code=422, detail="The submission token is invalid or expired")


def _sanitize_public_form(data: dict[str, Any], submission_token: str | None = None) -> dict[str, Any]:
    result = {
        "id": data.get("id"),
        "name": data.get("name"),
        "description": data.get("description"),
        "fields": data.get("fields") or [],
        "isPublic": True,
        "accessMode": data.get("accessMode") or "public",
        "publicSlug": data.get("publicSlug"),
        "confirmationMessage": data.get("confirmationMessage") or "Thanks for your submission.",
        "branding": data.get("branding"),
        "copyAnswersToDescription": False,
        "createdAt": data.get("createdAt"),
    }
    if submission_token:
        result["submissionToken"] = submission_token
    return result


def _field_is_visible(field: dict[str, Any], answers: dict[str, Any]) -> bool:
    rule = field.get("visibleIf")
    if not isinstance(rule, dict):
        return True
    value = answers.get(rule.get("fieldId"))
    is_set = value not in (None, "", [])
    if rule.get("op") == "is_set":
        return is_set
    if rule.get("op") == "is_not_set":
        return not is_set
    if rule.get("op") == "eq":
        return rule.get("value") in value if isinstance(value, list) else value == rule.get("value")
    if rule.get("op") == "neq":
        return rule.get("value") not in value if isinstance(value, list) else value != rule.get("value")
    return False


def _validate_public_answers(form: dict[str, Any], answers: Any) -> dict[str, Any]:
    if not isinstance(answers, dict):
        raise HTTPException(status_code=422, detail="answers must be an object")
    fields = form.get("fields") or []
    known = {field.get("id") for field in fields if isinstance(field, dict)}
    if any(key not in known for key in answers):
        raise HTTPException(status_code=422, detail="answers contain an unknown field")
    for field in fields:
        if not _field_is_visible(field, answers):
            answers.pop(field.get("id"), None)
            continue
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
    row = _public_form_row(db, form_key)
    return _sanitize_public_form(row.payload or {}, _submission_token(row))


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


def _submit_public_form_command(
    form_key: str,
    request: Request,
    body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    *,
    allow_workspace: bool = False,
    submitted_by: str | None = None,
):
    form_row = _published_form_row(db, form_key) if allow_workspace else _public_form_row(db, form_key)
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
    if submitted_by:
        submission["submittedBy"] = submitted_by
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
    return {"taskId": task_id, "submissionId": submission_id, "replayed": False}


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
    if body.get("website"):
        raise HTTPException(status_code=422, detail="Submission rejected")
    _validate_submission_token(form_row, body.get("submissionToken"))
    form = form_row.payload or {}
    key = (idempotency_key or body.get("idempotencyKey") or "").strip()
    if not key or len(key) > 128:
        raise HTTPException(status_code=422, detail="A valid Idempotency-Key header is required")
    submission_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:{form_row.workspace_id}:{form.get('id')}:{key}"))
    result, _command, replayed = execute_inline_command(
        db,
        command_type="domain.public_form.submit",
        deduplication_key=submission_id,
        payload={"formId": form.get("id"), "submissionId": submission_id},
        actor_id=str(((_find_record(db, "projects", str(form.get("projectId")), form_row.workspace_id) or form_row).payload or {}).get("ownerId") or "public-form"),
        workspace_id=form_row.workspace_id,
        operation=lambda: _submit_public_form_command(form_key, request, body, idempotency_key, db),
    )
    _commit(db)
    if replayed and isinstance(result, dict):
        result = {**result, "replayed": True}
    return result


@router.get("/forms/{form_key}/definition")
def get_authenticated_form(
    form_key: str,
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    row = _published_form_row(db, form_key)
    get_membership(db, row.workspace_id, token["uid"])
    return _sanitize_public_form(row.payload or {})


@router.post("/forms/{form_key}/files:initiate")
async def initiate_authenticated_form_file(
    form_key: str,
    body: dict[str, Any] = Body(...),
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    form_row = _published_form_row(db, form_key)
    get_membership(db, form_row.workspace_id, token["uid"])
    filename, mime_type, size = _validate_upload(body.get("filename"), body.get("content_type"), body.get("size"))
    upload_id = uuid.uuid4()
    upload_token = secrets.token_urlsafe(32)
    object_name = f"tasklytic/{form_row.workspace_id}/forms/{upload_id}/{quote(filename, safe='._-')}"
    db.add(TasklyticFileUpload(
        id=upload_id,
        object_name=object_name,
        workspace_id=form_row.workspace_id,
        uploader_id=token["uid"],
        scope_type="form",
        scope_id=str((form_row.payload or {}).get("id")),
        filename=filename,
        mime_type=mime_type,
        size_bytes=size,
        public_token_hash=token_hash(upload_token),
        expires_at=utcnow() + timedelta(hours=1),
    ))
    db.flush()
    upload_url = await get_storage_service().generate_presigned_put_url(
        object_name, expiration_minutes=15, content_type=mime_type
    )
    _commit(db)
    return {
        "object_name": object_name,
        "upload_url": upload_url,
        "upload_token": upload_token,
        "content_type": mime_type,
    }


@router.post("/forms/{form_key}/submit")
def submit_authenticated_form(
    form_key: str,
    request: Request,
    body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    row = _published_form_row(db, form_key)
    get_membership(db, row.workspace_id, token["uid"])
    key = (idempotency_key or body.get("idempotencyKey") or "").strip()
    if not key or len(key) > 128:
        raise HTTPException(status_code=422, detail="A valid Idempotency-Key header is required")
    submission_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:{row.workspace_id}:{(row.payload or {}).get('id')}:{key}"))
    result, _command, replayed = execute_inline_command(
        db,
        command_type="domain.authenticated_form.submit",
        deduplication_key=submission_id,
        payload={"formId": (row.payload or {}).get("id"), "submissionId": submission_id},
        actor_id=token["uid"],
        workspace_id=row.workspace_id,
        operation=lambda: _submit_public_form_command(
            form_key, request, body, idempotency_key, db,
            allow_workspace=True, submitted_by=token["uid"],
        ),
    )
    _commit(db)
    if replayed and isinstance(result, dict):
        result = {**result, "replayed": True}
    return result


@router.get("/bootstrap")
def get_bootstrap(
    workspace_id: str | None = Query(default=None),
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    return bootstrap(db, token["uid"], workspace_id)


@router.get("/capabilities")
def get_capabilities(
    workspace_id: str = Query(...),
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    workspace_id = validate_id(workspace_id, "workspace_id")
    return {"workspaceId": workspace_id, "capabilities": capabilities_for_user(db, workspace_id, token["uid"])}


@router.get("/reporting/sources")
def get_reporting_sources(
    workspace_id: str = Query(...),
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    workspace_id = validate_id(workspace_id, "workspace_id")
    get_membership(db, workspace_id, token["uid"])
    return {"workspaceId": workspace_id, "sources": reporting_sources_payload()}


def _authorize_command_admin(db: Session, command: TasklyticCommand, user_id: str) -> None:
    if command.workspace_id:
        require_admin(db, command.workspace_id, user_id)
    elif command.actor_id != user_id:
        raise HTTPException(status_code=403, detail="Command diagnostics are restricted to administrators")


@router.get("/commands")
def list_commands(
    workspace_id: str = Query(...),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=250),
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    workspace_id = validate_id(workspace_id, "workspace_id")
    require_admin(db, workspace_id, token["uid"])
    query = db.query(TasklyticCommand).filter_by(workspace_id=workspace_id)
    if status:
        statuses = {item.strip() for item in status.split(",") if item.strip()}
        if not statuses or not statuses.issubset({"pending", "leased", "retry", "succeeded", "failed"}):
            raise HTTPException(status_code=422, detail="Invalid command status filter")
        query = query.filter(TasklyticCommand.status.in_(statuses))
    rows = query.order_by(TasklyticCommand.created_at.desc()).limit(limit).all()
    return {"commands": [command_payload(row) for row in rows]}


@router.get("/commands/{command_id}")
def get_command_diagnostics(
    command_id: uuid.UUID,
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    command = db.get(TasklyticCommand, command_id)
    if command is None:
        raise HTTPException(status_code=404, detail="Command not found")
    _authorize_command_admin(db, command, token["uid"])
    runs = db.query(TasklyticCommandRun).filter_by(command_id=command.id).order_by(TasklyticCommandRun.attempt).all()
    return {**command_payload(command, include_payload=True), "runs": [command_run_payload(run) for run in runs]}


@router.post("/commands/{command_id}/retry")
def retry_command(
    command_id: uuid.UUID,
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    command = db.get(TasklyticCommand, command_id)
    if command is None:
        raise HTTPException(status_code=404, detail="Command not found")
    _authorize_command_admin(db, command, token["uid"])
    retry_failed_command(db, command)
    _commit(db)
    return command_payload(command)


@router.get("/automation/rules/{rule_id}/runs")
def list_rule_runs(
    rule_id: str,
    workspace_id: str = Query(...),
    limit: int = Query(default=50, ge=1, le=100),
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    """Visible, retry-aware rule history backed by durable command attempts."""

    workspace_id = validate_id(workspace_id, "workspace_id")
    rule_id = validate_id(rule_id, "rule_id")
    rule = _find_record(db, "rules", rule_id, workspace_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    authorize_record(db, "rules", rule.payload or {}, workspace_id, token["uid"])
    rows = (
        db.query(TasklyticCommand)
        .filter(
            TasklyticCommand.workspace_id == workspace_id,
            TasklyticCommand.command_type.in_({AUTOMATION_RULE_RUN, "maintenance.scheduled_rule"}),
        )
        .order_by(TasklyticCommand.created_at.desc())
        .limit(500)
        .all()
    )
    matching = [row for row in rows if str((row.payload or {}).get("ruleId")) == rule_id][:limit]
    history = []
    for command in matching:
        attempts = (
            db.query(TasklyticCommandRun)
            .filter_by(command_id=command.id)
            .order_by(TasklyticCommandRun.attempt)
            .all()
        )
        history.append({
            **command_payload(command),
            "ruleId": rule_id,
            "taskId": (command.payload or {}).get("taskId"),
            "taskName": (command.result or {}).get("taskName") or (command.payload or {}).get("taskName") or "Task",
            "actionsApplied": (command.result or {}).get("actionsApplied") or [],
            "event": (command.payload or {}).get("event"),
            "runs": [command_run_payload(run) for run in attempts],
        })
    return {"ruleId": rule_id, "runs": history}


@router.post("/automation/runs/{command_id}/retry")
def retry_rule_run(
    command_id: uuid.UUID,
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    command = db.get(TasklyticCommand, command_id)
    if command is None or command.command_type not in {AUTOMATION_RULE_RUN, "maintenance.scheduled_rule"}:
        raise HTTPException(status_code=404, detail="Rule run not found")
    rule = _find_record(db, "rules", str((command.payload or {}).get("ruleId")), command.workspace_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    authorize_mutation(
        db,
        "rules",
        rule.payload or {},
        command.workspace_id,
        token["uid"],
        rule.payload or {},
    )
    retry_failed_command(db, command)
    _commit(db)
    return command_payload(command)


def _event_cursor(cursor: int | None, last_event_id: str | None) -> int:
    raw: int | str | None = cursor if cursor is not None else last_event_id
    if raw in (None, ""):
        return 0
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Event cursor must be a non-negative integer")
    if parsed < 0:
        raise HTTPException(status_code=422, detail="Event cursor must be a non-negative integer")
    return parsed


SessionFactory = Callable[[], Session]


def _workspace_event_session_factory() -> SessionFactory:
    return db_config.get_session


def _workspace_event_batch(
    session_factory: SessionFactory,
    workspace_id: str,
    user_id: str,
    after_id: int,
) -> list[tuple[int, str]]:
    """Read one event batch without retaining a connection between polls."""
    db = session_factory()
    try:
        rows = list_workspace_events(db, workspace_id, user_id, after_id)
        return [
            (
                row.id,
                json.dumps(workspace_event_payload(row), separators=(",", ":")),
            )
            for row in rows
        ]
    finally:
        db.close()


@router.get("/workspaces/{workspace_id}/events")
async def stream_workspace_events(
    workspace_id: str,
    request: Request,
    cursor: int | None = Query(default=None),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    token: dict = Depends(verify_firebase_token),
    session_factory: SessionFactory = Depends(_workspace_event_session_factory),
):
    workspace_id = validate_id(workspace_id, "workspace_id")
    next_cursor = _event_cursor(cursor, last_event_id)
    # Load once before starting the response so authorization errors retain
    # their normal HTTP status. Every batch owns and closes its session; a
    # long-lived SSE client must never reserve a database connection.
    initial_batch = await run_in_threadpool(
        _workspace_event_batch,
        session_factory,
        workspace_id,
        token["uid"],
        next_cursor,
    )

    async def events():
        nonlocal next_cursor
        idle_ticks = 0
        batch: list[tuple[int, str]] | None = initial_batch
        while not await request.is_disconnected():
            if batch is None:
                batch = await run_in_threadpool(
                    _workspace_event_batch,
                    session_factory,
                    workspace_id,
                    token["uid"],
                    next_cursor,
                )
            if batch:
                idle_ticks = 0
                for event_id, data in batch:
                    next_cursor = event_id
                    yield f"id: {event_id}\nevent: workspace-change\ndata: {data}\n\n"
                batch = None
                continue
            batch = None
            idle_ticks += 1
            if idle_ticks >= 15:
                idle_ticks = 0
                yield f": keep-alive {next_cursor}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/provision")
def provision(
    body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    bundle = body.get("bundle", body)
    if idempotency_key is not None and (not idempotency_key.strip() or len(idempotency_key.strip()) > 128):
        raise HTTPException(status_code=422, detail="Invalid Idempotency-Key header")
    # Firm/profile setup may commit when this is the user's first product visit,
    # so it must complete before the Tasklytic transactional command begins.
    ensure_firm_for_token(db, token)
    result, _command, _replayed = execute_inline_command(
        db,
        command_type="domain.workspace.provision",
        deduplication_key=(idempotency_key or str(uuid.uuid4())).strip(),
        payload={"bundleVersion": "v1"},
        actor_id=token["uid"],
        workspace_id=None,
        operation=lambda: provision_bundle(db, bundle, token),
    )
    _commit(db)
    return result


@router.post("/invitations/send")
def send_invitations(
    body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
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
    if idempotency_key is not None and (not idempotency_key.strip() or len(idempotency_key.strip()) > 128):
        raise HTTPException(status_code=422, detail="Invalid Idempotency-Key header")

    def operation():
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
            append_workspace_event(
                db, workspace_id, token["uid"], "workspaceInvitations",
                str(invite.id), "created", invite.revision, invitation_payload(invite),
            )
        return {"results": results}

    result, _command, _replayed = execute_inline_command(
        db,
        command_type="domain.invitation.send",
        deduplication_key=(idempotency_key or str(uuid.uuid4())).strip(),
        payload={"emails": emails, "role": role, "teamId": team_id},
        actor_id=token["uid"],
        workspace_id=workspace_id,
        operation=operation,
    )
    _commit(db)
    return result


@router.post("/invitations/accept")
def accept_invitation(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    plain = str(body.get("token") or "").strip()
    if len(plain) < 20:
        raise HTTPException(status_code=422, detail="Invitation token is invalid")
    invite = db.query(TasklyticInvitation).filter_by(token_hash=token_hash(plain)).with_for_update().one_or_none()
    if invite is None or invite.status != "pending":
        raise HTTPException(status_code=409, detail="This invitation is invalid or is no longer available")
    if _expired(invite.expires_at):
        def expire_operation():
            invite.status = "expired"
            invite.revision += 1
            append_workspace_event(
                db, invite.workspace_id, token["uid"], "workspaceInvitations",
                str(invite.id), "updated", invite.revision, invitation_payload(invite),
            )
            return {"invitationId": str(invite.id), "status": "expired"}

        execute_inline_command(
            db,
            command_type="domain.invitation.expire",
            deduplication_key=str(invite.id),
            payload={"invitationId": str(invite.id)},
            actor_id=token["uid"],
            workspace_id=invite.workspace_id,
            operation=expire_operation,
        )
        _commit(db)
        raise HTTPException(status_code=410, detail="This invitation has expired")
    email = str(token.get("email") or "").strip().lower()
    if not token.get("email_verified") or email != invite.email:
        raise HTTPException(status_code=403, detail=f"Sign in with the verified address {invite.email} to accept this invitation")
    def operation():
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
        invite.revision += 1
        append_workspace_event(
            db, invite.workspace_id, token["uid"], "workspaceInvitations",
            str(invite.id), "updated", invite.revision, invitation_payload(invite),
        )
        return {"workspaceId": invite.workspace_id, "role": invite.role}

    result, _command, _replayed = execute_inline_command(
        db,
        command_type="domain.invitation.accept",
        deduplication_key=str(invite.id),
        payload={"invitationId": str(invite.id)},
        actor_id=token["uid"],
        workspace_id=invite.workspace_id,
        operation=operation,
    )
    _commit(db)
    return result


@router.post("/invitations/{invitation_id}/revoke")
def revoke_invitation(invitation_id: uuid.UUID, token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    invite = db.get(TasklyticInvitation, invitation_id)
    if invite is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    require_admin(db, invite.workspace_id, token["uid"])
    if invite.status == "pending":
        def operation():
            invite.status = "revoked"
            invite.revision += 1
            append_workspace_event(
                db, invite.workspace_id, token["uid"], "workspaceInvitations",
                str(invite.id), "updated", invite.revision, invitation_payload(invite),
            )
            return invitation_payload(invite)

        result, _command, _replayed = execute_inline_command(
            db,
            command_type="domain.invitation.revoke",
            deduplication_key=str(invite.id),
            payload={"invitationId": str(invite.id)},
            actor_id=token["uid"],
            workspace_id=invite.workspace_id,
            operation=operation,
        )
    else:
        result = invitation_payload(invite)
    _commit(db)
    return result


@router.post("/actions/deliver-notification")
def deliver_notification(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    notification = validate_payload(body.get("notification"))
    recipient = validate_id(body.get("recipientUserId"), "recipientUserId")
    if notification.get("userId") != recipient:
        raise HTTPException(status_code=422, detail="Notification recipient mismatch")
    result = upsert_record(db, "notifications", notification, token["uid"], None)
    _commit(db)
    return result


@router.post("/email/send", status_code=202)
def send_email(
    body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    key = _idempotency_key(idempotency_key, body)
    command, replayed = queue_email_delivery(
        db, workspace_id=workspace_id, actor_id=token["uid"], body=body,
        idempotency_key=key,
    )
    result = dict(command.result or {})
    _commit(db)
    return {
        **result, "commandId": str(command.id), "status": command.status,
        "replayed": replayed, "ids": result.get("ids", []),
    }


@router.get("/integrations/capabilities")
def get_integration_capabilities(
    workspace_id: str = Query(...), token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    return {"capabilities": integration_capabilities(db, workspace_id, token["uid"])}


@router.put("/integrations/{provider}")
def configure_integration(
    provider: str, body: dict[str, Any] = Body(...),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    require_admin(db, workspace_id, token["uid"])
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unsupported integration")
    row = upsert_connection(
        db, workspace_id=workspace_id, provider=provider,
        owner_user_id=token["uid"],
        external_account_id=str(body.get("externalAccountId") or "").strip() or None,
        status="disabled" if body.get("enabled") is False else "active",
        capability=body.get("capability") if isinstance(body.get("capability"), dict) else {},
    )
    _commit(db)
    return {"provider": row.provider, "status": row.status, "revision": row.revision}


@router.get("/integrations/google-drive/files")
def google_drive_files(
    workspace_id: str = Query(...), q: str | None = Query(default=None, max_length=255),
    page_token: str | None = Query(default=None, max_length=1024),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    result = list_google_drive_files(
        db, workspace_id=workspace_id, actor_id=token["uid"], query=q,
        page_token=page_token,
    )
    _commit(db)
    return result


@router.post("/integrations/google-drive:import")
def google_drive_import(
    body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    result = import_google_drive_files(
        db, workspace_id=workspace_id, actor_id=token["uid"],
        scope_type=str(body.get("scope") or ""), scope_id=str(body.get("scopeId") or ""),
        file_ids=body.get("fileIds") or [],
    )
    _commit(db)
    return result


@router.post("/integrations/vertex/receipts:extract")
async def extract_expense_receipt(
    body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    get_membership(db, workspace_id, token["uid"])
    connection = db.query(TasklyticIntegrationConnection).filter_by(
        workspace_id=workspace_id, provider="vertex_receipts", status="active",
    ).one_or_none()
    if connection is None:
        return {"status": "manual_required", "manualAllowed": True, "reason": "integration_unavailable"}
    upload = _get_upload(db, str(body.get("objectName") or ""))
    if upload.workspace_id != workspace_id or upload.uploader_id != token["uid"] or upload.state not in {"completed", "consumed"}:
        raise HTTPException(status_code=403, detail="Receipt upload is unavailable")
    blob = get_storage_service().bucket.blob(upload.object_name)
    content = await asyncio.to_thread(blob.download_as_bytes)
    return extract_receipt(content, upload.mime_type)


@router.post("/billing/invoices/{invoice_id}:payment-link")
def billing_invoice_payment_link(
    invoice_id: str, body: dict[str, Any] = Body(...),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    result = create_stripe_payment_link(
        db, workspace_id=workspace_id, actor_id=token["uid"], invoice_id=invoice_id,
        success_url=str(body.get("successUrl") or ""), cancel_url=str(body.get("cancelUrl") or ""),
    )
    _commit(db)
    return result


@router.post("/integrations/stripe-connect/webhook")
async def stripe_connect_webhook(request: Request, db: Session = Depends(get_db)):
    secret = os.getenv("TASKLYTIC_STRIPE_CONNECT_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="Stripe Connect webhook is not configured")
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, signature, secret)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe Connect webhook") from exc
    result = reconcile_stripe_event(db, dict(event))
    _commit(db)
    return result


@router.post("/events/usage", status_code=202)
def create_usage_event(
    body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
):
    result = record_usage_event(
        db, workspace_id=validate_id(body.get("workspaceId"), "workspaceId"),
        actor_id=token["uid"], event_name=str(body.get("event") or ""),
        properties=body.get("properties") if isinstance(body.get("properties"), dict) else {},
    )
    _commit(db)
    return result


@router.post("/files:initiate")
async def initiate_file(body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    filename, mime_type, size = _validate_upload(body.get("filename"), body.get("content_type"), body.get("size"))
    workspace_id = validate_id(body.get("workspace_id"), "workspace_id")
    get_membership(db, workspace_id, token["uid"])
    scope_type = body.get("scope")
    if scope_type == "invoice_brand":
        require_admin(db, workspace_id, token["uid"])
        if mime_type not in {"image/png", "image/jpeg"}:
            raise HTTPException(status_code=415, detail="Invoice logos must be PNG or JPEG images")
        if size > 2 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Invoice logos may not exceed 2 MB")
    parent_kind = {"task": "tasks", "comment": "comments", "project": "projects"}.get(scope_type)
    if not parent_kind and scope_type not in {"receipt", "invoice_brand"}:
        raise HTTPException(status_code=422, detail="Unsupported upload scope")
    parent = _find_record(db, parent_kind, validate_id(body.get("scope_id"), "scope_id"), workspace_id) if parent_kind else None
    if parent_kind and parent is None:
        raise HTTPException(status_code=422, detail="Upload scope was not found")
    if parent:
        authorize_mutation(db, parent_kind, parent.payload or {}, workspace_id, token["uid"], parent.payload or {})
    upload_id = uuid.uuid4()
    object_name = f"tasklytic/{workspace_id}/{upload_id}/{quote(filename, safe='._-')}"
    row = TasklyticFileUpload(
        id=upload_id, object_name=object_name, workspace_id=workspace_id, uploader_id=token["uid"],
        scope_type=scope_type, scope_id=parent.record_id if parent else workspace_id, filename=filename, mime_type=mime_type,
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
    if row.scope_type in {"invoice_brand", "invoice_pdf"}:
        raise HTTPException(status_code=409, detail="Issued invoice and branding objects are immutable")
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


@router.get("/ai/models")
def ai_models(token: dict = Depends(verify_firebase_token)):
    return {"models": list(SUPPORTED_VERTEX_MODELS)}


@router.get("/ai/settings")
def ai_settings(
    workspace_id: str = Query(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    row = get_or_create_settings(db, workspace_id, token["uid"])
    _commit(db)
    return settings_payload(row)


@router.put("/ai/settings")
def put_ai_settings(
    body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    try:
        row = update_settings(db, validate_id(body.get("workspaceId"), "workspaceId"), token["uid"], body)
        _commit(db)
        return settings_payload(row)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/ai/threads")
def get_ai_threads(
    workspace_id: str = Query(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    return {"threads": list_threads(db, workspace_id, token["uid"])}


@router.post("/ai/threads", status_code=201)
def post_ai_thread(
    body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    try:
        row = create_thread(db, validate_id(body.get("workspaceId"), "workspaceId"), token["uid"], body)
        _commit(db)
        return thread_payload(db, row)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/ai/threads:migrate")
def migrate_ai_threads(
    body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    try:
        migrated, threads = migrate_local_threads(
            db,
            validate_id(body.get("workspaceId"), "workspaceId"),
            token["uid"],
            str(body.get("migrationId") or ""),
            body.get("threads"),
        )
        _commit(db)
        return {"migrated": migrated, "threads": threads}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/ai/proposals/{proposal_id}")
def patch_ai_proposal(
    proposal_id: uuid.UUID, body: dict[str, Any] = Body(...),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    try:
        row = edit_proposal(db, proposal_id, token["uid"], body)
        _commit(db)
        return proposal_payload(row)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/ai/proposals/{proposal_id}:accept")
def accept_ai_proposal(
    proposal_id: uuid.UUID, token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    try:
        row = accept_proposal(db, proposal_id, token["uid"])
        _commit(db)
        return proposal_payload(row)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/ai/proposals/{proposal_id}:discard")
def discard_ai_proposal(
    proposal_id: uuid.UUID, token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    row = discard_proposal(db, proposal_id, token["uid"])
    _commit(db)
    return proposal_payload(row)


@router.get("/ai/teammates")
def get_ai_teammates(
    workspace_id: str = Query(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    return {"jobs": list_teammates(db, workspace_id, token["uid"])}


@router.put("/ai/teammates")
def put_ai_teammate(
    body: dict[str, Any] = Body(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    try:
        row = upsert_teammate(db, validate_id(body.get("workspaceId"), "workspaceId"), token["uid"], body)
        _commit(db)
        return teammate_payload(row)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/ai/audit")
def get_ai_audit(
    workspace_id: str = Query(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    return {"events": list_audit(db, workspace_id, token["uid"])}


@router.get("/ai/usage")
def get_ai_usage(
    workspace_id: str = Query(...), token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    require_admin(db, workspace_id, token["uid"])
    rows = db.query(TasklyticAiUsageEvent).filter_by(workspace_id=workspace_id).order_by(
        TasklyticAiUsageEvent.created_at.desc()
    ).limit(250).all()
    return {"events": [{
        "id": str(row.id), "userId": row.user_id, "eventType": row.event_type, "model": row.model,
        "threadId": row.thread_id, "jobId": str(row.job_id) if row.job_id else None,
        "promptTokens": row.prompt_tokens, "outputTokens": row.output_tokens, "totalTokens": row.total_tokens,
        "createdAt": row.created_at.isoformat(),
    } for row in rows]}


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
        result = await asyncio.wait_for(generate_tasklytic_response(
            db, token["uid"], prompt.strip(), history, body.get("model"), scope, body.get("threadId")
        ), timeout=60)
        _commit(db)
        return result
    except asyncio.TimeoutError:
        db.rollback()
        raise HTTPException(status_code=504, detail="AI request timed out")
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))
    except PlanLimitExceeded as exc:
        db.rollback()
        raise HTTPException(status_code=402, detail=str(exc))
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=502, detail="AI service is temporarily unavailable")


@router.post("/clear")
def clear(token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db)):
    if not is_local() or os.getenv("ENVIRONMENT", "").lower() == "production":
        raise HTTPException(status_code=404, detail="Not found")
    execute_inline_command(
        db,
        command_type="domain.user.clear",
        deduplication_key=str(uuid.uuid4()),
        payload={},
        actor_id=token["uid"],
        workspace_id=None,
        operation=lambda: clear_user_data(db, token["uid"]),
    )
    _commit(db)
    return {"ok": True}


def _idempotency_key(header_value: str | None, body: dict[str, Any]) -> str:
    key = (header_value or str(body.get("idempotencyKey") or "")).strip()
    if not key or len(key) > 128:
        raise HTTPException(status_code=422, detail="A valid Idempotency-Key is required")
    return key


def _invoice_email_template(template: str, invoice: dict[str, Any], payment_url: str | None = None) -> str:
    snapshot = invoice.get("documentSnapshot") or {}
    issuer = snapshot.get("issuer") or {}
    values = {
        "{invoiceNumber}": str(invoice.get("invoiceNumber") or invoice.get("id") or ""),
        "{issuerName}": str(issuer.get("issuerDisplayName") or "your service provider"),
        "{amountDue}": f"{invoice.get('currency') or ''} {Decimal(str(invoice.get('amountOutstanding') or 0)):.2f}".strip(),
        "{dueDate}": str(invoice.get("dueOn") or ""),
        "{paymentLink}": payment_url or "",
    }
    result = template
    for placeholder, value in values.items():
        result = result.replace(placeholder, value)
    if payment_url and "{paymentLink}" not in template:
        result = f"{result.rstrip()}\n\nPay securely: {payment_url}"
    return result


@router.post("/billing/invoices:generate")
def billing_generate_invoice(
    body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    get_membership(db, workspace_id, token["uid"])
    key = _idempotency_key(idempotency_key, body)
    result, _command, replayed = execute_inline_command(
        db, command_type="domain.billing.invoice.generate",
        deduplication_key=f"billing:{workspace_id}:invoice:generate:{key}",
        payload=body, actor_id=token["uid"], workspace_id=workspace_id,
        operation=lambda: generate_invoice(db, workspace_id=workspace_id, actor_id=token["uid"], body=body),
    )
    _commit(db)
    return {**result, "replayed": replayed}


@router.post("/billing/invoices/{invoice_id}:{action}")
def billing_invoice_action(
    invoice_id: str, action: str, body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    get_membership(db, workspace_id, token["uid"])
    key = _idempotency_key(idempotency_key, body)
    action_body = dict(body)
    payment_link = None
    if action in {"send", "resend"} and body.get("method") == "email":
        invoice_row = _find_record(db, "invoices", invoice_id, workspace_id)
        if invoice_row is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        current_invoice = dict(invoice_row.payload or {})
        snapshot = current_invoice.get("documentSnapshot") or {}
        snapshotted_email = str(((snapshot.get("billTo") or {}).get("email")) or "").strip().lower()
        action_body["recipient"] = str(body.get("recipient") or snapshotted_email).strip().lower()
        if body.get("includePaymentLink") is True:
            base_url = frontend_base_url().rstrip("/")
            payment_link = create_stripe_payment_link(
                db, workspace_id=workspace_id, actor_id=token["uid"], invoice_id=invoice_id,
                success_url=str(body.get("successUrl") or f"{base_url}/dashboard/project-management?payment=success"),
                cancel_url=str(body.get("cancelUrl") or base_url),
                idempotency_key=f"invoice-payment-link:{invoice_id}:{key}",
            )
    operation = (
        (lambda: record_payment(
            db, invoice_id=invoice_id, workspace_id=workspace_id,
            actor_id=token["uid"], body=action_body,
        ))
        if action == "payment"
        else (lambda: invoice_action(
            db, invoice_id=invoice_id, action=action, workspace_id=workspace_id,
            actor_id=token["uid"], body=action_body,
        ))
    )
    result, _command, replayed = execute_inline_command(
        db, command_type="domain.billing.payment.apply" if action == "payment" else f"domain.billing.invoice.{action}",
        deduplication_key=f"billing:{workspace_id}:invoice:{invoice_id}:{action}:{key}",
        payload=action_body, actor_id=token["uid"], workspace_id=workspace_id,
        operation=operation,
    )
    delivery = None
    if action in {"send", "resend"} and action_body.get("method") == "email":
        recipient = str(action_body.get("recipient") or "").strip().lower()
        invoice = result.get("invoice") or {}
        snapshot = invoice.get("documentSnapshot") or {}
        workspace = db.get(TasklyticWorkspace, workspace_id)
        billing_settings = ((workspace.payload or {}).get("billingSettings") or {}) if workspace else {}
        subject_template = str(action_body.get("subject") or billing_settings.get("emailSubjectTemplate") or "Invoice {invoiceNumber} from {issuerName}")
        message_template = str(action_body.get("message") or billing_settings.get("emailMessageTemplate") or "Please find invoice {invoiceNumber} attached. Amount due: {amountDue}.")
        if len(subject_template) > 998 or len(message_template) > 10000:
            raise HTTPException(status_code=422, detail="Invoice email content exceeds the allowed length")
        payment_url = str((payment_link or {}).get("url") or "") or None
        subject = _invoice_email_template(subject_template, invoice, payment_url)
        message = _invoice_email_template(message_template, invoice, payment_url)
        pdf_content, _digest = invoice_pdf(db, invoice_id=invoice_id, workspace_id=workspace_id, actor_id=token["uid"])
        delivery_id = str(((invoice.get("deliveryHistory") or [{}])[-1]).get("id") or "")
        command, email_replayed = queue_email_delivery(
            db, workspace_id=workspace_id, actor_id=token["uid"],
            idempotency_key=f"invoice:{invoice_id}:{action}:{key}",
            require_workspace_admin=False,
            body={
                "to": recipient,
                "subject": subject,
                "bodyText": message,
                "bodyHtml": "".join(f"<p>{html.escape(part)}</p>" for part in message.split("\n\n") if part),
                "attachments": [{
                    "filename": f"{invoice.get('invoiceNumber') or invoice_id}.pdf",
                    "mimeType": "application/pdf",
                    "contentBase64": base64.b64encode(pdf_content).decode("ascii"),
                }],
                "invoiceDelivery": {"invoiceId": invoice_id, "deliveryId": delivery_id},
            },
        )
        delivery_status = "sent" if command.status == "succeeded" else "failed" if command.status == "failed" else "queued"
        final_invoice = finalize_invoice_delivery(
            db, invoice_id=invoice_id, delivery_id=delivery_id,
            workspace_id=workspace_id, actor_id=token["uid"],
            delivery_status=delivery_status, command_id=str(command.id),
            error=command.failure_detail,
        )
        result = {**result, "invoice": final_invoice}
        delivery = {
            "commandId": str(command.id), "status": delivery_status,
            "replayed": email_replayed, "paymentLink": payment_url,
        }
    _commit(db)
    return {**result, "replayed": replayed, "delivery": delivery}


@router.post("/billing/invoices/{invoice_id}:payment")
def billing_record_payment(
    invoice_id: str, body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    get_membership(db, workspace_id, token["uid"])
    key = _idempotency_key(idempotency_key, body)
    result, _command, replayed = execute_inline_command(
        db, command_type="domain.billing.payment.apply",
        deduplication_key=f"billing:{workspace_id}:invoice:{invoice_id}:payment:{key}",
        payload=body, actor_id=token["uid"], workspace_id=workspace_id,
        operation=lambda: record_payment(
            db, invoice_id=invoice_id, workspace_id=workspace_id,
            actor_id=token["uid"], body=body,
        ),
    )
    _commit(db)
    return {**result, "replayed": replayed}


@router.post("/billing/payments/{payment_id}:reverse")
def billing_reverse_payment(
    payment_id: str, body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    get_membership(db, workspace_id, token["uid"])
    key = _idempotency_key(idempotency_key, body)
    result, _command, replayed = execute_inline_command(
        db, command_type="domain.billing.payment.reverse",
        deduplication_key=f"billing:{workspace_id}:payment:{payment_id}:reverse:{key}",
        payload=body, actor_id=token["uid"], workspace_id=workspace_id,
        operation=lambda: reverse_payment(
            db, payment_id=payment_id, workspace_id=workspace_id,
            actor_id=token["uid"], body=body,
        ),
    )
    _commit(db)
    return {**result, "replayed": replayed}


@router.post("/billing/trust:record")
def billing_record_trust(
    body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    get_membership(db, workspace_id, token["uid"])
    key = _idempotency_key(idempotency_key, body)
    result, _command, replayed = execute_inline_command(
        db, command_type="domain.billing.trust.record",
        deduplication_key=f"billing:{workspace_id}:trust:record:{key}",
        payload=body, actor_id=token["uid"], workspace_id=workspace_id,
        operation=lambda: record_trust_transaction(db, workspace_id=workspace_id, actor_id=token["uid"], body=body),
    )
    _commit(db)
    return {**result, "replayed": replayed}


@router.post("/billing/trust/{transaction_id}:reverse")
def billing_reverse_trust(
    transaction_id: str, body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    get_membership(db, workspace_id, token["uid"])
    key = _idempotency_key(idempotency_key, body)
    result, _command, replayed = execute_inline_command(
        db, command_type="domain.billing.trust.reverse",
        deduplication_key=f"billing:{workspace_id}:trust:{transaction_id}:reverse:{key}",
        payload=body, actor_id=token["uid"], workspace_id=workspace_id,
        operation=lambda: reverse_trust_transaction(
            db, transaction_id=transaction_id, workspace_id=workspace_id,
            actor_id=token["uid"], body=body,
        ),
    )
    _commit(db)
    return {**result, "replayed": replayed}


@router.post("/billing/fx:quote")
def billing_fx_quote(
    body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    get_membership(db, workspace_id, token["uid"])
    key = _idempotency_key(idempotency_key, body)
    result, _command, replayed = execute_inline_command(
        db, command_type="domain.billing.fx.quote",
        deduplication_key=f"billing:{workspace_id}:fx:quote:{key}",
        payload=body, actor_id=token["uid"], workspace_id=workspace_id,
        operation=lambda: create_fx_quote(db, workspace_id=workspace_id, actor_id=token["uid"], body=body),
    )
    _commit(db)
    return {**result, "replayed": replayed}


@router.get("/billing/invoices/{invoice_id}/pdf")
def billing_invoice_pdf(
    invoice_id: str, workspace_id: str = Query(...),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    get_membership(db, workspace_id, token["uid"])
    content, sha256 = invoice_pdf(db, invoice_id=invoice_id, workspace_id=workspace_id, actor_id=token["uid"])
    return Response(
        content=content, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{invoice_id}.pdf"', "X-Content-SHA256": sha256},
    )


@router.post("/psa/{entity}/{record_id}:{action}")
def psa_lifecycle_action(
    entity: str, record_id: str, action: str,
    body: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    workspace_id = validate_id(body.get("workspaceId"), "workspaceId")
    get_membership(db, workspace_id, token["uid"])
    key = (idempotency_key or str(body.get("idempotencyKey") or "")).strip()
    if not key or len(key) > 128:
        raise HTTPException(status_code=422, detail="A valid Idempotency-Key is required")
    result, _command, replayed = execute_inline_command(
        db,
        command_type=f"domain.psa.{entity}.{action}",
        deduplication_key=f"psa:{workspace_id}:{entity}:{record_id}:{action}:{key}",
        payload={"entity": entity, "recordId": record_id, "action": action, "body": body},
        actor_id=token["uid"], workspace_id=workspace_id,
        operation=lambda: execute_psa_action(
            db, kind=entity, record_id=record_id, action=action, body=body,
            actor_id=token["uid"], workspace_id=workspace_id,
        ),
    )
    _commit(db)
    return {**result, "replayed": replayed}


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
    validate_kind(entity)
    raise HTTPException(
        status_code=405,
        detail="Collection replacement is disabled; use revision-checked record endpoints",
    )


@router.put("/{entity}/{record_id}")
def put_record(
    entity: str, record_id: str, response: Response,
    body: dict[str, Any] = Body(...), workspace_id: str | None = Query(default=None),
    if_match: str | None = Header(default=None, alias="If-Match"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    validate_id(record_id)
    expected = body.get("id") or ("session" if entity == "session" else None)
    if expected != record_id:
        raise HTTPException(status_code=422, detail="Path id does not match payload id")
    validate_kind(entity)
    existing = None
    if entity == "workspaces":
        existing = db.get(TasklyticWorkspace, record_id)
    elif entity in {"session", "notifications", "pendingEmails"}:
        owner_id = token["uid"] if entity != "notifications" else body.get("userId")
        existing = db.query(TasklyticEntityRecord).filter_by(
            entity_kind=entity, record_id=record_id, user_id=owner_id,
        ).one_or_none()
    elif workspace_id:
        get_membership(db, workspace_id, token["uid"])
        existing = _find_record(db, entity, record_id, workspace_id)
    expected_revision = parse_revision_etag(if_match) if existing is not None else None
    previous = dict(existing.payload or {}) if existing is not None else None
    command_type = mutation_command_type(entity, body, previous)
    if command_type:
        digest = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        result, _command, _replayed = execute_inline_command(
            db,
            command_type=command_type,
            deduplication_key=f"{entity}:{record_id}:revision:{expected_revision or 0}:{digest}",
            payload={"entity": entity, "recordId": record_id, "expectedRevision": expected_revision, "mutation": body},
            actor_id=token["uid"],
            workspace_id=workspace_id or getattr(existing, "workspace_id", None) or body.get("workspaceId"),
            operation=lambda: upsert_record(
                db,
                entity,
                body,
                token["uid"],
                workspace_id,
                expected_revision,
                enforce_precondition=True,
            ),
        )
    else:
        result = upsert_record(
            db,
            entity,
            body,
            token["uid"],
            workspace_id,
            expected_revision,
            enforce_precondition=True,
        )
    _commit(db)
    response.headers["ETag"] = format_revision_etag(result["revision"])
    return result


@router.delete("/{entity}/{record_id}", status_code=204)
def remove_record(
    entity: str, record_id: str, workspace_id: str | None = Query(default=None),
    if_match: str | None = Header(default=None, alias="If-Match"),
    token: dict = Depends(verify_firebase_token), db: Session = Depends(get_db),
):
    expected_revision = parse_revision_etag(if_match)
    existing = None
    if entity == "workspaces":
        existing = db.get(TasklyticWorkspace, record_id)
    elif workspace_id and entity in {"rules", "invoices", "payments", "timesheets", "expenseReports"}:
        existing = _find_record(db, entity, record_id, workspace_id)
    current = dict(existing.payload or {}) if existing is not None else {}
    command_type = mutation_command_type(entity, current, current)
    if entity == "workspaces":
        command_type = "domain.workspace.delete"
    elif entity in {"rules", "invoices", "payments"}:
        command_type = command_type or f"domain.{entity.rstrip('s')}.execute"
    if command_type:
        execute_inline_command(
            db,
            command_type=command_type,
            deduplication_key=f"delete:{entity}:{record_id}:revision:{expected_revision}",
            payload={"entity": entity, "recordId": record_id, "expectedRevision": expected_revision},
            actor_id=token["uid"],
            workspace_id=None if entity == "workspaces" else workspace_id,
            operation=lambda: delete_record(db, entity, record_id, token["uid"], workspace_id, expected_revision),
        )
    else:
        delete_record(db, entity, record_id, token["uid"], workspace_id, expected_revision)
    _commit(db)
    return None
