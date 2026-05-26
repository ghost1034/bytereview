"""CRUD service for `analyses` rows (variance + waterfall)."""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import Analysis


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
    return row


def update_analysis(db: Session, firm_id, analysis_id: str, *, payload) -> Analysis:
    row = get_analysis(db, firm_id, analysis_id)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_analysis(db: Session, firm_id, analysis_id: str) -> None:
    row = get_analysis(db, firm_id, analysis_id)
    db.delete(row)
    db.commit()
