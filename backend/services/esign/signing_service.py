"""Signer-side ceremony + envelope lifecycle transitions for e-sign.

All state transitions (send, view, consent, sign, decline, void, expire)
write append-only audit events inside the same transaction as the state
change. Audit failure on the signing path rolls back the signature — the
trail is the product.
"""

from __future__ import annotations

import base64
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from core.database import db_config
from models.db_models import (
    EsignConsentRecord,
    EsignEnvelope,
    EsignEnvelopeStatus,
    EsignEventType,
    EsignField,
    EsignFieldType,
    EsignRecipient,
    EsignRecipientRole,
    EsignRecipientStatus,
    EsignSignatureRecord,
    EsignSignatureType,
    EsignSigningType,
)
from models.esign import (
    EsignConsentResponse,
    EsignDeclineRequest,
    EsignEnvelopeResponse,
    EsignFieldValueInput,
    EsignInboxItem,
    EsignInboxResponse,
    EsignSignatureInput,
    EsignSigningDocument,
    EsignSigningSessionResponse,
    EsignSubmitResponse,
)
from services.esign import audit_service
from services.esign.audit_service import EsignRequestMeta
from services.esign.envelope_service import (
    DOWNLOAD_URL_MINUTES,
    DEFAULT_EXPIRES_DAYS,
    EsignConflict,
    EsignError,
    EsignNotFound,
    esign_envelope_service,
    sha256_hex,
)
from services.gcs_service import get_storage_service

logger = logging.getLogger(__name__)

MAX_SIGNATURE_IMAGE_BYTES = int(os.getenv("ESIGN_MAX_SIGNATURE_IMAGE_BYTES", str(1024 * 1024)))
ALLOWED_TYPED_FONTS = {"dancing-script", "caveat", "great-vibes", "homemade-apple"}

ACTIVE_ENVELOPE_STATUSES = (EsignEnvelopeStatus.SENT, EsignEnvelopeStatus.IN_PROGRESS)


def _app_base_url() -> str:
    explicit = os.getenv("ESIGN_APP_BASE_URL")
    if explicit:
        return explicit.rstrip("/")
    if os.getenv("ENVIRONMENT") == "production":
        return "https://cpaautomation.ai"
    return "http://localhost:3000"


def signing_url(envelope_id) -> str:
    return f"{_app_base_url()}/dashboard/esign/sign/{envelope_id}"


def _advisory_lock_keys(lock_id: str) -> tuple[int, int]:
    lock_uuid = uuid.UUID(str(lock_id))
    value = lock_uuid.int
    key_1 = (value >> 32) & 0xFFFFFFFF
    key_2 = value & 0xFFFFFFFF
    if key_1 >= 2**31:
        key_1 -= 2**32
    if key_2 >= 2**31:
        key_2 -= 2**32
    return int(key_1), int(key_2)


def acquire_envelope_lock(db: Session, envelope_id: str) -> None:
    """Blocking advisory lock scoped to the transaction (auto-released on commit/rollback)."""
    bind = getattr(db, "bind", None)
    if not bind or getattr(getattr(bind, "dialect", None), "name", "") != "postgresql":
        return
    key_1, key_2 = _advisory_lock_keys(envelope_id)
    db.execute(text("SELECT pg_advisory_xact_lock(:k1, :k2)"), {"k1": key_1, "k2": key_2})


class EsignSigningService:
    def __init__(self) -> None:
        self.storage = get_storage_service()

    def _get_session(self) -> Session:
        return db_config.get_session()

    # ------------------------------------------------------------------
    # Recipient resolution
    # ------------------------------------------------------------------

    def _load_envelope_any(self, db: Session, envelope_id: str) -> EsignEnvelope:
        try:
            env_uuid = uuid.UUID(str(envelope_id))
        except ValueError:
            raise EsignNotFound("Envelope not found")
        envelope = (
            db.query(EsignEnvelope)
            .options(
                joinedload(EsignEnvelope.documents),
                joinedload(EsignEnvelope.recipients),
                joinedload(EsignEnvelope.fields),
            )
            .filter(EsignEnvelope.id == env_uuid)
            .first()
        )
        if not envelope:
            raise EsignNotFound("Envelope not found")
        return envelope

    def _find_recipient(
        self, envelope: EsignEnvelope, user_email: str, *, signer_only: bool = True
    ) -> EsignRecipient:
        email = (user_email or "").strip().lower()
        for recipient in envelope.recipients or []:
            if recipient.email == email and (not signer_only or recipient.role == EsignRecipientRole.SIGNER):
                return recipient
        raise EsignNotFound("Envelope not found")  # don't leak existence to non-recipients

    def _backfill_recipient_user(self, recipient: EsignRecipient, user_id: str) -> None:
        if recipient.recipient_user_id is None:
            recipient.recipient_user_id = user_id

    def _is_recipients_turn(self, envelope: EsignEnvelope, recipient: EsignRecipient) -> bool:
        if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
            return False
        if recipient.status in (EsignRecipientStatus.SIGNED, EsignRecipientStatus.DECLINED):
            return False
        if envelope.signing_type == EsignSigningType.PARALLEL:
            return True
        return envelope.current_routing_order is not None and (
            int(recipient.routing_order) == int(envelope.current_routing_order)
        )

    # ------------------------------------------------------------------
    # Send
    # ------------------------------------------------------------------

    async def send_envelope(
        self, *, user_id: str, user_email: str, envelope_id: str, meta: EsignRequestMeta
    ) -> EsignEnvelopeResponse:
        notifications: list[tuple[str, str, EsignEnvelope]] = []
        db = self._get_session()
        try:
            envelope = esign_envelope_service._load_envelope(db, user_id, envelope_id)
            if envelope.status in ACTIVE_ENVELOPE_STATUSES:
                # Idempotent: re-sending an already-sent envelope is a no-op.
                return esign_envelope_service._serialize_envelope(envelope)
            if envelope.status != EsignEnvelopeStatus.DRAFT:
                raise EsignConflict(f"Envelope cannot be sent from status '{envelope.status.value}'")

            documents = envelope.documents or []
            if not documents:
                raise EsignError("Add at least one PDF before sending")
            signers = [r for r in (envelope.recipients or []) if r.role == EsignRecipientRole.SIGNER]
            if not signers:
                raise EsignError("Add at least one signer before sending")

            fields_by_recipient: dict[str, list[EsignField]] = {}
            for field in envelope.fields or []:
                fields_by_recipient.setdefault(str(field.recipient_id), []).append(field)
            for signer in signers:
                signer_fields = fields_by_recipient.get(str(signer.id), [])
                if not any(f.required for f in signer_fields):
                    raise EsignError(f"Signer {signer.email} has no required fields placed")
                if not any(f.field_type == EsignFieldType.SIGNATURE for f in signer_fields):
                    raise EsignError(f"Signer {signer.email} has no signature field placed")

            now = datetime.now(timezone.utc)
            envelope.status = EsignEnvelopeStatus.SENT
            envelope.sent_at = now
            if envelope.expires_at is None:
                envelope.expires_at = now + timedelta(days=DEFAULT_EXPIRES_DAYS)
            first_order = min(int(s.routing_order) for s in signers)
            envelope.current_routing_order = first_order

            if envelope.signing_type == EsignSigningType.PARALLEL:
                tranche = signers
            else:
                tranche = [s for s in signers if int(s.routing_order) == first_order]
            for signer in tranche:
                signer.status = EsignRecipientStatus.NOTIFIED
                notifications.append((signer.email, signer.name, envelope))

            audit_service.record_event(
                db,
                envelope_id=envelope.id,
                event_type=EsignEventType.SENT,
                actor_user_id=user_id,
                actor_email=user_email,
                meta=meta,
                details={
                    "recipient_count": len(signers),
                    "first_routing_order": first_order,
                    "notified": [s.email for s in tranche],
                },
            )
            db.commit()
            db.refresh(envelope)
            response = esign_envelope_service._serialize_envelope(envelope)
            sender_email = user_email
            envelope_title = envelope.title
            envelope_message = envelope.message
            env_id = str(envelope.id)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        # Best-effort emails after commit — a mail failure must not undo the send.
        for to_email, name, _env in notifications:
            await self._send_signature_request_email(
                to_email=to_email,
                recipient_name=name,
                sender_email=sender_email,
                title=envelope_title,
                message=envelope_message,
                envelope_id=env_id,
            )
        return response

    # ------------------------------------------------------------------
    # Inbox / signing session
    # ------------------------------------------------------------------

    def get_inbox(self, *, user_id: str, user_email: str) -> EsignInboxResponse:
        email = (user_email or "").strip().lower()
        db = self._get_session()
        try:
            rows = (
                db.query(EsignRecipient, EsignEnvelope)
                .join(EsignEnvelope, EsignRecipient.envelope_id == EsignEnvelope.id)
                .filter(
                    EsignRecipient.email == email,
                    EsignRecipient.role == EsignRecipientRole.SIGNER,
                    EsignEnvelope.status.in_(ACTIVE_ENVELOPE_STATUSES),
                    EsignRecipient.status.notin_(
                        [EsignRecipientStatus.SIGNED, EsignRecipientStatus.DECLINED]
                    ),
                )
                .order_by(EsignEnvelope.sent_at.desc())
                .all()
            )
            items = []
            dirty = False
            for recipient, envelope in rows:
                if recipient.recipient_user_id is None:
                    recipient.recipient_user_id = user_id
                    dirty = True
                items.append(
                    EsignInboxItem(
                        envelope_id=str(envelope.id),
                        recipient_id=str(recipient.id),
                        title=envelope.title,
                        message=envelope.message,
                        sender_email=self._sender_email(db, envelope),
                        status=recipient.status.value if hasattr(recipient.status, "value") else str(recipient.status),
                        envelope_status=envelope.status.value if hasattr(envelope.status, "value") else str(envelope.status),
                        routing_order=int(recipient.routing_order),
                        is_my_turn=self._is_recipients_turn(envelope, recipient),
                        expires_at=envelope.expires_at,
                        sent_at=envelope.sent_at,
                        created_at=envelope.created_at,
                    )
                )
            if dirty:
                db.commit()
            return EsignInboxResponse(items=items)
        finally:
            db.close()

    def _sender_email(self, db: Session, envelope: EsignEnvelope) -> str:
        if envelope.user and envelope.user.email:
            return envelope.user.email
        return ""

    async def get_signing_session(
        self, *, user_id: str, user_email: str, envelope_id: str, meta: EsignRequestMeta
    ) -> EsignSigningSessionResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope_any(db, envelope_id)
            recipient = self._find_recipient(envelope, user_email)
            self._backfill_recipient_user(recipient, user_id)

            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                raise EsignConflict(
                    f"This envelope is no longer available for signing (status: {envelope.status.value})"
                )
            if not self._is_recipients_turn(envelope, recipient):
                if recipient.status == EsignRecipientStatus.SIGNED:
                    raise EsignConflict("You have already signed this envelope")
                raise PermissionError("It is not your turn to sign yet")

            # First view: record evidence before anything else.
            if recipient.viewed_at is None:
                recipient.viewed_at = datetime.now(timezone.utc)
                if recipient.status in (EsignRecipientStatus.PENDING, EsignRecipientStatus.NOTIFIED):
                    recipient.status = EsignRecipientStatus.VIEWED
                audit_service.record_event(
                    db,
                    envelope_id=envelope.id,
                    event_type=EsignEventType.VIEWED,
                    actor_user_id=user_id,
                    actor_email=user_email,
                    recipient_id=recipient.id,
                    meta=meta,
                )
                if envelope.status == EsignEnvelopeStatus.SENT:
                    envelope.status = EsignEnvelopeStatus.IN_PROGRESS
            db.commit()
            db.refresh(envelope)
            db.refresh(recipient)

            consent_exists = (
                db.query(EsignConsentRecord)
                .filter(
                    EsignConsentRecord.envelope_id == envelope.id,
                    EsignConsentRecord.recipient_id == recipient.id,
                )
                .first()
                is not None
            )

            documents = []
            for doc in sorted(envelope.documents or [], key=lambda d: d.display_order):
                url = await self.storage.generate_presigned_get_url(
                    doc.gcs_object_name, expiration_minutes=DOWNLOAD_URL_MINUTES
                )
                documents.append(
                    EsignSigningDocument(
                        id=str(doc.id),
                        display_order=int(doc.display_order or 0),
                        original_filename=doc.original_filename,
                        page_count=int(doc.page_count or 0),
                        download_url=url,
                    )
                )

            my_fields = [
                esign_envelope_service._serialize_field(f)
                for f in (envelope.fields or [])
                if str(f.recipient_id) == str(recipient.id)
            ]

            return EsignSigningSessionResponse(
                envelope_id=str(envelope.id),
                recipient_id=str(recipient.id),
                title=envelope.title,
                message=envelope.message,
                sender_email=self._sender_email(db, envelope),
                envelope_status=envelope.status.value if hasattr(envelope.status, "value") else str(envelope.status),
                recipient_status=recipient.status.value if hasattr(recipient.status, "value") else str(recipient.status),
                is_my_turn=True,
                consent_required=not consent_exists,
                consent_disclosure_text=envelope.consent_disclosure_text,
                documents=documents,
                fields=my_fields,
                expires_at=envelope.expires_at,
            )
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Consent
    # ------------------------------------------------------------------

    def record_consent(
        self, *, user_id: str, user_email: str, envelope_id: str, meta: EsignRequestMeta
    ) -> EsignConsentResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope_any(db, envelope_id)
            recipient = self._find_recipient(envelope, user_email)
            self._backfill_recipient_user(recipient, user_id)
            if not self._is_recipients_turn(envelope, recipient):
                raise PermissionError("It is not your turn to sign yet")

            existing = (
                db.query(EsignConsentRecord)
                .filter(
                    EsignConsentRecord.envelope_id == envelope.id,
                    EsignConsentRecord.recipient_id == recipient.id,
                )
                .first()
            )
            if existing:
                db.commit()
                return EsignConsentResponse(
                    consented_at=existing.consented_at,
                    consent_text_sha256=existing.consent_text_sha256,
                )

            digest = sha256_hex((envelope.consent_disclosure_text or "").encode("utf-8"))
            record = EsignConsentRecord(
                id=uuid.uuid4(),
                envelope_id=envelope.id,
                recipient_id=recipient.id,
                consent_text_sha256=digest,
                ip_address=meta.ip_address,
                user_agent=meta.user_agent,
            )
            db.add(record)
            recipient.consented_at = datetime.now(timezone.utc)
            if recipient.status in (
                EsignRecipientStatus.PENDING,
                EsignRecipientStatus.NOTIFIED,
                EsignRecipientStatus.VIEWED,
            ):
                recipient.status = EsignRecipientStatus.CONSENTED
            audit_service.record_event(
                db,
                envelope_id=envelope.id,
                event_type=EsignEventType.CONSENT_GIVEN,
                actor_user_id=user_id,
                actor_email=user_email,
                recipient_id=recipient.id,
                meta=meta,
                details={"consent_text_sha256": digest},
            )
            db.commit()
            db.refresh(record)
            return EsignConsentResponse(
                consented_at=record.consented_at,
                consent_text_sha256=record.consent_text_sha256,
            )
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Submit ("Adopt and Sign")
    # ------------------------------------------------------------------

    def _decode_signature_image(self, data_url: str) -> bytes:
        prefix = "data:image/png;base64,"
        if not data_url or not data_url.startswith(prefix):
            raise EsignError("Drawn signature must be a base64 PNG data URL")
        try:
            content = base64.b64decode(data_url[len(prefix):], validate=True)
        except Exception:
            raise EsignError("Drawn signature is not valid base64")
        if len(content) > MAX_SIGNATURE_IMAGE_BYTES:
            raise EsignError("Signature image is too large")
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise EsignError("Signature image must be a PNG")
        return content

    async def submit_signature(
        self,
        *,
        user_id: str,
        user_email: str,
        envelope_id: str,
        signature: EsignSignatureInput,
        field_values: list[EsignFieldValueInput],
        meta: EsignRequestMeta,
    ) -> EsignSubmitResponse:
        # Validate + upload the signature image before opening the transaction.
        image_bytes: Optional[bytes] = None
        if signature.signature_type == EsignSignatureType.DRAWN.value:
            image_bytes = self._decode_signature_image(signature.image_data_url or "")
        elif signature.signature_type == EsignSignatureType.TYPED.value:
            if not (signature.typed_text or "").strip():
                raise EsignError("Typed signature text is required")
            if signature.typed_font and signature.typed_font not in ALLOWED_TYPED_FONTS:
                raise EsignError(f"Unsupported signature font: {signature.typed_font}")
        else:
            raise EsignError(f"Invalid signature type: {signature.signature_type}")

        sealing_enqueued = False
        next_tranche_emails: list[tuple[str, str]] = []
        db = self._get_session()
        try:
            # Serialize concurrent submits on the same envelope (two final
            # signers must not both enqueue sealing).
            acquire_envelope_lock(db, envelope_id)

            envelope = self._load_envelope_any(db, envelope_id)
            recipient = self._find_recipient(envelope, user_email)
            self._backfill_recipient_user(recipient, user_id)

            if recipient.status == EsignRecipientStatus.SIGNED:
                raise EsignConflict("You have already signed this envelope")
            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                raise EsignConflict(
                    f"This envelope is no longer available for signing (status: {envelope.status.value})"
                )
            if not self._is_recipients_turn(envelope, recipient):
                raise PermissionError("It is not your turn to sign yet")

            consent = (
                db.query(EsignConsentRecord)
                .filter(
                    EsignConsentRecord.envelope_id == envelope.id,
                    EsignConsentRecord.recipient_id == recipient.id,
                )
                .first()
            )
            if not consent:
                raise EsignError("You must consent to electronic records before signing")

            now = datetime.now(timezone.utc)

            # Persist the adopted signature artifact.
            image_object_name = None
            image_sha = None
            if image_bytes is not None:
                image_object_name = (
                    f"esign/{envelope.user_id}/{envelope.id}/signatures/{recipient.id}_{uuid.uuid4().hex[:8]}.png"
                )
                await self.storage.upload_file_content(image_bytes, image_object_name)
                image_sha = sha256_hex(image_bytes)

            signature_record = EsignSignatureRecord(
                id=uuid.uuid4(),
                envelope_id=envelope.id,
                recipient_id=recipient.id,
                signature_type=EsignSignatureType(signature.signature_type),
                image_gcs_object_name=image_object_name,
                image_sha256=image_sha,
                typed_text=(signature.typed_text or "").strip() or None,
                typed_font=signature.typed_font,
            )
            db.add(signature_record)
            db.flush()

            # Apply field values.
            values_by_field = {str(v.field_id): v.value for v in field_values}
            my_fields = [f for f in (envelope.fields or []) if str(f.recipient_id) == str(recipient.id)]
            for field in my_fields:
                if field.field_type in (EsignFieldType.SIGNATURE, EsignFieldType.INITIALS):
                    field.value = str(signature_record.id)
                elif field.field_type == EsignFieldType.DATE_SIGNED:
                    field.value = now.strftime("%Y-%m-%d")
                else:
                    provided = values_by_field.get(str(field.id))
                    if field.field_type == EsignFieldType.CHECKBOX:
                        field.value = "true" if str(provided).lower() in ("true", "1", "yes", "on") else "false"
                    else:
                        field.value = (provided or "").strip() or None
                    if field.required and field.field_type == EsignFieldType.TEXT and not field.value:
                        raise EsignError(f"Required field '{field.label or 'text'}' is missing a value")

            recipient.status = EsignRecipientStatus.SIGNED
            recipient.signed_at = now
            if envelope.status == EsignEnvelopeStatus.SENT:
                envelope.status = EsignEnvelopeStatus.IN_PROGRESS

            audit_service.record_event(
                db,
                envelope_id=envelope.id,
                event_type=EsignEventType.SIGNED,
                actor_user_id=user_id,
                actor_email=user_email,
                recipient_id=recipient.id,
                meta=meta,
                details={
                    "signature_record_id": str(signature_record.id),
                    "signature_type": signature.signature_type,
                    "signature_image_sha256": image_sha,
                    "field_count": len(my_fields),
                    "consent_record_id": str(consent.id),
                },
            )

            # Routing advancement (still under the advisory lock).
            signers = [r for r in (envelope.recipients or []) if r.role == EsignRecipientRole.SIGNER]
            unsigned = [r for r in signers if r.status != EsignRecipientStatus.SIGNED]
            if not unsigned:
                sealing_enqueued = True
            elif envelope.signing_type == EsignSigningType.SEQUENTIAL:
                current = int(envelope.current_routing_order or 0)
                remaining_current = [r for r in unsigned if int(r.routing_order) == current]
                if not remaining_current:
                    next_order = min(int(r.routing_order) for r in unsigned)
                    envelope.current_routing_order = next_order
                    for r in unsigned:
                        if int(r.routing_order) == next_order and r.status == EsignRecipientStatus.PENDING:
                            r.status = EsignRecipientStatus.NOTIFIED
                            next_tranche_emails.append((r.email, r.name))

            db.commit()
            envelope_status_value = (
                envelope.status.value if hasattr(envelope.status, "value") else str(envelope.status)
            )
            sender_email = self._sender_email(db, envelope)
            envelope_title = envelope.title
            envelope_message = envelope.message
            env_id = str(envelope.id)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        if sealing_enqueued:
            from services.cloud_run_task_service import cloud_run_task_service

            await cloud_run_task_service.enqueue_envelope_seal_task(env_id)

        for to_email, name in next_tranche_emails:
            await self._send_signature_request_email(
                to_email=to_email,
                recipient_name=name,
                sender_email=sender_email,
                title=envelope_title,
                message=envelope_message,
                envelope_id=env_id,
            )

        return EsignSubmitResponse(
            envelope_status=envelope_status_value,
            recipient_status=EsignRecipientStatus.SIGNED.value,
            sealing_enqueued=sealing_enqueued,
        )

    # ------------------------------------------------------------------
    # Decline / void / remind
    # ------------------------------------------------------------------

    async def decline(
        self, *, user_id: str, user_email: str, envelope_id: str, reason: str, meta: EsignRequestMeta
    ) -> EsignSubmitResponse:
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load_envelope_any(db, envelope_id)
            recipient = self._find_recipient(envelope, user_email)
            self._backfill_recipient_user(recipient, user_id)

            if recipient.status == EsignRecipientStatus.SIGNED:
                raise EsignConflict("You have already signed this envelope")
            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                raise EsignConflict("This envelope is no longer active")

            now = datetime.now(timezone.utc)
            recipient.status = EsignRecipientStatus.DECLINED
            recipient.declined_at = now
            recipient.declined_reason = reason
            envelope.status = EsignEnvelopeStatus.DECLINED

            audit_service.record_event(
                db,
                envelope_id=envelope.id,
                event_type=EsignEventType.DECLINED,
                actor_user_id=user_id,
                actor_email=user_email,
                recipient_id=recipient.id,
                meta=meta,
                details={"reason": reason},
            )
            db.commit()
            sender_email = self._sender_email(db, envelope)
            envelope_title = envelope.title
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        if sender_email:
            await self._send_simple_email(
                sender_email,
                f"Envelope declined: {envelope_title}",
                (
                    f"Hello,\n\n"
                    f"{user_email} declined to sign \"{envelope_title}\".\n\n"
                    f"Reason: {reason}\n\n"
                    f"— CPAAutomation E-Signature"
                ),
            )
        return EsignSubmitResponse(
            envelope_status=EsignEnvelopeStatus.DECLINED.value,
            recipient_status=EsignRecipientStatus.DECLINED.value,
        )

    async def void_envelope(
        self, *, user_id: str, user_email: str, envelope_id: str, reason: str, meta: EsignRequestMeta
    ) -> EsignEnvelopeResponse:
        notified: list[str] = []
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = esign_envelope_service._load_envelope(db, user_id, envelope_id)
            if envelope.status in (
                EsignEnvelopeStatus.COMPLETED,
                EsignEnvelopeStatus.VOIDED,
                EsignEnvelopeStatus.DECLINED,
                EsignEnvelopeStatus.EXPIRED,
            ):
                raise EsignConflict(f"Envelope cannot be voided from status '{envelope.status.value}'")

            envelope.status = EsignEnvelopeStatus.VOIDED
            envelope.voided_at = datetime.now(timezone.utc)
            envelope.voided_reason = reason
            notified = [
                r.email
                for r in (envelope.recipients or [])
                if r.role == EsignRecipientRole.SIGNER
                and r.status not in (EsignRecipientStatus.PENDING,)
            ]
            audit_service.record_event(
                db,
                envelope_id=envelope.id,
                event_type=EsignEventType.VOIDED,
                actor_user_id=user_id,
                actor_email=user_email,
                meta=meta,
                details={"reason": reason},
            )
            db.commit()
            db.refresh(envelope)
            response = esign_envelope_service._serialize_envelope(envelope)
            envelope_title = envelope.title
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        for email in notified:
            await self._send_simple_email(
                email,
                f"Envelope voided: {envelope_title}",
                (
                    f"Hello,\n\n"
                    f"The envelope \"{envelope_title}\" has been voided by the sender and can no "
                    f"longer be signed.\n\nReason: {reason}\n\n— CPAAutomation E-Signature"
                ),
            )
        return response

    async def send_reminders(
        self, *, user_id: str, user_email: str, envelope_id: str, meta: EsignRequestMeta
    ) -> dict:
        db = self._get_session()
        try:
            envelope = esign_envelope_service._load_envelope(db, user_id, envelope_id)
            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                raise EsignConflict("Only active envelopes can be reminded")
            targets = self.current_tranche_pending_signers(envelope)
            envelope.last_reminder_at = datetime.now(timezone.utc)
            audit_service.record_event(
                db,
                envelope_id=envelope.id,
                event_type=EsignEventType.REMINDER_SENT,
                actor_user_id=user_id,
                actor_email=user_email,
                meta=meta,
                details={"recipients": [t.email for t in targets], "manual": True},
            )
            db.commit()
            sender_email = self._sender_email(db, envelope)
            reminder_targets = [(t.email, t.name) for t in targets]
            envelope_title = envelope.title
            envelope_message = envelope.message
            env_id = str(envelope.id)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        for email, name in reminder_targets:
            await self._send_signature_request_email(
                to_email=email,
                recipient_name=name,
                sender_email=sender_email,
                title=envelope_title,
                message=envelope_message,
                envelope_id=env_id,
                reminder=True,
            )
        return {"reminded": [email for email, _ in reminder_targets]}

    def current_tranche_pending_signers(self, envelope: EsignEnvelope) -> list[EsignRecipient]:
        signers = [
            r
            for r in (envelope.recipients or [])
            if r.role == EsignRecipientRole.SIGNER
            and r.status not in (EsignRecipientStatus.SIGNED, EsignRecipientStatus.DECLINED)
        ]
        if envelope.signing_type == EsignSigningType.PARALLEL:
            return signers
        if envelope.current_routing_order is None:
            return []
        return [r for r in signers if int(r.routing_order) == int(envelope.current_routing_order)]

    # ------------------------------------------------------------------
    # Emails
    # ------------------------------------------------------------------

    async def _send_simple_email(self, to_email: str, subject: str, body: str) -> None:
        import asyncio

        from services.email_service import email_service

        try:
            await asyncio.to_thread(email_service.send_email, to_email, subject, body)
        except Exception:
            logger.exception("Failed to send esign email to %s", to_email)

    async def _send_signature_request_email(
        self,
        *,
        to_email: str,
        recipient_name: str,
        sender_email: str,
        title: str,
        message: Optional[str],
        envelope_id: str,
        reminder: bool = False,
    ) -> None:
        url = signing_url(envelope_id)
        prefix = "Reminder: " if reminder else ""
        subject = f"{prefix}{sender_email} sent you a document to sign: {title}"
        note = f"\nMessage from the sender:\n{message}\n" if message else ""
        body = (
            f"Hello {recipient_name},\n\n"
            f"{sender_email} has requested your electronic signature on \"{title}\".\n"
            f"{note}\n"
            f"Review and sign here:\n{url}\n\n"
            f"You will need to sign in to your CPAAutomation account (or create one with "
            f"this email address) and verify your phone number. This verification is part "
            f"of the signature's identity evidence.\n\n"
            f"— CPAAutomation E-Signature"
        )
        await self._send_simple_email(to_email, subject, body)

    async def send_completion_emails(self, envelope_id: str) -> None:
        """Called by the sealing worker after an envelope completes."""
        db = self._get_session()
        try:
            envelope = self._load_envelope_any(db, envelope_id)
            sender_email = self._sender_email(db, envelope)
            recipients = [r.email for r in (envelope.recipients or [])]
            envelope_title = envelope.title
        finally:
            db.close()

        url = f"{_app_base_url()}/dashboard/esign/{envelope_id}"
        targets = set(recipients)
        if sender_email:
            targets.add(sender_email.lower())
        for email in sorted(targets):
            await self._send_simple_email(
                email,
                f"Completed: {envelope_title}",
                (
                    f"Hello,\n\n"
                    f"All parties have signed \"{envelope_title}\". The completed, digitally "
                    f"sealed document and its certificate of completion are available in "
                    f"CPAAutomation:\n{url}\n\n"
                    f"The sealed PDF carries an embedded digital signature — any modification "
                    f"after completion will invalidate it.\n\n"
                    f"— CPAAutomation E-Signature"
                ),
            )


esign_signing_service = EsignSigningService()
