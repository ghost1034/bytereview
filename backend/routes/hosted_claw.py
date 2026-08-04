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
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import func, or_
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
    HostedClawConfig,
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
    new_link_url,
    publish_job,
    require_entitlement,
    slack_api,
    slack_oauth_url,
    validate_attachment,
    decrypt_bot_token,
)

logger = logging.getLogger(__name__)

user_router = APIRouter(prefix="/api/hosted-claw", tags=["hosted-claw"])
slack_router = APIRouter(prefix="/api/slack", tags=["hosted-claw-slack"])
internal_router = APIRouter(
    prefix="/api/internal/hosted-claw",
    tags=["hosted-claw-internal"],
    dependencies=[Depends(require_hosted_worker)],
)
admin_router = APIRouter(prefix="/api/admin/hosted-claw", tags=["admin-hosted-claw"])


def _tenant_prefix(user_id: str) -> str:
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:32]


def _valid_slack_file_url(value: str) -> bool:
    parsed = urllib.parse.urlparse(value)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (
        host == "slack.com" or host.endswith(".slack.com") or host.endswith(".slack-edge.com")
    )


def _supported_slack_message_event(event: dict[str, Any]) -> bool:
    """Return whether a Slack event represents a user-authored DM we can run.

    Slack labels messages containing newly shared attachments as ``file_share``.
    Treat that subtype as an ordinary message so attachment workflows reach the
    quarantine pipeline, while continuing to ignore edits, deletes, bot output,
    and every other message subtype.
    """
    return bool(
        event.get("type") == "message"
        and event.get("channel_type") == "im"
        and not event.get("bot_id")
        and event.get("subtype") in {None, "file_share"}
    )


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


def _config_response(row: HostedClawConfig) -> HostedConfigResponse:
    return HostedConfigResponse(
        active_product=str(row.active_product),
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
    entitlement = db.query(HostedClawEntitlement).filter(HostedClawEntitlement.user_id == user_id).first()
    entitled = bool(entitlement and entitlement.enabled and entitlement.revoked_at is None)
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
    period = date.today().replace(day=1)
    usage = db.query(HostedClawUsageSummary).filter(
        HostedClawUsageSummary.user_id == user_id,
        HostedClawUsageSummary.period_start == period,
    ).first()
    db.commit()
    return HostedStatusResponse(
        feature_enabled=hosted_enabled(),
        entitled=True,
        allowed_products=list(entitlement.allowed_products or []),
        allowed_model_aliases=list(entitlement.allowed_model_aliases or []),
        monthly_budget_usd=entitlement.monthly_budget_usd or Decimal("0"),
        linked=link is not None,
        workspace_name=installation.team_name if installation else None,
        slack_user_id=link.slack_user_id if link else None,
        config=_config_response(config),
        runtime_status=str(session.status) if session else "stopped",
        runtime_last_activity_at=session.last_activity_at if session else None,
        usage_cost_usd=usage.cost_usd if usage else Decimal("0"),
        usage_turns=int(usage.turns) if usage else 0,
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
    db.query(ConnectorToken).filter(
        ConnectorToken.user_id == user_id,
        ConnectorToken.token_kind == "hosted_runtime",
        ConnectorToken.revoked_at.is_(None),
    ).update({ConnectorToken.revoked_at: now}, synchronize_session=False)
    db.commit()
    return HostedCommandResponse(message="Hosted Claw work was stopped.")


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
    return HostedCommandResponse(message="The next message will start a fresh session. Retained history was not deleted.")


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
    for model in (HostedClawJob, HostedClawArtifact, HostedClawConfig, HostedClawUsageSummary):
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
        message = _create_link_message(db, installation, enterprise, team, slack_user, event.get("channel"))
        background_tasks.add_task(slack_api, installation, "chat.postMessage", message)
        return {"ok": True}
    entitlement = db.query(HostedClawEntitlement).filter(HostedClawEntitlement.user_id == link.user_id).first()
    if not entitlement or not entitlement.enabled or entitlement.revoked_at is not None:
        background_tasks.add_task(slack_api, installation, "chat.postMessage", {"channel": event.get("channel"), "text": "Hosted Claw is not enabled for this CPAAutomation account."})
        return {"ok": True}
    period = date.today().replace(day=1)
    usage_cost = db.query(HostedClawUsageSummary.cost_usd).filter(
        HostedClawUsageSummary.user_id == link.user_id,
        HostedClawUsageSummary.period_start == period,
    ).scalar() or Decimal("0")
    monthly_budget = Decimal(entitlement.monthly_budget_usd or 0)
    if monthly_budget > 0 and Decimal(usage_cost) >= monthly_budget:
        background_tasks.add_task(
            slack_api,
            installation,
            "chat.postMessage",
            {"channel": event.get("channel"), "text": "Your Hosted Claw monthly model budget is exhausted."},
        )
        return {"ok": True}
    files = event.get("files") or []
    if len(files) > 10:
        background_tasks.add_task(slack_api, installation, "chat.postMessage", {"channel": event.get("channel"), "text": "A message can include at most 10 attachments."})
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
            {"channel": event.get("channel"), "text": str(exc.detail)},
        )
        return {"ok": True}
    config = get_or_create_config(db, str(link.user_id))
    event_id = str(body.get("event_id") or f"slack:{team}:{event.get('client_msg_id') or event.get('ts')}")
    payload = {
        "text": str(event.get("text") or ""),
        "channel_id": str(event.get("channel") or ""),
        "slack_ts": str(event.get("ts") or ""),
        "thread_ts": str(event.get("thread_ts") or event.get("ts") or ""),
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
            db.query(HostedClawJob).filter(HostedClawJob.user_id == link.user_id, HostedClawJob.status.in_(["queued", "claimed", "running"])).update({HostedClawJob.status: "cancelled", HostedClawJob.completed_at: utcnow()}, synchronize_session=False)
            db.query(HostedClawProductSession).filter(HostedClawProductSession.user_id == link.user_id).update({HostedClawProductSession.status: "stopped"}, synchronize_session=False)
            db.query(ConnectorToken).filter(
                ConnectorToken.user_id == link.user_id,
                ConnectorToken.token_kind == "hosted_runtime",
                ConnectorToken.revoked_at.is_(None),
            ).update({ConnectorToken.revoked_at: utcnow()}, synchronize_session=False)
        elif action == "unlink":
            link.unlinked_at = utcnow()
            db.query(HostedClawJob).filter(
                HostedClawJob.user_id == link.user_id,
                HostedClawJob.status.in_(["queued", "claimed", "running"]),
            ).update({HostedClawJob.status: "cancelled", HostedClawJob.completed_at: utcnow()}, synchronize_session=False)
            db.query(HostedClawProductSession).filter(
                HostedClawProductSession.user_id == link.user_id
            ).update({HostedClawProductSession.status: "stopped"}, synchronize_session=False)
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
    busy_users = db.query(HostedClawJob.user_id).filter(HostedClawJob.status.in_(["claimed", "running"]))
    deleting_users = db.query(HostedClawProductSession.user_id).filter(
        HostedClawProductSession.status == "deleting"
    )
    job = db.query(HostedClawJob).filter(
        HostedClawJob.status == "queued",
        HostedClawJob.available_at <= now,
        HostedClawJob.user_id.notin_(busy_users),
        HostedClawJob.user_id.notin_(deleting_users),
    ).order_by(HostedClawJob.created_at.asc()).with_for_update(skip_locked=True).first()
    if job is None:
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
    usage_cost = db.query(HostedClawUsageSummary.cost_usd).filter(
        HostedClawUsageSummary.user_id == job.user_id,
        HostedClawUsageSummary.period_start == period,
    ).scalar() or Decimal("0")
    monthly_budget = Decimal(entitlement.monthly_budget_usd or 0)
    remaining_budget = max(Decimal("0"), monthly_budget - Decimal(usage_cost)) if monthly_budget > 0 else Decimal("0")
    if monthly_budget > 0 and remaining_budget <= 0:
        job.status = "failed"
        job.error_code = "budget_exhausted"
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
                    {"channel": notice_payload["channel_id"], "text": "Your Hosted Claw monthly model budget is exhausted."},
                )
        except Exception:
            logger.warning("Could not deliver hosted budget exhaustion notice job_id=%s", job.id)
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
    _ensure_hermes_session_id(session)
    session.worker_id = body.worker_id
    session.status = "starting" if runtime_start_expected else "ready"
    db.query(HostedClawProductSession).filter(
        HostedClawProductSession.user_id == job.user_id,
        HostedClawProductSession.product != job.product,
        HostedClawProductSession.status.in_(["starting", "ready", "running"]),
    ).update({HostedClawProductSession.status: "stopped"}, synchronize_session=False)
    plaintext = KmsEnvelope().decrypt(job.payload_ciphertext, aad=f"hosted-job:{job.event_id}".encode(), key_version=str(job.kms_key_version))
    payload = _register_claim_attachments(db, job, json.loads(plaintext))
    result = WorkerJobResponse(
        job_id=str(job.id), queued_at=job.created_at, payload=payload, user_id=str(job.user_id), product=str(job.product),
        config=_config_response(config), session_id=session.hermes_session_id, runtime_id=str(session.runtime_id),
        monthly_budget_usd=monthly_budget,
        remaining_budget_usd=remaining_budget,
        budget_period=period,
    )
    db.commit()
    return WorkerClaimResponse(job=result)


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
    if session:
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
    job = db.query(HostedClawJob).filter(
        HostedClawJob.id == job_id,
        HostedClawJob.worker_id == worker_id,
    ).with_for_update().first()
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
    if job.slack_response_ts:
        await slack_api(
            installation,
            "chat.update",
            {"channel": payload["channel_id"], "ts": job.slack_response_ts, "text": text},
        )
    else:
        response = await slack_api(
            installation,
            "chat.postMessage",
            {"channel": payload["channel_id"], "thread_ts": payload.get("thread_ts"), "text": text},
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
    period = date.today().replace(day=1)
    budget_exhausted = db.query(HostedClawUsageSummary).join(
        HostedClawEntitlement,
        HostedClawEntitlement.user_id == HostedClawUsageSummary.user_id,
    ).filter(
        HostedClawUsageSummary.period_start == period,
        HostedClawEntitlement.monthly_budget_usd > 0,
        HostedClawUsageSummary.cost_usd >= HostedClawEntitlement.monthly_budget_usd,
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
        "budget_exhausted_users": budget_exhausted,
    }
