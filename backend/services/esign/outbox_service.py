"""Durable outbox processing for E-Signature sealing and email delivery."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from core.database import db_config
from models.db_models import (
    EsignEmailDelivery,
    EsignEnvelope,
    EsignEnvelopeStatus,
    EsignWorkItem,
)
from services.esign.email_templates import EmailContent

logger = logging.getLogger(__name__)

MAX_EMAIL_ATTEMPTS = 8
MAX_SEAL_ATTEMPTS = 12


def _backoff(attempt: int, *, maximum_minutes: int = 360) -> timedelta:
    return timedelta(minutes=min(maximum_minutes, 2 ** max(0, attempt - 1)))


class EsignOutboxService:
    def _get_session(self) -> Session:
        return db_config.get_session()

    def queue_email(
        self,
        db: Session,
        *,
        envelope: Optional[EsignEnvelope],
        kind: str,
        to_email: str,
        content: EmailContent,
        idempotency_key: str,
        recipient_id=None,
    ) -> EsignEmailDelivery:
        existing = db.query(EsignEmailDelivery).filter(
            EsignEmailDelivery.idempotency_key == idempotency_key
        ).first()
        if existing:
            return existing
        delivery = EsignEmailDelivery(
            id=uuid.uuid4(),
            firm_id=envelope.firm_id if envelope is not None else None,
            envelope_id=envelope.id if envelope is not None else None,
            recipient_id=recipient_id,
            kind=kind,
            to_email=to_email.strip().lower(),
            subject=content.subject,
            html_body=content.html,
            text_body=content.text,
            idempotency_key=idempotency_key,
            state="queued",
            next_attempt_at=datetime.now(timezone.utc),
        )
        db.add(delivery)
        db.flush()
        return delivery

    async def queue_external_email(
        self, *, kind: str, to_email: str, content: EmailContent, idempotency_key: str,
    ) -> str:
        db = self._get_session()
        try:
            delivery = self.queue_email(
                db, envelope=None, kind=kind, to_email=to_email, content=content,
                idempotency_key=idempotency_key,
            )
            delivery_id = str(delivery.id)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        await self.deliver_due_emails()
        return delivery_id

    def ensure_seal_work(self, db: Session, envelope: EsignEnvelope) -> EsignWorkItem:
        item = db.query(EsignWorkItem).filter(
            EsignWorkItem.envelope_id == envelope.id,
            EsignWorkItem.kind == "seal",
        ).first()
        if item is None:
            item = EsignWorkItem(
                id=uuid.uuid4(), firm_id=envelope.firm_id, envelope_id=envelope.id,
                kind="seal", idempotency_key=f"seal:{envelope.id}", state="queued",
                next_attempt_at=datetime.now(timezone.utc), payload={},
            )
            db.add(item)
        envelope.sealing_state = item.state
        if item.state not in ("retry", "terminal"):
            envelope.sealing_last_error = None
        db.flush()
        return item

    async def dispatch_seal(self, work_item_id: str) -> bool:
        db = self._get_session()
        try:
            item = db.query(EsignWorkItem).filter(
                EsignWorkItem.id == uuid.UUID(str(work_item_id))
            ).with_for_update().first()
            if not item or item.state in ("completed", "dispatching", "dispatched", "processing"):
                return False
            envelope_id = str(item.envelope_id)
            item.state = "dispatching"
            item.claimed_at = datetime.now(timezone.utc)
            envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == item.envelope_id).first()
            if envelope:
                envelope.sealing_state = "dispatching"
            db.commit()
        finally:
            db.close()

        try:
            from services.cloud_run_task_service import cloud_run_task_service
            await cloud_run_task_service.enqueue_envelope_seal_task(envelope_id)
        except Exception as exc:
            db = self._get_session()
            try:
                item = db.query(EsignWorkItem).filter(EsignWorkItem.id == uuid.UUID(str(work_item_id))).first()
                if item and item.state != "completed":
                    item.attempt_count += 1
                    item.last_error = str(exc)[:4000]
                    item.state = "terminal" if item.attempt_count >= MAX_SEAL_ATTEMPTS else "retry"
                    item.next_attempt_at = datetime.now(timezone.utc) + _backoff(item.attempt_count)
                    envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == item.envelope_id).first()
                    if envelope:
                        envelope.sealing_state = item.state
                        envelope.sealing_last_error = item.last_error
                    db.commit()
            finally:
                db.close()
            logger.exception("Failed to dispatch E-Signature seal work %s", work_item_id)
            return False

        db = self._get_session()
        try:
            item = db.query(EsignWorkItem).filter(EsignWorkItem.id == uuid.UUID(str(work_item_id))).first()
            if item and item.state != "completed":
                item.state = "dispatched"
                item.claimed_at = datetime.now(timezone.utc)
                envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == item.envelope_id).first()
                if envelope:
                    envelope.sealing_state = "dispatched"
                    envelope.sealing_last_error = None
                db.commit()
        finally:
            db.close()
        return True

    def mark_seal_processing(self, db: Session, envelope: EsignEnvelope) -> None:
        item = db.query(EsignWorkItem).filter(
            EsignWorkItem.envelope_id == envelope.id, EsignWorkItem.kind == "seal"
        ).first()
        if item:
            item.state = "processing"
            item.attempt_count += 1
            item.claimed_at = datetime.now(timezone.utc)
        envelope.sealing_state = "processing"
        envelope.sealing_started_at = datetime.now(timezone.utc)
        envelope.sealing_last_error = None
        db.flush()

    def mark_seal_completed(self, db: Session, envelope: EsignEnvelope) -> None:
        item = db.query(EsignWorkItem).filter(
            EsignWorkItem.envelope_id == envelope.id, EsignWorkItem.kind == "seal"
        ).first()
        if item:
            item.state = "completed"
            item.completed_at = datetime.now(timezone.utc)
            item.last_error = None
        envelope.sealing_state = "completed"
        envelope.sealing_last_error = None
        db.flush()

    def mark_seal_failed(self, envelope_id: str, error: Exception) -> None:
        db = self._get_session()
        try:
            item = db.query(EsignWorkItem).filter(
                EsignWorkItem.envelope_id == uuid.UUID(str(envelope_id)), EsignWorkItem.kind == "seal"
            ).first()
            envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == uuid.UUID(str(envelope_id))).first()
            attempt = (item.attempt_count + 1) if item else 1
            state = "terminal" if attempt >= MAX_SEAL_ATTEMPTS else "retry"
            if item:
                item.attempt_count = attempt
                item.state = state
                item.last_error = str(error)[:4000]
                item.next_attempt_at = datetime.now(timezone.utc) + _backoff(attempt)
            if envelope:
                envelope.sealing_state = state
                envelope.sealing_last_error = str(error)[:4000]
            db.commit()
        finally:
            db.close()

    async def dispatch_due_seals(self, limit: int = 50) -> int:
        now = datetime.now(timezone.utc)
        stale = now - timedelta(minutes=15)
        db = self._get_session()
        try:
            # Reconcile final recipient state even when an older deployment
            # committed completion before the outbox migration.
            candidates = db.query(EsignEnvelope).filter(
                EsignEnvelope.status.in_((EsignEnvelopeStatus.SENT, EsignEnvelopeStatus.IN_PROGRESS)),
                EsignEnvelope.sealed_gcs_object_name.is_(None),
            ).limit(200).all()
            from services.esign.routing_engine import incomplete_blocking
            for envelope in candidates:
                if not incomplete_blocking(envelope.recipients or []):
                    self.ensure_seal_work(db, envelope)
            db.query(EsignWorkItem).filter(
                EsignWorkItem.kind == "seal",
                EsignWorkItem.state.in_(("dispatching", "dispatched", "processing")),
                EsignWorkItem.claimed_at < stale,
            ).update({EsignWorkItem.state: "retry", EsignWorkItem.next_attempt_at: now}, synchronize_session=False)
            db.commit()
            ids = [str(row.id) for row in db.query(EsignWorkItem).filter(
                EsignWorkItem.kind == "seal",
                EsignWorkItem.state.in_(("queued", "retry")),
                EsignWorkItem.next_attempt_at <= now,
            ).with_for_update(skip_locked=True).limit(limit).all()]
        finally:
            db.close()
        for item_id in ids:
            await self.dispatch_seal(item_id)
        return len(ids)

    async def deliver_due_emails(self, limit: int = 100, envelope_id: Optional[str] = None) -> int:
        now = datetime.now(timezone.utc)
        db = self._get_session()
        try:
            db.query(EsignEmailDelivery).filter(
                EsignEmailDelivery.state == "sending",
                EsignEmailDelivery.updated_at < now - timedelta(minutes=15),
            ).update({
                EsignEmailDelivery.state: "retry",
                EsignEmailDelivery.next_attempt_at: now,
                EsignEmailDelivery.last_error: "Delivery claim expired before completion",
            }, synchronize_session=False)
            db.commit()
            query = db.query(EsignEmailDelivery).filter(
                EsignEmailDelivery.state.in_(("queued", "retry")),
                EsignEmailDelivery.next_attempt_at <= now,
            )
            if envelope_id:
                query = query.filter(EsignEmailDelivery.envelope_id == uuid.UUID(str(envelope_id)))
            rows = query.with_for_update(skip_locked=True).limit(limit).all()
            ids = [row.id for row in rows]
            for row in rows:
                row.state = "sending"
                row.attempt_count += 1
            db.commit()
        finally:
            db.close()

        for delivery_id in ids:
            await self._deliver_email(delivery_id)
        return len(ids)

    async def _deliver_email(self, delivery_id) -> None:
        db = self._get_session()
        try:
            delivery = db.query(EsignEmailDelivery).filter(EsignEmailDelivery.id == delivery_id).first()
            if not delivery or delivery.state == "delivered":
                return
            to_email, subject, html, plain = delivery.to_email, delivery.subject, delivery.html_body, delivery.text_body
        finally:
            db.close()
        try:
            from services.esign.signing_service import esign_signing_service
            await esign_signing_service._send_content(
                to_email, EmailContent(subject=subject, html=html, text=plain)
            )
        except Exception as exc:
            db = self._get_session()
            try:
                delivery = db.query(EsignEmailDelivery).filter(EsignEmailDelivery.id == delivery_id).first()
                if delivery and delivery.state != "delivered":
                    delivery.last_error = str(exc)[:4000]
                    delivery.state = "terminal" if delivery.attempt_count >= MAX_EMAIL_ATTEMPTS else "retry"
                    delivery.next_attempt_at = datetime.now(timezone.utc) + _backoff(delivery.attempt_count)
                    db.commit()
            finally:
                db.close()
            logger.exception("E-Signature email delivery %s failed", delivery_id)
            return
        db = self._get_session()
        try:
            delivery = db.query(EsignEmailDelivery).filter(EsignEmailDelivery.id == delivery_id).first()
            if delivery:
                delivery.state = "delivered"
                delivery.delivered_at = datetime.now(timezone.utc)
                delivery.last_error = None
                db.commit()
        finally:
            db.close()

    def retry_email(self, user_id: str, envelope_id: str, delivery_id: str) -> dict:
        from services.esign.envelope_service import EsignConflict, EsignNotFound, esign_envelope_service
        db = self._get_session()
        try:
            delivery = db.query(EsignEmailDelivery).filter(EsignEmailDelivery.id == uuid.UUID(str(delivery_id))).first()
            if not delivery or not delivery.envelope_id:
                raise EsignNotFound("Email delivery not found")
            envelope = esign_envelope_service._load_envelope(db, user_id, envelope_id)
            if delivery.envelope_id != envelope.id:
                raise EsignNotFound("Email delivery not found")
            if delivery.state == "delivered":
                raise EsignConflict("This email has already been delivered")
            delivery.state = "queued"
            delivery.attempt_count = 0
            delivery.next_attempt_at = datetime.now(timezone.utc)
            delivery.last_error = None
            db.commit()
            return self.serialize_email(delivery)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def list_emails(self, user_id: str, envelope_id: str) -> list[dict]:
        from services.esign.envelope_service import esign_envelope_service
        db = self._get_session()
        try:
            envelope = esign_envelope_service._load_envelope(db, user_id, envelope_id)
            rows = db.query(EsignEmailDelivery).filter(
                EsignEmailDelivery.envelope_id == envelope.id
            ).order_by(EsignEmailDelivery.created_at.desc()).all()
            return [self.serialize_email(row) for row in rows]
        finally:
            db.close()

    def retry_seal(self, user_id: str, envelope_id: str) -> str:
        from services.esign.envelope_service import EsignConflict, esign_envelope_service
        from services.esign.routing_engine import incomplete_blocking
        db = self._get_session()
        try:
            envelope = esign_envelope_service._load_envelope(db, user_id, envelope_id)
            if envelope.sealed_gcs_object_name:
                raise EsignConflict("Envelope is already sealed")
            if incomplete_blocking(envelope.recipients or []):
                raise EsignConflict("Envelope still has incomplete recipients")
            item = self.ensure_seal_work(db, envelope)
            item.state = "queued"
            item.attempt_count = 0
            item.last_error = None
            item.next_attempt_at = datetime.now(timezone.utc)
            envelope.sealing_state = "queued"
            envelope.sealing_last_error = None
            db.commit()
            return str(item.id)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def serialize_email(row: EsignEmailDelivery) -> dict:
        return {
            "id": str(row.id), "kind": row.kind, "to_email": row.to_email,
            "state": row.state, "attempt_count": row.attempt_count,
            "last_error": row.last_error, "next_attempt_at": row.next_attempt_at,
            "created_at": row.created_at, "delivered_at": row.delivered_at,
        }


esign_outbox_service = EsignOutboxService()
