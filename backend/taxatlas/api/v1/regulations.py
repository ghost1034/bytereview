from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from taxatlas.api.deps import get_principal
from taxatlas.api.v1._util import apply_sort, enum_filter, enum_list_filter, jurisdiction_scope, limit_q, offset_q, paginate
from taxatlas.core.db import get_db
from taxatlas.models import DocType, Regulation, RegulationStatus, TaxType
from taxatlas.schemas.common import Page
from taxatlas.schemas.tax import RegulationDetail, RegulationOut

router = APIRouter(prefix="/regulations", tags=["regulations"], dependencies=[Depends(get_principal)])


@router.get("", response_model=Page[RegulationOut])
def list_regulations(
    jurisdiction: str | None = None,
    include_children: bool = True,
    tax_type: str | None = None,
    status: str | None = None,
    doc_type: str | None = None,
    authority: str | None = None,
    q: str | None = Query(None, description="Full-text-ish search in title/summary (and their English translations)"),
    published_since: date | None = None,
    published_until: date | None = None,
    effective_since: date | None = None,
    sort: str | None = Query(
        None, description="Sort key: published, effective, title, jurisdiction, tax_type, status, doc_type, seen"
    ),
    dir: str | None = Query(None, description="asc | desc (default desc)"),
    limit: int = limit_q(50, 5000),
    offset: int = offset_q(),
    db: Session = Depends(get_db),
):
    stmt = select(Regulation).options(selectinload(Regulation.jurisdiction))
    ids = jurisdiction_scope(db, jurisdiction, include_children)
    if ids is not None:
        stmt = stmt.where(Regulation.jurisdiction_id.in_(ids))
    types = enum_list_filter(tax_type, TaxType, "tax_type")
    if types:
        stmt = stmt.where(Regulation.tax_type.in_(types))
    status = enum_filter(status, RegulationStatus, "status")
    if status:
        stmt = stmt.where(Regulation.status == status)
    doc_type = enum_filter(doc_type, DocType, "doc_type")
    if doc_type:
        stmt = stmt.where(Regulation.doc_type == doc_type)
    if authority:
        stmt = stmt.where(Regulation.authority.ilike(f"%{authority}%"))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            Regulation.title.ilike(like)
            | Regulation.summary.ilike(like)
            | Regulation.title_en.ilike(like)
            | Regulation.summary_en.ilike(like)
        )
    if published_since:
        stmt = stmt.where(Regulation.published_date >= published_since)
    if published_until:
        stmt = stmt.where(Regulation.published_date <= published_until)
    if effective_since:
        stmt = stmt.where(Regulation.effective_date >= effective_since)
    stmt = apply_sort(
        stmt,
        Regulation,
        sort,
        dir,
        {
            "published": "published_date",
            "effective": "effective_date",
            "title": "title",
            "jurisdiction": "jurisdiction_id",
            "tax_type": "tax_type",
            "status": "status",
            "doc_type": "doc_type",
            "seen": "first_seen_at",
        },
        lambda q: q.order_by(Regulation.published_date.desc().nullslast(), Regulation.id.desc()),
    )
    items, total = paginate(db, stmt, limit, offset)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{reg_id}", response_model=RegulationDetail)
def get_regulation(reg_id: int, db: Session = Depends(get_db)):
    r = db.get(Regulation, reg_id)
    if not r:
        raise HTTPException(404, "Regulation not found")
    return r
