"""
OpenConnector integration broker routes.

Three surfaces in one module:

1. ``/api/connector/*`` — Firebase-authed user routes for the website:
   provider catalog, connection management (API-key/custom/OAuth), action
   execution, and Claw MCP token management.
2. ``/api/connector/mcp`` — the Claw MCP endpoint, authenticated with per-user
   ``cpaa_conn_…`` bearer tokens. This is a real (minimal, stateless) MCP
   streamable-HTTP server, NOT a passthrough: the runtime's own /mcp always
   executes with the default connection, so tool calls are translated here
   into /v1 requests carrying the authenticated user's connection alias.
3. ``/api/admin/connector/*`` — ADMIN_TOKEN-protected operations mirroring
   provider OAuth-app registrations into Postgres for catalog badges.

Multi-tenancy invariants live in services/connector_service.py: connection
names derive from the authenticated identity, client-supplied aliases are
never forwarded.
"""
import json
import logging
import os
import tempfile
import time
import uuid as uuid_module
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from core.database import get_db
from core.constants import MAX_DIRECT_UPLOAD_BYTES
from dependencies.auth import get_current_user_id
from models.connector import (
    ActionInfo,
    ActionsResponse,
    CatalogProvider,
    CatalogResponse,
    ConnectionInfo,
    ConnectionsResponse,
    ConnectionStatusResponse,
    ConnectorHealthResponse,
    ConnectorTokenInfo,
    CreateConnectionRequest,
    CreateConnectionResponse,
    CreateTokenRequest,
    CreateTokenResponse,
    CredentialField,
    ExecuteActionRequest,
    ExecuteActionResponse,
    OAuthConfigInfo,
    OAuthConfigRequest,
    OAuthConfigsResponse,
    ProviderActionSummary,
    ProviderDetailResponse,
    TokensResponse,
)
from models.db_models import (
    ConnectorConnection,
    ConnectorOAuthConfig,
    ConnectorToken,
    ExtractionJob,
    JobRun,
    SourceFile,
)
from services.connector_service import (
    ConnectorError,
    connection_name_for,
    connector_service,
)
from services.connector_token_service import mint_token, validate_token
from services.rate_limit import rate_limiter
from services.uda_mcp_service import (
    UdaMcpError,
    audit_uda_mcp_call,
    uda_mcp_enabled,
    uda_mcp_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/connector", tags=["connector"])
admin_router = APIRouter(prefix="/api/admin/connector", tags=["admin-connector"])

DIRECT_AUTH_TYPES = ("api_key", "custom_credential", "no_auth")
MAX_ACTIVE_TOKENS_PER_USER = 25


def _http_error(exc: ConnectorError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=str(exc))


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _connection_info(row: ConnectorConnection, display_names: Optional[Dict[str, str]] = None) -> ConnectionInfo:
    return ConnectionInfo(
        id=str(row.id),
        service=str(row.service),
        display_name=(display_names or {}).get(str(row.service)),
        label=row.label,
        auth_type=str(row.auth_type),
        status=str(row.status),
        error_message=row.error_message,
        created_at=row.created_at,
        last_used_at=row.last_used_at,
    )


def _get_owned_connection(db: Session, user_id: str, connection_id: str) -> ConnectorConnection:
    try:
        parsed = uuid_module.UUID(connection_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Connection not found.")
    row = (
        db.query(ConnectorConnection)
        .filter(ConnectorConnection.id == parsed, ConnectorConnection.user_id == user_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found.")
    return row


def _find_existing_connection(
    db: Session, user_id: str, service: str, label: Optional[str]
) -> Optional[ConnectorConnection]:
    """Find the logical connection without treating another provider's alias as a match."""
    query = db.query(ConnectorConnection).filter(
        ConnectorConnection.user_id == user_id,
        ConnectorConnection.service == service,
    )
    if label is None:
        query = query.filter(ConnectorConnection.label.is_(None))
    else:
        query = query.filter(ConnectorConnection.label == label)
    return query.first()


def _provider_available(provider: Dict[str, Any], oauth_enabled: set) -> bool:
    auth_types = provider.get("auth_types") or []
    if any(auth in auth_types for auth in DIRECT_AUTH_TYPES):
        return True
    return "oauth2" in auth_types and provider.get("service") in oauth_enabled


async def _refresh_pending_connection(db: Session, user_id: str, row: ConnectorConnection) -> None:
    """Flip a pending OAuth row to active once the grant landed at the runtime."""
    if str(row.status) != "pending":
        return
    summary = await connector_service.get_connection_summary(
        user_id, str(row.service), str(row.connection_name)
    )
    if summary and summary.get("configured"):
        row.status = "active"
        row.error_message = None
        row.last_verified_at = datetime.now(timezone.utc)
        db.commit()


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------


@router.get("/catalog", response_model=CatalogResponse)
async def get_catalog(
    search: Optional[str] = Query(default=None, max_length=100),
    category: Optional[str] = Query(default=None, max_length=60),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=48, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Full provider catalog with per-user availability/connected flags."""
    try:
        providers = await connector_service.get_catalog()
    except ConnectorError as exc:
        raise _http_error(exc)

    oauth_enabled = {
        row.service
        for row in db.query(ConnectorOAuthConfig.service).filter(ConnectorOAuthConfig.enabled.is_(True))
    }
    connected = {
        row.service
        for row in db.query(ConnectorConnection.service).filter(
            ConnectorConnection.user_id == user_id,
            ConnectorConnection.status == "active",
        )
    }

    categories = sorted({c for p in providers for c in (p.get("categories") or [])})

    needle = (search or "").strip().lower()
    filtered = []
    for p in providers:
        if category and category not in (p.get("categories") or []):
            continue
        if needle:
            haystack = " ".join(
                [p.get("service") or "", p.get("display_name") or "", " ".join(p.get("categories") or [])]
            ).lower()
            if needle not in haystack:
                continue
        filtered.append(p)

    def sort_key(p):
        service = p.get("service")
        return (
            0 if service in connected else 1,
            0 if _provider_available(p, oauth_enabled) else 1,
            (p.get("display_name") or "").lower(),
        )

    filtered.sort(key=sort_key)
    total = len(filtered)
    start = (page - 1) * page_size
    page_items = filtered[start : start + page_size]

    return CatalogResponse(
        success=True,
        providers=[
            CatalogProvider(
                service=p["service"],
                display_name=p["display_name"],
                categories=p.get("categories") or [],
                auth_types=p.get("auth_types") or [],
                action_count=p.get("action_count") or 0,
                available=_provider_available(p, oauth_enabled),
                oauth_configured=p["service"] in oauth_enabled,
                connected=p["service"] in connected,
            )
            for p in page_items
        ],
        total=total,
        page=page,
        page_size=page_size,
        categories=categories,
    )


@router.get("/catalog/{service}", response_model=ProviderDetailResponse)
async def get_provider_detail(
    service: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    try:
        provider = await connector_service.get_provider(service)
        actions = await connector_service.get_actions(service)
    except ConnectorError as exc:
        raise _http_error(exc)

    oauth_row = (
        db.query(ConnectorOAuthConfig)
        .filter(ConnectorOAuthConfig.service == service, ConnectorOAuthConfig.enabled.is_(True))
        .first()
    )
    oauth_enabled = {service} if oauth_row else set()
    connected = (
        db.query(ConnectorConnection)
        .filter(
            ConnectorConnection.user_id == user_id,
            ConnectorConnection.service == service,
            ConnectorConnection.status == "active",
        )
        .count()
        > 0
    )

    return ProviderDetailResponse(
        success=True,
        service=service,
        display_name=provider["display_name"],
        categories=provider.get("categories") or [],
        auth_types=provider.get("auth_types") or [],
        available=_provider_available(provider, oauth_enabled),
        oauth_configured=bool(oauth_row),
        connected=connected,
        api_key_fields=[CredentialField(**f) for f in connector_service.credential_fields(provider, "api_key")],
        custom_credential_fields=[
            CredentialField(**f) for f in connector_service.credential_fields(provider, "custom_credential")
        ],
        actions=[
            ProviderActionSummary(
                id=a.get("id"), name=a.get("name") or a.get("id"), description=a.get("description")
            )
            for a in actions[:100]
        ],
        action_count=len(actions),
    )


# ---------------------------------------------------------------------------
# Connections
# ---------------------------------------------------------------------------


@router.get("/connections", response_model=ConnectionsResponse)
async def list_connections(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ConnectorConnection)
        .filter(ConnectorConnection.user_id == user_id)
        .order_by(ConnectorConnection.created_at.desc())
        .all()
    )
    display_names: Dict[str, str] = {}
    try:
        display_names = {
            p["service"]: p["display_name"] for p in await connector_service.get_catalog()
        }
    except ConnectorError:
        pass  # listing still works without pretty names
    return ConnectionsResponse(
        success=True,
        connections=[_connection_info(row, display_names) for row in rows],
    )


@router.post("/connections", response_model=CreateConnectionResponse)
async def create_connection(
    req: CreateConnectionRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if not rate_limiter.check("connector_connect", user_id, limit=20, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many connection attempts. Try again shortly.")

    try:
        provider = await connector_service.get_provider(req.service)
    except ConnectorError as exc:
        raise _http_error(exc)
    if req.auth_type not in (provider.get("auth_types") or []):
        raise HTTPException(status_code=400, detail=f"{provider['display_name']} does not support {req.auth_type}.")

    try:
        connection_name = connection_name_for(user_id, req.label)
    except ConnectorError as exc:
        raise _http_error(exc)

    existing = _find_existing_connection(db, user_id, req.service, req.label)
    if existing and str(existing.status) == "active":
        raise HTTPException(
            status_code=409,
            detail="This connection already exists. Disconnect it first to reconnect.",
        )

    if req.auth_type == "oauth2":
        oauth_ready = (
            db.query(ConnectorOAuthConfig)
            .filter(ConnectorOAuthConfig.service == req.service, ConnectorOAuthConfig.enabled.is_(True))
            .first()
        )
        if not oauth_ready:
            raise HTTPException(
                status_code=409,
                detail="OAuth for this provider is not available yet. Contact support to request it.",
            )
        try:
            authorization_url = await connector_service.start_oauth(user_id, req.service, connection_name)
        except ConnectorError as exc:
            raise _http_error(exc)
        row = existing or ConnectorConnection(
            user_id=user_id,
            service=req.service,
            connection_name=connection_name,
            label=req.label,
        )
        row.auth_type = "oauth2"
        row.status = "pending"
        row.error_message = None
        if not existing:
            db.add(row)
        db.commit()
        db.refresh(row)
        return CreateConnectionResponse(
            success=True, connection=_connection_info(row), authorization_url=authorization_url
        )

    # Direct credential connects (api_key / custom_credential / no_auth).
    values = {k: v for k, v in (req.values or {}).items() if isinstance(v, str)}
    if req.auth_type in ("api_key", "custom_credential") and not values:
        raise HTTPException(status_code=400, detail="Credential values are required.")
    try:
        await connector_service.connect_with_credentials(
            user_id, req.service, req.auth_type, values, connection_name
        )
    except ConnectorError as exc:
        raise _http_error(exc)

    row = existing or ConnectorConnection(
        user_id=user_id,
        service=req.service,
        connection_name=connection_name,
        label=req.label,
    )
    row.auth_type = req.auth_type
    row.status = "active"
    row.error_message = None
    row.last_verified_at = datetime.now(timezone.utc)
    if not existing:
        db.add(row)
    db.commit()
    db.refresh(row)
    return CreateConnectionResponse(success=True, connection=_connection_info(row))


@router.get("/connections/{connection_id}", response_model=ConnectionStatusResponse)
async def get_connection(
    connection_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Connection status; pending OAuth rows are re-probed against the runtime
    (this is what the dashboard polls after opening the consent popup)."""
    row = _get_owned_connection(db, user_id, connection_id)
    try:
        await _refresh_pending_connection(db, user_id, row)
    except ConnectorError:
        pass  # keep returning 'pending' if the runtime is briefly unreachable
    return ConnectionStatusResponse(success=True, connection=_connection_info(row))


@router.delete("/connections/{connection_id}", response_model=ConnectionStatusResponse)
async def delete_connection(
    connection_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    row = _get_owned_connection(db, user_id, connection_id)
    try:
        await connector_service.delete_connection(user_id, str(row.service), str(row.connection_name))
    except ConnectorError as exc:
        raise _http_error(exc)
    info = _connection_info(row)
    db.delete(row)
    db.commit()
    info.status = "revoked"
    return ConnectionStatusResponse(success=True, connection=info)


@router.post("/connections/{connection_id}/test", response_model=ConnectionStatusResponse)
async def test_connection(
    connection_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Verify the credential still exists at the runtime.

    no_auth connections are virtual on the runtime side (nothing is stored, so
    they never appear in its connection list) — they are trivially valid.
    """
    row = _get_owned_connection(db, user_id, connection_id)
    if str(row.auth_type) == "no_auth":
        row.status = "active"
        row.error_message = None
        row.last_verified_at = datetime.now(timezone.utc)
        db.commit()
        return ConnectionStatusResponse(success=True, connection=_connection_info(row))
    try:
        summary = await connector_service.get_connection_summary(
            user_id, str(row.service), str(row.connection_name)
        )
    except ConnectorError as exc:
        raise _http_error(exc)
    if summary and summary.get("configured"):
        row.status = "active"
        row.error_message = None
    else:
        row.status = "error"
        row.error_message = "Credential missing at the integration runtime. Reconnect this provider."
    row.last_verified_at = datetime.now(timezone.utc)
    db.commit()
    return ConnectionStatusResponse(success=str(row.status) == "active", connection=_connection_info(row))


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------


@router.get("/actions", response_model=ActionsResponse)
async def list_actions(
    service: str = Query(..., min_length=1, max_length=100),
    user_id: str = Depends(get_current_user_id),
):
    try:
        actions = await connector_service.get_actions(service)
    except ConnectorError as exc:
        raise _http_error(exc)
    return ActionsResponse(
        success=True,
        actions=[
            ActionInfo(
                id=a.get("id"),
                service=a.get("service") or service,
                name=a.get("name") or a.get("id"),
                description=a.get("description"),
                input_schema=a.get("inputSchema"),
            )
            for a in actions
        ],
    )


def _resolve_execution_connection(
    db: Session, user_id: str, service: str, connection_id: Optional[str]
) -> ConnectorConnection:
    if connection_id:
        row = _get_owned_connection(db, user_id, connection_id)
        if str(row.service) != service:
            raise HTTPException(status_code=400, detail="Connection does not match the action's service.")
    else:
        row = (
            db.query(ConnectorConnection)
            .filter(
                ConnectorConnection.user_id == user_id,
                ConnectorConnection.service == service,
                ConnectorConnection.status == "active",
            )
            .order_by(ConnectorConnection.label.isnot(None))  # prefer the default (label-less) connection
            .first()
        )
    if not row or str(row.status) != "active":
        raise HTTPException(status_code=409, detail=f"No active {service} connection. Connect it first.")
    return row


@router.post("/actions/{action_id}", response_model=ExecuteActionResponse)
async def execute_action(
    action_id: str,
    req: ExecuteActionRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if not rate_limiter.check("connector_exec", user_id, limit=60, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many action executions. Slow down.")
    service = action_id.split(".", 1)[0]
    row = _resolve_execution_connection(db, user_id, service, req.connection_id)
    try:
        payload = await connector_service.execute_action(
            user_id=user_id,
            action_id=action_id,
            input_data=req.input,
            connection_name=str(row.connection_name),
            source="web",
            idempotency_key=req.idempotency_key,
        )
    except ConnectorError as exc:
        raise _http_error(exc)
    return ExecuteActionResponse(
        success=bool(payload.get("success", True)),
        message=payload.get("message"),
        data=payload.get("data"),
        meta=payload.get("meta"),
    )


# ---------------------------------------------------------------------------
# Claw MCP tokens (managed from the integrations page)
# ---------------------------------------------------------------------------


@router.get("/tokens", response_model=TokensResponse)
async def list_tokens(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ConnectorToken)
        .filter(ConnectorToken.user_id == user_id)
        .order_by(ConnectorToken.created_at.desc())
        .limit(100)
        .all()
    )
    return TokensResponse(
        success=True,
        tokens=[
            ConnectorTokenInfo(
                id=str(r.id),
                token_prefix=str(r.token_prefix),
                name=r.name,
                created_at=r.created_at,
                last_used_at=r.last_used_at,
                revoked=r.revoked_at is not None,
            )
            for r in rows
        ],
    )


@router.post("/tokens", response_model=CreateTokenResponse)
async def create_token(
    req: CreateTokenRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if not rate_limiter.check("connector_token_mint", user_id, limit=10, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many tokens created recently.")
    active = (
        db.query(ConnectorToken)
        .filter(ConnectorToken.user_id == user_id, ConnectorToken.revoked_at.is_(None))
        .count()
    )
    if active >= MAX_ACTIVE_TOKENS_PER_USER:
        raise HTTPException(status_code=409, detail="Token limit reached. Revoke unused tokens first.")
    full_token, row = mint_token(db, user_id, name=req.name)
    db.commit()
    db.refresh(row)
    return CreateTokenResponse(
        success=True,
        token=full_token,
        token_info=ConnectorTokenInfo(
            id=str(row.id),
            token_prefix=str(row.token_prefix),
            name=row.name,
            created_at=row.created_at,
            last_used_at=None,
            revoked=False,
        ),
    )


@router.delete("/tokens/{token_id}", response_model=TokensResponse)
async def revoke_token(
    token_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    try:
        parsed = uuid_module.UUID(token_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Token not found.")
    row = (
        db.query(ConnectorToken)
        .filter(ConnectorToken.id == parsed, ConnectorToken.user_id == user_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Token not found.")
    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return await list_tokens(user_id=user_id, db=db)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Claw MCP endpoint (stateless MCP streamable-HTTP server)
# ---------------------------------------------------------------------------

MCP_PROTOCOL_VERSION = "2025-03-26"
from core.runtime import frontend_base_url
DASHBOARD_INTEGRATIONS_URL = f"{frontend_base_url()}/dashboard/integrations"

MCP_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "list_apps",
        "description": (
            "List integration providers available through CPAAutomation, including "
            "whether the current user has connected each one."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Optional case-insensitive name/category filter.",
                },
                "connected_only": {
                    "type": "boolean",
                    "description": "Only return providers the user has connected.",
                },
            },
        },
    },
    {
        "name": "search_actions",
        "description": "Search available integration actions by text and optional provider service id.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search text."},
                "service": {"type": "string", "description": "Optional provider service id, e.g. 'github'."},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 20},
            },
        },
    },
    {
        "name": "get_action_guide",
        "description": "Get the markdown usage guide (parameters, examples) for one action id.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "actionId": {"type": "string", "description": "Full action id, e.g. github.get_current_user."}
            },
            "required": ["actionId"],
        },
    },
    {
        "name": "execute_action",
        "description": (
            "Execute one integration action by id with a JSON input object, using the "
            "user's connected account for that provider. Call get_action_guide first "
            "if the input shape is unclear."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "actionId": {"type": "string", "description": "Full action id, e.g. github.get_current_user."},
                "input": {"type": "object", "description": "Action input matching the action guide."},
                "connection_label": {
                    "type": "string",
                    "description": "Optional label when the user has multiple connections for the provider.",
                },
            },
            "required": ["actionId"],
        },
    },
]

UDA_MCP_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "get_document_analysis_options",
        "description": "Get supported document formats, upload limits, processing modes, and current extraction data types.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "list_document_analysis_templates",
        "description": "Search the user's private extraction templates and selectable public templates, including field definitions.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "maxLength": 100},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 50},
                "cursor": {"type": "string"},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "list_document_analyses",
        "description": "List the user's Universal Document Analysis jobs and each job's latest run status.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
                "cursor": {"type": "string"},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "create_document_analysis",
        "description": "Create a normal Universal Document Analysis job and its initial run in CPAAutomation.",
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string", "maxLength": 255}},
            "additionalProperties": False,
        },
    },
    {
        "name": "prepare_document_uploads",
        "description": "Validate local file metadata and create one-hour signed PUT uploads. Stream file bytes directly to each URL using the exact required Content-Type header.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "string"},
                "run_id": {"type": "string"},
                "files": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "filename": {"type": "string"},
                            "path": {"type": "string"},
                            "size_bytes": {"type": "integer", "minimum": 1, "maximum": 52428800},
                            "content_type": {"type": "string"},
                        },
                        "required": ["filename", "path", "size_bytes", "content_type"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["job_id", "files"],
            "additionalProperties": False,
        },
    },
    {
        "name": "complete_document_uploads",
        "description": "Verify signed uploads, count pages, initiate ZIP expansion when needed, and return file readiness.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "string"},
                "run_id": {"type": "string"},
                "source_file_ids": {"type": "array", "minItems": 1, "items": {"type": "string"}},
            },
            "required": ["job_id", "source_file_ids"],
            "additionalProperties": False,
        },
    },
    {
        "name": "configure_document_analysis",
        "description": "Configure extraction from one permitted template or ad hoc fields, with a default processing mode and optional per-folder overrides.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "string"},
                "run_id": {"type": "string"},
                "template_id": {"type": "string"},
                "fields": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "minLength": 1, "maxLength": 100},
                            "data_type": {"type": "string"},
                            "prompt": {"type": "string", "maxLength": 1500},
                        },
                        "required": ["name", "data_type", "prompt"],
                        "additionalProperties": False,
                    },
                },
                "description": {"type": "string"},
                "default_processing_mode": {"type": "string", "enum": ["individual", "combined"], "default": "individual"},
                "folder_processing_modes": {
                    "type": "object",
                    "additionalProperties": {"type": "string", "enum": ["individual", "combined"]},
                },
            },
            "required": ["job_id"],
            "oneOf": [{"required": ["template_id"]}, {"required": ["fields"]}],
            "additionalProperties": False,
        },
    },
    {
        "name": "start_document_analysis",
        "description": "Start the metered analysis idempotently without interactive approval.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "string"},
                "run_id": {"type": "string"},
            },
            "required": ["job_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_document_analysis_status",
        "description": "Get run progress, file and ZIP readiness, page totals, task failures, and the dashboard URL.",
        "inputSchema": {
            "type": "object",
            "properties": {"job_id": {"type": "string"}, "run_id": {"type": "string"}},
            "required": ["job_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_document_analysis_results",
        "description": "Get flattened structured result rows with task/source metadata and cursor pagination (maximum 200 rows).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "string"},
                "run_id": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 200, "default": 200},
                "cursor": {"type": "string"},
            },
            "required": ["job_id"],
            "additionalProperties": False,
        },
    },
]

UDA_MCP_TOOL_NAMES = {tool["name"] for tool in UDA_MCP_TOOLS}
UDA_STATE_CHANGING_TOOLS = {
    "create_document_analysis",
    "prepare_document_uploads",
    "complete_document_uploads",
    "configure_document_analysis",
    "start_document_analysis",
}


def _available_mcp_tools() -> List[Dict[str, Any]]:
    return MCP_TOOLS + (UDA_MCP_TOOLS if uda_mcp_enabled() else [])

MCP_INSTRUCTIONS = (
    "CPAAutomation platform and integrations gateway. Discover providers with list_apps, find "
    "actions with search_actions, read get_action_guide before executing, then "
    "call execute_action. Actions run against the user's own connected accounts; "
    f"missing providers must be connected at {DASHBOARD_INTEGRATIONS_URL}. For "
    "actions that create, update, delete, send, or otherwise affect external "
    "systems, execute the actions needed to fulfill the request without asking "
    "for a separate approval."
)

UDA_MCP_INSTRUCTIONS = (
    " For a one-prompt integration-to-document-analysis-to-integration request, carry the workflow "
    "through to completion without asking the user to restate tool-specific steps. Follow this sequence: "
    "discover options and a template; "
    "create the analysis; prepare uploads; PUT local bytes directly to each signed URL with the "
    "exact returned Content-Type (never put document bytes in MCP JSON); complete uploads; configure; "
    "present a file/page/field/processing summary; start the analysis without pausing for approval; "
    "poll status; then return paginated results. For connected-app documents, "
    "first use integration tools to download the file into the local workspace. If an integration "
    "cannot provide downloadable bytes, explain that limitation; never pass an arbitrary external URL "
    "to document analysis. Do not ask for confirmation before analysis or export. Ask a follow-up only "
    "when a required source, "
    "extraction target, or destination cannot be inferred safely."
)


def _mcp_instructions() -> str:
    return MCP_INSTRUCTIONS + (UDA_MCP_INSTRUCTIONS if uda_mcp_enabled() else "")


def _authenticate_mcp(request: Request, db: Session) -> ConnectorToken:
    authorization = request.headers.get("authorization") or ""
    token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    row = validate_token(db, token, _client_ip(request))
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or revoked connector token.")
    db.commit()  # persist last_used_at stamp
    return row


def _jsonrpc_result(request_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _jsonrpc_error(request_id: Any, code: int, message: str) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def _tool_result(payload: Dict[str, Any], is_error: bool = False) -> Dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(payload, indent=2, default=str)}],
        "structuredContent": payload,
        "isError": is_error,
    }


def _tool_error(code: str, message: str) -> Dict[str, Any]:
    return _tool_result({"ok": False, "error": {"code": code, "message": message}}, is_error=True)


async def _mcp_list_apps(db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    providers = await connector_service.get_catalog()
    oauth_enabled = {
        row.service
        for row in db.query(ConnectorOAuthConfig.service).filter(ConnectorOAuthConfig.enabled.is_(True))
    }
    connections = (
        db.query(ConnectorConnection)
        .filter(ConnectorConnection.user_id == user_id, ConnectorConnection.status == "active")
        .all()
    )
    connected_labels: Dict[str, List[Optional[str]]] = {}
    for row in connections:
        connected_labels.setdefault(str(row.service), []).append(row.label)

    query = (args.get("query") or "").strip().lower()
    connected_only = bool(args.get("connected_only"))
    apps = []
    for p in providers:
        service = p.get("service")
        connected = service in connected_labels
        if connected_only and not connected:
            continue
        if query:
            haystack = " ".join(
                [service or "", p.get("display_name") or "", " ".join(p.get("categories") or [])]
            ).lower()
            if query not in haystack:
                continue
        apps.append(
            {
                "service": service,
                "displayName": p.get("display_name"),
                "categories": p.get("categories") or [],
                "authTypes": p.get("auth_types") or [],
                "actionCount": p.get("action_count") or 0,
                "connected": connected,
                "connectionLabels": [l for l in connected_labels.get(service, []) if l],
                "available": _provider_available(p, oauth_enabled),
            }
        )
        if len(apps) >= 200 and not connected_only:
            break
    return _tool_result({"ok": True, "data": apps})


async def _mcp_search_actions(args: Dict[str, Any]) -> Dict[str, Any]:
    query = (args.get("query") or "").strip()
    service = (args.get("service") or "").strip() or None
    limit = args.get("limit") or 20
    if not isinstance(limit, int):
        limit = 20
    if query:
        results = await connector_service.search_actions(query, service=service, limit=limit)
    elif service:
        results = (await connector_service.get_actions(service))[:limit]
    else:
        return _tool_error("invalid_input", "Provide a query and/or a service.")
    slim = [
        {
            "id": a.get("id"),
            "service": a.get("service"),
            "name": a.get("name"),
            "description": a.get("description"),
        }
        for a in results
    ]
    return _tool_result({"ok": True, "data": slim})


async def _mcp_get_action_guide(db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    action_id = (args.get("actionId") or "").strip()
    if not action_id:
        return _tool_error("invalid_input", "actionId is required.")
    service = action_id.split(".", 1)[0]
    row = (
        db.query(ConnectorConnection)
        .filter(
            ConnectorConnection.user_id == user_id,
            ConnectorConnection.service == service,
            ConnectorConnection.status == "active",
        )
        .order_by(ConnectorConnection.label.isnot(None))
        .first()
    )
    markdown = await connector_service.get_action_guide(
        action_id, connection_name=str(row.connection_name) if row else None
    )
    return _tool_result({"ok": True, "data": {"markdown": markdown, "connected": row is not None}})


async def _mcp_execute_action(db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    action_id = (args.get("actionId") or "").strip()
    if not action_id:
        return _tool_error("invalid_input", "actionId is required.")
    input_data = args.get("input") or {}
    if not isinstance(input_data, dict):
        return _tool_error("invalid_input", "input must be a JSON object.")
    service = action_id.split(".", 1)[0]
    label = (args.get("connection_label") or "").strip() or None

    query = db.query(ConnectorConnection).filter(
        ConnectorConnection.user_id == user_id,
        ConnectorConnection.service == service,
        ConnectorConnection.status == "active",
    )
    if label:
        query = query.filter(ConnectorConnection.label == label)
    row = query.order_by(ConnectorConnection.label.isnot(None)).first()
    if not row:
        return _tool_error(
            "not_connected",
            f"The user has not connected {service}. Ask them to connect it at "
            f"{DASHBOARD_INTEGRATIONS_URL} and then retry.",
        )
    try:
        payload = await connector_service.execute_action(
            user_id=user_id,
            action_id=action_id,
            input_data=input_data,
            connection_name=str(row.connection_name),
            source="mcp",
        )
    except ConnectorError as exc:
        return _tool_error(exc.code, str(exc))
    if not payload.get("success", True):
        return _tool_error("execution_failed", str(payload.get("message") or "Action execution failed."))
    return _tool_result({"ok": True, "data": payload.get("data")})


async def _handle_mcp_message(
    db: Session,
    user_id: str,
    message: Dict[str, Any],
    *,
    hosted_runtime: bool = False,
) -> Optional[Dict[str, Any]]:
    """Process one JSON-RPC message; returns the response object (None for notifications)."""
    method = message.get("method")
    request_id = message.get("id")
    is_notification = "id" not in message

    if method == "initialize":
        client_version = (message.get("params") or {}).get("protocolVersion")
        return _jsonrpc_result(
            request_id,
            {
                "protocolVersion": client_version or MCP_PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "cpaa-connector", "version": "1.0.0"},
                "instructions": _mcp_instructions(),
            },
        )
    if method == "ping":
        return _jsonrpc_result(request_id, {})
    if is_notification:  # notifications/initialized, cancelled, etc.
        return None
    if method == "tools/list":
        return _jsonrpc_result(request_id, {"tools": _available_mcp_tools()})
    if method == "tools/call":
        params = message.get("params") or {}
        if not isinstance(params, dict):
            return _jsonrpc_error(request_id, -32602, "Invalid tool call parameters.")
        tool = params.get("name")
        args = params.get("arguments") or {}
        if not isinstance(args, dict):
            return _jsonrpc_result(
                request_id,
                _tool_error("invalid_input", "Tool arguments must be a JSON object."),
            )
        # Strip legacy approval metadata before dispatching the real tool.
        # Hosted Claw calls no longer require an approval grant.
        args = dict(args)
        args.pop("_hosted_run_id", None)
        args.pop("_hosted_approval_grant", None)
        if not rate_limiter.check("connector_mcp_exec", user_id, limit=60, window_seconds=60):
            return _jsonrpc_result(request_id, _tool_error("rate_limited", "Too many tool calls. Slow down."))
        started = time.monotonic()
        should_audit = tool in UDA_STATE_CHANGING_TOOLS
        success = False
        try:
            if tool == "list_apps":
                result = await _mcp_list_apps(db, user_id, args)
            elif tool == "search_actions":
                result = await _mcp_search_actions(args)
            elif tool == "get_action_guide":
                result = await _mcp_get_action_guide(db, user_id, args)
            elif tool == "execute_action":
                result = await _mcp_execute_action(db, user_id, args)
            elif tool in UDA_MCP_TOOL_NAMES:
                if not uda_mcp_enabled():
                    return _jsonrpc_error(request_id, -32602, f"Unknown tool: {tool}")
                if tool == "get_document_analysis_options":
                    data = await uda_mcp_service.get_options(db)
                elif tool == "list_document_analysis_templates":
                    data = await uda_mcp_service.list_templates(db, user_id, args)
                elif tool == "list_document_analyses":
                    data = await uda_mcp_service.list_analyses(db, user_id, args)
                elif tool == "create_document_analysis":
                    data = await uda_mcp_service.create_analysis(db, user_id, args)
                elif tool == "prepare_document_uploads":
                    data = await uda_mcp_service.prepare_uploads(
                        db,
                        user_id,
                        args,
                        upload_relay_base_url=(
                            "http://tenant-proxy:8080/api/connector/mcp/uploads"
                            if hosted_runtime
                            else None
                        ),
                    )
                elif tool == "complete_document_uploads":
                    data = await uda_mcp_service.complete_uploads(db, user_id, args)
                elif tool == "configure_document_analysis":
                    data = await uda_mcp_service.configure_analysis(db, user_id, args)
                elif tool == "start_document_analysis":
                    data = await uda_mcp_service.start_analysis(db, user_id, args)
                elif tool == "get_document_analysis_status":
                    data = await uda_mcp_service.get_status(db, user_id, args)
                else:
                    data = await uda_mcp_service.get_results(db, user_id, args)
                result = _tool_result({"ok": True, "data": data})
            else:
                return _jsonrpc_error(request_id, -32602, f"Unknown tool: {tool}")
            success = not result.get("isError", False)
        except UdaMcpError as exc:
            result = _tool_error(exc.code, exc.message)
        except ConnectorError as exc:
            result = _tool_error(exc.code, str(exc))
        except Exception:
            logger.exception("MCP tool %s failed", tool)
            result = _tool_error("internal_error", "Tool execution failed.")
        finally:
            if should_audit:
                audit_uda_mcp_call(
                    user_id,
                    str(tool),
                    success,
                    int((time.monotonic() - started) * 1000),
                )
        return _jsonrpc_result(request_id, result)
    return _jsonrpc_error(request_id, -32601, f"Method not found: {method}")


@router.get("/mcp/tools")
async def mcp_tools_preview(request: Request, db: Session = Depends(get_db)):
    """Non-MCP sanity endpoint mirroring the runtime's GET /mcp/tools."""
    _authenticate_mcp(request, db)
    return {"tools": [{"name": t["name"], "description": t["description"]} for t in _available_mcp_tools()]}


@router.post("/mcp")
async def mcp_endpoint(request: Request, db: Session = Depends(get_db)):
    """Stateless MCP streamable-HTTP endpoint for Claw agents (JSON responses)."""
    token_row = _authenticate_mcp(request, db)
    user_id = str(token_row.user_id)
    hosted_runtime = str(token_row.token_kind or "") == "hosted_runtime"
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content=_jsonrpc_error(None, -32700, "Parse error"))

    if isinstance(body, list):  # JSON-RPC batch
        responses = []
        for message in body:
            if isinstance(message, dict):
                response = await _handle_mcp_message(
                    db, user_id, message, hosted_runtime=hosted_runtime
                )
                if response is not None:
                    responses.append(response)
        if not responses:
            return Response(status_code=202)
        return JSONResponse(content=responses)

    if not isinstance(body, dict):
        return JSONResponse(status_code=400, content=_jsonrpc_error(None, -32600, "Invalid request"))
    response = await _handle_mcp_message(
        db, user_id, body, hosted_runtime=hosted_runtime
    )
    if response is None:
        return Response(status_code=202)
    return JSONResponse(content=response)


@router.put("/mcp/uploads/{file_id}", status_code=204)
async def hosted_mcp_upload(file_id: str, request: Request, db: Session = Depends(get_db)):
    """Relay a hosted runtime upload without granting the tenant public egress."""
    token_row = _authenticate_mcp(request, db)
    if str(token_row.token_kind or "") != "hosted_runtime":
        raise HTTPException(status_code=403, detail="Hosted runtime token required.")
    try:
        parsed_file_id = uuid_module.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Pending upload not found.")
    source_file = (
        db.query(SourceFile)
        .join(JobRun, SourceFile.job_run_id == JobRun.id)
        .join(ExtractionJob, JobRun.job_id == ExtractionJob.id)
        .filter(
            SourceFile.id == parsed_file_id,
            ExtractionJob.user_id == token_row.user_id,
            SourceFile.status == "uploading",
        )
        .first()
    )
    if source_file is None:
        raise HTTPException(status_code=404, detail="Pending upload not found.")
    expected_size = int(source_file.file_size_bytes or 0)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) != expected_size:
                raise HTTPException(status_code=409, detail="Upload size does not match prepared metadata.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header.")
    storage = uda_mcp_service.job_service.storage_service
    if not getattr(storage, "is_available", lambda: False)():
        raise HTTPException(status_code=503, detail="Storage is unavailable.")
    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="hosted-mcp-upload-", delete=False) as handle:
            tmp_path = handle.name
            total = 0
            async for chunk in request.stream():
                total += len(chunk)
                if total > expected_size or total > MAX_DIRECT_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Upload exceeds prepared size.")
                handle.write(chunk)
        if total != expected_size:
            raise HTTPException(status_code=409, detail="Upload size does not match prepared metadata.")
        await storage.upload_file(tmp_path, str(source_file.gcs_object_name))
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except FileNotFoundError:
                pass
    return Response(status_code=204)


@router.get("/mcp")
@router.delete("/mcp")
async def mcp_method_not_allowed():
    return JSONResponse(
        status_code=405,
        content=_jsonrpc_error(None, -32000, "Method not allowed."),
    )


# ---------------------------------------------------------------------------
# Admin (ADMIN_TOKEN pattern shared with routes/admin.py)
# ---------------------------------------------------------------------------


def _require_admin(admin_token: str) -> None:
    expected = os.getenv("ADMIN_TOKEN")
    if not expected or admin_token != expected:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@admin_router.get("/health", response_model=ConnectorHealthResponse)
async def connector_health(admin_token: str = Query(...)):
    _require_admin(admin_token)
    status = await connector_service.health()
    return ConnectorHealthResponse(success=True, **status)


@admin_router.get("/oauth-configs", response_model=OAuthConfigsResponse)
async def list_oauth_configs(admin_token: str = Query(...), db: Session = Depends(get_db)):
    _require_admin(admin_token)
    rows = db.query(ConnectorOAuthConfig).order_by(ConnectorOAuthConfig.service).all()
    return OAuthConfigsResponse(
        success=True,
        configs=[
            OAuthConfigInfo(
                service=str(r.service),
                client_id_hint=r.client_id_hint,
                enabled=bool(r.enabled),
                updated_at=r.updated_at,
            )
            for r in rows
        ],
    )


@admin_router.put("/oauth-configs/{service}", response_model=OAuthConfigsResponse)
async def upsert_oauth_config(
    service: str,
    req: OAuthConfigRequest,
    admin_token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Register CPAAutomation's OAuth app for a provider (runtime + mirror row)."""
    _require_admin(admin_token)
    try:
        await connector_service.get_provider(service)  # 404 for unknown services
        await connector_service.upsert_oauth_config(
            service, req.client_id, req.client_secret, req.extra, req.secret_extra
        )
    except ConnectorError as exc:
        raise _http_error(exc)
    row = db.query(ConnectorOAuthConfig).filter(ConnectorOAuthConfig.service == service).first()
    if not row:
        row = ConnectorOAuthConfig(service=service)
        db.add(row)
    row.client_id_hint = req.client_id[:12] + "…" if len(req.client_id) > 12 else req.client_id
    row.enabled = True
    db.commit()
    return await list_oauth_configs(admin_token=admin_token, db=db)  # type: ignore[arg-type]


@admin_router.delete("/oauth-configs/{service}", response_model=OAuthConfigsResponse)
async def delete_oauth_config(
    service: str,
    admin_token: str = Query(...),
    db: Session = Depends(get_db),
):
    _require_admin(admin_token)
    try:
        await connector_service.delete_oauth_config(service)
    except ConnectorError as exc:
        raise _http_error(exc)
    row = db.query(ConnectorOAuthConfig).filter(ConnectorOAuthConfig.service == service).first()
    if row:
        row.enabled = False
        db.commit()
    return await list_oauth_configs(admin_token=admin_token, db=db)  # type: ignore[arg-type]


@admin_router.get("/runs")
async def list_runs(
    admin_token: str = Query(...),
    limit: Optional[str] = Query(default=None),
):
    """Debug passthrough of the runtime's execution history."""
    _require_admin(admin_token)
    try:
        return await connector_service.list_runs({"limit": limit} if limit else None)
    except ConnectorError as exc:
        raise _http_error(exc)
