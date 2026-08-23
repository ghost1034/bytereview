"""Hosted Claw user, Slack, worker, and system-administration APIs."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import secrets
import urllib.parse
import uuid
import tempfile
from weakref import WeakValueDictionary
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.database import get_db
from core.runtime import frontend_base_url, public_api_base_url
from dependencies.auth import get_current_user_id
from dependencies.hosted_claw_auth import require_hosted_worker
from models.db_models import (
    ConnectorToken,
    HostedClawApproval,
    HostedClawArtifact,
    HostedClawChannelSession,
    HostedClawConfig,
    HostedClawCronOccurrence,
    HostedClawCronSchedule,
    HostedClawEntitlement,
    HostedClawJob,
    HostedClawLinkToken,
    HostedClawOAuthState,
    HostedClawProductSession,
    HostedClawReadOnlyAction,
    HostedClawSlackInstallation,
    HostedClawSlackLink,
    HostedClawUsageSummary,
    HostedClawWorkerLease,
)
from models.hosted_claw import (
    ApprovalRequest,
    ApprovalResponse,
    ArtifactRegisterRequest,
    ArtifactRegisterResponse,
    CronOccurrenceProviderCompleteRequest,
    CronScheduleReconcileRequest,
    CronTextDeliveryRequest,
    EntitlementUpdate,
    HostedCommandResponse,
    HostedConfigResponse,
    HostedConfigUpdate,
    HostedStatusResponse,
    JobCompletionRequest,
    LinkConsumeRequest,
    LinkConsumeResponse,
    ReadOnlyPolicyUpdate,
    RuntimeCredentialRequest,
    RuntimeCredentialResponse,
    RuntimeApprovalRequest,
    SlackInstallResponse,
    WorkerClaimRequest,
    WorkerClaimResponse,
    WorkerCronClaimResponse,
    WorkerCronCompleteRequest,
    WorkerCronOccurrenceResponse,
    WorkerJobResponse,
)
from routes.admin import require_system_admin
from services.connector_token_service import mint_token
from services.connector_token_service import validate_token as validate_connector_token
from services.hosted_claw_security import (
    HostedClawUnavailable,
    KmsEnvelope,
    approval_argument_hash,
    hosted_enabled,
    new_secret,
    one_time_record_is_valid,
    sha256_token,
    utcnow,
    verify_slack_signature,
)
from services.hosted_claw_service import (
    artifact_expiry,
    exchange_slack_code,
    get_or_create_config,
    get_or_create_entitlement,
    new_link_url,
    publish_job,
    require_entitlement,
    slack_api,
    slack_oauth_url,
    validate_attachment,
    decrypt_bot_token,
    SLACK_CHANNEL_MENTION_SCOPE,
)
from services.hosted_claw_cron import (
    active_slack_context,
    cron_enabled,
    dispatch_due_occurrences,
    publish_occurrences,
    reconcile_schedules,
    recover_expired_occurrences,
)
from services.billing_service import BillingService


def _lock_hosted_user_work(db: Session, user_id: str) -> None:
    """Serialize interactive and cron admission across worker processes."""
    if db.get_bind().dialect.name == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:user_id, 0))"),
            {"user_id": user_id},
        )


def _hosted_user_has_active_work(db: Session, user_id: str) -> bool:
    active_job = db.query(HostedClawJob.id).filter(
        HostedClawJob.user_id == user_id,
        HostedClawJob.status.in_(["claimed", "running"]),
    ).first()
    if active_job is not None:
        return True
    return db.query(HostedClawCronOccurrence.id).filter(
        HostedClawCronOccurrence.user_id == user_id,
        HostedClawCronOccurrence.status.in_(["claimed", "ready", "running"]),
    ).first() is not None

logger = logging.getLogger(__name__)

user_router = APIRouter(prefix="/api/hosted-claw", tags=["hosted-claw"])
slack_router = APIRouter(prefix="/api/slack", tags=["hosted-claw-slack"])
internal_router = APIRouter(
    prefix="/api/internal/hosted-claw",
    tags=["hosted-claw-internal"],
    dependencies=[Depends(require_hosted_worker)],
)
admin_router = APIRouter(prefix="/api/admin/hosted-claw", tags=["admin-hosted-claw"])

# SQLAlchemy's synchronous row locks block the event-loop thread. Serialize
# progress relays in-process before acquiring the database lock so a second
# update for the same job cannot prevent the first Slack request from resuming
# and releasing its transaction. The database lock still coordinates separate
# Cloud Run instances/processes.
_job_progress_locks: WeakValueDictionary[str, asyncio.Lock] = WeakValueDictionary()


def _job_progress_lock(job_id: str) -> asyncio.Lock:
    lock = _job_progress_locks.get(job_id)
    if lock is None:
        lock = asyncio.Lock()
        _job_progress_locks[job_id] = lock
    return lock


def _tenant_prefix(user_id: str) -> str:
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:32]


def _valid_slack_file_url(value: str) -> bool:
    parsed = urllib.parse.urlparse(value)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (
        host == "slack.com" or host.endswith(".slack.com") or host.endswith(".slack-edge.com")
    )


def _supported_slack_message_event(event: dict[str, Any]) -> bool:
    """Return whether a Slack event is a user-authored DM or app mention.

    Slack labels messages containing newly shared attachments as ``file_share``.
    Treat that subtype as an ordinary message so attachment workflows reach the
    quarantine pipeline. Channel messages must arrive as explicit app-mention
    events; ordinary channel messages and bot output are ignored.
    """
    if event.get("bot_id") or event.get("subtype") not in {None, "file_share"}:
        return False
    if event.get("type") == "app_mention":
        return bool(event.get("user") and event.get("channel"))
    return bool(
        event.get("type") == "message"
        and event.get("channel_type") == "im"
        and event.get("user")
    )


def _is_channel_mention(event: dict[str, Any]) -> bool:
    return event.get("type") == "app_mention"


def _channel_prompt(text_value: Any, bot_user_id: str) -> str:
    """Remove only this installation's bot mention from a channel prompt."""
    text_value = str(text_value or "")
    mention = f"<@{bot_user_id}>"
    return text_value.replace(mention, " ").strip()


def _event_reply(event: dict[str, Any], text_value: str) -> dict[str, str]:
    payload = {"channel": str(event.get("channel") or ""), "text": text_value}
    if _is_channel_mention(event):
        payload["thread_ts"] = str(event.get("thread_ts") or event.get("ts") or "")
    return payload


async def _send_channel_link(
    installation: HostedClawSlackInstallation,
    *,
    slack_user: str,
    channel: str,
    thread_ts: str,
    link_text: str,
) -> None:
    """Deliver an account link privately and acknowledge it without leaking the token."""
    acknowledgement = {
        "channel": channel,
        "thread_ts": thread_ts,
        "text": f"<@{slack_user}> I sent your CPAAutomation account link by DM.",
    }
    try:
        opened = await slack_api(installation, "conversations.open", {"users": slack_user})
        dm_channel = str((opened.get("channel") or {}).get("id") or "")
        if not dm_channel:
            raise RuntimeError("Slack did not return a DM channel")
        await slack_api(
            installation,
            "chat.postMessage",
            {"channel": dm_channel, "text": link_text},
        )
    except Exception:
        logger.warning("hosted_channel_link_dm_failed team_id=%s", installation.team_id)
        acknowledgement["text"] = (
            f"<@{slack_user}> I couldn't send you a DM. Link Slack from the "
            "CPAAutomation Hosted Slack dashboard, then mention me again."
        )
    await slack_api(installation, "chat.postMessage", acknowledgement)


def _runtime_start_expected(
    session: HostedClawProductSession | None,
    worker_id: str,
    config_revision: int,
) -> bool:
    return bool(
        session is None
        or not session.runtime_id
        or session.status in {"stopped", "error"}
        or session.worker_id != worker_id
        or int(session.applied_config_revision or 0) != int(config_revision)
    )


def _ensure_hermes_session_id(session: HostedClawProductSession) -> str:
    if not session.hermes_session_id:
        session.hermes_session_id = f"hcs_{uuid.uuid4().hex}"
    return str(session.hermes_session_id)


def _channel_session_for_job(
    db: Session,
    job: HostedClawJob,
    payload: dict[str, Any],
) -> HostedClawChannelSession | None:
    if payload.get("source") != "channel_mention":
        return None
    if job.channel_session_id:
        existing = db.get(HostedClawChannelSession, job.channel_session_id)
        if existing is not None:
            return existing
    team_id = str(payload.get("team_id") or "")
    channel_id = str(payload.get("channel_id") or "")
    thread_ts = str(payload.get("thread_ts") or "")
    if not team_id or not channel_id or not thread_ts:
        raise HostedClawUnavailable("Slack channel session identity is incomplete")
    session = db.query(HostedClawChannelSession).filter(
        HostedClawChannelSession.user_id == job.user_id,
        HostedClawChannelSession.product == job.product,
        HostedClawChannelSession.team_id == team_id,
        HostedClawChannelSession.channel_id == channel_id,
        HostedClawChannelSession.thread_ts == thread_ts,
    ).first()
    if session is None:
        session = HostedClawChannelSession(
            user_id=job.user_id,
            product=job.product,
            team_id=team_id,
            channel_id=channel_id,
            thread_ts=thread_ts,
            hermes_session_id=f"hcs_{uuid.uuid4().hex}",
        )
        db.add(session)
        db.flush()
    job.channel_session_id = session.id
    return session


def _aware_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _require_feature() -> None:
    if not hosted_enabled():
        raise HTTPException(status_code=404, detail="Hosted Claw is not enabled")


def _identity(enterprise_id: Any, team_id: Any, slack_user_id: Any) -> tuple[str | None, str, str]:
    enterprise = str(enterprise_id).strip() if enterprise_id else None
    team = str(team_id or "").strip()
    slack_user = str(slack_user_id or "").strip()
    if not team or not slack_user:
        raise HTTPException(status_code=400, detail="Slack identity is incomplete")
    return enterprise, team, slack_user


def _active_link_query(db: Session, enterprise: str | None, team: str, slack_user: str):
    query = db.query(HostedClawSlackLink).filter(
        HostedClawSlackLink.team_id == team,
        HostedClawSlackLink.slack_user_id == slack_user,
        HostedClawSlackLink.unlinked_at.is_(None),
    )
    query = query.filter(
        HostedClawSlackLink.enterprise_id == enterprise
        if enterprise is not None
        else HostedClawSlackLink.enterprise_id.is_(None)
    )
    return query


def _installation_query(db: Session, enterprise: str | None, team: str):
    query = db.query(HostedClawSlackInstallation).filter(
        HostedClawSlackInstallation.team_id == team,
        HostedClawSlackInstallation.status == "active",
    )
    return query.filter(
        HostedClawSlackInstallation.enterprise_id == enterprise
        if enterprise is not None
        else HostedClawSlackInstallation.enterprise_id.is_(None)
    )


def _link_oauth_installer(
    db: Session,
    *,
    installation: HostedClawSlackInstallation,
    user_id: str,
    enterprise_id: Any,
    team_id: Any,
    slack_user_id: Any,
) -> HostedClawSlackLink:
    """Link the Firebase user who started OAuth to Slack's authenticated installer."""
    enterprise, team, slack_user = _identity(enterprise_id, team_id, slack_user_id)
    identity_link = _active_link_query(db, enterprise, team, slack_user).with_for_update().first()
    user_link = db.query(HostedClawSlackLink).filter(
        HostedClawSlackLink.user_id == user_id,
        HostedClawSlackLink.unlinked_at.is_(None),
    ).with_for_update().first()

    if identity_link is not None and str(identity_link.user_id) != user_id:
        raise HTTPException(status_code=409, detail="This Slack identity is already linked to another CPAAutomation user")
    if user_link is not None and (
        user_link.enterprise_id != enterprise
        or str(user_link.team_id) != team
        or str(user_link.slack_user_id) != slack_user
    ):
        raise HTTPException(status_code=409, detail="This CPAAutomation user is already linked to another Slack identity")

    link = identity_link or user_link
    if link is None:
        link = HostedClawSlackLink(
            installation_id=installation.id,
            enterprise_id=enterprise,
            team_id=team,
            slack_user_id=slack_user,
            user_id=user_id,
        )
        db.add(link)
    else:
        # A workspace reinstall updates the installation credentials in place.
        link.installation_id = installation.id
    return link


def _config_response(row: HostedClawConfig, *, product: str | None = None) -> HostedConfigResponse:
    return HostedConfigResponse(
        active_product=str(product or row.active_product),
        model_alias=str(row.model_alias),
        personal_instructions=str(row.personal_instructions or ""),
        timezone=str(row.timezone),
        memory_enabled=bool(row.memory_enabled),
        revision=int(row.revision),
    )


def _slack_verified(raw: bytes, request: Request) -> None:
    if not verify_slack_signature(
        raw,
        request.headers.get("x-slack-request-timestamp"),
        request.headers.get("x-slack-signature"),
    ):
        raise HTTPException(status_code=401, detail="Invalid Slack signature")


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def _hosted_connector(request: Request, db: Session) -> ConnectorToken:
    authorization = request.headers.get("authorization") or ""
    submitted = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    row = validate_connector_token(db, submitted, _client_ip(request))
    if row is None or str(row.token_kind) != "hosted_runtime" or not row.runtime_id:
        raise HTTPException(status_code=401, detail="Invalid hosted runtime token")
    db.commit()
    return row


def _connector_runtime_session(
    db: Session,
    connector: ConnectorToken,
) -> HostedClawProductSession:
    session = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == connector.user_id,
        HostedClawProductSession.runtime_id == connector.runtime_id,
        HostedClawProductSession.status.in_(["starting", "ready", "running"]),
    ).first()
    if session is None:
        raise HTTPException(status_code=409, detail="Hosted runtime is not active")
    return session


def _delete_artifact_objects(object_names: list[str]) -> None:
    bucket_name = os.getenv("HOSTED_CLAW_ARTIFACT_BUCKET", "").strip()
    if not object_names:
        return
    if not bucket_name:
        raise HostedClawUnavailable("Hosted artifact storage is not configured")
    try:
        from google.api_core.exceptions import NotFound
        from google.cloud import storage

        bucket = storage.Client().bucket(bucket_name)
        for object_name in object_names:
            try:
                bucket.blob(object_name).delete()
            except NotFound:
                pass
    except HostedClawUnavailable:
        raise
    except Exception as exc:
        raise HostedClawUnavailable("Hosted artifact deletion failed") from exc


def _interrupt_cron_runtime_work(db: Session, user_id: str, now: datetime) -> None:
    """Stop runtime-owned cron work without deleting or disabling schedules."""
    db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.user_id == user_id,
        HostedClawCronOccurrence.status.in_(["claimed", "ready"]),
        HostedClawCronOccurrence.provider_claimed_at.is_(None),
    ).update(
        {
            HostedClawCronOccurrence.status: "pending",
            HostedClawCronOccurrence.worker_id: None,
            HostedClawCronOccurrence.runtime_id: None,
            HostedClawCronOccurrence.claimed_at: None,
            HostedClawCronOccurrence.ready_at: None,
            HostedClawCronOccurrence.lease_expires_at: None,
        },
        synchronize_session=False,
    )
    db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.user_id == user_id,
        HostedClawCronOccurrence.status == "running",
    ).update(
        {
            HostedClawCronOccurrence.status: "unknown",
            HostedClawCronOccurrence.error_code: "runtime_stopped_after_native_claim",
            HostedClawCronOccurrence.completed_at: now,
        },
        synchronize_session=False,
    )


def _register_claim_attachments(
    db: Session,
    job: HostedClawJob,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Register idempotent quarantine work without blocking the job claim."""
    files = payload.get("files") or []
    if not files:
        return payload
    staged: list[dict[str, Any]] = []
    for item in files:
        source_id = str(item.get("id") or "")
        if not source_id:
            raise HostedClawUnavailable("Slack attachment identity is missing")
        filename = str(item["name"])
        content_type = str(item.get("mimetype") or "application/octet-stream")
        expected_size = int(item.get("size") or 0)
        validate_attachment(filename, content_type, expected_size)
        artifact = db.query(HostedClawArtifact).filter(
            HostedClawArtifact.job_id == job.id,
            HostedClawArtifact.source_id == source_id,
        ).first()
        if artifact is None:
            artifact_id = uuid.uuid4()
            object_name = f"hosted-claw/quarantine/{_tenant_prefix(str(job.user_id))}/{artifact_id.hex}/{filename}"
            artifact = HostedClawArtifact(
                id=artifact_id, user_id=job.user_id, job_id=job.id, source_id=source_id,
                direction="inbound", filename=filename, content_type=content_type, size_bytes=expected_size,
                gcs_object_name=object_name, expires_at=artifact_expiry(),
            )
            db.add(artifact)
            db.flush()
        staged.append({
            "artifact_id": str(artifact.id), "name": filename, "mimetype": content_type,
            "size": expected_size,
        })
    payload["files"] = staged
    return payload


@user_router.get("/status", response_model=HostedStatusResponse)
async def status(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    if not hosted_enabled():
        return HostedStatusResponse(feature_enabled=False, entitled=False)
    entitlement = get_or_create_entitlement(db, user_id)
    entitled = bool(entitlement.enabled and entitlement.revoked_at is None)
    if not entitled:
        return HostedStatusResponse(feature_enabled=hosted_enabled(), entitled=False)
    config = get_or_create_config(db, user_id)
    link = db.query(HostedClawSlackLink).filter(
        HostedClawSlackLink.user_id == user_id, HostedClawSlackLink.unlinked_at.is_(None)
    ).first()
    installation = db.get(HostedClawSlackInstallation, link.installation_id) if link else None
    session = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == user_id,
        HostedClawProductSession.product == config.active_product,
    ).first()
    db.commit()
    return HostedStatusResponse(
        feature_enabled=hosted_enabled(),
        entitled=True,
        allowed_products=list(entitlement.allowed_products or []),
        allowed_model_aliases=list(entitlement.allowed_model_aliases or []),
        linked=link is not None,
        workspace_name=installation.team_name if installation else None,
        slack_user_id=link.slack_user_id if link else None,
        slack_reauthorization_required=bool(
            link
            and installation
            and SLACK_CHANNEL_MENTION_SCOPE not in (installation.scopes or [])
        ),
        config=_config_response(config),
        runtime_status=str(session.status) if session else "stopped",
        runtime_last_activity_at=session.last_activity_at if session else None,
    )


@user_router.post("/runtime/approval")
async def runtime_approval(body: RuntimeApprovalRequest, request: Request, db: Session = Depends(get_db)):
    """Poll/create a Slack decision using only a tenant's scoped connector token."""
    _require_feature()
    connector = _hosted_connector(request, db)
    from services.hosted_claw_service import action_is_read_only

    if "." in body.action_id and action_is_read_only(db, body.action_id):
        return {"status": "not_required"}
    now = utcnow()
    argument_hash = approval_argument_hash(body.arguments)
    approval = db.query(HostedClawApproval).filter(
        HostedClawApproval.connector_token_id == connector.id,
        HostedClawApproval.run_id == body.run_id,
        HostedClawApproval.action_id == body.action_id,
        HostedClawApproval.argument_hash == argument_hash,
    ).order_by(HostedClawApproval.created_at.desc()).with_for_update().first()
    if approval is not None:
        if approval.expires_at <= now:
            approval.status = "expired"
            db.commit()
            return {"status": "expired"}
        elif approval.status == "approved":
            if approval.grant_token_hash is not None:
                return {"status": "consumed"}
            grant = new_secret("hcgrant_")
            approval.grant_token_hash = sha256_token(grant)
            db.commit()
            return {"status": "approved", "grant": grant}
        else:
            return {"status": approval.status}

    session = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == connector.user_id,
        HostedClawProductSession.runtime_id == connector.runtime_id,
        HostedClawProductSession.status.in_(["starting", "running"]),
    ).first()
    job = None
    if session is not None:
        job = db.query(HostedClawJob).filter(
            HostedClawJob.user_id == connector.user_id,
            HostedClawJob.product == session.product,
            HostedClawJob.status.in_(["claimed", "running"]),
        ).order_by(HostedClawJob.claimed_at.desc()).first()
    link = db.get(HostedClawSlackLink, job.slack_link_id) if job else None
    installation = db.get(HostedClawSlackInstallation, link.installation_id) if link else None
    if job is None or link is None or installation is None:
        raise HTTPException(status_code=409, detail="No active linked hosted turn")
    payload = json.loads(KmsEnvelope().decrypt(job.payload_ciphertext, aad=f"hosted-job:{job.event_id}".encode(), key_version=str(job.kms_key_version)))
    interaction_token = new_secret("hcapprove_")
    approval = HostedClawApproval(
        user_id=connector.user_id,
        connector_token_id=connector.id,
        run_id=body.run_id,
        action_id=body.action_id,
        argument_hash=argument_hash,
        interaction_token_hash=sha256_token(interaction_token),
        expires_at=now + timedelta(minutes=5),
    )
    db.add(approval)
    db.commit()
    await slack_api(
        installation,
        "chat.postMessage",
        {
            "channel": payload["channel_id"],
            "thread_ts": payload.get("thread_ts"),
            "text": f"Approve {body.action_id}?",
            "blocks": [
                {"type": "section", "text": {"type": "mrkdwn", "text": f"*Approval required* for `{body.action_id}`. Expires in 5 minutes."}},
                {"type": "actions", "elements": [
                    {"type": "button", "text": {"type": "plain_text", "text": "Confirm"}, "style": "primary", "value": f"confirm:{interaction_token}", "action_id": "hosted_claw_confirm"},
                    {"type": "button", "text": {"type": "plain_text", "text": "Deny"}, "style": "danger", "value": f"deny:{interaction_token}", "action_id": "hosted_claw_deny"},
                ]},
            ],
        },
    )
    return {"status": "pending", "expires_at": approval.expires_at}


@user_router.post("/runtime/cron/schedules/reconcile")
async def reconcile_runtime_cron_schedules(
    body: CronScheduleReconcileRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Accept a full metadata-only snapshot from one tenant runtime."""
    _require_feature()
    connector = _hosted_connector(request, db)
    session = _connector_runtime_session(db, connector)
    try:
        queued, synced = reconcile_schedules(
            db,
            user_id=str(connector.user_id),
            product=str(session.product),
            snapshots=body.schedules,
            manual_job_id=body.manual_job_id,
            manual_request_id=body.manual_request_id,
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        logger.exception(
            "hosted_cron_schedule_sync_failed runtime_id=%s",
            connector.runtime_id,
        )
        raise
    try:
        publish_occurrences(queued)
    except Exception:
        logger.exception("hosted_cron_manual_publish_failed count=%d", len(queued))
    return {"synced": synced, "queued_occurrence_ids": queued}


@user_router.post("/runtime/cron/occurrences/claim")
async def claim_runtime_cron_occurrence(request: Request, db: Session = Depends(get_db)):
    """Let the managed provider claim the one occurrence made ready for it."""
    _require_feature()
    if not cron_enabled():
        return {"occurrence": None}
    connector = _hosted_connector(request, db)
    session = _connector_runtime_session(db, connector)
    now = utcnow()
    occurrence = db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.user_id == connector.user_id,
        HostedClawCronOccurrence.product == session.product,
        HostedClawCronOccurrence.runtime_id == connector.runtime_id,
        HostedClawCronOccurrence.status == "ready",
    ).order_by(HostedClawCronOccurrence.fire_at.asc()).with_for_update(skip_locked=True).first()
    if occurrence is None:
        return {"occurrence": None}
    occurrence.status = "running"
    occurrence.provider_claimed_at = now
    occurrence.heartbeat_at = now
    occurrence.lease_expires_at = now + timedelta(minutes=5)
    db.commit()
    logger.info(
        "hosted_cron_provider_claimed occurrence_id=%s schedule_id=%s runtime_id=%s",
        occurrence.id, occurrence.schedule_id, occurrence.runtime_id,
    )
    return {
        "occurrence": {
            "occurrence_id": str(occurrence.id),
            "native_job_id": str(occurrence.native_job_id),
            "fire_at": occurrence.fire_at,
        }
    }


@user_router.post("/runtime/cron/occurrences/{occurrence_id}/heartbeat")
async def heartbeat_runtime_cron_occurrence(
    occurrence_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    connector = _hosted_connector(request, db)
    occurrence = db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.id == occurrence_id,
        HostedClawCronOccurrence.user_id == connector.user_id,
        HostedClawCronOccurrence.runtime_id == connector.runtime_id,
        HostedClawCronOccurrence.status == "running",
    ).first()
    if occurrence is None:
        raise HTTPException(status_code=404, detail="Running cron occurrence not found")
    occurrence.heartbeat_at = utcnow()
    occurrence.lease_expires_at = utcnow() + timedelta(minutes=5)
    db.commit()
    return {"status": "running"}


@user_router.post("/runtime/cron/occurrences/{occurrence_id}/complete")
async def complete_runtime_cron_occurrence(
    occurrence_id: str,
    body: CronOccurrenceProviderCompleteRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    connector = _hosted_connector(request, db)
    occurrence = db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.id == occurrence_id,
        HostedClawCronOccurrence.user_id == connector.user_id,
        HostedClawCronOccurrence.runtime_id == connector.runtime_id,
    ).with_for_update().first()
    if occurrence is None:
        raise HTTPException(status_code=404, detail="Cron occurrence not found")
    if occurrence.status in {"completed", "failed"}:
        return {"status": occurrence.status}
    if occurrence.status != "running" or occurrence.provider_claimed_at is None:
        raise HTTPException(status_code=409, detail="Cron occurrence was not claimed by Hermes")
    occurrence.status = body.status
    occurrence.error_code = body.error_code
    occurrence.completed_at = utcnow()
    if occurrence.delivery_status == "pending":
        occurrence.delivery_status = "skipped"
    db.commit()
    logger.info(
        "hosted_cron_provider_completed occurrence_id=%s status=%s delivery=%s",
        occurrence.id, occurrence.status, occurrence.delivery_status,
    )
    return {"status": occurrence.status}


@user_router.post("/runtime/cron/deliver")
async def deliver_runtime_cron_text(
    body: CronTextDeliveryRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Deliver one text result without exposing a Slack credential to a tenant."""
    connector = _hosted_connector(request, db)
    occurrence = db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.id == body.occurrence_id,
        HostedClawCronOccurrence.user_id == connector.user_id,
        HostedClawCronOccurrence.runtime_id == connector.runtime_id,
    ).with_for_update().first()
    if occurrence is None or occurrence.status != "running":
        raise HTTPException(status_code=404, detail="Running cron occurrence not found")
    if occurrence.delivery_attempted_at is not None:
        if occurrence.delivery_status == "delivered":
            return {"success": True, "duplicate": True}
        raise HTTPException(status_code=409, detail="Cron delivery was already attempted")
    occurrence.delivery_attempted_at = utcnow()
    link, installation = active_slack_context(db, str(connector.user_id))
    if link is None or installation is None:
        occurrence.delivery_status = "failed"
        occurrence.error_code = "slack_unlinked"
        db.commit()
        logger.warning("hosted_cron_delivery_failed occurrence_id=%s code=slack_unlinked", occurrence.id)
        raise HTTPException(status_code=409, detail="Slack is not linked")
    # Persist the attempt before making an external call. An ambiguous process
    # exit must not cause the same occurrence to post a second Slack message.
    db.commit()
    try:
        opened = await slack_api(
            installation,
            "conversations.open",
            {"users": str(link.slack_user_id)},
        )
        channel_id = str((opened.get("channel") or {}).get("id") or "")
        if not channel_id:
            raise RuntimeError("Slack did not return a DM channel")
        sent = await slack_api(
            installation,
            "chat.postMessage",
            {
                "channel": channel_id,
                # Hosted cron results are authored as standard Markdown. Slack's
                # top-level text field uses its proprietary ``mrkdwn`` dialect,
                # while markdown_text performs the standard-Markdown translation.
                "markdown_text": body.text[:12000],
                "client_msg_id": str(occurrence.id),
            },
        )
        occurrence.delivery_status = "delivered"
        occurrence.delivered_at = utcnow()
        db.commit()
        return {"success": True, "message_id": str(sent.get("ts") or "")}
    except Exception:
        occurrence.delivery_status = "failed"
        occurrence.error_code = "slack_delivery_failed"
        db.commit()
        logger.exception("hosted_cron_delivery_failed occurrence_id=%s code=slack_delivery_failed", occurrence.id)
        raise HTTPException(status_code=502, detail="Slack delivery failed")


@user_router.patch("/config", response_model=HostedConfigResponse)
async def update_config(body: HostedConfigUpdate, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    _require_feature()
    entitlement = require_entitlement(db, user_id)
    changes = body.model_dump(exclude_none=True)
    if "active_product" in changes and changes["active_product"] not in (entitlement.allowed_products or []):
        raise HTTPException(status_code=400, detail="Product is not included in this entitlement")
    if "model_alias" in changes and changes["model_alias"] not in (entitlement.allowed_model_aliases or []):
        raise HTTPException(status_code=400, detail="Model alias is not included in this entitlement")
    row = get_or_create_config(db, user_id)
    if any(getattr(row, key) != value for key, value in changes.items()):
        for key, value in changes.items():
            setattr(row, key, value)
        row.revision = int(row.revision) + 1
    db.commit()
    db.refresh(row)
    return _config_response(row)


@user_router.post("/slack/install", response_model=SlackInstallResponse)
async def start_install(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    _require_feature()
    require_entitlement(db, user_id)
    state = new_secret("hcstate_")
    db.add(HostedClawOAuthState(user_id=user_id, state_hash=sha256_token(state), expires_at=utcnow() + timedelta(minutes=10)))
    db.commit()
    return SlackInstallResponse(authorize_url=slack_oauth_url(state))


@user_router.post("/slack/link", response_model=LinkConsumeResponse)
async def consume_link(body: LinkConsumeRequest, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    _require_feature()
    require_entitlement(db, user_id)
    now = utcnow()
    token = db.query(HostedClawLinkToken).filter(
        HostedClawLinkToken.token_hash == sha256_token(body.token)
    ).with_for_update().first()
    if not one_time_record_is_valid(token, now=now):
        raise HTTPException(status_code=400, detail="Link is invalid, expired, or already used")
    existing_identity = _active_link_query(db, token.enterprise_id, token.team_id, token.slack_user_id).first()
    existing_user = db.query(HostedClawSlackLink).filter(
        HostedClawSlackLink.user_id == user_id, HostedClawSlackLink.unlinked_at.is_(None)
    ).first()
    if existing_identity or existing_user:
        raise HTTPException(status_code=409, detail="Slack identity or CPAAutomation user is already linked")
    link = HostedClawSlackLink(
        installation_id=token.installation_id,
        enterprise_id=token.enterprise_id,
        team_id=token.team_id,
        slack_user_id=token.slack_user_id,
        user_id=user_id,
    )
    token.consumed_at = now
    token.consumed_by_user_id = user_id
    db.add(link)
    db.commit()
    installation = db.get(HostedClawSlackInstallation, token.installation_id)
    return LinkConsumeResponse(workspace_name=installation.team_name if installation else None)


@user_router.post("/stop", response_model=HostedCommandResponse)
async def stop_runtime(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    require_entitlement(db, user_id)
    now = utcnow()
    db.query(HostedClawJob).filter(
        HostedClawJob.user_id == user_id,
        HostedClawJob.status.in_(["queued", "claimed", "running"]),
    ).update({HostedClawJob.status: "cancelled", HostedClawJob.completed_at: now}, synchronize_session=False)
    db.query(HostedClawProductSession).filter(HostedClawProductSession.user_id == user_id).update(
        {HostedClawProductSession.status: "stopped"}, synchronize_session=False
    )
    _interrupt_cron_runtime_work(db, user_id, now)
    db.query(ConnectorToken).filter(
        ConnectorToken.user_id == user_id,
        ConnectorToken.token_kind == "hosted_runtime",
        ConnectorToken.revoked_at.is_(None),
    ).update({ConnectorToken.revoked_at: now}, synchronize_session=False)
    db.commit()
    return HostedCommandResponse(message="Hosted Claw runtime was stopped. Active schedules remain enabled and can wake it again.")


@user_router.post("/session/new", response_model=HostedCommandResponse)
async def new_session(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    require_entitlement(db, user_id)
    config = get_or_create_config(db, user_id)
    row = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == user_id,
        HostedClawProductSession.product == config.active_product,
    ).first()
    if row:
        row.hermes_session_id = None
        row.status = "stopped"
    now = utcnow()
    db.query(HostedClawJob).filter(
        HostedClawJob.user_id == user_id,
        HostedClawJob.status.in_(["queued", "claimed", "running"]),
    ).update({HostedClawJob.status: "cancelled", HostedClawJob.completed_at: now}, synchronize_session=False)
    db.query(ConnectorToken).filter(
        ConnectorToken.user_id == user_id,
        ConnectorToken.token_kind == "hosted_runtime",
        ConnectorToken.revoked_at.is_(None),
    ).update({ConnectorToken.revoked_at: now}, synchronize_session=False)
    db.commit()
    return HostedCommandResponse(message="The next DM will start a fresh session. Retained history was not deleted.")


@user_router.post("/session/reset", response_model=HostedCommandResponse)
async def reset_product(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    require_entitlement(db, user_id)
    config = get_or_create_config(db, user_id)
    session = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == user_id,
        HostedClawProductSession.product == config.active_product,
    ).first()
    if session:
        session.status = "deleting"
        db.query(ConnectorToken).filter(
            ConnectorToken.user_id == user_id,
            ConnectorToken.token_kind == "hosted_runtime",
            ConnectorToken.runtime_id == session.runtime_id,
        ).delete(synchronize_session=False)
    db.commit()
    jobs = db.query(HostedClawJob.id).filter(
        HostedClawJob.user_id == user_id,
        HostedClawJob.product == config.active_product,
    ).subquery()
    artifact_objects = [
        str(value)
        for (value,) in db.query(HostedClawArtifact.gcs_object_name).filter(
            HostedClawArtifact.job_id.in_(jobs)
        ).all()
    ]
    try:
        await asyncio.to_thread(_delete_artifact_objects, artifact_objects)
    except HostedClawUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    db.query(HostedClawArtifact).filter(HostedClawArtifact.job_id.in_(jobs)).delete(synchronize_session=False)
    db.query(HostedClawJob).filter(
        HostedClawJob.user_id == user_id,
        HostedClawJob.product == config.active_product,
    ).delete(synchronize_session=False)
    db.query(HostedClawChannelSession).filter(
        HostedClawChannelSession.user_id == user_id,
        HostedClawChannelSession.product == config.active_product,
    ).delete(synchronize_session=False)
    schedule_ids = db.query(HostedClawCronSchedule.id).filter(
        HostedClawCronSchedule.user_id == user_id,
        HostedClawCronSchedule.product == config.active_product,
    )
    db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.schedule_id.in_(schedule_ids)
    ).delete(synchronize_session=False)
    db.query(HostedClawCronSchedule).filter(
        HostedClawCronSchedule.user_id == user_id,
        HostedClawCronSchedule.product == config.active_product,
    ).delete(synchronize_session=False)
    db.commit()
    return HostedCommandResponse(message="The active product history, memory, files, and workspace are being reset.")


@user_router.delete("/slack/link", response_model=HostedCommandResponse)
async def unlink(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    now = utcnow()
    db.query(HostedClawSlackLink).filter(
        HostedClawSlackLink.user_id == user_id, HostedClawSlackLink.unlinked_at.is_(None)
    ).update({HostedClawSlackLink.unlinked_at: now}, synchronize_session=False)
    db.query(HostedClawJob).filter(
        HostedClawJob.user_id == user_id,
        HostedClawJob.status.in_(["queued", "claimed", "running"]),
    ).update({HostedClawJob.status: "cancelled", HostedClawJob.completed_at: now}, synchronize_session=False)
    db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == user_id
    ).update({HostedClawProductSession.status: "stopped"}, synchronize_session=False)
    _interrupt_cron_runtime_work(db, user_id, now)
    db.query(ConnectorToken).filter(
        ConnectorToken.user_id == user_id,
        ConnectorToken.token_kind == "hosted_runtime",
        ConnectorToken.revoked_at.is_(None),
    ).update({ConnectorToken.revoked_at: now}, synchronize_session=False)
    db.commit()
    return HostedCommandResponse(message="Slack was unlinked. Hosted data was retained.")


@user_router.delete("", response_model=HostedCommandResponse)
async def delete_hosted(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    artifact_objects = [
        str(value)
        for (value,) in db.query(HostedClawArtifact.gcs_object_name).filter(
            HostedClawArtifact.user_id == user_id,
            HostedClawArtifact.deleted_at.is_(None),
        ).all()
    ]
    db.query(ConnectorToken).filter(
        ConnectorToken.user_id == user_id,
        ConnectorToken.token_kind == "hosted_runtime",
    ).delete(synchronize_session=False)
    db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == user_id
    ).update({HostedClawProductSession.status: "deleting"}, synchronize_session=False)
    db.commit()
    try:
        await asyncio.to_thread(_delete_artifact_objects, artifact_objects)
    except HostedClawUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    for model in (
        HostedClawCronOccurrence,
        HostedClawCronSchedule,
        HostedClawJob,
        HostedClawChannelSession,
        HostedClawArtifact,
        HostedClawConfig,
        HostedClawUsageSummary,
    ):
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)
    db.query(HostedClawLinkToken).filter(
        HostedClawLinkToken.consumed_by_user_id == user_id
    ).delete(synchronize_session=False)
    db.query(HostedClawOAuthState).filter(
        HostedClawOAuthState.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(HostedClawSlackLink).filter(
        HostedClawSlackLink.user_id == user_id
    ).delete(synchronize_session=False)
    db.commit()
    return HostedCommandResponse(message="Hosted Claw runtime state, conversations, memory, and active artifacts were deleted. Expiring backups may retain encrypted blocks for up to 14 days.")


@slack_router.get("/oauth/callback")
async def slack_oauth_callback(code: str, state: str, db: Session = Depends(get_db)):
    _require_feature()
    now = utcnow()
    state_row = db.query(HostedClawOAuthState).filter(
        HostedClawOAuthState.state_hash == sha256_token(state)
    ).with_for_update().first()
    if not one_time_record_is_valid(state_row, now=now):
        raise HTTPException(status_code=400, detail="OAuth state is invalid, expired, or already used")
    result = await exchange_slack_code(code)
    team = result.get("team") or {}
    enterprise = result.get("enterprise") or {}
    enterprise_id = enterprise.get("id") or None
    team_id = team.get("id")
    installer_slack_user_id = (result.get("authed_user") or {}).get("id")
    if not team_id or not result.get("bot_user_id") or not installer_slack_user_id:
        raise HTTPException(status_code=400, detail="Slack OAuth response did not identify a workspace")
    encrypted = KmsEnvelope().encrypt(
        result["access_token"].encode("utf-8"),
        aad=f"slack-installation:{team_id}".encode(),
    )
    installation = _installation_query(db, enterprise_id, team_id).first()
    if installation is None:
        installation = HostedClawSlackInstallation(enterprise_id=enterprise_id, team_id=team_id)
        db.add(installation)
    installation.team_name = team.get("name")
    installation.bot_user_id = result["bot_user_id"]
    installation.bot_token_ciphertext = encrypted.ciphertext
    installation.kms_key_version = encrypted.key_version
    installation.scopes = [scope for scope in str(result.get("scope") or "").split(",") if scope]
    installation.status = "active"
    installation.revoked_at = None
    installation.installed_by_slack_user_id = installer_slack_user_id
    db.flush()
    try:
        _link_oauth_installer(
            db,
            installation=installation,
            user_id=str(state_row.user_id),
            enterprise_id=enterprise_id,
            team_id=team_id,
            slack_user_id=installer_slack_user_id,
        )
    except HTTPException:
        db.rollback()
        raise
    state_row.consumed_at = now
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Slack identity or CPAAutomation user is already linked") from exc
    return RedirectResponse(f"{frontend_base_url()}/dashboard/activation?slack_linked=1", status_code=303)


def _create_link_message(db: Session, installation: HostedClawSlackInstallation, enterprise: str | None, team: str, slack_user: str, channel: str) -> dict[str, str]:
    raw_token, url = new_link_url()
    db.add(
        HostedClawLinkToken(
            installation_id=installation.id,
            enterprise_id=enterprise,
            team_id=team,
            slack_user_id=slack_user,
            token_hash=sha256_token(raw_token),
            expires_at=utcnow() + timedelta(minutes=10),
        )
    )
    db.commit()
    return {"channel": channel, "text": f"Link your CPAAutomation account within 10 minutes: {url}"}


@slack_router.post("/events")
async def slack_events(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    _require_feature()
    raw = await request.body()
    _slack_verified(raw, request)
    try:
        body = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if body.get("type") == "url_verification":
        return {"challenge": body.get("challenge")}
    event = body.get("event") or {}
    event_type = event.get("type")
    enterprise = body.get("enterprise_id") or ((body.get("authorizations") or [{}])[0].get("enterprise_id"))
    team = body.get("team_id") or event.get("team")
    if event_type in {"app_uninstalled", "tokens_revoked"}:
        if team:
            installation = _installation_query(db, enterprise, team).first()
            if installation:
                installation.status = "revoked"
                installation.revoked_at = utcnow()
                db.commit()
        return {"ok": True}
    if not _supported_slack_message_event(event):
        return {"ok": True}
    slack_user = event.get("user")
    enterprise, team, slack_user = _identity(enterprise, team, slack_user)
    installation = _installation_query(db, enterprise, team).first()
    if installation is None:
        return {"ok": True}
    link = _active_link_query(db, enterprise, team, slack_user).first()
    if link is None:
        message = _create_link_message(db, installation, enterprise, team, slack_user, str(event.get("channel") or ""))
        if _is_channel_mention(event):
            background_tasks.add_task(
                _send_channel_link,
                installation,
                slack_user=slack_user,
                channel=str(event.get("channel") or ""),
                thread_ts=str(event.get("thread_ts") or event.get("ts") or ""),
                link_text=message["text"],
            )
        else:
            background_tasks.add_task(slack_api, installation, "chat.postMessage", message)
        return {"ok": True}
    entitlement = get_or_create_entitlement(db, str(link.user_id))
    if not entitlement or not entitlement.enabled or entitlement.revoked_at is not None:
        background_tasks.add_task(
            slack_api,
            installation,
            "chat.postMessage",
            _event_reply(event, "Hosted Claw is not enabled for this CPAAutomation account."),
        )
        return {"ok": True}
    if not BillingService(db).check_limit(str(link.user_id), "token", 1):
        background_tasks.add_task(
            slack_api,
            installation,
            "chat.postMessage",
            _event_reply(event, "Your token allowance is exhausted. Upgrade to continue using Hosted Claw."),
        )
        return {"ok": True}
    files = event.get("files") or []
    if len(files) > 10:
        background_tasks.add_task(
            slack_api,
            installation,
            "chat.postMessage",
            _event_reply(event, "A message can include at most 10 attachments."),
        )
        return {"ok": True}
    try:
        for item in files:
            if not item.get("id") or not _valid_slack_file_url(str(item.get("url_private_download") or "")):
                raise HTTPException(status_code=400, detail="Slack attachment metadata is invalid")
            validate_attachment(str(item.get("name") or ""), str(item.get("mimetype") or "application/octet-stream"), int(item.get("size") or 0))
    except HTTPException as exc:
        background_tasks.add_task(
            slack_api,
            installation,
            "chat.postMessage",
            _event_reply(event, str(exc.detail)),
        )
        return {"ok": True}
    config = get_or_create_config(db, str(link.user_id))
    prompt = (
        _channel_prompt(event.get("text"), str(installation.bot_user_id))
        if _is_channel_mention(event)
        else str(event.get("text") or "")
    )
    if _is_channel_mention(event) and not prompt and not files:
        background_tasks.add_task(
            slack_api,
            installation,
            "chat.postMessage",
            _event_reply(event, "Mention me with a question or attach a supported file."),
        )
        return {"ok": True}
    event_id = str(body.get("event_id") or f"slack:{team}:{event.get('client_msg_id') or event.get('ts')}")
    payload = {
        "text": prompt,
        "channel_id": str(event.get("channel") or ""),
        "slack_ts": str(event.get("ts") or ""),
        "thread_ts": str(event.get("thread_ts") or event.get("ts") or ""),
        "source": "channel_mention" if _is_channel_mention(event) else "slack_dm",
        "team_id": team,
        "files": [
            {"id": item.get("id"), "name": item.get("name"), "mimetype": item.get("mimetype"), "size": item.get("size"), "url_private_download": item.get("url_private_download")}
            for item in files
        ],
    }
    encrypted = KmsEnvelope().encrypt(json.dumps(payload, separators=(",", ":")).encode("utf-8"), aad=f"hosted-job:{event_id}".encode())
    job = HostedClawJob(
        event_id=event_id,
        user_id=link.user_id,
        slack_link_id=link.id,
        product=config.active_product,
        payload_ciphertext=encrypted.ciphertext,
        kms_key_version=encrypted.key_version,
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"ok": True, "duplicate": True}
    publish_job(str(job.id))
    return {"ok": True}


def _slash_text(command: str, linked: bool, runtime_status: str = "stopped") -> str:
    if command == "help":
        return "Commands: /claw help, /claw status, /claw new, /claw stop, /claw unlink"
    if not linked:
        return "Your Slack identity is not linked. Send the app a DM to receive a 10-minute link."
    if command == "status":
        return f"Hosted Claw is linked. Runtime status: {runtime_status}. Product and model are managed in the dashboard."
    if command == "stop":
        return "Hosted Claw runtime was stopped. Active schedules remain enabled and can wake it again."
    if command == "new":
        return "The next DM will start a fresh personal session. Start a new channel thread for fresh channel context."
    return "Command accepted."


@slack_router.post("/commands")
async def slack_commands(request: Request, db: Session = Depends(get_db)):
    _require_feature()
    raw = await request.body()
    _slack_verified(raw, request)
    form = urllib.parse.parse_qs(raw.decode("utf-8"), keep_blank_values=True)
    enterprise, team, slack_user = _identity((form.get("enterprise_id") or [None])[0], (form.get("team_id") or [""])[0], (form.get("user_id") or [""])[0])
    action = ((form.get("text") or ["help"])[0].strip().lower().split() or ["help"])[0]
    if action not in {"help", "status", "new", "stop", "unlink"}:
        action = "help"
    link = _active_link_query(db, enterprise, team, slack_user).first()
    runtime_status = "stopped"
    if link:
        config = get_or_create_config(db, str(link.user_id))
        session = db.query(HostedClawProductSession).filter(
            HostedClawProductSession.user_id == link.user_id,
            HostedClawProductSession.product == config.active_product,
        ).first()
        runtime_status = str(session.status) if session else "stopped"
        if action == "new":
            if session:
                session.hermes_session_id = None
                session.status = "stopped"
            db.query(HostedClawJob).filter(
                HostedClawJob.user_id == link.user_id,
                HostedClawJob.status.in_(["queued", "claimed", "running"]),
            ).update({HostedClawJob.status: "cancelled", HostedClawJob.completed_at: utcnow()}, synchronize_session=False)
            db.query(ConnectorToken).filter(
                ConnectorToken.user_id == link.user_id,
                ConnectorToken.token_kind == "hosted_runtime",
                ConnectorToken.revoked_at.is_(None),
            ).update({ConnectorToken.revoked_at: utcnow()}, synchronize_session=False)
        elif action == "stop":
            now = utcnow()
            db.query(HostedClawJob).filter(HostedClawJob.user_id == link.user_id, HostedClawJob.status.in_(["queued", "claimed", "running"])).update({HostedClawJob.status: "cancelled", HostedClawJob.completed_at: utcnow()}, synchronize_session=False)
            db.query(HostedClawProductSession).filter(HostedClawProductSession.user_id == link.user_id).update({HostedClawProductSession.status: "stopped"}, synchronize_session=False)
            _interrupt_cron_runtime_work(db, str(link.user_id), now)
            db.query(ConnectorToken).filter(
                ConnectorToken.user_id == link.user_id,
                ConnectorToken.token_kind == "hosted_runtime",
                ConnectorToken.revoked_at.is_(None),
            ).update({ConnectorToken.revoked_at: utcnow()}, synchronize_session=False)
        elif action == "unlink":
            now = utcnow()
            link.unlinked_at = now
            db.query(HostedClawJob).filter(
                HostedClawJob.user_id == link.user_id,
                HostedClawJob.status.in_(["queued", "claimed", "running"]),
            ).update({HostedClawJob.status: "cancelled", HostedClawJob.completed_at: utcnow()}, synchronize_session=False)
            db.query(HostedClawProductSession).filter(
                HostedClawProductSession.user_id == link.user_id
            ).update({HostedClawProductSession.status: "stopped"}, synchronize_session=False)
            _interrupt_cron_runtime_work(db, str(link.user_id), now)
            db.query(ConnectorToken).filter(
                ConnectorToken.user_id == link.user_id,
                ConnectorToken.token_kind == "hosted_runtime",
                ConnectorToken.revoked_at.is_(None),
            ).update({ConnectorToken.revoked_at: utcnow()}, synchronize_session=False)
        db.commit()
    return {"response_type": "ephemeral", "text": _slash_text(action, link is not None, runtime_status)}


@slack_router.post("/interactions")
async def slack_interactions(request: Request, db: Session = Depends(get_db)):
    _require_feature()
    raw = await request.body()
    _slack_verified(raw, request)
    form = urllib.parse.parse_qs(raw.decode("utf-8"))
    try:
        payload = json.loads((form.get("payload") or [""])[0])
        action = (payload.get("actions") or [])[0]
        decision, token = str(action.get("value") or "").split(":", 1)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Slack interaction")
    approval = db.query(HostedClawApproval).filter(
        HostedClawApproval.interaction_token_hash == sha256_token(token)
    ).with_for_update().first()
    if approval is None or approval.status != "pending" or approval.expires_at <= utcnow():
        return {"response_type": "ephemeral", "replace_original": True, "text": "This approval has expired or was already used."}
    interaction_team = str((payload.get("team") or {}).get("id") or "")
    interaction_enterprise = (payload.get("enterprise") or {}).get("id") or None
    link_query = db.query(HostedClawSlackLink).filter(
        HostedClawSlackLink.user_id == approval.user_id,
        HostedClawSlackLink.slack_user_id == (payload.get("user") or {}).get("id"),
        HostedClawSlackLink.team_id == interaction_team,
        HostedClawSlackLink.unlinked_at.is_(None),
    )
    link_query = link_query.filter(
        HostedClawSlackLink.enterprise_id == interaction_enterprise
        if interaction_enterprise is not None
        else HostedClawSlackLink.enterprise_id.is_(None)
    )
    link = link_query.first()
    if link is None:
        raise HTTPException(status_code=403, detail="Only the linked initiating user can decide")
    approval.status = "approved" if decision == "confirm" else "denied"
    approval.decided_at = utcnow()
    db.commit()
    logger.info(
        "hosted_approval_decided approval_id=%s action_id=%s decision=%s",
        approval.id, approval.action_id, approval.status,
    )
    return {"response_type": "ephemeral", "replace_original": True, "text": "Approved." if decision == "confirm" else "Denied."}


@internal_router.post("/jobs/claim", response_model=WorkerClaimResponse)
async def claim_job(body: WorkerClaimRequest, db: Session = Depends(get_db)):
    _require_feature()
    now = utcnow()
    # Pub/Sub redelivery and worker death are safe: expired claims re-enter the
    # FIFO queue, while per-user serialization below prevents overlap.
    db.query(HostedClawJob).filter(
        HostedClawJob.status.in_(["claimed", "running"]),
        HostedClawJob.lease_expires_at < now,
    ).update(
        {HostedClawJob.status: "queued", HostedClawJob.worker_id: None, HostedClawJob.claimed_at: None},
        synchronize_session=False,
    )
    lease = db.get(HostedClawWorkerLease, body.worker_id)
    if lease is None:
        lease = HostedClawWorkerLease(worker_id=body.worker_id, hostname=body.hostname)
        db.add(lease)
    lease.hostname = body.hostname
    lease.capacity = body.capacity
    lease.active_turns = body.active_turns
    lease.disk_percent = body.disk_percent
    lease.status = "degraded" if body.disk_percent is not None and body.disk_percent >= 80 else "healthy"
    lease.last_heartbeat_at = now
    lease.lease_expires_at = now + timedelta(seconds=90)
    if body.active_turns >= min(body.capacity, 10):
        db.commit()
        return WorkerClaimResponse(job=None)
    busy_cron_users = db.query(HostedClawCronOccurrence.user_id).filter(
        HostedClawCronOccurrence.status.in_(["claimed", "ready", "running"])
    )
    busy_users = db.query(HostedClawJob.user_id).filter(HostedClawJob.status.in_(["claimed", "running"]))
    deleting_users = db.query(HostedClawProductSession.user_id).filter(
        HostedClawProductSession.status == "deleting"
    )
    job = db.query(HostedClawJob).filter(
        HostedClawJob.status == "queued",
        HostedClawJob.available_at <= now,
        HostedClawJob.user_id.notin_(busy_users),
        HostedClawJob.user_id.notin_(busy_cron_users),
        HostedClawJob.user_id.notin_(deleting_users),
    ).order_by(HostedClawJob.created_at.asc()).with_for_update(skip_locked=True).first()
    if job is None:
        db.commit()
        return WorkerClaimResponse(job=None)
    _lock_hosted_user_work(db, str(job.user_id))
    if _hosted_user_has_active_work(db, str(job.user_id)):
        db.commit()
        return WorkerClaimResponse(job=None)
    job.status = "claimed"
    job.worker_id = body.worker_id
    job.claimed_at = now
    job.lease_expires_at = now + timedelta(minutes=5)
    config = get_or_create_config(db, str(job.user_id))
    entitlement = require_entitlement(db, str(job.user_id))
    if job.product not in (entitlement.allowed_products or []) or config.model_alias not in (
        entitlement.allowed_model_aliases or []
    ):
        job.status = "failed"
        job.error_code = "entitlement_changed"
        job.completed_at = now
        db.commit()
        return WorkerClaimResponse(job=None)
    period = date.today().replace(day=1)
    monthly_budget = Decimal("0")
    remaining_budget = Decimal("0")
    if not BillingService(db).check_limit(str(job.user_id), "token", 1):
        job.status = "failed"
        job.error_code = "billing_limit_exceeded"
        job.completed_at = now
        db.commit()
        try:
            link = db.get(HostedClawSlackLink, job.slack_link_id)
            installation = db.get(HostedClawSlackInstallation, link.installation_id) if link else None
            notice_payload = json.loads(KmsEnvelope().decrypt(
                job.payload_ciphertext,
                aad=f"hosted-job:{job.event_id}".encode(),
                key_version=str(job.kms_key_version),
            ))
            if installation is not None:
                await slack_api(
                    installation,
                    "chat.postMessage",
                    {
                        "channel": notice_payload["channel_id"],
                        "thread_ts": notice_payload.get("thread_ts"),
                        "text": "Your token allowance is exhausted. Upgrade to continue using Hosted Claw.",
                    },
                )
        except Exception:
            logger.warning("Could not deliver hosted token-limit notice job_id=%s", job.id)
        return WorkerClaimResponse(job=None)
    session = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == job.user_id,
        HostedClawProductSession.product == job.product,
    ).first()
    runtime_start_expected = _runtime_start_expected(session, body.worker_id, config.revision)
    if session is None:
        session = HostedClawProductSession(
            user_id=job.user_id,
            product=job.product,
            runtime_id=f"hcr_{uuid.uuid4().hex}",
        )
        db.add(session)
        db.flush()
    elif not session.runtime_id:
        session.runtime_id = f"hcr_{uuid.uuid4().hex}"
    session.worker_id = body.worker_id
    session.status = "starting" if runtime_start_expected else "ready"
    db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == job.user_id,
        HostedClawProductSession.product != job.product,
        HostedClawProductSession.status.in_(["starting", "ready", "running"]),
    ).update({HostedClawProductSession.status: "stopped"}, synchronize_session=False)
    plaintext = KmsEnvelope().decrypt(job.payload_ciphertext, aad=f"hosted-job:{job.event_id}".encode(), key_version=str(job.kms_key_version))
    payload = json.loads(plaintext)
    channel_session = _channel_session_for_job(db, job, payload)
    conversation_session_id = (
        str(channel_session.hermes_session_id)
        if channel_session is not None
        else _ensure_hermes_session_id(session)
    )
    payload = _register_claim_attachments(db, job, payload)
    result = WorkerJobResponse(
        job_id=str(job.id), queued_at=job.created_at, payload=payload, user_id=str(job.user_id), product=str(job.product),
        config=_config_response(config), session_id=conversation_session_id, runtime_id=str(session.runtime_id),
        monthly_budget_usd=monthly_budget,
        remaining_budget_usd=remaining_budget,
        budget_period=period,
    )
    db.commit()
    return WorkerClaimResponse(job=result)


@internal_router.post("/cron/occurrences/claim", response_model=WorkerCronClaimResponse)
async def claim_cron_occurrence(body: WorkerClaimRequest, db: Session = Depends(get_db)):
    """Claim scheduled work through the same token-quota admission path as a turn."""
    _require_feature()
    if not cron_enabled():
        return WorkerCronClaimResponse(occurrence=None)
    now = utcnow()
    reclaimable, unknown = recover_expired_occurrences(db, now)
    lease = db.get(HostedClawWorkerLease, body.worker_id)
    if lease is None:
        lease = HostedClawWorkerLease(worker_id=body.worker_id, hostname=body.hostname)
        db.add(lease)
    lease.hostname = body.hostname
    lease.capacity = body.capacity
    lease.active_turns = body.active_turns
    lease.disk_percent = body.disk_percent
    lease.status = "degraded" if body.disk_percent is not None and body.disk_percent >= 80 else "healthy"
    lease.last_heartbeat_at = now
    lease.lease_expires_at = now + timedelta(seconds=90)
    if body.active_turns >= min(body.capacity, 10):
        db.commit()
        return WorkerCronClaimResponse(occurrence=None)

    busy_job_users = db.query(HostedClawJob.user_id).filter(
        HostedClawJob.status.in_(["claimed", "running"])
    )
    busy_cron_users = db.query(HostedClawCronOccurrence.user_id).filter(
        HostedClawCronOccurrence.status.in_(["claimed", "ready", "running"])
    )
    deleting_users = db.query(HostedClawProductSession.user_id).filter(
        HostedClawProductSession.status == "deleting"
    )
    linked_users = db.query(HostedClawSlackLink.user_id).join(
        HostedClawSlackInstallation,
        HostedClawSlackInstallation.id == HostedClawSlackLink.installation_id,
    ).filter(
        HostedClawSlackLink.unlinked_at.is_(None),
        HostedClawSlackInstallation.status == "active",
    )
    occurrence = db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.status == "pending",
        HostedClawCronOccurrence.fire_at <= now,
        HostedClawCronOccurrence.user_id.notin_(busy_job_users),
        HostedClawCronOccurrence.user_id.notin_(busy_cron_users),
        HostedClawCronOccurrence.user_id.notin_(deleting_users),
        HostedClawCronOccurrence.user_id.in_(linked_users),
    ).order_by(HostedClawCronOccurrence.fire_at.asc()).with_for_update(skip_locked=True).first()
    if occurrence is None:
        db.commit()
        return WorkerCronClaimResponse(occurrence=None)

    _lock_hosted_user_work(db, str(occurrence.user_id))
    if _hosted_user_has_active_work(db, str(occurrence.user_id)):
        db.commit()
        return WorkerCronClaimResponse(occurrence=None)

    occurrence.status = "claimed"
    occurrence.worker_id = body.worker_id
    occurrence.claimed_at = now
    occurrence.heartbeat_at = now
    occurrence.lease_expires_at = now + timedelta(minutes=5)
    config = get_or_create_config(db, str(occurrence.user_id))
    entitlement = db.query(HostedClawEntitlement).filter(
        HostedClawEntitlement.user_id == occurrence.user_id,
        HostedClawEntitlement.enabled.is_(True),
        HostedClawEntitlement.revoked_at.is_(None),
    ).first()
    if (
        entitlement is None
        or occurrence.product not in (entitlement.allowed_products or [])
        or config.model_alias not in (entitlement.allowed_model_aliases or [])
    ):
        occurrence.status = "rejected"
        occurrence.error_code = "entitlement_changed"
        occurrence.completed_at = now
        db.commit()
        logger.warning("hosted_cron_rejected occurrence_id=%s code=entitlement_changed", occurrence.id)
        return WorkerCronClaimResponse(occurrence=None)

    period = date.today().replace(day=1)
    monthly_budget = Decimal("0")
    remaining_budget = Decimal("0")
    if not BillingService(db).check_limit(str(occurrence.user_id), "token", 1):
        occurrence.status = "rejected"
        occurrence.error_code = "billing_limit_exceeded"
        occurrence.completed_at = now
        db.commit()
        logger.warning("hosted_cron_rejected occurrence_id=%s code=billing_limit_exceeded", occurrence.id)
        link, installation = active_slack_context(db, str(occurrence.user_id))
        if link and installation:
            try:
                opened = await slack_api(installation, "conversations.open", {"users": str(link.slack_user_id)})
                channel = str((opened.get("channel") or {}).get("id") or "")
                if channel:
                    await slack_api(
                        installation,
                        "chat.postMessage",
                        {"channel": channel, "text": "Your token allowance is exhausted; this scheduled job was not run."},
                    )
            except Exception:
                logger.warning("hosted_cron_rejection_delivery_failed occurrence_id=%s", occurrence.id)
        return WorkerCronClaimResponse(occurrence=None)

    session = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == occurrence.user_id,
        HostedClawProductSession.product == occurrence.product,
    ).first()
    runtime_start_expected = _runtime_start_expected(session, body.worker_id, config.revision)
    if session is None:
        session = HostedClawProductSession(
            user_id=occurrence.user_id,
            product=occurrence.product,
            runtime_id=f"hcr_{uuid.uuid4().hex}",
        )
        db.add(session)
        db.flush()
    elif not session.runtime_id:
        session.runtime_id = f"hcr_{uuid.uuid4().hex}"
    session.worker_id = body.worker_id
    session.status = "starting" if runtime_start_expected else "ready"
    occurrence.runtime_id = session.runtime_id
    db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == occurrence.user_id,
        HostedClawProductSession.product != occurrence.product,
        HostedClawProductSession.status.in_(["starting", "ready", "running"]),
    ).update({HostedClawProductSession.status: "stopped"}, synchronize_session=False)
    result = WorkerCronOccurrenceResponse(
        occurrence_id=str(occurrence.id),
        schedule_id=str(occurrence.schedule_id),
        native_job_id=str(occurrence.native_job_id),
        fire_at=occurrence.fire_at,
        queued_at=occurrence.created_at,
        user_id=str(occurrence.user_id),
        product=str(occurrence.product),
        config=_config_response(config, product=str(occurrence.product)),
        runtime_id=str(session.runtime_id),
        monthly_budget_usd=monthly_budget,
        remaining_budget_usd=remaining_budget,
        budget_period=period,
    )
    db.commit()
    if reclaimable or unknown:
        logger.info("hosted_cron_recovery reclaimable=%d unknown=%d", reclaimable, unknown)
    return WorkerCronClaimResponse(occurrence=result)


@internal_router.post("/cron/occurrences/{occurrence_id}/started")
async def mark_cron_occurrence_ready(occurrence_id: str, worker_id: str, db: Session = Depends(get_db)):
    occurrence = db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.id == occurrence_id,
        HostedClawCronOccurrence.worker_id == worker_id,
        HostedClawCronOccurrence.status == "claimed",
    ).with_for_update().first()
    if occurrence is None:
        raise HTTPException(status_code=404, detail="Claimed cron occurrence not found")
    now = utcnow()
    occurrence.status = "ready"
    occurrence.ready_at = now
    occurrence.heartbeat_at = now
    occurrence.lease_expires_at = now + timedelta(minutes=5)
    db.query(HostedClawProductSession).filter(
        HostedClawProductSession.runtime_id == occurrence.runtime_id,
        HostedClawProductSession.worker_id == worker_id,
    ).update({HostedClawProductSession.status: "running"}, synchronize_session=False)
    db.commit()
    logger.info(
        "hosted_cron_runtime_ready occurrence_id=%s runtime_id=%s due_to_ready_seconds=%.3f",
        occurrence.id,
        occurrence.runtime_id,
        max(0.0, (now - _aware_datetime(occurrence.fire_at)).total_seconds()),
    )
    return {"status": "ready"}


@internal_router.get("/cron/occurrences/{occurrence_id}/state")
async def cron_occurrence_state(occurrence_id: str, worker_id: str, db: Session = Depends(get_db)):
    occurrence = db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.id == occurrence_id,
        HostedClawCronOccurrence.worker_id == worker_id,
    ).first()
    if occurrence is None:
        raise HTTPException(status_code=404, detail="Claimed cron occurrence not found")
    if occurrence.status in {"claimed", "ready", "running"}:
        occurrence.heartbeat_at = utcnow()
        occurrence.lease_expires_at = utcnow() + timedelta(minutes=5)
        db.commit()
    return {
        "status": occurrence.status,
        "provider_claimed": occurrence.provider_claimed_at is not None,
        "error_code": occurrence.error_code,
        "delivery_status": occurrence.delivery_status,
    }


@internal_router.post("/cron/occurrences/{occurrence_id}/complete")
async def complete_cron_occurrence_worker(
    occurrence_id: str,
    body: WorkerCronCompleteRequest,
    worker_id: str,
    db: Session = Depends(get_db),
):
    occurrence = db.query(HostedClawCronOccurrence).filter(
        HostedClawCronOccurrence.id == occurrence_id,
        HostedClawCronOccurrence.worker_id == worker_id,
    ).with_for_update().first()
    if occurrence is None:
        raise HTTPException(status_code=404, detail="Claimed cron occurrence not found")
    now = utcnow()
    if body.status == "requeue":
        if occurrence.provider_claimed_at is not None or occurrence.status == "running":
            occurrence.status = "unknown"
            occurrence.error_code = body.error_code or "ambiguous_runtime_exit"
            occurrence.completed_at = now
        elif occurrence.status not in {"completed", "failed", "unknown", "cancelled", "rejected"}:
            occurrence.status = "pending"
            occurrence.worker_id = None
            occurrence.runtime_id = None
            occurrence.claimed_at = None
            occurrence.ready_at = None
            occurrence.lease_expires_at = None
    elif occurrence.status not in {"completed", "failed", "unknown"}:
        occurrence.status = body.status
        occurrence.error_code = body.error_code
        occurrence.completed_at = now

    if occurrence.usage_accounted_at is None and body.status != "requeue":
        period = date.today().replace(day=1)
        usage = db.query(HostedClawUsageSummary).filter(
            HostedClawUsageSummary.user_id == occurrence.user_id,
            HostedClawUsageSummary.period_start == period,
        ).first()
        if usage is None:
            usage = HostedClawUsageSummary(user_id=occurrence.user_id, period_start=period)
            db.add(usage)
        usage.prompt_tokens = int(usage.prompt_tokens or 0) + body.prompt_tokens
        usage.completion_tokens = int(usage.completion_tokens or 0) + body.completion_tokens
        usage.cost_usd = Decimal(usage.cost_usd or 0) + body.cost_usd
        usage.turns = int(usage.turns or 0) + 1
        occurrence.cost_usd = body.cost_usd
        occurrence.usage_accounted_at = now
        BillingService(db).record_usage(
            user_id=str(occurrence.user_id),
            product="hosted_claw",
            source="hosted_claw_cron",
            unit="token",
            quantity=int(body.prompt_tokens) + int(body.completion_tokens),
            operation_id=str(occurrence.id),
            token_details={
                "prompt_tokens": body.prompt_tokens,
                "output_tokens": body.completion_tokens,
                "total_tokens": int(body.prompt_tokens) + int(body.completion_tokens),
            },
            commit=False,
        )
    session = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.runtime_id == occurrence.runtime_id,
        HostedClawProductSession.worker_id == worker_id,
    ).first()
    if session:
        session.status = "stopped" if occurrence.status == "unknown" else "ready"
        session.last_activity_at = now
        if body.applied_config_revision is not None:
            session.applied_config_revision = body.applied_config_revision
    db.commit()
    return {"status": occurrence.status}


@internal_router.post("/cron/dispatch-due")
async def dispatch_due_cron(db: Session = Depends(get_db)):
    occurrence_ids = dispatch_due_occurrences(db)
    return {"enabled": cron_enabled(), "registered": len(occurrence_ids)}


@internal_router.post("/deletions/claim")
async def claim_deletion(worker_id: str, db: Session = Depends(get_db)):
    active_workers = db.query(HostedClawWorkerLease.worker_id).filter(
        HostedClawWorkerLease.lease_expires_at > utcnow()
    )
    row = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.status == "deleting",
        or_(
            HostedClawProductSession.worker_id == worker_id,
            HostedClawProductSession.worker_id.is_(None),
            HostedClawProductSession.worker_id.notin_(active_workers),
        ),
    ).order_by(HostedClawProductSession.updated_at.asc()).with_for_update(skip_locked=True).first()
    if row is None:
        return {"deletion": None}
    row.worker_id = worker_id
    db.commit()
    return {"deletion": {"runtime_id": row.runtime_id, "user_id": row.user_id, "product": row.product}}


@internal_router.post("/stops/claim")
async def claim_stop(worker_id: str, db: Session = Depends(get_db)):
    active_workers = db.query(HostedClawWorkerLease.worker_id).filter(
        HostedClawWorkerLease.lease_expires_at > utcnow()
    )
    row = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.status == "stopped",
        HostedClawProductSession.runtime_id.isnot(None),
        or_(
            HostedClawProductSession.worker_id == worker_id,
            HostedClawProductSession.worker_id.notin_(active_workers),
        ),
    ).order_by(HostedClawProductSession.updated_at.asc()).with_for_update(skip_locked=True).first()
    if row is None:
        return {"stop": None}
    row.worker_id = worker_id
    db.commit()
    return {"stop": {"runtime_id": row.runtime_id}}


@internal_router.post("/runtimes/{runtime_id}/stopped", response_model=HostedCommandResponse)
async def runtime_stopped(runtime_id: str, worker_id: str, db: Session = Depends(get_db)):
    row = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.runtime_id == runtime_id,
        HostedClawProductSession.worker_id == worker_id,
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Runtime not found")
    row.status = "stopped"
    row.worker_id = None
    # Clearing the instance identifier acknowledges this stop. Leaving it set
    # makes the stopped-session claimer return the same cleanup forever.
    row.runtime_id = None
    db.query(ConnectorToken).filter(
        ConnectorToken.runtime_id == runtime_id,
        ConnectorToken.token_kind == "hosted_runtime",
        ConnectorToken.revoked_at.is_(None),
    ).update({ConnectorToken.revoked_at: utcnow()}, synchronize_session=False)
    db.commit()
    return HostedCommandResponse(message="Runtime stop recorded.")


@internal_router.delete("/deletions/{runtime_id}", response_model=HostedCommandResponse)
async def complete_deletion(runtime_id: str, worker_id: str, db: Session = Depends(get_db)):
    row = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.runtime_id == runtime_id,
        HostedClawProductSession.status == "deleting",
        HostedClawProductSession.worker_id == worker_id,
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Deletion not found")
    db.delete(row)
    db.commit()
    return HostedCommandResponse(message="Runtime deletion completed.")


@internal_router.post("/jobs/{job_id}/complete", response_model=HostedCommandResponse)
async def complete_job(job_id: str, body: JobCompletionRequest, worker_id: str, db: Session = Depends(get_db)):
    job = db.query(HostedClawJob).filter(HostedClawJob.id == job_id).with_for_update().first()
    if job is None or job.worker_id != worker_id:
        raise HTTPException(status_code=404, detail="Claimed job not found")
    completion_status = "cancelled" if job.status == "cancelled" else body.status
    job.status = completion_status
    job.run_id = body.run_id
    job.error_code = body.error_code
    job.completed_at = utcnow()
    session = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == job.user_id,
        HostedClawProductSession.product == job.product,
    ).first()
    if job.channel_session_id and body.hermes_session_id:
        channel_session = db.get(HostedClawChannelSession, job.channel_session_id)
        if channel_session:
            channel_session.hermes_session_id = body.hermes_session_id
    if session:
        if not job.channel_session_id:
            session.hermes_session_id = body.hermes_session_id or session.hermes_session_id
        session.status = "ready" if completion_status == "completed" else "stopped"
        session.last_activity_at = utcnow()
        if body.applied_config_revision is not None:
            session.applied_config_revision = body.applied_config_revision
    period = date.today().replace(day=1)
    usage = db.query(HostedClawUsageSummary).filter(
        HostedClawUsageSummary.user_id == job.user_id, HostedClawUsageSummary.period_start == period
    ).first()
    if usage is None:
        usage = HostedClawUsageSummary(user_id=job.user_id, period_start=period)
        db.add(usage)
    usage.prompt_tokens = int(usage.prompt_tokens or 0) + body.prompt_tokens
    usage.completion_tokens = int(usage.completion_tokens or 0) + body.completion_tokens
    usage.cost_usd = Decimal(usage.cost_usd or 0) + body.cost_usd
    usage.turns = int(usage.turns or 0) + 1
    BillingService(db).record_usage(
        user_id=str(job.user_id),
        product="hosted_claw",
        source="hosted_claw_job",
        unit="token",
        quantity=int(body.prompt_tokens) + int(body.completion_tokens),
        operation_id=str(job.id),
        token_details={
            "prompt_tokens": body.prompt_tokens,
            "output_tokens": body.completion_tokens,
            "total_tokens": int(body.prompt_tokens) + int(body.completion_tokens),
        },
        commit=False,
    )
    db.commit()
    return HostedCommandResponse(message="Job completion recorded.")


@internal_router.get("/jobs/{job_id}/state")
async def job_state(job_id: str, worker_id: str, db: Session = Depends(get_db)):
    job = db.query(HostedClawJob).filter(
        HostedClawJob.id == job_id,
        HostedClawJob.worker_id == worker_id,
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Claimed job not found")
    now = utcnow()
    if job.status in {"claimed", "running"} and (
        job.lease_expires_at is None or job.lease_expires_at < now + timedelta(minutes=1)
    ):
        job.lease_expires_at = now + timedelta(minutes=5)
        db.commit()
    return {"status": job.status}


@internal_router.post("/jobs/{job_id}/started", response_model=HostedCommandResponse)
async def mark_job_started(job_id: str, worker_id: str, db: Session = Depends(get_db)):
    """Record that the tenant runtime is ready and the Hermes turn is starting."""
    # This endpoint only updates the product-session row. Do not lock the job
    # row: a concurrent progress relay may hold it while awaiting Slack, and a
    # synchronous lock wait here would stall the async API process.
    job = db.query(HostedClawJob).filter(
        HostedClawJob.id == job_id,
        HostedClawJob.worker_id == worker_id,
    ).first()
    if job is None or job.status not in {"claimed", "running"}:
        raise HTTPException(status_code=404, detail="Active job not found")
    job.status = "running"
    db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == job.user_id,
        HostedClawProductSession.product == job.product,
        HostedClawProductSession.worker_id == worker_id,
    ).update({HostedClawProductSession.status: "running"}, synchronize_session=False)
    db.commit()
    return HostedCommandResponse(message="Hosted turn started.")


@internal_router.post("/jobs/{job_id}/progress", response_model=HostedCommandResponse)
async def post_job_progress(job_id: str, worker_id: str, request: Request, db: Session = Depends(get_db)):
    """Create or update the single Slack response for a hosted turn."""
    body = await request.json()
    text = str(body.get("text") or "").strip()
    kind = str(body.get("kind") or "status").strip().lower()
    if not text or len(text) > 12000:
        raise HTTPException(status_code=400, detail="Progress text must be 1-12000 characters")
    if kind not in {"status", "final"}:
        raise HTTPException(status_code=400, detail="Progress kind must be status or final")
    async with _job_progress_lock(job_id):
        job = db.query(HostedClawJob).filter(
            HostedClawJob.id == job_id,
            HostedClawJob.worker_id == worker_id,
        ).with_for_update().first()
        if job is None or job.status not in {"claimed", "running"}:
            raise HTTPException(status_code=404, detail="Active job not found")
        if kind == "status" and job.slack_response_finalized_at is not None:
            return HostedCommandResponse(message="Final response already delivered.")
        link = db.get(HostedClawSlackLink, job.slack_link_id)
        installation = db.get(HostedClawSlackInstallation, link.installation_id) if link else None
        if installation is None:
            raise HTTPException(status_code=409, detail="Slack installation is unavailable")
        # The channel identifier is encrypted with the job, so decrypt it only for
        # this relay and never place the text or channel in logs.
        payload = json.loads(KmsEnvelope().decrypt(job.payload_ciphertext, aad=f"hosted-job:{job.event_id}".encode(), key_version=str(job.kms_key_version)))
        # Hermes final responses are standard Markdown. Status updates are authored
        # directly in Slack's mrkdwn dialect, so only final responses should use
        # Slack's standard-Markdown translation field.
        content = {"markdown_text": text} if kind == "final" else {"text": text}
        if job.slack_response_ts:
            await slack_api(
                installation,
                "chat.update",
                {"channel": payload["channel_id"], "ts": job.slack_response_ts, **content},
            )
        else:
            response = await slack_api(
                installation,
                "chat.postMessage",
                {"channel": payload["channel_id"], "thread_ts": payload.get("thread_ts"), **content},
            )
            response_ts = str(response.get("ts") or "").strip()
            if not response_ts:
                raise RuntimeError("Slack did not return a message timestamp")
            job.slack_response_ts = response_ts
        if kind == "final":
            job.slack_response_finalized_at = utcnow()
        db.commit()
        return HostedCommandResponse(message="Progress delivered.")


@internal_router.post("/runtime-credentials", response_model=RuntimeCredentialResponse)
async def rotate_runtime_credentials(body: RuntimeCredentialRequest, db: Session = Depends(get_db)):
    entitlement = require_entitlement(db, body.user_id)
    if body.product not in (entitlement.allowed_products or []):
        raise HTTPException(status_code=403, detail="Product is not entitled")
    session = db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == body.user_id,
        HostedClawProductSession.product == body.product,
        HostedClawProductSession.runtime_id == body.runtime_id,
        HostedClawProductSession.worker_id == body.worker_id,
        HostedClawProductSession.status.in_(["starting", "ready", "running"]),
    ).first()
    if session is None:
        raise HTTPException(status_code=404, detail="Assigned hosted runtime not found")
    token, row = mint_token(db, body.user_id, name=f"hosted:{body.runtime_id}", rotate_same_name=True)
    row.token_kind = "hosted_runtime"
    row.runtime_id = body.runtime_id
    db.commit()
    db.refresh(row)
    return RuntimeCredentialResponse(
        connector_mcp_url=os.getenv("CONNECTOR_MCP_PUBLIC_URL") or f"{public_api_base_url()}/api/connector/mcp",
        connector_token=token,
        connector_token_id=str(row.id),
    )


@internal_router.post("/approvals", response_model=ApprovalResponse)
async def request_approval(body: ApprovalRequest, db: Session = Depends(get_db)):
    connector_id = uuid.UUID(body.connector_token_id)
    connector = db.query(ConnectorToken).filter(
        ConnectorToken.id == connector_id,
        ConnectorToken.user_id == body.user_id,
        ConnectorToken.token_kind == "hosted_runtime",
        ConnectorToken.revoked_at.is_(None),
    ).first()
    if connector is None:
        raise HTTPException(status_code=404, detail="Hosted connector token not found")
    link = db.query(HostedClawSlackLink).filter(
        HostedClawSlackLink.user_id == body.user_id,
        HostedClawSlackLink.unlinked_at.is_(None),
    ).first()
    if link is None:
        raise HTTPException(status_code=409, detail="User is not linked to Slack")
    installation = db.get(HostedClawSlackInstallation, link.installation_id)
    interaction_token = new_secret("hcapprove_")
    approval = HostedClawApproval(
        user_id=body.user_id,
        connector_token_id=connector.id,
        run_id=body.run_id,
        action_id=body.action_id,
        argument_hash=approval_argument_hash(body.arguments),
        interaction_token_hash=sha256_token(interaction_token),
        expires_at=utcnow() + timedelta(minutes=5),
    )
    db.add(approval)
    db.commit()
    await slack_api(
        installation,
        "chat.postMessage",
        {
            "channel": body.slack_channel_id,
            "text": f"Approve {body.action_id}?",
            "blocks": [
                {"type": "section", "text": {"type": "mrkdwn", "text": f"*Approval required* for `{body.action_id}`. Expires in 5 minutes."}},
                {"type": "actions", "elements": [
                    {"type": "button", "text": {"type": "plain_text", "text": "Confirm"}, "style": "primary", "value": f"confirm:{interaction_token}", "action_id": "hosted_claw_confirm"},
                    {"type": "button", "text": {"type": "plain_text", "text": "Deny"}, "style": "danger", "value": f"deny:{interaction_token}", "action_id": "hosted_claw_deny"},
                ]},
            ],
        },
    )
    return ApprovalResponse(approval_id=str(approval.id), expires_at=approval.expires_at)


@internal_router.post("/approvals/{approval_id}/claim-grant")
async def claim_approval_grant(approval_id: str, db: Session = Depends(get_db)):
    approval = db.query(HostedClawApproval).filter(HostedClawApproval.id == approval_id).with_for_update().first()
    if approval is None:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.expires_at <= utcnow():
        approval.status = "expired"
        db.commit()
        return {"status": "expired"}
    if approval.status == "pending":
        return JSONResponse(status_code=202, content={"status": "pending"})
    if approval.status == "denied":
        return {"status": "denied"}
    if approval.status != "approved" or approval.grant_token_hash is not None:
        raise HTTPException(status_code=409, detail="Approval grant was already claimed")
    grant = new_secret("hcgrant_")
    approval.grant_token_hash = sha256_token(grant)
    db.commit()
    return {"status": "approved", "grant": grant}


@internal_router.post("/artifacts", response_model=ArtifactRegisterResponse)
async def register_artifact(body: ArtifactRegisterRequest, worker_id: str, db: Session = Depends(get_db)):
    require_entitlement(db, body.user_id)
    validate_attachment(body.filename, body.content_type, body.size_bytes)
    claimed_job = db.get(HostedClawJob, uuid.UUID(body.job_id)) if body.job_id else None
    if (
        claimed_job is None
        or claimed_job.worker_id != worker_id
        or claimed_job.status not in {"claimed", "running"}
        or str(claimed_job.user_id) != body.user_id
    ):
        raise HTTPException(status_code=404, detail="Claimed artifact job not found")
    if db.query(HostedClawArtifact).filter(
        HostedClawArtifact.job_id == claimed_job.id,
        HostedClawArtifact.direction == "outbound",
        HostedClawArtifact.deleted_at.is_(None),
    ).count() >= 10:
        raise HTTPException(status_code=400, detail="A hosted turn can return at most 10 files")
    artifact_id = uuid.uuid4()
    expiry = artifact_expiry()
    prefix = "quarantine" if body.direction == "inbound" else "generated"
    object_name = f"hosted-claw/{prefix}/{_tenant_prefix(body.user_id)}/{artifact_id.hex}/{body.filename}"
    bucket_name = os.getenv("HOSTED_CLAW_ARTIFACT_BUCKET", "").strip()
    if not bucket_name:
        raise HTTPException(status_code=503, detail="Hosted artifact storage is not configured")
    try:
        from google.cloud import storage

        blob = storage.Client().bucket(bucket_name).blob(object_name)
        upload_url = blob.generate_signed_url(
            expiration=timedelta(minutes=15), method="PUT", content_type=body.content_type, version="v4"
        )
    except Exception:
        logger.exception("Could not create hosted artifact upload URL")
        raise HTTPException(status_code=503, detail="Artifact storage is unavailable")
    artifact = HostedClawArtifact(
        id=artifact_id, user_id=body.user_id, job_id=uuid.UUID(body.job_id) if body.job_id else None,
        direction=body.direction, filename=body.filename, content_type=body.content_type,
        size_bytes=body.size_bytes, gcs_object_name=object_name, expires_at=expiry,
    )
    db.add(artifact)
    db.commit()
    return ArtifactRegisterResponse(artifact_id=str(artifact_id), object_name=object_name, upload_url=upload_url, expires_at=expiry)


@internal_router.post("/artifacts/{artifact_id}/prepare")
async def prepare_inbound_artifact(artifact_id: str, worker_id: str, db: Session = Depends(get_db)):
    """Stage one Slack file in GCS; safe to repeat after worker redelivery."""
    artifact = db.query(HostedClawArtifact).filter(
        HostedClawArtifact.id == artifact_id,
        HostedClawArtifact.direction == "inbound",
        HostedClawArtifact.deleted_at.is_(None),
    ).first()
    job = db.get(HostedClawJob, artifact.job_id) if artifact and artifact.job_id else None
    if artifact is None or job is None or job.worker_id != worker_id or job.status not in {"claimed", "running"}:
        raise HTTPException(status_code=404, detail="Active inbound artifact not found")
    if artifact.scan_status != "pending":
        raise HTTPException(status_code=409, detail="Inbound artifact was already scanned")
    bucket_name = os.getenv("HOSTED_CLAW_ARTIFACT_BUCKET", "").strip()
    if not bucket_name:
        raise HTTPException(status_code=503, detail="Hosted artifact storage is not configured")
    link = db.get(HostedClawSlackLink, job.slack_link_id)
    installation = db.get(HostedClawSlackInstallation, link.installation_id) if link else None
    if installation is None:
        raise HTTPException(status_code=409, detail="Slack installation is unavailable")
    payload = json.loads(KmsEnvelope().decrypt(
        job.payload_ciphertext,
        aad=f"hosted-job:{job.event_id}".encode(),
        key_version=str(job.kms_key_version),
    ))
    slack_file = next(
        (item for item in payload.get("files") or [] if str(item.get("id") or "") == str(artifact.source_id)),
        None,
    )
    if slack_file is None:
        raise HTTPException(status_code=409, detail="Slack attachment metadata is unavailable")
    slack_download_url = str(slack_file.get("url_private_download") or "")
    if not _valid_slack_file_url(slack_download_url):
        raise HTTPException(status_code=400, detail="Slack attachment URL is invalid")
    from google.cloud import storage

    blob = storage.Client().bucket(bucket_name).blob(str(artifact.gcs_object_name))
    if not await asyncio.to_thread(blob.exists):
        bot_token = decrypt_bot_token(installation)
        total = 0
        tmp_path = ""
        try:
            with tempfile.NamedTemporaryFile(prefix="hosted-claw-", delete=False) as tmp:
                tmp_path = tmp.name
                async with httpx.AsyncClient(timeout=120, follow_redirects=False) as client:
                    async with client.stream(
                        "GET",
                        slack_download_url,
                        headers={"Authorization": f"Bearer {bot_token}"},
                    ) as response:
                        response.raise_for_status()
                        async for chunk in response.aiter_bytes():
                            total += len(chunk)
                            if total > 50 * 1024 * 1024:
                                raise HTTPException(status_code=400, detail="Slack attachment exceeded 50 MB")
                            tmp.write(chunk)
            if total != int(artifact.size_bytes):
                raise HTTPException(status_code=409, detail="Slack attachment size changed")
            await asyncio.to_thread(
                blob.upload_from_filename,
                tmp_path,
                content_type=str(artifact.content_type),
            )
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except FileNotFoundError:
                    pass
    download_url = await asyncio.to_thread(
        blob.generate_signed_url,
        expiration=timedelta(minutes=15),
        method="GET",
        version="v4",
    )
    return {"download_url": download_url, "size": artifact.size_bytes}


@internal_router.post("/artifacts/{artifact_id}/scan", response_model=HostedCommandResponse)
async def record_artifact_scan(artifact_id: str, worker_id: str, request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    scan_status = str(body.get("status") or "")
    if scan_status not in {"clean", "infected", "rejected"}:
        raise HTTPException(status_code=400, detail="Invalid scan status")
    artifact = db.query(HostedClawArtifact).filter(HostedClawArtifact.id == artifact_id).first()
    job = db.get(HostedClawJob, artifact.job_id) if artifact and artifact.job_id else None
    if (
        artifact is None
        or artifact.deleted_at is not None
        or job is None
        or job.worker_id != worker_id
        or job.status not in {"claimed", "running"}
    ):
        raise HTTPException(status_code=404, detail="Artifact not found")
    artifact.scan_status = scan_status
    db.commit()
    return HostedCommandResponse(message="Artifact scan recorded.")


@internal_router.post("/artifacts/{artifact_id}/deliver", response_model=HostedCommandResponse)
async def deliver_artifact(artifact_id: str, worker_id: str, db: Session = Depends(get_db)):
    artifact = db.query(HostedClawArtifact).filter(
        HostedClawArtifact.id == artifact_id,
        HostedClawArtifact.direction == "outbound",
        HostedClawArtifact.scan_status == "clean",
        HostedClawArtifact.deleted_at.is_(None),
    ).first()
    if artifact is None or artifact.job_id is None:
        raise HTTPException(status_code=404, detail="Clean generated artifact not found")
    job = db.get(HostedClawJob, artifact.job_id)
    link = db.get(HostedClawSlackLink, job.slack_link_id) if job else None
    installation = db.get(HostedClawSlackInstallation, link.installation_id) if link else None
    if (
        job is None
        or job.worker_id != worker_id
        or job.status not in {"claimed", "running"}
        or installation is None
    ):
        raise HTTPException(status_code=409, detail="Slack delivery context is unavailable")
    bucket_name = os.getenv("HOSTED_CLAW_ARTIFACT_BUCKET", "").strip()
    if not bucket_name:
        raise HTTPException(status_code=503, detail="Hosted artifact storage is not configured")
    payload = json.loads(KmsEnvelope().decrypt(job.payload_ciphertext, aad=f"hosted-job:{job.event_id}".encode(), key_version=str(job.kms_key_version)))
    from google.cloud import storage

    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="hosted-output-", delete=False) as tmp:
            tmp_path = tmp.name
        await asyncio.to_thread(
            storage.Client().bucket(bucket_name).blob(str(artifact.gcs_object_name)).download_to_filename,
            tmp_path,
        )
        bot_token = decrypt_bot_token(installation)
        async with httpx.AsyncClient(timeout=120) as client:
            upload_request = await client.post(
                "https://slack.com/api/files.getUploadURLExternal",
                headers={"Authorization": f"Bearer {bot_token}"},
                data={"filename": artifact.filename, "length": str(artifact.size_bytes)},
            )
            upload_request.raise_for_status()
            upload_data = upload_request.json()
            if not upload_data.get("ok"):
                raise RuntimeError("Slack refused generated file upload")
            with open(tmp_path, "rb") as handle:
                upload = await client.post(upload_data["upload_url"], files={"file": (artifact.filename, handle, artifact.content_type)})
                upload.raise_for_status()
            completed = await client.post(
                "https://slack.com/api/files.completeUploadExternal",
                headers={"Authorization": f"Bearer {bot_token}"},
                json={
                    "files": [{"id": upload_data["file_id"], "title": artifact.filename}],
                    "channel_id": payload["channel_id"],
                    "thread_ts": payload.get("thread_ts"),
                },
            )
            completed.raise_for_status()
            if not completed.json().get("ok"):
                raise RuntimeError("Slack refused generated file completion")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except FileNotFoundError:
                pass
    return HostedCommandResponse(message="Generated artifact delivered.")


@internal_router.post("/retention")
async def purge_retention(db: Session = Depends(get_db)):
    now = utcnow()
    rows = db.query(HostedClawArtifact).filter(
        HostedClawArtifact.expires_at <= now,
        HostedClawArtifact.deleted_at.is_(None),
    ).limit(500).all()
    bucket_name = os.getenv("HOSTED_CLAW_ARTIFACT_BUCKET", "").strip()
    bucket = None
    if bucket_name:
        from google.cloud import storage

        bucket = storage.Client().bucket(bucket_name)
    purged: list[dict[str, str]] = []
    for row in rows:
        if bucket is not None:
            try:
                bucket.blob(str(row.gcs_object_name)).delete()
            except Exception:
                logger.warning("Hosted artifact retention deletion failed artifact_id=%s", row.id)
                continue
        row.deleted_at = now
        row.scan_status = "deleted"
        job = db.get(HostedClawJob, row.job_id) if row.job_id else None
        purged.append({
            "user_id": str(row.user_id),
            "product": str(job.product) if job else "",
            "filename": str(row.filename),
            "direction": str(row.direction),
            "job_id": str(row.job_id) if row.job_id else "",
        })
    db.commit()
    return {"purged": purged}


@admin_router.put("/entitlements/{user_id}")
async def set_entitlement(user_id: str, body: EntitlementUpdate, admin=Depends(require_system_admin), db: Session = Depends(get_db)):
    row = db.get(HostedClawEntitlement, user_id)
    if row is None:
        row = HostedClawEntitlement(user_id=user_id)
        db.add(row)
    row.enabled = body.enabled
    row.allowed_products = list(body.allowed_products)
    row.allowed_model_aliases = list(body.allowed_model_aliases)
    row.monthly_budget_usd = body.monthly_budget_usd
    row.granted_by = admin.id
    row.revoked_at = None if body.enabled else utcnow()
    config = get_or_create_config(db, user_id) if body.enabled else db.get(HostedClawConfig, user_id)
    if body.enabled and config is not None:
        changed = False
        if config.active_product not in body.allowed_products:
            config.active_product = body.allowed_products[0]
            changed = True
        if config.model_alias not in body.allowed_model_aliases:
            config.model_alias = body.allowed_model_aliases[0]
            changed = True
        if changed:
            config.revision = int(config.revision) + 1
    if not body.enabled:
        db.query(ConnectorToken).filter(ConnectorToken.user_id == user_id, ConnectorToken.token_kind == "hosted_runtime", ConnectorToken.revoked_at.is_(None)).update({ConnectorToken.revoked_at: utcnow()}, synchronize_session=False)
        db.query(HostedClawJob).filter(
            HostedClawJob.user_id == user_id,
            HostedClawJob.status.in_(["queued", "claimed", "running"]),
        ).update({HostedClawJob.status: "cancelled", HostedClawJob.completed_at: utcnow()}, synchronize_session=False)
        db.query(HostedClawProductSession).filter(
            HostedClawProductSession.user_id == user_id
        ).update({HostedClawProductSession.status: "stopped"}, synchronize_session=False)
    db.commit()
    return {"ok": True, "user_id": user_id, "enabled": body.enabled}


@admin_router.put("/read-only-actions")
async def set_read_only_actions(body: ReadOnlyPolicyUpdate, admin=Depends(require_system_admin), db: Session = Depends(get_db)):
    requested = set(body.action_ids)
    existing = {row.action_id: row for row in db.query(HostedClawReadOnlyAction).all()}
    for action_id, row in existing.items():
        row.enabled = action_id in requested
        row.updated_by = admin.id
    for action_id in requested - set(existing):
        db.add(HostedClawReadOnlyAction(action_id=action_id, enabled=True, updated_by=admin.id))
    db.commit()
    return {"ok": True, "action_ids": sorted(requested)}


@admin_router.get("/health")
async def hosted_health(_: Any = Depends(require_system_admin), db: Session = Depends(get_db)):
    now = utcnow()
    workers = db.query(HostedClawWorkerLease).all()
    oldest = db.query(func.min(HostedClawJob.created_at)).filter(HostedClawJob.status == "queued").scalar()
    recent_cutoff = now - timedelta(hours=1)
    recent_turns = db.query(HostedClawJob).filter(HostedClawJob.created_at >= recent_cutoff).count()
    recent_failures = db.query(HostedClawJob).filter(
        HostedClawJob.created_at >= recent_cutoff,
        HostedClawJob.status == "failed",
    ).count()
    crash_failures = db.query(HostedClawJob).filter(
        HostedClawJob.created_at >= recent_cutoff,
        HostedClawJob.error_code == "runtime_failure",
    ).count()
    return {
        "enabled": hosted_enabled(),
        "workers": [
            {"worker_id": row.worker_id, "status": row.status if row.lease_expires_at > now else "unavailable", "active_turns": row.active_turns, "capacity": row.capacity, "disk_percent": float(row.disk_percent) if row.disk_percent is not None else None, "last_heartbeat_at": row.last_heartbeat_at}
            for row in workers
        ],
        "queued_jobs": db.query(HostedClawJob).filter(HostedClawJob.status == "queued").count(),
        "oldest_queue_age_seconds": max(0, int((now - oldest).total_seconds())) if oldest else 0,
        "turn_failure_percent_1h": round((recent_failures / recent_turns) * 100, 2) if recent_turns else 0,
        "runtime_crash_failures_1h": crash_failures,
    }
