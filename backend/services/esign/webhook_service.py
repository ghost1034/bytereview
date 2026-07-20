"""Authenticated, observable E-Signature outbound webhook delivery."""

from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import secrets
import socket
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlsplit

import httpx
from sqlalchemy import or_, text
from sqlalchemy.orm import Session, joinedload

from core.database import db_config
from models.db_models import (
    EsignEnvelope,
    EsignEvent,
    EsignRecipient,
    EsignWebhookAttempt,
    EsignWebhookConfiguration,
    EsignWebhookDelivery,
)
from services.gcs_service import get_storage_service

logger = logging.getLogger(__name__)

RETRY_DELAYS = (
    timedelta(minutes=5), timedelta(minutes=15), timedelta(hours=1), timedelta(hours=6),
    timedelta(days=1), timedelta(days=3), timedelta(days=7), timedelta(days=15),
)
MAX_RESPONSE_BYTES = 16 * 1024
EVENT_DETAILS_ALLOWLIST = {
    "reason", "manual", "expires_at", "schedule_at", "schedule_timezone",
    "routing_order", "status", "error_code", "warning",
}


class WebhookDestinationError(ValueError):
    pass


def generate_webhook_secret() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii").rstrip("=")


def sign_webhook(secret: str, timestamp: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), timestamp.encode("ascii") + b"." + body, hashlib.sha256).hexdigest()


def validate_webhook_destination(url: str, *, resolve_dns: bool = True) -> str:
    try:
        parsed = urlsplit((url or "").strip())
    except ValueError as exc:
        raise WebhookDestinationError("Invalid webhook endpoint") from exc
    if parsed.scheme != "https" or not parsed.hostname:
        raise WebhookDestinationError("Webhook endpoint must be an HTTPS URL")
    if parsed.username or parsed.password or parsed.fragment:
        raise WebhookDestinationError("Webhook endpoint cannot contain credentials or a fragment")
    try:
        literal = ipaddress.ip_address(parsed.hostname.strip("[]"))
        addresses = [literal]
    except ValueError:
        addresses = []
        if resolve_dns:
            try:
                addresses = list({ipaddress.ip_address(row[4][0]) for row in socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)})
            except (OSError, ValueError) as exc:
                raise WebhookDestinationError("Webhook endpoint hostname could not be resolved") from exc
    if not addresses and resolve_dns:
        raise WebhookDestinationError("Webhook endpoint hostname did not resolve")
    if any(not address.is_global for address in addresses):
        raise WebhookDestinationError("Webhook endpoint resolves to a private or reserved address")
    return parsed.geturl()


def _event_value(event: EsignEvent) -> str:
    return event.event_type.value if hasattr(event.event_type, "value") else str(event.event_type)


def build_event_payload(db: Session, event: EsignEvent, envelope: EsignEnvelope) -> dict[str, Any]:
    recipient = None
    if event.recipient_id:
        recipient = db.query(EsignRecipient).filter(EsignRecipient.id == event.recipient_id).first()
    details = {
        key: value for key, value in dict(event.details or {}).items()
        if key in EVENT_DETAILS_ALLOWLIST
    }
    return {
        "version": "2026-07-01",
        "event": {"id": str(event.id), "type": _event_value(event), "created_at": event.created_at.isoformat()},
        "firm": {"id": str(envelope.firm_id)},
        "envelope": {
            "id": str(envelope.id), "title": envelope.title,
            "status": envelope.status.value if hasattr(envelope.status, "value") else str(envelope.status),
        },
        "sender": {"user_id": envelope.user_id},
        "recipient": ({"id": str(recipient.id), "email": recipient.email, "role": getattr(recipient.role, "value", recipient.role),
                       "status": getattr(recipient.status, "value", recipient.status)} if recipient else None),
        "source": {"type": envelope.source_type or "manual", "id": str(envelope.source_id) if envelope.source_id else None},
        "timestamps": {"sent_at": envelope.sent_at.isoformat() if envelope.sent_at else None,
                       "completed_at": envelope.completed_at.isoformat() if envelope.completed_at else None},
        "details": details,
    }


def create_event_deliveries(db: Session, event: EsignEvent) -> int:
    """Create matching outbox rows in the event writer's transaction."""
    envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == event.envelope_id).first()
    if envelope is None or envelope.firm_id is None:
        return 0
    event_type = _event_value(event)
    configurations = db.query(EsignWebhookConfiguration).filter(
        EsignWebhookConfiguration.firm_id == envelope.firm_id,
        EsignWebhookConfiguration.enabled.is_(True),
        EsignWebhookConfiguration.disabled_at.is_(None),
        or_(EsignWebhookConfiguration.envelope_id.is_(None), EsignWebhookConfiguration.envelope_id == envelope.id),
    ).all()
    created = 0
    payload = build_event_payload(db, event, envelope)
    for configuration in configurations:
        filters = list(configuration.event_filters or [])
        if filters and event_type not in filters and "*" not in filters:
            continue
        db.add(EsignWebhookDelivery(
            id=uuid.uuid4(), configuration_id=configuration.id, event_id=event.id,
            firm_id=envelope.firm_id, envelope_id=envelope.id, payload=payload,
            status="pending", next_attempt_at=datetime.now(timezone.utc),
        ))
        created += 1
    if created:
        db.flush()
    return created


class EsignWebhookService:
    def _get_session(self) -> Session:
        return db_config.get_session()

    async def deliver(self, delivery_id: str) -> dict[str, Any]:
        if os.getenv("ESIGN_WEBHOOK_DISPATCH_ENABLED", "false").lower() not in ("1", "true", "yes"):
            return {"status": "disabled"}
        db = self._get_session()
        try:
            delivery = db.query(EsignWebhookDelivery).filter(EsignWebhookDelivery.id == uuid.UUID(delivery_id)).with_for_update().first()
            if delivery is None:
                return {"status": "missing"}
            configuration = db.query(EsignWebhookConfiguration).filter(EsignWebhookConfiguration.id == delivery.configuration_id).first()
            if not configuration or not configuration.enabled or configuration.disabled_at or delivery.status in ("succeeded", "cancelled", "terminal"):
                if delivery.status not in ("succeeded", "terminal"):
                    delivery.status = "cancelled"
                    delivery.next_attempt_at = None
                    db.commit()
                return {"status": delivery.status}
            endpoint = configuration.endpoint_url
            now = datetime.now(timezone.utc)
            payload = dict(delivery.payload or {})
            if configuration.include_completed_documents and payload.get("event", {}).get("type") in ("completed", "sealed"):
                envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == delivery.envelope_id).first()
                links: dict[str, Any] = {"expires_in_seconds": 900, "links_minted_at": now.isoformat()}
                storage = get_storage_service()
                if envelope and envelope.sealed_gcs_object_name:
                    links["sealed_document_url"] = await storage.generate_presigned_get_url(
                        envelope.sealed_gcs_object_name, expiration_minutes=15,
                        download_filename=f"{envelope.title or 'envelope'} - signed.pdf",
                    )
                if envelope and envelope.certificate_gcs_object_name:
                    links["certificate_url"] = await storage.generate_presigned_get_url(
                        envelope.certificate_gcs_object_name, expiration_minutes=15,
                        download_filename=f"{envelope.title or 'envelope'} - certificate of completion.pdf",
                    )
                payload["completed_documents"] = links
            body = json.dumps(payload, separators=(",", ":"), sort_keys=True, default=str).encode("utf-8")
            timestamp = str(int(now.timestamp()))
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "CPAAutomation-Esign-Webhooks/1.0",
                "X-CPAA-Webhook-Version": "1",
                "X-CPAA-Delivery-ID": str(delivery.id),
                "X-CPAA-Event-ID": str(delivery.event_id),
                "X-CPAA-Timestamp": timestamp,
                "X-CPAA-Signature-256": "sha256=" + sign_webhook(configuration.secret_current, timestamp, body),
            }
            if configuration.secret_previous and configuration.secret_previous_expires_at and configuration.secret_previous_expires_at > now:
                headers["X-CPAA-Previous-Signature-256"] = "sha256=" + sign_webhook(configuration.secret_previous, timestamp, body)
            attempt_number = int(delivery.attempt_count or 0) + 1
            started = datetime.now(timezone.utc)
            result, status_code, excerpt, error = "network_error", None, None, None
            try:
                endpoint = validate_webhook_destination(endpoint, resolve_dns=True)
                async with httpx.AsyncClient(timeout=httpx.Timeout(10.0), follow_redirects=False) as client:
                    async with client.stream("POST", endpoint, content=body, headers=headers) as response:
                        status_code = response.status_code
                        collected = bytearray()
                        async for chunk in response.aiter_bytes():
                            collected.extend(chunk[: max(0, MAX_RESPONSE_BYTES - len(collected))])
                            if len(collected) >= MAX_RESPONSE_BYTES:
                                break
                        excerpt = bytes(collected).decode("utf-8", errors="replace")
                        result = "success" if 200 <= response.status_code < 300 else "http_error"
            except Exception as exc:
                result = "rejected_destination" if isinstance(exc, WebhookDestinationError) else "network_error"
                error = f"{type(exc).__name__}: {str(exc)}"[:2000]
            completed = datetime.now(timezone.utc)
            delivery.attempt_count = attempt_number
            delivery.claimed_at = None
            if result == "success":
                delivery.status, delivery.completed_at, delivery.next_attempt_at = "succeeded", completed, None
            elif attempt_number <= len(RETRY_DELAYS):
                delivery.status, delivery.next_attempt_at = "retry", completed + RETRY_DELAYS[attempt_number - 1]
            else:
                delivery.status, delivery.terminal_at, delivery.next_attempt_at = "terminal", completed, None
            db.add(EsignWebhookAttempt(
                id=uuid.uuid4(), delivery_id=delivery.id, attempt_number=attempt_number,
                started_at=started, completed_at=completed,
                duration_ms=max(0, int((completed - started).total_seconds() * 1000)),
                result=result, http_status=status_code, response_excerpt=excerpt,
                error=error,
            ))
            db.commit()
            return {"status": delivery.status, "attempt": attempt_number, "http_status": status_code}
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def claim_due(self, *, limit: int = 100) -> list[str]:
        db = self._get_session()
        try:
            now = datetime.now(timezone.utc)
            rows = db.query(EsignWebhookDelivery).filter(or_(
                (EsignWebhookDelivery.status.in_(("pending", "retry"))) & (EsignWebhookDelivery.next_attempt_at <= now),
                (EsignWebhookDelivery.status == "claimed") & (EsignWebhookDelivery.claimed_at < now - timedelta(minutes=10)),
            )).order_by(EsignWebhookDelivery.next_attempt_at.asc()).with_for_update(skip_locked=True).limit(limit).all()
            for row in rows:
                row.status = "claimed"
                row.claimed_at = now
            db.commit()
            return [str(row.id) for row in rows]
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def release_claim(self, delivery_id: str) -> None:
        db = self._get_session()
        try:
            row = db.query(EsignWebhookDelivery).filter(EsignWebhookDelivery.id == uuid.UUID(delivery_id),
                                                        EsignWebhookDelivery.status == "claimed").first()
            if row:
                row.status = "retry"
                row.claimed_at = None
                row.next_attempt_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()

    def cleanup_retention(self) -> int:
        db = self._get_session()
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=90)
            ids = [row[0] for row in db.query(EsignWebhookDelivery.id).filter(EsignWebhookDelivery.created_at < cutoff).all()]
            if not ids: return 0
            db.execute(text("SET LOCAL esign.retention_cleanup = 'on'"))
            db.query(EsignWebhookAttempt).filter(EsignWebhookAttempt.delivery_id.in_(ids)).delete(synchronize_session=False)
            deleted = db.query(EsignWebhookDelivery).filter(EsignWebhookDelivery.id.in_(ids)).delete(synchronize_session=False)
            db.commit(); return deleted
        except Exception:
            db.rollback(); raise
        finally:
            db.close()


esign_webhook_service = EsignWebhookService()
