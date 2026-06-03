"""Manager-facing Chrona device management routes (Firebase + RBAC).

Managers mint pairing codes here; Chrona installs redeem them via the
device-facing routes in routes/chrona_sync.py. Pairing/rename/revoke require
WRITER_ROLES; listing is open to READER_ROLES (viewers, read-only).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.analytics_rbac import READER_ROLES, WRITER_ROLES, require_role
from models.chrona import (
    ChronaDeviceListResponse,
    ChronaDeviceResponse,
    ChronaDeviceUpdateRequest,
    PairingCodeCreateRequest,
    PairingCodeListResponse,
    PairingCodeResponse,
)
from models.db_models import User
from services.analytics.firm_scope import require_firm_id
from services.chrona import devices_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chrona", tags=["chrona-devices"])


def _to_device_response(d) -> ChronaDeviceResponse:
    return ChronaDeviceResponse(
        id=str(d.id),
        display_name=d.display_name,
        token_prefix=d.token_prefix,
        platform=d.platform,
        app_version=d.app_version,
        last_seen_at=d.last_seen_at,
        last_sync_at=d.last_sync_at,
        sync_count=d.sync_count,
        revoked=d.revoked_at is not None,
        created_at=d.created_at,
    )


@router.post("/pairing-codes", response_model=PairingCodeResponse)
async def create_pairing_code_route(
    payload: PairingCodeCreateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    row = devices_service.mint_pairing_code(
        db, firm_id, created_by_user_id=actor.id, display_name=payload.display_name
    )
    return PairingCodeResponse(
        code=row.code,
        display_name=row.display_name,
        expires_at=row.expires_at,
        created_at=row.created_at,
    )


@router.get("/pairing-codes", response_model=PairingCodeListResponse)
async def list_pairing_codes_route(
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    codes = devices_service.list_active_pairing_codes(db, firm_id)
    return PairingCodeListResponse(
        codes=[
            PairingCodeResponse(
                code=c.code,
                display_name=c.display_name,
                expires_at=c.expires_at,
                created_at=c.created_at,
            )
            for c in codes
        ]
    )


@router.get("/devices", response_model=ChronaDeviceListResponse)
async def list_devices_route(
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    devices = devices_service.list_devices(db, firm_id)
    return ChronaDeviceListResponse(devices=[_to_device_response(d) for d in devices])


@router.patch("/devices/{device_id}", response_model=ChronaDeviceResponse)
async def rename_device_route(
    device_id: str,
    payload: ChronaDeviceUpdateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    device = devices_service.rename_device(db, firm_id, device_id, payload.display_name)
    return _to_device_response(device)


@router.delete("/devices/{device_id}")
async def revoke_device_route(
    device_id: str,
    purge: bool = Query(default=False, description="Also delete this device's synced cards"),
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    devices_service.revoke_device(db, firm_id, device_id, purge=purge)
    return {"success": True}
