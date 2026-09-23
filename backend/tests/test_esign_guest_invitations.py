"""Guest links survive reminders but remain revocable and recipient-scoped."""

import os
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import Column, MetaData, Table, create_engine
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.db_models import EsignEnvelopeStatus, EsignGuestInvitation, EsignGuestSession
from services.esign.audit_service import EsignRequestMeta
from services.esign.envelope_service import EsignConflict, EsignNotFound
from services.esign.recipient_service import esign_recipient_service as service


@pytest.fixture
def guest_links(monkeypatch):
    # Only invitation/session storage is needed; no production services or data.
    engine = create_engine("sqlite:///:memory:")
    metadata = MetaData()
    Table("esign_envelopes", metadata, Column("id", UUID(as_uuid=True), primary_key=True))
    for model in (EsignGuestInvitation, EsignGuestSession):
        model.__table__.to_metadata(metadata)
    metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    # SQLite returns naive timestamps, so use a matching deterministic clock.
    now = datetime(2026, 9, 23, 12)
    monkeypatch.setattr("services.esign.recipient_service._now", lambda: now)
    recipient = NS(id=uuid.uuid4(), email="guest@example.com", host_email=None)
    envelope = NS(
        id=uuid.uuid4(), routing_version=1, status=EsignEnvelopeStatus.SENT,
        expires_at=now + timedelta(days=30), recipients=[recipient],
    )
    monkeypatch.setattr(service, "_get_session", factory)
    monkeypatch.setattr(service, "_load", lambda *_: envelope)
    monkeypatch.setattr("services.esign.recipient_service.audit_service.record_event", lambda *_, **__: None)

    def issue(**options):
        with factory() as db:
            invitation = service._issue_invitation(db, envelope, recipient, **options)
            db.commit()
            return invitation.invitation_token

    def exchange(token):
        return service.exchange_invitation(
            token, EsignRequestMeta(), user_id=None, user_email=None,
        )

    yield NS(factory=factory, envelope=envelope, recipient=recipient, issue=issue, exchange=exchange, now=now)
    engine.dispose()


def test_original_and_reminder_links_both_open_without_an_account(guest_links):
    original = guest_links.issue(preserve_existing=True)
    reminder = guest_links.issue(preserve_existing=True)
    assert original != reminder
    for token in (original, reminder):
        result, cookie, csrf = guest_links.exchange(token)
        assert result.recipient_id == str(guest_links.recipient.id)
        assert result.envelope_id == str(guest_links.envelope.id)
        assert cookie and csrf
    with guest_links.factory() as db:
        assert db.query(EsignGuestInvitation).filter(EsignGuestInvitation.revoked_at.is_(None)).count() == 2


def test_reminder_does_not_extend_original_expiry(guest_links, monkeypatch):
    original = guest_links.issue(preserve_existing=True)
    monkeypatch.setattr("services.esign.recipient_service._now", lambda: guest_links.envelope.expires_at)
    guest_links.issue(preserve_existing=True)
    with pytest.raises(EsignNotFound, match="invalid or expired"):
        guest_links.exchange(original)


def test_explicit_handoff_still_rotates_existing_links(guest_links):
    original = guest_links.issue(preserve_existing=True)
    reminder = guest_links.issue(preserve_existing=True)
    replacement = guest_links.issue()
    for token in (original, reminder):
        with pytest.raises(EsignNotFound):
            guest_links.exchange(token)
    guest_links.exchange(replacement)


def test_identity_correction_revokes_all_links_and_sessions(guest_links):
    tokens = [guest_links.issue(preserve_existing=True) for _ in range(2)]
    guest_links.exchange(tokens[0])
    with guest_links.factory() as db:
        service._revoke_guest_access(db, [guest_links.recipient.id])
        db.commit()
        assert all(row.revoked_at for row in db.query(EsignGuestSession).all())
    for token in tokens:
        with pytest.raises(EsignNotFound):
            guest_links.exchange(token)


def test_signing_consumes_every_outstanding_link(guest_links):
    tokens = [guest_links.issue(preserve_existing=True) for _ in range(2)]
    result, cookie, _ = guest_links.exchange(tokens[0])
    guest_links.exchange(tokens[1])
    service.consume_guest_access(result.session_id, cookie)
    for token in tokens:
        with pytest.raises(EsignNotFound):
            guest_links.exchange(token)
    with guest_links.factory() as db:
        assert all(row.revoked_at or row.consumed_at for row in db.query(EsignGuestSession).all())


def test_terminal_envelope_rejects_all_ceremony_links(guest_links):
    tokens = [guest_links.issue(preserve_existing=True) for _ in range(2)]
    guest_links.envelope.status = EsignEnvelopeStatus.VOIDED
    for token in tokens:
        with pytest.raises(EsignConflict, match="no longer active"):
            guest_links.exchange(token)


def test_guest_link_does_not_authenticate_a_different_account(guest_links):
    token = guest_links.issue(preserve_existing=True)
    with pytest.raises(PermissionError, match="matching this invitation"):
        service.exchange_invitation(
            token, EsignRequestMeta(), user_id="other", user_email="other@example.com",
        )
