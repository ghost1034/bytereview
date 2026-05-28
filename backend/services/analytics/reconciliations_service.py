"""CRUD service for `reconciliations` rows."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from models.db_models import Reconciliation
from services.analytics.audit_service import record_audit


_AUDITED_FIELDS = ("name", "status", "client_id")
_PAYLOAD_FIELDS = ("source_a", "source_b", "rules", "match_groups")


def list_reconciliations(db: Session, firm_id) -> List[Reconciliation]:
    return (
        db.query(Reconciliation)
        .filter(Reconciliation.firm_id == firm_id)
        .order_by(Reconciliation.updated_at.desc())
        .all()
    )


def get_reconciliation(db: Session, firm_id, reconciliation_id: str) -> Reconciliation:
    row = (
        db.query(Reconciliation)
        .filter(
            Reconciliation.id == reconciliation_id,
            Reconciliation.firm_id == firm_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    return row


def create_reconciliation(db: Session, firm_id, user_id: str, *, payload) -> Reconciliation:
    row = Reconciliation(
        id=uuid.uuid4(),
        firm_id=firm_id,
        client_id=payload.client_id,
        created_by_user_id=user_id,
        name=payload.name,
        status=payload.status or "draft",
        source_a=payload.source_a,
        source_b=payload.source_b,
        rules=payload.rules,
        match_groups=payload.match_groups,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    record_audit(
        db,
        firm_id=firm_id,
        user_id=user_id,
        action="reconciliation.created",
        details={"reconciliation_id": str(row.id), "name": row.name},
    )
    return row


def update_reconciliation(
    db: Session, firm_id, reconciliation_id: str, *, payload, actor_user_id: str
) -> Reconciliation:
    row = get_reconciliation(db, firm_id, reconciliation_id)
    data = payload.model_dump(exclude_unset=True)
    before: Dict[str, Any] = {k: getattr(row, k) for k in _AUDITED_FIELDS if k in data}
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)

    after = {k: getattr(row, k) for k in before}
    diff = {k: {"before": before[k], "after": after[k]} for k in before if before[k] != after[k]}
    payload_changed = [k for k in _PAYLOAD_FIELDS if k in data]

    action = (
        "reconciliation.status_changed"
        if "status" in diff and not (set(diff.keys()) - {"status"})
        else "reconciliation.updated"
    )
    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action=action,
        details={
            "reconciliation_id": str(row.id),
            "name": row.name,
            "diff": diff,
            "payload_changed": payload_changed,
        },
    )
    return row


def delete_reconciliation(
    db: Session, firm_id, reconciliation_id: str, *, actor_user_id: str
) -> None:
    row = get_reconciliation(db, firm_id, reconciliation_id)
    snapshot = {"reconciliation_id": str(row.id), "name": row.name}
    db.delete(row)
    db.commit()

    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="reconciliation.deleted",
        details=snapshot,
    )


# ---------------------------------------------------------------------------
# Match-group mutations (manual match, approve, reject)
# ---------------------------------------------------------------------------


def _amount(txn: Dict[str, Any]) -> float:
    """Read the canonical amount field from a transaction dict, defaulting to 0."""
    raw = txn.get("amount", 0)
    try:
        return float(raw or 0)
    except (TypeError, ValueError):
        return 0.0


def _find_txn_index(rows: List[Dict[str, Any]], txn_id: str) -> Optional[int]:
    for idx, row in enumerate(rows):
        if row.get("id") == txn_id:
            return idx
    return None


def _infer_group_type(num_a: int, num_b: int) -> str:
    if num_a == 1 and num_b == 1:
        return "1:1"
    if num_a == 1 and num_b > 1:
        return "1:Many"
    if num_a > 1 and num_b == 1:
        return "Many:1"
    return "Many:Many"


def manual_match(
    db: Session,
    firm_id,
    user_id: str,
    reconciliation_id: str,
    *,
    payload,
) -> Reconciliation:
    """Manually pair Source A and Source B transactions into a new approved group."""
    row = get_reconciliation(db, firm_id, reconciliation_id)

    source_a: List[Dict[str, Any]] = list(row.source_a or [])
    source_b: List[Dict[str, Any]] = list(row.source_b or [])
    match_groups: List[Dict[str, Any]] = list(row.match_groups or [])

    a_indexes: List[int] = []
    for txn_id in payload.source_a_ids:
        idx = _find_txn_index(source_a, txn_id)
        if idx is None:
            raise HTTPException(
                status_code=400,
                detail=f"Source A transaction '{txn_id}' not found on this reconciliation",
            )
        a_indexes.append(idx)

    b_indexes: List[int] = []
    for txn_id in payload.source_b_ids:
        idx = _find_txn_index(source_b, txn_id)
        if idx is None:
            raise HTTPException(
                status_code=400,
                detail=f"Source B transaction '{txn_id}' not found on this reconciliation",
            )
        b_indexes.append(idx)

    total_a = sum(_amount(source_a[i]) for i in a_indexes)
    total_b = sum(_amount(source_b[i]) for i in b_indexes)

    group_id = f"manual-{uuid.uuid4()}"
    group = {
        "id": group_id,
        "type": _infer_group_type(len(a_indexes), len(b_indexes)),
        "sourceAIds": list(payload.source_a_ids),
        "sourceBIds": list(payload.source_b_ids),
        "totalA": total_a,
        "totalB": total_b,
        "confidence": 1.0,
        "explanation": payload.explanation or "Manual match",
        "status": "approved",
    }
    match_groups.append(group)

    for idx in a_indexes:
        source_a[idx] = {**source_a[idx], "status": "matched", "matchGroupId": group_id}
    for idx in b_indexes:
        source_b[idx] = {**source_b[idx], "status": "matched", "matchGroupId": group_id}

    row.source_a = source_a
    row.source_b = source_b
    row.match_groups = match_groups
    flag_modified(row, "source_a")
    flag_modified(row, "source_b")
    flag_modified(row, "match_groups")

    db.commit()
    db.refresh(row)

    record_audit(
        db,
        firm_id=firm_id,
        user_id=user_id,
        action="reconciliation.manual_matched",
        details={
            "reconciliation_id": str(row.id),
            "group_id": group_id,
            "source_a_ids": list(payload.source_a_ids),
            "source_b_ids": list(payload.source_b_ids),
        },
    )
    return row


def update_exception(
    db: Session,
    firm_id,
    user_id: str,
    reconciliation_id: str,
    txn_id: str,
    *,
    payload,
) -> Reconciliation:
    """Update the exception status / note for a single unmatched txn in source_a or source_b."""
    row = get_reconciliation(db, firm_id, reconciliation_id)

    side = payload.source
    column = "source_a" if side == "A" else "source_b"
    rows: List[Dict[str, Any]] = list(getattr(row, column) or [])

    target_idx = _find_txn_index(rows, txn_id)
    if target_idx is None:
        raise HTTPException(
            status_code=404,
            detail=f"Transaction '{txn_id}' not found in source {side}",
        )

    data = payload.model_dump(exclude_unset=True, by_alias=False)
    new_txn = dict(rows[target_idx])
    if "exception_status" in data:
        new_txn["exceptionStatus"] = data["exception_status"]
    if "exception_note" in data:
        new_txn["exceptionNote"] = data["exception_note"]
    rows[target_idx] = new_txn

    setattr(row, column, rows)
    flag_modified(row, column)

    db.commit()
    db.refresh(row)

    record_audit(
        db,
        firm_id=firm_id,
        user_id=user_id,
        action="reconciliation.exception_updated",
        details={
            "reconciliation_id": str(row.id),
            "txn_id": txn_id,
            "source": side,
            "updates": {k: v for k, v in data.items() if k in ("exception_status", "exception_note")},
        },
    )
    return row


def set_match_group_status(
    db: Session,
    firm_id,
    user_id: str,
    reconciliation_id: str,
    group_id: str,
    new_status: str,
) -> Reconciliation:
    """Approve or reject a single match group; rejection un-matches its transactions."""
    if new_status not in ("approved", "rejected"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid match-group status '{new_status}'",
        )

    row = get_reconciliation(db, firm_id, reconciliation_id)
    match_groups: List[Dict[str, Any]] = list(row.match_groups or [])

    target_idx: Optional[int] = None
    for idx, group in enumerate(match_groups):
        if group.get("id") == group_id:
            target_idx = idx
            break
    if target_idx is None:
        raise HTTPException(status_code=404, detail="Match group not found")

    target = dict(match_groups[target_idx])
    target["status"] = new_status
    match_groups[target_idx] = target

    row.match_groups = match_groups
    flag_modified(row, "match_groups")

    if new_status == "rejected":
        a_ids = set(target.get("sourceAIds") or [])
        b_ids = set(target.get("sourceBIds") or [])
        if a_ids:
            source_a: List[Dict[str, Any]] = list(row.source_a or [])
            for i, txn in enumerate(source_a):
                if txn.get("id") in a_ids:
                    new_txn = {**txn, "status": "unmatched"}
                    new_txn.pop("matchGroupId", None)
                    source_a[i] = new_txn
            row.source_a = source_a
            flag_modified(row, "source_a")
        if b_ids:
            source_b: List[Dict[str, Any]] = list(row.source_b or [])
            for i, txn in enumerate(source_b):
                if txn.get("id") in b_ids:
                    new_txn = {**txn, "status": "unmatched"}
                    new_txn.pop("matchGroupId", None)
                    source_b[i] = new_txn
            row.source_b = source_b
            flag_modified(row, "source_b")

    db.commit()
    db.refresh(row)

    action = (
        "reconciliation.group_approved"
        if new_status == "approved"
        else "reconciliation.group_rejected"
    )
    record_audit(
        db,
        firm_id=firm_id,
        user_id=user_id,
        action=action,
        details={"reconciliation_id": str(row.id), "group_id": group_id},
    )
    return row
