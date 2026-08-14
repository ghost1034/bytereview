"""Hosted-Claw control-plane helpers with no tenant payload logging."""

from __future__ import annotations

import json
import logging
import mimetypes
import os
import urllib.parse
from datetime import timedelta
from decimal import Decimal
from pathlib import PurePath
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from core.runtime import frontend_base_url, public_api_base_url
from models.db_models import (
    HostedClawConfig,
    HostedClawEntitlement,
    HostedClawReadOnlyAction,
    HostedClawSlackInstallation,
)
from services.hosted_claw_security import KmsEnvelope, new_secret, sha256_token, utcnow

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg", ".zip"}
REJECTED_EXTENSIONS = {".docm", ".xlsm", ".xlam", ".rar", ".7z", ".tar", ".gz", ".exe", ".dll", ".sh", ".bat", ".cmd"}
MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024
MAX_ATTACHMENTS = 10
SLACK_CHANNEL_MENTION_SCOPE = "app_mentions:read"
SLACK_BOT_SCOPES = (
    "chat:write",
    "im:history",
    "im:write",
    "files:read",
    "files:write",
    "commands",
    SLACK_CHANNEL_MENTION_SCOPE,
)


def get_or_create_entitlement(db: Session, user_id: str) -> HostedClawEntitlement:
    """Return a user's Hosted Claw settings, enabling public access by default."""
    row = db.query(HostedClawEntitlement).filter(HostedClawEntitlement.user_id == user_id).first()
    if row is None:
        row = HostedClawEntitlement(
            user_id=user_id,
            enabled=True,
            allowed_products=["accountingclaw"],
            allowed_model_aliases=["claw-default"],
            monthly_budget_usd=Decimal("0"),
        )
        db.add(row)
        db.flush()
    return row


def require_entitlement(db: Session, user_id: str) -> HostedClawEntitlement:
    row = get_or_create_entitlement(db, user_id)
    if row is None or not bool(row.enabled) or row.revoked_at is not None:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Hosted Claw is unavailable for this account")
    return row


def get_or_create_config(db: Session, user_id: str) -> HostedClawConfig:
    row = db.query(HostedClawConfig).filter(HostedClawConfig.user_id == user_id).first()
    if row is None:
        row = HostedClawConfig(user_id=user_id)
        db.add(row)
        db.flush()
    return row


def slack_oauth_url(state: str) -> str:
    client_id = os.getenv("SLACK_CLIENT_ID", "").strip()
    if not client_id:
        raise RuntimeError("SLACK_CLIENT_ID is not configured")
    query = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "scope": ",".join(SLACK_BOT_SCOPES),
            "redirect_uri": f"{public_api_base_url()}/api/slack/oauth/callback",
            "state": state,
        }
    )
    return f"https://slack.com/oauth/v2/authorize?{query}"


async def exchange_slack_code(code: str) -> dict[str, Any]:
    payload = {
        "client_id": os.getenv("SLACK_CLIENT_ID", ""),
        "client_secret": os.getenv("SLACK_CLIENT_SECRET", ""),
        "code": code,
        "redirect_uri": f"{public_api_base_url()}/api/slack/oauth/callback",
    }
    if not payload["client_id"] or not payload["client_secret"]:
        raise RuntimeError("Slack OAuth is not configured")
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post("https://slack.com/api/oauth.v2.access", data=payload)
        response.raise_for_status()
        result = response.json()
    if not result.get("ok") or not result.get("access_token"):
        raise RuntimeError("Slack rejected the OAuth exchange")
    return result


def decrypt_bot_token(installation: HostedClawSlackInstallation) -> str:
    aad = f"slack-installation:{installation.team_id}".encode()
    plaintext = KmsEnvelope().decrypt(
        installation.bot_token_ciphertext,
        aad=aad,
        key_version=str(installation.kms_key_version),
    )
    return plaintext.decode("utf-8")


async def slack_api(installation: HostedClawSlackInstallation, method: str, payload: dict[str, Any]) -> dict[str, Any]:
    token = decrypt_bot_token(installation)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"https://slack.com/api/{method}",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        if response.status_code == 429:
            logger.warning(
                "Slack rate limit method=%s retry_after=%s",
                method,
                response.headers.get("retry-after"),
            )
        response.raise_for_status()
        result = response.json()
    if not result.get("ok"):
        logger.warning("Slack API call failed method=%s error=%s", method, result.get("error"))
        raise RuntimeError(f"Slack API {method} failed")
    return result


def new_link_url() -> tuple[str, str]:
    token = new_secret("hclink_")
    return token, f"{frontend_base_url()}/dashboard/activation?hosted_link={urllib.parse.quote(token)}"


def validate_attachment(filename: str, content_type: str, size_bytes: int) -> None:
    from fastapi import HTTPException

    safe_name = PurePath(filename).name
    suffix = PurePath(safe_name).suffix.lower()
    if safe_name != filename or suffix in REJECTED_EXTENSIONS or suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported attachment: {safe_name}")
    if size_bytes < 1 or size_bytes > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=400, detail=f"Attachment exceeds the 50 MB limit: {safe_name}")
    guessed, _ = mimetypes.guess_type(safe_name)
    if content_type in {"application/x-msdownload", "application/x-rar-compressed"}:
        raise HTTPException(status_code=400, detail=f"Unsafe attachment type: {safe_name}")
    if suffix == ".zip" and content_type not in {
        "application/zip",
        "application/x-zip-compressed",
        "application/octet-stream",
    }:
        raise HTTPException(status_code=400, detail=f"Attachment type does not match filename: {safe_name}")
    if guessed and content_type and content_type != "application/octet-stream":
        # Be deliberately permissive for CSV/TXT browser variations, strict for binaries.
        zip_alias = suffix == ".zip" and content_type == "application/x-zip-compressed"
        if suffix not in {".csv", ".txt"} and guessed != content_type and not zip_alias:
            raise HTTPException(status_code=400, detail=f"Attachment type does not match filename: {safe_name}")


def action_is_read_only(db: Session, action_id: str) -> bool:
    """Unknown actions default to write-risk."""
    row = db.query(HostedClawReadOnlyAction).filter(
        HostedClawReadOnlyAction.action_id == action_id,
        HostedClawReadOnlyAction.enabled.is_(True),
    ).first()
    return row is not None


def managed_hermes_config(config: HostedClawConfig, connector_url: str, llm_base_url: str) -> dict[str, Any]:
    """Render the only configuration surface accepted by hosted containers."""
    cron_is_enabled = os.getenv("HOSTED_CLAW_CRON_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
    disabled_toolsets = ["web", "browser", "delegation", "homeassistant", "messaging"]
    if not cron_is_enabled:
        disabled_toolsets.append("cron")
    if not bool(config.memory_enabled):
        disabled_toolsets.append("memory")
    return {
        "model": {"provider": "custom", "default": str(config.model_alias), "base_url": llm_base_url},
        "profile": {
            "product": str(config.active_product),
        },
        "timezone": str(config.timezone),
        "memory": {
            "memory_enabled": bool(config.memory_enabled),
            "user_profile_enabled": bool(config.memory_enabled),
            "write_approval": False,
        },
        "agent": {"disabled_toolsets": disabled_toolsets},
        "terminal": {"backend": "local", "cwd": "/opt/data/workspace", "persistent_shell": False},
        "mcp_servers": {"cpaautomation": {"url": connector_url}},
        # Keep the managed provider selected even while the kill switch is
        # off. Falling back to Hermes's built-in ticker could fire native jobs
        # left on disk from an earlier enabled period.
        "plugins": {"enabled": ["hosted-policy", "cpaa-hosted"]},
        "cron": {
            "provider": "cpaa-hosted",
            "completed_retention_days": 30,
        },
        "platforms": {
            "cpaa-hosted": {"enabled": cron_is_enabled},
        },
        "gateway": {"api_server": {"enabled": True, "host": "0.0.0.0", "port": 8642, "max_concurrent_runs": 1}},
        "security": {
            "managed": True,
            "allow_custom_mcp": False,
            "allow_provider_keys": False,
            "terminal": {"approval_required_for_dangerous_operations": False},
        },
    }


def artifact_expiry():
    return utcnow() + timedelta(days=30)


def publish_job(job_id: str) -> None:
    topic = os.getenv("HOSTED_CLAW_PUBSUB_TOPIC", "").strip()
    project = (
        os.getenv("GOOGLE_CLOUD_PROJECT", "")
        or os.getenv("GOOGLE_CLOUD_PROJECT_ID", "")
    ).strip()
    if not topic or not project:
        if os.getenv("ENVIRONMENT", "local").lower() in {"local", "development", "dev", "test"}:
            logger.info("Hosted job queued locally job_id=%s", job_id)
            return
        raise RuntimeError("Hosted-Claw Pub/Sub is not configured")
    from google.cloud import pubsub_v1

    publisher = pubsub_v1.PublisherClient()
    topic_path = topic if topic.startswith("projects/") else publisher.topic_path(project, topic)
    future = publisher.publish(topic_path, json.dumps({"job_id": job_id}).encode("utf-8"))
    future.add_done_callback(
        lambda completed: logger.error("Hosted job publish failed job_id=%s", job_id)
        if completed.exception()
        else None
    )
