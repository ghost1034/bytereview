"""Transactional billing, payment, trust, FX, and invoice PDF commands."""

from __future__ import annotations

import hashlib
import json
import uuid
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Callable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.tasklytic import TasklyticEntityRecord, TasklyticFileUpload, TasklyticWorkspace, TasklyticWorkspaceMember
from services.gcs_service import get_storage_service
from services.tasklytic_invoice_document import (
    LINE_PRESENTATIONS,
    PAGE_SIZES,
    build_document_snapshot,
    canonical_display_lines,
    normalize_billing_settings,
    render_invoice_pdf,
)
from services.tasklytic_service import (
    _find_record,
    capabilities_for_user,
    record_payload,
    require_capability,
    upsert_record,
    utcnow,
    validate_id,
)


MONEY = Decimal("0.01")
ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml"
SOURCE_KINDS = {"timeEntries", "expenses"}


def _limited_text(value: Any, label: str, limit: int, *, required: bool = False) -> str | None:
    if value is None:
        if required:
            raise HTTPException(status_code=422, detail=f"{label} is required")
        return None
    if not isinstance(value, str):
        raise HTTPException(status_code=422, detail=f"{label} must be text")
    result = value.strip()
    if required and not result:
        raise HTTPException(status_code=422, detail=f"{label} is required")
    if len(result) > limit:
        raise HTTPException(status_code=422, detail=f"{label} exceeds {limit} characters")
    return result or None


def _bill_to(value: Any) -> dict[str, str | None]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise HTTPException(status_code=422, detail="billTo must be an object")
    allowed = {"name", "contactName", "email", "phone", "address", "taxId"}
    if set(value) - allowed:
        raise HTTPException(status_code=422, detail="billTo contains unsupported fields")
    limits = {"name": 300, "contactName": 200, "email": 320, "phone": 100, "address": 1000, "taxId": 200}
    return {key: _limited_text(value.get(key), f"billTo.{key}", limit) for key, limit in limits.items() if key in value}


def _related_label(db: Session, workspace_id: str, source: dict[str, Any]) -> tuple[str, str]:
    matter_label = ""
    project_label = ""
    if source.get("matterId"):
        row = _find_record(db, "matters", str(source["matterId"]), workspace_id)
        if row:
            matter = record_payload(row)
            matter_label = str(matter.get("matterNumber") or matter.get("name") or "")
    if source.get("projectId"):
        row = _find_record(db, "projects", str(source["projectId"]), workspace_id)
        if row:
            project_label = str((record_payload(row)).get("name") or "")
    return " / ".join(value for value in (matter_label, project_label) if value) or "General", project_label


def _professional_label(db: Session, workspace_id: str, source: dict[str, Any], kind: str) -> str:
    if kind == "expenses":
        return str(source.get("category") or "Expense").replace("_", " ").title()
    user_id = source.get("userId")
    if not user_id:
        return str(source.get("timekeeperRole") or "Professional")
    row = _find_record(db, "users", str(user_id), workspace_id)
    if not row:
        return str(source.get("timekeeperRole") or "Professional")
    user = record_payload(row)
    name = str(user.get("name") or "Professional")
    role = str(source.get("timekeeperRole") or user.get("timekeeperRole") or user.get("jobTitle") or "")
    return f"{name} - {role}" if role else name


def _invoice_logo_bytes(db: Session, workspace_id: str, snapshot: dict[str, Any]) -> bytes | None:
    object_name = str(((snapshot.get("branding") or {}).get("logoObjectName")) or "")
    if not object_name:
        return None
    row = db.query(TasklyticFileUpload).filter_by(object_name=object_name).one_or_none()
    if row is None or row.workspace_id != workspace_id or row.scope_type != "invoice_brand" or row.state not in {"completed", "consumed"}:
        raise HTTPException(status_code=409, detail={"code": "invoice_brand_unavailable"})
    try:
        content = get_storage_service().bucket.blob(object_name).download_as_bytes()
    except Exception as exc:
        raise HTTPException(status_code=409, detail={"code": "invoice_brand_unavailable"}) from exc
    if len(content) > 2 * 1024 * 1024 or not (content.startswith(b"\x89PNG\r\n\x1a\n") or content.startswith(b"\xff\xd8\xff")):
        raise HTTPException(status_code=409, detail={"code": "invoice_brand_invalid"})
    return content


def _persist_invoice_pdf(
    db: Session, *, workspace_id: str, invoice_id: str, actor_id: str,
    content: bytes, digest: str,
) -> str:
    object_name = f"tasklytic/{workspace_id}/invoices/{invoice_id}/{digest}.pdf"
    try:
        get_storage_service().bucket.blob(object_name).upload_from_string(content, content_type="application/pdf")
    except Exception as exc:
        raise HTTPException(status_code=409, detail={"code": "invoice_pdf_persistence_failed"}) from exc
    existing = db.query(TasklyticFileUpload).filter_by(object_name=object_name).one_or_none()
    if existing is None:
        now = utcnow()
        db.add(TasklyticFileUpload(
            id=uuid.uuid4(), object_name=object_name, workspace_id=workspace_id,
            uploader_id=actor_id, scope_type="invoice_pdf", scope_id=invoice_id,
            filename=f"invoice-{invoice_id}.pdf", mime_type="application/pdf",
            size_bytes=len(content), state="consumed", expires_at=now + timedelta(days=36500),
            completed_at=now, consumed_at=now,
        ))
        db.flush()
    return object_name


def _stored_invoice_pdf(db: Session, workspace_id: str, invoice: dict[str, Any]) -> bytes | None:
    object_name = str(invoice.get("pdfObjectName") or "")
    if not object_name:
        return None
    row = db.query(TasklyticFileUpload).filter_by(object_name=object_name).one_or_none()
    if row is None or row.workspace_id != workspace_id or row.scope_type != "invoice_pdf" or row.scope_id != invoice.get("id"):
        raise HTTPException(status_code=409, detail={"code": "invoice_pdf_unavailable"})
    try:
        content = get_storage_service().bucket.blob(object_name).download_as_bytes()
    except Exception as exc:
        raise HTTPException(status_code=409, detail={"code": "invoice_pdf_unavailable"}) from exc
    digest = hashlib.sha256(content).hexdigest()
    if invoice.get("pdfSha256") and digest != invoice["pdfSha256"]:
        raise HTTPException(status_code=409, detail={"code": "invoice_pdf_digest_mismatch"})
    return content


def _money(value: Any, label: str, *, allow_zero: bool = True) -> Decimal:
    try:
        result = Decimal(str(value)).quantize(MONEY, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"{label} must be a valid amount") from exc
    if result < 0 or (result == 0 and not allow_zero):
        raise HTTPException(status_code=422, detail=f"{label} must be positive")
    return result


def _number(value: Decimal) -> float:
    return float(value.quantize(MONEY, rounding=ROUND_HALF_UP))


def _currency(value: Any, label: str = "currency") -> str:
    candidate = str(value or "").strip().upper()
    if len(candidate) != 3 or not candidate.isalpha():
        raise HTTPException(status_code=422, detail=f"{label} must be an ISO 4217 code")
    return candidate


def _iso_date(value: Any, label: str) -> str:
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{label} must be an ISO date") from exc


def _record(db: Session, kind: str, record_id: str, workspace_id: str, *, lock: bool = True) -> dict[str, Any]:
    row = _find_record(db, kind, validate_id(record_id, "record_id"), workspace_id, lock=lock)
    if row is None:
        raise HTTPException(status_code=404, detail=f"{kind} record not found")
    return record_payload(row)


def _save(
    db: Session,
    kind: str,
    payload: dict[str, Any],
    actor_id: str,
    workspace_id: str,
    revision: int | None = None,
) -> dict[str, Any]:
    return upsert_record(
        db, kind, payload, actor_id, workspace_id, revision,
        internal_billing_action=True,
    )


def _audit(
    db: Session,
    *,
    workspace_id: str,
    actor_id: str,
    resource_type: str,
    resource_id: str,
    action: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "id": str(uuid.uuid4()), "workspaceId": workspace_id,
        "resourceType": resource_type, "resourceId": resource_id,
        "action": action, "actorId": actor_id, "at": utcnow().isoformat(),
        "details": details or {},
    }
    return _save(db, "billingAuditRecords", payload, actor_id, workspace_id)


def _workspace(db: Session, workspace_id: str, *, lock: bool = False) -> TasklyticWorkspace:
    query = db.query(TasklyticWorkspace).filter(TasklyticWorkspace.id == workspace_id)
    row = query.with_for_update().one_or_none() if lock else query.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return row


def _explicit_quote(
    db: Session,
    workspace_id: str,
    quote_ids: set[str],
    base_currency: str,
    quote_currency: str,
) -> dict[str, Any] | None:
    if base_currency == quote_currency:
        return {"id": None, "rate": 1.0, "baseCurrency": base_currency, "quoteCurrency": quote_currency}
    for quote_id in quote_ids:
        row = _find_record(db, "fxQuotes", quote_id, workspace_id)
        quote = record_payload(row) if row else None
        if quote and quote.get("baseCurrency") == base_currency and quote.get("quoteCurrency") == quote_currency:
            return quote
    return None


def _source_amount(source: dict[str, Any], kind: str) -> Decimal:
    if kind == "timeEntries":
        if source.get("amount") is not None:
            return _money(source["amount"], "time amount")
        hours = Decimal(str(source.get("hours") or 0))
        rate = Decimal(str(source.get("rateSnapshot") or 0))
        return (hours * rate).quantize(MONEY, rounding=ROUND_HALF_UP)
    return _money(source.get("billableAmount", source.get("totalAmount", source.get("amount", 0))), "expense amount")


def generate_invoice(
    db: Session,
    *,
    workspace_id: str,
    actor_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    require_capability(db, workspace_id, actor_id, "bill")
    client = _record(db, "clients", validate_id(body.get("clientId"), "clientId"), workspace_id)
    scope_matter: dict[str, Any] | None = None
    if body.get("matterId"):
        scope_matter = _record(db, "matters", validate_id(body["matterId"], "matterId"), workspace_id)
        if scope_matter.get("clientId") != client["id"]:
            raise HTTPException(status_code=422, detail="The billing matter must belong to the invoice client")
    workspace = _workspace(db, workspace_id, lock=True)
    period_start = _iso_date(body.get("periodStart"), "periodStart")
    period_end = _iso_date(body.get("periodEnd"), "periodEnd")
    if period_end < period_start:
        raise HTTPException(status_code=422, detail="periodEnd cannot precede periodStart")
    invoice_currency = _currency(body.get("currency") or client.get("defaultCurrency") or (workspace.payload or {}).get("defaultCurrency") or "USD")
    quote_ids = {validate_id(value, "fxQuoteId") for value in body.get("fxQuoteIds") or []}
    narratives = body.get("narratives") or {}
    if not isinstance(narratives, dict):
        raise HTTPException(status_code=422, detail="narratives must be an object")
    included: list[tuple[str, dict[str, Any], Decimal, dict[str, Any] | None]] = []
    source_ids: set[str] = set()
    for kind, field in (("timeEntries", "timeEntryIds"), ("expenses", "expenseIds")):
        values = body.get(field) or []
        if not isinstance(values, list):
            raise HTTPException(status_code=422, detail=f"{field} must be an array")
        for raw_id in values:
            source_id = validate_id(raw_id, field)
            if source_id in source_ids:
                raise HTTPException(status_code=422, detail="Invoice sources must be unique")
            source_ids.add(source_id)
            source = _record(db, kind, source_id, workspace_id)
            if source.get("status") != "approved" or source.get("invoiceId") or source.get("invoiced"):
                raise HTTPException(status_code=409, detail={"code": "source_not_billable", "sourceId": source_id})
            if source.get("clientId") != client["id"]:
                raise HTTPException(status_code=422, detail="Every source must belong to the invoice client")
            if scope_matter:
                belongs_to_matter = source.get("matterId") == scope_matter["id"]
                belongs_to_project = source.get("projectId") == scope_matter.get("projectId")
                if not belongs_to_matter and not belongs_to_project:
                    raise HTTPException(status_code=422, detail={
                        "code": "source_outside_matter_scope", "sourceId": source_id,
                        "matterId": scope_matter["id"],
                    })
                if not source.get("matterId") and belongs_to_project:
                    source = {**source, "matterId": scope_matter["id"]}
            if not period_start <= str(source.get("date") or "") <= period_end:
                raise HTTPException(status_code=422, detail={"code": "source_outside_invoice_period", "sourceId": source_id})
            lock_row = _find_record(db, "billingLocks", f"{kind}:{source_id}", workspace_id, lock=True)
            if lock_row is not None and (lock_row.payload or {}).get("status") == "active":
                raise HTTPException(status_code=409, detail={"code": "billing_lock_conflict", "sourceId": source_id})
            source_currency = _currency(source.get("currency") or invoice_currency, "source currency")
            quote = _explicit_quote(db, workspace_id, quote_ids, source_currency, invoice_currency)
            if quote is None:
                raise HTTPException(status_code=409, detail={
                    "code": "fx_quote_required", "baseCurrency": source_currency,
                    "quoteCurrency": invoice_currency, "sourceId": source_id,
                })
            amount = (_source_amount(source, kind) * Decimal(str(quote["rate"]))).quantize(MONEY, rounding=ROUND_HALF_UP)
            included.append((kind, source, amount, quote if quote.get("id") else None))
    if not included:
        raise HTTPException(status_code=422, detail="An invoice requires at least one approved source")

    write_off_ids = {validate_id(value, "writeOffId") for value in body.get("writeOffIds") or []}
    if write_off_ids - source_ids:
        raise HTTPException(status_code=422, detail="Write-offs must refer to selected sources")
    write_off_reason = str(body.get("writeOffReason") or "").strip()
    if write_off_ids and not write_off_reason:
        raise HTTPException(status_code=422, detail="A write-off reason is required")

    invoice_id = validate_id(body.get("id") or str(uuid.uuid4()), "invoiceId")
    prefix = str((workspace.payload or {}).get("invoicePrefix") or "INV-")
    next_number = int((workspace.payload or {}).get("invoiceNextNumber") or (workspace.payload or {}).get("invoiceStartNumber") or 1000)
    invoice_number = f"{prefix}{next_number}"
    existing_number = db.query(TasklyticEntityRecord).filter_by(entity_kind="invoices", workspace_id=workspace_id).all()
    if any((row.payload or {}).get("invoiceNumber") == invoice_number for row in existing_number):
        raise HTTPException(status_code=409, detail={"code": "invoice_number_conflict", "invoiceNumber": invoice_number})
    workspace.payload = {**(workspace.payload or {}), "invoiceNextNumber": next_number + 1}
    workspace.revision += 1

    line_items: list[dict[str, Any]] = []
    subtotal_fees = Decimal("0")
    subtotal_expenses = Decimal("0")
    fx_quote_ids_used: set[str] = set()
    for kind, source, amount, quote in included:
        if source["id"] in write_off_ids:
            next_source = {**source, "status": "written_off", "writeOffReason": write_off_reason, "modifiedAt": utcnow().isoformat()}
            _save(db, kind, next_source, actor_id, workspace_id, source["revision"])
            continue
        quantity = Decimal(str(source.get("hours") or 1)) if kind == "timeEntries" else Decimal("1")
        rate = amount / quantity if quantity else Decimal("0")
        matter_project_label, project_label = _related_label(db, workspace_id, source)
        line_items.append({
            "id": str(uuid.uuid4()),
            "description": _limited_text(narratives.get(source["id"]) or source.get("description") or "Professional services", "line narrative", 4000, required=True),
            "quantity": float(quantity), "rate": _number(rate), "amount": _number(amount),
            "currency": invoice_currency, "type": "time" if kind == "timeEntries" else "expense",
            "serviceDate": source.get("date"),
            "professionalCategory": _professional_label(db, workspace_id, source, kind),
            "matterProjectLabel": matter_project_label,
            "projectLabel": project_label or None,
            "matterId": source.get("matterId"), "projectId": source.get("projectId"),
            "activityCode": source.get("activityCode") or source.get("activityCodeId"),
            "sourceId": source["id"], "sourceKind": kind,
            "sourceCurrency": source.get("currency") or invoice_currency,
            "fxQuoteId": quote.get("id") if quote else None,
        })
        if quote:
            fx_quote_ids_used.add(quote["id"])
        if kind == "timeEntries": subtotal_fees += amount
        else: subtotal_expenses += amount
    if not line_items:
        raise HTTPException(status_code=422, detail="At least one selected source must remain billable")

    discount = _money(body.get("discountAmount") or 0, "discountAmount")
    tax = _money(body.get("taxAmount") or 0, "taxAmount")
    subtotal = subtotal_fees + subtotal_expenses
    if discount > subtotal:
        raise HTTPException(status_code=422, detail="Discount cannot exceed subtotal")
    if discount and not str(body.get("discountReason") or "").strip():
        raise HTTPException(status_code=422, detail="A discount reason is required")
    total = (subtotal - discount + tax).quantize(MONEY, rounding=ROUND_HALF_UP)
    issue_date = _iso_date(body.get("issueDate") or date.today().isoformat(), "issueDate")
    terms_days = {"due_on_receipt": 0, "net_15": 15, "net_30": 30, "net_45": 45, "net_60": 60}
    default_terms = client.get("paymentTerms") or ((workspace.payload or {}).get("billingSettings") or {}).get("defaultPaymentTerms") or "net_30"
    default_due = (date.fromisoformat(issue_date) + timedelta(days=terms_days.get(str(default_terms), 30))).isoformat()
    due_on = _iso_date(body.get("dueOn") or default_due, "dueOn")
    if due_on < issue_date:
        raise HTTPException(status_code=422, detail="dueOn cannot precede issueDate")
    billing_settings = normalize_billing_settings(workspace.payload or {})
    line_presentation = str(body.get("linePresentation") or billing_settings["defaultLinePresentation"])
    if line_presentation not in LINE_PRESENTATIONS:
        raise HTTPException(status_code=422, detail="linePresentation must be detailed or summary")
    page_size = str(body.get("pageSize") or billing_settings["pageSize"]).lower()
    if page_size not in PAGE_SIZES:
        raise HTTPException(status_code=422, detail="pageSize must be letter or a4")
    now = utcnow().isoformat()
    invoice = {
        "id": invoice_id, "workspaceId": workspace_id, "clientId": client["id"],
        "clientName": client.get("name") or "Client", "invoiceNumber": invoice_number,
        "issueDate": issue_date, "dueOn": due_on,
        "periodStart": period_start,
        "periodEnd": period_end,
        "timeEntryIds": [line[1]["id"] for line in included if line[0] == "timeEntries" and line[1]["id"] not in write_off_ids],
        "expenseIds": [line[1]["id"] for line in included if line[0] == "expenses" and line[1]["id"] not in write_off_ids],
        "projectIds": sorted({source.get("projectId") for _, source, _, _ in included if source.get("projectId")}),
        "matterIds": sorted(
            {source.get("matterId") for _, source, _, _ in included if source.get("matterId")}
            | ({scope_matter["id"]} if scope_matter else set())
        ),
        "subtotalFees": _number(subtotal_fees), "subtotalExpenses": _number(subtotal_expenses),
        "discountAmount": _number(discount), "discountReason": str(body.get("discountReason") or "").strip() or None,
        "taxAmount": _number(tax), "taxLabel": _limited_text(body.get("taxLabel") or billing_settings["taxLabel"], "taxLabel", 80),
        "total": _number(total), "amount": _number(total),
        "amountPaid": 0.0, "amountOutstanding": _number(total), "currency": invoice_currency,
        "notes": _limited_text(body.get("notes"), "notes", 10000),
        "footer": str(body.get("footer") or ((workspace.payload or {}).get("billingSettings") or {}).get("defaultFooter") or "").strip() or None,
        "narrative": _limited_text(body.get("narrative"), "narrative", 4000),
        "paymentInstructions": _limited_text(body.get("paymentInstructions"), "paymentInstructions", 4000),
        "billTo": _bill_to(body.get("billTo")),
        "pageSize": page_size, "linePresentation": line_presentation,
        "lineItems": line_items,
        "displayLines": canonical_display_lines(line_items, line_presentation),
        "status": "draft", "deliveryHistory": [],
        "fxQuoteIds": sorted(fx_quote_ids_used), "createdAt": now, "createdById": actor_id,
    }
    saved_invoice = _save(db, "invoices", invoice, actor_id, workspace_id)
    for kind, source, _amount, _quote in included:
        if source["id"] in write_off_ids:
            continue
        next_source = {**source, "status": "billed", "invoiced": True, "invoiceId": invoice_id, "billedAt": now, "modifiedAt": now}
        _save(db, kind, next_source, actor_id, workspace_id, source["revision"])
        lock_payload = {
            "id": f"{kind}:{source['id']}", "workspaceId": workspace_id,
            "sourceKind": kind, "sourceId": source["id"], "invoiceId": invoice_id,
            "status": "active", "createdAt": now,
        }
        _save(db, "billingLocks", lock_payload, actor_id, workspace_id)
    audit = _audit(db, workspace_id=workspace_id, actor_id=actor_id, resource_type="invoice", resource_id=invoice_id, action="generated", details={
        "invoiceNumber": invoice_number, "currency": invoice_currency, "total": _number(total),
        "sourceIds": sorted(source_ids), "writtenOffIds": sorted(write_off_ids),
    })
    return {"invoice": saved_invoice, "audit": audit}


def _invoice_approval_settings(db: Session, workspace_id: str) -> tuple[bool, list[str]]:
    payload = _workspace(db, workspace_id).payload or {}
    billing = payload.get("billingSettings") or {}
    approval = payload.get("approvalSettings") or {}
    approvers = billing.get("invoiceApproverIds") or approval.get("invoiceApproverIds") or []
    return bool(billing.get("invoiceApprovalRequired")), list(approvers)


def _require_invoice_approver(db: Session, workspace_id: str, actor_id: str) -> None:
    require_capability(db, workspace_id, actor_id, "approve")
    _required, approvers = _invoice_approval_settings(db, workspace_id)
    member = db.get(TasklyticWorkspaceMember, (workspace_id, actor_id))
    if approvers and actor_id not in approvers and getattr(member, "role", None) != "admin":
        raise HTTPException(status_code=403, detail={"code": "approval_route_denied", "route": "invoiceApproverIds"})


def invoice_action(
    db: Session,
    *,
    invoice_id: str,
    action: str,
    workspace_id: str,
    actor_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    require_capability(db, workspace_id, actor_id, "bill")
    invoice = _record(db, "invoices", invoice_id, workspace_id)
    status = str(invoice.get("status") or "draft")
    now = utcnow().isoformat()
    updated = dict(invoice)
    details: dict[str, Any] = {}
    if action == "edit":
        if status != "draft":
            raise HTTPException(status_code=409, detail={"code": "invoice_locked", "status": status})
        patch = body.get("patch") or {}
        if not isinstance(patch, dict):
            raise HTTPException(status_code=422, detail="patch must be an object")
        allowed = {
            "narrative", "notes", "footer", "issueDate", "dueOn", "discountAmount",
            "discountReason", "taxAmount", "taxLabel", "lineNarratives",
            "displayLineNarratives", "billTo", "paymentInstructions", "pageSize",
            "linePresentation",
        }
        if set(patch) - allowed:
            raise HTTPException(status_code=422, detail="Invoice patch contains lifecycle-controlled fields")
        for field, limit in (("narrative", 4000), ("notes", 10000), ("footer", 1000), ("paymentInstructions", 4000), ("taxLabel", 80)):
            if field in patch:
                patch[field] = _limited_text(patch[field], field, limit)
        if "issueDate" in patch:
            patch["issueDate"] = _iso_date(patch["issueDate"], "issueDate")
        if "dueOn" in patch:
            patch["dueOn"] = _iso_date(patch["dueOn"], "dueOn")
        effective_issue_date = str(patch.get("issueDate") or invoice.get("issueDate"))
        effective_due_on = str(patch.get("dueOn") or invoice.get("dueOn"))
        if effective_due_on < effective_issue_date:
            raise HTTPException(status_code=422, detail="dueOn cannot precede issueDate")
        if "billTo" in patch:
            patch["billTo"] = {**(invoice.get("billTo") or {}), **_bill_to(patch["billTo"])}
        if "pageSize" in patch and str(patch["pageSize"]).lower() not in PAGE_SIZES:
            raise HTTPException(status_code=422, detail="pageSize must be letter or a4")
        if "pageSize" in patch:
            patch["pageSize"] = str(patch["pageSize"]).lower()
        if "linePresentation" in patch and patch["linePresentation"] not in LINE_PRESENTATIONS:
            raise HTTPException(status_code=422, detail="linePresentation must be detailed or summary")
        if "lineNarratives" in patch:
            line_narratives = patch.pop("lineNarratives")
            if not isinstance(line_narratives, dict):
                raise HTTPException(status_code=422, detail="lineNarratives must be an object")
            updated["lineItems"] = [
                {**line, "description": _limited_text(line_narratives.get(line.get("id"), line.get("description")), "line narrative", 4000, required=True)}
                for line in invoice.get("lineItems") or []
            ]
        presentation = str(patch.get("linePresentation") or invoice.get("linePresentation") or "detailed")
        updated["displayLines"] = canonical_display_lines(list(updated.get("lineItems") or []), presentation)
        if "displayLineNarratives" in patch:
            display_narratives = patch.pop("displayLineNarratives")
            if not isinstance(display_narratives, dict):
                raise HTTPException(status_code=422, detail="displayLineNarratives must be an object")
            updated["displayLines"] = [
                {**line, "description": _limited_text(display_narratives.get(line.get("id"), line.get("description")), "display line narrative", 4000, required=True)}
                for line in updated["displayLines"]
            ]
        discount = _money(patch.get("discountAmount", invoice.get("discountAmount", 0)), "discountAmount")
        tax = _money(patch.get("taxAmount", invoice.get("taxAmount", 0)), "taxAmount")
        subtotal = _money(invoice.get("subtotalFees", 0), "subtotalFees") + _money(invoice.get("subtotalExpenses", 0), "subtotalExpenses")
        if discount > subtotal:
            raise HTTPException(status_code=422, detail="Discount cannot exceed subtotal")
        discount_reason = str(patch.get("discountReason", invoice.get("discountReason") or "")).strip()
        if discount and not discount_reason:
            raise HTTPException(status_code=422, detail="A discount reason is required")
        total = subtotal - discount + tax
        updated.update(patch)
        updated.update({"discountAmount": _number(discount), "discountReason": discount_reason or None, "taxAmount": _number(tax), "total": _number(total), "amount": _number(total), "amountOutstanding": _number(total - _money(invoice.get("amountPaid", 0), "amountPaid"))})
    elif action == "submit":
        if status != "draft":
            raise HTTPException(status_code=409, detail={"code": "invalid_invoice_transition", "from": status, "action": action})
        workspace_payload = _workspace(db, workspace_id).payload or {}
        client = _record(db, "clients", validate_id(invoice.get("clientId"), "clientId"), workspace_id, lock=False)
        snapshot = build_document_snapshot(
            updated, workspace_payload, client, frozen_at=now, frozen_by_id=actor_id,
        )
        try:
            logo_bytes = _invoice_logo_bytes(db, workspace_id, snapshot)
            pdf_content = render_invoice_pdf(updated | {"documentSnapshot": snapshot}, workspace_payload, client=client, logo_bytes=logo_bytes)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=409, detail={"code": "invoice_pdf_generation_failed"}) from exc
        pdf_digest = hashlib.sha256(pdf_content).hexdigest()
        pdf_object_name = _persist_invoice_pdf(
            db, workspace_id=workspace_id, invoice_id=invoice_id, actor_id=actor_id,
            content=pdf_content, digest=pdf_digest,
        )
        updated.update({
            "documentSnapshot": snapshot,
            "pdfSha256": pdf_digest,
            "pdfObjectName": pdf_object_name,
            "pdfGeneratedAt": now,
        })
        required, _approvers = _invoice_approval_settings(db, workspace_id)
        updated.update({"status": "pending_approval" if required else "approved", "submittedAt": now})
        if not required:
            updated.update({"approvedAt": now, "approvedById": actor_id})
    elif action == "approve":
        if status != "pending_approval":
            raise HTTPException(status_code=409, detail={"code": "invalid_invoice_transition", "from": status, "action": action})
        _require_invoice_approver(db, workspace_id, actor_id)
        approval_settings = (_workspace(db, workspace_id).payload or {}).get("approvalSettings") or {}
        if invoice.get("createdById") == actor_id and not approval_settings.get("allowSelfApproval", False):
            raise HTTPException(status_code=403, detail={"code": "self_approval_denied"})
        updated.update({"status": "approved", "approvedAt": now, "approvedById": actor_id})
    elif action in {"send", "resend"}:
        allowed = {"approved"}
        if action == "resend": allowed = {"sent", "partial", "overdue"}
        if status not in allowed:
            raise HTTPException(status_code=409, detail={"code": "invalid_invoice_transition", "from": status, "action": action})
        method = str(body.get("method") or "manual")
        if method not in {"email", "mail", "pdf", "manual"}:
            raise HTTPException(status_code=422, detail="Unsupported delivery method")
        history = list(invoice.get("deliveryHistory") or [])
        delivery = {
            "id": str(uuid.uuid4()), "method": method,
            "recipient": str(body.get("recipient") or "").strip() or None,
            "status": "queued" if method == "email" else "recorded",
            "queuedAt": now if method == "email" else None,
            "sentAt": now if method != "email" else None,
            "sentById": actor_id,
            "resendOfId": history[-1]["id"] if action == "resend" and history else None,
        }
        history.append(delivery)
        if method == "email":
            updated.update({"deliveryHistory": history})
        else:
            updated.update({"status": "sent" if status == "approved" else status, "sentAt": invoice.get("sentAt") or now, "deliveryHistory": history})
        details = delivery
    elif action == "void":
        if status in {"void", "written_off"}:
            raise HTTPException(status_code=409, detail={"code": "invalid_invoice_transition", "from": status, "action": action})
        payments = db.query(TasklyticEntityRecord).filter_by(entity_kind="payments", workspace_id=workspace_id).all()
        active = [record_payload(row) for row in payments if (row.payload or {}).get("invoiceId") == invoice_id and not (row.payload or {}).get("originalPaymentId")]
        reversals = {str((row.payload or {}).get("originalPaymentId")) for row in payments if (row.payload or {}).get("originalPaymentId")}
        if any(payment["id"] not in reversals for payment in active):
            raise HTTPException(status_code=409, detail={"code": "payments_must_be_reversed"})
        reason = str(body.get("reason") or "").strip()
        if not reason:
            raise HTTPException(status_code=422, detail="A void reason is required")
        for kind, ids_field in (("timeEntries", "timeEntryIds"), ("expenses", "expenseIds")):
            for source_id in invoice.get(ids_field) or []:
                source = _record(db, kind, source_id, workspace_id)
                released = {**source, "status": "approved", "invoiced": False, "invoiceId": None, "modifiedAt": now}
                _save(db, kind, released, actor_id, workspace_id, source["revision"])
                lock = _record(db, "billingLocks", f"{kind}:{source_id}", workspace_id)
                _save(db, "billingLocks", {**lock, "status": "released", "releasedAt": now}, actor_id, workspace_id, lock["revision"])
        updated.update({"status": "void", "voidedAt": now, "voidedReason": reason, "amountOutstanding": 0.0})
        details = {"reason": reason}
    elif action == "write-off":
        if status not in {"sent", "partial", "overdue"}:
            raise HTTPException(status_code=409, detail={"code": "invalid_invoice_transition", "from": status, "action": action})
        reason = str(body.get("reason") or "").strip()
        if not reason:
            raise HTTPException(status_code=422, detail="A write-off reason is required")
        updated.update({"status": "written_off", "writtenOffAt": now, "writtenOffReason": reason, "amountOutstanding": 0.0})
        details = {"reason": reason, "amount": invoice.get("amountOutstanding")}
    else:
        raise HTTPException(status_code=404, detail="Unknown invoice action")
    saved = _save(db, "invoices", updated, actor_id, workspace_id, invoice["revision"])
    audit = _audit(db, workspace_id=workspace_id, actor_id=actor_id, resource_type="invoice", resource_id=invoice_id, action=action, details=details)
    return {"invoice": saved, "audit": audit}


def finalize_invoice_delivery(
    db: Session,
    *,
    invoice_id: str,
    delivery_id: str,
    workspace_id: str,
    actor_id: str,
    delivery_status: str,
    command_id: str,
    error: str | None = None,
) -> dict[str, Any]:
    """Apply provider outcome without falsely marking failed email as sent."""
    require_capability(db, workspace_id, actor_id, "bill")
    if delivery_status not in {"queued", "sent", "failed"}:
        raise HTTPException(status_code=422, detail="Invalid delivery status")
    invoice = _record(db, "invoices", invoice_id, workspace_id)
    history = list(invoice.get("deliveryHistory") or [])
    matched = False
    now = utcnow().isoformat()
    for index, delivery in enumerate(history):
        if delivery.get("id") != delivery_id:
            continue
        matched = True
        if delivery_status in {"sent", "failed"} and delivery.get("status") == delivery_status and delivery.get("commandId") == command_id:
            return invoice
        history[index] = {
            **delivery,
            "status": delivery_status,
            "commandId": command_id,
            "sentAt": now if delivery_status == "sent" else None,
            "failedAt": now if delivery_status == "failed" else None,
            "lastAttemptAt": now,
            "error": None if delivery_status == "sent" else _limited_text(error or "Email delivery is pending retry", "delivery error", 1000),
        }
        break
    if not matched:
        raise HTTPException(status_code=409, detail={"code": "invoice_delivery_missing"})
    updated = {**invoice, "deliveryHistory": history}
    if delivery_status == "sent":
        if invoice.get("status") == "approved":
            updated["status"] = "sent"
        updated["sentAt"] = invoice.get("sentAt") or now
    saved = _save(db, "invoices", updated, actor_id, workspace_id, invoice["revision"])
    _audit(
        db, workspace_id=workspace_id, actor_id=actor_id,
        resource_type="invoice", resource_id=invoice_id,
        action=f"delivery_{delivery_status}",
        details={"deliveryId": delivery_id, "commandId": command_id, "error": error if delivery_status != "sent" else None},
    )
    return saved


def _trust_rows(db: Session, workspace_id: str, client_id: str, currency: str) -> list[dict[str, Any]]:
    rows = db.query(TasklyticEntityRecord).filter_by(entity_kind="trustTransactions", workspace_id=workspace_id).with_for_update().all()
    return [record_payload(row) for row in rows if (row.payload or {}).get("clientId") == client_id and (row.payload or {}).get("currency") == currency]


def trust_balance(db: Session, workspace_id: str, client_id: str, currency: str) -> Decimal:
    rows = _trust_rows(db, workspace_id, client_id, currency)
    return sum((Decimal(str(row.get("signedAmount", row.get("amount", 0)))) for row in rows), Decimal("0")).quantize(MONEY)


def _record_trust(
    db: Session,
    *, workspace_id: str, actor_id: str, client_id: str, currency: str,
    transaction_type: str, signed_amount: Decimal, invoice_id: str | None = None,
    reference: str | None = None, notes: str | None = None,
    original_transaction_id: str | None = None,
) -> dict[str, Any]:
    before = trust_balance(db, workspace_id, client_id, currency)
    after = (before + signed_amount).quantize(MONEY)
    if after < 0:
        raise HTTPException(status_code=409, detail={"code": "insufficient_trust_funds", "available": _number(before)})
    payload = {
        "id": str(uuid.uuid4()), "workspaceId": workspace_id, "clientId": client_id,
        "type": transaction_type, "amount": _number(abs(signed_amount)), "signedAmount": _number(signed_amount),
        "currency": currency, "balanceAfter": _number(after), "invoiceId": invoice_id,
        "reference": reference, "notes": notes, "recordedById": actor_id,
        "createdAt": utcnow().isoformat(), "originalTransactionId": original_transaction_id,
    }
    saved = _save(db, "trustTransactions", payload, actor_id, workspace_id)
    client = _record(db, "clients", client_id, workspace_id)
    if _currency(client.get("defaultCurrency") or currency) == currency:
        _save(db, "clients", {**client, "retainerBalance": _number(after)}, actor_id, workspace_id, client["revision"])
    return saved


def record_payment(
    db: Session,
    *, invoice_id: str, workspace_id: str, actor_id: str, body: dict[str, Any],
) -> dict[str, Any]:
    require_capability(db, workspace_id, actor_id, "payment")
    invoice = _record(db, "invoices", invoice_id, workspace_id)
    if invoice.get("status") not in {"sent", "partial", "overdue"}:
        raise HTTPException(status_code=409, detail={"code": "invoice_not_payable", "status": invoice.get("status")})
    amount = _money(body.get("amount"), "amount", allow_zero=False)
    outstanding = _money(invoice.get("amountOutstanding", 0), "amountOutstanding")
    if amount > outstanding:
        raise HTTPException(status_code=422, detail="Payment cannot exceed outstanding amount")
    currency = _currency(body.get("currency") or invoice.get("currency"))
    if currency != invoice.get("currency"):
        raise HTTPException(status_code=409, detail={"code": "payment_currency_mismatch"})
    method = str(body.get("method") or "other")
    if method not in {"check", "ach", "wire", "card", "trust_application", "other"}:
        raise HTTPException(status_code=422, detail="Unsupported payment method")
    trust_transaction = None
    if method == "trust_application":
        require_capability(db, workspace_id, actor_id, "trust")
        client_id = validate_id(invoice.get("clientId"), "clientId")
        trust_transaction = _record_trust(
            db, workspace_id=workspace_id, actor_id=actor_id, client_id=client_id,
            currency=currency, transaction_type="application", signed_amount=-amount,
            invoice_id=invoice_id, reference=str(body.get("reference") or "").strip() or None,
        )
    payment = {
        "id": validate_id(body.get("id") or str(uuid.uuid4()), "paymentId"),
        "workspaceId": workspace_id, "invoiceId": invoice_id, "clientId": invoice.get("clientId"),
        "matterId": (invoice.get("matterIds") or [None])[0], "amount": _number(amount),
        "currency": currency, "method": method, "reference": str(body.get("reference") or "").strip() or None,
        "paidAt": _iso_date(body.get("paidAt") or date.today().isoformat(), "paidAt"),
        "recordedById": actor_id, "createdAt": utcnow().isoformat(), "status": "posted",
        "trustTransactionId": trust_transaction.get("id") if trust_transaction else None,
    }
    saved_payment = _save(db, "payments", payment, actor_id, workspace_id)
    paid = _money(invoice.get("amountPaid", 0), "amountPaid") + amount
    remaining = max(Decimal("0"), outstanding - amount)
    updated_invoice = {**invoice, "amountPaid": _number(paid), "amountOutstanding": _number(remaining), "status": "paid" if remaining == 0 else "partial"}
    if remaining == 0: updated_invoice["paidAt"] = utcnow().isoformat()
    saved_invoice = _save(db, "invoices", updated_invoice, actor_id, workspace_id, invoice["revision"])
    audit = _audit(db, workspace_id=workspace_id, actor_id=actor_id, resource_type="payment", resource_id=saved_payment["id"], action="applied", details={"invoiceId": invoice_id, "amount": _number(amount), "currency": currency})
    return {"payment": saved_payment, "invoice": saved_invoice, "trustTransaction": trust_transaction, "audit": audit}


def reverse_payment(
    db: Session,
    *, payment_id: str, workspace_id: str, actor_id: str, body: dict[str, Any],
) -> dict[str, Any]:
    require_capability(db, workspace_id, actor_id, "payment")
    payment = _record(db, "payments", payment_id, workspace_id)
    if payment.get("originalPaymentId"):
        raise HTTPException(status_code=409, detail={"code": "payment_reversal_immutable"})
    existing = db.query(TasklyticEntityRecord).filter_by(entity_kind="payments", workspace_id=workspace_id).all()
    if any((row.payload or {}).get("originalPaymentId") == payment_id for row in existing):
        raise HTTPException(status_code=409, detail={"code": "payment_already_reversed"})
    reason = str(body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="A reversal reason is required")
    invoice = _record(db, "invoices", validate_id(payment.get("invoiceId"), "invoiceId"), workspace_id)
    amount = _money(payment.get("amount"), "amount", allow_zero=False)
    trust_reversal = None
    if payment.get("method") == "trust_application":
        require_capability(db, workspace_id, actor_id, "trust")
        original_trust_id = validate_id(payment.get("trustTransactionId"), "trustTransactionId")
        original_trust = _record(db, "trustTransactions", original_trust_id, workspace_id)
        trust_reversal = _record_trust(
            db, workspace_id=workspace_id, actor_id=actor_id,
            client_id=validate_id(original_trust.get("clientId"), "clientId"),
            currency=_currency(original_trust.get("currency")), transaction_type="reversal",
            signed_amount=amount, invoice_id=invoice["id"], original_transaction_id=original_trust_id,
            notes=reason,
        )
    reversal = {
        "id": str(uuid.uuid4()), "workspaceId": workspace_id, "invoiceId": invoice["id"],
        "clientId": payment.get("clientId"), "matterId": payment.get("matterId"),
        "amount": -_number(amount), "currency": payment.get("currency"), "method": payment.get("method"),
        "reference": payment.get("reference"), "paidAt": date.today().isoformat(),
        "recordedById": actor_id, "createdAt": utcnow().isoformat(), "status": "reversal",
        "originalPaymentId": payment_id, "reversalReason": reason,
        "trustTransactionId": trust_reversal.get("id") if trust_reversal else None,
    }
    saved_reversal = _save(db, "payments", reversal, actor_id, workspace_id)
    paid = max(Decimal("0"), _money(invoice.get("amountPaid", 0), "amountPaid") - amount)
    total = _money(invoice.get("total", invoice.get("amount", 0)), "total")
    outstanding = max(Decimal("0"), total - paid)
    invoice_status = "sent" if paid == 0 else "partial"
    saved_invoice = _save(db, "invoices", {**invoice, "amountPaid": _number(paid), "amountOutstanding": _number(outstanding), "status": invoice_status, "paidAt": None}, actor_id, workspace_id, invoice["revision"])
    audit = _audit(db, workspace_id=workspace_id, actor_id=actor_id, resource_type="payment", resource_id=payment_id, action="reversed", details={"reversalPaymentId": saved_reversal["id"], "reason": reason})
    return {"payment": payment, "reversal": saved_reversal, "invoice": saved_invoice, "trustTransaction": trust_reversal, "audit": audit}


def record_trust_transaction(
    db: Session, *, workspace_id: str, actor_id: str, body: dict[str, Any],
) -> dict[str, Any]:
    require_capability(db, workspace_id, actor_id, "trust")
    transaction_type = str(body.get("type") or "")
    if transaction_type not in {"deposit", "withdrawal"}:
        raise HTTPException(status_code=422, detail="Trust entries must be deposits or withdrawals")
    amount = _money(body.get("amount"), "amount", allow_zero=False)
    client_id = validate_id(body.get("clientId"), "clientId")
    client = _record(db, "clients", client_id, workspace_id)
    currency = _currency(body.get("currency") or client.get("defaultCurrency"))
    signed = amount if transaction_type == "deposit" else -amount
    transaction = _record_trust(
        db, workspace_id=workspace_id, actor_id=actor_id, client_id=client_id,
        currency=currency, transaction_type=transaction_type, signed_amount=signed,
        reference=str(body.get("reference") or "").strip() or None,
        notes=str(body.get("notes") or "").strip() or None,
    )
    audit = _audit(db, workspace_id=workspace_id, actor_id=actor_id, resource_type="trust", resource_id=transaction["id"], action=transaction_type, details={"amount": _number(amount), "currency": currency})
    return {"transaction": transaction, "audit": audit}


def reverse_trust_transaction(
    db: Session, *, transaction_id: str, workspace_id: str, actor_id: str, body: dict[str, Any],
) -> dict[str, Any]:
    require_capability(db, workspace_id, actor_id, "trust")
    original = _record(db, "trustTransactions", transaction_id, workspace_id)
    if original.get("type") in {"application", "reversal"}:
        raise HTTPException(status_code=409, detail={"code": "reverse_payment_instead"})
    rows = db.query(TasklyticEntityRecord).filter_by(entity_kind="trustTransactions", workspace_id=workspace_id).all()
    if any((row.payload or {}).get("originalTransactionId") == transaction_id for row in rows):
        raise HTTPException(status_code=409, detail={"code": "trust_transaction_already_reversed"})
    reason = str(body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="A reversal reason is required")
    signed = -Decimal(str(original.get("signedAmount", original.get("amount", 0))))
    reversal = _record_trust(
        db, workspace_id=workspace_id, actor_id=actor_id,
        client_id=validate_id(original.get("clientId"), "clientId"),
        currency=_currency(original.get("currency")), transaction_type="reversal",
        signed_amount=signed, original_transaction_id=transaction_id, notes=reason,
    )
    audit = _audit(db, workspace_id=workspace_id, actor_id=actor_id, resource_type="trust", resource_id=transaction_id, action="reversed", details={"reversalTransactionId": reversal["id"], "reason": reason})
    return {"transaction": original, "reversal": reversal, "audit": audit}


def _fetch_ecb_xml() -> bytes:
    with urllib.request.urlopen(ECB_URL, timeout=10) as response:  # nosec B310 - fixed ECB URL
        return response.read()


def parse_ecb_rates(xml_content: bytes, rate_date: str) -> tuple[dict[str, Decimal], str]:
    root = ET.fromstring(xml_content)
    available: list[tuple[str, Any]] = []
    for node in root.iter():
        node_date = node.attrib.get("time")
        if node_date and node_date <= rate_date:
            available.append((node_date, node))
    if not available:
        raise HTTPException(status_code=409, detail={"code": "ecb_rate_unavailable", "rateDate": rate_date})
    provider_date, selected = max(available, key=lambda item: item[0])
    rates = {"EUR": Decimal("1")}
    for node in selected:
        currency = node.attrib.get("currency")
        rate = node.attrib.get("rate")
        if currency and rate:
            rates[currency] = Decimal(rate)
    return rates, provider_date


def create_fx_quote(
    db: Session,
    *, workspace_id: str, actor_id: str, body: dict[str, Any],
    fetcher: Callable[[], bytes] | None = None,
) -> dict[str, Any]:
    capabilities = capabilities_for_user(db, workspace_id, actor_id)
    if not (capabilities["rate"] or capabilities["bill"]):
        raise HTTPException(status_code=403, detail={"code": "capability_denied", "capability": "rate"})
    base = _currency(body.get("baseCurrency"), "baseCurrency")
    quote = _currency(body.get("quoteCurrency"), "quoteCurrency")
    rate_date = _iso_date(body.get("rateDate") or date.today().isoformat(), "rateDate")
    if base == quote:
        rate, source, provider_rate_date = Decimal("1"), "ecb", rate_date
    else:
        workspace = _workspace(db, workspace_id)
        override = ((workspace.payload or {}).get("fxOverrides") or {}).get(f"{base}/{quote}")
        if override and str(override.get("effectiveOn") or "") <= rate_date:
            rate, source, provider_rate_date = Decimal(str(override.get("rate"))), "workspace_override", rate_date
        else:
            cache_id = f"ecb:{rate_date}"
            cache_row = _find_record(db, "fxRateCache", cache_id, workspace_id, lock=True)
            if cache_row:
                rates = {key: Decimal(str(value)) for key, value in (cache_row.payload or {}).get("rates", {}).items()}
                provider_rate_date = str((cache_row.payload or {}).get("providerRateDate") or rate_date)
            else:
                rates, provider_rate_date = parse_ecb_rates((fetcher or _fetch_ecb_xml)(), rate_date)
                cache = {
                    "id": cache_id, "workspaceId": workspace_id, "provider": "ECB",
                    "rateDate": rate_date, "baseCurrency": "EUR",
                    "providerRateDate": provider_rate_date,
                    "rates": {key: float(value) for key, value in rates.items()},
                    "fetchedAt": utcnow().isoformat(),
                }
                _save(db, "fxRateCache", cache, actor_id, workspace_id)
            if base not in rates or quote not in rates:
                raise HTTPException(status_code=409, detail={"code": "fx_override_required", "baseCurrency": base, "quoteCurrency": quote})
            rate, source = (rates[quote] / rates[base]), "ecb"
    if rate <= 0:
        raise HTTPException(status_code=422, detail="FX rate must be positive")
    payload = {
        "id": str(uuid.uuid4()), "workspaceId": workspace_id,
        "baseCurrency": base, "quoteCurrency": quote, "rate": float(rate),
        "rateDate": provider_rate_date, "requestedRateDate": rate_date,
        "source": source, "createdAt": utcnow().isoformat(),
    }
    saved = _save(db, "fxQuotes", payload, actor_id, workspace_id)
    audit = _audit(db, workspace_id=workspace_id, actor_id=actor_id, resource_type="fx", resource_id=saved["id"], action="quoted", details={"source": source})
    return {"quote": saved, "audit": audit}


def invoice_pdf(db: Session, *, invoice_id: str, workspace_id: str, actor_id: str) -> tuple[bytes, str]:
    require_capability(db, workspace_id, actor_id, "view")
    invoice = _record(db, "invoices", invoice_id, workspace_id, lock=False)
    stored = _stored_invoice_pdf(db, workspace_id, invoice)
    if stored is not None:
        return stored, hashlib.sha256(stored).hexdigest()
    workspace = _workspace(db, workspace_id).payload or {}
    client = _record(db, "clients", validate_id(invoice.get("clientId"), "clientId"), workspace_id, lock=False) if invoice.get("clientId") else {}
    snapshot = invoice.get("documentSnapshot")
    logo_bytes = _invoice_logo_bytes(db, workspace_id, snapshot) if isinstance(snapshot, dict) else None
    content = render_invoice_pdf(invoice, workspace, client=client, logo_bytes=logo_bytes)
    digest = hashlib.sha256(content).hexdigest()
    if isinstance(snapshot, dict) and invoice.get("pdfSha256") and digest != invoice["pdfSha256"]:
        raise HTTPException(status_code=409, detail={"code": "invoice_pdf_digest_mismatch"})
    return content, digest
