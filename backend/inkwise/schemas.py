"""Shared placeholder schemas for the Inkwise module scaffold."""

from pydantic import BaseModel, Field


class InkwisePlaceholderResponse(BaseModel):
    phase: int = Field(default=2)
    status: str = Field(default="placeholder")
    area: str
    action: str
    message: str
    user_id: str


class InkwisePlaceholderListResponse(BaseModel):
    phase: int = Field(default=2)
    status: str = Field(default="placeholder")
    area: str
    action: str
    message: str
    user_id: str
    items: list[dict] = Field(default_factory=list)


def build_placeholder_response(*, area: str, action: str, message: str, user_id: str) -> InkwisePlaceholderResponse:
    return InkwisePlaceholderResponse(
        area=area,
        action=action,
        message=message,
        user_id=user_id,
    )


def build_placeholder_list_response(*, area: str, action: str, message: str, user_id: str) -> InkwisePlaceholderListResponse:
    return InkwisePlaceholderListResponse(
        area=area,
        action=action,
        message=message,
        user_id=user_id,
    )
