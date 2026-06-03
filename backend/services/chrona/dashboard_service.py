"""Read-only reporting queries for the Chrona manager dashboard.

Hours come from ``SUM((end_ts - start_ts) / 3600.0)`` — Chrona timestamps are
epoch seconds. ``day_key`` is the device-local day, grouped verbatim (never
re-bucketed by UTC, per the integration contract).
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.db_models import ChronaDevice, ChronaTimelineCard

# Guardrail on /summary range size; the dashboard date picker stays well below it.
MAX_SUMMARY_DAYS = 366


def _parse_device_id(device_id: str) -> uuid.UUID:
    """Treat malformed UUIDs as not-found instead of a Postgres cast error."""
    try:
        return uuid.UUID(device_id)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=404, detail="Device not found")


def _get_firm_device(db: Session, firm_id, device_id: str) -> ChronaDevice:
    device = (
        db.query(ChronaDevice)
        .filter(ChronaDevice.id == _parse_device_id(device_id))
        .first()
    )
    if device is None or device.firm_id != firm_id:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


def summary(
    db: Session,
    firm_id,
    *,
    from_day: date,
    to_day: date,
    device_id: Optional[str] = None,
) -> Tuple[List[dict], List[dict]]:
    """Hours per (device, category, day) plus per-device totals.

    Returns (cells, devices). Devices with no cards in range are included
    with zero totals so the dashboard table always shows the full fleet.
    """
    if from_day > to_day:
        raise HTTPException(status_code=400, detail="'from' must be on or before 'to'")
    if (to_day - from_day).days > MAX_SUMMARY_DAYS:
        raise HTTPException(
            status_code=400, detail=f"Date range is limited to {MAX_SUMMARY_DAYS} days"
        )

    device_query = db.query(ChronaDevice).filter(ChronaDevice.firm_id == firm_id)
    if device_id is not None:
        device_query = device_query.filter(ChronaDevice.id == _parse_device_id(device_id))
    devices = device_query.order_by(ChronaDevice.created_at.asc()).all()
    if device_id is not None and not devices:
        raise HTTPException(status_code=404, detail="Device not found")

    hours_expr = func.sum(
        (ChronaTimelineCard.end_ts - ChronaTimelineCard.start_ts) / 3600.0
    ).label("hours")
    rows_query = (
        db.query(
            ChronaTimelineCard.device_id,
            ChronaTimelineCard.category,
            ChronaTimelineCard.day_key,
            hours_expr,
            func.count(ChronaTimelineCard.id).label("card_count"),
        )
        .filter(
            ChronaTimelineCard.firm_id == firm_id,
            ChronaTimelineCard.is_deleted.is_(False),
            ChronaTimelineCard.day_key >= from_day,
            ChronaTimelineCard.day_key <= to_day,
        )
    )
    if device_id is not None:
        rows_query = rows_query.filter(
            ChronaTimelineCard.device_id == _parse_device_id(device_id)
        )
    rows = (
        rows_query.group_by(
            ChronaTimelineCard.device_id,
            ChronaTimelineCard.category,
            ChronaTimelineCard.day_key,
        )
        .order_by(ChronaTimelineCard.day_key.asc())
        .all()
    )

    cells = [
        {
            "device_id": str(r.device_id),
            "category": r.category,
            "day_key": r.day_key,
            "hours": float(r.hours or 0.0),
            "card_count": int(r.card_count),
        }
        for r in rows
    ]

    totals: dict = {}
    for c in cells:
        agg = totals.setdefault(c["device_id"], {"hours": 0.0, "cards": 0})
        agg["hours"] += c["hours"]
        agg["cards"] += c["card_count"]

    device_rows = [
        {
            "device_id": str(d.id),
            "display_name": d.display_name,
            "total_hours": totals.get(str(d.id), {}).get("hours", 0.0),
            "card_count": totals.get(str(d.id), {}).get("cards", 0),
            "revoked": d.revoked_at is not None,
            "last_seen_at": d.last_seen_at,
            "last_sync_at": d.last_sync_at,
        }
        for d in devices
    ]
    return cells, device_rows


def timeline(
    db: Session, firm_id, *, device_id: str, day: date
) -> Tuple[ChronaDevice, List[ChronaTimelineCard]]:
    """Ordered (by start_ts) active cards for one device on one local day."""
    device = _get_firm_device(db, firm_id, device_id)
    cards = (
        db.query(ChronaTimelineCard)
        .filter(
            ChronaTimelineCard.device_id == device.id,
            ChronaTimelineCard.day_key == day,
            ChronaTimelineCard.is_deleted.is_(False),
        )
        .order_by(ChronaTimelineCard.start_ts.asc())
        .all()
    )
    return device, cards
