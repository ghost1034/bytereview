"""Sender-side envelope CRUD, template management, and downloads for e-sign."""

from __future__ import annotations

import hashlib
import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import fitz
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from core.database import db_config
from models.db_models import (
    EsignConsentRecord,
    EsignDocument,
    EsignEnvelope,
    EsignEnvelopeStatus,
    EsignEvent,
    EsignEventType,
    EsignField,
    EsignFieldType,
    EsignRecipient,
    EsignRecipientChange,
    EsignRecipientRole,
    EsignRecipientStatus,
    EsignSigningType,
    EsignTemplate,
    EsignTemplateDocument,
    EsignTemplateField,
)
from models.esign import (
    EsignAuditTrailResponse,
    EsignDocumentResponse,
    EsignDownloadResponse,
    EsignEnvelopeListItem,
    EsignEnvelopeListResponse,
    EsignEnvelopeResponse,
    EsignEnvelopeUpdateRequest,
    EsignEventResponse,
    EsignFieldInput,
    EsignFieldResponse,
    EsignRecipientInput,
    EsignRecipientChangeResponse,
    EsignRecipientResponse,
    EsignTemplateDocumentResponse,
    EsignTemplateFieldInput,
    EsignTemplateFieldResponse,
    EsignTemplateResponse,
    EsignTemplateRoleInput,
    EsignAnchorMatch,
    EsignAnchorSearchResponse,
    EsignPdfWidget,
    EsignPdfWidgetInspectionResponse,
    EsignPdfWidgetMapping,
)
from services.esign import audit_service
from services.esign.audit_service import EsignRequestMeta
from services.esign.field_logic import FieldLogicError, remap_property_references, validate_field_graph
from services.gcs_service import get_storage_service

logger = logging.getLogger(__name__)

MAX_DOCUMENTS_PER_ENVELOPE = int(os.getenv("ESIGN_MAX_DOCUMENTS", "10"))
MAX_DOCUMENT_BYTES = int(os.getenv("ESIGN_MAX_DOCUMENT_BYTES", str(25 * 1024 * 1024)))
MAX_RECIPIENTS = int(os.getenv("ESIGN_MAX_RECIPIENTS", "20"))
DOWNLOAD_URL_MINUTES = int(os.getenv("ESIGN_DOWNLOAD_URL_MINUTES", "15"))
DEFAULT_EXPIRES_DAYS = int(os.getenv("ESIGN_DEFAULT_EXPIRES_DAYS", "30"))

# ESIGN/UETA consent-to-electronic-records disclosure. Snapshotted onto every
# envelope at creation so consent records always reference the exact text the
# signer saw, even if this default changes later.
DEFAULT_CONSENT_DISCLOSURE = (
    "Consent to Use Electronic Records and Signatures\n\n"
    "By selecting \"I agree\", you consent to receive, review, and sign the "
    "documents in this envelope electronically, and you agree that your "
    "electronic signature is the legal equivalent of your handwritten "
    "signature, as provided by the U.S. Electronic Signatures in Global and "
    "National Commerce Act (ESIGN) and the Uniform Electronic Transactions "
    "Act (UETA).\n\n"
    "To access and retain these records you need a device with a current web "
    "browser, an internet connection, and either a printer or sufficient "
    "storage to keep copies. You may download and print the documents during "
    "signing and after completion.\n\n"
    "You may decline to sign electronically by choosing \"Decline\" and "
    "contacting the sender to arrange paper signing. Declining electronic "
    "signing will not prevent you from doing business with the sender on "
    "paper. You may also request paper copies of completed documents from the "
    "sender.\n\n"
    "Your identity is verified through your CPAAutomation account, which "
    "requires SMS phone verification (multi-factor authentication) at every "
    "login. The date, time, network address, and verification method of each "
    "action you take are recorded in a tamper-evident audit trail."
)

ACTIVE_STATUSES = (EsignEnvelopeStatus.SENT, EsignEnvelopeStatus.IN_PROGRESS)


class EsignError(ValueError):
    """Domain error mapped to 400 by routes."""


class EsignNotFound(LookupError):
    """Mapped to 404 by routes."""


class EsignConflict(RuntimeError):
    """Mapped to 409 by routes."""


def sha256_hex(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _validate_pdf(content: bytes, filename: str) -> int:
    """Validate that content is a readable, non-encrypted PDF; return page count."""
    try:
        with fitz.open(stream=content, filetype="pdf") as doc:
            if doc.needs_pass:
                raise EsignError(f"'{filename}' is password-protected; remove the password first")
            page_count = doc.page_count
    except EsignError:
        raise
    except Exception as exc:
        raise EsignError(f"'{filename}' is not a valid PDF: {exc}")
    if page_count < 1:
        raise EsignError(f"'{filename}' has no pages")
    return page_count


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


class EsignEnvelopeService:
    def __init__(self) -> None:
        self.storage = get_storage_service()

    def _get_session(self) -> Session:
        return db_config.get_session()

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def _serialize_field(self, field: EsignField) -> EsignFieldResponse:
        return EsignFieldResponse(
            id=str(field.id),
            envelope_id=str(field.envelope_id),
            document_id=str(field.document_id),
            recipient_id=str(field.recipient_id),
            field_type=field.field_type.value if hasattr(field.field_type, "value") else str(field.field_type),
            page_number=int(field.page_number),
            pos_x=float(field.pos_x),
            pos_y=float(field.pos_y),
            width=float(field.width),
            height=float(field.height),
            required=bool(field.required),
            label=field.label,
            value=field.value,
            draft_value=field.draft_value,
            properties=dict(getattr(field, "properties", None) or {}),
        )

    def _serialize_recipient(self, recipient: EsignRecipient) -> EsignRecipientResponse:
        return EsignRecipientResponse(
            id=str(recipient.id),
            email=recipient.email,
            name=recipient.name,
            role=recipient.role.value if hasattr(recipient.role, "value") else str(recipient.role),
            routing_order=int(recipient.routing_order),
            status=recipient.status.value if hasattr(recipient.status, "value") else str(recipient.status),
            role_label=getattr(recipient, "role_label", None),
            private_message=getattr(recipient, "private_message", None),
            managed_by_recipient_id=str(recipient.managed_by_recipient_id) if getattr(recipient, "managed_by_recipient_id", None) else None,
            witness_for_recipient_id=str(recipient.witness_for_recipient_id) if getattr(recipient, "witness_for_recipient_id", None) else None,
            host_name=getattr(recipient, "host_name", None),
            host_email=getattr(recipient, "host_email", None),
            allow_reassignment=bool(getattr(recipient, "allow_reassignment", False)),
            action_completed_at=getattr(recipient, "action_completed_at", None),
            viewed_at=recipient.viewed_at,
            consented_at=recipient.consented_at,
            signed_at=recipient.signed_at,
            declined_at=recipient.declined_at,
            declined_reason=recipient.declined_reason,
        )

    def _serialize_document(self, document: EsignDocument) -> EsignDocumentResponse:
        return EsignDocumentResponse(
            id=str(document.id),
            display_order=int(document.display_order or 0),
            original_filename=document.original_filename,
            original_sha256=document.original_sha256,
            flattened_sha256=document.flattened_sha256,
            page_count=int(document.page_count or 0),
            file_size_bytes=int(document.file_size_bytes or 0),
        )

    def _serialize_envelope(self, envelope: EsignEnvelope) -> EsignEnvelopeResponse:
        return EsignEnvelopeResponse(
            id=str(envelope.id),
            title=envelope.title,
            message=envelope.message,
            status=envelope.status.value if hasattr(envelope.status, "value") else str(envelope.status),
            signing_type=envelope.signing_type.value if hasattr(envelope.signing_type, "value") else str(envelope.signing_type),
            date_format=getattr(envelope, "date_format", None) or "MM/DD/YYYY",
            current_routing_order=envelope.current_routing_order,
            routing_version=int(getattr(envelope, "routing_version", 1) or 1),
            allow_reassignment=bool(getattr(envelope, "allow_reassignment", False)),
            consent_disclosure_text=envelope.consent_disclosure_text,
            expires_at=envelope.expires_at,
            reminder_interval_hours=envelope.reminder_interval_hours,
            last_reminder_at=envelope.last_reminder_at,
            voided_reason=envelope.voided_reason,
            sealed_sha256=envelope.sealed_sha256,
            has_sealed_document=bool(envelope.sealed_gcs_object_name),
            has_certificate=bool(envelope.certificate_gcs_object_name),
            sent_at=envelope.sent_at,
            completed_at=envelope.completed_at,
            voided_at=envelope.voided_at,
            created_at=envelope.created_at,
            updated_at=envelope.updated_at,
            documents=[self._serialize_document(d) for d in (envelope.documents or [])],
            recipients=[self._serialize_recipient(r) for r in (envelope.recipients or [])],
            fields=[self._serialize_field(f) for f in (envelope.fields or [])],
        )

    def _serialize_event(self, event: EsignEvent) -> EsignEventResponse:
        return EsignEventResponse(
            id=str(event.id),
            event_type=event.event_type.value if hasattr(event.event_type, "value") else str(event.event_type),
            actor_email=event.actor_email,
            recipient_id=str(event.recipient_id) if event.recipient_id else None,
            ip_address=event.ip_address,
            user_agent=event.user_agent,
            mfa_verified=event.mfa_verified,
            mfa_method=event.mfa_method,
            details=event.details if isinstance(event.details, dict) else None,
            created_at=event.created_at,
        )

    # ------------------------------------------------------------------
    # Loading helpers
    # ------------------------------------------------------------------

    def _load_envelope(self, db: Session, user_id: str, envelope_id: str) -> EsignEnvelope:
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
            .filter(EsignEnvelope.id == env_uuid, EsignEnvelope.user_id == user_id)
            .first()
        )
        if not envelope:
            raise EsignNotFound("Envelope not found")
        return envelope

    def _load_envelope_as_participant(
        self, db: Session, user_id: str, user_email: str, envelope_id: str
    ) -> EsignEnvelope:
        """Load an envelope the user owns OR is a recipient of (by email)."""
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
        if envelope.user_id == user_id:
            return envelope
        email = (user_email or "").strip().lower()
        if email and any(r.email == email for r in (envelope.recipients or [])):
            return envelope
        raise EsignNotFound("Envelope not found")  # don't leak existence to non-participants

    def _require_draft(self, envelope: EsignEnvelope) -> None:
        if envelope.status != EsignEnvelopeStatus.DRAFT:
            raise EsignConflict("Envelope is no longer a draft and cannot be edited")

    # ------------------------------------------------------------------
    # Envelope CRUD
    # ------------------------------------------------------------------

    async def create_envelope(
        self,
        *,
        user_id: str,
        user_email: str,
        title: Optional[str],
        message: Optional[str],
        signing_type: Optional[str],
        files: list[tuple[str, bytes]],
        template_id: Optional[str],
        expires_in_days: Optional[int],
        reminder_interval_hours: Optional[int],
        meta: EsignRequestMeta,
    ) -> EsignEnvelopeResponse:
        if not files and not template_id:
            raise EsignError("Provide at least one PDF or a template_id")
        if files and template_id:
            raise EsignError("Provide either PDFs or a template_id, not both")

        db = self._get_session()
        try:
            envelope = EsignEnvelope(
                id=uuid.uuid4(),
                user_id=user_id,
                title=(title or "Untitled envelope").strip()[:255],
                message=message,
                status=EsignEnvelopeStatus.DRAFT,
                signing_type=EsignSigningType(signing_type) if signing_type else EsignSigningType.SEQUENTIAL,
                consent_disclosure_text=DEFAULT_CONSENT_DISCLOSURE,
                reminder_interval_hours=reminder_interval_hours,
            )
            if expires_in_days:
                from datetime import timedelta

                envelope.expires_at = datetime.now(timezone.utc) + timedelta(days=int(expires_in_days))
            db.add(envelope)
            db.flush()

            if template_id:
                await self._materialize_template(db, user_id, template_id, envelope)
            else:
                await self._attach_documents(db, user_id, envelope, files)

            audit_service.record_event(
                db,
                envelope_id=envelope.id,
                event_type=EsignEventType.CREATED,
                actor_user_id=user_id,
                actor_email=user_email,
                meta=meta,
                details={"template_id": template_id} if template_id else None,
            )
            db.commit()
            db.refresh(envelope)
            return self._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    async def _attach_documents(
        self, db: Session, user_id: str, envelope: EsignEnvelope, files: list[tuple[str, bytes]]
    ) -> None:
        if len(files) > MAX_DOCUMENTS_PER_ENVELOPE:
            raise EsignError(f"At most {MAX_DOCUMENTS_PER_ENVELOPE} documents per envelope")
        for order, (filename, content) in enumerate(files):
            if len(content) > MAX_DOCUMENT_BYTES:
                raise EsignError(f"'{filename}' exceeds the {MAX_DOCUMENT_BYTES // (1024 * 1024)}MB limit")
            page_count = _validate_pdf(content, filename)
            digest = sha256_hex(content)
            object_name = f"esign/{user_id}/{envelope.id}/original/{uuid.uuid4()}_{os.path.basename(filename)}"
            await self.storage.upload_file_content(content, object_name)
            db.add(
                EsignDocument(
                    id=uuid.uuid4(),
                    envelope_id=envelope.id,
                    display_order=order,
                    original_filename=os.path.basename(filename),
                    gcs_object_name=object_name,
                    original_sha256=digest,
                    page_count=page_count,
                    file_size_bytes=len(content),
                )
            )
        db.flush()

    async def _materialize_template(
        self, db: Session, user_id: str, template_id: str, envelope: EsignEnvelope
    ) -> None:
        template = self._load_template(db, user_id, template_id)
        if template.title and (not envelope.title or envelope.title == "Untitled envelope"):
            envelope.title = template.title
        if template.message and not envelope.message:
            envelope.message = template.message
        envelope.signing_type = template.signing_type
        envelope.date_format = getattr(template, "date_format", None) or "MM/DD/YYYY"

        # Copy template documents into the envelope's own GCS prefix so the
        # envelope's originals stay immutable even if the template changes.
        doc_id_map: dict[str, EsignDocument] = {}
        for tdoc in template.documents or []:
            object_name = f"esign/{user_id}/{envelope.id}/original/{uuid.uuid4()}_{os.path.basename(tdoc.original_filename)}"
            await self.storage.copy_object(tdoc.gcs_object_name, object_name)
            doc = EsignDocument(
                id=uuid.uuid4(),
                envelope_id=envelope.id,
                display_order=tdoc.display_order,
                original_filename=tdoc.original_filename,
                gcs_object_name=object_name,
                original_sha256=tdoc.sha256,
                page_count=tdoc.page_count,
                file_size_bytes=tdoc.file_size_bytes,
            )
            db.add(doc)
            doc_id_map[str(tdoc.id)] = doc
        db.flush()

        # Template fields are bound to recipient role indices; they are
        # materialized to concrete recipients when recipients are set
        # (see replace_recipients), so stash the mapping in envelope details
        # by keeping template fields in memory here is not possible across
        # requests — instead the route materializes fields after recipients
        # are provided via instantiate_template_fields().

    def instantiate_template_fields(
        self, db: Session, envelope: EsignEnvelope, template: EsignTemplate
    ) -> None:
        """Materialize template fields onto envelope recipients by role index.

        Recipients must already exist, ordered to match template.recipient_roles.
        Documents are matched by display_order.
        """
        recipients = sorted(envelope.recipients or [], key=lambda r: (r.routing_order, r.created_at))
        docs_by_order = {d.display_order: d for d in (envelope.documents or [])}
        tdocs_by_id = {str(td.id): td for td in (template.documents or [])}

        id_map = {str(tfield.id): str(uuid.uuid4()) for tfield in (template.fields or [])}
        pending: list[EsignField] = []
        for tfield in template.fields or []:
            if tfield.recipient_index >= len(recipients):
                raise EsignError(
                    f"Template needs {tfield.recipient_index + 1} recipients; only {len(recipients)} provided"
                )
            tdoc = tdocs_by_id.get(str(tfield.template_document_id))
            if not tdoc:
                continue
            doc = docs_by_order.get(tdoc.display_order)
            if not doc:
                continue
            pending.append(
                EsignField(
                    id=uuid.UUID(id_map[str(tfield.id)]),
                    envelope_id=envelope.id,
                    document_id=doc.id,
                    recipient_id=recipients[tfield.recipient_index].id,
                    field_type=tfield.field_type,
                    page_number=tfield.page_number,
                    pos_x=tfield.pos_x,
                    pos_y=tfield.pos_y,
                    width=tfield.width,
                    height=tfield.height,
                    required=tfield.required,
                    label=tfield.label,
                    properties=remap_property_references(tfield.properties, id_map),
                )
            )
        try:
            validate_field_graph(pending)
        except FieldLogicError as exc:
            raise EsignError(str(exc))
        db.add_all(pending)
        db.flush()

    async def add_documents(
        self, user_id: str, envelope_id: str, files: list[tuple[str, bytes]]
    ) -> EsignEnvelopeResponse:
        if not files:
            raise EsignError("Provide at least one PDF")
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            self._require_draft(envelope)

            existing = envelope.documents or []
            if len(existing) + len(files) > MAX_DOCUMENTS_PER_ENVELOPE:
                raise EsignError(f"At most {MAX_DOCUMENTS_PER_ENVELOPE} documents per envelope")

            next_order = max((int(d.display_order or 0) for d in existing), default=-1) + 1
            for offset, (filename, content) in enumerate(files):
                if len(content) > MAX_DOCUMENT_BYTES:
                    raise EsignError(f"'{filename}' exceeds the {MAX_DOCUMENT_BYTES // (1024 * 1024)}MB limit")
                page_count = _validate_pdf(content, filename)
                digest = sha256_hex(content)
                object_name = f"esign/{user_id}/{envelope.id}/original/{uuid.uuid4()}_{os.path.basename(filename)}"
                await self.storage.upload_file_content(content, object_name)
                db.add(
                    EsignDocument(
                        id=uuid.uuid4(),
                        envelope_id=envelope.id,
                        display_order=next_order + offset,
                        original_filename=os.path.basename(filename),
                        gcs_object_name=object_name,
                        original_sha256=digest,
                        page_count=page_count,
                        file_size_bytes=len(content),
                    )
                )
            db.commit()
            db.expire(envelope, ["documents"])
            db.refresh(envelope)
            return self._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    async def delete_document(
        self, user_id: str, envelope_id: str, document_id: str
    ) -> EsignEnvelopeResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            self._require_draft(envelope)

            document = next(
                (d for d in envelope.documents or [] if str(d.id) == str(document_id)), None
            )
            if not document:
                raise EsignNotFound("Document not found")
            if len(envelope.documents or []) <= 1:
                raise EsignError("An envelope needs at least one document; add another before removing this one")

            # Fields placed on this document go with it. display_order values of
            # the remaining documents are kept as-is: template field
            # materialization matches documents by display_order, so compacting
            # would rebind template fields to the wrong document.
            db.query(EsignField).filter(EsignField.document_id == document.id).delete()
            gcs_object_name = document.gcs_object_name
            db.delete(document)
            db.commit()

            try:
                await self.storage.delete_file(gcs_object_name)
            except Exception:
                logger.warning(
                    "Failed to delete GCS object %s for removed draft document", gcs_object_name
                )

            db.expire(envelope, ["documents", "fields"])
            db.refresh(envelope)
            return self._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def reorder_documents(
        self, user_id: str, envelope_id: str, document_ids: list[str]
    ) -> EsignEnvelopeResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            self._require_draft(envelope)
            current = {str(document.id): document for document in envelope.documents or []}
            if len(document_ids) != len(current) or len(set(document_ids)) != len(document_ids):
                raise EsignError("document_ids must contain every current document exactly once")
            if set(document_ids) != set(current):
                raise EsignError("document_ids must contain every current document exactly once")
            for display_order, document_id in enumerate(document_ids):
                current[document_id].display_order = display_order
            db.commit()
            db.expire(envelope, ["documents"])
            db.refresh(envelope)
            return self._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    async def delete_envelope(self, user_id: str, envelope_id: str) -> None:
        """Hard-delete a draft envelope, including its uploaded files.

        Only drafts can be deleted: the esign_events append-only trigger
        (migration 043) permits deleting audit events only while the envelope
        is still in draft status. Anything that has been sent keeps its audit
        trail and must be voided instead.
        """
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            if envelope.status != EsignEnvelopeStatus.DRAFT:
                raise EsignConflict("Only draft envelopes can be deleted; void sent envelopes instead")

            gcs_objects = [
                name
                for doc in envelope.documents or []
                for name in (doc.gcs_object_name, doc.flattened_gcs_object_name)
                if name
            ]
            # Events must go first: their FK is RESTRICT.
            db.query(EsignEvent).filter(EsignEvent.envelope_id == envelope.id).delete()
            db.delete(envelope)  # cascades documents, recipients, fields
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        for object_name in gcs_objects:
            try:
                await self.storage.delete_file(object_name)
            except Exception:
                logger.warning(
                    "Failed to delete GCS object %s for deleted draft envelope", object_name
                )

    def update_envelope(
        self, user_id: str, envelope_id: str, payload: EsignEnvelopeUpdateRequest
    ) -> EsignEnvelopeResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            self._require_draft(envelope)
            if payload.title is not None:
                envelope.title = payload.title.strip()[:255] or envelope.title
            if payload.message is not None:
                envelope.message = payload.message
            if payload.signing_type is not None:
                envelope.signing_type = EsignSigningType(payload.signing_type)
            if payload.date_format is not None:
                envelope.date_format = payload.date_format
            if payload.expires_at is not None:
                envelope.expires_at = payload.expires_at
            if payload.reminder_interval_hours is not None:
                envelope.reminder_interval_hours = payload.reminder_interval_hours
            if payload.allow_reassignment is not None:
                envelope.allow_reassignment = payload.allow_reassignment
            db.commit()
            db.refresh(envelope)
            return self._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def replace_recipients(
        self, user_id: str, envelope_id: str, recipients: list[EsignRecipientInput],
        template_id: Optional[str] = None,
    ) -> EsignEnvelopeResponse:
        if not recipients:
            raise EsignError("At least one recipient is required")
        if len(recipients) > MAX_RECIPIENTS:
            raise EsignError(f"At most {MAX_RECIPIENTS} recipients per envelope")

        emails = [
            _normalize_email(value)
            for recipient in recipients
            for value in (recipient.email, recipient.host_email)
            if value
        ]
        if len(set(emails)) != len(emails):
            raise EsignError("Duplicate recipient emails are not allowed")
        if not any(r.role != EsignRecipientRole.CC.value for r in recipients):
            raise EsignError("At least one actionable recipient is required")

        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            self._require_draft(envelope)

            existing = {str(recipient.id): recipient for recipient in envelope.recipients or []}
            existing_by_email = {
                _normalize_email(recipient.email): recipient for recipient in envelope.recipients or [] if recipient.email
            }
            kept_ids: set[str] = set()
            created_recipients: list[EsignRecipient] = []
            for r in recipients:
                if r.role not in {role.value for role in EsignRecipientRole}:
                    raise EsignError(f"Invalid recipient role: {r.role}")
                recipient = None
                if r.id:
                    try:
                        recipient = existing.get(str(uuid.UUID(str(r.id))))
                    except ValueError:
                        raise EsignError(f"Invalid recipient id: {r.id}")
                    if recipient is None:
                        raise EsignError(f"Recipient id {r.id} does not belong to this envelope")
                if recipient is None:
                    candidate = existing_by_email.get(_normalize_email(r.email)) if r.email else None
                    if candidate and str(candidate.id) not in kept_ids:
                        recipient = candidate
                if recipient is None:
                    recipient = EsignRecipient(
                        id=uuid.uuid4(),
                        envelope_id=envelope.id,
                        status=EsignRecipientStatus.PENDING,
                    )
                    db.add(recipient)
                    created_recipients.append(recipient)
                recipient.email = _normalize_email(r.email) or None
                recipient.name = r.name.strip()[:255] if r.name else None
                recipient.role = EsignRecipientRole(r.role)
                recipient.routing_order = int(r.routing_order)
                recipient.role_label = r.role_label
                recipient.private_message = r.private_message
                recipient.managed_by_recipient_id = uuid.UUID(r.managed_by_recipient_id) if r.managed_by_recipient_id else None
                recipient.witness_for_recipient_id = uuid.UUID(r.witness_for_recipient_id) if r.witness_for_recipient_id else None
                recipient.host_name = r.host_name
                recipient.host_email = _normalize_email(r.host_email) or None
                recipient.allow_reassignment = r.allow_reassignment
                kept_ids.add(str(recipient.id))

            db.flush()
            kept = {
                str(recipient.id): recipient
                for recipient in [*(envelope.recipients or []), *created_recipients]
                if str(recipient.id) in kept_ids
            }
            for recipient in kept.values():
                if recipient.managed_by_recipient_id:
                    manager = kept.get(str(recipient.managed_by_recipient_id))
                    if manager is None or manager.role not in (EsignRecipientRole.AGENT, EsignRecipientRole.EDITOR):
                        raise EsignError("Managed recipients must reference an agent or editor in this envelope")
                    if int(recipient.routing_order) < int(manager.routing_order):
                        raise EsignError("A managed recipient cannot route before its agent or editor")
                if recipient.witness_for_recipient_id:
                    signer = kept.get(str(recipient.witness_for_recipient_id))
                    if recipient.role != EsignRecipientRole.WITNESS or signer is None or signer.role != EsignRecipientRole.SIGNER:
                        raise EsignError("Witness recipients must reference a signer in this envelope")
                    recipient.routing_order = signer.routing_order

            deleted_ids = [recipient.id for key, recipient in existing.items() if key not in kept_ids]
            if deleted_ids:
                db.query(EsignField).filter(EsignField.recipient_id.in_(deleted_ids)).delete(
                    synchronize_session=False
                )
                db.query(EsignRecipient).filter(EsignRecipient.id.in_(deleted_ids)).delete(
                    synchronize_session=False
                )
            db.flush()
            db.expire(envelope, ["recipients", "fields"])

            if template_id and not (envelope.fields or []):
                template = self._load_template(db, user_id, template_id)
                self.instantiate_template_fields(db, envelope, template)
                db.expire(envelope, ["fields"])

            db.commit()
            db.refresh(envelope)
            return self._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def replace_fields(
        self, user_id: str, envelope_id: str, fields: list[EsignFieldInput]
    ) -> EsignEnvelopeResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            self._require_draft(envelope)

            doc_ids = {str(d.id): d for d in envelope.documents or []}
            recipient_ids = {str(r.id): r for r in envelope.recipients or []}
            seen_ids: set[uuid.UUID] = set()
            pending: list[EsignField] = []
            for f in fields:
                doc = doc_ids.get(str(f.document_id))
                if not doc:
                    raise EsignError(f"Unknown document_id: {f.document_id}")
                recipient = recipient_ids.get(str(f.recipient_id))
                if not recipient:
                    raise EsignError(f"Unknown recipient_id: {f.recipient_id}")
                if recipient.role not in (
                    EsignRecipientRole.SIGNER,
                    EsignRecipientRole.WITNESS,
                    EsignRecipientRole.IN_PERSON_SIGNER,
                ):
                    raise EsignError("Fields can only be assigned to signer, witness, or in-person signer roles")
                if f.field_type not in {t.value for t in EsignFieldType}:
                    raise EsignError(f"Invalid field type: {f.field_type}")
                if f.page_number >= (doc.page_count or 0):
                    raise EsignError(
                        f"Field page {f.page_number + 1} is beyond '{doc.original_filename}' ({doc.page_count} pages)"
                    )
                if f.pos_x + f.width > 1.0001 or f.pos_y + f.height > 1.0001:
                    raise EsignError("Field extends beyond the page bounds")
                try:
                    field_id = uuid.UUID(str(f.id)) if f.id else uuid.uuid4()
                except ValueError:
                    raise EsignError(f"Invalid field id: {f.id}")
                if field_id in seen_ids:
                    raise EsignError(f"Duplicate field id: {field_id}")
                seen_ids.add(field_id)
                owner = db.query(EsignField.envelope_id).filter(EsignField.id == field_id).first()
                if owner and str(owner[0]) != str(envelope.id):
                    raise EsignError(f"Field id {field_id} belongs to another envelope")
                pending.append(
                    EsignField(
                        id=field_id,
                        envelope_id=envelope.id,
                        document_id=doc.id,
                        recipient_id=recipient.id,
                        field_type=EsignFieldType(f.field_type),
                        page_number=f.page_number,
                        pos_x=f.pos_x,
                        pos_y=f.pos_y,
                        width=f.width,
                        height=f.height,
                        required=f.required,
                        label=f.label,
                        properties=f.properties.model_dump(exclude_none=True),
                    )
                )
            try:
                validate_field_graph(pending)
            except FieldLogicError as exc:
                raise EsignError(str(exc))
            db.query(EsignField).filter(EsignField.envelope_id == envelope.id).delete()
            db.flush()
            db.add_all(pending)
            db.commit()
            db.expire(envelope, ["fields"])
            db.refresh(envelope)
            return self._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def list_envelopes(
        self, user_id: str, *, limit: int = 25, offset: int = 0,
        status: Optional[str] = None, q: Optional[str] = None,
        sort_by: str = "updated_at", sort_dir: str = "desc",
    ) -> EsignEnvelopeListResponse:
        db = self._get_session()
        try:
            base = db.query(EsignEnvelope).filter(EsignEnvelope.user_id == user_id)
            count_rows = (
                db.query(EsignEnvelope.status, func.count(EsignEnvelope.id))
                .filter(EsignEnvelope.user_id == user_id)
                .group_by(EsignEnvelope.status)
                .all()
            )
            status_counts = {
                (key.value if hasattr(key, "value") else str(key)): int(value)
                for key, value in count_rows
            }
            for envelope_status in EsignEnvelopeStatus:
                status_counts.setdefault(envelope_status.value, 0)
            query = base
            if status:
                if status == "active":
                    query = query.filter(EsignEnvelope.status.in_(ACTIVE_STATUSES))
                else:
                    try:
                        query = query.filter(EsignEnvelope.status == EsignEnvelopeStatus(status))
                    except ValueError:
                        raise EsignError(f"Invalid status filter: {status}")
            if q and q.strip():
                query = query.filter(EsignEnvelope.title.ilike(f"%{q.strip()}%"))
            total = query.count()
            sort_columns = {
                "updated_at": EsignEnvelope.updated_at,
                "created_at": EsignEnvelope.created_at,
                "sent_at": EsignEnvelope.sent_at,
                "completed_at": EsignEnvelope.completed_at,
                "title": EsignEnvelope.title,
            }
            sort_column = sort_columns.get(sort_by)
            if sort_column is None:
                raise EsignError(f"Invalid sort field: {sort_by}")
            ordering = sort_column.asc() if sort_dir == "asc" else sort_column.desc()
            envelopes = (
                query.options(joinedload(EsignEnvelope.recipients), joinedload(EsignEnvelope.documents))
                .order_by(ordering, EsignEnvelope.id.desc())
                .limit(limit)
                .offset(offset)
                .all()
            )
            items = []
            for env in envelopes:
                signers = [
                    r for r in (env.recipients or [])
                    if r.role in (EsignRecipientRole.SIGNER, EsignRecipientRole.WITNESS, EsignRecipientRole.IN_PERSON_SIGNER)
                ]
                items.append(
                    EsignEnvelopeListItem(
                        id=str(env.id),
                        title=env.title,
                        status=env.status.value if hasattr(env.status, "value") else str(env.status),
                        signing_type=env.signing_type.value if hasattr(env.signing_type, "value") else str(env.signing_type),
                        recipient_count=len(signers),
                        signed_count=len([r for r in signers if r.status == EsignRecipientStatus.SIGNED]),
                        document_count=len(env.documents or []),
                        recipient_preview=[
                            self._serialize_recipient(recipient)
                            for recipient in sorted(
                                env.recipients or [], key=lambda item: int(item.routing_order)
                            )[:3]
                        ],
                        expires_at=env.expires_at,
                        sent_at=env.sent_at,
                        completed_at=env.completed_at,
                        created_at=env.created_at,
                        updated_at=env.updated_at,
                    )
                )
            return EsignEnvelopeListResponse(
                envelopes=items, total=total, limit=limit, offset=offset,
                status_counts=status_counts,
            )
        finally:
            db.close()

    def get_envelope(self, user_id: str, envelope_id: str) -> EsignEnvelopeResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            return self._serialize_envelope(envelope)
        finally:
            db.close()

    def get_audit_trail(self, user_id: str, envelope_id: str) -> EsignAuditTrailResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            events = (
                db.query(EsignEvent)
                .filter(EsignEvent.envelope_id == envelope.id)
                .order_by(EsignEvent.created_at.asc())
                .all()
            )
            changes = (
                db.query(EsignRecipientChange)
                .filter(EsignRecipientChange.envelope_id == envelope.id)
                .order_by(EsignRecipientChange.created_at.asc())
                .all()
            )
            return EsignAuditTrailResponse(
                envelope_id=str(envelope.id),
                events=[self._serialize_event(e) for e in events],
                recipient_changes=[EsignRecipientChangeResponse(
                    id=str(change.id), recipient_id=str(change.recipient_id) if change.recipient_id else None,
                    envelope_version=change.envelope_version, change_type=change.change_type,
                    actor_email=change.actor_email, reason=change.reason,
                    before_snapshot=change.before_snapshot, after_snapshot=change.after_snapshot,
                    created_at=change.created_at,
                ) for change in changes],
            )
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Downloads
    # ------------------------------------------------------------------

    async def get_document_download(
        self, user_id: str, envelope_id: str, document_id: str
    ) -> EsignDownloadResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            document = next((d for d in envelope.documents if str(d.id) == str(document_id)), None)
            if not document:
                raise EsignNotFound("Document not found")
            url = await self.storage.generate_presigned_get_url(
                document.gcs_object_name,
                expiration_minutes=DOWNLOAD_URL_MINUTES,
                download_filename=document.original_filename,
            )
            return EsignDownloadResponse(
                url=url,
                filename=document.original_filename,
                sha256=document.original_sha256,
                expires_in_minutes=DOWNLOAD_URL_MINUTES,
            )
        finally:
            db.close()

    async def get_sealed_download(
        self, user_id: str, user_email: str, envelope_id: str
    ) -> EsignDownloadResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope_as_participant(db, user_id, user_email, envelope_id)
            if not envelope.sealed_gcs_object_name:
                raise EsignNotFound("Envelope has not been sealed yet")
            filename = f"{envelope.title or 'envelope'} - signed.pdf"
            url = await self.storage.generate_presigned_get_url(
                envelope.sealed_gcs_object_name,
                expiration_minutes=DOWNLOAD_URL_MINUTES,
                download_filename=filename,
            )
            return EsignDownloadResponse(
                url=url, filename=filename, sha256=envelope.sealed_sha256,
                expires_in_minutes=DOWNLOAD_URL_MINUTES,
            )
        finally:
            db.close()

    async def get_certificate_download(
        self, user_id: str, user_email: str, envelope_id: str
    ) -> EsignDownloadResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope_as_participant(db, user_id, user_email, envelope_id)
            if not envelope.certificate_gcs_object_name:
                raise EsignNotFound("Certificate of completion is not available yet")
            filename = f"{envelope.title or 'envelope'} - certificate of completion.pdf"
            url = await self.storage.generate_presigned_get_url(
                envelope.certificate_gcs_object_name,
                expiration_minutes=DOWNLOAD_URL_MINUTES,
                download_filename=filename,
            )
            return EsignDownloadResponse(
                url=url, filename=filename, sha256=None, expires_in_minutes=DOWNLOAD_URL_MINUTES,
            )
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Templates
    # ------------------------------------------------------------------

    def _load_template(self, db: Session, user_id: str, template_id: str) -> EsignTemplate:
        try:
            tid = uuid.UUID(str(template_id))
        except ValueError:
            raise EsignNotFound("Template not found")
        template = (
            db.query(EsignTemplate)
            .options(joinedload(EsignTemplate.documents), joinedload(EsignTemplate.fields))
            .filter(EsignTemplate.id == tid, EsignTemplate.user_id == user_id)
            .first()
        )
        if not template:
            raise EsignNotFound("Template not found")
        return template

    def _serialize_template(self, template: EsignTemplate) -> EsignTemplateResponse:
        return EsignTemplateResponse(
            id=str(template.id),
            name=template.name,
            description=template.description,
            title=template.title,
            message=template.message,
            signing_type=template.signing_type.value if hasattr(template.signing_type, "value") else str(template.signing_type),
            date_format=getattr(template, "date_format", None) or "MM/DD/YYYY",
            recipient_roles=template.recipient_roles if isinstance(template.recipient_roles, list) else [],
            documents=[
                EsignTemplateDocumentResponse(
                    id=str(d.id),
                    display_order=int(d.display_order or 0),
                    original_filename=d.original_filename,
                    sha256=d.sha256,
                    page_count=int(d.page_count or 0),
                    file_size_bytes=int(d.file_size_bytes or 0),
                )
                for d in (template.documents or [])
            ],
            fields=[
                EsignTemplateFieldResponse(
                    id=str(f.id),
                    template_document_id=str(f.template_document_id),
                    recipient_index=int(f.recipient_index),
                    field_type=f.field_type.value if hasattr(f.field_type, "value") else str(f.field_type),
                    page_number=int(f.page_number),
                    pos_x=float(f.pos_x),
                    pos_y=float(f.pos_y),
                    width=float(f.width),
                    height=float(f.height),
                    required=bool(f.required),
                    label=f.label,
                    properties=dict(f.properties or {}),
                )
                for f in (template.fields or [])
            ],
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    async def create_template(
        self,
        *,
        user_id: str,
        name: str,
        description: Optional[str],
        title: Optional[str],
        message: Optional[str],
        signing_type: Optional[str],
        recipient_roles: list[EsignTemplateRoleInput],
        files: list[tuple[str, bytes]],
    ) -> EsignTemplateResponse:
        if not name or not name.strip():
            raise EsignError("Template name is required")
        if not files:
            raise EsignError("At least one PDF is required")
        if not recipient_roles:
            recipient_roles = [EsignTemplateRoleInput(label="Signer 1", role="signer", routing_order=1)]

        db = self._get_session()
        try:
            template = EsignTemplate(
                id=uuid.uuid4(),
                user_id=user_id,
                name=name.strip()[:255],
                description=description,
                title=title,
                message=message,
                signing_type=EsignSigningType(signing_type) if signing_type else EsignSigningType.SEQUENTIAL,
                recipient_roles=[r.model_dump() for r in recipient_roles],
            )
            db.add(template)
            db.flush()

            for order, (filename, content) in enumerate(files):
                if len(content) > MAX_DOCUMENT_BYTES:
                    raise EsignError(f"'{filename}' exceeds the {MAX_DOCUMENT_BYTES // (1024 * 1024)}MB limit")
                page_count = _validate_pdf(content, filename)
                object_name = f"esign_templates/{user_id}/{template.id}/{uuid.uuid4()}_{os.path.basename(filename)}"
                await self.storage.upload_file_content(content, object_name)
                db.add(
                    EsignTemplateDocument(
                        id=uuid.uuid4(),
                        template_id=template.id,
                        display_order=order,
                        original_filename=os.path.basename(filename),
                        gcs_object_name=object_name,
                        sha256=sha256_hex(content),
                        page_count=page_count,
                        file_size_bytes=len(content),
                    )
                )
            db.commit()
            db.refresh(template)
            return self._serialize_template(template)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def update_template(
        self,
        user_id: str,
        template_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        title: Optional[str] = None,
        message: Optional[str] = None,
        signing_type: Optional[str] = None,
        date_format: Optional[str] = None,
        recipient_roles: Optional[list[EsignTemplateRoleInput]] = None,
        fields: Optional[list[EsignTemplateFieldInput]] = None,
    ) -> EsignTemplateResponse:
        db = self._get_session()
        try:
            template = self._load_template(db, user_id, template_id)
            if name is not None:
                template.name = name.strip()[:255] or template.name
            if description is not None:
                template.description = description
            if title is not None:
                template.title = title
            if message is not None:
                template.message = message
            if signing_type is not None:
                template.signing_type = EsignSigningType(signing_type)
            if date_format is not None:
                template.date_format = date_format
            if recipient_roles is not None:
                template.recipient_roles = [r.model_dump() for r in recipient_roles]

            if fields is not None:
                doc_ids = {str(d.id) for d in template.documents or []}
                role_count = len(template.recipient_roles or [])
                pending: list[EsignTemplateField] = []
                seen_ids: set[uuid.UUID] = set()
                for f in fields:
                    if str(f.template_document_id) not in doc_ids:
                        raise EsignError(f"Unknown template document: {f.template_document_id}")
                    if f.recipient_index >= role_count:
                        raise EsignError("Field recipient_index exceeds recipient roles")
                    if f.field_type not in {t.value for t in EsignFieldType}:
                        raise EsignError(f"Invalid field type: {f.field_type}")
                    try:
                        field_id = uuid.UUID(str(f.id)) if f.id else uuid.uuid4()
                    except ValueError:
                        raise EsignError(f"Invalid field id: {f.id}")
                    if field_id in seen_ids:
                        raise EsignError(f"Duplicate field id: {field_id}")
                    seen_ids.add(field_id)
                    owner = db.query(EsignTemplateField.template_id).filter(EsignTemplateField.id == field_id).first()
                    if owner and str(owner[0]) != str(template.id):
                        raise EsignError(f"Field id {field_id} belongs to another template")
                    pending.append(
                        EsignTemplateField(
                            id=field_id,
                            template_id=template.id,
                            template_document_id=uuid.UUID(str(f.template_document_id)),
                            recipient_index=f.recipient_index,
                            field_type=EsignFieldType(f.field_type),
                            page_number=f.page_number,
                            pos_x=f.pos_x,
                            pos_y=f.pos_y,
                            width=f.width,
                            height=f.height,
                            required=f.required,
                            label=f.label,
                            properties=f.properties.model_dump(exclude_none=True),
                        )
                    )
                try:
                    validate_field_graph(pending)
                except FieldLogicError as exc:
                    raise EsignError(str(exc))
                db.query(EsignTemplateField).filter(EsignTemplateField.template_id == template.id).delete()
                db.flush()
                db.add_all(pending)
            db.commit()
            db.expire(template, ["fields"])
            db.refresh(template)
            return self._serialize_template(template)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def list_templates(self, user_id: str) -> list[EsignTemplateResponse]:
        db = self._get_session()
        try:
            templates = (
                db.query(EsignTemplate)
                .options(joinedload(EsignTemplate.documents), joinedload(EsignTemplate.fields))
                .filter(EsignTemplate.user_id == user_id)
                .order_by(EsignTemplate.updated_at.desc())
                .all()
            )
            return [self._serialize_template(t) for t in templates]
        finally:
            db.close()

    def get_template(self, user_id: str, template_id: str) -> EsignTemplateResponse:
        db = self._get_session()
        try:
            return self._serialize_template(self._load_template(db, user_id, template_id))
        finally:
            db.close()

    async def get_template_document_download(
        self, user_id: str, template_id: str, document_id: str
    ) -> EsignDownloadResponse:
        db = self._get_session()
        try:
            template = self._load_template(db, user_id, template_id)
            document = next((d for d in template.documents if str(d.id) == str(document_id)), None)
            if not document:
                raise EsignNotFound("Template document not found")
            url = await self.storage.generate_presigned_get_url(
                document.gcs_object_name,
                expiration_minutes=DOWNLOAD_URL_MINUTES,
                download_filename=document.original_filename,
            )
            return EsignDownloadResponse(
                url=url,
                filename=document.original_filename,
                sha256=document.sha256,
                expires_in_minutes=DOWNLOAD_URL_MINUTES,
            )
        finally:
            db.close()

    @staticmethod
    def _pdf_widget_rows(content: bytes, document_id: str) -> list[EsignPdfWidget]:
        type_map = {
            getattr(fitz, "PDF_WIDGET_TYPE_TEXT", 7): "text",
            getattr(fitz, "PDF_WIDGET_TYPE_SIGNATURE", 6): "signature",
            getattr(fitz, "PDF_WIDGET_TYPE_CHECKBOX", 2): "checkbox",
            getattr(fitz, "PDF_WIDGET_TYPE_RADIOBUTTON", 5): "radio",
            getattr(fitz, "PDF_WIDGET_TYPE_COMBOBOX", 3): "dropdown",
            getattr(fitz, "PDF_WIDGET_TYPE_LISTBOX", 4): "dropdown",
        }
        rows: list[EsignPdfWidget] = []
        with fitz.open(stream=content, filetype="pdf") as pdf:
            for page_number, page in enumerate(pdf):
                for index, widget in enumerate(list(page.widgets() or [])):
                    rect = widget.rect * page.rotation_matrix
                    rect.normalize()
                    name = str(widget.field_name or f"Field {page_number + 1}-{index + 1}")
                    suggested = type_map.get(widget.field_type)
                    lowered = f"{name} {widget.field_label or ''}".lower()
                    if suggested == "text" and "date" in lowered:
                        suggested = "date"
                    elif suggested == "text" and any(word in lowered for word in ("amount", "number", "total")):
                        suggested = "number"
                    choices = [str(item) for item in (getattr(widget, "choice_values", None) or [])]
                    rows.append(EsignPdfWidget(
                        widget_id=f"{page_number}:{index}:{name}",
                        name=name,
                        tooltip=str(widget.field_label) if widget.field_label else None,
                        suggested_field_type=suggested,
                        page_number=page_number,
                        x=max(0.0, min(1.0, rect.x0 / page.rect.width)),
                        y=max(0.0, min(1.0, rect.y0 / page.rect.height)),
                        width=max(0.0001, min(1.0, rect.width / page.rect.width)),
                        height=max(0.0001, min(1.0, rect.height / page.rect.height)),
                        required=bool(int(widget.field_flags or 0) & 2),
                        default_value=str(widget.field_value) if widget.field_value not in (None, "") else None,
                        max_length=int(widget.text_maxlen) if getattr(widget, "text_maxlen", 0) else None,
                        choices=choices,
                        supported=suggested is not None,
                    ))
        return rows

    async def inspect_pdf_widgets(
        self, user_id: str, envelope_id: str, document_id: str,
    ) -> EsignPdfWidgetInspectionResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            self._require_draft(envelope)
            document = next((item for item in envelope.documents or [] if str(item.id) == str(document_id)), None)
            if document is None:
                raise EsignNotFound("Document not found")
            content = await asyncio.to_thread(self.storage.bucket.blob(document.gcs_object_name).download_as_bytes)
            return EsignPdfWidgetInspectionResponse(
                document_id=str(document.id), widgets=self._pdf_widget_rows(content, str(document.id))
            )
        finally:
            db.close()

    async def convert_pdf_widgets(
        self,
        user_id: str,
        envelope_id: str,
        document_id: str,
        mappings: list[EsignPdfWidgetMapping],
    ) -> EsignEnvelopeResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            self._require_draft(envelope)
            document = next((item for item in envelope.documents or [] if str(item.id) == str(document_id)), None)
            if document is None:
                raise EsignNotFound("Document not found")
            recipients = {str(item.id) for item in envelope.recipients or []}
            content = await asyncio.to_thread(self.storage.bucket.blob(document.gcs_object_name).download_as_bytes)
            widgets = {item.widget_id: item for item in self._pdf_widget_rows(content, str(document.id))}
            pending = list(envelope.fields or [])
            converted_ids = {
                str((field.properties or {}).get("acroform_widget_id"))
                for field in pending if str(field.document_id) == str(document.id)
            }
            for mapping in mappings:
                widget = widgets.get(mapping.widget_id)
                if widget is None or not widget.supported:
                    raise EsignError(f"PDF widget '{mapping.widget_id}' is missing or unsupported")
                if str(mapping.recipient_id) not in recipients:
                    raise EsignError("Converted PDF field has an unknown recipient")
                if mapping.widget_id in converted_ids:
                    raise EsignConflict(f"PDF widget '{widget.name}' has already been converted")
                props: dict[str, Any] = {
                    "data_label": mapping.data_label or (
                        f"{widget.name}:{mapping.widget_id}" if mapping.field_type in {"radio", "checkbox", "signature"} else widget.name
                    ),
                    "tooltip": widget.tooltip,
                    "sender_prefill": widget.default_value,
                    "shared_value": mapping.field_type in {"text", "dropdown", "number", "date"},
                    "acroform_name": widget.name,
                    "acroform_widget_id": mapping.widget_id,
                    "conversion_source": "acroform",
                }
                if widget.max_length:
                    props["text_validation"] = {"max_length": widget.max_length}
                if mapping.field_type == "dropdown":
                    props["options"] = [{"value": choice, "label": choice} for choice in widget.choices]
                if mapping.field_type == "radio":
                    props["group"] = {"id": f"acroform:{widget.name}", "label": widget.tooltip or widget.name}
                    props["option_value"] = widget.default_value or mapping.widget_id
                pending.append(EsignField(
                    id=uuid.uuid4(), envelope_id=envelope.id, document_id=document.id,
                    recipient_id=uuid.UUID(str(mapping.recipient_id)), field_type=EsignFieldType(mapping.field_type),
                    page_number=widget.page_number, pos_x=widget.x, pos_y=widget.y,
                    width=widget.width, height=widget.height,
                    required=widget.required if mapping.required is None else mapping.required,
                    label=widget.tooltip or widget.name, properties={key: value for key, value in props.items() if value is not None},
                ))
            validate_field_graph(pending)
            db.add_all(pending[len(envelope.fields or []):])
            db.commit()
            db.expire(envelope, ["fields"])
            db.refresh(envelope)
            return self._serialize_envelope(envelope)
        except FieldLogicError as exc:
            logger.warning(
                "PDF form conversion validation failed envelope=%s document=%s",
                envelope_id, document_id,
            )
            db.rollback()
            raise EsignError(str(exc)) from exc
        except Exception:
            logger.warning(
                "PDF form conversion failed envelope=%s document=%s field_types=%s",
                envelope_id, document_id, sorted({mapping.field_type for mapping in mappings}), exc_info=True,
            )
            db.rollback()
            raise
        finally:
            db.close()

    async def _search_anchors(
        self,
        documents: list[Any],
        *,
        anchor: str,
        case_sensitive: bool,
        whole_word: bool = False,
        document_ids: Optional[list[str]] = None,
        page_numbers: Optional[list[int]] = None,
        match_mode: str = "all",
        horizontal_alignment: str = "after",
        offset_x: float = 0,
        offset_y: float = 0,
        offset_unit: str = "point",
    ) -> EsignAnchorSearchResponse:
        selected = set(document_ids or [])
        selected_pages = set(page_numbers or [])
        matches: list[EsignAnchorMatch] = []
        for document in documents:
            if selected and str(document.id) not in selected:
                continue
            content = await asyncio.to_thread(
                self.storage.bucket.blob(document.gcs_object_name).download_as_bytes
            )
            with fitz.open(stream=content, filetype="pdf") as pdf:
                for page_number, page in enumerate(pdf):
                    if selected_pages and page_number not in selected_pages:
                        continue
                    for raw_rect in page.search_for(anchor):
                        found_text = page.get_textbox(raw_rect).strip()
                        if case_sensitive and found_text != anchor:
                            continue
                        if whole_word:
                            escaped = re.escape(anchor)
                            flags = 0 if case_sensitive else re.IGNORECASE
                            if re.fullmatch(rf"\b{escaped}\b", found_text, flags=flags) is None:
                                continue
                        rect = raw_rect * page.rotation_matrix
                        rect.normalize()
                        factor = 1.0 if offset_unit == "point" else (72.0 / 25.4 if offset_unit == "mm" else 72.0)
                        dx, dy = offset_x * factor, offset_y * factor
                        if horizontal_alignment == "left":
                            x = rect.x0 + dx
                        elif horizontal_alignment == "center":
                            x = (rect.x0 + rect.x1) / 2 + dx
                        elif horizontal_alignment == "right":
                            x = rect.x1 + dx
                        else:
                            x = rect.x1 + dx
                        matches.append(
                            EsignAnchorMatch(
                                document_id=str(document.id),
                                page_number=page_number,
                                x=max(0.0, min(1.0, x / page.rect.width)),
                                y=max(0.0, min(1.0, (rect.y0 + dy) / page.rect.height)),
                                width=max(0.0, min(1.0, rect.width / page.rect.width)),
                                height=max(0.0, min(1.0, rect.height / page.rect.height)),
                            )
                        )
                        if match_mode == "first":
                            return EsignAnchorSearchResponse(matches=matches)
                        if len(matches) >= 500:
                            return EsignAnchorSearchResponse(matches=matches)
        return EsignAnchorSearchResponse(matches=matches)

    async def search_envelope_anchors(
        self,
        user_id: str,
        envelope_id: str,
        *,
        anchor: str,
        case_sensitive: bool = False,
        whole_word: bool = False,
        document_ids: Optional[list[str]] = None,
        page_numbers: Optional[list[int]] = None,
        match_mode: str = "all",
        horizontal_alignment: str = "after",
        offset_x: float = 0,
        offset_y: float = 0,
        offset_unit: str = "point",
    ) -> EsignAnchorSearchResponse:
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            self._require_draft(envelope)
            return await self._search_anchors(
                list(envelope.documents or []),
                anchor=anchor,
                case_sensitive=case_sensitive,
                whole_word=whole_word,
                document_ids=document_ids,
                page_numbers=page_numbers,
                match_mode=match_mode,
                horizontal_alignment=horizontal_alignment,
                offset_x=offset_x,
                offset_y=offset_y,
                offset_unit=offset_unit,
            )
        finally:
            db.close()

    async def search_template_anchors(
        self,
        user_id: str,
        template_id: str,
        *,
        anchor: str,
        case_sensitive: bool = False,
        whole_word: bool = False,
        document_ids: Optional[list[str]] = None,
        page_numbers: Optional[list[int]] = None,
        match_mode: str = "all",
        horizontal_alignment: str = "after",
        offset_x: float = 0,
        offset_y: float = 0,
        offset_unit: str = "point",
    ) -> EsignAnchorSearchResponse:
        db = self._get_session()
        try:
            template = self._load_template(db, user_id, template_id)
            return await self._search_anchors(
                list(template.documents or []),
                anchor=anchor,
                case_sensitive=case_sensitive,
                whole_word=whole_word,
                document_ids=document_ids,
                page_numbers=page_numbers,
                match_mode=match_mode,
                horizontal_alignment=horizontal_alignment,
                offset_x=offset_x,
                offset_y=offset_y,
                offset_unit=offset_unit,
            )
        finally:
            db.close()

    def delete_template(self, user_id: str, template_id: str) -> None:
        db = self._get_session()
        try:
            template = self._load_template(db, user_id, template_id)
            db.delete(template)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    async def save_envelope_as_template(
        self, user_id: str, envelope_id: str, *, name: str, description: Optional[str] = None
    ) -> EsignTemplateResponse:
        """Snapshot a draft/sent envelope's documents + field layout as a template."""
        if not name or not name.strip():
            raise EsignError("Template name is required")
        db = self._get_session()
        try:
            envelope = self._load_envelope(db, user_id, envelope_id)
            recipients = sorted(
                [r for r in (envelope.recipients or [])],
                key=lambda r: (r.routing_order, r.created_at),
            )
            recipient_index_by_id = {str(r.id): idx for idx, r in enumerate(recipients)}
            roles = [
                {
                    "label": r.name or f"Signer {idx + 1}",
                    "role": r.role.value if hasattr(r.role, "value") else str(r.role),
                    "routing_order": int(r.routing_order),
                }
                for idx, r in enumerate(recipients)
            ]

            template = EsignTemplate(
                id=uuid.uuid4(),
                user_id=user_id,
                name=name.strip()[:255],
                description=description,
                title=envelope.title,
                message=envelope.message,
                signing_type=envelope.signing_type,
                date_format=getattr(envelope, "date_format", None) or "MM/DD/YYYY",
                recipient_roles=roles,
            )
            db.add(template)
            db.flush()

            tdoc_by_envelope_doc: dict[str, EsignTemplateDocument] = {}
            for doc in envelope.documents or []:
                object_name = (
                    f"esign_templates/{user_id}/{template.id}/{uuid.uuid4()}_{os.path.basename(doc.original_filename)}"
                )
                # Template shares bytes with the envelope original; copy within GCS
                # before committing so a failed copy aborts the whole save.
                await self.storage.copy_object(doc.gcs_object_name, object_name)
                tdoc = EsignTemplateDocument(
                    id=uuid.uuid4(),
                    template_id=template.id,
                    display_order=doc.display_order,
                    original_filename=doc.original_filename,
                    gcs_object_name=object_name,
                    sha256=doc.original_sha256,
                    page_count=doc.page_count,
                    file_size_bytes=doc.file_size_bytes,
                )
                db.add(tdoc)
                tdoc_by_envelope_doc[str(doc.id)] = tdoc
            db.flush()

            id_map = {str(field.id): str(uuid.uuid4()) for field in (envelope.fields or [])}
            pending_fields: list[EsignTemplateField] = []
            for field in envelope.fields or []:
                idx = recipient_index_by_id.get(str(field.recipient_id))
                tdoc = tdoc_by_envelope_doc.get(str(field.document_id))
                if idx is None or tdoc is None:
                    continue
                pending_fields.append(
                    EsignTemplateField(
                        id=uuid.UUID(id_map[str(field.id)]),
                        template_id=template.id,
                        template_document_id=tdoc.id,
                        recipient_index=idx,
                        field_type=field.field_type,
                        page_number=field.page_number,
                        pos_x=field.pos_x,
                        pos_y=field.pos_y,
                        width=field.width,
                        height=field.height,
                        required=field.required,
                        label=field.label,
                        properties=remap_property_references(field.properties, id_map),
                    )
                )
            try:
                validate_field_graph(pending_fields)
            except FieldLogicError as exc:
                raise EsignError(str(exc))
            db.add_all(pending_fields)
            db.commit()
            db.refresh(template)
            return self._serialize_template(template)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

esign_envelope_service = EsignEnvelopeService()
