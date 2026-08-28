"""Bulk export: full JSON snapshot for a jurisdiction (and descendants) or CSV of rates."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from taxatlas.api.deps import get_principal
from taxatlas.api.v1 import court_decisions as _cd
from taxatlas.api.v1 import regulations as _reg
from taxatlas.api.v1 import tariffs as _tar
from taxatlas.api.v1._util import enum_list_filter, jurisdiction_scope
from taxatlas.core.db import get_db
from taxatlas.models import CourtDecision, Jurisdiction, Regulation, Tariff, TaxRate, TaxType
from taxatlas.schemas.jurisdiction import JurisdictionOut
from taxatlas.schemas.tax import CourtDecisionOut, RegulationOut, TariffOut, TaxRateOut

router = APIRouter(prefix="/export", tags=["export"], dependencies=[Depends(get_principal)])


@router.get("/snapshot")
def snapshot(
    jurisdiction: str | None = Query(None, description="Limit to a jurisdiction and its children"),
    db: Session = Depends(get_db),
):
    ids = jurisdiction_scope(db, jurisdiction, True)

    def scoped(stmt, col):
        return stmt if ids is None else stmt.where(col.in_(ids))

    dump = lambda schema, rows: [schema.model_validate(r).model_dump(mode="json") for r in rows]  # noqa: E731
    # Eager-load the jurisdiction refs the *Out schemas embed; otherwise each row lazy-loads (N+1 over the whole DB).
    rates = select(TaxRate).options(selectinload(TaxRate.jurisdiction))
    regs = select(Regulation).options(selectinload(Regulation.jurisdiction))
    courts = select(CourtDecision).options(selectinload(CourtDecision.jurisdiction))
    tariffs = select(Tariff).options(
        selectinload(Tariff.importing_jurisdiction), selectinload(Tariff.partner_jurisdiction)
    )
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "scope": jurisdiction or "all",
        "disclaimer": "Reference data aggregated from public sources; verify against primary authority before reliance.",
        "jurisdictions": dump(JurisdictionOut, db.scalars(scoped(select(Jurisdiction), Jurisdiction.id))),
        "rates": dump(TaxRateOut, db.scalars(scoped(rates, TaxRate.jurisdiction_id))),
        "regulations": dump(RegulationOut, db.scalars(scoped(regs, Regulation.jurisdiction_id))),
        "court_decisions": dump(CourtDecisionOut, db.scalars(scoped(courts, CourtDecision.jurisdiction_id))),
        "tariffs": dump(TariffOut, db.scalars(scoped(tariffs, Tariff.importing_jurisdiction_id))),
    }


@router.get("/rates.csv")
def rates_csv(
    response: Response,
    jurisdiction: str | None = None,
    tax_type: str | None = Query(None, description="Comma-separated tax types, as on GET /rates"),
    db: Session = Depends(get_db),
):
    ids = jurisdiction_scope(db, jurisdiction, True)
    stmt = select(TaxRate).options(selectinload(TaxRate.jurisdiction))
    if ids is not None:
        stmt = stmt.where(TaxRate.jurisdiction_id.in_(ids))
    types = enum_list_filter(tax_type, TaxType, "tax_type")
    if types:
        stmt = stmt.where(TaxRate.tax_type.in_(types))
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "jurisdiction_code",
            "jurisdiction_name",
            "tax_type",
            "rate_kind",
            "rate_pct",
            "threshold_amount",
            "threshold_currency",
            "description",
            "effective_from",
            "effective_to",
            "as_of",
            "confidence",
            "source_name",
            "source_url",
        ]
    )
    for r in db.scalars(stmt.order_by(TaxRate.jurisdiction_id, TaxRate.tax_type, TaxRate.rate_kind)):
        w.writerow(
            [
                r.jurisdiction.code,
                r.jurisdiction.name,
                r.tax_type,
                r.rate_kind,
                r.rate,
                r.threshold_amount,
                r.threshold_currency,
                r.description,
                r.effective_from,
                r.effective_to,
                r.as_of,
                r.confidence,
                r.source_name,
                r.source_url,
            ]
        )
    buf.seek(0)
    return _stream_csv(response, "taxatlas_rates.csv", buf)


def _stream_csv(response: Response, filename: str, buf: io.StringIO) -> StreamingResponse:
    # Returning a Response directly bypasses FastAPI's merge of dependency-set headers, so copy the
    # rate-limit headers written by get_principal onto the streamed response explicitly.
    headers = {k: v for k, v in response.headers.items() if k.lower().startswith("x-ratelimit-")}
    headers["Content-Disposition"] = f"attachment; filename={filename}"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers=headers)


def _csv_response(response: Response, filename: str, header: list[str], rows) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow(r)
    buf.seek(0)
    return _stream_csv(response, filename, buf)


@router.get("/regulations.csv")
def regulations_csv(request: Request, response: Response, db: Session = Depends(get_db)):
    """CSV of regulations using the same query parameters as GET /regulations (max 5000 rows)."""
    page = _reg.list_regulations(**_params(request, _reg.list_regulations, db))
    return _csv_response(
        response,
        "taxatlas_regulations.csv",
        [
            "id",
            "jurisdiction",
            "tax_type",
            "title",
            "authority",
            "doc_type",
            "status",
            "reference",
            "published_date",
            "effective_date",
            "source_url",
        ],
        (
            [
                r.id,
                r.jurisdiction.code if r.jurisdiction else "",
                r.tax_type,
                r.title,
                r.authority,
                r.doc_type,
                r.status,
                r.reference,
                r.published_date,
                r.effective_date,
                r.source_url,
            ]
            for r in page.items
        ),
    )


@router.get("/court-decisions.csv")
def court_decisions_csv(request: Request, response: Response, db: Session = Depends(get_db)):
    page = _cd.list_decisions(**_params(request, _cd.list_decisions, db))
    return _csv_response(
        response,
        "taxatlas_court_decisions.csv",
        [
            "id",
            "jurisdiction",
            "court",
            "case_name",
            "citation",
            "docket",
            "decision_date",
            "tax_types",
            "significance",
            "outcome",
            "source_url",
        ],
        (
            [
                d.id,
                d.jurisdiction.code if d.jurisdiction else "",
                d.court,
                d.case_name,
                d.citation,
                d.docket,
                d.decision_date,
                "|".join(d.tax_types or []),
                d.significance,
                d.outcome,
                d.source_url,
            ]
            for d in page.items
        ),
    )


@router.get("/tariffs.csv")
def tariffs_csv(request: Request, response: Response, db: Session = Depends(get_db)):
    page = _tar.list_tariffs(**_params(request, _tar.list_tariffs, db))
    return _csv_response(
        response,
        "taxatlas_tariffs.csv",
        [
            "id",
            "importer",
            "partner",
            "partner_scope",
            "hs_code",
            "product_description",
            "measure_type",
            "rate",
            "rate_text",
            "legal_basis",
            "status",
            "effective_from",
            "effective_to",
            "source_url",
        ],
        (
            [
                t.id,
                t.importing_jurisdiction.code,
                t.partner_jurisdiction.code if t.partner_jurisdiction else "",
                t.partner_scope,
                t.hs_code,
                t.product_description,
                t.measure_type,
                t.rate,
                t.rate_text,
                t.legal_basis,
                t.status,
                t.effective_from,
                t.effective_to,
                t.source_url,
            ]
            for t in page.items
        ),
    )


def _params(request: Request, fn, db: Session) -> dict:
    """Re-use a list endpoint's filters for CSV export: pass through known query params, force a large page."""
    import inspect
    from datetime import date as _date

    sig = inspect.signature(fn)
    kwargs: dict = {"db": db}
    qp = request.query_params
    for name, param in sig.parameters.items():
        if name in ("db", "limit", "offset"):
            continue
        if name not in qp:
            # absent filter: use the endpoint's real default, unwrapping FastAPI Query() objects
            d = param.default
            if hasattr(d, "default") and not isinstance(d, (int, float, str, bool)):
                d = d.default
            kwargs[name] = None if d is inspect.Parameter.empty else d
            continue
        raw = qp[name]
        ann = param.annotation
        try:
            if ann in (int, "int", "int | None") or "int" in str(ann):
                kwargs[name] = int(raw)
            elif ann in (bool, "bool") or "bool" in str(ann):
                if raw.lower() not in ("1", "true", "yes", "0", "false", "no"):
                    raise ValueError("expected a boolean")
                kwargs[name] = raw.lower() in ("1", "true", "yes")
            elif "date" in str(ann):
                kwargs[name] = _date.fromisoformat(raw)
            else:
                kwargs[name] = raw
        except ValueError as exc:
            raise _invalid(name, raw, str(exc))
    kwargs["limit"] = 5000
    raw_offset = qp.get("offset", "0")
    try:
        offset = int(raw_offset)
    except ValueError:
        raise _invalid("offset", raw_offset, "expected an integer")
    if offset < 0:
        raise _invalid("offset", raw_offset, "must be >= 0")
    kwargs["offset"] = offset
    return kwargs


def _invalid(name: str, value: str, msg: str) -> HTTPException:
    # Same shape as FastAPI's own query validation errors so clients can handle both uniformly.
    return HTTPException(422, [{"type": "value_error", "loc": ["query", name], "msg": msg, "input": value}])
