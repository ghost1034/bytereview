"""
Pydantic request/response models for the Chrona integration.

Manager-facing models (pairing codes, device management) are consumed by the
dashboard with Firebase auth; sync models are consumed by paired Chrona desktop
installs authenticating with a device token.
"""
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Manager-facing: pairing codes
# ---------------------------------------------------------------------------

class PairingCodeCreateRequest(BaseModel):
    """Mint a pairing code; the device created from it inherits the name."""
    display_name: str = Field(..., min_length=1, max_length=255)


class PairingCodeResponse(BaseModel):
    code: str
    display_name: str
    expires_at: datetime
    created_at: Optional[datetime] = None


class PairingCodeListResponse(BaseModel):
    codes: List[PairingCodeResponse]


# ---------------------------------------------------------------------------
# Manager-facing: devices
# ---------------------------------------------------------------------------

class ChronaDeviceResponse(BaseModel):
    id: str
    display_name: str
    token_prefix: str
    platform: Optional[str] = None
    app_version: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    last_sync_at: Optional[datetime] = None
    sync_count: int
    revoked: bool
    created_at: datetime


class ChronaDeviceListResponse(BaseModel):
    devices: List[ChronaDeviceResponse]


class ChronaDeviceUpdateRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=255)


# ---------------------------------------------------------------------------
# Device-facing: pairing + sync
# ---------------------------------------------------------------------------

class PairRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=16)
    platform: Optional[str] = Field(default=None, max_length=32)
    app_version: Optional[str] = Field(default=None, max_length=32)


class PairResponse(BaseModel):
    """``device_token`` is the full plaintext token, returned exactly once
    at pairing time (only its hash is stored server-side)."""
    device_id: str
    device_token: str
    display_name: str


class SyncCard(BaseModel):
    """One timeline card as synced from a Chrona device.

    Timestamps and ``day_key`` are stored verbatim — ``day_key`` is the
    device-local day, never re-bucketed by UTC server-side.
    """
    source_card_id: int
    content_hash: str = Field(..., min_length=16, max_length=64)
    title: str
    summary: Optional[str] = None
    detailed_summary: Optional[str] = None
    category: str = Field(..., max_length=64)
    subcategory: Optional[str] = Field(default=None, max_length=64)
    start_ts: int
    end_ts: int
    day_key: date
    is_deleted: bool = False
    source_created_at: Optional[datetime] = None


class SyncCardsRequest(BaseModel):
    cards: List[SyncCard] = Field(default_factory=list, max_length=500)
    deleted_source_card_ids: List[int] = Field(default_factory=list, max_length=500)


class SyncCardsResponse(BaseModel):
    accepted: int
    skipped_unchanged: int
    server_time: datetime


class SyncPingResponse(BaseModel):
    ok: bool
    server_time: datetime
