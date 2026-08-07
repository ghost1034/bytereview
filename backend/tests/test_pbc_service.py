from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi import HTTPException

from models.pbc import PbcAccessToken, PbcContact, PbcEngagement, PbcRequest
from routes import pbc as pbc_routes
from routes.pbc import _complete_upload, _request_assignment_ids
from models.pbc_schemas import PbcPortalExchange
from starlette.requests import Request
from services.pbc_service import actor_role, exchange_access_token, serialize_contact, token_hash, transition_request, utcnow


class CountQuery:
    def filter(self, *_args, **_kwargs):
        return self

    def count(self):
        return 1


class FakeDb:
    def __init__(self):
        self.added = []

    def query(self, *_args):
        return CountQuery()

    def add(self, value):
        self.added.append(value)


class RequestIdQuery:
    def __init__(self, request_ids):
        self.request_ids = request_ids

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return [(request_id,) for request_id in self.request_ids]


class RequestIdDb:
    def __init__(self, request_ids):
        self.request_ids = request_ids

    def query(self, *_args):
        return RequestIdQuery(self.request_ids)


class AccessTokenQuery:
    def __init__(self, access_token):
        self.access_token = access_token

    def filter(self, *_args, **_kwargs):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self.access_token


class AccessTokenDb:
    def __init__(self, access_token, contact, engagement):
        self.access_token = access_token
        self.contact = contact
        self.engagement = engagement

    def query(self, model):
        assert model is PbcAccessToken
        return AccessTokenQuery(self.access_token)

    def get(self, model, _identifier):
        if model is PbcContact:
            return self.contact
        if model is PbcEngagement:
            return self.engagement
        raise AssertionError(f"Unexpected model: {model}")


def engagement_and_request(status="open", revision=1):
    firm_id = uuid.uuid4()
    engagement = PbcEngagement(
        id=uuid.uuid4(), firm_id=firm_id, name="Audit", client_name_snapshot="Client", status="active"
    )
    request = PbcRequest(
        id=uuid.uuid4(), engagement_id=engagement.id, firm_id=firm_id, request_number="PBC-001",
        title="Trial balance", status=status, revision=revision, expected_formats=[], dependency_ids=[],
    )
    return engagement, request


def test_client_can_submit_available_evidence_and_event_is_append_only():
    db = FakeDb()
    engagement, request = engagement_and_request()
    transition_request(
        db, request, engagement, "submit", None, 1,
        actor_kind="client", actor_id="contact-1",
    )
    assert request.status == "submitted"
    assert request.revision == 2
    assert request.submitted_at is not None
    assert len(db.added) == 1
    assert db.added[0].event_type == "request_submit"


def test_client_cannot_accept_and_stale_revision_is_rejected():
    db = FakeDb()
    engagement, request = engagement_and_request(status="submitted", revision=3)
    with pytest.raises(HTTPException) as forbidden:
        transition_request(db, request, engagement, "accept", None, 3, actor_kind="client", actor_id="contact-1")
    assert forbidden.value.status_code == 403
    with pytest.raises(HTTPException) as stale:
        transition_request(db, request, engagement, "accept", None, 2, actor_kind="firm", actor_id="reviewer", actor_role_value="reviewer")
    assert stale.value.status_code == 409


def test_reviewer_accepts_but_cannot_waive_or_reopen():
    db = FakeDb()
    engagement, request = engagement_and_request(status="submitted")
    transition_request(db, request, engagement, "accept", "Reviewed", 1,
                       actor_kind="firm", actor_id="reviewer", actor_role_value="reviewer")
    assert request.status == "accepted"
    with pytest.raises(HTTPException) as forbidden:
        transition_request(db, request, engagement, "reopen", None, 2,
                           actor_kind="firm", actor_id="reviewer", actor_role_value="reviewer")
    assert forbidden.value.status_code == 403


def test_access_secrets_are_one_way_hashes():
    raw = "secure-random-link-token"
    assert token_hash(raw) != raw
    assert token_hash(raw) == token_hash(raw)
    assert len(token_hash(raw)) == 64


def test_engagement_contact_serialization_includes_request_scope():
    contact_id = uuid.uuid4()
    request_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    contact = SimpleNamespace(
        id=contact_id,
        client_id=None,
        name="Jordan Client",
        email="jordan@example.com",
        active=True,
        created_at=utcnow(),
    )

    serialized = serialize_contact(contact, "contributor", request_ids)

    assert serialized["id"] == str(contact_id)
    assert serialized["role"] == "contributor"
    assert serialized["request_ids"] == request_ids


def test_draft_engagement_access_link_reports_that_it_is_not_published():
    contact_id = uuid.uuid4()
    engagement_id = uuid.uuid4()
    access_token = SimpleNamespace(
        revoked_at=None,
        expires_at=utcnow() + timedelta(days=1),
        one_time=True,
        used_at=None,
        contact_id=contact_id,
        engagement_id=engagement_id,
    )
    contact = SimpleNamespace(id=contact_id, active=True)
    engagement = SimpleNamespace(id=engagement_id, status="draft")

    with pytest.raises(HTTPException) as unpublished:
        exchange_access_token(AccessTokenDb(access_token, contact, engagement), "valid-link-token")

    assert unpublished.value.status_code == 403
    assert unpublished.value.detail == "This engagement has not been published yet"


def test_request_assignment_ids_preserve_database_uuid_types_and_deduplicate():
    engagement_id = uuid.uuid4()
    request_ids = [uuid.uuid4(), uuid.uuid4()]

    resolved = _request_assignment_ids(
        RequestIdDb(request_ids),
        engagement_id,
        [str(request_ids[0]), str(request_ids[1]), str(request_ids[0])],
    )

    assert resolved == request_ids
    assert all(isinstance(request_id, uuid.UUID) for request_id in resolved)


def test_request_assignment_ids_reject_requests_from_another_engagement():
    with pytest.raises(HTTPException) as invalid:
        _request_assignment_ids(RequestIdDb([uuid.uuid4()]), uuid.uuid4(), [str(uuid.uuid4())])

    assert invalid.value.status_code == 422


@pytest.mark.asyncio
async def test_completed_upload_becomes_available_without_a_scan(monkeypatch):
    async def verify_object(_document):
        return None

    async def document_checksum(_document):
        return "a" * 64

    monkeypatch.setattr(pbc_routes, "_verify_object", verify_object)
    monkeypatch.setattr(pbc_routes, "_document_checksum", document_checksum)
    db = FakeDb()
    engagement = SimpleNamespace(id=uuid.uuid4(), firm_id=uuid.uuid4())
    document = SimpleNamespace(
        id=uuid.uuid4(), request_id=uuid.uuid4(), object_name="pbc/example.pdf",
        filename="example.pdf", version=1, state="initiated", checksum_sha256=None,
        completed_at=None,
    )

    await _complete_upload(db, document, "A" * 64, engagement, "firm", "user-1")

    assert document.state == "available"
    assert document.checksum_sha256 == "a" * 64
    assert document.completed_at is not None
    assert db.added[0].details == {
        "document_id": str(document.id), "filename": "example.pdf", "version": 1,
    }


@pytest.mark.asyncio
async def test_completed_upload_rejects_a_checksum_mismatch(monkeypatch):
    async def verify_object(_document):
        return None

    async def document_checksum(_document):
        return "a" * 64

    monkeypatch.setattr(pbc_routes, "_verify_object", verify_object)
    monkeypatch.setattr(pbc_routes, "_document_checksum", document_checksum)
    document = SimpleNamespace(state="initiated")

    with pytest.raises(HTTPException) as mismatch:
        await _complete_upload(
            FakeDb(), document, "b" * 64,
            SimpleNamespace(id=uuid.uuid4(), firm_id=uuid.uuid4()), "client", "contact-1",
        )

    assert mismatch.value.status_code == 409
    assert document.state == "initiated"


def test_portal_exchange_json_encodes_datetime_payloads(monkeypatch):
    session = SimpleNamespace(csrf_hash=None)
    contact = SimpleNamespace(id=uuid.uuid4())
    engagement = SimpleNamespace(id=uuid.uuid4())
    created_at = datetime(2026, 8, 7, 12, 0, tzinfo=timezone.utc)

    monkeypatch.setattr(pbc_routes, "_rate_limit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        pbc_routes,
        "exchange_access_token",
        lambda *_args, **_kwargs: (session, "raw-session", contact, engagement),
    )
    monkeypatch.setattr(pbc_routes, "_commit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(pbc_routes, "serialize_contact", lambda *_args: {"created_at": created_at})
    monkeypatch.setattr(pbc_routes, "serialize_engagement", lambda *_args: {"created_at": created_at})

    request = Request({"type": "http", "method": "POST", "path": "/api/pbc/portal/exchange", "headers": []})
    response = pbc_routes.portal_exchange(PbcPortalExchange(token="v" * 32), request, object())

    assert response.status_code == 200
    assert b'"created_at":"2026-08-07T12:00:00+00:00"' in response.body
    assert "pbc_portal_session=raw-session" in response.headers["set-cookie"]
