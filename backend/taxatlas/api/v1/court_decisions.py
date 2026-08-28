from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, select
from sqlalchemy.orm import Session, selectinload

from taxatlas.api.deps import get_principal
from taxatlas.api.v1._util import apply_sort, enum_filter, jurisdiction_scope, limit_q, offset_q, paginate
from taxatlas.core.db import get_db
from taxatlas.models import CourtDecision, Outcome, Significance, TaxType
from taxatlas.schemas.common import Page
from taxatlas.schemas.tax import CourtDecisionOut

router = APIRouter(prefix="/court-decisions", tags=["court-decisions"], dependencies=[Depends(get_principal)])


@router.get("", response_model=Page[CourtDecisionOut])
def list_decisions(
    jurisdiction: str | None = None,
    include_children: bool = True,
    tax_type: str | None = None,
    court: str | None = None,
    significance: str | None = None,
    outcome: str | None = None,
    q: str | None = Query(None, description="Search case name / summary / holding"),
    decided_since: date | None = None,
    decided_until: date | None = None,
    sort: str | None = Query(
        None, description="Sort key: decided, case, court, jurisdiction, significance, outcome, seen"
    ),
    dir: str | None = Query(None, description="asc | desc (default desc)"),
    limit: int = limit_q(50, 5000),
    offset: int = offset_q(),
    db: Session = Depends(get_db),
):
    stmt = select(CourtDecision).options(selectinload(CourtDecision.jurisdiction))
    ids = jurisdiction_scope(db, jurisdiction, include_children)
    if ids is not None:
        stmt = stmt.where(CourtDecision.jurisdiction_id.in_(ids))
    tax_type = enum_filter(tax_type, TaxType, "tax_type")
    if tax_type:
        # tax_types is a JSON list; portable LIKE on its serialized form (value is a validated enum, no metachars)
        stmt = stmt.where(cast(CourtDecision.tax_types, String).ilike(f'%"{tax_type}"%'))
    if court:
        stmt = stmt.where(CourtDecision.court.ilike(f"%{court}%"))
    significance = enum_filter(significance, Significance, "significance")
    if significance:
        stmt = stmt.where(CourtDecision.significance == significance)
    outcome = enum_filter(outcome, Outcome, "outcome")
    if outcome:
        stmt = stmt.where(CourtDecision.outcome == outcome)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            CourtDecision.case_name.ilike(like)
            | CourtDecision.summary.ilike(like)
            | CourtDecision.holding.ilike(like)
            | CourtDecision.case_name_en.ilike(like)
            | CourtDecision.summary_en.ilike(like)
            | CourtDecision.holding_en.ilike(like)
        )
    if decided_since:
        stmt = stmt.where(CourtDecision.decision_date >= decided_since)
    if decided_until:
        stmt = stmt.where(CourtDecision.decision_date <= decided_until)
    stmt = apply_sort(
        stmt,
        CourtDecision,
        sort,
        dir,
        {
            "decided": "decision_date",
            "case": "case_name",
            "court": "court",
            "jurisdiction": "jurisdiction_id",
            "significance": "significance",
            "outcome": "outcome",
            "seen": "first_seen_at",
        },
        lambda q: q.order_by(CourtDecision.decision_date.desc().nullslast(), CourtDecision.id.desc()),
    )
    items, total = paginate(db, stmt, limit, offset)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{decision_id}", response_model=CourtDecisionOut)
def get_decision(decision_id: int, db: Session = Depends(get_db)):
    d = db.get(CourtDecision, decision_id)
    if not d:
        raise HTTPException(404, "Decision not found")
    return d
