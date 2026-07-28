from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.db_models import EsignEnvelopeStatus, EsignEventType
from models.esign import (
    EsignDocumentOrderRequest,
    EsignEnvelopeDeliverySettingsUpdateRequest,
    EsignRecipientInput,
)
from services.esign.audit_service import EsignRequestMeta
from services.esign.envelope_service import EsignConflict, EsignEnvelopeService, EsignError


def service_with_envelope(envelope):
    service = object.__new__(EsignEnvelopeService)
    db = MagicMock()
    service._get_session = MagicMock(return_value=db)
    service._load_envelope = MagicMock(return_value=envelope)
    service._require_draft = MagicMock()
    service._serialize_envelope = MagicMock(return_value={"id": str(envelope.id)})
    return service, db


def test_document_order_request_and_service_require_every_document_once():
    first, second = uuid.uuid4(), uuid.uuid4()
    envelope = SimpleNamespace(
        id=uuid.uuid4(),
        documents=[
            SimpleNamespace(id=first, display_order=0),
            SimpleNamespace(id=second, display_order=1),
        ],
    )
    service, db = service_with_envelope(envelope)

    payload = EsignDocumentOrderRequest(document_ids=[str(second), str(first)])
    service.reorder_documents("owner", str(envelope.id), payload.document_ids)

    assert envelope.documents[0].display_order == 1
    assert envelope.documents[1].display_order == 0
    db.commit.assert_called_once()

    with pytest.raises(EsignError, match="exactly once"):
        service.reorder_documents("owner", str(envelope.id), [str(first), str(first)])


def test_recipient_updates_preserve_identity_and_do_not_delete_fields():
    recipient_id = uuid.uuid4()
    recipient = SimpleNamespace(
        id=recipient_id,
        email="old@example.com",
        name="Old Name",
        role="signer",
        routing_order=1,
    )
    envelope = SimpleNamespace(
        id=uuid.uuid4(),
        recipients=[recipient],
        fields=[SimpleNamespace(id=uuid.uuid4(), recipient_id=recipient_id)],
    )
    service, db = service_with_envelope(envelope)

    service.replace_recipients(
        "owner",
        str(envelope.id),
        [
            EsignRecipientInput(
                id=str(recipient_id),
                email="new@example.com",
                name="New Name",
                role="signer",
                routing_order=3,
            )
        ],
    )

    assert recipient.id == recipient_id
    assert recipient.email == "new@example.com"
    assert recipient.name == "New Name"
    assert recipient.routing_order == 3
    # The envelope row is locked for optimistic revision protection; no
    # destructive field query is issued for an in-place identity update.
    assert db.query.call_count == 1
    db.commit.assert_called_once()


def test_recipient_id_must_belong_to_envelope():
    envelope = SimpleNamespace(id=uuid.uuid4(), recipients=[], fields=[])
    service, _ = service_with_envelope(envelope)

    with pytest.raises(EsignError, match="does not belong"):
        service.replace_recipients(
            "owner",
            str(envelope.id),
            [
                EsignRecipientInput(
                    id=str(uuid.uuid4()),
                    email="signer@example.com",
                    name="Signer",
                    role="signer",
                    routing_order=1,
                )
            ],
        )


def test_active_delivery_settings_update_is_audited_and_resets_warning():
    original_expiration = datetime.now(timezone.utc) + timedelta(days=2)
    new_expiration = datetime.now(timezone.utc) + timedelta(days=10)
    envelope = SimpleNamespace(
        id=uuid.uuid4(),
        status=EsignEnvelopeStatus.SENT,
        expires_at=original_expiration,
        reminder_interval_hours=72,
        expiration_warning_sent_at=datetime.now(timezone.utc),
    )
    service, db = service_with_envelope(envelope)
    payload = EsignEnvelopeDeliverySettingsUpdateRequest(
        expires_at=new_expiration,
        reminder_interval_hours=24,
    )

    with patch("services.esign.envelope_service.audit_service.record_event") as record_event:
        service.update_active_delivery_settings(
            user_id="owner",
            user_email="owner@example.com",
            envelope_id=str(envelope.id),
            payload=payload,
            meta=EsignRequestMeta(ip_address="127.0.0.1"),
        )

    assert envelope.expires_at == new_expiration
    assert envelope.reminder_interval_hours == 24
    assert envelope.expiration_warning_sent_at is None
    db.commit.assert_called_once()
    assert record_event.call_args.kwargs["event_type"] == EsignEventType.SETTINGS_UPDATED
    assert record_event.call_args.kwargs["details"]["changes"]["reminder_interval_hours"] == {
        "from": 72,
        "to": 24,
    }


def test_delivery_settings_cannot_change_after_envelope_is_terminal():
    envelope = SimpleNamespace(
        id=uuid.uuid4(),
        status=EsignEnvelopeStatus.COMPLETED,
        expires_at=None,
        reminder_interval_hours=None,
    )
    service, db = service_with_envelope(envelope)

    with pytest.raises(EsignConflict, match="active envelope"):
        service.update_active_delivery_settings(
            user_id="owner",
            user_email="owner@example.com",
            envelope_id=str(envelope.id),
            payload=EsignEnvelopeDeliverySettingsUpdateRequest(reminder_interval_hours=24),
            meta=EsignRequestMeta(),
        )

    db.rollback.assert_called_once()


def test_delivery_settings_reject_past_expiration():
    envelope = SimpleNamespace(
        id=uuid.uuid4(),
        status=EsignEnvelopeStatus.IN_PROGRESS,
        expires_at=None,
        reminder_interval_hours=None,
    )
    service, _ = service_with_envelope(envelope)

    with pytest.raises(EsignError, match="future"):
        service.update_active_delivery_settings(
            user_id="owner",
            user_email="owner@example.com",
            envelope_id=str(envelope.id),
            payload=EsignEnvelopeDeliverySettingsUpdateRequest(
                expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)
            ),
            meta=EsignRequestMeta(),
        )


def test_delivery_settings_require_timezone_on_expiration():
    envelope = SimpleNamespace(
        id=uuid.uuid4(),
        status=EsignEnvelopeStatus.SENT,
        expires_at=None,
        reminder_interval_hours=None,
    )
    service, _ = service_with_envelope(envelope)

    with pytest.raises(EsignError, match="timezone"):
        service.update_active_delivery_settings(
            user_id="owner",
            user_email="owner@example.com",
            envelope_id=str(envelope.id),
            payload=EsignEnvelopeDeliverySettingsUpdateRequest(
                expires_at=datetime.now() + timedelta(days=1)
            ),
            meta=EsignRequestMeta(),
        )
