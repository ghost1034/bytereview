"""Device-facing Chrona sync routes (device-token auth, NOT Firebase).

Flow:
  - POST /api/chrona/sync/pair   (unauthenticated, rate-limited by IP): a Chrona
    install redeems a manager-minted pairing code and receives its long-lived
    device token — shown exactly once, only a hash is stored.
  - POST /api/chrona/sync/cards  (device-token auth): batch idempotent ingest of
    timeline cards. firm_id always comes from the authenticated device row,
    never the request body.
  - GET  /api/chrona/sync/ping   (device-token auth): heartbeat.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.chrona_device_auth import verify_device_token
from models.chrona import (
    PairRequest,
    PairResponse,
    SyncCardsRequest,
    SyncCardsResponse,
    SyncPingResponse,
)
from models.db_models import ChronaDevice
from services.chrona import devices_service
from services.rate_limit import rate_limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chrona/sync", tags=["chrona-sync"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/pair", response_model=PairResponse)
async def pair_route(
    payload: PairRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Redeem a pairing code for a device token (returned once, never stored)."""
    ip = _client_ip(request)
    if not rate_limiter.check("chrona_pair_ip", ip, limit=20, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many pairing attempts. Try again later.")

    device, full_token = devices_service.consume_pairing_code(
        db, payload.code, platform=payload.platform, app_version=payload.app_version
    )
    return PairResponse(
        device_id=str(device.id),
        device_token=full_token,
        display_name=device.display_name,
    )


@router.post("/cards", response_model=SyncCardsResponse)
async def sync_cards_route(
    payload: SyncCardsRequest,
    device: ChronaDevice = Depends(verify_device_token),
    db: Session = Depends(get_db),
):
    """Batch idempotent card ingest; unchanged cards are counted as skipped."""
    accepted, skipped = devices_service.upsert_cards(
        db,
        device,
        cards=payload.cards,
        deleted_source_card_ids=payload.deleted_source_card_ids,
    )
    return SyncCardsResponse(
        accepted=accepted,
        skipped_unchanged=skipped,
        server_time=datetime.now(timezone.utc),
    )


@router.get("/ping", response_model=SyncPingResponse)
async def ping_route(
    device: ChronaDevice = Depends(verify_device_token),
    db: Session = Depends(get_db),
):
    """Heartbeat — proves the token is still valid and stamps last_seen_at."""
    device.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return SyncPingResponse(ok=True, server_time=datetime.now(timezone.utc))
