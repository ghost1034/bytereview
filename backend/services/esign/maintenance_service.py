"""Hourly e-sign maintenance: expire overdue envelopes and send auto-reminders.

Invoked by the Cloud Scheduler job 'esign-maintenance' via the maintenance
task service. Both operations are threshold-filtered, so duplicate or delayed
runs are naturally idempotent.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session, joinedload

from core.database import db_config
from models.db_models import (
    EsignEnvelope,
    EsignEnvelopeStatus,
    EsignEventType,
)
from services.esign import audit_service
from services.esign.signing_service import esign_signing_service

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = (EsignEnvelopeStatus.SENT, EsignEnvelopeStatus.IN_PROGRESS)


class EsignMaintenanceService:
    def _get_session(self) -> Session:
        return db_config.get_session()

    async def run(self) -> dict[str, Any]:
        expired = await self._expire_envelopes()
        reminded = await self._send_due_reminders()
        return {"expired": expired, "reminders_sent": reminded}

    async def _expire_envelopes(self) -> int:
        now = datetime.now(timezone.utc)
        notifications: list[tuple[str, str]] = []  # (sender_email, title)
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
                    notifications.append((sender_email, envelope.title))
            db.commit()
            count = len(envelopes)
        except Exception:
            db.rollback()
            logger.exception("esign expiration sweep failed")
            raise
        finally:
            db.close()

        for sender_email, title in notifications:
            await esign_signing_service._send_simple_email(
                sender_email,
                f"Envelope expired: {title}",
                (
                    f"Hello,\n\n"
                    f"Your envelope \"{title}\" reached its expiration date before all parties "
                    f"signed, and is now expired. You can create a new envelope to try again.\n\n"
                    f"— CPAAutomation E-Signature"
                ),
            )
        return count

    async def _send_due_reminders(self) -> int:
        now = datetime.now(timezone.utc)
        reminders: list[tuple[str, str, str, str, str]] = []  # (email, name, sender, title, env_id)
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
            sent_count = 0
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
                sender_email = envelope.user.email if envelope.user else ""
                audit_service.record_event(
                    db,
                    envelope_id=envelope.id,
                    event_type=EsignEventType.REMINDER_SENT,
                    details={"recipients": [t.email for t in targets], "manual": False},
                )
                for target in targets:
                    reminders.append(
                        (target.email, target.name, sender_email, envelope.title, str(envelope.id))
                    )
                sent_count += 1
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("esign reminder sweep failed")
            raise
        finally:
            db.close()

        for email, name, sender_email, title, env_id in reminders:
            await esign_signing_service._send_signature_request_email(
                to_email=email,
                recipient_name=name,
                sender_email=sender_email,
                title=title,
                message=None,
                envelope_id=env_id,
                reminder=True,
            )
        return len(reminders)


esign_maintenance_service = EsignMaintenanceService()
