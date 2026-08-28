from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from taxatlas.api.deps import Principal, get_principal, principal_scopes
from taxatlas.api.v1._util import (
    current_rate_clause,
    descendant_ids,
    enum_filter,
    enum_list_filter,
    limit_q,
    offset_q,
    paginate,
    resolve_jurisdiction,
)
from taxatlas.core.db import get_db
from taxatlas.models import (
    ChangeEvent,
    CourtDecision,
    Jurisdiction,
    JurisdictionLevel,
    Regulation,
    Tariff,
    TaxRate,
    TaxType,
)
from taxatlas.schemas.common import Page
from taxatlas.schemas.jurisdiction import JurisdictionDetail, JurisdictionOut
from taxatlas.schemas.tax import TaxRateOut
from taxatlas.services.changes import change_event_out

router = APIRouter(prefix="/jurisdictions", tags=["jurisdictions"], dependencies=[Depends(get_principal)])


@router.get("", response_model=Page[JurisdictionOut])
def list_jurisdictions(
    level: str | None = None,
    parent: str | None = Query(None, description="Parent jurisdiction code, e.g. US"),
    region: str | None = None,
    q: str | None = Query(None, description="Name/code search"),
    include: str | None = Query(None, description="'headline' adds current VAT/sales/CIT/PIT/WHT values per row"),
    limit: int = limit_q(200, 1000),
    offset: int = offset_q(),
    db: Session = Depends(get_db),
):
    stmt = select(Jurisdiction).where(Jurisdiction.is_active.is_(True))
    level = enum_filter(level, JurisdictionLevel, "level")
    if level:
        stmt = stmt.where(Jurisdiction.level == level)
    if parent:
        # filter semantics like `jurisdiction=` elsewhere: an unknown parent code is an empty page, not a 404
        parent_row = db.scalar(select(Jurisdiction).where(func.upper(Jurisdiction.code) == parent.upper()))
        if parent_row is None:
            return Page(items=[], total=0, limit=limit, offset=offset)
        stmt = stmt.where(Jurisdiction.parent_id == parent_row.id)
    if region:
        stmt = stmt.where(Jurisdiction.region == region)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Jurisdiction.name.ilike(like) | Jurisdiction.code.ilike(like))
    stmt = stmt.order_by(Jurisdiction.level, Jurisdiction.name)
    items, total = paginate(db, stmt, limit, offset)
    if items:
        attach_children_counts(db, items)
        if include == "headline":
            attach_headline_rates(db, items)
    return Page(items=items, total=total, limit=limit, offset=offset)


def attach_children_counts(db: Session, items: list[Jurisdiction]) -> None:
    ids = [j.id for j in items]
    rows = db.execute(
        select(Jurisdiction.parent_id, func.count())
        .where(Jurisdiction.parent_id.in_(ids), Jurisdiction.is_active.is_(True))
        .group_by(Jurisdiction.parent_id)
    ).all()
    counts = dict(rows)
    for j in items:
        j.children_count = counts.get(j.id, 0)


HEADLINE_KEYS: dict[str, tuple[tuple[str, ...], str]] = {
    # output key -> (tax types, rate kind); first current match wins
    "vat_standard": (("vat", "gst"), "standard"),
    "sales_use_standard": (("sales_use",), "standard"),
    "cit_headline": (("corporate_income",), "headline"),
    "pit_top": (("personal_income",), "top_marginal"),
    "wht_dividends": (("withholding",), "dividends"),
}


def attach_headline_rates(db: Session, items: list[Jurisdiction]) -> None:
    """Populate `j.headline` (dict) with the current standard VAT/GST, sales tax, CIT, top PIT and dividend WHT.

    One query for the whole page: latest effective row per (jurisdiction, tax_type, rate_kind) via a window function.
    """
    today = datetime.now(UTC).date()
    ids = [j.id for j in items]
    wanted_types = sorted({t for types, _ in HEADLINE_KEYS.values() for t in types})
    wanted_kinds = sorted({k for _, k in HEADLINE_KEYS.values()})
    ranked = (
        select(
            TaxRate.jurisdiction_id,
            TaxRate.tax_type,
            TaxRate.rate_kind,
            TaxRate.rate,
            TaxRate.threshold_amount,
            TaxRate.threshold_currency,
            func.row_number()
            .over(
                partition_by=(TaxRate.jurisdiction_id, TaxRate.tax_type, TaxRate.rate_kind),
                order_by=(TaxRate.effective_from.desc().nullslast(), TaxRate.id.desc()),
            )
            .label("rn"),
        )
        .where(
            TaxRate.jurisdiction_id.in_(ids),
            TaxRate.tax_type.in_(wanted_types),
            TaxRate.rate_kind.in_(wanted_kinds),
            current_rate_clause(today),
        )
        .subquery()
    )
    by_jur: dict[int, dict[tuple[str, str], float | None]] = {}
    for row in db.execute(select(ranked).where(ranked.c.rn == 1)):
        by_jur.setdefault(row.jurisdiction_id, {})[(row.tax_type, row.rate_kind)] = row.rate
    for j in items:
        found = by_jur.get(j.id, {})
        headline: dict[str, float | None] = {}
        for key, (types, kind) in HEADLINE_KEYS.items():
            val = None
            for t in types:
                if (t, kind) in found:
                    val = found[(t, kind)]
                    break
            headline[key] = val
        j.headline = headline  # transient attribute picked up by JurisdictionOut.headline


@router.get("/{code}", response_model=JurisdictionDetail)
def get_jurisdiction(code: str, db: Session = Depends(get_db)):
    j = resolve_jurisdiction(db, code)
    ids = descendant_ids(db, j)
    cnt = lambda model, col: db.scalar(select(func.count()).select_from(model).where(col.in_(ids))) or 0  # noqa: E731
    since = datetime.now(UTC) - timedelta(days=30)
    out = JurisdictionDetail.model_validate(j)
    out.parent_code = j.parent.code if j.parent else None
    out.children_count = (
        db.scalar(
            select(func.count())
            .select_from(Jurisdiction)
            .where(Jurisdiction.parent_id == j.id, Jurisdiction.is_active.is_(True))
        )
        or 0
    )
    out.rates_count = cnt(TaxRate, TaxRate.jurisdiction_id)
    out.regulations_count = cnt(Regulation, Regulation.jurisdiction_id)
    out.court_decisions_count = cnt(CourtDecision, CourtDecision.jurisdiction_id)
    out.tariffs_count = cnt(Tariff, Tariff.importing_jurisdiction_id)
    out.changes_30d = (
        db.scalar(
            select(func.count())
            .select_from(ChangeEvent)
            .where(ChangeEvent.jurisdiction_id.in_(ids), ChangeEvent.detected_at >= since)
        )
        or 0
    )
    return out


@router.get("/{code}/children", response_model=list[JurisdictionOut])
def children(code: str, db: Session = Depends(get_db)):
    j = resolve_jurisdiction(db, code)
    stmt = select(Jurisdiction).where(Jurisdiction.parent_id == j.id, Jurisdiction.is_active.is_(True))
    return list(db.scalars(stmt.order_by(Jurisdiction.name)))


@router.get("/{code}/rates", response_model=list[TaxRateOut])
def jurisdiction_rates(
    code: str,
    tax_type: str | None = None,
    current_only: bool = Query(True, description="Only rates effective today"),
    db: Session = Depends(get_db),
):
    j = resolve_jurisdiction(db, code)
    stmt = select(TaxRate).where(TaxRate.jurisdiction_id == j.id)
    types = enum_list_filter(tax_type, TaxType, "tax_type")
    if types:
        stmt = stmt.where(TaxRate.tax_type.in_(types))
    if current_only:
        stmt = stmt.where(current_rate_clause(datetime.now(UTC).date()))
    return list(db.scalars(stmt.order_by(TaxRate.tax_type, TaxRate.rate_kind, TaxRate.effective_from.desc())))


@router.get("/{code}/summary")
def jurisdiction_summary(code: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    """One-call bundle for a jurisdiction page: detail, current rates grouped by tax type, latest items."""
    j = resolve_jurisdiction(db, code)
    ids = descendant_ids(db, j)
    today = datetime.now(UTC).date()
    rates = list(
        db.scalars(
            select(TaxRate)
            .where(TaxRate.jurisdiction_id == j.id, current_rate_clause(today))
            .order_by(TaxRate.tax_type, TaxRate.rate_kind)
        )
    )
    grouped: dict[str, list] = {}
    for r in rates:
        grouped.setdefault(r.tax_type, []).append(TaxRateOut.model_validate(r).model_dump(mode="json"))
    from taxatlas.schemas.tax import CourtDecisionOut, RegulationOut, TariffOut

    regs = db.scalars(
        select(Regulation)
        .where(Regulation.jurisdiction_id.in_(ids))
        .order_by(Regulation.published_date.desc().nullslast())
        .limit(10)
    )
    courts = db.scalars(
        select(CourtDecision)
        .where(CourtDecision.jurisdiction_id.in_(ids))
        .order_by(CourtDecision.decision_date.desc().nullslast())
        .limit(10)
    )
    tariffs = db.scalars(
        select(Tariff)
        .where(Tariff.importing_jurisdiction_id.in_(ids))
        .order_by(Tariff.effective_from.desc().nullslast())
        .limit(10)
    )
    changes = db.scalars(
        select(ChangeEvent)
        .where(ChangeEvent.jurisdiction_id.in_(ids))
        .order_by(ChangeEvent.detected_at.desc())
        .limit(20)
    )
    return {
        "jurisdiction": get_jurisdiction(code, db).model_dump(mode="json"),
        "rates_by_type": grouped,
        "recent_regulations": [RegulationOut.model_validate(r).model_dump(mode="json") for r in regs],
        "recent_court_decisions": [CourtDecisionOut.model_validate(c).model_dump(mode="json") for c in courts],
        "recent_tariffs": [TariffOut.model_validate(t).model_dump(mode="json") for t in tariffs],
        "recent_changes": [
            change_event_out(c, admin="admin" in principal_scopes(p)).model_dump(mode="json") for c in changes
        ],
    }
