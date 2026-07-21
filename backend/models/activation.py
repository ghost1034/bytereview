"""
Pydantic request/response models for the Claw Series activation flow
(AccountingClaw and LegalClaw share one personal key per user).
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from models.common import BaseResponse


class ActivateRequest(BaseModel):
    """Redeem a six-digit activation code from the activation_codes allowlist."""
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class ActivateResponse(BaseResponse):
    """Result of an activation attempt.

    ``activation_key`` is the full plaintext key and is returned ONLY when a new
    key is minted (it is never stored and cannot be shown again). When the user
    already has an active key, ``already_active`` is True and ``activation_key``
    is null — the client must rely on the key it saved previously.
    """
    activation_key: Optional[str] = None
    key_prefix: str
    already_active: bool
    created_at: datetime


class ActivationStatusResponse(BaseResponse):
    """Current activation status for the signed-in user (never the full key)."""
    has_key: bool
    key_prefix: Optional[str] = None
    created_at: Optional[datetime] = None
    last_resolved_at: Optional[datetime] = None
    last_resolved_install_type: Optional[str] = None
    revoked: bool = False


class ResolveRequest(BaseModel):
    """Container-side exchange of a personal activation key for the bundle secret."""
    activation_key: str = Field(..., min_length=12, max_length=120)
    fingerprint: Optional[str] = Field(default=None, max_length=128)
    install_type: Optional[str] = Field(default="docker", pattern=r"^(docker|desktop)$")
    product: str = Field(default="accountingclaw", pattern=r"^(accountingclaw|legalclaw)$")


class ResolveResponse(BaseModel):
    """The real build-time bundle secret that decrypts the requested Claw image.

    ``connector_mcp_url`` / ``connector_token`` provision the container's access
    to the user's CPAAutomation platform and integrations (MCP proxy). Both are
    null when neither platform MCP nor the integration broker is enabled; older
    containers ignore them.
    """
    bundle_secret: str
    connector_mcp_url: Optional[str] = None
    connector_token: Optional[str] = None


class BundleRequest(BaseModel):
    """Desktop-installer exchange of a personal activation key for a signed bundle URL."""
    activation_key: str = Field(..., min_length=12, max_length=120)
    fingerprint: Optional[str] = Field(default=None, max_length=128)
    install_type: Optional[str] = Field(default="desktop", pattern=r"^(docker|desktop)$")
    product: str = Field(default="accountingclaw", pattern=r"^(accountingclaw|legalclaw)$")


class BundleResponse(BaseModel):
    """Desktop profile bundle and optional CPAAutomation platform and integrations access."""
    bundle_url: str
    sha256: Optional[str] = None
    version: Optional[str] = None
    expires_in_seconds: int = 900
    connector_mcp_url: Optional[str] = None
    connector_token: Optional[str] = None
