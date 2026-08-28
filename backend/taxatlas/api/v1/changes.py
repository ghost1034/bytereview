from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from taxatlas.api.deps import Principal, get_principal, principal_scopes
from taxatlas.api.v1._util import enum_filter, jurisdiction_scope, limit_q, offset_q, paginate
from taxatlas.core.db import get_db
from taxatlas.models import ChangeEvent, ChangeType, EntityType, TaxType
from taxatlas.schemas.common import Page
from taxatlas.schemas.tax import ChangeEventOut
from taxatlas.services.changes import change_event_out

router = APIRouter(prefix="/changes", tags=["changes"], dependencies=[Depends(get_principal)])


def detected_since(since: datetime):
    """`detected_at >= since`, robust to SQLite's text comparison.

    SQLite stores naive UTC and drops tzinfo on bind without converting, so normalise to naive UTC first.
    Rows written by CURRENT_TIMESTAMP carry no fractional seconds ("…:12") while a bound datetime always does
    ("…:12.000000"); as text the stored value then sorts *below* an equal bound value and `>=` silently drops
    events at the boundary second. `> since - 1µs` is the same predicate at datetime precision and compares
    correctly in both representations.
    """
    if since.tzinfo is not None:
        since = since.astimezone(UTC).replace(tzinfo=None)
    return ChangeEvent.detected_at > since - timedelta(microseconds=1)


@router.get("", response_model=Page[ChangeEventOut])
def list_changes(
    jurisdiction: str | None = None,
    include_children: bool = True,
    tax_type: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = Query(None, description="Restrict to one record (pair with entity_type)"),
    change_type: str | None = None,
    source_id: int | None = Query(None, description="Only changes produced by this crawler source"),
    since: datetime | None = Query(None, description="ISO timestamp; use for incremental sync"),
    limit: int = limit_q(),
    offset: int = offset_q(),
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    stmt = select(ChangeEvent).options(selectinload(ChangeEvent.jurisdiction))
    ids = jurisdiction_scope(db, jurisdiction, include_children)
    if ids is not None:
        stmt = stmt.where(ChangeEvent.jurisdiction_id.in_(ids))
    tax_type = enum_filter(tax_type, TaxType, "tax_type")
    if tax_type:
        stmt = stmt.where(ChangeEvent.tax_type == tax_type)
    entity_type = enum_filter(entity_type, EntityType, "entity_type")
    if entity_type:
        stmt = stmt.where(ChangeEvent.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(ChangeEvent.entity_id == entity_id)
    change_type = enum_filter(change_type, ChangeType, "change_type")
    if change_type:
        stmt = stmt.where(ChangeEvent.change_type == change_type)
    if source_id is not None:
        stmt = stmt.where(ChangeEvent.source_id == source_id)
    if since:
        stmt = stmt.where(detected_since(since))
    stmt = stmt.order_by(ChangeEvent.detected_at.desc(), ChangeEvent.id.desc())
    items, total = paginate(db, stmt, limit, offset)
    admin = "admin" in principal_scopes(p)
    return Page(items=[change_event_out(e, admin=admin) for e in items], total=total, limit=limit, offset=offset)


@router.get("/histogram")
def histogram(
    days: int = Query(30, ge=1, le=365),
    jurisdiction: str | None = None,
    include_children: bool = True,
    tax_type: str | None = None,
    entity_type: str | None = None,
    change_type: str | None = None,
    source_id: int | None = None,
    since: datetime | None = Query(None, description="Start of window (overrides days when later than now-days)"),
    db: Session = Depends(get_db),
):
    """Server-side daily counts of change events for the last N days (UTC), zero-filled."""
    from datetime import timedelta

    now = datetime.now(UTC)
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    if since is not None:
        since_utc = since.astimezone(UTC) if since.tzinfo else since.replace(tzinfo=UTC)
        since_day = since_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        if since_day > start:
            start = since_day
            days = max(1, (now.date() - start.date()).days + 1)
    stmt = select(ChangeEvent.detected_at).where(detected_since(start))
    ids = jurisdiction_scope(db, jurisdiction, include_children)
    if ids is not None:
        stmt = stmt.where(ChangeEvent.jurisdiction_id.in_(ids))
    tax_type = enum_filter(tax_type, TaxType, "tax_type")
    if tax_type:
        stmt = stmt.where(ChangeEvent.tax_type == tax_type)
    entity_type = enum_filter(entity_type, EntityType, "entity_type")
    if entity_type:
        stmt = stmt.where(ChangeEvent.entity_type == entity_type)
    change_type = enum_filter(change_type, ChangeType, "change_type")
    if change_type:
        stmt = stmt.where(ChangeEvent.change_type == change_type)
    if source_id is not None:
        stmt = stmt.where(ChangeEvent.source_id == source_id)
    counts: dict[str, int] = {}
    for (ts,) in db.execute(stmt):
        key = ts.date().isoformat()
        counts[key] = counts.get(key, 0) + 1
    series = []
    for i in range(days):
        d = (start + timedelta(days=i)).date().isoformat()
        series.append({"date": d, "count": counts.get(d, 0)})
    return {"days": series, "total": sum(counts.values()), "since": start.isoformat()}
