"""
Broker over the self-hosted OpenConnector runtime.

The runtime (OPENCONNECTOR_URL, normally https://connect.cpaautomation.ai) is
single-tenant: connections are global, distinguished only by connectionName.
This service is the ONLY code that talks to it, and it enforces CPAAutomation's
multi-tenancy convention on every call:

  - a user's connections are named ``u_{user_id}`` (default) or
    ``u_{user_id}__{label_slug}`` (extra labeled connections);
  - every execution carries ``x-oo-connector-alias`` derived server-side from
    the authenticated user — client-supplied aliases are never accepted.

Runtime auth surfaces (verified against the open-connector source):
  - /v1/*            -> OPENCONNECTOR_RUNTIME_TOKEN bearer
  - /api/*           -> OPENCONNECTOR_ADMIN_TOKEN bearer (connections, oauth
                        configs, providers catalog, runs)
The runtime's /mcp endpoint always executes with the default connection (it
ignores aliases), so it is never used; the Claw MCP proxy in routes/connector.py
translates MCP tool calls into execute_action() here instead.

Neither token is ever exposed outside this process. Credential values pass
through connect_* once and are stored only in the runtime's encrypted SQLite.
"""
import asyncio
import logging
import os
import re
import threading
import time
import weakref
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from core.database import db_config
from models.db_models import ConnectorActionLog, ConnectorConnection

logger = logging.getLogger(__name__)

CATALOG_TTL_SECONDS = 15 * 60
ALIAS_PREFIX = "u_"
LABEL_SEPARATOR = "__"

# Firebase UIDs are URL-safe; anything outside this charset never came from
# Firebase Auth and must not reach the alias namespace.
_UID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_LABEL_SLUG_RE = re.compile(r"[^a-z0-9-]+")


class ConnectorError(Exception):
    """A runtime call failed. ``status`` mirrors the runtime's HTTP status."""

    def __init__(self, message: str, status: int = 502, code: str = "connector_error"):
        super().__init__(message)
        self.status = status
        self.code = code


class ConnectorNotConfiguredError(ConnectorError):
    def __init__(self):
        super().__init__("Integrations are not configured on this deployment.", 503, "connector_not_configured")


class ConnectorNotConnectedError(ConnectorError):
    def __init__(self, service: str):
        super().__init__(f"No active {service} connection for this user.", 409, "connector_not_connected")
        self.service = service


def connection_name_for(user_id: str, label: Optional[str] = None) -> str:
    """Build the runtime connection name for a user (+ optional label)."""
    if not _UID_RE.match(user_id or ""):
        raise ConnectorError("Invalid user id for connector alias.", 400, "invalid_alias")
    base = f"{ALIAS_PREFIX}{user_id}"
    if not label:
        return base
    slug = _LABEL_SLUG_RE.sub("-", label.strip().lower()).strip("-")[:40]
    if not slug:
        raise ConnectorError("Invalid connection label.", 400, "invalid_label")
    return f"{base}{LABEL_SEPARATOR}{slug}"


def assert_owned(connection_name: str, user_id: str) -> None:
    """Refuse any connection name that does not belong to ``user_id``.

    Called on every path where a name is read back from Postgres or derived
    from client input, so a corrupted/forged row can never select another
    tenant's credential at the runtime.
    """
    owned = connection_name == f"{ALIAS_PREFIX}{user_id}" or connection_name.startswith(
        f"{ALIAS_PREFIX}{user_id}{LABEL_SEPARATOR}"
    )
    if not owned:
        raise ConnectorError("Connection does not belong to this user.", 403, "alias_forbidden")


def _summarize_credential_fields(auth_def: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Flatten a provider auth definition into connect-form field specs."""
    fields: List[Dict[str, Any]] = []
    if auth_def.get("type") == "api_key":
        fields.append(
            {
                "key": "apiKey",
                "label": auth_def.get("label") or "API key",
                "placeholder": auth_def.get("placeholder"),
                "description": auth_def.get("description"),
                "required": True,
                "secret": True,
            }
        )
        extra = auth_def.get("extraFields") or []
    else:  # custom_credential
        extra = auth_def.get("fields") or []
    for field in extra:
        fields.append(
            {
                "key": field.get("key"),
                "label": field.get("label"),
                "placeholder": field.get("placeholder"),
                "description": field.get("description"),
                "required": bool(field.get("required", True)),
                "secret": bool(field.get("secret", True)),
            }
        )
    return fields


class ConnectorService:
    """httpx client + catalog cache over the OpenConnector runtime."""

    def __init__(self):
        # One AsyncClient per event loop: connections are loop-bound, and short
        # lived loops (tests, one-off asyncio.run callers) must not poison the
        # client used by the server's main loop.
        self._clients: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, httpx.AsyncClient]" = (
            weakref.WeakKeyDictionary()
        )
        self._client_lock = threading.Lock()
        self._catalog: Optional[List[Dict[str, Any]]] = None
        self._catalog_by_service: Dict[str, Dict[str, Any]] = {}
        self._catalog_fetched_at = 0.0
        self._catalog_lock = threading.Lock()

    # -- configuration -----------------------------------------------------

    @property
    def base_url(self) -> str:
        return (os.getenv("OPENCONNECTOR_URL") or "").strip().rstrip("/")

    @property
    def _runtime_token(self) -> str:
        return (os.getenv("OPENCONNECTOR_RUNTIME_TOKEN") or "").strip()

    @property
    def _admin_token(self) -> str:
        return (os.getenv("OPENCONNECTOR_ADMIN_TOKEN") or "").strip()

    def is_configured(self) -> bool:
        return bool(self.base_url and self._runtime_token and self._admin_token)

    def _get_client(self) -> httpx.AsyncClient:
        loop = asyncio.get_running_loop()
        with self._client_lock:
            client = self._clients.get(loop)
            if client is None or client.is_closed:
                try:
                    client = httpx.AsyncClient(
                        base_url=self.base_url,
                        timeout=httpx.Timeout(30.0, read=120.0),
                    )
                except httpx.InvalidURL as exc:
                    # e.g. a secret value with an embedded newline; surface as a
                    # clean 502 instead of an unhandled 500.
                    logger.error("OPENCONNECTOR_URL is malformed: %s", exc)
                    raise ConnectorError(
                        "Integration service is misconfigured.", 502, "connector_misconfigured"
                    )
                self._clients[loop] = client
        return client

    async def _request(
        self,
        method: str,
        path: str,
        *,
        scope: str,  # 'runtime' for /v1, 'admin' for /api
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, str]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> httpx.Response:
        if not self.is_configured():
            raise ConnectorNotConfiguredError()
        token = self._runtime_token if scope == "runtime" else self._admin_token
        merged = {"authorization": f"Bearer {token}"}
        if headers:
            merged.update(headers)
        try:
            return await self._get_client().request(method, path, json=json_body, params=params, headers=merged)
        except httpx.HTTPError as exc:
            logger.error("OpenConnector runtime unreachable: %s %s (%s)", method, path, exc)
            raise ConnectorError("Integration service is unavailable.", 502, "connector_unreachable")

    @staticmethod
    def _raise_for_error(response: httpx.Response, default_message: str) -> Dict[str, Any]:
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if response.status_code >= 400:
            # Runtime errors come as {"error": {"code", "message"}} (admin
            # routes) or {"success": false, "message", "meta"} (runtime routes).
            error = payload.get("error")
            if isinstance(error, dict):
                message = error.get("message") or default_message
                code = error.get("code") or "connector_error"
            else:
                message = payload.get("message") or error or default_message
                code = payload.get("code") or payload.get("errorCode") or "connector_error"
            raise ConnectorError(str(message), response.status_code, str(code))
        return payload

    # -- catalog -----------------------------------------------------------

    async def _load_catalog(self, force: bool = False) -> List[Dict[str, Any]]:
        """Fetch and cache /api/providers (full defs, ~1000 entries).

        The raw payload includes every action schema, so only a slim summary
        plus the auth definitions are retained per provider; full action lists
        are fetched per-service on demand.
        """
        now = time.monotonic()
        if not force and self._catalog is not None and now - self._catalog_fetched_at < CATALOG_TTL_SECONDS:
            return self._catalog

        response = await self._request("GET", "/api/providers", scope="admin")
        if response.status_code >= 400:
            self._raise_for_error(response, "Failed to load provider catalog.")
        providers = response.json()

        slim: List[Dict[str, Any]] = []
        by_service: Dict[str, Dict[str, Any]] = {}
        for provider in providers:
            entry = {
                "service": provider.get("service"),
                "display_name": provider.get("displayName") or provider.get("service"),
                "description": provider.get("description"),
                "categories": provider.get("categories") or [],
                "auth_types": provider.get("authTypes") or [],
                "action_count": len(provider.get("actions") or []),
                "auth": provider.get("auth") or [],
            }
            slim.append(entry)
            by_service[entry["service"]] = entry

        with self._catalog_lock:
            self._catalog = slim
            self._catalog_by_service = by_service
            self._catalog_fetched_at = now
        return slim

    async def get_catalog(self) -> List[Dict[str, Any]]:
        return await self._load_catalog()

    async def get_provider(self, service: str) -> Dict[str, Any]:
        catalog = await self._load_catalog()
        provider = self._catalog_by_service.get(service)
        if provider is None:
            # Cache may predate a runtime catalog update.
            await self._load_catalog(force=True)
            provider = self._catalog_by_service.get(service)
        if provider is None:
            raise ConnectorError(f"Unknown service: {service}", 404, "unknown_service")
        return provider

    def credential_fields(self, provider: Dict[str, Any], auth_type: str) -> List[Dict[str, Any]]:
        for auth_def in provider.get("auth", []):
            if auth_def.get("type") == auth_type and auth_type in ("api_key", "custom_credential"):
                return _summarize_credential_fields(auth_def)
        return []

    async def get_actions(self, service: str) -> List[Dict[str, Any]]:
        response = await self._request("GET", "/v1/actions", scope="runtime", params={"service": service})
        payload = self._raise_for_error(response, "Failed to load actions.")
        actions = payload.get("data") if isinstance(payload, dict) else payload
        return actions if isinstance(actions, list) else []

    async def search_actions(
        self, query: str, service: Optional[str] = None, limit: int = 20
    ) -> List[Dict[str, Any]]:
        params: Dict[str, str] = {"q": query[:256], "limit": str(max(1, min(limit, 50)))}
        if service:
            params["service"] = service
        response = await self._request("GET", "/v1/actions/search", scope="runtime", params=params)
        payload = self._raise_for_error(response, "Action search failed.")
        results = payload.get("data") if isinstance(payload, dict) else payload
        return results if isinstance(results, list) else []

    async def get_action_guide(self, action_id: str, connection_name: Optional[str] = None) -> str:
        """Markdown usage guide for one action (runtime-rendered agent.md)."""
        headers = {"x-oo-connector-alias": connection_name} if connection_name else None
        response = await self._request(
            "GET", f"/api/actions/{action_id}/agent.md", scope="admin", headers=headers
        )
        if response.status_code == 404:
            raise ConnectorError(f"Unknown action: {action_id}", 404, "unknown_action")
        if response.status_code >= 400:
            self._raise_for_error(response, "Failed to load action guide.")
        return response.text

    # -- connections -------------------------------------------------------

    async def connect_with_credentials(
        self,
        user_id: str,
        service: str,
        auth_type: str,
        values: Dict[str, str],
        connection_name: str,
    ) -> Dict[str, Any]:
        """PUT the credential to the runtime under the user's alias."""
        assert_owned(connection_name, user_id)
        response = await self._request(
            "PUT",
            f"/api/connections/{service}",
            scope="admin",
            json_body={"authType": auth_type, "values": values, "connectionName": connection_name},
        )
        return self._raise_for_error(response, "Failed to create connection.")

    async def delete_connection(self, user_id: str, service: str, connection_name: str) -> None:
        assert_owned(connection_name, user_id)
        response = await self._request(
            "DELETE",
            f"/api/connections/{service}",
            scope="admin",
            params={"connectionName": connection_name},
        )
        if response.status_code not in (200, 204, 404):
            self._raise_for_error(response, "Failed to remove connection.")

    async def get_connection_summary(
        self, user_id: str, service: str, connection_name: str
    ) -> Optional[Dict[str, Any]]:
        """Find one connection in the runtime's global list (no per-name GET)."""
        assert_owned(connection_name, user_id)
        response = await self._request("GET", "/api/connections", scope="admin")
        payload = self._raise_for_error(response, "Failed to list connections.")
        connections = payload if isinstance(payload, list) else payload.get("connections", [])
        for summary in connections:
            if summary.get("service") == service and summary.get("connectionName") == connection_name:
                return summary
        return None

    # -- OAuth -------------------------------------------------------------

    async def upsert_oauth_config(
        self,
        service: str,
        client_id: str,
        client_secret: str,
        extra: Optional[Dict[str, str]] = None,
        secret_extra: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"clientId": client_id, "clientSecret": client_secret}
        if extra:
            body["extra"] = extra
        if secret_extra:
            body["secretExtra"] = secret_extra
        response = await self._request("PUT", f"/api/oauth/configs/{service}", scope="admin", json_body=body)
        return self._raise_for_error(response, "Failed to store OAuth config.")

    async def delete_oauth_config(self, service: str) -> None:
        response = await self._request("DELETE", f"/api/oauth/configs/{service}", scope="admin")
        if response.status_code not in (200, 204, 404):
            self._raise_for_error(response, "Failed to remove OAuth config.")

    async def start_oauth(self, user_id: str, service: str, connection_name: str) -> str:
        """Begin the provider consent flow; returns the authorization URL."""
        assert_owned(connection_name, user_id)
        response = await self._request(
            "POST",
            "/api/oauth/authorizations",
            scope="admin",
            json_body={"service": service, "connectionName": connection_name},
        )
        payload = self._raise_for_error(response, "Failed to start OAuth authorization.")
        url = payload.get("authorizationUrl")
        if not url:
            raise ConnectorError("Runtime returned no authorization URL.", 502, "oauth_start_failed")
        return url

    # -- execution ---------------------------------------------------------

    async def execute_action(
        self,
        user_id: str,
        action_id: str,
        input_data: Dict[str, Any],
        connection_name: str,
        source: str,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """POST /v1/actions/{action_id} as the user's alias; audits the run.

        Returns the runtime's response envelope ({success, message, data, meta}).
        Raises ConnectorError on transport failure or non-2xx.
        """
        assert_owned(connection_name, user_id)
        service = action_id.split(".", 1)[0]
        headers = {"x-oo-connector-alias": connection_name}
        if idempotency_key:
            headers["idempotency-key"] = idempotency_key

        started = time.monotonic()
        status_code: Optional[int] = None
        success: Optional[bool] = None
        try:
            response = await self._request(
                "POST",
                f"/v1/actions/{action_id}",
                scope="runtime",
                json_body={"input": input_data},
                headers=headers,
            )
            status_code = response.status_code
            payload = self._raise_for_error(response, "Action execution failed.")
            success = bool(payload.get("success", True))
            return payload
        except ConnectorError as exc:
            success = False
            status_code = status_code if status_code is not None else (exc.status if exc.status != 502 else None)
            raise
        finally:
            self._log_action(
                user_id=user_id,
                source=source,
                service=service,
                action_id=action_id,
                connection_name=connection_name,
                success=success,
                status_code=status_code,
                duration_ms=int((time.monotonic() - started) * 1000),
            )

    async def execute_for_user(
        self,
        user_id: str,
        service: str,
        action_id: str,
        input_data: Dict[str, Any],
        label: Optional[str] = None,
        source: str = "platform",
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Platform-facing helper: resolve the user's active connection and run.

        Other backend modules should call this instead of touching the runtime.
        Raises ConnectorNotConnectedError when the user has no active
        connection for ``service``.
        """
        db = db_config.get_session()
        try:
            query = db.query(ConnectorConnection).filter(
                ConnectorConnection.user_id == user_id,
                ConnectorConnection.service == service,
                ConnectorConnection.status == "active",
            )
            if label:
                query = query.filter(ConnectorConnection.label == label)
            row = query.order_by(ConnectorConnection.label.isnot(None)).first()
        finally:
            db.close()
        if row is None:
            raise ConnectorNotConnectedError(service)
        return await self.execute_action(
            user_id=user_id,
            action_id=action_id,
            input_data=input_data,
            connection_name=str(row.connection_name),
            source=source,
            idempotency_key=idempotency_key,
        )

    # -- misc --------------------------------------------------------------

    async def health(self) -> Dict[str, Any]:
        if not self.is_configured():
            return {"configured": False, "reachable": False}
        try:
            catalog = await self._load_catalog()
            return {"configured": True, "reachable": True, "provider_count": len(catalog)}
        except ConnectorError:
            return {"configured": True, "reachable": False}

    async def list_runs(self, params: Optional[Dict[str, str]] = None) -> Any:
        response = await self._request("GET", "/api/runs", scope="admin", params=params)
        return self._raise_for_error(response, "Failed to list runs.")

    def _log_action(
        self,
        *,
        user_id: str,
        source: str,
        service: str,
        action_id: str,
        connection_name: str,
        success: Optional[bool],
        status_code: Optional[int],
        duration_ms: int,
    ) -> None:
        """Best-effort audit row + last_used_at bump in a dedicated session."""
        db = db_config.get_session()
        try:
            db.add(
                ConnectorActionLog(
                    user_id=user_id,
                    source=source,
                    service=service,
                    action_id=action_id,
                    connection_name=connection_name,
                    success=success,
                    status_code=status_code,
                    duration_ms=duration_ms,
                )
            )
            db.query(ConnectorConnection).filter(
                ConnectorConnection.connection_name == connection_name
            ).update({ConnectorConnection.last_used_at: datetime.now(timezone.utc)})
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Failed to write connector action log")
        finally:
            db.close()


connector_service = ConnectorService()
