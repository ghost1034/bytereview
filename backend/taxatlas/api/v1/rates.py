from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from taxatlas.api.deps import get_principal
from taxatlas.api.v1._util import enum_filter, enum_list_filter, jurisdiction_scope, limit_q, offset_q, paginate
from taxatlas.core.db import get_db
from taxatlas.models import RateKind, TaxRate, TaxType
from taxatlas.schemas.common import Page
from taxatlas.schemas.tax import TaxRateOut

router = APIRouter(prefix="/rates", tags=["rates"], dependencies=[Depends(get_principal)])


@router.get("", response_model=Page[TaxRateOut])
def list_rates(
    jurisdiction: str | None = Query(
        None, description="Jurisdiction code; includes children unless include_children=false"
    ),
    include_children: bool = True,
    tax_type: str | None = None,
    rate_kind: str | None = None,
    effective_on: date | None = Query(None, description="Return rates effective on this date (default: all)"),
    min_rate: float | None = None,
    max_rate: float | None = None,
    limit: int = limit_q(100, 1000),
    offset: int = offset_q(),
    db: Session = Depends(get_db),
):
    stmt = select(TaxRate).options(selectinload(TaxRate.jurisdiction))
    ids = jurisdiction_scope(db, jurisdiction, include_children)
    if ids is not None:
        stmt = stmt.where(TaxRate.jurisdiction_id.in_(ids))
    types = enum_list_filter(tax_type, TaxType, "tax_type")
    if types:
        stmt = stmt.where(TaxRate.tax_type.in_(types))
    kind = enum_filter(rate_kind, RateKind, "rate_kind")
    if kind:
        stmt = stmt.where(TaxRate.rate_kind == kind)
    if effective_on:
        stmt = stmt.where(
            (TaxRate.effective_from.is_(None)) | (TaxRate.effective_from <= effective_on),
            (TaxRate.effective_to.is_(None)) | (TaxRate.effective_to >= effective_on),
        )
    if min_rate is not None:
        stmt = stmt.where(TaxRate.rate >= min_rate)
    if max_rate is not None:
        stmt = stmt.where(TaxRate.rate <= max_rate)
    stmt = stmt.order_by(TaxRate.jurisdiction_id, TaxRate.tax_type, TaxRate.rate_kind, TaxRate.effective_from.desc())
    items, total = paginate(db, stmt, limit, offset)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{rate_id}", response_model=TaxRateOut)
def get_rate(rate_id: int, db: Session = Depends(get_db)):
    from fastapi import HTTPException

    r = db.get(TaxRate, rate_id)
    if not r:
        raise HTTPException(404, "Rate not found")
    return r
