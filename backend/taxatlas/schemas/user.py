from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from taxatlas.schemas.common import ORMModel
from taxatlas.schemas.tax import ChangeEventOut

ALLOWED_API_KEY_SCOPES = ("read", "admin")


class ApiKeyOut(ORMModel):
    id: int
    name: str
    prefix: str
    scopes: list | None
    rate_limit_per_minute: int
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None
    request_count: int


class ApiKeyCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[str] | None = Field(default=None, max_length=len(ALLOWED_API_KEY_SCOPES))

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be blank")
        return value

    @field_validator("scopes")
    @classmethod
    def _known_scopes(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        unknown = sorted(set(value) - set(ALLOWED_API_KEY_SCOPES))
        if unknown:
            raise ValueError(f"unknown scope(s): {', '.join(unknown)}")
        return [scope for scope in ALLOWED_API_KEY_SCOPES if scope in set(value) | {"read"}]


class ApiKeyCreated(ApiKeyOut):
    key: str


class WatchItemIn(BaseModel):
    jurisdiction_code: str | None = Field(default=None, max_length=16)
    tax_type: str | None = Field(default=None, max_length=30)
    include_children: bool = True


class WatchItemOut(ORMModel):
    id: int
    jurisdiction_id: int | None
    jurisdiction_code: str | None = None
    jurisdiction_name: str | None = None
    tax_type: str | None
    include_children: bool
    created_at: datetime


class NotificationOut(ORMModel):
    id: int
    change_event: ChangeEventOut
    created_at: datetime
    read_at: datetime | None

