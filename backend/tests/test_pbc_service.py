from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi import HTTPException

from models.pbc import PbcEngagement, PbcRequest
from services.pbc_service import actor_role, token_hash, transition_request


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

