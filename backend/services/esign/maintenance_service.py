"""Hourly e-sign maintenance: expiration warnings, expiry, and auto-reminders.

Invoked by the Cloud Scheduler job 'esign-maintenance' via the maintenance
task service. Every operation is threshold-filtered (or stamped once), so
duplicate or delayed runs are naturally idempotent.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from core.database import db_config
from models.db_models import (
    EsignEnvelope,
    EsignEnvelopeStatus,
    EsignEventType,
)
from services.esign import audit_service, email_templates
from services.esign.email_templates import EmailContent
from services.esign.signing_service import esign_signing_service

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = (EsignEnvelopeStatus.SENT, EsignEnvelopeStatus.IN_PROGRESS)

# How far before expiry the one-time warning goes out.
EXPIRATION_WARNING_DAYS = int(os.getenv("ESIGN_EXPIRATION_WARNING_DAYS", "3"))


class EsignMaintenanceService:
    def _get_session(self) -> Session:
        return db_config.get_session()

    async def run(self) -> dict[str, Any]:
        # Minute-level deployments invoke this same idempotent worker. The
        # bounded claims make duplicate Cloud Scheduler/Tasks delivery safe.
        from services.esign.scale_service import esign_scale_service
        from services.esign.webhook_service import esign_webhook_service
        bulk_rows = await esign_scale_service.process_queued_rows()
        scheduled = await esign_scale_service.dispatch_due()
        webhook_tasks = await self._enqueue_due_webhooks()
        webhook_retention_eligible = esign_webhook_service.cleanup_retention() if datetime.now(timezone.utc).hour == 3 else 0
        expired = await self._expire_envelopes()
        warned = await self._send_expiration_warnings()
        reminded = await self._send_due_reminders()
        return {"bulk_rows": bulk_rows, "scheduled_dispatched": scheduled, "webhook_tasks": webhook_tasks,
                "webhook_retention_deleted": webhook_retention_eligible,
                "expired": expired, "expiration_warnings": warned, "reminders_sent": reminded}

    async def _enqueue_due_webhooks(self) -> int:
        from services.cloud_run_task_service import cloud_run_task_service
        from services.esign.webhook_service import esign_webhook_service
        if os.getenv("ESIGN_WEBHOOK_DISPATCH_ENABLED", "false").lower() not in ("1", "true", "yes"):
            return 0
        delivery_ids = esign_webhook_service.claim_due(limit=100)
        enqueued = 0
        for delivery_id in delivery_ids:
            try:
                await cloud_run_task_service.enqueue_esign_webhook_task(delivery_id)
                enqueued += 1
            except Exception:
                logger.exception("Failed to enqueue E-Signature webhook delivery %s", delivery_id)
                esign_webhook_service.release_claim(delivery_id)
        return enqueued

    async def _expire_envelopes(self) -> int:
        now = datetime.now(timezone.utc)
        notifications: list[tuple[str, EmailContent]] = []
        db = self._get_session()
        try:
            envelopes = (
                db.query(EsignEnvelope)
                .options(joinedload(EsignEnvelope.recipients))
                .filter(
                    EsignEnvelope.status.in_(ACTIVE_STATUSES),
                    EsignEnvelope.expires_at.isnot(None),
                    EsignEnvelope.expires_at < now,
                )
                .all()
            )
            for envelope in envelopes:
                envelope.status = EsignEnvelopeStatus.EXPIRED
                audit_service.record_event(
                    db,
                    envelope_id=envelope.id,
                    event_type=EsignEventType.EXPIRED,
                    details={"expired_at": now.isoformat(), "expires_at": envelope.expires_at.isoformat()},
                )
                sender_email = envelope.user.email if envelope.user else None
                if sender_email:
                    notifications.append(
                        (
                            sender_email,
                            email_templates.expired(
                                title=envelope.title,
                                url=esign_signing_service.sender_envelope_url(envelope.id),
                            ),
                        )
                    )
            db.commit()
            count = len(envelopes)
        except Exception:
            db.rollback()
            logger.exception("esign expiration sweep failed")
            raise
        finally:
            db.close()

        for sender_email, content in notifications:
            await esign_signing_service._send_content(sender_email, content)
        return count

    async def _send_expiration_warnings(self) -> int:
        """One-time heads-up to the pending signers and the sender before expiry."""
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=EXPIRATION_WARNING_DAYS)
        notifications: list[tuple[str, EmailContent]] = []
        db = self._get_session()
        try:
            envelopes = (
                db.query(EsignEnvelope)
                .options(joinedload(EsignEnvelope.recipients))
                .filter(
                    EsignEnvelope.status.in_(ACTIVE_STATUSES),
                    EsignEnvelope.expires_at.isnot(None),
                    EsignEnvelope.expires_at >= now,
                    EsignEnvelope.expires_at <= cutoff,
                    EsignEnvelope.expiration_warning_sent_at.is_(None),
                )
                .all()
            )
            warned = 0
            for envelope in envelopes:
                targets = esign_signing_service.current_tranche_pending_signers(envelope)
                envelope.expiration_warning_sent_at = now
                sender_email = envelope.user.email if envelope.user else None
                audit_service.record_event(
                    db,
                    envelope_id=envelope.id,
                    event_type=EsignEventType.EXPIRATION_WARNING,
                    details={
                        "expires_at": envelope.expires_at.isoformat(),
                        "recipients": [esign_signing_service.recipient_notification_email(t) for t in targets],
                    },
                )
                for target in targets:
                    notifications.append(
                        (
                            esign_signing_service.recipient_notification_email(target),
                            email_templates.expiration_warning(
                                recipient_name=esign_signing_service.recipient_notification_name(target),
                                title=envelope.title,
                                url=esign_signing_service.recipient_signing_url(db, envelope, target),
                                expires_at=envelope.expires_at,
                                is_sender=False,
                            ),
                        )
                    )
                if sender_email:
                    notifications.append(
                        (
                            sender_email,
                            email_templates.expiration_warning(
                                recipient_name=(envelope.user.display_name or "").strip()
                                or sender_email,
                                title=envelope.title,
                                url=esign_signing_service.sender_envelope_url(envelope.id),
                                expires_at=envelope.expires_at,
                                is_sender=True,
                            ),
                        )
                    )
                warned += 1
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("esign expiration warning sweep failed")
            raise
        finally:
            db.close()

        for email, content in notifications:
            await esign_signing_service._send_content(email, content)
        return warned

    async def _send_due_reminders(self) -> int:
        now = datetime.now(timezone.utc)
        reminders: list[tuple[str, EmailContent]] = []
        db = self._get_session()
        try:
            envelopes = (
                db.query(EsignEnvelope)
                .options(joinedload(EsignEnvelope.recipients))
                .filter(
                    EsignEnvelope.status.in_(ACTIVE_STATUSES),
                    EsignEnvelope.reminder_interval_hours.isnot(None),
                )
                .all()
            )
            for envelope in envelopes:
                interval = int(envelope.reminder_interval_hours or 0)
                if interval <= 0:
                    continue
                anchor = envelope.last_reminder_at or envelope.sent_at
                if anchor is None or now - anchor < timedelta(hours=interval):
                    continue
                targets = esign_signing_service.current_tranche_pending_signers(envelope)
                if not targets:
                    continue
                envelope.last_reminder_at = now
                sender_name = esign_signing_service._sender_name(envelope)
                audit_service.record_event(
                    db,
                    envelope_id=envelope.id,
                    event_type=EsignEventType.REMINDER_SENT,
                    details={"recipients": [esign_signing_service.recipient_notification_email(t) for t in targets], "manual": False},
                )
                for target in targets:
                    reminders.append(
                        (
                            esign_signing_service.recipient_notification_email(target),
                            email_templates.signature_request(
                                recipient_name=esign_signing_service.recipient_notification_name(target),
                                sender_name=sender_name,
                                title=envelope.title,
                                message=None,
                                url=esign_signing_service.recipient_signing_url(db, envelope, target),
                                expires_at=envelope.expires_at,
                                reminder=True,
                            ),
                        )
                    )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("esign reminder sweep failed")
            raise
        finally:
            db.close()

        for email, content in reminders:
            await esign_signing_service._send_content(email, content)
        return len(reminders)


esign_maintenance_service = EsignMaintenanceService()
