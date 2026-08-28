from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from taxatlas.api.deps import get_principal
from taxatlas.api.v1._util import current_rate_clause, enum_filter, resolve_jurisdiction
from taxatlas.core.db import get_db
from taxatlas.models import (
    ChangeEvent,
    CourtDecision,
    Jurisdiction,
    JurisdictionLevel,
    RateKind,
    Tariff,
    TaxRate,
    TaxType,
)
from taxatlas.schemas.jurisdiction import ChoroplethPoint

router = APIRouter(prefix="/map", tags=["map"], dependencies=[Depends(get_principal)])


@router.get("/choropleth", response_model=list[ChoroplethPoint])
def choropleth(
    tax_type: str = Query("vat"),
    rate_kind: str = Query("standard"),
    level: str = Query("country"),
    parent: str | None = Query(None, description="Required for sub-national levels, e.g. US"),
    db: Session = Depends(get_db),
):
    """Rate value per jurisdiction for map shading. VAT and GST are merged when tax_type=vat (indirect view).

    Single query: latest effective rate per jurisdiction via a window function, then left-joined to the
    jurisdiction list so every feature gets a row (value None when untracked).
    """
    today = datetime.now(UTC).date()
    tax_type = enum_filter(tax_type, TaxType, "tax_type") or "vat"
    rate_kind = enum_filter(rate_kind, RateKind, "rate_kind") or "standard"
    level = enum_filter(level, JurisdictionLevel, "level") or "country"
    types = ["vat", "gst"] if tax_type == "vat" else [tax_type]
    jq = select(Jurisdiction).where(Jurisdiction.is_active.is_(True))
    if level == "country":
        jq = jq.where(Jurisdiction.level == JurisdictionLevel.COUNTRY)
    else:
        jq = jq.where(Jurisdiction.level == level)
        if parent:
            jq = jq.where(Jurisdiction.parent_id == resolve_jurisdiction(db, parent).id)
    ranked = (
        select(
            TaxRate,
            func.row_number()
            .over(
                partition_by=TaxRate.jurisdiction_id,
                order_by=(TaxRate.effective_from.desc().nullslast(), TaxRate.id.desc()),
            )
            .label("rn"),
        )
        .where(TaxRate.tax_type.in_(types), TaxRate.rate_kind == rate_kind, current_rate_clause(today))
        .subquery()
    )
    latest = {row.jurisdiction_id: row for row in db.execute(select(ranked).where(ranked.c.rn == 1))}
    out: list[ChoroplethPoint] = []
    for j in db.scalars(jq.order_by(Jurisdiction.name)):
        r = latest.get(j.id)
        value = label = None
        if r is not None:
            value = r.rate if r.rate is not None else r.threshold_amount
            if r.rate is not None:
                label = f"{r.rate:g}%"
            elif r.threshold_amount is not None:
                label = f"{r.threshold_amount:,.0f} {r.threshold_currency or ''}".strip()
            else:
                label = r.description
        out.append(
            ChoroplethPoint(
                code=j.code,
                name=j.name,
                iso_numeric=j.iso_numeric,
                fips=j.fips,
                value=value,
                label=label,
                as_of=r.as_of if r is not None else None,
                effective_from=r.effective_from if r is not None else None,
                source_name=r.source_name if r is not None else None,
            )
        )
    return out


@router.get("/activity")
def activity(days: int = Query(30, ge=1, le=3650), db: Session = Depends(get_db)):
    """Per-country counts of recent changes, court decisions, and in-force tariff measures (for map layers)."""
    from datetime import timedelta

    since = datetime.now(UTC) - timedelta(days=days)
    since_d = since.date()
    countries = {
        j.id: j for j in db.scalars(select(Jurisdiction).where(Jurisdiction.level == JurisdictionLevel.COUNTRY))
    }
    parent_of = {j.id: (j.parent_id or j.id) for j in db.scalars(select(Jurisdiction))}

    def roll(rows):
        agg: dict[int, int] = {}
        for jid, n in rows:
            if jid is None:
                continue
            root = parent_of.get(jid, jid)
            # climb to country level (two hops is enough for country->state->city)
            while root not in countries and root in parent_of and parent_of[root] != root:
                root = parent_of[root]
            agg[root] = agg.get(root, 0) + n
        return agg

    changes = roll(
        db.execute(
            select(ChangeEvent.jurisdiction_id, func.count())
            .where(ChangeEvent.detected_at >= since)
            .group_by(ChangeEvent.jurisdiction_id)
        )
    )
    courts = roll(
        db.execute(
            select(CourtDecision.jurisdiction_id, func.count())
            .where(CourtDecision.decision_date >= since_d)
            .group_by(CourtDecision.jurisdiction_id)
        )
    )
    tariffs = roll(
        db.execute(
            select(Tariff.importing_jurisdiction_id, func.count())
            .where(Tariff.status == "in_force")
            .group_by(Tariff.importing_jurisdiction_id)
        )
    )
    return [
        {
            "code": j.code,
            "name": j.name,
            "iso_numeric": j.iso_numeric,
            "lat": j.lat,
            "lon": j.lon,
            "changes": changes.get(j.id, 0),
            "court_decisions": courts.get(j.id, 0),
            "tariffs": tariffs.get(j.id, 0),
        }
        for j in countries.values()
    ]


@router.get("/coverage")
def coverage(
    metrics: str = Query(
        "vat:standard,corporate_income:headline,personal_income:top_marginal,withholding:dividends,digital_services:standard",
        description="Comma-separated tax_type:rate_kind pairs",
    ),
    level: str = Query("country"),
    parent: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Number of jurisdictions with a current rate per metric, in one call (the map rail shows these counts).

    `vat` merges VAT and GST like /choropleth. Returns {"total": N, "metrics": {"vat:standard": n, ...}}.
    """
    today = datetime.now(UTC).date()
    level = enum_filter(level, JurisdictionLevel, "level") or "country"
    jq = select(Jurisdiction.id).where(Jurisdiction.is_active.is_(True))
    if level == "country":
        jq = jq.where(Jurisdiction.level == JurisdictionLevel.COUNTRY)
    else:
        jq = jq.where(Jurisdiction.level == level)
        if parent:
            jq = jq.where(Jurisdiction.parent_id == resolve_jurisdiction(db, parent).id)
    ids = list(db.scalars(jq))
    pairs = [m.strip() for m in metrics.split(",") if ":" in m]
    wanted: dict[tuple[str, str], str] = {}
    for key in pairs:
        tt, rk = key.split(":", 1)
        enum_filter(tt, TaxType, "metrics")
        enum_filter(rk, RateKind, "metrics")
        for t in ["vat", "gst"] if tt == "vat" else [tt]:
            wanted[(t, rk)] = key
    rows = db.execute(
        select(TaxRate.tax_type, TaxRate.rate_kind, func.count(func.distinct(TaxRate.jurisdiction_id)))
        .where(
            TaxRate.jurisdiction_id.in_(ids),
            TaxRate.tax_type.in_({t for t, _ in wanted}),
            TaxRate.rate_kind.in_({r for _, r in wanted}),
            current_rate_clause(today),
            (TaxRate.rate.isnot(None)) | (TaxRate.threshold_amount.isnot(None)),
        )
        .group_by(TaxRate.tax_type, TaxRate.rate_kind)
    ).all()
    out = {k: 0 for k in pairs}
    for tt, rk, n in rows:
        key = wanted.get((tt, rk))
        if key:
            out[key] += n
    return {"total": len(ids), "level": level, "parent": parent, "metrics": out}


@router.get("/subnational")
def subnational(db: Session = Depends(get_db)):
    """Countries that have sub-national jurisdictions with rate data, and the metrics available for each.

    Drives the map's drill-down: a country appears here when at least one child jurisdiction carries a current
    rate. `metrics` lists distinct (tax_type, rate_kind) pairs among the children with the number of children
    covered, so the frontend can build the per-country metric list without hard-coding it.
    """
    today = datetime.now(UTC).date()
    child = Jurisdiction.__table__.alias("child")
    parent = Jurisdiction.__table__.alias("parent")
    rows = db.execute(
        select(
            parent.c.code,
            parent.c.name,
            child.c.level,
            TaxRate.tax_type,
            TaxRate.rate_kind,
            func.count(func.distinct(child.c.id)),
        )
        .select_from(TaxRate)
        .join(child, child.c.id == TaxRate.jurisdiction_id)
        .join(parent, parent.c.id == child.c.parent_id)
        .where(
            child.c.is_active.is_(True),
            (TaxRate.effective_to.is_(None)) | (TaxRate.effective_to >= today),
            (TaxRate.effective_from.is_(None)) | (TaxRate.effective_from <= today),
            (TaxRate.rate.isnot(None)) | (TaxRate.threshold_amount.isnot(None)),
        )
        .group_by(parent.c.code, parent.c.name, child.c.level, TaxRate.tax_type, TaxRate.rate_kind)
    ).all()
    children_total = dict(
        db.execute(
            select(parent.c.code, func.count(child.c.id))
            .select_from(child)
            .join(parent, parent.c.id == child.c.parent_id)
            .where(child.c.is_active.is_(True))
            .group_by(parent.c.code)
        ).all()
    )
    out: dict[str, dict] = {}
    for code, name, level, tt, rk, n in rows:
        entry = out.setdefault(
            code, {"code": code, "name": name, "level": level, "children": children_total.get(code, 0), "metrics": []}
        )
        entry["metrics"].append({"tax_type": tt, "rate_kind": rk, "coverage": n})
    for e in out.values():
        e["metrics"].sort(key=lambda m: (-m["coverage"], m["tax_type"], m["rate_kind"]))
    return sorted(out.values(), key=lambda e: e["name"])


@router.get("/metrics")
def metrics(
    level: str = Query("country"),
    parent: str | None = Query(None),
    min_coverage: int = Query(3, ge=1),
    db: Session = Depends(get_db),
):
    """Every (tax_type, rate_kind) pair that has a current rate for at least `min_coverage` jurisdictions at this level.

    Drives the map's metric list so it grows with the data instead of being hard-coded. Thresholds (rate NULL,
    threshold_amount set) are included and flagged with `unit: "amount"`; VAT and GST are kept separate here —
    the frontend merges them into one "VAT / GST" entry.
    """
    today = datetime.now(UTC).date()
    jq = select(Jurisdiction.id).where(Jurisdiction.is_active.is_(True))
    if level == "country":
        jq = jq.where(Jurisdiction.level == JurisdictionLevel.COUNTRY)
    else:
        jq = jq.where(Jurisdiction.level == level)
        if parent:
            jq = jq.where(Jurisdiction.parent_id == resolve_jurisdiction(db, parent).id)
    total = db.scalar(select(func.count()).select_from(jq.subquery())) or 0
    rows = db.execute(
        select(
            TaxRate.tax_type,
            TaxRate.rate_kind,
            func.count(func.distinct(TaxRate.jurisdiction_id)),
            func.sum(case((TaxRate.rate.isnot(None), 1), else_=0)),
            func.sum(case((TaxRate.threshold_amount.isnot(None), 1), else_=0)),
        )
        .where(
            TaxRate.jurisdiction_id.in_(jq),
            (TaxRate.effective_to.is_(None)) | (TaxRate.effective_to >= today),
            (TaxRate.effective_from.is_(None)) | (TaxRate.effective_from <= today),
            (TaxRate.rate.isnot(None)) | (TaxRate.threshold_amount.isnot(None)),
        )
        .group_by(TaxRate.tax_type, TaxRate.rate_kind)
    ).all()
    out = []
    for tt, rk, n, n_rate, n_amt in rows:
        if n < min_coverage:
            continue
        out.append(
            {
                "tax_type": tt,
                "rate_kind": rk,
                "coverage": int(n),
                "unit": "percent" if (n_rate or 0) >= (n_amt or 0) else "amount",
            }
        )
    out.sort(key=lambda m: (m["tax_type"], -m["coverage"], m["rate_kind"]))
    return {"level": level, "parent": parent, "total": total, "metrics": out}
