"""
Pydantic request/response models for the OpenConnector integration broker
(/api/connector/* user routes and /api/admin/connector/* admin routes).
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

from models.common import BaseResponse


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


class CatalogProvider(BaseModel):
    """One provider in the catalog listing, with per-user availability flags."""
    service: str
    display_name: str
    categories: List[str] = []
    auth_types: List[str] = []  # 'oauth2' | 'api_key' | 'custom_credential' | 'no_auth'
    action_count: int = 0
    # True when the provider is connectable right now: api_key/custom/no_auth
    # always are; oauth2 only once CPAA has registered an OAuth app for it.
    available: bool
    oauth_configured: bool = False
    connected: bool = False


class CatalogResponse(BaseResponse):
    providers: List[CatalogProvider]
    total: int
    page: int
    page_size: int
    categories: List[str] = []  # distinct categories for the filter dropdown


class CredentialField(BaseModel):
    """One input the user must supply for an api_key/custom_credential connect."""
    key: str
    label: Optional[str] = None
    placeholder: Optional[str] = None
    description: Optional[str] = None
    required: bool = True
    secret: bool = True


class ProviderActionSummary(BaseModel):
    id: str
    name: str
    description: Optional[str] = None


class ProviderDetailResponse(BaseResponse):
    service: str
    display_name: str
    categories: List[str] = []
    auth_types: List[str] = []
    available: bool
    oauth_configured: bool = False
    connected: bool = False
    # Field schema for the connect form, keyed by auth type the caller picks.
    api_key_fields: List[CredentialField] = []
    custom_credential_fields: List[CredentialField] = []
    actions: List[ProviderActionSummary] = []
    action_count: int = 0


# ---------------------------------------------------------------------------
# Connections
# ---------------------------------------------------------------------------


class ConnectionInfo(BaseModel):
    id: str
    service: str
    display_name: Optional[str] = None
    label: Optional[str] = None
    auth_type: str
    status: str  # 'pending' | 'active' | 'error' | 'revoked'
    error_message: Optional[str] = None
    created_at: datetime
    last_used_at: Optional[datetime] = None


class ConnectionsResponse(BaseResponse):
    connections: List[ConnectionInfo]


class CreateConnectionRequest(BaseModel):
    service: str = Field(..., min_length=1, max_length=100)
    auth_type: str = Field(..., pattern=r"^(oauth2|api_key|custom_credential|no_auth)$")
    label: Optional[str] = Field(default=None, max_length=64)
    # Credential values for api_key / custom_credential connects. Passed through
    # to the runtime once and never stored or echoed back.
    values: Optional[Dict[str, str]] = None


class CreateConnectionResponse(BaseResponse):
    connection: ConnectionInfo
    # Present only for oauth2: the provider consent URL to open in a popup.
    authorization_url: Optional[str] = None


class ConnectionStatusResponse(BaseResponse):
    connection: ConnectionInfo


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------


class ActionInfo(BaseModel):
    id: str
    service: str
    name: str
    description: Optional[str] = None
    input_schema: Optional[Dict[str, Any]] = None


class ActionsResponse(BaseResponse):
    actions: List[ActionInfo]


class ExecuteActionRequest(BaseModel):
    input: Dict[str, Any] = Field(default_factory=dict)
    # Optional specific connection (defaults to the user's default connection
    # for the action's service). Validated for ownership server-side.
    connection_id: Optional[str] = None
    idempotency_key: Optional[str] = Field(default=None, max_length=200)


class ExecuteActionResponse(BaseResponse):
    data: Optional[Any] = None
    meta: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Claw MCP tokens
# ---------------------------------------------------------------------------


class ConnectorTokenInfo(BaseModel):
    id: str
    token_prefix: str
    name: Optional[str] = None
    created_at: datetime
    last_used_at: Optional[datetime] = None
    revoked: bool = False


class CreateTokenRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=128)


class CreateTokenResponse(BaseResponse):
    """``token`` is the full plaintext value, shown exactly once."""
    token: str
    token_info: ConnectorTokenInfo


class TokensResponse(BaseResponse):
    tokens: List[ConnectorTokenInfo]


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class OAuthConfigRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=512)
    client_secret: str = Field(..., min_length=1, max_length=512)
    # Provider-specific extra OAuth app fields (clientConfigFields), if any.
    extra: Optional[Dict[str, str]] = None
    secret_extra: Optional[Dict[str, str]] = None


class OAuthConfigInfo(BaseModel):
    service: str
    client_id_hint: Optional[str] = None
    enabled: bool
    updated_at: Optional[datetime] = None


class OAuthConfigsResponse(BaseResponse):
    configs: List[OAuthConfigInfo]


class ConnectorHealthResponse(BaseResponse):
    configured: bool
    reachable: bool
    provider_count: Optional[int] = None
