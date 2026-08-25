"""Signer-side ceremony + envelope lifecycle transitions for e-sign.

All state transitions (send, view, consent, sign, decline, void, expire)
write append-only audit events inside the same transaction as the state
change. Audit failure on the signing path rolls back the signature — the
trail is the product.
"""

from __future__ import annotations

import base64
import copy
import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import fitz
from sqlalchemy import or_, text
from sqlalchemy.orm import Session, joinedload

from core.database import db_config
from models.db_models import (
    EsignConsentRecord,
    EsignAiFieldPlacementRun,
    EsignEmailDelivery,
    EsignEnvelope,
    EsignEnvelopeStatus,
    EsignFirmSettings,
    EsignBrandProfile,
    EsignEventType,
    EsignField,
    EsignFieldType,
    EsignGuestInvitation,
    EsignGuestSession,
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
    EsignMarkArtifact,
    EsignMarkBundle,
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
    EsignConflict,
    EsignError,
    EsignNotFound,
    esign_envelope_service,
    sha256_hex,
)
from services.esign.authorization_service import esign_authorization_service
from services.esign.outbox_service import esign_outbox_service
from services.esign.field_logic import (
    FieldLogicError,
    resolve_required,
    resolve_visibility,
    synchronize_shared_values,
    validate_field_value,
)
from services.esign.routing_engine import (
    SIGNATURE_ROLES,
    assert_routing_version,
    available_actions,
    incomplete_blocking,
    is_complete,
    is_eligible,
    recompute_current_routing_order,
    role_value,
)
from services.esign.url_service import app_base_url
from services.gcs_service import get_storage_service
from services.billing_service import BillingService

logger = logging.getLogger(__name__)

MAX_SIGNATURE_IMAGE_BYTES = int(os.getenv("ESIGN_MAX_SIGNATURE_IMAGE_BYTES", str(1024 * 1024)))
MAX_ATTACHMENT_BYTES = int(os.getenv("ESIGN_MAX_ATTACHMENT_BYTES", str(25 * 1024 * 1024)))
ALLOWED_TYPED_FONTS = {"dancing-script", "caveat", "great-vibes", "homemade-apple"}

ACTIVE_ENVELOPE_STATUSES = (EsignEnvelopeStatus.SENT, EsignEnvelopeStatus.IN_PROGRESS)


def _should_materialize_anchor_match(rule: dict, field: Optional[EsignField]) -> bool:
    """Whether send-time resolution should create a field for an unclaimed hit."""
    return (
        field is None
        and str(rule.get("match_mode", "all")) == "all"
        and str(rule.get("placement_mode", "automatic")) != "individual"
    )


def _should_reposition_anchor_field(rule: dict) -> bool:
    """Whether send-time resolution may replace an existing field's geometry.

    Individual placements are accepted in the field editor and may be adjusted
    afterward. Their anchor remains useful for send-time validation, but their
    saved document, page, and coordinates are authoritative.
    """
    return str(rule.get("placement_mode", "automatic")) != "individual"


def format_date_signed(dt: datetime, date_format: Optional[str] = None) -> str:
    """Canonical storage value; ceremony and sealing apply display format."""
    return dt.date().isoformat()

# Most recent completed envelopes to keep in a signer's inbox.
COMPLETED_INBOX_LIMIT = int(os.getenv("ESIGN_COMPLETED_INBOX_LIMIT", "25"))


def signing_url(envelope_id) -> str:
    return f"{app_base_url()}/esign/sign/{envelope_id}"


def guest_capable_signing_url(envelope_id, invitation_token: str) -> str:
    """Account entry URL carrying an opaque guest fallback from the recipient email."""
    return f"{signing_url(envelope_id)}?{urlencode({'guest_token': invitation_token})}"


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
    def _queue_emails(
        db: Session, envelope: EsignEnvelope, emails: list[tuple[str, EmailContent]],
        *, kind: str, key: Optional[str] = None,
    ) -> None:
        batch = key or uuid.uuid4().hex
        for index, (to_email, content) in enumerate(emails):
            if not to_email:
                continue
            esign_outbox_service.queue_email(
                db, envelope=envelope, kind=kind, to_email=to_email, content=content,
                idempotency_key=f"{kind}:{envelope.id}:{batch}:{index}",
            )

    @staticmethod
    def _revoke_guest_access(
        db: Session, envelope_id, *, invitation_purpose: Optional[str] = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        invitation_query = db.query(EsignGuestInvitation).filter(
            EsignGuestInvitation.envelope_id == envelope_id,
            EsignGuestInvitation.revoked_at.is_(None),
        )
        if invitation_purpose is not None:
            invitation_query = invitation_query.filter(
                EsignGuestInvitation.purpose == invitation_purpose
            )
        invitation_query.update(
            {EsignGuestInvitation.revoked_at: now}, synchronize_session=False
        )
        db.query(EsignGuestSession).filter(
            EsignGuestSession.envelope_id == envelope_id,
            EsignGuestSession.revoked_at.is_(None),
        ).update({EsignGuestSession.revoked_at: now}, synchronize_session=False)

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
            if (recipient.email == email or recipient.host_email == email) and (
                not signer_only or recipient.role in SIGNATURE_ROLES
            ):
                return recipient
        raise EsignNotFound("Envelope not found")  # don't leak existence to non-recipients

    def _resolve_recipient(
        self, envelope: EsignEnvelope, user_email: str, recipient_id: Optional[str] = None,
        *, signer_only: bool = True,
    ) -> EsignRecipient:
        if recipient_id:
            recipient = next(
                (item for item in envelope.recipients or [] if str(item.id) == str(recipient_id)),
                None,
            )
            if recipient and (not signer_only or recipient.role in SIGNATURE_ROLES):
                return recipient
            raise EsignNotFound("Envelope not found")
        return self._find_recipient(envelope, user_email, signer_only=signer_only)

    def _backfill_recipient_user(self, recipient: EsignRecipient, user_id: str) -> None:
        if user_id and recipient.recipient_user_id is None:
            recipient.recipient_user_id = user_id

    @staticmethod
    def _valid_consent(db: Session, envelope: EsignEnvelope, recipient: EsignRecipient):
        record = (
            db.query(EsignConsentRecord)
            .filter(
                EsignConsentRecord.envelope_id == envelope.id,
                EsignConsentRecord.recipient_id == recipient.id,
            )
            .order_by(EsignConsentRecord.consented_at.desc())
            .first()
        )
        changed_at = getattr(recipient, "identity_changed_at", None)
        return record if record and (changed_at is None or record.consented_at > changed_at) else None

    def _is_recipients_turn(self, envelope: EsignEnvelope, recipient: EsignRecipient) -> bool:
        if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
            return False
        return is_eligible(envelope, recipient)

    # ------------------------------------------------------------------
    # Send
    # ------------------------------------------------------------------

    def recipient_signing_url(self, db: Session, envelope: EsignEnvelope, recipient: EsignRecipient) -> str:
        """Return an account entry with a secure guest fallback for remote recipients."""
        if recipient.role == EsignRecipientRole.IN_PERSON_SIGNER:
            return signing_url(envelope.id)
        from services.esign.recipient_service import esign_recipient_service
        invitation = esign_recipient_service._issue_invitation(db, envelope, recipient)
        return guest_capable_signing_url(envelope.id, invitation.invitation_token)

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

    @staticmethod
    def _record_send_page_usage(db: Session, envelope: EsignEnvelope) -> int:
        """Meter every source-document page once when an envelope is sent."""
        page_count = sum(int(document.page_count or 0) for document in envelope.documents or [])
        if page_count <= 0:
            return 0
        BillingService(db).record_usage(
            user_id=envelope.user_id,
            product="esign",
            source="esign_envelope_sent",
            unit="page",
            quantity=page_count,
            operation_id=str(envelope.id),
            notes="E-Signature envelope sent",
            commit=False,
        )
        return page_count

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
            if db.query(EsignAiFieldPlacementRun.id).filter(
                EsignAiFieldPlacementRun.envelope_id == envelope.id,
                EsignAiFieldPlacementRun.status == "completed",
            ).first():
                raise EsignConflict("Apply or discard staged AI field suggestions before sending")

            principal = esign_authorization_service.principal(db, user_id)
            if principal and not principal.can("send"):
                raise EsignNotFound("Envelope not found")
            settings = db.query(EsignFirmSettings).filter(EsignFirmSettings.firm_id == envelope.firm_id).first()
            if settings:
                overrides = dict(settings.sender_overrides or {})
                if not overrides.get("date_format", True): envelope.date_format = settings.date_format
                if not overrides.get("signing_type", True): envelope.signing_type = EsignSigningType(settings.signing_type)
                if not overrides.get("reminders", True): envelope.reminder_interval_hours = settings.reminder_interval_hours
                if not overrides.get("expiration", True):
                    envelope.expires_at = (
                        datetime.now(timezone.utc) + timedelta(days=int(settings.expiration_days))
                        if settings.expiration_days else None
                    )
                if not overrides.get("reassignment", True): envelope.allow_reassignment = settings.allow_reassignment
                if not overrides.get("brand", True): envelope.brand_id = settings.default_brand_id
                envelope.settings_snapshot = {
                    "version": settings.version, "date_format": envelope.date_format,
                    "signing_type": getattr(envelope.signing_type, "value", envelope.signing_type),
                    "reminder_interval_hours": envelope.reminder_interval_hours,
                    "allow_reassignment": envelope.allow_reassignment,
                    "features": dict(settings.features or {}),
                }
                features = dict(settings.features or {})
                advanced_roles = {EsignRecipientRole.APPROVER, EsignRecipientRole.CERTIFIED_DELIVERY,
                                  EsignRecipientRole.AGENT, EsignRecipientRole.EDITOR,
                                  EsignRecipientRole.WITNESS, EsignRecipientRole.IN_PERSON_SIGNER}
                if any(recipient.role in advanced_roles for recipient in envelope.recipients or []):
                    if not features.get("advanced_recipients", True) or (principal and not principal.can("advanced_recipients")):
                        raise EsignError("Advanced recipient roles are disabled for this firm or sender")
                if envelope.allow_reassignment and not features.get("recipient_reassignment", True):
                    raise EsignError("Recipient reassignment is disabled for this firm")
            brand = db.query(EsignBrandProfile).filter(EsignBrandProfile.id == envelope.brand_id,
                                                      EsignBrandProfile.firm_id == envelope.firm_id,
                                                      EsignBrandProfile.active.is_(True)).first() if envelope.brand_id else None
            if brand and brand.allowed_profile_ids and principal and not principal.is_admin and principal.profile_id not in brand.allowed_profile_ids:
                raise EsignError("The selected brand is no longer available to your permission profile")
            if brand:
                envelope.brand_snapshot = {
                    "id": str(brand.id), "name": brand.name, "logo_asset_id": str(brand.logo_asset_id) if brand.logo_asset_id else None,
                    "primary_color": brand.primary_color, "accent_color": brand.accent_color,
                    "email_header": brand.email_header, "email_footer": brand.email_footer,
                    "reply_to_address": brand.reply_to_address, "signing_welcome_text": brand.signing_welcome_text,
                    "support_url": brand.support_url,
                }
            else:
                envelope.brand_snapshot = {"name": "CPAAutomation", "primary_color": "#1D4ED8", "accent_color": "#0F172A"}

            # Durable anchors are resolved from the immutable server PDF at
            # send time. Browser text extraction is never authoritative.
            anchor_groups: dict[str, list[EsignField]] = {}
            for field in list(envelope.fields or []):
                anchor_rule = (field.properties or {}).get("anchor") or {}
                rule_id = str(anchor_rule.get("rule_id") or "")
                if rule_id:
                    anchor_groups.setdefault(rule_id, []).append(field)
            for rule_id, members in anchor_groups.items():
                rule = (members[0].properties or {}).get("anchor") or {}
                result = await esign_envelope_service._search_anchors(
                    list(envelope.documents or []), anchor=str(rule.get("anchor") or rule.get("text") or ""),
                    case_sensitive=bool(rule.get("case_sensitive", False)), whole_word=bool(rule.get("whole_word", False)),
                    document_ids=rule.get("document_ids"), page_numbers=rule.get("page_numbers"),
                    match_mode=str(rule.get("match_mode", "all")), horizontal_alignment=str(rule.get("horizontal_alignment", "after")),
                    relative_position=rule.get("relative_position"),
                    cross_axis_alignment=rule.get("cross_axis_alignment"),
                    offset_x=float(rule.get("offset_x", 0)), offset_y=float(rule.get("offset_y", 0)), offset_unit=str(rule.get("offset_unit", "point")),
                    field_width=float(members[0].width), field_height=float(members[0].height),
                )
                by_index = {int(((field.properties or {}).get("anchor") or {}).get("match_index", index)): field for index, field in enumerate(members)}
                removed = [field for index, field in by_index.items() if index >= len(result.matches)]
                for field in removed:
                    if not field.required:
                        db.delete(field)
                        envelope.fields.remove(field)
                for index, match in enumerate(result.matches):
                    field = by_index.get(index)
                    if _should_materialize_anchor_match(rule, field):
                        base = members[0]
                        properties = copy.deepcopy(base.properties or {})
                        properties["anchor"]["match_index"] = index
                        if base.field_type in (EsignFieldType.SIGNATURE, EsignFieldType.INITIALS, EsignFieldType.STAMP):
                            properties["data_label"] = f"{properties.get('data_label') or base.field_type.value}_{index + 1}"
                        field = EsignField(
                            id=uuid.uuid4(), envelope_id=envelope.id, document_id=uuid.UUID(match.document_id),
                            recipient_id=base.recipient_id, field_type=base.field_type, page_number=match.page_number,
                            pos_x=match.x, pos_y=match.y, width=base.width, height=base.height,
                            required=base.required, label=base.label, properties=properties,
                        )
                        db.add(field); envelope.fields.append(field)
                    elif field is not None and _should_reposition_anchor_field(
                        (field.properties or {}).get("anchor") or rule
                    ):
                        field.document_id = uuid.UUID(match.document_id)
                        field.page_number = match.page_number
                        if (
                            rule.get("relative_position") is not None
                            and match.anchor_x is not None and match.anchor_y is not None
                            and match.reference_x is not None and match.reference_y is not None
                        ):
                            field.pos_x, field.pos_y = esign_envelope_service._relative_anchor_field_position(
                                match.anchor_x,
                                match.anchor_y,
                                match.width,
                                match.height,
                                relative_position=str(rule.get("relative_position")),
                                cross_axis_alignment=str(rule.get("cross_axis_alignment") or "auto"),
                                field_width=float(field.width),
                                field_height=float(field.height),
                                offset_x=match.reference_x,
                                offset_y=match.reference_y,
                            )
                        elif match.reference_x is not None and match.reference_y is not None:
                            field.pos_x, field.pos_y = esign_envelope_service._anchor_field_position(
                                match.reference_x,
                                match.reference_y,
                                horizontal_alignment=str(rule.get("horizontal_alignment", "after")),
                                field_width=float(field.width),
                                field_height=float(field.height),
                            )
                        else:
                            field.pos_x, field.pos_y = match.x, match.y

            documents = envelope.documents or []
            if not documents:
                raise EsignError("Add at least one PDF before sending")
            blocking = incomplete_blocking(envelope.recipients or [])
            if not blocking:
                raise EsignError("Add at least one actionable recipient before sending")

            fields_by_recipient: dict[str, list[EsignField]] = {}
            for field in envelope.fields or []:
                fields_by_recipient.setdefault(str(field.recipient_id), []).append(field)
            for signer in [r for r in blocking if r.role in SIGNATURE_ROLES]:
                signer_fields = fields_by_recipient.get(str(signer.id), [])
                actionable_types = {
                    EsignFieldType.SIGNATURE, EsignFieldType.INITIALS, EsignFieldType.STAMP,
                    EsignFieldType.TEXT, EsignFieldType.NUMBER, EsignFieldType.DATE,
                    EsignFieldType.COMPANY, EsignFieldType.TITLE, EsignFieldType.CHECKBOX,
                    EsignFieldType.RADIO, EsignFieldType.DROPDOWN, EsignFieldType.ATTACHMENT,
                }
                if not any(
                    f.field_type in actionable_types
                    or (f.field_type == EsignFieldType.AUTO_FILL and (f.properties or {}).get("auto_source") == "company")
                    for f in signer_fields
                ):
                    raise EsignError(
                        f"Signature recipient {signer.name or signer.role_label or signer.id} has no actionable fields placed"
                    )
                for field in signer_fields:
                    props = field.properties or {}
                    locked_value = props.get("sender_prefill")
                    if field.field_type in (EsignFieldType.CHECKBOX, EsignFieldType.RADIO):
                        locked_value = locked_value == "true"
                    grouped_selection = field.field_type == EsignFieldType.RADIO or bool(props.get("selection_group"))
                    if field.required and props.get("read_only") and not grouped_selection and not locked_value:
                        raise EsignError(f"Required locked field '{field.label or field.field_type.value}' has no value")
                    if field.field_type == EsignFieldType.ATTACHMENT and not props.get("allowed_types"):
                        raise EsignError(f"Attachment field '{field.label or 'attachment'}' has no allowed MIME types")
                radio_groups: dict[str, list[EsignField]] = {}
                checkbox_groups: dict[str, list[EsignField]] = {}
                for field in signer_fields:
                    props = field.properties or {}
                    if field.field_type == EsignFieldType.RADIO:
                        radio_groups.setdefault(str((props.get("group") or {}).get("id")), []).append(field)
                    if field.field_type == EsignFieldType.CHECKBOX and props.get("selection_group"):
                        checkbox_groups.setdefault(str(props["selection_group"].get("id")), []).append(field)
                for members in radio_groups.values():
                    if any(member.required for member in members) and all((member.properties or {}).get("read_only") for member in members):
                        if sum((member.properties or {}).get("sender_prefill") == "true" for member in members) != 1:
                            raise EsignError("Required locked radio group needs one default option")
                for members in checkbox_groups.values():
                    if all((member.properties or {}).get("read_only") for member in members):
                        rules = (members[0].properties or {}).get("selection_group") or {}
                        count = sum((member.properties or {}).get("sender_prefill") == "true" for member in members)
                        if count < int(rules.get("minimum_selected", 0)) or (
                            rules.get("maximum_selected") is not None and count > int(rules["maximum_selected"])
                        ):
                            raise EsignError("Locked checkbox group defaults do not satisfy its selection rule")
            for recipient in blocking:
                if recipient.role not in (EsignRecipientRole.IN_PERSON_SIGNER, EsignRecipientRole.WITNESS) and not recipient.email:
                    raise EsignError("Every remote actionable recipient must have an email")
                if recipient.managed_by_recipient_id and (not recipient.name or not recipient.email):
                    manager = next((r for r in envelope.recipients or [] if r.id == recipient.managed_by_recipient_id), None)
                    if manager is None or manager.role not in (EsignRecipientRole.AGENT, EsignRecipientRole.EDITOR):
                        raise EsignError("Every unresolved placeholder must have an agent or editor")

            self._record_send_page_usage(db, envelope)
            now = datetime.now(timezone.utc)
            envelope.status = EsignEnvelopeStatus.SENT
            envelope.sent_at = now
            _, first_order = recompute_current_routing_order(envelope)
            assert first_order is not None

            if envelope.signing_type == EsignSigningType.PARALLEL:
                tranche = [r for r in blocking if r.role != EsignRecipientRole.WITNESS]
            else:
                tranche = [r for r in blocking if int(r.routing_order) == first_order and is_eligible(envelope, r)]
            cc_tranche = self._cc_recipients_due(envelope, first_order)
            sender_name = self._sender_name(envelope) or user_email
            for signer in tranche:
                target_email = signer.host_email if signer.role == EsignRecipientRole.IN_PERSON_SIGNER else signer.email
                if not target_email:
                    continue
                signer.status = EsignRecipientStatus.NOTIFIED
                emails.append(
                    (
                        target_email,
                        email_templates.signature_request(
                            recipient_name=signer.host_name if signer.role == EsignRecipientRole.IN_PERSON_SIGNER else (signer.name or signer.role_label or "Recipient"),
                            sender_name=sender_name,
                            title=envelope.title,
                            message=envelope.message,
                            url=self.recipient_signing_url(db, envelope, signer),
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
                            url=self.recipient_signing_url(db, envelope, cc),
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
                    "recipient_count": len(blocking),
                    "first_routing_order": first_order,
                    "notified": [s.host_email if s.role == EsignRecipientRole.IN_PERSON_SIGNER else s.email for s in tranche],
                    "cc_notified": [c.email for c in cc_tranche],
                },
            )
            self._queue_emails(db, envelope, emails, kind="invitation", key=f"send:{envelope.routing_version}")
            db.commit()
            db.refresh(envelope)
            response = esign_envelope_service._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        await esign_outbox_service.deliver_due_emails(envelope_id=envelope_id)
        return response

    # ------------------------------------------------------------------
    # Inbox / signing session
    # ------------------------------------------------------------------

    def get_inbox(
        self, *, user_id: str, user_email: str, q: str | None = None,
        state: str | None = None,
    ) -> EsignInboxResponse:
        email = (user_email or "").strip().lower()
        db = self._get_session()
        try:
            # Signers and CCs both appear — CCs as read-only "copy" entries.
            base = (
                db.query(EsignRecipient, EsignEnvelope)
                .join(EsignEnvelope, EsignRecipient.envelope_id == EsignEnvelope.id)
                .filter(or_(EsignRecipient.email == email, EsignRecipient.host_email == email))
            )
            if q and q.strip():
                base = base.filter(EsignEnvelope.title.ilike(f"%{q.strip()}%"))
            rows = (
                base.filter(
                    EsignEnvelope.status.in_(ACTIVE_ENVELOPE_STATUSES),
                    EsignRecipient.status.notin_(
                        [EsignRecipientStatus.SIGNED, EsignRecipientStatus.DECLINED]
                    ),
                )
                .order_by(EsignEnvelope.sent_at.desc())
                .all() if state != "completed" else []
            )
            # Completed envelopes stay listed so signers can reach the sealed
            # document and certificate after the fact.
            completed_rows = (
                base.filter(EsignEnvelope.status == EsignEnvelopeStatus.COMPLETED)
                .order_by(EsignEnvelope.completed_at.desc())
                .limit(COMPLETED_INBOX_LIMIT)
                .all() if state != "pending" else []
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
                        is_my_turn=self._is_recipients_turn(envelope, recipient),
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
        return f"{app_base_url()}/dashboard/esign/{envelope_id}"

    @staticmethod
    def recipient_notification_email(recipient: EsignRecipient) -> Optional[str]:
        return recipient.host_email if recipient.role == EsignRecipientRole.IN_PERSON_SIGNER else recipient.email

    @staticmethod
    def recipient_notification_name(recipient: EsignRecipient) -> str:
        if recipient.role == EsignRecipientRole.IN_PERSON_SIGNER:
            return recipient.host_name or "Signing host"
        return recipient.name or recipient.role_label or "Recipient"

    async def get_signing_session(
        self, *, user_id: Optional[str], user_email: str, envelope_id: str, meta: EsignRequestMeta,
        recipient_id: Optional[str] = None,
    ) -> EsignSigningSessionResponse:
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load_envelope_any(db, envelope_id)

            if envelope.status == EsignEnvelopeStatus.COMPLETED:
                # Completed envelopes stay viewable to every recipient (signers
                # and CCs) so they can reach the sealed document and certificate.
                recipient = self._resolve_recipient(envelope, user_email, recipient_id, signer_only=False)
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
                    routing_version=int(getattr(envelope, "routing_version", 1) or 1),
                    private_message=recipient.private_message,
                    available_actions=[],
                    consent_required=False,
                    consent_disclosure_text=envelope.consent_disclosure_text,
                    documents=[],
                    fields=[],
                    brand=dict(envelope.brand_snapshot or {}) or None,
                    expires_at=envelope.expires_at,
                )

            recipient = self._resolve_recipient(envelope, user_email, recipient_id, signer_only=False)
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
                    routing_version=int(getattr(envelope, "routing_version", 1) or 1),
                    private_message=recipient.private_message,
                    available_actions=[],
                    consent_required=False,
                    consent_disclosure_text=envelope.consent_disclosure_text,
                    documents=documents,
                    fields=[],
                    brand=dict(envelope.brand_snapshot or {}) or None,
                    expires_at=envelope.expires_at,
                )

            if not self._is_recipients_turn(envelope, recipient):
                if recipient.status == EsignRecipientStatus.SIGNED:
                    raise EsignConflict("You have already signed this envelope")
                raise PermissionError("It is not your turn to sign yet")

            # First view: record evidence before anything else. Certified
            # delivery completes on this authenticated document-session open.
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
                if recipient.role == EsignRecipientRole.CERTIFIED_DELIVERY:
                    recipient.status = EsignRecipientStatus.DELIVERED
                    recipient.action_completed_at = recipient.viewed_at
                    audit_service.record_event(
                        db, envelope_id=envelope.id, event_type=EsignEventType.DELIVERED,
                        actor_user_id=user_id, actor_email=user_email,
                        recipient_id=recipient.id, meta=meta,
                        details={"delivered_at": recipient.viewed_at.isoformat(), "routing_version": envelope.routing_version},
                    )
                    old_order, new_order = recompute_current_routing_order(envelope)
                    for item in envelope.recipients or []:
                        if is_eligible(envelope, item) and item.status == EsignRecipientStatus.PENDING:
                            item.status = EsignRecipientStatus.NOTIFIED
                    if old_order != new_order:
                        audit_service.record_event(
                            db, envelope_id=envelope.id, event_type=EsignEventType.ROUTING_ADVANCED,
                            actor_user_id=user_id, actor_email=user_email, recipient_id=recipient.id,
                            meta=meta, details={"from_routing_order": old_order, "to_routing_order": new_order},
                        )
            certified_seal_work_id = None
            if recipient.role == EsignRecipientRole.CERTIFIED_DELIVERY and not incomplete_blocking(envelope.recipients or []):
                certified_seal_work_id = str(esign_outbox_service.ensure_seal_work(db, envelope).id)
            db.commit()
            db.refresh(envelope)
            db.refresh(recipient)
            if certified_seal_work_id:
                await esign_outbox_service.dispatch_seal(certified_seal_work_id)
            elif recipient.role == EsignRecipientRole.CERTIFIED_DELIVERY:
                await self.notify_current_recipients(str(envelope.id))

            consent_exists = self._valid_consent(db, envelope, recipient) is not None

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

            role = role_value(recipient)
            role_fields = my_fields if role in SIGNATURE_ROLES else []
            role_attachments = [self._serialize_attachment(item) for item in attachment_rows] if role in SIGNATURE_ROLES else []
            managed_recipients = []
            if role in (EsignRecipientRole.AGENT, EsignRecipientRole.EDITOR):
                candidates = [item for item in envelope.recipients or [] if item.action_completed_at is None]
                if role == EsignRecipientRole.AGENT:
                    candidates = [item for item in candidates if str(item.managed_by_recipient_id) == str(recipient.id)]
                managed_recipients = [esign_envelope_service._serialize_recipient(item) for item in candidates if item.id != recipient.id]

            return EsignSigningSessionResponse(
                envelope_id=str(envelope.id),
                recipient_id=str(recipient.id),
                title=envelope.title,
                message=envelope.message,
                sender_email=self._sender_email(db, envelope),
                envelope_status=envelope.status.value if hasattr(envelope.status, "value") else str(envelope.status),
                recipient_status=recipient.status.value if hasattr(recipient.status, "value") else str(recipient.status),
                recipient_role=role.value,
                is_my_turn=is_eligible(envelope, recipient),
                routing_version=int(getattr(envelope, "routing_version", 1) or 1),
                private_message=recipient.private_message,
                available_actions=(
                    available_actions(envelope, recipient)
                    if recipient_id and role == EsignRecipientRole.SIGNER
                    else ["consent", "sign", "decline"]
                    if recipient_id and role in (EsignRecipientRole.WITNESS, EsignRecipientRole.IN_PERSON_SIGNER)
                    else available_actions(envelope, recipient)
                ),
                managed_recipients=managed_recipients,
                consent_required=(
                    (role == EsignRecipientRole.SIGNER or (recipient_id and role in SIGNATURE_ROLES))
                    and not consent_exists
                ),
                consent_disclosure_text=envelope.consent_disclosure_text,
                documents=documents,
                fields=role_fields,
                context_fields=context_fields,
                recipient_name=recipient.name or "",
                recipient_email=recipient.email or "",
                recipient_company=company,
                date_format=getattr(envelope, "date_format", None) or "MM/DD/YYYY",
                attachments=role_attachments,
                draft_marks=(
                    EsignMarkBundle.model_validate(recipient.draft_marks)
                    if getattr(recipient, "draft_marks", None) else None
                ),
                sent_at=envelope.sent_at,
                expires_at=envelope.expires_at,
                brand=dict(envelope.brand_snapshot or {}) or None,
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
        self, *, user_id: str, user_email: str, envelope_id: str,
        expected_routing_version: int, meta: EsignRequestMeta, recipient_id: Optional[str] = None,
    ) -> EsignConsentResponse:
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load_envelope_any(db, envelope_id)
            assert_routing_version(envelope, expected_routing_version)
            recipient = self._resolve_recipient(envelope, user_email, recipient_id)
            if recipient.role not in SIGNATURE_ROLES or (not recipient_id and recipient.role not in (EsignRecipientRole.SIGNER, EsignRecipientRole.WITNESS)):
                raise PermissionError("Electronic-record consent is not available for this role")
            self._backfill_recipient_user(recipient, user_id)
            if not self._is_recipients_turn(envelope, recipient):
                raise PermissionError("It is not your turn to sign yet")

            existing = self._valid_consent(db, envelope, recipient)
            if existing:
                db.commit()
                return EsignConsentResponse(
                    consented_at=existing.consented_at,
                    consent_text_sha256=existing.consent_text_sha256,
                )

            digest = sha256_hex((envelope.consent_disclosure_text or "").encode("utf-8"))
            consented_now = datetime.now(timezone.utc)
            record = EsignConsentRecord(
                id=uuid.uuid4(),
                envelope_id=envelope.id,
                recipient_id=recipient.id,
                consent_text_sha256=digest,
                ip_address=meta.ip_address,
                user_agent=meta.user_agent,
                consented_at=consented_now,
            )
            db.add(record)
            recipient.consented_at = consented_now
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
        field_values: list[EsignFieldValueInput], expected_routing_version: int,
        marks: Optional[EsignMarkBundle] = None,
        recipient_id: Optional[str] = None,
    ) -> int:
        """Persist text/checkbox drafts so the signer can leave and resume.

        Drafts are working state, not evidence: no audit event is written, and
        submit clears them when the final values land.
        """
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load_envelope_any(db, envelope_id)
            assert_routing_version(envelope, expected_routing_version)
            recipient = self._resolve_recipient(envelope, user_email, recipient_id)
            if recipient.role not in SIGNATURE_ROLES or (not recipient_id and recipient.role not in (EsignRecipientRole.SIGNER, EsignRecipientRole.WITNESS)):
                raise PermissionError("Signing progress is not available for this role")
            self._backfill_recipient_user(recipient, user_id)
            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                raise EsignConflict("This envelope is no longer active")
            if not self._is_recipients_turn(envelope, recipient):
                raise PermissionError("It is not your turn to sign yet")

            values_by_field = {str(v.field_id): v.value for v in field_values}
            if marks is not None:
                self._validate_mark_bundle(marks)
                recipient.draft_marks = marks.model_dump(exclude_none=True)
            saved = 0
            for field in envelope.fields or []:
                if str(field.recipient_id) != str(recipient.id):
                    continue
                editable = field.field_type in (
                    EsignFieldType.TEXT,
                    EsignFieldType.DATE,
                    EsignFieldType.NUMBER,
                    EsignFieldType.COMPANY,
                    EsignFieldType.TITLE,
                    EsignFieldType.CHECKBOX,
                    EsignFieldType.DROPDOWN,
                    EsignFieldType.RADIO,
                ) or (
                    field.field_type == EsignFieldType.AUTO_FILL
                    and (field.properties or {}).get("auto_source") == "company"
                )
                editable = editable and not bool((field.properties or {}).get("read_only"))
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
                    try:
                        field.draft_value = validate_field_value(
                            field, provided, date_format=getattr(envelope, "date_format", None) or "MM/DD/YYYY"
                        )
                    except FieldLogicError as exc:
                        raise EsignError(str(exc)) from exc
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
        recipient_id: Optional[str] = None,
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
            recipient = self._resolve_recipient(envelope, user_email, recipient_id)
            if recipient.role not in SIGNATURE_ROLES or (not recipient_id and recipient.role not in (EsignRecipientRole.SIGNER, EsignRecipientRole.WITNESS)):
                raise PermissionError("Attachments are not available for this role")
            self._backfill_recipient_user(recipient, user_id)
            if not self._is_recipients_turn(envelope, recipient):
                raise PermissionError("It is not your turn to sign yet")
            field = next((f for f in envelope.fields or [] if str(f.id) == str(field_id)), None)
            if not field or field.recipient_id != recipient.id or field.field_type != EsignFieldType.ATTACHMENT:
                raise EsignError("Attachment field not found")
            allowed_types = set((field.properties or {}).get("allowed_types") or [
                "application/pdf", "image/png", "image/jpeg",
            ])
            if normalized_type not in allowed_types:
                raise EsignError(
                    f"This attachment field does not allow {normalized_type} files"
                )

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
        recipient_id: Optional[str] = None,
    ) -> None:
        db = self._get_session()
        object_name: Optional[str] = None
        try:
            envelope = self._load_envelope_any(db, envelope_id)
            recipient = self._resolve_recipient(envelope, user_email, recipient_id)
            if recipient.role not in SIGNATURE_ROLES or (not recipient_id and recipient.role not in (EsignRecipientRole.SIGNER, EsignRecipientRole.WITNESS)):
                raise PermissionError("Attachments are not available for this role")
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

    def _validate_mark_artifact(
        self, artifact: EsignMarkArtifact, *, stamp: bool = False,
    ) -> Optional[bytes]:
        if stamp and artifact.signature_type == EsignSignatureType.TYPED.value:
            raise EsignError("Stamps must be drawn or uploaded images")
        if artifact.signature_type in (
            EsignSignatureType.DRAWN.value, EsignSignatureType.UPLOADED.value,
        ):
            return self._decode_signature_image(artifact.image_data_url or "")
        if artifact.signature_type == EsignSignatureType.TYPED.value:
            if not (artifact.typed_text or "").strip():
                raise EsignError("Typed mark text is required")
            if artifact.typed_font and artifact.typed_font not in ALLOWED_TYPED_FONTS:
                raise EsignError(f"Unsupported signature font: {artifact.typed_font}")
            return None
        raise EsignError(f"Invalid signature type: {artifact.signature_type}")

    def _validate_mark_bundle(self, marks: EsignMarkBundle) -> dict[str, Optional[bytes]]:
        return {
            name: self._validate_mark_artifact(artifact, stamp=name == "stamp")
            for name in ("signature", "initials", "stamp")
            if (artifact := getattr(marks, name)) is not None
        }

    @staticmethod
    def _legacy_mark_bundle(signature: EsignSignatureInput) -> EsignMarkBundle:
        signature_mark = EsignMarkArtifact(
            signature_type=signature.signature_type,
            image_data_url=signature.image_data_url,
            typed_text=signature.typed_text,
            typed_font=signature.typed_font,
        )
        source = (signature.initials_text or "").strip()
        if not source:
            source = "".join(
                part[0].upper() for part in (signature.typed_text or "").split() if part
            )[:20]
        initials_mark = EsignMarkArtifact(
            signature_type=(
                signature.signature_type if signature.initials_image_data_url
                else EsignSignatureType.TYPED.value
            ),
            image_data_url=signature.initials_image_data_url,
            typed_text=source or "IN",
            typed_font=signature.typed_font,
        )
        return EsignMarkBundle(signature=signature_mark, initials=initials_mark)

    async def submit_signature(
        self,
        *,
        user_id: str,
        user_email: str,
        envelope_id: str,
        signature: Optional[EsignSignatureInput],
        marks: Optional[EsignMarkBundle] = None,
        field_values: list[EsignFieldValueInput],
        expected_routing_version: int,
        meta: EsignRequestMeta,
        recipient_id: Optional[str] = None,
        occupation: Optional[str] = None,
        address: Optional[str] = None,
    ) -> EsignSubmitResponse:
        submission_types: set[str] = set()
        legacy_submission = marks is None and signature is not None
        effective_marks = marks or (self._legacy_mark_bundle(signature) if signature else EsignMarkBundle())
        mark_images = self._validate_mark_bundle(effective_marks)

        sealing_enqueued = False
        sealing_work_id: Optional[str] = None
        emails: list[tuple[str, EmailContent]] = []
        uploaded_objects: list[str] = []
        db = self._get_session()
        try:
            # Serialize concurrent submits on the same envelope (two final
            # signers must not both enqueue sealing).
            acquire_envelope_lock(db, envelope_id)

            envelope = self._load_envelope_any(db, envelope_id)
            assert_routing_version(envelope, expected_routing_version)
            recipient = self._resolve_recipient(envelope, user_email, recipient_id)
            if recipient.role not in SIGNATURE_ROLES or (not recipient_id and recipient.role not in (EsignRecipientRole.SIGNER, EsignRecipientRole.WITNESS)):
                raise PermissionError("Signature submission is not available for this role")
            self._backfill_recipient_user(recipient, user_id)

            if recipient.status == EsignRecipientStatus.SIGNED:
                raise EsignConflict("You have already signed this envelope")
            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                raise EsignConflict(
                    f"This envelope is no longer available for signing (status: {envelope.status.value})"
                )
            if not self._is_recipients_turn(envelope, recipient):
                raise PermissionError("It is not your turn to sign yet")

            consent = self._valid_consent(db, envelope, recipient)
            if not consent:
                raise EsignError("You must consent to electronic records before signing")
            if recipient.role == EsignRecipientRole.WITNESS and (not occupation or not address):
                raise EsignError("Witness occupation and address are required")

            now = datetime.now(timezone.utc)

            artifacts = {
                name: getattr(effective_marks, name)
                for name in ("signature", "initials", "stamp")
            }
            object_names: dict[str, Optional[str]] = {name: None for name in artifacts}
            image_hashes: dict[str, Optional[str]] = {name: None for name in artifacts}
            for name, content in mark_images.items():
                if content is not None:
                    object_names[name] = (
                        f"esign/{envelope.user_id}/{envelope.id}/signatures/"
                        f"{recipient.id}_{uuid.uuid4().hex[:8]}_{name}.png"
                    )
                    image_hashes[name] = sha256_hex(content)

            signature_record = None
            first_artifact = next((item for item in artifacts.values() if item is not None), None)
            if first_artifact is not None:
                signature_mark = artifacts["signature"]
                initials_mark = artifacts["initials"]
                stamp_mark = artifacts["stamp"]
                signature_record = EsignSignatureRecord(
                    id=uuid.uuid4(), envelope_id=envelope.id, recipient_id=recipient.id,
                    signature_type=EsignSignatureType(
                        signature_mark.signature_type if signature_mark else first_artifact.signature_type
                    ),
                    image_gcs_object_name=object_names["signature"],
                    image_sha256=image_hashes["signature"],
                    typed_text=(signature_mark.typed_text or "").strip() or None if signature_mark else None,
                    typed_font=signature_mark.typed_font if signature_mark else None,
                    initials_type=EsignSignatureType(initials_mark.signature_type) if initials_mark else None,
                    initials_typed_font=initials_mark.typed_font if initials_mark else None,
                    initials_text=(initials_mark.typed_text or "").strip()[:20] or None if initials_mark else None,
                    initials_image_gcs_object_name=object_names["initials"],
                    initials_image_sha256=image_hashes["initials"],
                    stamp_type=EsignSignatureType(stamp_mark.signature_type) if stamp_mark else None,
                    stamp_image_gcs_object_name=object_names["stamp"],
                    stamp_image_sha256=image_hashes["stamp"],
                )
                db.add(signature_record)
                db.flush()

            # Apply field values. Visibility and requiredness are recomputed on
            # the server; the client cannot bypass a conditional requirement.
            submissions = {str(v.field_id): v for v in field_values}
            values_by_field = synchronize_shared_values(
                envelope.fields or [], {field_id: item.value for field_id, item in submissions.items()}
            )
            all_fields = list(envelope.fields or [])
            my_fields = [f for f in all_fields if str(f.recipient_id) == str(recipient.id)]
            submission_types = {f.field_type.value if hasattr(f.field_type, "value") else str(f.field_type) for f in my_fields}
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
                if (field.properties or {}).get("read_only"):
                    try:
                        field.value = validate_field_value(
                            field, provided,
                            date_format=getattr(envelope, "date_format", None) or "MM/DD/YYYY",
                        )
                    except FieldLogicError as exc:
                        raise EsignError(str(exc)) from exc
                elif field.field_type in (EsignFieldType.SIGNATURE, EsignFieldType.INITIALS, EsignFieldType.STAMP):
                    submission = submissions.get(str(field.id))
                    # Missing completed is the expand-first compatibility path
                    # for clients deployed before per-instance completion.
                    completed = submission.completed if submission and submission.completed is not None else submission is None
                    mark_name = field.field_type.value
                    legacy_stamp = (
                        legacy_submission
                        and field.field_type == EsignFieldType.STAMP
                        and (field.properties or {}).get("schema_version") != 2
                    )
                    if completed and artifacts.get(mark_name) is None and not legacy_stamp:
                        raise EsignError(f"A distinct {mark_name.replace('_', ' ')} mark must be adopted")
                    field.value = str(signature_record.id) if completed and signature_record else None
                elif field.field_type == EsignFieldType.DATE_SIGNED:
                    field.value = format_date_signed(now, getattr(envelope, "date_format", None) or "MM/DD/YYYY")
                elif field.field_type in (
                    EsignFieldType.FIRST_NAME, EsignFieldType.LAST_NAME,
                    EsignFieldType.FULL_NAME, EsignFieldType.EMAIL,
                ):
                    parts = recipient.name.split()
                    field.value = (
                        (parts[0] if parts else "") if field.field_type == EsignFieldType.FIRST_NAME else
                        (parts[-1] if parts else "") if field.field_type == EsignFieldType.LAST_NAME else
                        recipient.name if field.field_type == EsignFieldType.FULL_NAME else recipient.email
                    )
                elif field.field_type == EsignFieldType.COMPANY:
                    try:
                        field.value = validate_field_value(
                            field, provided or company, date_format=getattr(envelope, "date_format", None) or "MM/DD/YYYY"
                        )
                    except FieldLogicError as exc:
                        raise EsignError(str(exc)) from exc
                elif field.field_type == EsignFieldType.AUTO_FILL:
                    source = (field.properties or {}).get("auto_source")
                    if source == "recipient_name":
                        field.value = recipient.name
                    elif source == "recipient_email":
                        field.value = recipient.email
                    elif source == "date_sent":
                        field.value = format_date_signed(
                            envelope.sent_at or now, getattr(envelope, "date_format", None) or "MM/DD/YYYY"
                        )
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
                    try:
                        field.value = validate_field_value(
                            field, provided, date_format=getattr(envelope, "date_format", None) or "MM/DD/YYYY"
                        )
                    except FieldLogicError as exc:
                        raise EsignError(str(exc)) from exc

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

            checkbox_groups: dict[str, list[EsignField]] = {}
            for field in my_fields:
                props = field.properties or {}
                selection_group = props.get("selection_group") or {}
                group_id = str(selection_group.get("id") or "")
                # Legacy envelopes grouped by shared data label. Schema-v2
                # selection groups are deliberately independent from sharing.
                if not group_id and props.get("selection_validation"):
                    group_id = str(props.get("data_label") or "")
                if field.field_type == EsignFieldType.CHECKBOX and group_id:
                    checkbox_groups.setdefault(group_id, []).append(field)
            for group_id, members in checkbox_groups.items():
                first_props = members[0].properties or {}
                rules = first_props.get("selection_group") or first_props.get("selection_validation") or {}
                selected_count = sum(member.value == "true" for member in members if visible.get(str(member.id), True))
                minimum = int(rules.get("minimum_selected", 0))
                maximum = rules.get("maximum_selected")
                if selected_count < minimum or (maximum is not None and selected_count > int(maximum)):
                    message = rules.get("validation_message")
                    label = rules.get("label") or group_id
                    raise EsignError(message or f"Checkbox group '{label}' selection count is invalid")

            for field in my_fields:
                if field.field_type in (EsignFieldType.FORMULA, EsignFieldType.RADIO):
                    continue
                if field.field_type == EsignFieldType.CHECKBOX and (field.properties or {}).get("selection_group"):
                    continue
                if not resolve_required(field, all_fields, final_values, visible):
                    continue
                label = field.label or field.field_type.value.replace("_", " ")
                if field.field_type == EsignFieldType.CHECKBOX and field.value != "true":
                    raise EsignError(f"Required field '{label}' must be checked")
                if field.field_type == EsignFieldType.ATTACHMENT and not field.value:
                    raise EsignError(f"Required attachment '{label}' is missing")
                if field.field_type in (
                    EsignFieldType.SIGNATURE, EsignFieldType.INITIALS, EsignFieldType.STAMP,
                ) and not field.value:
                    raise EsignError(f"Required field '{label}' has not been applied")
                if field.field_type not in (
                    EsignFieldType.SIGNATURE,
                    EsignFieldType.INITIALS,
                    EsignFieldType.STAMP,
                    EsignFieldType.DATE_SIGNED,
                    EsignFieldType.CHECKBOX,
                ) and not field.value:
                    raise EsignError(f"Required field '{label}' is missing a value")

            # Only touch object storage after every envelope, consent, routing,
            # field, conditional, and witness-evidence validation has passed.
            for name, content in mark_images.items():
                object_name = object_names.get(name)
                if content is not None and object_name:
                    await self.storage.upload_file_content(content, object_name)
                    uploaded_objects.append(object_name)

            recipient.draft_marks = None

            recipient.status = EsignRecipientStatus.SIGNED
            recipient.signed_at = now
            recipient.action_completed_at = now
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
                    "signature_record_id": str(signature_record.id) if signature_record else None,
                    "signature_type": artifacts["signature"].signature_type if artifacts["signature"] else None,
                    "signature_image_sha256": image_hashes["signature"],
                    "initials_text": artifacts["initials"].typed_text if artifacts["initials"] else None,
                    "initials_image_sha256": image_hashes["initials"],
                    "stamp_image_sha256": image_hashes["stamp"],
                    "legacy_mark_fallback": legacy_submission,
                    "field_count": len(my_fields),
                    "consent_record_id": str(consent.id),
                    "occupation": occupation,
                    "address": address,
                },
            )

            # Routing advancement (still under the advisory lock).
            sender_email = self._sender_email(db, envelope)
            sender_name = self._sender_name(envelope)
            url = signing_url(envelope.id)
            unsigned = incomplete_blocking(envelope.recipients or [])
            old_order, next_order = recompute_current_routing_order(envelope)
            if old_order != next_order:
                audit_service.record_event(
                    db, envelope_id=envelope.id, event_type=EsignEventType.ROUTING_ADVANCED,
                    actor_user_id=user_id, actor_email=user_email, recipient_id=recipient.id,
                    meta=meta, details={"from_routing_order": old_order, "to_routing_order": next_order},
                )
            if not unsigned:
                sealing_enqueued = True
                sealing_work_id = str(esign_outbox_service.ensure_seal_work(db, envelope).id)
            elif next_order is not None:
                for r in unsigned:
                    if is_eligible(envelope, r) and r.status == EsignRecipientStatus.PENDING:
                        notify_email = r.host_email if r.role == EsignRecipientRole.IN_PERSON_SIGNER else r.email
                        if not notify_email or r.role == EsignRecipientRole.WITNESS:
                            continue
                        r.status = EsignRecipientStatus.NOTIFIED
                        emails.append(
                            (
                                notify_email,
                                email_templates.signature_request(
                                    recipient_name=r.host_name if r.role == EsignRecipientRole.IN_PERSON_SIGNER else (r.name or r.role_label or "Recipient"),
                                    sender_name=sender_name,
                                    title=envelope.title,
                                    message=envelope.message,
                                    url=self.recipient_signing_url(db, envelope, r),
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
                                url=self.recipient_signing_url(db, envelope, cc),
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

            self._queue_emails(
                db, envelope, emails, kind="routing_notification",
                key=f"signed:{recipient.id}:{envelope.routing_version}",
            )
            db.commit()
            envelope_status_value = (
                envelope.status.value if hasattr(envelope.status, "value") else str(envelope.status)
            )
            env_id = str(envelope.id)
        except Exception:
            logger.warning(
                "E-sign submission validation/lifecycle failure envelope=%s field_types=%s",
                envelope_id, sorted(submission_types), exc_info=True,
            )
            db.rollback()
            for object_name in uploaded_objects:
                try:
                    await self.storage.delete_file(object_name)
                except Exception:
                    logger.warning("Could not compensate failed signature upload %s", object_name, exc_info=True)
            raise
        finally:
            db.close()

        if sealing_enqueued:
            # The durable row was committed with the final signature. Dispatch
            # failure is recorded for maintenance reconciliation and does not
            # strand an otherwise valid signature submission.
            await esign_outbox_service.dispatch_seal(sealing_work_id)

        await esign_outbox_service.deliver_due_emails(envelope_id=env_id)

        return EsignSubmitResponse(
            envelope_status=envelope_status_value,
            recipient_status=EsignRecipientStatus.SIGNED.value,
            sealing_enqueued=sealing_enqueued,
        )

    # ------------------------------------------------------------------
    # Decline / void / remind
    # ------------------------------------------------------------------

    async def decline(
        self, *, user_id: str, user_email: str, envelope_id: str, reason: str,
        expected_routing_version: int, meta: EsignRequestMeta,
        recipient_id: Optional[str] = None,
    ) -> EsignSubmitResponse:
        emails: list[tuple[str, EmailContent]] = []
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load_envelope_any(db, envelope_id)
            assert_routing_version(envelope, expected_routing_version)
            recipient = self._resolve_recipient(envelope, user_email, recipient_id, signer_only=False)
            self._backfill_recipient_user(recipient, user_id)

            if recipient.status == EsignRecipientStatus.SIGNED:
                raise EsignConflict("You have already signed this envelope")
            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                raise EsignConflict("This envelope is no longer active")
            if not is_eligible(envelope, recipient):
                raise PermissionError("This recipient cannot decline at the current routing step")

            now = datetime.now(timezone.utc)
            recipient.status = EsignRecipientStatus.DECLINED
            recipient.declined_at = now
            recipient.declined_reason = reason
            envelope.status = EsignEnvelopeStatus.DECLINED
            self._revoke_guest_access(db, envelope.id)

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
            self._queue_emails(db, envelope, emails, kind="declined", key=f"declined:{recipient.id}")
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        await esign_outbox_service.deliver_due_emails(envelope_id=envelope_id)
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
            self._revoke_guest_access(db, envelope.id)
            # Every recipient already involved (signer or CC) hears about the void.
            notified = [
                self.recipient_notification_email(r)
                for r in (envelope.recipients or [])
                if r.status not in (EsignRecipientStatus.PENDING,) and self.recipient_notification_email(r)
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
            content = email_templates.voided(sender_name=sender_name, title=envelope.title, reason=reason)
            self._queue_emails(db, envelope, [(email, content) for email in notified], kind="voided", key=f"voided:{envelope.id}")
            db.commit()
            db.refresh(envelope)
            response = esign_envelope_service._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        await esign_outbox_service.deliver_due_emails(envelope_id=envelope_id)
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
                details={"recipients": [self.recipient_notification_email(t) for t in targets], "manual": True},
            )
            sender_name = self._sender_name(envelope) or user_email
            reminder_emails = [
                (
                    self.recipient_notification_email(t),
                    email_templates.signature_request(
                        recipient_name=self.recipient_notification_name(t),
                        sender_name=sender_name,
                        title=envelope.title,
                        message=envelope.message,
                        url=self.recipient_signing_url(db, envelope, t),
                        expires_at=envelope.expires_at,
                        reminder=True,
                    ),
                )
                for t in targets
            ]
            self._queue_emails(
                db, envelope, reminder_emails, kind="reminder",
                key=f"manual-reminder:{int(envelope.last_reminder_at.timestamp())}",
            )
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        await esign_outbox_service.deliver_due_emails(envelope_id=envelope_id)
        return {"reminded": [email for email, _ in reminder_emails]}

    async def notify_reassigned_recipient(self, envelope_id: str, recipient_id: str) -> None:
        """Deliver a fresh invitation immediately after a recipient transfer."""
        db = self._get_session()
        try:
            envelope = self._load_envelope_any(db, envelope_id)
            recipient = next(
                (item for item in envelope.recipients or [] if str(item.id) == str(recipient_id)),
                None,
            )
            if recipient is None or not recipient.email or not is_eligible(envelope, recipient):
                return
            url = self.recipient_signing_url(db, envelope, recipient)
            recipient.status = EsignRecipientStatus.NOTIFIED
            content = email_templates.signature_request(
                recipient_name=self.recipient_notification_name(recipient),
                sender_name=self._sender_name(envelope), title=envelope.title,
                message=envelope.message, url=url, expires_at=envelope.expires_at,
            )
            email = recipient.email
            self._queue_emails(db, envelope, [(email, content)], kind="invitation", key=f"reassigned:{recipient.id}:{envelope.routing_version}")
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        await esign_outbox_service.deliver_due_emails(envelope_id=envelope_id)

    async def notify_current_recipients(self, envelope_id: str) -> None:
        """Notify recipients activated by a non-signature routing step."""
        pending: list[tuple[str, EmailContent]] = []
        db = self._get_session()
        try:
            envelope = self._load_envelope_any(db, envelope_id)
            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                return
            sender_name = self._sender_name(envelope)
            for recipient in incomplete_blocking(envelope.recipients or []):
                if not is_eligible(envelope, recipient) or recipient.status != EsignRecipientStatus.PENDING:
                    continue
                email = self.recipient_notification_email(recipient)
                if not email:
                    continue
                recipient.status = EsignRecipientStatus.NOTIFIED
                pending.append((email, email_templates.signature_request(
                    recipient_name=self.recipient_notification_name(recipient), sender_name=sender_name,
                    title=envelope.title, message=envelope.message,
                    url=self.recipient_signing_url(db, envelope, recipient), expires_at=envelope.expires_at,
                )))
            if envelope.current_routing_order is not None:
                for cc in self._cc_recipients_due(envelope, int(envelope.current_routing_order)):
                    cc.status = EsignRecipientStatus.NOTIFIED
                    pending.append((cc.email, email_templates.cc_copy(
                        recipient_name=cc.name, sender_name=sender_name, title=envelope.title,
                        message=envelope.message, url=self.recipient_signing_url(db, envelope, cc),
                        expires_at=envelope.expires_at,
                    )))
            self._queue_emails(
                db, envelope, pending, kind="invitation",
                key=f"routing:{envelope.routing_version}:{envelope.current_routing_order}",
            )
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        await esign_outbox_service.deliver_due_emails(envelope_id=envelope_id)

    def current_tranche_pending_signers(self, envelope: EsignEnvelope) -> list[EsignRecipient]:
        signers = [
            r
            for r in (envelope.recipients or [])
            if r.role != EsignRecipientRole.CC
            and not is_complete(r)
            and (r.email or r.host_email)
            and r.role != EsignRecipientRole.WITNESS
        ]
        return [r for r in signers if is_eligible(envelope, r)]

    # ------------------------------------------------------------------
    # Emails
    # ------------------------------------------------------------------

    async def _send_content(self, to_email: str, content: EmailContent) -> None:
        import asyncio

        from services.email_service import email_service

        await asyncio.to_thread(
            email_service.send_html_email,
            to_email,
            content.subject,
            content.html,
            content.text,
        )

    def queue_completion_emails(self, db: Session, envelope: EsignEnvelope) -> None:
        """Queue completion notices in the same transaction as completion."""
        sender_email = self._sender_email(db, envelope)
        from services.esign.recipient_service import esign_recipient_service
        # Re-running this idempotent method must not revoke the completed-copy
        # bearer links already persisted in queued delivery bodies.
        self._revoke_guest_access(db, envelope.id, invitation_purpose="ceremony")
        for recipient in list(envelope.recipients or []):
            email = self.recipient_notification_email(recipient)
            if not email:
                continue
            email = email.strip().lower()
            if sender_email and email == sender_email.strip().lower():
                continue
            idempotency_key = f"completion:{envelope.id}:{email}"
            if db.query(EsignEmailDelivery.id).filter(
                EsignEmailDelivery.idempotency_key == idempotency_key
            ).first():
                continue
            invitation = esign_recipient_service._issue_invitation(
                db, envelope, recipient, purpose="completed_copy",
            )
            url = guest_capable_signing_url(envelope.id, invitation.invitation_token)
            esign_outbox_service.queue_email(
                db, envelope=envelope, kind="completion", to_email=email,
                content=email_templates.completed(title=envelope.title, url=url, is_sender=False),
                idempotency_key=idempotency_key,
            )
        if sender_email:
            email = sender_email.strip().lower()
            esign_outbox_service.queue_email(
                db, envelope=envelope, kind="completion", to_email=email,
                content=email_templates.completed(
                    title=envelope.title,
                    url=self.sender_envelope_url(envelope.id),
                    is_sender=True,
                ),
                idempotency_key=f"completion:{envelope.id}:{email}",
            )

    async def send_completion_emails(self, envelope_id: str) -> None:
        """Compatibility entrypoint: durably queue then attempt completion notices."""
        db = self._get_session()
        try:
            envelope = self._load_envelope_any(db, envelope_id)
            self.queue_completion_emails(db, envelope)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        await esign_outbox_service.deliver_due_emails(envelope_id=envelope_id)


esign_signing_service = EsignSigningService()
