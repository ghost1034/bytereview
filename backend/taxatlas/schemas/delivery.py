"""Schemas for /api/taxatlas/v1/account/delivery notification channels."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from taxatlas.models.enums import ChangeType, TaxType
from taxatlas.schemas.common import ORMModel

DeliveryKindLit = Literal["webhook", "email"]
DigestLit = Literal["instant", "daily"]


class DeliveryFilters(BaseModel):
    """All lists are optional; an empty/None list means "no restriction" on that dimension.

    jurisdiction_codes match the event's jurisdiction or any of its ancestors (e.g. "US" matches US-CA events).
    """

    tax_types: list[str] | None = None
    jurisdiction_codes: list[str] | None = None
    change_types: list[str] | None = None

    @field_validator("tax_types")
    @classmethod
    def _tax_types(cls, v: list[str] | None) -> list[str] | None:
        if v:
            bad = sorted(set(v) - set(TaxType))
            if bad:
                raise ValueError(f"unknown tax_types: {', '.join(bad)}")
        return v or None

    @field_validator("change_types")
    @classmethod
    def _change_types(cls, v: list[str] | None) -> list[str] | None:
        if v:
            bad = sorted(set(v) - set(ChangeType))
            if bad:
                raise ValueError(f"unknown change_types: {', '.join(bad)}")
        return v or None

    @field_validator("jurisdiction_codes")
    @classmethod
    def _codes(cls, v: list[str] | None) -> list[str] | None:
        if v:
            return [c.strip().upper() for c in v if c and c.strip()] or None
        return None


class DeliveryChannelIn(BaseModel):
    kind: DeliveryKindLit
    target: str = Field(min_length=3, max_length=1000, description="Webhook URL (http/https) or email address")
    digest: DigestLit = "instant"
    enabled: bool = True
    filters: DeliveryFilters | None = None


class DeliveryChannelPatch(BaseModel):
    target: str | None = Field(default=None, min_length=3, max_length=1000)
    digest: DigestLit | None = None
    enabled: bool | None = None
    filters: DeliveryFilters | None = None
    clear_filters: bool = False


class DeliveryChannelOut(ORMModel):
    id: int
    kind: str
    target: str
    enabled: bool
    digest: str
    filters: dict | None = None  # stored shape of DeliveryFilters (null keys omitted)
    has_secret: bool = False
    previous_secret_expires_at: datetime | None = None  # set while a rotated-out secret still signs deliveries
    created_at: datetime
    last_delivered_at: datetime | None
    last_error: str | None
    consecutive_failures: int
    disabled_reason: str | None


class DeliveryChannelCreated(DeliveryChannelOut):
    secret: str | None = None  # plaintext HMAC secret; webhook channels only; shown once


class DeliveryAttemptOut(ORMModel):
    id: int
    channel_id: int
    notification_id: int
    attempt_no: int
    status: str
    http_status: int | None
    error: str | None
    created_at: datetime
    next_attempt_at: datetime | None


class DeliveryTestResult(BaseModel):
    ok: bool
    event_id: str
    status_code: int | None = None
    error: str | None = None
    duration_ms: int
