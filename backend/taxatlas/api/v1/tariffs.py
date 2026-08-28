from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from taxatlas.api.deps import get_principal
from taxatlas.api.v1._util import (
    apply_sort,
    enum_filter,
    enum_list_filter,
    jurisdiction_scope,
    like_prefix,
    limit_q,
    offset_q,
    paginate,
)
from taxatlas.core.db import get_db
from taxatlas.models import MeasureStatus, Tariff, TariffMeasure
from taxatlas.schemas.common import Page
from taxatlas.schemas.tax import TariffOut

router = APIRouter(prefix="/tariffs", tags=["tariffs"], dependencies=[Depends(get_principal)])


@router.get("", response_model=Page[TariffOut])
def list_tariffs(
    importer: str | None = Query(None, description="Importing jurisdiction code"),
    partner: str | None = Query(None, description="Partner/origin jurisdiction code"),
    hs_code: str | None = Query(None, description="HS prefix match, e.g. 72 or 8703"),
    measure_type: str | None = None,
    status: str | None = None,
    q: str | None = None,
    effective_on: date | None = None,
    sort: str | None = Query(
        None, description="Sort key: effective, product, importer, partner, measure, rate, status, hs"
    ),
    dir: str | None = Query(None, description="asc | desc (default desc)"),
    limit: int = limit_q(50, 5000),
    offset: int = offset_q(),
    db: Session = Depends(get_db),
):
    stmt = select(Tariff).options(
        selectinload(Tariff.importing_jurisdiction), selectinload(Tariff.partner_jurisdiction)
    )
    imp_ids = jurisdiction_scope(db, importer, False)
    if imp_ids is not None:
        stmt = stmt.where(Tariff.importing_jurisdiction_id.in_(imp_ids))
    par_ids = jurisdiction_scope(db, partner, False)
    if par_ids is not None:
        stmt = stmt.where(Tariff.partner_jurisdiction_id.in_(par_ids))
    if hs_code:
        pattern, esc = like_prefix(hs_code.strip())
        stmt = stmt.where(Tariff.hs_code.like(pattern, escape=esc))
    measures = enum_list_filter(measure_type, TariffMeasure, "measure_type")
    if measures:
        stmt = stmt.where(Tariff.measure_type.in_(measures))
    status = enum_filter(status, MeasureStatus, "status")
    if status:
        stmt = stmt.where(Tariff.status == status)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            Tariff.product_description.ilike(like)
            | Tariff.legal_basis.ilike(like)
            | Tariff.notes.ilike(like)
            | Tariff.product_description_en.ilike(like)
            | Tariff.notes_en.ilike(like)
        )
    if effective_on:
        stmt = stmt.where(
            (Tariff.effective_from.is_(None)) | (Tariff.effective_from <= effective_on),
            (Tariff.effective_to.is_(None)) | (Tariff.effective_to >= effective_on),
        )
    stmt = apply_sort(
        stmt,
        Tariff,
        sort,
        dir,
        {
            "effective": "effective_from",
            "product": "product_description",
            "importer": "importing_jurisdiction_id",
            "partner": "partner_jurisdiction_id",
            "measure": "measure_type",
            "rate": "rate",
            "status": "status",
            "hs": "hs_code",
        },
        lambda q: q.order_by(Tariff.effective_from.desc().nullslast(), Tariff.id.desc()),
    )
    items, total = paginate(db, stmt, limit, offset)
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{tariff_id}", response_model=TariffOut)
def get_tariff(tariff_id: int, db: Session = Depends(get_db)):
    t = db.get(Tariff, tariff_id)
    if not t:
        raise HTTPException(404, "Tariff not found")
    return t
