"""Advanced recipient management and guest ceremony services."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from core.database import db_config
from models.db_models import (
    EsignConsentRecord,
    EsignEnvelope,
    EsignEnvelopeStatus,
    EsignEventType,
    EsignFieldType,
    EsignGuestInvitation,
    EsignGuestSession,
    EsignRecipient,
    EsignRecipientChange,
    EsignRecipientRole,
    EsignRecipientStatus,
    EsignSignatureRecord,
    EsignSignatureType,
)
from models.esign import (
    EsignCorrectionRequest,
    EsignEnvelopeResponse,
    EsignGuestExchangeResponse,
    EsignGuestInvitationResponse,
    EsignGuestSessionResponse,
    EsignGuestSubmitRequest,
    EsignInPersonStartRequest,
    EsignManagedRecipientsRequest,
    EsignManagedRecipientsResponse,
    EsignProgressRequest,
    EsignRecipientResponse,
    EsignReassignRequest,
    EsignSigningDocument,
    EsignSubmitResponse,
    EsignWitnessRequest,
)
from services.esign import audit_service
from services.esign.audit_service import EsignRequestMeta
from services.esign.envelope_service import (
    DOWNLOAD_URL_MINUTES,
    EsignConflict,
    EsignError,
    EsignNotFound,
    esign_envelope_service,
    sha256_hex,
)
from services.esign.routing_engine import (
    MANAGER_ROLES,
    SIGNATURE_ROLES,
    assert_routing_version,
    available_actions,
    incomplete_blocking,
    is_eligible,
    recompute_current_routing_order,
    role_value,
)
from services.esign.signing_service import ACTIVE_ENVELOPE_STATUSES, acquire_envelope_lock
from services.gcs_service import get_storage_service

GUEST_IDLE_MINUTES = 30
GUEST_ABSOLUTE_HOURS = 2
GUEST_INVITATION_DAYS = 7


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _normalize_email(value: Optional[str]) -> Optional[str]:
    return value.strip().lower() if value else None


def _private_hash(value: Optional[str]) -> Optional[str]:
    return sha256_hex(value.encode("utf-8")) if value else None


def recipient_snapshot(recipient) -> dict:
    """Audit snapshot that deliberately never duplicates private-message plaintext."""
    return {
        "id": str(recipient.id),
        "name": recipient.name,
        "email": recipient.email,
        "role": role_value(recipient).value,
        "role_label": recipient.role_label,
        "routing_order": int(recipient.routing_order),
        "managed_by_recipient_id": str(recipient.managed_by_recipient_id) if recipient.managed_by_recipient_id else None,
        "witness_for_recipient_id": str(recipient.witness_for_recipient_id) if recipient.witness_for_recipient_id else None,
        "host_name": recipient.host_name,
        "host_email": recipient.host_email,
        "allow_reassignment": bool(recipient.allow_reassignment),
        "private_message_sha256": _private_hash(recipient.private_message),
    }


class EsignRecipientService:
    def __init__(self) -> None:
        self.storage = get_storage_service()

    def _get_session(self) -> Session:
        return db_config.get_session()

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
        changed_at = recipient.identity_changed_at
        return record if record and (changed_at is None or record.consented_at > changed_at) else None

    def _load(self, db: Session, envelope_id: str) -> EsignEnvelope:
        try:
            envelope_uuid = uuid.UUID(str(envelope_id))
        except ValueError as exc:
            raise EsignNotFound("Envelope not found") from exc
        envelope = (
            db.query(EsignEnvelope)
            .options(
                joinedload(EsignEnvelope.user), joinedload(EsignEnvelope.documents),
                joinedload(EsignEnvelope.recipients), joinedload(EsignEnvelope.fields),
            )
            .filter(EsignEnvelope.id == envelope_uuid)
            .first()
        )
        if envelope is None:
            raise EsignNotFound("Envelope not found")
        return envelope

    @staticmethod
    def _actor_recipient(envelope: EsignEnvelope, email: str) -> EsignRecipient:
        normalized = _normalize_email(email)
        for recipient in envelope.recipients or []:
            if recipient.email == normalized or recipient.host_email == normalized:
                return recipient
        raise EsignNotFound("Envelope not found")

    @staticmethod
    def _record_change(
        db: Session, envelope: EsignEnvelope, recipient_id, version: int, change_type: str,
        actor_user_id: Optional[str], actor_email: Optional[str], reason: str,
        before: Optional[dict], after: Optional[dict],
    ) -> None:
        db.add(EsignRecipientChange(
            id=uuid.uuid4(), envelope_id=envelope.id, recipient_id=recipient_id,
            envelope_version=version, change_type=change_type, actor_user_id=actor_user_id,
            actor_email=actor_email, reason=reason, before_snapshot=before, after_snapshot=after,
        ))

    @staticmethod
    def _reset_identity_evidence(recipient: EsignRecipient) -> None:
        recipient.identity_changed_at = _now()
        recipient.recipient_user_id = None
        recipient.viewed_at = None
        recipient.consented_at = None
        recipient.status = EsignRecipientStatus.PENDING

    @staticmethod
    def _revoke_guest_access(db: Session, recipient_ids: list) -> None:
        if not recipient_ids:
            return
        now = _now()
        db.query(EsignGuestInvitation).filter(
            EsignGuestInvitation.recipient_id.in_(recipient_ids),
            EsignGuestInvitation.revoked_at.is_(None),
        ).update({EsignGuestInvitation.revoked_at: now}, synchronize_session=False)
        db.query(EsignGuestSession).filter(
            EsignGuestSession.recipient_id.in_(recipient_ids),
            EsignGuestSession.revoked_at.is_(None),
        ).update({EsignGuestSession.revoked_at: now}, synchronize_session=False)

    @staticmethod
    def _record_advance(db: Session, envelope: EsignEnvelope, old, new, meta: EsignRequestMeta, actor_user_id=None, actor_email=None) -> None:
        if old == new:
            return
        audit_service.record_event(
            db, envelope_id=envelope.id, event_type=EsignEventType.ROUTING_ADVANCED,
            actor_user_id=actor_user_id, actor_email=actor_email, meta=meta,
            details={"from_routing_order": old, "to_routing_order": new, "routing_version": envelope.routing_version},
        )

    @staticmethod
    def _activate_eligible(envelope: EsignEnvelope) -> None:
        for recipient in envelope.recipients or []:
            if is_eligible(envelope, recipient) and recipient.status == EsignRecipientStatus.PENDING:
                recipient.status = EsignRecipientStatus.NOTIFIED

    async def _enqueue_if_complete(self, envelope_id: str, should_enqueue: bool) -> None:
        if not should_enqueue:
            return
        from services.cloud_run_task_service import cloud_run_task_service
        await cloud_run_task_service.enqueue_envelope_seal_task(envelope_id)

    def correct_recipients(
        self, *, user_id: str, user_email: str, envelope_id: str,
        payload: EsignCorrectionRequest, meta: EsignRequestMeta,
    ) -> EsignEnvelopeResponse:
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load(db, envelope_id)
            if envelope.user_id != user_id:
                editor = self._actor_recipient(envelope, user_email)
                if role_value(editor) != EsignRecipientRole.EDITOR or not is_eligible(envelope, editor):
                    raise EsignNotFound("Envelope not found")
            if envelope.status not in ACTIVE_ENVELOPE_STATUSES:
                raise EsignConflict("Recipients can only be corrected on an active envelope")
            assert_routing_version(envelope, payload.expected_routing_version)
            if not payload.recipients:
                raise EsignError("At least one recipient is required")

            existing = {str(item.id): item for item in envelope.recipients or []}
            requested_ids = [str(item.id) for item in payload.recipients if item.id]
            if len(requested_ids) != len(set(requested_ids)):
                raise EsignError("Duplicate recipient ids are not allowed")
            known_emails = [
                _normalize_email(str(value))
                for item in payload.recipients for value in (item.email, item.host_email) if value
            ]
            if len(known_emails) != len(set(known_emails)):
                raise EsignError("Duplicate recipient emails are not allowed")

            # Allocate records first so relationships may point at additions in the same request.
            records: list[tuple[object, EsignRecipient, bool]] = []
            for item in payload.recipients:
                recipient = existing.get(str(item.id)) if item.id else None
                added = recipient is None
                if item.id and recipient is None:
                    raise EsignError(f"Recipient {item.id} does not belong to this envelope")
                if recipient is None:
                    recipient = EsignRecipient(id=uuid.uuid4(), envelope_id=envelope.id, status=EsignRecipientStatus.PENDING)
                    db.add(recipient)
                records.append((item, recipient, added))
            db.flush()
            target_ids = {str(recipient.id) for _, recipient, _ in records}
            all_target = {str(item.id): item for _, item, _ in records}
            desired_roles = {str(recipient.id): EsignRecipientRole(item.role) for item, recipient, _ in records}

            for old_id, recipient in existing.items():
                if old_id in target_ids:
                    continue
                if recipient.action_completed_at is not None:
                    raise EsignConflict("Completed recipients and their evidence are immutable")
                has_fields = any(str(field.recipient_id) == old_id for field in envelope.fields or [])
                dependent = any(
                    str(item.managed_by_recipient_id) == old_id or str(item.witness_for_recipient_id) == old_id
                    for _, item, _ in records
                )
                if has_fields or dependent:
                    raise EsignError("A recipient with fields or dependent recipients cannot be removed; void and recreate the envelope")

            new_version = int(envelope.routing_version) + 1
            changed_ids: list = []
            for item, recipient, added in records:
                before = None if added else recipient_snapshot(recipient)
                if not added and recipient.action_completed_at is not None:
                    proposed = {
                        **before, "name": item.name, "email": _normalize_email(str(item.email)) if item.email else None,
                        "role": item.role, "routing_order": item.routing_order,
                    }
                    if any(before[key] != proposed[key] for key in ("name", "email", "role", "routing_order")):
                        raise EsignConflict("Completed recipients and their evidence are immutable")
                    continue
                old_role = role_value(recipient) if not added else None
                new_role = EsignRecipientRole(item.role)
                has_fields = any(str(field.recipient_id) == str(recipient.id) for field in envelope.fields or [])
                if has_fields and new_role not in SIGNATURE_ROLES:
                    raise EsignError("This role conversion would orphan fields; void and recreate the envelope")
                if added and new_role in SIGNATURE_ROLES:
                    raise EsignError("Adding a signature role requires fields; void and recreate the envelope")
                recipient.name = item.name.strip() if item.name else None
                recipient.email = _normalize_email(str(item.email)) if item.email else None
                recipient.role = new_role
                recipient.routing_order = int(item.routing_order)
                recipient.role_label = item.role_label
                recipient.private_message = item.private_message
                recipient.managed_by_recipient_id = uuid.UUID(item.managed_by_recipient_id) if item.managed_by_recipient_id else None
                recipient.witness_for_recipient_id = uuid.UUID(item.witness_for_recipient_id) if item.witness_for_recipient_id else None
                recipient.host_name = item.host_name
                recipient.host_email = _normalize_email(str(item.host_email)) if item.host_email else None
                recipient.allow_reassignment = item.allow_reassignment
                if before and (before["name"] != recipient.name or before["email"] != recipient.email):
                    self._reset_identity_evidence(recipient)
                if recipient.managed_by_recipient_id and str(recipient.managed_by_recipient_id) not in all_target:
                    raise EsignError("Managed recipient references an unknown manager")
                if recipient.managed_by_recipient_id:
                    manager = all_target[str(recipient.managed_by_recipient_id)]
                    if desired_roles.get(str(manager.id)) not in MANAGER_ROLES:
                        raise EsignError("Managed recipient must reference an agent or editor")
                    if int(recipient.routing_order) < int(manager.routing_order):
                        raise EsignError("A managed recipient cannot route before its agent or editor")
                if recipient.witness_for_recipient_id:
                    signer = all_target.get(str(recipient.witness_for_recipient_id))
                    if signer is None or desired_roles.get(str(signer.id)) != EsignRecipientRole.SIGNER:
                        raise EsignError("Witness must reference a signer in this envelope")
                    recipient.routing_order = signer.routing_order
                after = recipient_snapshot(recipient)
                if before != after:
                    changed_ids.append(recipient.id)
                    self._record_change(
                        db, envelope, recipient.id, new_version, "added" if added else "corrected",
                        user_id, user_email, payload.reason, before, after,
                    )

            for old_id, recipient in existing.items():
                if old_id not in target_ids:
                    self._record_change(db, envelope, recipient.id, new_version, "removed", user_id, user_email, payload.reason, recipient_snapshot(recipient), None)
                    db.delete(recipient)
                    changed_ids.append(recipient.id)
            if not changed_ids:
                return esign_envelope_service._serialize_envelope(envelope)
            db.flush()
            db.expire(envelope, ["recipients"])
            _ = envelope.recipients
            envelope.routing_version = new_version
            old_order, new_order = recompute_current_routing_order(envelope)
            self._activate_eligible(envelope)
            self._revoke_guest_access(db, changed_ids)
            audit_service.record_event(
                db, envelope_id=envelope.id, event_type=EsignEventType.CORRECTED,
                actor_user_id=user_id, actor_email=user_email, meta=meta,
                details={"reason": payload.reason, "routing_version": new_version, "changed_recipient_ids": [str(item) for item in changed_ids]},
            )
            self._record_advance(db, envelope, old_order, new_order, meta, user_id, user_email)
            db.commit()
            db.expire(envelope, ["recipients"])
            db.refresh(envelope)
            return esign_envelope_service._serialize_envelope(envelope)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def reassign(
        self, *, user_id: str, user_email: str, envelope_id: str,
        payload: EsignReassignRequest, meta: EsignRequestMeta,
    ) -> EsignRecipientResponse:
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load(db, envelope_id)
            recipient = self._actor_recipient(envelope, user_email)
            assert_routing_version(envelope, payload.expected_routing_version)
            if envelope.status not in ACTIVE_ENVELOPE_STATUSES or recipient.action_completed_at is not None:
                raise EsignConflict("This recipient can no longer be reassigned")
            if role_value(recipient) in (EsignRecipientRole.CC, EsignRecipientRole.WITNESS, EsignRecipientRole.IN_PERSON_SIGNER):
                raise PermissionError("This recipient role cannot initiate reassignment")
            if not envelope.allow_reassignment or not recipient.allow_reassignment:
                raise PermissionError("Reassignment is not allowed for this recipient")
            replacement_email = _normalize_email(str(payload.replacement_email))
            if any(item.id != recipient.id and item.email == replacement_email for item in envelope.recipients or []):
                raise EsignError("That email is already a recipient on this envelope")
            before = recipient_snapshot(recipient)
            new_version = int(envelope.routing_version) + 1
            recipient.name = payload.replacement_name.strip()
            recipient.email = replacement_email
            self._reset_identity_evidence(recipient)
            after = recipient_snapshot(recipient)
            envelope.routing_version = new_version
            self._revoke_guest_access(db, [recipient.id])
            self._record_change(db, envelope, recipient.id, new_version, "reassigned", user_id, user_email, payload.reason, before, after)
            audit_service.record_event(
                db, envelope_id=envelope.id, event_type=EsignEventType.REASSIGNED,
                actor_user_id=user_id, actor_email=user_email, recipient_id=recipient.id, meta=meta,
                details={"reason": payload.reason, "routing_version": new_version, "previous_email": before["email"], "replacement_email": replacement_email},
            )
            db.commit()
            db.refresh(envelope)
            return esign_envelope_service._serialize_recipient(recipient)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    async def approve(
        self, *, user_id: str, user_email: str, envelope_id: str,
        expected_routing_version: int, meta: EsignRequestMeta,
    ) -> EsignSubmitResponse:
        should_seal = False
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load(db, envelope_id)
            recipient = self._actor_recipient(envelope, user_email)
            assert_routing_version(envelope, expected_routing_version)
            if role_value(recipient) != EsignRecipientRole.APPROVER or not is_eligible(envelope, recipient):
                raise PermissionError("Approval is not available")
            now = _now()
            if envelope.status == EsignEnvelopeStatus.SENT:
                envelope.status = EsignEnvelopeStatus.IN_PROGRESS
            recipient.status = EsignRecipientStatus.APPROVED
            recipient.action_completed_at = now
            audit_service.record_event(
                db, envelope_id=envelope.id, event_type=EsignEventType.APPROVED,
                actor_user_id=user_id, actor_email=user_email, recipient_id=recipient.id, meta=meta,
                details={"routing_version": envelope.routing_version},
            )
            old, new = recompute_current_routing_order(envelope)
            self._activate_eligible(envelope)
            self._record_advance(db, envelope, old, new, meta, user_id, user_email)
            should_seal = not incomplete_blocking(envelope.recipients or [])
            db.commit()
            status = recipient.status.value
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        await self._enqueue_if_complete(envelope_id, should_seal)
        return EsignSubmitResponse(envelope_status=EsignEnvelopeStatus.IN_PROGRESS.value, recipient_status=status, sealing_enqueued=should_seal)

    def manage_recipients(
        self, *, user_id: str, user_email: str, envelope_id: str,
        payload: EsignManagedRecipientsRequest, meta: EsignRequestMeta,
    ) -> EsignManagedRecipientsResponse:
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load(db, envelope_id)
            manager = self._actor_recipient(envelope, user_email)
            assert_routing_version(envelope, payload.expected_routing_version)
            if role_value(manager) not in MANAGER_ROLES or not is_eligible(envelope, manager):
                raise PermissionError("Recipient management is not available")
            by_id = {str(item.id): item for item in envelope.recipients or []}
            new_version = int(envelope.routing_version) + 1
            changed = []
            for update in payload.recipients:
                target = by_id.get(update.recipient_id)
                if target is None or str(target.managed_by_recipient_id) != str(manager.id):
                    raise PermissionError("This placeholder is not assigned to you")
                if target.action_completed_at is not None:
                    raise EsignConflict("Completed recipients are immutable")
                before = recipient_snapshot(target)
                target.name = update.name.strip()
                target.email = _normalize_email(str(update.email))
                if before["name"] != target.name or before["email"] != target.email:
                    self._reset_identity_evidence(target)
                after = recipient_snapshot(target)
                if before != after:
                    changed.append(target.id)
                    self._record_change(db, envelope, target.id, new_version, "manager_resolved", user_id, user_email, "Manager resolved placeholder", before, after)
            if changed:
                envelope.routing_version = new_version
                self._revoke_guest_access(db, changed)
                audit_service.record_event(
                    db, envelope_id=envelope.id, event_type=EsignEventType.MANAGER_ACTION,
                    actor_user_id=user_id, actor_email=user_email, recipient_id=manager.id, meta=meta,
                    details={"action": "resolved_placeholders", "recipient_ids": [str(item) for item in changed], "routing_version": new_version},
                )
            db.commit()
            db.refresh(envelope)
            return EsignManagedRecipientsResponse(
                routing_version=envelope.routing_version,
                recipients=[
                    esign_envelope_service._serialize_recipient(item)
                    for item in envelope.recipients or []
                    if str(item.managed_by_recipient_id) == str(manager.id)
                ],
            )
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    async def manager_complete(
        self, *, user_id: str, user_email: str, envelope_id: str,
        expected_routing_version: int, meta: EsignRequestMeta,
    ) -> EsignSubmitResponse:
        should_seal = False
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load(db, envelope_id)
            manager = self._actor_recipient(envelope, user_email)
            assert_routing_version(envelope, expected_routing_version)
            if role_value(manager) not in MANAGER_ROLES or not is_eligible(envelope, manager):
                raise PermissionError("Manager completion is not available")
            unresolved = [item for item in envelope.recipients or [] if str(item.managed_by_recipient_id) == str(manager.id) and (not item.name or not item.email)]
            if unresolved:
                raise EsignError("Resolve every assigned recipient before completing this step")
            manager.action_completed_at = _now()
            manager.status = EsignRecipientStatus.MANAGED
            if envelope.status == EsignEnvelopeStatus.SENT:
                envelope.status = EsignEnvelopeStatus.IN_PROGRESS
            audit_service.record_event(
                db, envelope_id=envelope.id, event_type=EsignEventType.MANAGER_ACTION,
                actor_user_id=user_id, actor_email=user_email, recipient_id=manager.id, meta=meta,
                details={"action": "completed", "routing_version": envelope.routing_version},
            )
            old, new = recompute_current_routing_order(envelope)
            self._activate_eligible(envelope)
            self._record_advance(db, envelope, old, new, meta, user_id, user_email)
            should_seal = not incomplete_blocking(envelope.recipients or [])
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        await self._enqueue_if_complete(envelope_id, should_seal)
        return EsignSubmitResponse(envelope_status="in_progress", recipient_status="managed", sealing_enqueued=should_seal)

    def _issue_invitation(self, db: Session, envelope: EsignEnvelope, recipient: EsignRecipient) -> EsignGuestInvitationResponse:
        self._revoke_guest_access(db, [recipient.id])
        token = secrets.token_urlsafe(32)
        now = _now()
        seven_days = now + timedelta(days=GUEST_INVITATION_DAYS)
        expires_at = min(seven_days, envelope.expires_at) if envelope.expires_at else seven_days
        db.add(EsignGuestInvitation(
            id=uuid.uuid4(), envelope_id=envelope.id, recipient_id=recipient.id,
            token_sha256=_hash_secret(token), routing_version=envelope.routing_version,
            expires_at=expires_at,
        ))
        return EsignGuestInvitationResponse(
            invitation_token=token,
            guest_url=f"/dashboard/esign/guest?token={token}",
            expires_at=expires_at,
        )

    def configure_witness(
        self, *, user_id: str, user_email: str, envelope_id: str,
        payload: EsignWitnessRequest, meta: EsignRequestMeta,
    ) -> EsignGuestInvitationResponse:
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load(db, envelope_id)
            signer = self._actor_recipient(envelope, user_email)
            assert_routing_version(envelope, payload.expected_routing_version)
            if role_value(signer) != EsignRecipientRole.SIGNER or not is_eligible(envelope, signer):
                raise PermissionError("Witness selection is not available")
            witness = next((item for item in envelope.recipients or [] if str(item.witness_for_recipient_id) == str(signer.id)), None)
            if witness is None or witness.action_completed_at is not None:
                raise EsignConflict("No outstanding witness is linked to this signer")
            before = recipient_snapshot(witness)
            witness.name = payload.name.strip()
            witness.email = _normalize_email(str(payload.email)) if payload.email else None
            self._reset_identity_evidence(witness)
            witness.routing_order = signer.routing_order
            envelope.routing_version = int(envelope.routing_version) + 1
            self._record_change(db, envelope, witness.id, envelope.routing_version, "witness_configured", user_id, user_email, "Signer confirmed witness", before, recipient_snapshot(witness))
            invitation = self._issue_invitation(db, envelope, witness)
            audit_service.record_event(
                db, envelope_id=envelope.id, event_type=EsignEventType.WITNESS_CONFIGURED,
                actor_user_id=user_id, actor_email=user_email, recipient_id=witness.id, meta=meta,
                details={"signer_recipient_id": str(signer.id), "routing_version": envelope.routing_version},
            )
            db.commit()
            return invitation
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def start_in_person(
        self, *, user_id: str, user_email: str, envelope_id: str,
        payload: EsignInPersonStartRequest, meta: EsignRequestMeta,
    ) -> EsignGuestInvitationResponse:
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)
            envelope = self._load(db, envelope_id)
            recipient = self._actor_recipient(envelope, user_email)
            assert_routing_version(envelope, payload.expected_routing_version)
            if role_value(recipient) != EsignRecipientRole.IN_PERSON_SIGNER or not is_eligible(envelope, recipient):
                raise PermissionError("Hosted signing is not available")
            if recipient.host_email != _normalize_email(user_email):
                raise PermissionError("Only the configured host may start handoff")
            recipient.name = payload.signer_name.strip()
            recipient.host_user_id = user_id
            self._reset_identity_evidence(recipient)
            recipient.host_user_id = user_id
            invitation = self._issue_invitation(db, envelope, recipient)
            audit_service.record_event(
                db, envelope_id=envelope.id, event_type=EsignEventType.HOST_HANDOFF,
                actor_user_id=user_id, actor_email=user_email, recipient_id=recipient.id, meta=meta,
                details={"host_name": recipient.host_name, "host_email": recipient.host_email, "self_declared_signer_name": recipient.name, "routing_version": envelope.routing_version},
            )
            db.commit()
            return invitation
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def exchange_invitation(self, invitation_token: str, meta: EsignRequestMeta) -> tuple[EsignGuestExchangeResponse, str, str]:
        db = self._get_session()
        try:
            now = _now()
            invitation = db.query(EsignGuestInvitation).filter(EsignGuestInvitation.token_sha256 == _hash_secret(invitation_token)).first()
            if invitation is None or invitation.exchanged_at or invitation.revoked_at or invitation.expires_at <= now:
                raise EsignNotFound("Guest invitation is invalid or expired")
            envelope = self._load(db, str(invitation.envelope_id))
            assert_routing_version(envelope, invitation.routing_version)
            recipient = next(item for item in envelope.recipients if item.id == invitation.recipient_id)
            if role_value(recipient) not in (EsignRecipientRole.WITNESS, EsignRecipientRole.IN_PERSON_SIGNER):
                raise PermissionError("Guest access is not available for this recipient")
            session_token = secrets.token_urlsafe(32)
            csrf_token = secrets.token_urlsafe(32)
            invitation.exchanged_at = now
            db.add(EsignGuestSession(
                id=uuid.uuid4(), envelope_id=envelope.id, recipient_id=recipient.id,
                invitation_id=invitation.id, token_sha256=_hash_secret(session_token),
                csrf_sha256=_hash_secret(csrf_token), routing_version=envelope.routing_version,
                last_seen_at=now, idle_expires_at=now + timedelta(minutes=GUEST_IDLE_MINUTES),
                absolute_expires_at=now + timedelta(hours=GUEST_ABSOLUTE_HOURS),
            ))
            audit_service.record_event(
                db, envelope_id=envelope.id, event_type=EsignEventType.GUEST_INVITATION_EXCHANGED,
                recipient_id=recipient.id, meta=meta,
                details={"invitation_id": str(invitation.id), "routing_version": envelope.routing_version},
            )
            db.commit()
            return EsignGuestExchangeResponse(
                envelope_id=str(envelope.id), recipient_id=str(recipient.id),
                csrf_token=csrf_token, routing_version=envelope.routing_version,
            ), session_token, csrf_token
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _guest_context(self, db: Session, session_token: str, csrf_token: Optional[str] = None, *, touch: bool = True):
        now = _now()
        session = db.query(EsignGuestSession).filter(EsignGuestSession.token_sha256 == _hash_secret(session_token)).first()
        if session is None or session.revoked_at or session.consumed_at or session.idle_expires_at <= now or session.absolute_expires_at <= now:
            raise EsignNotFound("Guest session is invalid or expired")
        if csrf_token is not None and not secrets.compare_digest(session.csrf_sha256, _hash_secret(csrf_token)):
            raise PermissionError("Invalid guest CSRF token")
        envelope = self._load(db, str(session.envelope_id))
        assert_routing_version(envelope, session.routing_version)
        recipient = next(item for item in envelope.recipients if item.id == session.recipient_id)
        if touch:
            session.last_seen_at = now
            session.idle_expires_at = min(now + timedelta(minutes=GUEST_IDLE_MINUTES), session.absolute_expires_at)
        return session, envelope, recipient

    def _locked_guest_context(self, db: Session, session_token: str, csrf_token: str):
        session = db.query(EsignGuestSession).filter(EsignGuestSession.token_sha256 == _hash_secret(session_token)).first()
        if session is None:
            raise EsignNotFound("Guest session is invalid or expired")
        acquire_envelope_lock(db, str(session.envelope_id))
        db.expire(session)
        return self._guest_context(db, session_token, csrf_token)

    async def guest_session(self, session_token: str) -> EsignGuestSessionResponse:
        db = self._get_session()
        try:
            session, envelope, recipient = self._guest_context(db, session_token)
            if not is_eligible(envelope, recipient):
                raise PermissionError("This guest step is not currently active")
            documents = []
            for document in sorted(envelope.documents or [], key=lambda item: item.display_order):
                url = await self.storage.generate_presigned_get_url(document.gcs_object_name, expiration_minutes=DOWNLOAD_URL_MINUTES)
                documents.append(EsignSigningDocument(
                    id=str(document.id), display_order=document.display_order,
                    original_filename=document.original_filename, page_count=document.page_count,
                    download_url=url,
                ))
            consent = self._valid_consent(db, envelope, recipient)
            result = EsignGuestSessionResponse(
                envelope_id=str(envelope.id), recipient_id=str(recipient.id), title=envelope.title,
                recipient_name=recipient.name, recipient_role=role_value(recipient).value,
                routing_version=envelope.routing_version, consent_required=consent is None,
                consent_disclosure_text=envelope.consent_disclosure_text,
                available_actions=available_actions(envelope, recipient), documents=documents,
                fields=[esign_envelope_service._serialize_field(item) for item in envelope.fields or [] if item.recipient_id == recipient.id],
            )
            db.commit()
            return result
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def guest_consent(self, session_token: str, csrf_token: str, expected_version: int, meta: EsignRequestMeta):
        db = self._get_session()
        try:
            session, envelope, recipient = self._locked_guest_context(db, session_token, csrf_token)
            assert_routing_version(envelope, expected_version)
            existing = self._valid_consent(db, envelope, recipient)
            if existing is None:
                existing = EsignConsentRecord(
                    id=uuid.uuid4(), envelope_id=envelope.id, recipient_id=recipient.id,
                    consent_text_sha256=sha256_hex(envelope.consent_disclosure_text.encode("utf-8")),
                    ip_address=meta.ip_address, user_agent=meta.user_agent,
                    consented_at=_now(),
                )
                db.add(existing)
                audit_service.record_event(
                    db, envelope_id=envelope.id, event_type=EsignEventType.GUEST_CONSENT_GIVEN,
                    recipient_id=recipient.id, meta=meta,
                    details={"session_id": str(session.id), "routing_version": envelope.routing_version},
                )
            db.commit()
            return {"consented": True}
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def guest_progress(self, session_token: str, csrf_token: str, payload: EsignProgressRequest) -> dict:
        db = self._get_session()
        try:
            _, envelope, recipient = self._locked_guest_context(db, session_token, csrf_token)
            assert_routing_version(envelope, payload.expected_routing_version)
            values = {item.field_id: item.value for item in payload.field_values}
            saved = 0
            for field in envelope.fields or []:
                if field.recipient_id == recipient.id and str(field.id) in values:
                    field.draft_value = values[str(field.id)]
                    saved += 1
            db.commit()
            return {"saved_count": saved}
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    async def guest_submit(
        self, session_token: str, csrf_token: str, payload: EsignGuestSubmitRequest, meta: EsignRequestMeta,
    ) -> EsignSubmitResponse:
        image_bytes = None
        if payload.signature.signature_type in ("drawn", "uploaded"):
            from services.esign.signing_service import esign_signing_service
            image_bytes = esign_signing_service._decode_signature_image(payload.signature.image_data_url or "")
        elif payload.signature.signature_type == "typed":
            if not (payload.signature.typed_text or "").strip():
                raise EsignError("Typed signature text is required")
        else:
            raise EsignError("Invalid signature type")
        should_seal = False
        db = self._get_session()
        try:
            session, envelope, recipient = self._locked_guest_context(db, session_token, csrf_token)
            assert_routing_version(envelope, payload.expected_routing_version)
            if not is_eligible(envelope, recipient):
                raise PermissionError("This guest step is not currently active")
            consent = self._valid_consent(db, envelope, recipient)
            if consent is None:
                raise EsignError("Electronic-record consent is required")
            if role_value(recipient) == EsignRecipientRole.WITNESS and (not payload.occupation or not payload.address):
                raise EsignError("Witness occupation and address are required")
            if envelope.status == EsignEnvelopeStatus.SENT:
                envelope.status = EsignEnvelopeStatus.IN_PROGRESS
            object_name = None
            image_sha = None
            if image_bytes:
                object_name = f"esign/{envelope.user_id}/{envelope.id}/signatures/{recipient.id}_{uuid.uuid4().hex[:8]}.png"
                await self.storage.upload_file_content(image_bytes, object_name)
                image_sha = sha256_hex(image_bytes)
            record = EsignSignatureRecord(
                id=uuid.uuid4(), envelope_id=envelope.id, recipient_id=recipient.id,
                signature_type=EsignSignatureType(payload.signature.signature_type),
                image_gcs_object_name=object_name, image_sha256=image_sha,
                typed_text=(payload.signature.typed_text or "").strip() or None,
                typed_font=payload.signature.typed_font,
                initials_text=payload.signature.initials_text,
            )
            db.add(record)
            values = {item.field_id: item for item in payload.field_values}
            for field in envelope.fields or []:
                if field.recipient_id != recipient.id:
                    continue
                submitted = values.get(str(field.id))
                if field.field_type in (EsignFieldType.SIGNATURE, EsignFieldType.INITIALS, EsignFieldType.STAMP):
                    completed = submitted.completed if submitted and submitted.completed is not None else True
                    field.value = str(record.id) if completed else None
                else:
                    field.value = submitted.value if submitted else field.value
                if field.required and not field.value:
                    raise EsignError(f"Required field '{field.label or field.field_type.value}' is missing")
            now = _now()
            recipient.status = EsignRecipientStatus.SIGNED
            recipient.signed_at = now
            recipient.action_completed_at = now
            session.consumed_at = now
            audit_service.record_event(
                db, envelope_id=envelope.id, event_type=EsignEventType.SIGNED,
                recipient_id=recipient.id, meta=meta,
                details={
                    "guest_session_id": str(session.id), "signature_record_id": str(record.id),
                    "role": role_value(recipient).value, "occupation": payload.occupation,
                    "address": payload.address, "self_declared_identity": True,
                    "verified_host_user_id": recipient.host_user_id,
                },
            )
            old, new = recompute_current_routing_order(envelope)
            self._activate_eligible(envelope)
            self._record_advance(db, envelope, old, new, meta)
            should_seal = not incomplete_blocking(envelope.recipients or [])
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        await self._enqueue_if_complete(str(envelope.id), should_seal)
        return EsignSubmitResponse(envelope_status="in_progress", recipient_status="signed", sealing_enqueued=should_seal)


esign_recipient_service = EsignRecipientService()
