"""Production integration boundaries for Tasklytic launch.

Only the five providers in ``SUPPORTED_PROVIDERS`` are exposed. Provider
credentials stay in the host application's encrypted OAuth store or runtime
secret manager; these records contain capability and reconciliation state only.
"""

from __future__ import annotations

import hashlib
import base64
import binascii
import json
import os
import re
import uuid
from datetime import date
from decimal import Decimal
from typing import Any, Callable

import stripe
from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import IntegrationAccount
from models.tasklytic import (
    TasklyticCommand,
    TasklyticCommandRun,
    TasklyticEntityRecord,
    TasklyticExternalReference,
    TasklyticFileUpload,
    TasklyticIntegrationConnection,
    TasklyticUsageEvent,
    TasklyticWebhookReceipt,
)
from services.analytics_ai_service import _get_resp_text, _get_usage_counts, get_client
from services.billing_service import BillingService
from services.email_service import email_service
from services.gcs_service import get_storage_service
from services.google_service import google_service
from services.tasklytic_billing import finalize_invoice_delivery, record_payment
from services.tasklytic_commands import complete_command, enqueue_command, fail_command
from services.tasklytic_service import (
    _find_record,
    authorize_mutation,
    get_membership,
    record_payload,
    require_admin,
    require_capability,
    upsert_record,
    utcnow,
    validate_id,
)


SUPPORTED_PROVIDERS = (
    "google_drive", "vertex_receipts", "gmail", "gcs", "stripe_connect",
)
UNSUPPORTED_PROVIDERS = frozenset({
    "quickbooks", "quickbooks_online", "onedrive", "dropbox", "xero", "netsuite",
    "segment", "mixpanel", "amplitude", "posthog",
})
SAFE_EVENT_NAME = re.compile(r"^[a-z][a-z0-9_.-]{0,95}$")
PRIVATE_PROPERTY_KEYS = frozenset({
    "email", "name", "body", "bodyHtml", "bodyText", "prompt", "notes", "description",
    "token", "secret", "password", "authorization",
})
RECEIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "vendor": {"type": "string"}, "date": {"type": "string"},
        "amount": {"type": "number"}, "taxAmount": {"type": "number"},
        "currency": {"type": "string"},
    },
    "required": ["vendor", "date", "amount", "taxAmount", "currency"],
}


def _connection(db: Session, workspace_id: str, provider: str) -> TasklyticIntegrationConnection | None:
    return db.query(TasklyticIntegrationConnection).filter_by(
        workspace_id=workspace_id, provider=provider,
    ).one_or_none()


def upsert_connection(
    db: Session, *, workspace_id: str, provider: str, owner_user_id: str | None,
    external_account_id: str | None = None, status: str = "active",
    capability: dict[str, Any] | None = None,
) -> TasklyticIntegrationConnection:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=422, detail={"code": "unsupported_integration"})
    row = _connection(db, workspace_id, provider)
    if row is None:
        row = TasklyticIntegrationConnection(
            workspace_id=workspace_id, provider=provider, owner_user_id=owner_user_id,
            external_account_id=external_account_id, status=status, capability=capability or {},
        )
        db.add(row)
    else:
        row.owner_user_id = owner_user_id
        row.external_account_id = external_account_id
        row.status = status
        row.capability = capability or {}
        row.last_error_code = None
        row.last_error_detail = None
        row.revoked_at = None if status != "revoked" else utcnow()
        row.revision += 1
    db.flush()
    return row


def mark_connection_error(
    db: Session, row: TasklyticIntegrationConnection | None, error: BaseException,
    *, revoked: bool = False,
) -> None:
    if row is None:
        return
    row.status = "revoked" if revoked else "degraded"
    row.last_error_code = type(error).__name__[:128]
    row.last_error_detail = str(error)[:2000]
    row.revoked_at = utcnow() if revoked else None
    row.revision += 1


def connection_payload(row: TasklyticIntegrationConnection, available: bool) -> dict[str, Any]:
    return {
        "id": str(row.id), "workspaceId": row.workspace_id, "provider": row.provider,
        "status": row.status, "available": available and row.status == "active",
        "capability": dict(row.capability or {}), "revision": row.revision,
        "lastError": ({"code": row.last_error_code, "detail": row.last_error_detail}
                      if row.last_error_code else None),
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


def integration_capabilities(db: Session, workspace_id: str, actor_id: str) -> list[dict[str, Any]]:
    get_membership(db, workspace_id, actor_id)
    google_account = db.query(IntegrationAccount).filter_by(user_id=actor_id, provider="google").first()
    drive_scopes = set(google_account.scopes or []) if google_account else set()
    configured = {
        "google_drive": bool(google_account and "https://www.googleapis.com/auth/drive.file" in drive_scopes),
        "vertex_receipts": bool(os.getenv("GOOGLE_CLOUD_PROJECT_ID")),
        "gmail": bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS")),
        "gcs": bool(os.getenv("GCS_BUCKET_NAME")),
        "stripe_connect": bool(os.getenv("STRIPE_SECRET_KEY") and os.getenv("TASKLYTIC_STRIPE_CONNECT_WEBHOOK_SECRET")),
    }
    rows = {row.provider: row for row in db.query(TasklyticIntegrationConnection).filter_by(workspace_id=workspace_id).all()}
    result = []
    for provider in SUPPORTED_PROVIDERS:
        row = rows.get(provider)
        result.append({
            "provider": provider,
            "status": row.status if row else "disabled",
            "available": bool(row and row.status == "active" and configured[provider]),
            "capability": dict(row.capability or {}) if row else {},
            "revision": row.revision if row else 0,
            "lastError": ({"code": row.last_error_code, "detail": row.last_error_detail}
                          if row and row.last_error_code else None),
        })
    return result


def list_google_drive_files(
    db: Session, *, workspace_id: str, actor_id: str, query: str | None,
    page_token: str | None, drive=google_service,
) -> dict[str, Any]:
    get_membership(db, workspace_id, actor_id)
    connection = _connection(db, workspace_id, "google_drive")
    if connection is None or connection.status != "active":
        raise HTTPException(status_code=409, detail={"code": "integration_unavailable", "provider": "google_drive"})
    try:
        result = drive.list_drive_files(db, actor_id, query=query, page_size=100, page_token=page_token)
        if result is None:
            raise PermissionError("Google Drive credentials were revoked or no longer grant drive.file")
        files = [{
            "id": str(item.get("id")), "name": str(item.get("name") or "Untitled"),
            "mimeType": str(item.get("mimeType") or "application/octet-stream"),
            "size": int(item.get("size") or 0), "modifiedTime": item.get("modifiedTime"),
        } for item in result.get("files", []) if item.get("id")]
        return {"files": files, "nextPageToken": result.get("nextPageToken")}
    except Exception as exc:
        revoked = isinstance(exc, PermissionError) or "invalid_grant" in str(exc).lower()
        mark_connection_error(db, connection, exc, revoked=revoked)
        raise HTTPException(
            status_code=401 if revoked else 502,
            detail={"code": "credentials_revoked" if revoked else "integration_failed", "provider": "google_drive"},
        ) from exc


def _external_reference(
    db: Session, *, workspace_id: str, provider: str, resource_type: str,
    external_id: str, local_kind: str, local_id: str,
    status: str = "synchronized", metadata: dict[str, Any] | None = None,
) -> tuple[TasklyticExternalReference, bool]:
    existing = db.query(TasklyticExternalReference).filter_by(
        workspace_id=workspace_id, provider=provider,
        resource_type=resource_type, external_id=external_id,
    ).one_or_none()
    if existing:
        if (existing.local_kind, existing.local_id) != (local_kind, local_id):
            existing.sync_status = "conflict"
            existing.last_error_code = "external_id_conflict"
            existing.last_error_detail = f"Already mapped to {existing.local_kind}:{existing.local_id}"
            existing.revision += 1
            return existing, True
        existing.sync_status = status
        existing.metadata_json = metadata or existing.metadata_json or {}
        existing.revision += 1
        return existing, False
    row = TasklyticExternalReference(
        workspace_id=workspace_id, provider=provider, resource_type=resource_type,
        external_id=external_id, local_kind=local_kind, local_id=local_id,
        sync_status=status, metadata_json=metadata or {},
    )
    db.add(row)
    db.flush()
    return row, False


def import_google_drive_files(
    db: Session, *, workspace_id: str, actor_id: str, scope_type: str, scope_id: str,
    file_ids: list[str], drive=google_service, storage_factory=get_storage_service,
) -> dict[str, Any]:
    get_membership(db, workspace_id, actor_id)
    parent_kind = {"task": "tasks", "project": "projects"}.get(scope_type)
    if not parent_kind:
        raise HTTPException(status_code=422, detail="Drive imports support task or project scopes")
    parent = _find_record(db, parent_kind, validate_id(scope_id, "scopeId"), workspace_id, lock=True)
    if parent is None:
        raise HTTPException(status_code=404, detail="Import target was not found")
    authorize_mutation(db, parent_kind, parent.payload or {}, workspace_id, actor_id, parent.payload or {})
    connection = _connection(db, workspace_id, "google_drive")
    if connection is None or connection.status != "active":
        raise HTTPException(status_code=409, detail={"code": "integration_unavailable", "provider": "google_drive"})
    if not isinstance(file_ids, list) or not file_ids or len(file_ids) > 100:
        raise HTTPException(status_code=422, detail="Select between 1 and 100 Drive files")

    imported: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    attachment_ids = list((parent.payload or {}).get("attachmentIds") or [])
    storage = storage_factory()
    for raw_file_id in file_ids:
        file_id = str(raw_file_id).strip()[:255]
        if not file_id:
            continue
        previous = db.query(TasklyticExternalReference).filter_by(
            workspace_id=workspace_id, provider="google_drive", resource_type="file", external_id=file_id,
        ).one_or_none()
        if previous and previous.sync_status == "synchronized":
            attachment_row = _find_record(db, "attachments", previous.local_id, workspace_id)
            attachment = record_payload(attachment_row) if attachment_row else {}
            expected_field = "taskId" if scope_type == "task" else "projectId"
            if previous.local_kind == "attachments" and attachment.get(expected_field) == scope_id:
                imported.append({"fileId": file_id, "attachmentId": previous.local_id, "replayed": True})
                if previous.local_id not in attachment_ids:
                    attachment_ids.append(previous.local_id)
                continue
            previous.sync_status = "conflict"
            previous.last_error_code = "external_id_conflict"
            previous.last_error_detail = "Drive file is already mapped to another local scope"
            previous.revision += 1
            failures.append({"fileId": file_id, "code": "external_id_conflict"})
            continue
        try:
            metadata = drive.get_drive_file_metadata(db, actor_id, file_id)
            content = drive.download_drive_file(db, actor_id, file_id)
            if not metadata or content is None:
                raise PermissionError("Drive file could not be read; credentials may have been revoked")
            attachment_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:{workspace_id}:drive:{file_id}"))
            ref, conflict = _external_reference(
                db, workspace_id=workspace_id, provider="google_drive", resource_type="file",
                external_id=file_id, local_kind="attachments", local_id=attachment_id,
                status="pending", metadata={"name": metadata.get("name"), "modifiedTime": metadata.get("modifiedTime")},
            )
            if conflict:
                failures.append({"fileId": file_id, "code": "external_id_conflict"})
                continue
            filename = str(metadata.get("name") or f"drive-{file_id}")[:512]
            mime_type = str(metadata.get("mimeType") or "application/octet-stream")[:255]
            object_name = f"tasklytic/{workspace_id}/drive/{uuid.uuid4()}/{filename.replace('/', '_')}"
            blob = storage.bucket.blob(object_name)
            blob.upload_from_string(content, content_type=mime_type)
            upload = TasklyticFileUpload(
                object_name=object_name, workspace_id=workspace_id, uploader_id=actor_id,
                scope_type=scope_type, scope_id=scope_id, filename=filename, mime_type=mime_type,
                size_bytes=len(content), state="consumed", expires_at=utcnow(),
                completed_at=utcnow(), consumed_at=utcnow(),
            )
            db.add(upload)
            attachment = {
                "id": attachment_id, "name": filename, "size": len(content), "mime": mime_type,
                "storageRef": object_name, "storage": "object_store", "uploadedBy": actor_id,
                "taskId": scope_id if scope_type == "task" else None,
                "projectId": scope_id if scope_type == "project" else None,
                "externalReference": {"provider": "google_drive", "externalId": file_id},
                "createdAt": utcnow().isoformat(),
            }
            saved = upsert_record(db, "attachments", attachment, actor_id, workspace_id)
            ref.sync_status = "synchronized"
            ref.local_kind = "attachments"
            ref.local_id = attachment_id
            ref.metadata_json = {**dict(ref.metadata_json or {}), "objectName": object_name}
            if attachment_id not in attachment_ids:
                attachment_ids.append(attachment_id)
            imported.append({"fileId": file_id, "attachmentId": saved["id"], "replayed": False})
        except Exception as exc:
            failures.append({"fileId": file_id, "code": type(exc).__name__})
            failure_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:{workspace_id}:drive-failure:{file_id}"))
            ref, _ = _external_reference(
                db, workspace_id=workspace_id, provider="google_drive", resource_type="file",
                external_id=file_id, local_kind="integration_import", local_id=failure_id,
                status="failed", metadata={},
            )
            ref.last_error_code = type(exc).__name__[:128]
            ref.last_error_detail = str(exc)[:2000]
            if isinstance(exc, PermissionError):
                mark_connection_error(db, connection, exc, revoked=True)

    if attachment_ids != list((parent.payload or {}).get("attachmentIds") or []):
        updated_parent = {**record_payload(parent), "attachmentIds": attachment_ids, "modifiedAt": utcnow().isoformat()}
        upsert_record(db, parent_kind, updated_parent, actor_id, workspace_id, parent.revision)
    return {
        "status": "succeeded" if not failures else "partial" if imported else "failed",
        "imported": imported, "failures": failures,
    }


def extract_receipt(
    content: bytes,
    mime_type: str,
    *,
    extractor: Callable[[bytes, str], dict[str, Any]] | None = None,
    db: Session | None = None,
    user_id: str | None = None,
    operation_id: str | None = None,
) -> dict[str, Any]:
    if not content or len(content) > 20 * 1024 * 1024:
        return {"status": "manual_required", "manualAllowed": True, "reason": "invalid_receipt"}
    try:
        if extractor:
            data = extractor(content, mime_type)
        else:
            from google.genai import types
            response = get_client().models.generate_content(
                model=os.getenv("TASKLYTIC_RECEIPT_MODEL", "gemini-2.5-flash"),
                contents=[
                    "Extract receipt vendor, ISO date, subtotal amount, tax amount, and ISO currency. Do not estimate unreadable values.",
                    types.Part.from_bytes(data=content, mime_type=mime_type),
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json", response_schema=RECEIPT_SCHEMA,
                    temperature=0,
                ),
            )
            usage = _get_usage_counts(response)
            if db is not None and user_id is not None:
                BillingService(db).record_analytics_usage(
                    user_id=user_id,
                    source="tasklytic_receipt_extraction",
                    prompt_tokens=usage.get("prompt_tokens"),
                    output_tokens=usage.get("output_tokens"),
                    total_tokens=usage.get("total_tokens"),
                    operation_id=operation_id,
                    product="tasklytic",
                )
            data = json.loads(_get_resp_text(response))
        if not isinstance(data, dict):
            raise ValueError("Receipt extraction returned invalid data")
        normalized = {
            "vendor": str(data.get("vendor") or "")[:255] or None,
            "date": str(data.get("date") or "")[:10] or None,
            "amount": float(data["amount"]) if data.get("amount") is not None else None,
            "taxAmount": float(data["taxAmount"]) if data.get("taxAmount") is not None else None,
            "currency": str(data.get("currency") or "").upper()[:3] or None,
        }
        return {"status": "extracted", "manualAllowed": True, "receipt": normalized}
    except Exception as exc:
        return {
            "status": "manual_required", "manualAllowed": True,
            "reason": "vertex_unavailable", "detail": str(exc)[:500],
        }


def queue_email_delivery(
    db: Session, *, workspace_id: str, actor_id: str, body: dict[str, Any],
    idempotency_key: str, sender=email_service, require_workspace_admin: bool = True,
) -> tuple[TasklyticCommand, bool]:
    if require_workspace_admin:
        require_admin(db, workspace_id, actor_id)
    else:
        get_membership(db, workspace_id, actor_id)
    recipients = body.get("to") if isinstance(body.get("to"), list) else [body.get("to")]
    recipients = [str(value or "").strip().lower() for value in recipients]
    if not recipients or any(not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value) for value in recipients):
        raise HTTPException(status_code=422, detail="Invalid email recipient")
    payload = {
        "recipients": recipients, "subject": str(body.get("subject") or "")[:998],
        "bodyHtml": str(body.get("bodyHtml") or ""), "bodyText": str(body.get("bodyText") or ""),
        "attachments": [],
    }
    if isinstance(body.get("invoiceDelivery"), dict):
        invoice_delivery = body["invoiceDelivery"]
        payload["invoiceDelivery"] = {
            "invoiceId": validate_id(invoice_delivery.get("invoiceId"), "invoiceId"),
            "deliveryId": validate_id(invoice_delivery.get("deliveryId"), "deliveryId"),
        }
    attachments = body.get("attachments") or []
    if not isinstance(attachments, list) or len(attachments) > 10:
        raise HTTPException(status_code=422, detail="Invalid email attachments")
    total_size = 0
    for item in attachments:
        if not isinstance(item, dict):
            raise HTTPException(status_code=422, detail="Invalid email attachment")
        filename = str(item.get("filename") or "attachment")[:255]
        mime_type = str(item.get("mimeType") or "application/octet-stream")[:255]
        encoded = str(item.get("contentBase64") or "")
        try:
            size = len(base64.b64decode(encoded, validate=True))
        except (ValueError, binascii.Error) as exc:
            raise HTTPException(status_code=422, detail="Invalid email attachment encoding") from exc
        total_size += size
        payload["attachments"].append({"filename": filename, "mimeType": mime_type, "contentBase64": encoded})
    if total_size > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Email attachments exceed 15 MB")
    command, created = enqueue_command(
        db, command_type="maintenance.integration_email",
        deduplication_key=f"email:{idempotency_key}", payload=payload,
        actor_id=actor_id, workspace_id=workspace_id, max_attempts=5,
    )
    if not created:
        return command, True
    command.status = "leased"
    command.lease_owner = "request"
    command.lease_expires_at = utcnow()
    command.attempt_count = 1
    db.add(TasklyticCommandRun(
        command_id=command.id, attempt=1, worker_id="request", status="running", started_at=utcnow(),
    ))
    db.flush()
    try:
        result = deliver_email_command(db, command, sender=sender)
        complete_command(db, command.id, worker_id="request", result=result)
    except Exception as exc:
        failed = fail_command(db, command.id, worker_id="request", error=exc)
        invoice_delivery = payload.get("invoiceDelivery") or {}
        if invoice_delivery:
            finalize_invoice_delivery(
                db, workspace_id=workspace_id, actor_id=actor_id,
                invoice_id=invoice_delivery["invoiceId"], delivery_id=invoice_delivery["deliveryId"],
                delivery_status="failed" if failed.status == "failed" else "queued",
                command_id=str(command.id), error=failed.failure_detail,
            )
    return command, False


def deliver_email_command(db: Session, command: TasklyticCommand, *, sender=email_service) -> dict[str, Any]:
    payload = dict(command.payload or {})
    invoice_delivery = payload.get("invoiceDelivery") or {}

    def update_invoice_delivery(status: str, error: str | None = None) -> None:
        if not invoice_delivery or not command.workspace_id or not command.actor_id:
            return
        finalize_invoice_delivery(
            db, workspace_id=command.workspace_id, actor_id=command.actor_id,
            invoice_id=invoice_delivery["invoiceId"], delivery_id=invoice_delivery["deliveryId"],
            delivery_status=status, command_id=str(command.id), error=error,
        )

    attachments = [
        (
            str(item.get("filename") or "attachment"),
            base64.b64decode(str(item.get("contentBase64") or ""), validate=True),
            str(item.get("mimeType") or "application/octet-stream"),
        )
        for item in payload.get("attachments") or []
    ]
    sent_ids = []
    for recipient in payload.get("recipients") or []:
        kwargs = {"attachments": attachments} if attachments else {}
        try:
            ok = sender.send_html_email(
                recipient, str(payload.get("subject") or ""), str(payload.get("bodyHtml") or ""),
                str(payload.get("bodyText") or ""), **kwargs,
            )
            if not ok:
                raise RuntimeError(f"Gmail delivery failed for {recipient}")
        except Exception as exc:
            update_invoice_delivery("failed" if command.attempt_count >= command.max_attempts else "queued", str(exc))
            raise
        sent_ids.append(str(uuid.uuid4()))
    update_invoice_delivery("sent")
    return {"ids": sent_ids, "provider": "gmail"}


def create_stripe_payment_link(
    db: Session, *, workspace_id: str, actor_id: str, invoice_id: str,
    success_url: str, cancel_url: str, stripe_client=stripe,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    require_capability(db, workspace_id, actor_id, "bill")
    connection = _connection(db, workspace_id, "stripe_connect")
    if connection is None or connection.status != "active" or not connection.external_account_id:
        raise HTTPException(status_code=409, detail={"code": "integration_unavailable", "provider": "stripe_connect"})
    invoice_row = _find_record(db, "invoices", invoice_id, workspace_id, lock=True)
    if invoice_row is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice = record_payload(invoice_row)
    if invoice.get("status") not in {"approved", "sent", "partial", "overdue"}:
        raise HTTPException(status_code=409, detail={"code": "invoice_not_payable"})
    amount = Decimal(str(invoice.get("amountOutstanding") or 0))
    if amount <= 0:
        raise HTTPException(status_code=409, detail={"code": "invoice_not_payable"})
    currency = str(invoice.get("currency") or "USD").lower()
    metadata = {
        "scope": "tasklytic_client_invoice", "workspace_id": workspace_id,
        "invoice_id": invoice_id,
    }
    try:
        session = stripe_client.checkout.Session.create(
            mode="payment", success_url=success_url, cancel_url=cancel_url,
            line_items=[{"price_data": {
                "currency": currency, "unit_amount": int(amount * 100),
                "product_data": {"name": f"Invoice {invoice.get('invoiceNumber') or invoice_id}"},
            }, "quantity": 1}],
            metadata=metadata, payment_intent_data={"metadata": metadata},
            stripe_account=connection.external_account_id,
            **({"idempotency_key": idempotency_key} if idempotency_key else {}),
        )
        session_id = str(session.get("id") if isinstance(session, dict) else session.id)
        url = str(session.get("url") if isinstance(session, dict) else session.url)
        ref, conflict = _external_reference(
            db, workspace_id=workspace_id, provider="stripe_connect", resource_type="checkout_session",
            external_id=session_id, local_kind="invoices", local_id=invoice_id,
            metadata={"connectedAccountId": connection.external_account_id},
        )
        if conflict:
            raise HTTPException(status_code=409, detail={"code": "external_id_conflict"})
        return {"id": str(ref.id), "checkoutSessionId": session_id, "url": url, "scope": "client_invoice"}
    except HTTPException:
        raise
    except Exception as exc:
        mark_connection_error(db, connection, exc, revoked="account_invalid" in str(exc).lower())
        raise HTTPException(status_code=502, detail={"code": "stripe_connect_failed"}) from exc


def reconcile_stripe_event(db: Session, event: dict[str, Any]) -> dict[str, Any]:
    event_id = str(event.get("id") or "")
    if not event_id:
        raise HTTPException(status_code=422, detail="Stripe event id is required")
    digest = hashlib.sha256(json.dumps(event, sort_keys=True, default=str).encode()).hexdigest()
    existing = db.query(TasklyticWebhookReceipt).filter_by(provider="stripe_connect", event_id=event_id).one_or_none()
    if existing:
        if existing.payload_digest != digest:
            raise HTTPException(status_code=409, detail={"code": "webhook_payload_conflict"})
        return {"replayed": True, "status": existing.status, "localId": existing.local_id}
    receipt = TasklyticWebhookReceipt(provider="stripe_connect", event_id=event_id, payload_digest=digest)
    db.add(receipt)
    db.flush()
    obj = (((event.get("data") or {}).get("object")) or {})
    metadata = obj.get("metadata") or {}
    if metadata.get("scope") != "tasklytic_client_invoice":
        receipt.status = "ignored"
        receipt.processed_at = utcnow()
        return {"replayed": False, "status": "ignored"}
    workspace_id = validate_id(metadata.get("workspace_id"), "workspaceId")
    invoice_id = validate_id(metadata.get("invoice_id"), "invoiceId")
    receipt.workspace_id = workspace_id
    receipt.local_kind = "invoices"
    receipt.local_id = invoice_id
    if event.get("type") != "checkout.session.completed" or obj.get("payment_status") != "paid":
        receipt.status = "ignored"
        receipt.processed_at = utcnow()
        return {"replayed": False, "status": "ignored"}
    connection = _connection(db, workspace_id, "stripe_connect")
    account_id = str(event.get("account") or "")
    if connection is None or connection.status != "active" or connection.external_account_id != account_id:
        receipt.status = "failed"
        receipt.failure_detail = "Connected account does not match the workspace integration"
        receipt.processed_at = utcnow()
        return {"replayed": False, "status": "failed", "code": "external_account_conflict"}
    invoice_row = _find_record(db, "invoices", invoice_id, workspace_id, lock=True)
    if invoice_row is None:
        receipt.status = "failed"
        receipt.failure_detail = "Invoice not found; local records were not modified"
        receipt.processed_at = utcnow()
        return {"replayed": False, "status": "failed", "code": "invoice_not_found"}
    invoice = record_payload(invoice_row)
    amount = Decimal(str(obj.get("amount_total") or 0)) / 100
    currency = str(obj.get("currency") or "").upper()
    outstanding = Decimal(str(invoice.get("amountOutstanding") or 0))
    if currency != invoice.get("currency") or amount <= 0 or amount > outstanding:
        receipt.status = "failed"
        receipt.failure_detail = "Webhook amount or currency conflicts with the local invoice"
        receipt.processed_at = utcnow()
        return {"replayed": False, "status": "failed", "code": "payment_reconciliation_conflict"}
    actor_id = connection.owner_user_id or ""
    try:
        payment_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tasklytic:stripe:{event_id}"))
        external_payment_id = str(obj.get("payment_intent") or obj.get("id") or event_id)
        existing_ref = db.query(TasklyticExternalReference).filter_by(
            workspace_id=workspace_id, provider="stripe_connect",
            resource_type="payment", external_id=external_payment_id,
        ).one_or_none()
        if existing_ref and (existing_ref.local_kind, existing_ref.local_id) != ("payments", payment_id):
            existing_ref.sync_status = "conflict"
            existing_ref.last_error_code = "external_id_conflict"
            existing_ref.last_error_detail = "Stripe payment is mapped to another local record"
            existing_ref.revision += 1
            receipt.status = "failed"
            receipt.failure_detail = "Stripe payment external ID conflicts with a local mapping"
            receipt.processed_at = utcnow()
            return {"replayed": False, "status": "failed", "code": "external_id_conflict"}
        result = record_payment(
            db, invoice_id=invoice_id, workspace_id=workspace_id, actor_id=actor_id,
            body={
                "id": payment_id, "amount": float(amount), "currency": currency,
                "method": "card", "reference": external_payment_id,
                "paidAt": date.today().isoformat(),
            },
        )
        _external_reference(
            db, workspace_id=workspace_id, provider="stripe_connect", resource_type="payment",
            external_id=external_payment_id,
            local_kind="payments", local_id=payment_id,
        )
        receipt.status = "processed"
        receipt.local_kind = "payments"
        receipt.local_id = payment_id
        receipt.processed_at = utcnow()
        return {"replayed": False, "status": "processed", "payment": result["payment"]}
    except Exception as exc:
        receipt.status = "failed"
        receipt.failure_detail = str(exc)[:2000]
        receipt.processed_at = utcnow()
        return {"replayed": False, "status": "failed", "code": "payment_reconciliation_failed"}


def record_usage_event(
    db: Session, *, workspace_id: str, actor_id: str, event_name: str,
    properties: dict[str, Any] | None,
) -> dict[str, Any]:
    get_membership(db, workspace_id, actor_id)
    if not SAFE_EVENT_NAME.fullmatch(event_name):
        raise HTTPException(status_code=422, detail="Invalid event name")
    safe: dict[str, Any] = {}
    for key, value in list((properties or {}).items())[:40]:
        normalized_key = str(key)[:64]
        if normalized_key in PRIVATE_PROPERTY_KEYS or any(word in normalized_key.lower() for word in ("token", "secret", "password")):
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            safe[normalized_key] = value[:255] if isinstance(value, str) else value
        elif isinstance(value, list):
            safe[normalized_key] = [str(item)[:100] for item in value[:20]]
    row = TasklyticUsageEvent(
        workspace_id=workspace_id, actor_id=actor_id, event_name=event_name, properties=safe,
    )
    db.add(row)
    db.flush()
    return {"id": str(row.id), "event": row.event_name, "occurredAt": row.occurred_at.isoformat() if row.occurred_at else utcnow().isoformat()}
