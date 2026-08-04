"""API contracts for the hosted Claw Slack control plane."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


Product = Literal["accountingclaw", "legalclaw"]


class HostedConfigUpdate(BaseModel):
    active_product: Optional[Product] = None
    model_alias: Optional[str] = Field(default=None, min_length=1, max_length=100)
    personal_instructions: Optional[str] = Field(default=None, max_length=8000)
    timezone: Optional[str] = Field(default=None, min_length=1, max_length=64)
    memory_enabled: Optional[bool] = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

            try:
                ZoneInfo(value)
            except ZoneInfoNotFoundError as exc:
                raise ValueError("Unknown IANA timezone") from exc
        return value


class HostedConfigResponse(BaseModel):
    active_product: Product
    model_alias: str
    personal_instructions: str
    timezone: str
    memory_enabled: bool
    revision: int


class HostedStatusResponse(BaseModel):
    feature_enabled: bool
    entitled: bool
    allowed_products: list[Product] = []
    allowed_model_aliases: list[str] = []
    monthly_budget_usd: Decimal = Decimal("0")
    linked: bool = False
    workspace_name: Optional[str] = None
    slack_user_id: Optional[str] = None
    config: Optional[HostedConfigResponse] = None
    runtime_status: str = "stopped"
    runtime_last_activity_at: Optional[datetime] = None
    usage_cost_usd: Decimal = Decimal("0")
    usage_turns: int = 0


class SlackInstallResponse(BaseModel):
    authorize_url: str
    expires_in_seconds: int = 600


class LinkConsumeRequest(BaseModel):
    token: str = Field(..., min_length=32, max_length=256)


class LinkConsumeResponse(BaseModel):
    linked: bool = True
    workspace_name: Optional[str] = None


class HostedCommandResponse(BaseModel):
    ok: bool = True
    message: str


class EntitlementUpdate(BaseModel):
    enabled: bool
    allowed_products: list[Product] = Field(default_factory=lambda: ["accountingclaw"])
    allowed_model_aliases: list[str] = Field(default_factory=lambda: ["claw-default"])
    monthly_budget_usd: Decimal = Field(default=Decimal("0"), ge=0)

    @field_validator("allowed_products", "allowed_model_aliases")
    @classmethod
    def clean_entitlement_lists(cls, value: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(item.strip() for item in value if item.strip()))
        if any(len(item) > 100 for item in cleaned):
            raise ValueError("Entitlement values must be 100 characters or fewer")
        return cleaned

    @model_validator(mode="after")
    def enabled_entitlement_has_choices(self):
        if self.enabled and (not self.allowed_products or not self.allowed_model_aliases):
            raise ValueError("Enabled entitlements require at least one product and model alias")
        return self


class ReadOnlyPolicyUpdate(BaseModel):
    action_ids: list[str] = Field(default_factory=list, max_length=5000)

    @field_validator("action_ids")
    @classmethod
    def clean_actions(cls, value: list[str]) -> list[str]:
        cleaned = sorted({item.strip() for item in value if item.strip()})
        if any(len(item) > 200 for item in cleaned):
            raise ValueError("Action IDs must be 200 characters or fewer")
        return cleaned


class WorkerClaimRequest(BaseModel):
    worker_id: str = Field(..., min_length=1, max_length=128)
    hostname: str = Field(..., min_length=1, max_length=255)
    capacity: int = Field(default=10, ge=1, le=10)
    active_turns: int = Field(default=0, ge=0, le=10)
    disk_percent: Optional[float] = Field(default=None, ge=0, le=100)


class WorkerJobResponse(BaseModel):
    job_id: str
    queued_at: datetime
    payload: dict[str, Any]
    user_id: str
    product: Product
    config: HostedConfigResponse
    session_id: str = Field(..., min_length=1, max_length=128)
    runtime_id: str
    monthly_budget_usd: Decimal
    remaining_budget_usd: Decimal
    budget_period: date


class WorkerClaimResponse(BaseModel):
    job: Optional[WorkerJobResponse] = None


class JobCompletionRequest(BaseModel):
    status: Literal["completed", "failed", "cancelled"]
    run_id: Optional[str] = Field(default=None, max_length=128)
    hermes_session_id: Optional[str] = Field(default=None, max_length=128)
    error_code: Optional[str] = Field(default=None, max_length=64)
    prompt_tokens: int = Field(default=0, ge=0)
    completion_tokens: int = Field(default=0, ge=0)
    cost_usd: Decimal = Field(default=Decimal("0"), ge=0)
    applied_config_revision: Optional[int] = Field(default=None, ge=1)


class RuntimeCredentialRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    product: Product
    runtime_id: str = Field(..., min_length=1, max_length=128)
    worker_id: str = Field(..., min_length=1, max_length=128)


class RuntimeCredentialResponse(BaseModel):
    connector_mcp_url: str
    connector_token: str
    connector_token_id: str


class ApprovalRequest(BaseModel):
    user_id: str = Field(..., max_length=128)
    connector_token_id: str
    run_id: str = Field(..., max_length=128)
    action_id: str = Field(..., max_length=200)
    arguments: dict[str, Any]
    slack_channel_id: str = Field(..., max_length=64)


class ApprovalResponse(BaseModel):
    approval_id: str
    expires_at: datetime


class RuntimeApprovalRequest(BaseModel):
    run_id: str = Field(..., min_length=1, max_length=128)
    action_id: str = Field(..., min_length=1, max_length=200)
    arguments: dict[str, Any]


class ArtifactRegisterRequest(BaseModel):
    user_id: str = Field(..., max_length=128)
    job_id: Optional[str] = None
    direction: Literal["inbound", "outbound"]
    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(..., min_length=1, max_length=255)
    size_bytes: int = Field(..., ge=1, le=50 * 1024 * 1024)


class ArtifactRegisterResponse(BaseModel):
    artifact_id: str
    object_name: str
    upload_url: str
    expires_at: datetime
