"""Unit tests for e-sign signing-service logic that doesn't need Postgres:
routing-turn rules, signature payload validation, audit metadata capture,
and advisory-lock key mapping.
"""

from __future__ import annotations

import base64
import os
import sys
import types
import unittest
import uuid
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.db_models import (
    EsignEnvelopeStatus,
    EsignRecipientRole,
    EsignRecipientStatus,
    EsignSigningType,
)
from services.esign.audit_service import extract_request_meta
from services.esign.envelope_service import EsignError
from services.esign.sealing_service import _initials_from_name
from services.esign.signing_service import (
    _advisory_lock_keys,
    esign_signing_service,
)

NS = types.SimpleNamespace


def _envelope(status=EsignEnvelopeStatus.SENT, signing_type=EsignSigningType.SEQUENTIAL, current=1):
    return NS(status=status, signing_type=signing_type, current_routing_order=current, recipients=[])


def _recipient(order=1, status=EsignRecipientStatus.NOTIFIED, role=EsignRecipientRole.SIGNER):
    return NS(routing_order=order, status=status, role=role, email="a@b.com")


class RoutingTurnTests(unittest.TestCase):
    def test_current_order_signer_is_up(self) -> None:
        env = _envelope(current=1)
        self.assertTrue(esign_signing_service._is_recipients_turn(env, _recipient(order=1)))

    def test_future_order_signer_is_not_up(self) -> None:
        env = _envelope(current=1)
        self.assertFalse(esign_signing_service._is_recipients_turn(env, _recipient(order=2)))

    def test_signed_recipient_is_never_up(self) -> None:
        env = _envelope(current=1)
        self.assertFalse(
            esign_signing_service._is_recipients_turn(
                env, _recipient(order=1, status=EsignRecipientStatus.SIGNED)
            )
        )

    def test_parallel_ignores_routing_order(self) -> None:
        env = _envelope(signing_type=EsignSigningType.PARALLEL, current=1)
        self.assertTrue(esign_signing_service._is_recipients_turn(env, _recipient(order=5)))

    def test_terminal_envelope_blocks_everyone(self) -> None:
        for status in (
            EsignEnvelopeStatus.COMPLETED,
            EsignEnvelopeStatus.VOIDED,
            EsignEnvelopeStatus.DECLINED,
            EsignEnvelopeStatus.EXPIRED,
            EsignEnvelopeStatus.DRAFT,
        ):
            env = _envelope(status=status)
            self.assertFalse(esign_signing_service._is_recipients_turn(env, _recipient()))

    def test_current_tranche_pending_signers_sequential(self) -> None:
        env = _envelope(current=2)
        first = _recipient(order=1, status=EsignRecipientStatus.SIGNED)
        second = _recipient(order=2, status=EsignRecipientStatus.NOTIFIED)
        third = _recipient(order=3, status=EsignRecipientStatus.PENDING)
        cc = _recipient(order=1, role=EsignRecipientRole.CC)
        env.recipients = [first, second, third, cc]
        pending = esign_signing_service.current_tranche_pending_signers(env)
        self.assertEqual(pending, [second])


class SignaturePayloadTests(unittest.TestCase):
    def test_valid_png_data_url_decodes(self) -> None:
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        data_url = "data:image/png;base64," + base64.b64encode(png).decode()
        decoded = esign_signing_service._decode_signature_image(data_url)
        self.assertEqual(decoded, png)

    def test_non_png_payload_rejected(self) -> None:
        data_url = "data:image/png;base64," + base64.b64encode(b"GIF89a....").decode()
        with self.assertRaises(EsignError):
            esign_signing_service._decode_signature_image(data_url)

    def test_wrong_prefix_rejected(self) -> None:
        with self.assertRaises(EsignError):
            esign_signing_service._decode_signature_image("data:image/jpeg;base64,AAAA")

    def test_invalid_base64_rejected(self) -> None:
        with self.assertRaises(EsignError):
            esign_signing_service._decode_signature_image("data:image/png;base64,!!not-base64!!")

    def test_initials_from_name(self) -> None:
        self.assertEqual(_initials_from_name("Jane Q. Client"), "JQC")
        self.assertEqual(_initials_from_name("ian"), "I")
        self.assertEqual(_initials_from_name(""), "??")

    def test_date_signed_format_matches_ceremony_preview(self) -> None:
        from datetime import datetime

        from services.esign.signing_service import format_date_signed

        # No zero-padding — must mirror formatDateSigned in dateSigned.ts.
        self.assertEqual(format_date_signed(datetime(2026, 7, 4)), "7/4/2026")
        self.assertEqual(format_date_signed(datetime(2026, 11, 23)), "11/23/2026")


class RequestMetaTests(unittest.TestCase):
    def _request(self, headers: dict, host: str | None = "10.0.0.9"):
        header_map = {k.lower(): v for k, v in headers.items()}
        return NS(
            headers=NS(get=lambda key, default=None: header_map.get(key.lower(), default)),
            client=NS(host=host) if host else None,
        )

    def test_forwarded_for_first_hop_wins(self) -> None:
        request = self._request({"X-Forwarded-For": "203.0.113.7, 10.1.1.1", "User-Agent": "UA"})
        meta = extract_request_meta(request, None)
        self.assertEqual(meta.ip_address, "203.0.113.7")
        self.assertEqual(meta.user_agent, "UA")

    def test_falls_back_to_client_host(self) -> None:
        meta = extract_request_meta(self._request({}), None)
        self.assertEqual(meta.ip_address, "10.0.0.9")

    def test_mfa_evidence_from_firebase_claims(self) -> None:
        token = {
            "firebase": {"sign_in_second_factor": "phone"},
            "phone_number": "+15551234567",
        }
        meta = extract_request_meta(self._request({}), token)
        self.assertTrue(meta.mfa_verified)
        self.assertEqual(meta.mfa_method, "phone")
        self.assertEqual(meta.mfa_phone_last4, "4567")

    def test_no_second_factor_reported_honestly(self) -> None:
        meta = extract_request_meta(self._request({}), {"firebase": {}})
        self.assertFalse(meta.mfa_verified)
        self.assertIsNone(meta.mfa_method)


class AdvisoryLockKeyTests(unittest.TestCase):
    def test_keys_are_stable_and_in_int32_range(self) -> None:
        envelope_id = str(uuid.uuid4())
        k1a, k2a = _advisory_lock_keys(envelope_id)
        k1b, k2b = _advisory_lock_keys(envelope_id)
        self.assertEqual((k1a, k2a), (k1b, k2b))
        for key in (k1a, k2a):
            self.assertGreaterEqual(key, -(2**31))
            self.assertLess(key, 2**31)

    def test_different_envelopes_get_different_keys(self) -> None:
        a = _advisory_lock_keys(str(uuid.uuid4()))
        b = _advisory_lock_keys(str(uuid.uuid4()))
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()
