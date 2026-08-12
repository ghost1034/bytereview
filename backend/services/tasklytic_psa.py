"""Transactional PSA lifecycle commands for time and expense operations."""

from __future__ import annotations

import copy
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.tasklytic import TasklyticEntityRecord, TasklyticWorkspace, TasklyticWorkspaceMember
from services.tasklytic_service import _find_record, record_payload, upsert_record, utcnow, validate_id


PSA_KINDS = frozenset({"timeEntries", "timesheets", "expenses", "expenseReports"})
PARENT_CHILD = {"timesheets": ("timeEntries", "timesheetId"), "expenseReports": ("expenses", "expenseReportId")}
ACTION_STATUS = {
    "submit": "submitted", "approve": "approved", "reject": "rejected",
    "partial-approve": "partially_approved", "write-off": "written_off",
    "lock": "locked", "reimburse": "reimbursed",
}
RESET_FIELDS = {
    "revision", "submittedAt", "approvedById", "approvedAt", "rejectedReason",
    "reimbursedAt", "reimbursementMethod", "reimbursementReference", "invoiceId",
    "invoiced", "writeOffReason", "timesheetId", "expenseReportId", "partialApproval",
}


def _record(db: Session, kind: str, record_id: str, workspace_id: str) -> dict[str, Any]:
    row = _find_record(db, kind, validate_id(record_id, "record_id"), workspace_id, lock=True)
    if row is None:
        raise HTTPException(status_code=404, detail="PSA record not found")
    return record_payload(row)


def _children(db: Session, parent_kind: str, parent_id: str, workspace_id: str) -> list[dict[str, Any]]:
    child_kind, parent_field = PARENT_CHILD[parent_kind]
    rows = db.query(TasklyticEntityRecord).filter_by(
        entity_kind=child_kind, workspace_id=workspace_id,
    ).all()
    return [record_payload(row) for row in rows if (row.payload or {}).get(parent_field) == parent_id]


def execute_psa_action(
    db: Session, *, kind: str, record_id: str, action: str, body: dict[str, Any],
    actor_id: str, workspace_id: str,
) -> dict[str, Any]:
    if kind not in PSA_KINDS or action not in {*ACTION_STATUS, "edit", "duplicate", "manual-receipt"}:
        raise HTTPException(status_code=404, detail="Unknown PSA lifecycle action")
    current = _record(db, kind, record_id, workspace_id)
    now = utcnow().isoformat()

    if action in {"approve", "reject", "partial-approve"} and current.get("userId") == actor_id:
        workspace = db.get(TasklyticWorkspace, workspace_id)
        approval_settings = ((workspace.payload or {}).get("approvalSettings") or {}) if workspace else {}
        if not approval_settings.get("allowSelfApproval", False):
            raise HTTPException(status_code=403, detail={"code": "self_approval_denied"})
    if action in {"approve", "reject", "partial-approve"}:
        workspace = db.get(TasklyticWorkspace, workspace_id)
        settings = ((workspace.payload or {}).get("approvalSettings") or {}) if workspace else {}
        route_key = "timeApproverIds" if kind in {"timeEntries", "timesheets"} else "expenseApproverIds"
        routed_ids = settings.get(route_key) or []
        membership = db.get(TasklyticWorkspaceMember, (workspace_id, actor_id))
        if routed_ids and actor_id not in routed_ids and getattr(membership, "role", None) != "admin":
            raise HTTPException(status_code=403, detail={"code": "approval_route_denied", "route": route_key})
    if action == "submit" and kind in {"expenses", "expenseReports"}:
        workspace = db.get(TasklyticWorkspace, workspace_id)
        threshold = (workspace.payload or {}).get("expenseReceiptRequiredAbove") if workspace else None
        receipt_rows = [current] if kind == "expenses" else _children(db, kind, record_id, workspace_id)
        if isinstance(threshold, (int, float)):
            missing = [row["id"] for row in receipt_rows if float(row.get("totalAmount") or row.get("amount") or 0) > threshold and not row.get("receiptAttachmentId") and not row.get("manualReceipt")]
            if missing:
                raise HTTPException(status_code=409, detail={"code": "receipt_required", "expenseIds": missing, "threshold": threshold})

    if action == "duplicate":
        duplicate = {key: copy.deepcopy(value) for key, value in current.items() if key not in RESET_FIELDS}
        duplicate_id = str(uuid.uuid4())
        duplicate.update({"id": duplicate_id, "userId": actor_id, "status": "draft", "approved": False, "createdAt": now, "modifiedAt": now})
        child_copies: list[dict[str, Any]] = []
        if kind in PARENT_CHILD:
            child_kind, parent_field = PARENT_CHILD[kind]
            for child in _children(db, kind, record_id, workspace_id):
                child_copy = {key: copy.deepcopy(value) for key, value in child.items() if key not in RESET_FIELDS}
                child_copy.update({
                    "id": str(uuid.uuid4()), "userId": actor_id, parent_field: duplicate_id,
                    "status": "draft", "approved": False, "createdAt": now, "modifiedAt": now,
                })
                child_copies.append(child_copy)
            if kind == "expenseReports":
                duplicate["expenseIds"] = [child["id"] for child in child_copies]
        saved = upsert_record(db, kind, duplicate, actor_id, workspace_id)
        saved_children = [upsert_record(db, PARENT_CHILD[kind][0], child, actor_id, workspace_id) for child in child_copies] if kind in PARENT_CHILD else []
        return {"record": saved, "children": saved_children}

    if action in {"edit", "manual-receipt"}:
        patch = body.get("patch") if action == "edit" else body.get("receipt")
        if not isinstance(patch, dict):
            raise HTTPException(status_code=422, detail=f"{action} data must be an object")
        protected = {"id", "workspaceId", "userId", "revision", "status", "invoiceId", "invoiced"}
        if protected.intersection(patch):
            raise HTTPException(status_code=422, detail="Lifecycle-controlled fields cannot be edited")
        updated = {**current, **patch, "modifiedAt": now}
        if action == "manual-receipt":
            if kind != "expenses":
                raise HTTPException(status_code=422, detail="Manual receipts belong to expenses")
            updated["manualReceipt"] = {**patch, "enteredById": actor_id, "enteredAt": now}
        return {"record": upsert_record(db, kind, updated, actor_id, workspace_id, current["revision"]), "children": []}

    target = ACTION_STATUS[action]
    updated = {**current, "status": target, "modifiedAt": now}
    if action == "submit": updated["submittedAt"] = now
    if action in {"approve", "partial-approve"}: updated.update({"approvedById": actor_id, "approvedAt": now})
    if action == "reject":
        reason = str(body.get("reason") or "").strip()
        if not reason: raise HTTPException(status_code=422, detail="A rejection reason is required")
        updated.update({"rejectedReason": reason, "approvedById": actor_id, "approvedAt": now})
    if action == "write-off":
        reason = str(body.get("reason") or "").strip()
        if not reason: raise HTTPException(status_code=422, detail="A write-off reason is required")
        updated["writeOffReason"] = reason
    if action == "reimburse":
        updated.update({
            "reimbursedAt": now,
            "reimbursementMethod": body.get("method") or "payroll",
            "reimbursementReference": str(body.get("reference") or "").strip() or None,
        })

    children = _children(db, kind, record_id, workspace_id) if kind in PARENT_CHILD else []
    saved_children: list[dict[str, Any]] = []
    if action == "partial-approve":
        approved_ids = set(body.get("approvedIds") or [])
        rejected_ids = set(body.get("rejectedIds") or [])
        child_ids = {child["id"] for child in children}
        if not approved_ids or not rejected_ids or approved_ids & rejected_ids or approved_ids | rejected_ids != child_ids:
            raise HTTPException(status_code=422, detail="Partial approval must classify every child exactly once")
        reason = str(body.get("reason") or "").strip()
        if not reason: raise HTTPException(status_code=422, detail="A partial rejection reason is required")
        updated["partialApproval"] = {"approvedIds": sorted(approved_ids), "rejectedIds": sorted(rejected_ids), "reason": reason}
        for child in children:
            approved = child["id"] in approved_ids
            child_next = {**child, "status": "approved" if approved else "rejected", "approved": approved, "approvedById": actor_id, "approvedAt": now}
            if not approved: child_next["rejectedReason"] = reason
            saved_children.append(upsert_record(db, PARENT_CHILD[kind][0], child_next, actor_id, workspace_id, child["revision"]))
    elif children and action in {"submit", "approve", "reject", "reimburse"}:
        child_status = target
        for child in children:
            if action == "reimburse" and child.get("status") != "approved":
                continue
            child_next = {**child, "status": child_status}
            if action == "submit": child_next["submittedAt"] = now
            if action == "approve": child_next.update({"approved": True, "approvedById": actor_id, "approvedAt": now})
            if action == "reject": child_next.update({"approved": False, "rejectedReason": updated["rejectedReason"], "approvedById": actor_id, "approvedAt": now})
            if action == "reimburse": child_next["reimbursedAt"] = now
            saved_children.append(upsert_record(db, PARENT_CHILD[kind][0], child_next, actor_id, workspace_id, child["revision"]))

    saved = upsert_record(db, kind, updated, actor_id, workspace_id, current["revision"])
    return {"record": saved, "children": saved_children}
