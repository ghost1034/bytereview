"""Signer-side ceremony + envelope lifecycle transitions for e-sign.

All state transitions (send, view, consent, sign, decline, void, expire)
write append-only audit events inside the same transaction as the state
change. Audit failure on the signing path rolls back the signature — the
trail is the product.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import fitz
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
    EsignSignerAttachment,
    EsignSignatureType,
    EsignSigningType,
    User,
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
    EsignSignerAttachmentResponse,
    EsignContextField,
)
from services.esign import audit_service, email_templates
from services.esign.audit_service import EsignRequestMeta
from services.esign.email_templates import EmailContent
from services.esign.envelope_service import (
    DOWNLOAD_URL_MINUTES,
    DEFAULT_EXPIRES_DAYS,
    EsignConflict,
    EsignError,
    EsignNotFound,
    esign_envelope_service,
    sha256_hex,
)
from services.esign.field_logic import resolve_required, resolve_visibility
from services.gcs_service import get_storage_service

logger = logging.getLogger(__name__)

MAX_SIGNATURE_IMAGE_BYTES = int(os.getenv("ESIGN_MAX_SIGNATURE_IMAGE_BYTES", str(1024 * 1024)))
MAX_ATTACHMENT_BYTES = int(os.getenv("ESIGN_MAX_ATTACHMENT_BYTES", str(25 * 1024 * 1024)))
ALLOWED_TYPED_FONTS = {"dancing-script", "caveat", "great-vibes", "homemade-apple"}

ACTIVE_ENVELOPE_STATUSES = (EsignEnvelopeStatus.SENT, EsignEnvelopeStatus.IN_PROGRESS)

# Must match formatDateSigned in components/esign/sign/dateSigned.ts — the
# signer sees this exact stamp in the ceremony before submitting.
def format_date_signed(dt: datetime) -> str:
    return f"{dt.month}/{dt.day}/{dt.year}"

# Most recent completed envelopes to keep in a signer's inbox.
COMPLETED_INBOX_LIMIT = int(os.getenv("ESIGN_COMPLETED_INBOX_LIMIT", "25"))


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

    @staticmethod
    def _serialize_attachment(item: EsignSignerAttachment) -> EsignSignerAttachmentResponse:
        return EsignSignerAttachmentResponse(
            id=str(item.id),
            field_id=str(item.field_id),
            original_filename=item.original_filename,
            sha256=item.sha256,
            file_size_bytes=int(item.file_size_bytes),
            content_type=item.content_type,
            uploaded_at=item.uploaded_at,
        )

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

    def _cc_recipients_due(
        self, envelope: EsignEnvelope, active_order: int
    ) -> list[EsignRecipient]:
        """Pending CC recipients whose turn has arrived (all of them in parallel)."""
        ccs = [
            r
            for r in (envelope.recipients or [])
            if r.role == EsignRecipientRole.CC and r.status == EsignRecipientStatus.PENDING
        ]
        if envelope.signing_type == EsignSigningType.PARALLEL:
            return ccs
        return [c for c in ccs if int(c.routing_order) <= active_order]

    async def send_envelope(
        self, *, user_id: str, user_email: str, envelope_id: str, meta: EsignRequestMeta
    ) -> EsignEnvelopeResponse:
        emails: list[tuple[str, EmailContent]] = []
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
            cc_tranche = self._cc_recipients_due(envelope, first_order)
            sender_name = self._sender_name(envelope) or user_email
            url = signing_url(envelope.id)
            for signer in tranche:
                signer.status = EsignRecipientStatus.NOTIFIED
                emails.append(
                    (
                        signer.email,
                        email_templates.signature_request(
                            recipient_name=signer.name,
                            sender_name=sender_name,
                            title=envelope.title,
                            message=envelope.message,
                            url=url,
                            expires_at=envelope.expires_at,
                        ),
                    )
                )
            for cc in cc_tranche:
                cc.status = EsignRecipientStatus.NOTIFIED
                emails.append(
                    (
                        cc.email,
                        email_templates.cc_copy(
                            recipient_name=cc.name,
                            sender_name=sender_name,
                            title=envelope.title,
                            message=envelope.message,
                            url=url,
                            expires_at=envelope.expires_at,
                        ),
                    )
                )

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
                    "cc_notified": [c.email for c in cc_tranche],
                },
            )
            db.commit()
            db.refresh(envelope)
            response = esign_envelope_service._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        # Best-effort emails after commit — a mail failure must not undo the send.
        for to_email, content in emails:
            await self._send_content(to_email, content)
        return response

    # ------------------------------------------------------------------
    # Inbox / signing session
    # ------------------------------------------------------------------

    def get_inbox(self, *, user_id: str, user_email: str) -> EsignInboxResponse:
        email = (user_email or "").strip().lower()
        db = self._get_session()
        try:
            # Signers and CCs both appear — CCs as read-only "copy" entries.
            base = (
                db.query(EsignRecipient, EsignEnvelope)
                .join(EsignEnvelope, EsignRecipient.envelope_id == EsignEnvelope.id)
                .filter(EsignRecipient.email == email)
            )
            rows = (
                base.filter(
                    EsignEnvelope.status.in_(ACTIVE_ENVELOPE_STATUSES),
                    EsignRecipient.status.notin_(
                        [EsignRecipientStatus.SIGNED, EsignRecipientStatus.DECLINED]
                    ),
                )
                .order_by(EsignEnvelope.sent_at.desc())
                .all()
            )
            # Completed envelopes stay listed so signers can reach the sealed
            # document and certificate after the fact.
            completed_rows = (
                base.filter(EsignEnvelope.status == EsignEnvelopeStatus.COMPLETED)
                .order_by(EsignEnvelope.completed_at.desc())
                .limit(COMPLETED_INBOX_LIMIT)
                .all()
            )
            items = []
            dirty = False
            for recipient, envelope in list(rows) + list(completed_rows):
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
                        role=recipient.role.value if hasattr(recipient.role, "value") else str(recipient.role),
                        routing_order=int(recipient.routing_order),
                        is_my_turn=(
                            recipient.role == EsignRecipientRole.SIGNER
                            and self._is_recipients_turn(envelope, recipient)
                        ),
                        expires_at=envelope.expires_at,
                        sent_at=envelope.sent_at,
                        completed_at=envelope.completed_at,
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

    def _sender_name(self, envelope: EsignEnvelope) -> str:
        """Display name for email copy; falls back to the sender's email."""
        user = envelope.user
        if user is None:
            return ""
        return (user.display_name or "").strip() or (user.email or "")

    def sender_envelope_url(self, envelope_id) -> str:
        return f"{_app_base_url()}/dashboard/esign/{envelope_id}"

    async def get_signing_session(
        self, *, user_id: str, user_email: str, envelope_id: str, meta: EsignRequestMeta
    ) -> EsignSigningSessionResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope_any(db, envelope_id)

            if envelope.status == EsignEnvelopeStatus.COMPLETED:
                # Completed envelopes stay viewable to every recipient (signers
                # and CCs) so they can reach the sealed document and certificate.
                recipient = self._find_recipient(envelope, user_email, signer_only=False)
                self._backfill_recipient_user(recipient, user_id)
                db.commit()
                return EsignSigningSessionResponse(
                    envelope_id=str(envelope.id),
                    recipient_id=str(recipient.id),
                    title=envelope.title,
                    message=envelope.message,
                    sender_email=self._sender_email(db, envelope),
                    envelope_status=envelope.status.value,
                    recipient_status=recipient.status.value
                    if hasattr(recipient.status, "value")
                    else str(recipient.status),
                    recipient_role=recipient.role.value
                    if hasattr(recipient.role, "value")
                    else str(recipient.role),
                    is_my_turn=False,
                    consent_required=False,
                    consent_disclosure_text=envelope.consent_disclosure_text,
                    documents=[],
                    fields=[],
                    expires_at=envelope.expires_at,
                )

            recipient = self._find_recipient(envelope, user_email, signer_only=False)
            self._backfill_recipient_user(recipient, user_id)

            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                raise EsignConflict(
                    f"This envelope is no longer available for signing (status: {envelope.status.value})"
                )

            if recipient.role == EsignRecipientRole.CC:
                # Copy recipients get a read-only view of the documents — no
                # consent gate, no fields, no signing turn.
                if recipient.viewed_at is None:
                    recipient.viewed_at = datetime.now(timezone.utc)
                    if recipient.status in (
                        EsignRecipientStatus.PENDING,
                        EsignRecipientStatus.NOTIFIED,
                    ):
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
                db.commit()
                db.refresh(recipient)
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
                return EsignSigningSessionResponse(
                    envelope_id=str(envelope.id),
                    recipient_id=str(recipient.id),
                    title=envelope.title,
                    message=envelope.message,
                    sender_email=self._sender_email(db, envelope),
                    envelope_status=envelope.status.value
                    if hasattr(envelope.status, "value")
                    else str(envelope.status),
                    recipient_status=recipient.status.value
                    if hasattr(recipient.status, "value")
                    else str(recipient.status),
                    recipient_role=EsignRecipientRole.CC.value,
                    is_my_turn=False,
                    consent_required=False,
                    consent_disclosure_text=envelope.consent_disclosure_text,
                    documents=documents,
                    fields=[],
                    expires_at=envelope.expires_at,
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
            context_fields = [
                EsignContextField(
                    id=str(f.id),
                    field_type=f.field_type.value if hasattr(f.field_type, "value") else str(f.field_type),
                    value=f.value,
                    properties=dict(f.properties or {}),
                )
                for f in (envelope.fields or [])
                if str(f.recipient_id) != str(recipient.id)
            ]
            attachment_rows = (
                db.query(EsignSignerAttachment)
                .filter(
                    EsignSignerAttachment.envelope_id == envelope.id,
                    EsignSignerAttachment.recipient_id == recipient.id,
                )
                .all()
            )
            signer_user = db.query(User).filter(User.id == user_id).first()
            company = signer_user.firm.name if signer_user and signer_user.firm else None

            return EsignSigningSessionResponse(
                envelope_id=str(envelope.id),
                recipient_id=str(recipient.id),
                title=envelope.title,
                message=envelope.message,
                sender_email=self._sender_email(db, envelope),
                envelope_status=envelope.status.value if hasattr(envelope.status, "value") else str(envelope.status),
                recipient_status=recipient.status.value if hasattr(recipient.status, "value") else str(recipient.status),
                recipient_role=EsignRecipientRole.SIGNER.value,
                is_my_turn=True,
                consent_required=not consent_exists,
                consent_disclosure_text=envelope.consent_disclosure_text,
                documents=documents,
                fields=my_fields,
                context_fields=context_fields,
                recipient_name=recipient.name,
                recipient_email=recipient.email,
                recipient_company=company,
                attachments=[self._serialize_attachment(item) for item in attachment_rows],
                sent_at=envelope.sent_at,
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
    # Finish Later (save in-progress field entries)
    # ------------------------------------------------------------------

    def save_progress(
        self,
        *,
        user_id: str,
        user_email: str,
        envelope_id: str,
        field_values: list[EsignFieldValueInput],
    ) -> int:
        """Persist text/checkbox drafts so the signer can leave and resume.

        Drafts are working state, not evidence: no audit event is written, and
        submit clears them when the final values land.
        """
        db = self._get_session()
        try:
            envelope = self._load_envelope_any(db, envelope_id)
            recipient = self._find_recipient(envelope, user_email)
            self._backfill_recipient_user(recipient, user_id)
            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                raise EsignConflict("This envelope is no longer active")
            if not self._is_recipients_turn(envelope, recipient):
                raise PermissionError("It is not your turn to sign yet")

            values_by_field = {str(v.field_id): v.value for v in field_values}
            saved = 0
            for field in envelope.fields or []:
                if str(field.recipient_id) != str(recipient.id):
                    continue
                editable = field.field_type in (
                    EsignFieldType.TEXT,
                    EsignFieldType.CHECKBOX,
                    EsignFieldType.DROPDOWN,
                    EsignFieldType.RADIO,
                ) or (
                    field.field_type == EsignFieldType.AUTO_FILL
                    and (field.properties or {}).get("auto_source") == "company"
                )
                if not editable:
                    continue
                if str(field.id) not in values_by_field:
                    continue
                provided = values_by_field[str(field.id)]
                if field.field_type in (EsignFieldType.CHECKBOX, EsignFieldType.RADIO):
                    field.draft_value = "true" if str(provided).lower() in ("true", "1", "yes", "on") else "false"
                elif field.field_type == EsignFieldType.DROPDOWN:
                    options = {str(option.get("value")) for option in (field.properties or {}).get("options", [])}
                    if provided and str(provided) not in options:
                        raise EsignError(f"Invalid option for '{field.label or 'dropdown'}'")
                    field.draft_value = (provided or "").strip() or None
                else:
                    field.draft_value = (provided or "").strip() or None
                saved += 1
            db.commit()
            return saved
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Signer attachments
    # ------------------------------------------------------------------

    async def upload_attachment(
        self,
        *,
        user_id: str,
        user_email: str,
        envelope_id: str,
        field_id: str,
        filename: str,
        content_type: str,
        content: bytes,
    ) -> EsignSignerAttachmentResponse:
        if not content or len(content) > MAX_ATTACHMENT_BYTES:
            raise EsignError("Attachment must be between 1 byte and 25 MB")
        suffix = os.path.splitext(filename or "")[1].lower()
        normalized_type = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
        }.get(suffix)
        if not normalized_type:
            raise EsignError("Attachments must be PDF, PNG, or JPG")
        if normalized_type == "application/pdf":
            try:
                with fitz.open(stream=content, filetype="pdf") as pdf:
                    if pdf.needs_pass or pdf.page_count < 1:
                        raise EsignError("Attachment PDF is encrypted or has no pages")
            except EsignError:
                raise
            except Exception as exc:
                raise EsignError(f"Attachment is not a valid PDF: {exc}")
        elif normalized_type == "image/png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise EsignError("Attachment is not a valid PNG")
        elif normalized_type == "image/jpeg" and not content.startswith(b"\xff\xd8\xff"):
            raise EsignError("Attachment is not a valid JPG")

        db = self._get_session()
        old_object: Optional[str] = None
        object_name: Optional[str] = None
        try:
            envelope = self._load_envelope_any(db, envelope_id)
            recipient = self._find_recipient(envelope, user_email)
            self._backfill_recipient_user(recipient, user_id)
            if not self._is_recipients_turn(envelope, recipient):
                raise PermissionError("It is not your turn to sign yet")
            field = next((f for f in envelope.fields or [] if str(f.id) == str(field_id)), None)
            if not field or field.recipient_id != recipient.id or field.field_type != EsignFieldType.ATTACHMENT:
                raise EsignError("Attachment field not found")

            existing = (
                db.query(EsignSignerAttachment)
                .filter(EsignSignerAttachment.field_id == field.id)
                .first()
            )
            attachment_id = uuid.uuid4()
            safe_name = os.path.basename(filename or f"attachment{suffix}")
            object_name = f"esign/{envelope.user_id}/{envelope.id}/attachments/{attachment_id}_{safe_name}"
            await self.storage.upload_file_content(content, object_name)
            if existing:
                old_object = existing.gcs_object_name
                db.delete(existing)
                db.flush()
            item = EsignSignerAttachment(
                id=attachment_id,
                envelope_id=envelope.id,
                recipient_id=recipient.id,
                field_id=field.id,
                gcs_object_name=object_name,
                original_filename=safe_name,
                sha256=hashlib.sha256(content).hexdigest(),
                file_size_bytes=len(content),
                content_type=normalized_type,
            )
            db.add(item)
            field.draft_value = str(attachment_id)
            db.commit()
            db.refresh(item)
            result = self._serialize_attachment(item)
        except Exception:
            db.rollback()
            if object_name:
                try:
                    await self.storage.delete_file(object_name)
                except Exception:
                    logger.warning("Could not clean up failed attachment upload %s", object_name)
            raise
        finally:
            db.close()
        if old_object:
            try:
                await self.storage.delete_file(old_object)
            except Exception:
                logger.warning("Could not clean up replaced attachment %s", old_object)
        return result

    async def delete_attachment(
        self,
        *,
        user_id: str,
        user_email: str,
        envelope_id: str,
        attachment_id: str,
    ) -> None:
        db = self._get_session()
        object_name: Optional[str] = None
        try:
            envelope = self._load_envelope_any(db, envelope_id)
            recipient = self._find_recipient(envelope, user_email)
            self._backfill_recipient_user(recipient, user_id)
            if not self._is_recipients_turn(envelope, recipient):
                raise PermissionError("It is not your turn to sign yet")
            try:
                parsed_id = uuid.UUID(str(attachment_id))
            except ValueError:
                raise EsignNotFound("Attachment not found")
            item = (
                db.query(EsignSignerAttachment)
                .filter(
                    EsignSignerAttachment.id == parsed_id,
                    EsignSignerAttachment.envelope_id == envelope.id,
                    EsignSignerAttachment.recipient_id == recipient.id,
                )
                .first()
            )
            if not item:
                raise EsignNotFound("Attachment not found")
            object_name = item.gcs_object_name
            field = next((f for f in envelope.fields or [] if f.id == item.field_id), None)
            if field:
                field.draft_value = None
            db.delete(item)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        if object_name:
            try:
                await self.storage.delete_file(object_name)
            except Exception:
                logger.warning("Could not delete attachment object %s", object_name)

    # ------------------------------------------------------------------
    # Submit ("Adopt and Sign")
    # ------------------------------------------------------------------

    def _decode_signature_image(self, data_url: str) -> bytes:
        prefix = "data:image/png;base64,"
        if not data_url or not data_url.startswith(prefix):
            raise EsignError("Signature image must be a base64 PNG data URL")
        try:
            content = base64.b64decode(data_url[len(prefix):], validate=True)
        except Exception:
            raise EsignError("Signature image is not valid base64")
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
        if signature.signature_type in (
            EsignSignatureType.DRAWN.value,
            EsignSignatureType.UPLOADED.value,
        ):
            image_bytes = self._decode_signature_image(signature.image_data_url or "")
        elif signature.signature_type == EsignSignatureType.TYPED.value:
            if not (signature.typed_text or "").strip():
                raise EsignError("Typed signature text is required")
            if signature.typed_font and signature.typed_font not in ALLOWED_TYPED_FONTS:
                raise EsignError(f"Unsupported signature font: {signature.typed_font}")
        else:
            raise EsignError(f"Invalid signature type: {signature.signature_type}")
        initials_image_bytes: Optional[bytes] = None
        if signature.initials_image_data_url:
            initials_image_bytes = self._decode_signature_image(signature.initials_image_data_url)

        sealing_enqueued = False
        emails: list[tuple[str, EmailContent]] = []
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

            # Adopted initials: explicit text wins; otherwise derive from the
            # adopted name so initials fields never render a full name.
            initials_text = (signature.initials_text or "").strip()[:20] or None
            if initials_text is None:
                source = (signature.typed_text or "").strip() or recipient.name or ""
                initials_text = (
                    "".join(p[0].upper() for p in source.split() if p)[:20] or None
                )
            initials_object_name = None
            initials_sha = None
            if initials_image_bytes is not None:
                initials_object_name = (
                    f"esign/{envelope.user_id}/{envelope.id}/signatures/"
                    f"{recipient.id}_{uuid.uuid4().hex[:8]}_initials.png"
                )
                await self.storage.upload_file_content(initials_image_bytes, initials_object_name)
                initials_sha = sha256_hex(initials_image_bytes)

            signature_record = EsignSignatureRecord(
                id=uuid.uuid4(),
                envelope_id=envelope.id,
                recipient_id=recipient.id,
                signature_type=EsignSignatureType(signature.signature_type),
                image_gcs_object_name=image_object_name,
                image_sha256=image_sha,
                typed_text=(signature.typed_text or "").strip() or None,
                typed_font=signature.typed_font,
                initials_text=initials_text,
                initials_image_gcs_object_name=initials_object_name,
                initials_image_sha256=initials_sha,
            )
            db.add(signature_record)
            db.flush()

            # Apply field values. Visibility and requiredness are recomputed on
            # the server; the client cannot bypass a conditional requirement.
            values_by_field = {str(v.field_id): v.value for v in field_values}
            all_fields = list(envelope.fields or [])
            my_fields = [f for f in all_fields if str(f.recipient_id) == str(recipient.id)]
            signer_user = db.query(User).filter(User.id == user_id).first()
            company = signer_user.firm.name if signer_user and signer_user.firm else None
            attachments = (
                db.query(EsignSignerAttachment)
                .filter(
                    EsignSignerAttachment.envelope_id == envelope.id,
                    EsignSignerAttachment.recipient_id == recipient.id,
                )
                .all()
            )
            attachment_by_field = {str(item.field_id): item for item in attachments}

            for field in my_fields:
                field.draft_value = None
                provided = values_by_field.get(str(field.id))
                if field.field_type in (EsignFieldType.SIGNATURE, EsignFieldType.INITIALS):
                    field.value = str(signature_record.id)
                elif field.field_type == EsignFieldType.DATE_SIGNED:
                    field.value = format_date_signed(now)
                elif field.field_type == EsignFieldType.AUTO_FILL:
                    source = (field.properties or {}).get("auto_source")
                    if source == "recipient_name":
                        field.value = recipient.name
                    elif source == "recipient_email":
                        field.value = recipient.email
                    elif source == "date_sent":
                        field.value = format_date_signed(envelope.sent_at or now)
                    else:  # company remains editable, but is authoritatively prefilled
                        field.value = (provided or company or "").strip() or None
                elif field.field_type in (EsignFieldType.CHECKBOX, EsignFieldType.RADIO):
                    field.value = "true" if str(provided).lower() in ("true", "1", "yes", "on") else "false"
                elif field.field_type == EsignFieldType.DROPDOWN:
                    options = {str(option.get("value")) for option in (field.properties or {}).get("options", [])}
                    field.value = (provided or "").strip() or None
                    if field.value and field.value not in options:
                        raise EsignError(f"Invalid option for '{field.label or 'dropdown'}'")
                elif field.field_type == EsignFieldType.ATTACHMENT:
                    item = attachment_by_field.get(str(field.id))
                    field.value = str(item.id) if item else None
                elif field.field_type == EsignFieldType.FORMULA:
                    field.value = None  # finalized only after all signers finish
                else:
                    field.value = (provided or "").strip() or None

            final_values = {str(field.id): field.value for field in all_fields}
            visible = resolve_visibility(all_fields, final_values)
            for field in my_fields:
                if not visible.get(str(field.id), True):
                    field.value = None

            radio_groups: dict[str, list[EsignField]] = {}
            for field in my_fields:
                if field.field_type == EsignFieldType.RADIO and visible.get(str(field.id), True):
                    group_id = str(((field.properties or {}).get("group") or {}).get("id", ""))
                    radio_groups.setdefault(group_id, []).append(field)
            for group_id, members in radio_groups.items():
                selected = [member for member in members if member.value == "true"]
                if len(selected) > 1:
                    raise EsignError(f"Radio group '{group_id}' allows only one selection")
                required = any(resolve_required(member, all_fields, final_values, visible) for member in members)
                if required and len(selected) != 1:
                    label = ((members[0].properties or {}).get("group") or {}).get("label") or "radio group"
                    raise EsignError(f"Required field '{label}' is missing a selection")

            for field in my_fields:
                if field.field_type in (EsignFieldType.FORMULA, EsignFieldType.RADIO):
                    continue
                if not resolve_required(field, all_fields, final_values, visible):
                    continue
                label = field.label or field.field_type.value.replace("_", " ")
                if field.field_type == EsignFieldType.CHECKBOX and field.value != "true":
                    raise EsignError(f"Required field '{label}' must be checked")
                if field.field_type == EsignFieldType.ATTACHMENT and not field.value:
                    raise EsignError(f"Required attachment '{label}' is missing")
                if field.field_type not in (
                    EsignFieldType.SIGNATURE,
                    EsignFieldType.INITIALS,
                    EsignFieldType.DATE_SIGNED,
                    EsignFieldType.CHECKBOX,
                ) and not field.value:
                    raise EsignError(f"Required field '{label}' is missing a value")

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
                    "initials_text": initials_text,
                    "initials_image_sha256": initials_sha,
                    "field_count": len(my_fields),
                    "consent_record_id": str(consent.id),
                },
            )

            # Routing advancement (still under the advisory lock).
            sender_email = self._sender_email(db, envelope)
            sender_name = self._sender_name(envelope)
            url = signing_url(envelope.id)
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
                            emails.append(
                                (
                                    r.email,
                                    email_templates.signature_request(
                                        recipient_name=r.name,
                                        sender_name=sender_name,
                                        title=envelope.title,
                                        message=envelope.message,
                                        url=url,
                                        expires_at=envelope.expires_at,
                                    ),
                                )
                            )
                    for cc in self._cc_recipients_due(envelope, next_order):
                        cc.status = EsignRecipientStatus.NOTIFIED
                        emails.append(
                            (
                                cc.email,
                                email_templates.cc_copy(
                                    recipient_name=cc.name,
                                    sender_name=sender_name,
                                    title=envelope.title,
                                    message=envelope.message,
                                    url=url,
                                    expires_at=envelope.expires_at,
                                ),
                            )
                        )

            # The sender is told about every completed signature; the final one
            # is covered by the richer completion email instead.
            if sender_email and not sealing_enqueued:
                emails.append(
                    (
                        sender_email,
                        email_templates.recipient_signed(
                            signer_name=recipient.name,
                            signer_email=recipient.email,
                            title=envelope.title,
                            url=self.sender_envelope_url(envelope.id),
                        ),
                    )
                )

            db.commit()
            envelope_status_value = (
                envelope.status.value if hasattr(envelope.status, "value") else str(envelope.status)
            )
            env_id = str(envelope.id)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        if sealing_enqueued:
            from services.cloud_run_task_service import cloud_run_task_service

            await cloud_run_task_service.enqueue_envelope_seal_task(env_id)

        for to_email, content in emails:
            await self._send_content(to_email, content)

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
        emails: list[tuple[str, EmailContent]] = []
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

            # Notify the sender and every recipient who was already involved
            # (anyone past PENDING), excluding the decliner themselves.
            content = email_templates.declined(
                decliner_name=recipient.name,
                decliner_email=recipient.email,
                title=envelope.title,
                reason=reason,
            )
            sender_email = self._sender_email(db, envelope)
            if sender_email:
                emails.append((sender_email, content))
            for other in envelope.recipients or []:
                if str(other.id) == str(recipient.id):
                    continue
                if other.status == EsignRecipientStatus.PENDING:
                    continue
                if sender_email and other.email == sender_email.lower():
                    continue
                emails.append((other.email, content))
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        for to_email, item in emails:
            await self._send_content(to_email, item)
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
            # Every recipient already involved (signer or CC) hears about the void.
            notified = [
                r.email
                for r in (envelope.recipients or [])
                if r.status not in (EsignRecipientStatus.PENDING,)
            ]
            sender_name = self._sender_name(envelope) or user_email
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

        content = email_templates.voided(sender_name=sender_name, title=envelope_title, reason=reason)
        for email in notified:
            await self._send_content(email, content)
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
            sender_name = self._sender_name(envelope) or user_email
            url = signing_url(envelope.id)
            reminder_emails = [
                (
                    t.email,
                    email_templates.signature_request(
                        recipient_name=t.name,
                        sender_name=sender_name,
                        title=envelope.title,
                        message=envelope.message,
                        url=url,
                        expires_at=envelope.expires_at,
                        reminder=True,
                    ),
                )
                for t in targets
            ]
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        for email, content in reminder_emails:
            await self._send_content(email, content)
        return {"reminded": [email for email, _ in reminder_emails]}

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

    async def _send_content(self, to_email: str, content: EmailContent) -> None:
        import asyncio

        from services.email_service import email_service

        try:
            await asyncio.to_thread(
                email_service.send_html_email,
                to_email,
                content.subject,
                content.html,
                content.text,
            )
        except Exception:
            logger.exception("Failed to send esign email to %s", to_email)

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

        # The sender views the envelope on their dashboard detail page; recipients
        # are not the envelope owner, so they view it via the signer-facing page.
        sender_url = self.sender_envelope_url(envelope_id)
        recipient_url = signing_url(envelope_id)
        targets: dict[str, tuple[str, bool]] = {
            email: (recipient_url, False) for email in recipients
        }
        if sender_email:
            targets[sender_email.lower()] = (sender_url, True)
        for email, (url, is_sender) in sorted(targets.items()):
            await self._send_content(
                email,
                email_templates.completed(title=envelope_title, url=url, is_sender=is_sender),
            )


esign_signing_service = EsignSigningService()
