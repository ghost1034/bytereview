from __future__ import annotations

from datetime import UTC, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, model_validator

T = TypeVar("T")


class UTCDatetimes(BaseModel):
    """SQLite returns naive datetimes even for DateTime(timezone=True) columns; all our timestamps are UTC.
    Attach tzinfo so JSON output carries an explicit offset and clients don't misread them as local time."""

    @model_validator(mode="after")
    def _ensure_utc(self):
        for name in type(self).model_fields:
            v = getattr(self, name, None)
            if isinstance(v, datetime) and v.tzinfo is None:
                object.__setattr__(self, name, v.replace(tzinfo=UTC))
        return self


class ORMModel(UTCDatetimes):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class Message(BaseModel):
    detail: str
