from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.esign import EsignDocumentOrderRequest, EsignRecipientInput
from services.esign.envelope_service import EsignEnvelopeService, EsignError


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
    db.query.assert_not_called()
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
