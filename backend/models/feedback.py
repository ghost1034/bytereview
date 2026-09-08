"""Authenticated feedback API contracts."""
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class FeedbackRequest(BaseModel):
    request_id: UUID
    message: str = Field(min_length=1, max_length=5000)
    page_path: str | None = Field(default=None, max_length=500)

    @field_validator("message", mode="before")
    @classmethod
    def trim_message(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reward: Literal["basic_month", "usage_reset", "none"]
    basic_until: datetime | None = None
    next_reward_at: datetime | None = None
    pages_reset: int
    tokens_reset: int
