"""Public request/response contracts for the PBC module."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


class PbcEngagementCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    client_id: str
    engagement_type: Literal["audit", "tax", "bookkeeping", "advisory", "other"] = "audit"
    period_start: date | None = None
    period_end: date | None = None
    due_date: date | None = None
    owner_user_id: str | None = None
    template_id: str | None = None
    rollover_from_id: str | None = None
    tasklytic_workspace_id: str | None = None
    tasklytic_project_id: str | None = None


class PbcEngagementUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    period_start: date | None = None
    period_end: date | None = None
    due_date: date | None = None
    owner_user_id: str | None = None
    reminders_paused: bool | None = None
    tasklytic_workspace_id: str | None = None
    tasklytic_project_id: str | None = None
    expected_revision: int


class PbcRequestCreate(BaseModel):
    request_number: str | None = Field(default=None, max_length=64)
    category: str | None = Field(default=None, max_length=128)
    title: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=20_000)
    period_end: date | None = None
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    due_date: date | None = None
    owner_user_id: str | None = None
    expected_filename: str | None = Field(default=None, max_length=500)
    expected_formats: list[str] = Field(default_factory=list, max_length=20)
    gl_account: str | None = Field(default=None, max_length=128)
    gl_balance: str | None = Field(default=None, max_length=64)
    sensitive: bool = False
    requires_redaction: bool = False
    dependency_ids: list[str] = Field(default_factory=list, max_length=100)
    external_source_id: str | None = Field(default=None, max_length=255)


class PbcRequestUpdate(BaseModel):
    category: str | None = Field(default=None, max_length=128)
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=20_000)
    period_end: date | None = None
    priority: Literal["low", "normal", "high", "urgent"] | None = None
    due_date: date | None = None
    owner_user_id: str | None = None
    expected_filename: str | None = Field(default=None, max_length=500)
    expected_formats: list[str] | None = Field(default=None, max_length=20)
    gl_account: str | None = Field(default=None, max_length=128)
    gl_balance: str | None = Field(default=None, max_length=64)
    sensitive: bool | None = None
    requires_redaction: bool | None = None
    dependency_ids: list[str] | None = Field(default=None, max_length=100)
    expected_revision: int


class PbcTransitionRequest(BaseModel):
    action: Literal["submit", "accept", "return", "waive", "reopen"]
    reason: str | None = Field(default=None, max_length=4000)
    expected_revision: int


class PbcContactCreate(BaseModel):
    client_id: str | None = None
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr


class PbcContactAssignment(BaseModel):
    contact_id: str
    role: Literal["coordinator", "contributor"] = "contributor"
    request_ids: list[str] = Field(default_factory=list, max_length=500)


class PbcCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=20_000)
    visibility: Literal["client", "internal"] = "client"


class PbcTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    engagement_type: Literal["audit", "tax", "bookkeeping", "advisory", "other"] = "audit"
    items: list[dict[str, Any]] = Field(default_factory=list, max_length=1000)


class PbcAccessLinkCreate(BaseModel):
    contact_id: str
    purpose: Literal["portal_login", "scoped_link"] = "portal_login"
    request_ids: list[str] = Field(default_factory=list, max_length=500)
    expires_in_days: int = Field(default=7, ge=1, le=30)
    send_email: bool = True


class PbcUploadInitiate(BaseModel):
    filename: str = Field(min_length=1, max_length=512)
    content_type: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=1, le=104_857_600)


class PbcUploadComplete(BaseModel):
    document_id: str
    checksum_sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")


class PbcPortalExchange(BaseModel):
    token: str = Field(min_length=32, max_length=512)


class PbcAiDraftRequest(BaseModel):
    instructions: str | None = Field(default=None, max_length=4000)


class PbcAiMatchRequest(BaseModel):
    document_id: str


class PbcImportPreviewRow(BaseModel):
    request_number: str | None = None
    title: str
    category: str | None = None
    owner: str | None = None
    due_date: date | None = None
    priority: str = "normal"
    period_end: date | None = None
    expected_filename: str | None = None
    expected_formats: list[str] = Field(default_factory=list)
    gl_account: str | None = None
    gl_balance: str | None = None
    external_source_id: str | None = None


class PbcImportCommit(BaseModel):
    rows: list[PbcImportPreviewRow] = Field(max_length=5000)


class PbcSettingsUpdate(BaseModel):
    timezone: str = Field(min_length=1, max_length=64)
    portal_name: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=2000)
    reminder_days_before: int = Field(default=3, ge=0, le=30)
    overdue_interval_days: int = Field(default=3, ge=1, le=30)

