from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.esign.webhook_service import (
    RETRY_DELAYS,
    WebhookDestinationError,
    build_event_payload,
    sign_webhook,
    validate_webhook_destination,
)


def test_webhook_signature_is_over_exact_request_bytes():
    body = b'{"event":{"id":"evt-1"},"value":"caf\xc3\xa9"}'
    timestamp = "1784500000"
    expected = hmac.new(b"secret", timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    assert sign_webhook("secret", timestamp, body) == expected
    assert sign_webhook("secret", timestamp, body + b"\n") != expected


@pytest.mark.parametrize("url", [
    "http://example.com/hook",
    "https://user:pass@example.com/hook",
    "https://example.com/hook#fragment",
    "https://127.0.0.1/hook",
    "https://10.0.0.4/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
])
def test_webhook_destination_rejects_unsafe_targets(url):
    with pytest.raises(WebhookDestinationError):
        validate_webhook_destination(url, resolve_dns=False)


def test_webhook_retry_schedule_matches_contract():
    assert [int(value.total_seconds()) for value in RETRY_DELAYS] == [
        300, 900, 3600, 21600, 86400, 259200, 604800, 1296000,
    ]


def test_webhook_payload_redacts_sensitive_audit_evidence():
    event = SimpleNamespace(
        id="event-id", envelope_id="envelope-id", recipient_id=None,
        event_type="completed", created_at=SimpleNamespace(isoformat=lambda: "2026-07-19T00:00:00Z"),
        details={"reason": "done", "ip_address": "203.0.113.4", "user_agent": "secret", "mfa_method": "phone", "secret": "no"},
    )
    envelope = SimpleNamespace(
        id="envelope-id", firm_id="firm-id", user_id="sender-id", title="Closing package",
        status="completed", source_type="manual", source_id=None, sent_at=None, completed_at=None,
    )
    payload = build_event_payload(SimpleNamespace(), event, envelope)
    encoded = json.dumps(payload)
    assert payload["details"] == {"reason": "done"}
    for forbidden in ("203.0.113.4", "user_agent", "mfa_method", '"secret"'):
        assert forbidden not in encoded


def test_esign_context_provisions_a_user_and_personal_firm():
    from services.esign.admin_service import EsignAdminService, esign_authorization_service

    user_id = "new-esign-user"
    firm_id = uuid.uuid4()
    user = SimpleNamespace(id=user_id, firm_id=None)
    actor = SimpleNamespace(id=user_id, firm_id=firm_id)
    firm = SimpleNamespace(id=firm_id, name="New User's Firm")
    principal = SimpleNamespace(
        profile_id=None,
        profile_name="Firm administrator",
        capabilities={},
        is_admin=True,
        features={"powerforms": True},
        can=lambda _capability: True,
    )
    db = MagicMock()
    service = object.__new__(EsignAdminService)
    service._get_session = MagicMock(return_value=db)
    service._ensure_defaults = MagicMock()

    with (
        patch("services.esign.admin_service.ensure_user_row", return_value=user) as ensure_user,
        patch("services.esign.admin_service.get_or_create_user_firm", return_value=(actor, firm)) as ensure_firm,
        patch.object(esign_authorization_service, "principal", return_value=principal),
    ):
        result = service.context(
            user_id,
            user_email="new@example.com",
            display_name="New User",
            photo_url="https://example.com/avatar.png",
        )

    ensure_user.assert_called_once_with(
        db,
        user_id=user_id,
        email="new@example.com",
        display_name="New User",
        photo_url="https://example.com/avatar.png",
    )
    ensure_firm.assert_called_once_with(db, user_id)
    service._ensure_defaults.assert_called_once_with(db, firm_id)
    db.commit.assert_called_once_with()
    db.close.assert_called_once_with()
    assert result["firm"] == {"id": str(firm_id), "name": "New User's Firm"}
    assert result["profile"]["admin_override"] is True


def test_esign_context_route_passes_authenticated_profile_to_provisioning():
    from routes.esign import esign_admin_service, get_esign_context

    expected = {"firm": {"id": "firm-id", "name": "Firm"}}
    with patch.object(esign_admin_service, "context", return_value=expected) as context:
        result = asyncio.run(get_esign_context({
            "uid": "firebase-user",
            "email": "user@example.com",
            "name": "Example User",
            "picture": "https://example.com/avatar.png",
        }))

    context.assert_called_once_with(
        "firebase-user",
        user_email="user@example.com",
        display_name="Example User",
        photo_url="https://example.com/avatar.png",
    )
    assert result == expected
