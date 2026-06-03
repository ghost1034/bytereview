"""Manager-facing Chrona dashboard routes (Firebase + RBAC, read-only).

Reporting over cards synced by paired Chrona devices (see routes/chrona_sync.py
for ingestion). All endpoints are READER_ROLES — viewers get read-only access,
matching the device list in routes/chrona_devices.py.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.analytics_rbac import READER_ROLES, require_role
from models.chrona import (
    ChronaSummaryCell,
    ChronaSummaryDevice,
    ChronaSummaryResponse,
    ChronaTimelineCardResponse,
    ChronaTimelineResponse,
)
from models.db_models import User
from services.analytics.firm_scope import require_firm_id
from services.chrona import dashboard_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chrona/dashboard", tags=["chrona-dashboard"])


@router.get("/summary", response_model=ChronaSummaryResponse)
async def chrona_summary_route(
    from_day: date = Query(..., alias="from", description="Start day (device-local), inclusive"),
    to_day: date = Query(..., alias="to", description="End day (device-local), inclusive"),
    device_id: Optional[str] = Query(default=None, description="Restrict to one device"),
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    cells, devices = dashboard_service.summary(
        db, firm_id, from_day=from_day, to_day=to_day, device_id=device_id
    )
    return ChronaSummaryResponse(
        from_day=from_day,
        to_day=to_day,
        cells=[ChronaSummaryCell(**c) for c in cells],
        devices=[ChronaSummaryDevice(**d) for d in devices],
    )


@router.get("/timeline", response_model=ChronaTimelineResponse)
async def chrona_timeline_route(
    device_id: str = Query(...),
    day: date = Query(..., description="Device-local day to list cards for"),
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    device, cards = dashboard_service.timeline(db, firm_id, device_id=device_id, day=day)
    return ChronaTimelineResponse(
        device_id=str(device.id),
        display_name=device.display_name,
        day=day,
        cards=[
            ChronaTimelineCardResponse(
                id=str(c.id),
                source_card_id=c.source_card_id,
                title=c.title,
                summary=c.summary,
                detailed_summary=c.detailed_summary,
                category=c.category,
                subcategory=c.subcategory,
                start_ts=c.start_ts,
                end_ts=c.end_ts,
                day_key=c.day_key,
                synced_at=c.synced_at,
            )
            for c in cards
        ],
    )
