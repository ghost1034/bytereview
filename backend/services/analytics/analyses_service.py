"""CRUD service for `analyses` rows (variance + waterfall)."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import Analysis
from services.analytics.audit_service import record_audit


# Small, scalar fields safe to diff in the audit log. The large JSONB columns
# (config/data/results) and memo_content are tracked by name only (see
# `_PAYLOAD_FIELDS`) so we never write big blobs into `analytics_audit_logs`.
_AUDITED_FIELDS = ("name", "status", "client_id")
_PAYLOAD_FIELDS = ("config", "data", "results", "memo_content")


def list_analyses(db: Session, firm_id, type_: Optional[str] = None) -> List[Analysis]:
    q = db.query(Analysis).filter(Analysis.firm_id == firm_id)
    if type_:
        q = q.filter(Analysis.type == type_)
    return q.order_by(Analysis.updated_at.desc()).all()


def get_analysis(db: Session, firm_id, analysis_id: str) -> Analysis:
    row = (
        db.query(Analysis)
        .filter(Analysis.id == analysis_id, Analysis.firm_id == firm_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return row


def create_analysis(
    db: Session,
    firm_id,
    user_id: str,
    *,
    payload,
    expected_type: Optional[str] = None,
) -> Analysis:
    if expected_type and payload.type != expected_type:
        raise HTTPException(
            status_code=400,
            detail=f"Expected analysis type '{expected_type}', got '{payload.type}'",
        )
    row = Analysis(
        id=uuid.uuid4(),
        firm_id=firm_id,
        client_id=payload.client_id,
        created_by_user_id=user_id,
        type=payload.type,
        name=payload.name,
        status=payload.status or "draft",
        config=payload.config,
        data=payload.data,
        results=payload.results,
        memo_content=payload.memo_content,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    record_audit(
        db,
        firm_id=firm_id,
        user_id=user_id,
        action="analysis.created",
        details={"analysis_id": str(row.id), "type": row.type, "name": row.name},
    )
    return row


def update_analysis(
    db: Session, firm_id, analysis_id: str, *, payload, actor_user_id: str
) -> Analysis:
    row = get_analysis(db, firm_id, analysis_id)
    data = payload.model_dump(exclude_unset=True)
    before: Dict[str, Any] = {k: getattr(row, k) for k in _AUDITED_FIELDS if k in data}
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)

    after = {k: getattr(row, k) for k in before}
    diff = {k: {"before": before[k], "after": after[k]} for k in before if before[k] != after[k]}
    payload_changed = [k for k in _PAYLOAD_FIELDS if k in data]
    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="analysis.updated",
        details={
            "analysis_id": str(row.id),
            "type": row.type,
            "name": row.name,
            "diff": diff,
            "payload_changed": payload_changed,
        },
    )
    return row


def delete_analysis(db: Session, firm_id, analysis_id: str, *, actor_user_id: str) -> None:
    row = get_analysis(db, firm_id, analysis_id)
    snapshot = {"analysis_id": str(row.id), "type": row.type, "name": row.name}
    db.delete(row)
    db.commit()

    record_audit(
        db,
        firm_id=firm_id,
        user_id=actor_user_id,
        action="analysis.deleted",
        details=snapshot,
    )
