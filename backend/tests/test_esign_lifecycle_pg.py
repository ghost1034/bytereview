"""Full e-sign envelope lifecycle integration test against a real Postgres.

Covers the plan's core verification list: draft -> sent -> in_progress ->
completed state machine, sequential routing turn enforcement (signer 2 gets
403 until signer 1 finishes), consent-before-sign enforcement, re-submit
after signed -> 409, sealing (with a local dev key), verification, and the
append-only esign_events trigger.

Skipped automatically unless DATABASE_URL points at Postgres and migration
039 has been applied (run: alembic upgrade head).

GCS, Cloud Tasks, and email are replaced with in-memory fakes.
"""

from __future__ import annotations

import asyncio
import base64
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:  # pragma: no cover
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except Exception:
    pass

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

_PG_AVAILABLE = False
_SKIP_REASON = "DATABASE_URL is not Postgres"
if os.environ.get("DATABASE_URL", "").startswith("postgresql"):
    try:
        from sqlalchemy import create_engine, text

        _probe = create_engine(os.environ["DATABASE_URL"])
        with _probe.connect() as _conn:
            _version = _conn.execute(text("select version_num from alembic_version")).scalar()
        _PG_AVAILABLE = _version >= "039"
        if not _PG_AVAILABLE:
            _SKIP_REASON = f"migration 039 not applied (at {_version})"
    except Exception as exc:  # pragma: no cover
        _SKIP_REASON = f"Postgres not reachable: {exc}"


class _FakeStorage:
    """In-memory stand-in for GCSService (upload/download/copy/sign-url)."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.bucket = self  # verification service reaches storage.bucket.blob(...)

    def blob(self, name: str):
        objects = self.objects

        class _Blob:
            def download_as_bytes(self_inner) -> bytes:
                return objects[name]

        return _Blob()

    async def upload_file_content(self, content: bytes, object_name: str) -> None:
        self.objects[object_name] = content

    async def copy_object(self, src: str, dest: str) -> None:
        self.objects[dest] = self.objects[src]

    async def generate_presigned_get_url(self, object_name: str, **_kw) -> str:
        return f"https://fake.local/{object_name}"

    async def delete_file(self, object_name: str) -> None:
        self.objects.pop(object_name, None)

    async def list_objects(self, prefix: str) -> list[dict]:
        return []


def _make_pdf(pages: int = 2) -> bytes:
    import fitz

    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 72), f"Agreement page {i + 1}")
    data = doc.tobytes()
    doc.close()
    return data


def _provision_local_signer_env() -> None:
    from cryptography import x509 as cx509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID

    key = ec.generate_private_key(ec.SECP256R1())
    name = cx509.Name([cx509.NameAttribute(NameOID.COMMON_NAME, "CPAAutomation E-Sign (pg test)")])
    now = datetime.now(timezone.utc)
    cert = (
        cx509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(cx509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .sign(key, hashes.SHA256())
    )
    os.environ["ESIGN_SIGNING_CERT_PEM"] = cert.public_bytes(serialization.Encoding.PEM).decode()
    os.environ["ESIGN_LOCAL_SIGNING_KEY_PEM"] = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    os.environ.pop("ESIGN_KMS_SIGNING_KEY_VERSION", None)
    os.environ.pop("ENVIRONMENT", None)


@unittest.skipUnless(_PG_AVAILABLE, _SKIP_REASON)
class EsignLifecyclePgTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _provision_local_signer_env()

        from core.database import db_config
        from models.db_models import User
        from services.esign.envelope_service import esign_envelope_service
        from services.esign.sealing_service import esign_sealing_service
        from services.esign.signing_service import esign_signing_service
        from services.esign.verification_service import esign_verification_service
        from services.esign.audit_service import EsignRequestMeta

        cls.db_config = db_config
        cls.envelope_service = esign_envelope_service
        cls.signing_service = esign_signing_service
        cls.sealing_service = esign_sealing_service
        cls.verification_service = esign_verification_service

        cls.storage = _FakeStorage()
        esign_envelope_service.storage = cls.storage
        esign_signing_service.storage = cls.storage
        esign_sealing_service.storage = cls.storage
        esign_verification_service.storage = cls.storage
        esign_sealing_service._download_bytes = lambda name: cls.storage.objects[name]

        # Capture outbound email (maintenance service routes through the same
        # _send_content, so its sends are captured too).
        cls.sent_emails: list[tuple[str, str]] = []  # (to_email, subject)

        async def _capture_email(to_email, content, *args, **kwargs):
            cls.sent_emails.append((to_email, content.subject))

        esign_signing_service._send_content = _capture_email

        cls.meta = EsignRequestMeta(
            ip_address="203.0.113.5",
            user_agent="pytest",
            mfa_verified=True,
            mfa_method="phone",
            mfa_phone_last4="1234",
        )

        # Test users
        suffix = uuid.uuid4().hex[:10]
        cls.sender_uid = f"esign-test-sender-{suffix}"
        cls.sender_email = f"esign-sender-{suffix}@esign-test.example.com"
        cls.signer1_uid = f"esign-test-s1-{suffix}"
        cls.signer1_email = f"esign-signer1-{suffix}@esign-test.example.com"
        cls.signer2_uid = f"esign-test-s2-{suffix}"
        cls.signer2_email = f"esign-signer2-{suffix}@esign-test.example.com"
        cls.cc_uid = f"esign-test-cc-{suffix}"
        cls.cc_email = f"esign-cc-{suffix}@esign-test.example.com"
        db = db_config.get_session()
        try:
            for uid, email in [
                (cls.sender_uid, cls.sender_email),
                (cls.signer1_uid, cls.signer1_email),
                (cls.signer2_uid, cls.signer2_email),
                (cls.cc_uid, cls.cc_email),
            ]:
                db.add(User(id=uid, email=email, display_name="Test"))
            db.commit()
        finally:
            db.close()

        cls._created_envelope_ids: list[str] = []

    @classmethod
    def tearDownClass(cls) -> None:
        # Envelopes/events are append-only by design; test rows must be removed
        # with the trigger disabled, superuser-style, via raw SQL.
        from sqlalchemy import text

        db = cls.db_config.get_session()
        try:
            db.execute(text("ALTER TABLE esign_events DISABLE TRIGGER trg_esign_events_append_only"))
            for envelope_id in cls._created_envelope_ids:
                db.execute(text("DELETE FROM esign_events WHERE envelope_id = :e"), {"e": envelope_id})
                db.execute(
                    text("DELETE FROM esign_signature_records WHERE envelope_id = :e"), {"e": envelope_id}
                )
                db.execute(
                    text("DELETE FROM esign_consent_records WHERE envelope_id = :e"), {"e": envelope_id}
                )
                db.execute(text("DELETE FROM esign_envelopes WHERE id = :e"), {"e": envelope_id})
            db.execute(text("ALTER TABLE esign_events ENABLE TRIGGER trg_esign_events_append_only"))
            for uid in (cls.sender_uid, cls.signer1_uid, cls.signer2_uid, cls.cc_uid):
                db.execute(text("DELETE FROM users WHERE id = :u"), {"u": uid})
            db.commit()
        finally:
            db.close()

    # ------------------------------------------------------------------

    def _run(self, coro):
        return asyncio.run(coro)

    def _create_sent_envelope(self) -> str:
        from models.esign import EsignFieldInput, EsignRecipientInput

        envelope = self._run(
            self.envelope_service.create_envelope(
                user_id=self.sender_uid,
                user_email=self.sender_email,
                title="PG lifecycle test",
                message="please sign",
                signing_type="sequential",
                files=[("agreement.pdf", _make_pdf())],
                template_id=None,
                expires_in_days=10,
                reminder_interval_hours=48,
                meta=self.meta,
            )
        )
        self.__class__._created_envelope_ids.append(envelope.id)
        self.assertEqual(envelope.status, "draft")

        envelope = self.envelope_service.replace_recipients(
            self.sender_uid,
            envelope.id,
            [
                EsignRecipientInput(email=self.signer1_email, name="Signer One", routing_order=1),
                EsignRecipientInput(email=self.signer2_email, name="Signer Two", routing_order=2),
            ],
        )
        doc_id = envelope.documents[0].id
        by_email = {r.email: r for r in envelope.recipients}
        fields = [
            EsignFieldInput(
                document_id=doc_id, recipient_id=by_email[self.signer1_email].id,
                field_type="signature", page_number=0,
                pos_x=0.1, pos_y=0.7, width=0.3, height=0.05,
            ),
            EsignFieldInput(
                document_id=doc_id, recipient_id=by_email[self.signer2_email].id,
                field_type="signature", page_number=1,
                pos_x=0.1, pos_y=0.7, width=0.3, height=0.05,
            ),
        ]
        self.envelope_service.replace_fields(self.sender_uid, envelope.id, fields)

        sent = self._run(
            self.signing_service.send_envelope(
                user_id=self.sender_uid, user_email=self.sender_email,
                envelope_id=envelope.id, meta=self.meta,
            )
        )
        self.assertEqual(sent.status, "sent")
        self.assertEqual(sent.current_routing_order, 1)
        return envelope.id

    def _signature_payload(self):
        import fitz

        from models.esign import EsignSignatureInput

        pm = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 60, 24))
        pm.clear_with(255)
        for x in range(8, 52):
            pm.set_pixel(x, 12, (20, 20, 60))
        png = pm.tobytes("png")
        return EsignSignatureInput(
            signature_type="drawn",
            image_data_url="data:image/png;base64," + base64.b64encode(png).decode(),
        )

    def test_draft_document_add_and_remove(self) -> None:
        from models.esign import EsignFieldInput, EsignRecipientInput
        from services.esign.envelope_service import EsignConflict, EsignError

        envelope = self._run(
            self.envelope_service.create_envelope(
                user_id=self.sender_uid,
                user_email=self.sender_email,
                title="PG document add/remove test",
                message=None,
                signing_type="sequential",
                files=[("first.pdf", _make_pdf(1))],
                template_id=None,
                expires_in_days=10,
                reminder_interval_hours=None,
                meta=self.meta,
            )
        )
        self.__class__._created_envelope_ids.append(envelope.id)

        # The only document cannot be removed.
        with self.assertRaises(EsignError):
            self._run(
                self.envelope_service.delete_document(
                    self.sender_uid, envelope.id, envelope.documents[0].id
                )
            )

        envelope = self._run(
            self.envelope_service.add_documents(
                self.sender_uid, envelope.id, [("second.pdf", _make_pdf(2))]
            )
        )
        self.assertEqual(len(envelope.documents), 2)
        self.assertEqual([d.display_order for d in envelope.documents], [0, 1])
        second = next(d for d in envelope.documents if d.original_filename == "second.pdf")
        self.assertEqual(second.page_count, 2)
        self.assertIn(
            second.original_sha256,
            {__import__("hashlib").sha256(v).hexdigest() for v in self.storage.objects.values()},
        )

        # A field on the removed document goes with it; other fields survive.
        envelope = self.envelope_service.replace_recipients(
            self.sender_uid,
            envelope.id,
            [EsignRecipientInput(email=self.signer1_email, name="Signer One", routing_order=1)],
        )
        first = next(d for d in envelope.documents if d.original_filename == "first.pdf")
        recipient_id = envelope.recipients[0].id
        self.envelope_service.replace_fields(
            self.sender_uid,
            envelope.id,
            [
                EsignFieldInput(
                    document_id=first.id, recipient_id=recipient_id,
                    field_type="signature", page_number=0,
                    pos_x=0.1, pos_y=0.7, width=0.3, height=0.05,
                ),
                EsignFieldInput(
                    document_id=second.id, recipient_id=recipient_id,
                    field_type="signature", page_number=1,
                    pos_x=0.1, pos_y=0.7, width=0.3, height=0.05,
                ),
            ],
        )

        envelope = self._run(
            self.envelope_service.delete_document(self.sender_uid, envelope.id, second.id)
        )
        self.assertEqual([d.original_filename for d in envelope.documents], ["first.pdf"])
        self.assertEqual(len(envelope.fields), 1)
        self.assertEqual(envelope.fields[0].document_id, first.id)

        # Once sent, documents are locked.
        sent = self._run(
            self.signing_service.send_envelope(
                user_id=self.sender_uid, user_email=self.sender_email,
                envelope_id=envelope.id, meta=self.meta,
            )
        )
        self.assertEqual(sent.status, "sent")
        with self.assertRaises(EsignConflict):
            self._run(
                self.envelope_service.add_documents(
                    self.sender_uid, envelope.id, [("third.pdf", _make_pdf(1))]
                )
            )

    def test_delete_draft_envelope(self) -> None:
        from models.db_models import EsignEnvelope, EsignEvent
        from services.esign.envelope_service import EsignConflict

        envelope = self._run(
            self.envelope_service.create_envelope(
                user_id=self.sender_uid,
                user_email=self.sender_email,
                title="PG draft delete test",
                message=None,
                signing_type="sequential",
                files=[("doomed.pdf", _make_pdf(1))],
                template_id=None,
                expires_in_days=None,
                reminder_interval_hours=None,
                meta=self.meta,
            )
        )
        self.__class__._created_envelope_ids.append(envelope.id)
        prefix = f"esign/{self.sender_uid}/{envelope.id}/"
        self.assertTrue(any(name.startswith(prefix) for name in self.storage.objects))

        self._run(self.envelope_service.delete_envelope(self.sender_uid, envelope.id))

        db = self.db_config.get_session()
        try:
            env_uuid = uuid.UUID(envelope.id)
            self.assertIsNone(
                db.query(EsignEnvelope).filter(EsignEnvelope.id == env_uuid).first()
            )
            self.assertEqual(
                db.query(EsignEvent).filter(EsignEvent.envelope_id == env_uuid).count(), 0
            )
        finally:
            db.close()
        self.assertFalse(any(name.startswith(prefix) for name in self.storage.objects))

        # Anything past draft keeps its audit trail and cannot be deleted.
        sent_id = self._create_sent_envelope()
        with self.assertRaises(EsignConflict):
            self._run(self.envelope_service.delete_envelope(self.sender_uid, sent_id))

    def test_full_sequential_lifecycle_with_seal_and_verify(self) -> None:
        from services.esign.envelope_service import EsignConflict, EsignError

        envelope_id = self._create_sent_envelope()

        # Signer 2 cannot open the session before their turn (403 semantics).
        with self.assertRaises(PermissionError):
            self._run(
                self.signing_service.get_signing_session(
                    user_id=self.signer2_uid, user_email=self.signer2_email,
                    envelope_id=envelope_id, meta=self.meta,
                )
            )

        # Signer 1: view -> consent required -> submit without consent rejected.
        session = self._run(
            self.signing_service.get_signing_session(
                user_id=self.signer1_uid, user_email=self.signer1_email,
                envelope_id=envelope_id, meta=self.meta,
            )
        )
        self.assertTrue(session.consent_required)
        self.assertEqual(len(session.fields), 1)

        with self.assertRaises(EsignError):
            self._run(
                self.signing_service.submit_signature(
                    user_id=self.signer1_uid, user_email=self.signer1_email,
                    envelope_id=envelope_id, signature=self._signature_payload(),
                    field_values=[], meta=self.meta,
                )
            )

        self.signing_service.record_consent(
            user_id=self.signer1_uid, user_email=self.signer1_email,
            envelope_id=envelope_id, meta=self.meta,
        )
        result1 = self._run(
            self.signing_service.submit_signature(
                user_id=self.signer1_uid, user_email=self.signer1_email,
                envelope_id=envelope_id, signature=self._signature_payload(),
                field_values=[], meta=self.meta,
            )
        )
        self.assertFalse(result1.sealing_enqueued)

        # Re-submit after signing -> conflict (409 semantics).
        with self.assertRaises(EsignConflict):
            self._run(
                self.signing_service.submit_signature(
                    user_id=self.signer1_uid, user_email=self.signer1_email,
                    envelope_id=envelope_id, signature=self._signature_payload(),
                    field_values=[], meta=self.meta,
                )
            )

        # Now it is signer 2's turn.
        session2 = self._run(
            self.signing_service.get_signing_session(
                user_id=self.signer2_uid, user_email=self.signer2_email,
                envelope_id=envelope_id, meta=self.meta,
            )
        )
        self.assertTrue(session2.is_my_turn)
        self.signing_service.record_consent(
            user_id=self.signer2_uid, user_email=self.signer2_email,
            envelope_id=envelope_id, meta=self.meta,
        )
        result2 = self._run(
            self.signing_service.submit_signature(
                user_id=self.signer2_uid, user_email=self.signer2_email,
                envelope_id=envelope_id, signature=self._signature_payload(),
                field_values=[], meta=self.meta,
            )
        )
        self.assertTrue(result2.sealing_enqueued)

        # Sealing worker (normally on io-tasks; run inline here).
        seal_result = self._run(self.sealing_service.process_envelope_seal(envelope_id))
        self.assertEqual(seal_result["status"], "sealed")

        # Duplicate task delivery -> idempotent skip.
        second = self._run(self.sealing_service.process_envelope_seal(envelope_id))
        self.assertEqual(second["status"], "already_sealed")

        envelope = self.envelope_service.get_envelope(self.sender_uid, envelope_id)
        self.assertEqual(envelope.status, "completed")
        self.assertTrue(envelope.has_sealed_document)
        self.assertTrue(envelope.has_certificate)

        # Verify by envelope id: hash matches, seal valid.
        verify = self._run(
            self.verification_service.verify(user_id=self.sender_uid, envelope_id=envelope_id)
        )
        self.assertTrue(verify.hash_match)
        self.assertTrue(verify.signature_valid)
        self.assertEqual(verify.modification_level, "none")

        # Verify a tampered copy: reported invalid.
        sealed_object = [k for k in self.storage.objects if k.endswith("sealed.pdf")]
        tampered = bytearray(self.storage.objects[sealed_object[0]])
        tampered[len(tampered) // 2] ^= 0xFF
        verify_bad = self._run(
            self.verification_service.verify(user_id=self.sender_uid, pdf_bytes=bytes(tampered))
        )
        self.assertNotEqual(verify_bad.signature_valid, True)

        # Audit trail is complete and MFA-stamped.
        audit = self.envelope_service.get_audit_trail(self.sender_uid, envelope_id)
        event_types = [e.event_type for e in audit.events]
        for expected in ("created", "sent", "viewed", "consent_given", "signed", "sealed", "completed"):
            self.assertIn(expected, event_types)
        signed_events = [e for e in audit.events if e.event_type == "signed"]
        self.assertEqual(len(signed_events), 2)
        self.assertTrue(all(e.mfa_verified for e in signed_events))
        self.assertTrue(all(e.ip_address == "203.0.113.5" for e in signed_events))

    def test_append_only_trigger_blocks_update_and_delete(self) -> None:
        from sqlalchemy import text
        from sqlalchemy.exc import InternalError

        envelope_id = self._create_sent_envelope()
        db = self.db_config.get_session()
        try:
            with self.assertRaises(InternalError):
                db.execute(
                    text("UPDATE esign_events SET actor_email = 'evil@x.com' WHERE envelope_id = :e"),
                    {"e": envelope_id},
                )
                db.commit()
            db.rollback()
            with self.assertRaises(InternalError):
                db.execute(text("DELETE FROM esign_events WHERE envelope_id = :e"), {"e": envelope_id})
                db.commit()
            db.rollback()
        finally:
            db.close()

    def test_decline_ends_envelope(self) -> None:
        envelope_id = self._create_sent_envelope()
        self._run(
            self.signing_service.decline(
                user_id=self.signer1_uid, user_email=self.signer1_email,
                envelope_id=envelope_id, reason="Wrong entity name", meta=self.meta,
            )
        )
        envelope = self.envelope_service.get_envelope(self.sender_uid, envelope_id)
        self.assertEqual(envelope.status, "declined")
        recipient = next(r for r in envelope.recipients if r.email == self.signer1_email)
        self.assertEqual(recipient.status, "declined")
        self.assertEqual(recipient.declined_reason, "Wrong entity name")

    def test_void_by_sender(self) -> None:
        envelope_id = self._create_sent_envelope()
        voided = self._run(
            self.signing_service.void_envelope(
                user_id=self.sender_uid, user_email=self.sender_email,
                envelope_id=envelope_id, reason="Sent in error", meta=self.meta,
            )
        )
        self.assertEqual(voided.status, "voided")
        self.assertEqual(voided.voided_reason, "Sent in error")

    # ------------------------------------------------------------------
    # Parity additions: CC recipients, Finish Later, date format, warnings
    # ------------------------------------------------------------------

    def _create_cc_envelope(self) -> str:
        """One signer (signature + required text + date field) plus a CC."""
        from models.esign import EsignFieldInput, EsignRecipientInput

        envelope = self._run(
            self.envelope_service.create_envelope(
                user_id=self.sender_uid,
                user_email=self.sender_email,
                title="PG cc/finish-later test",
                message="please sign",
                signing_type="sequential",
                files=[("agreement.pdf", _make_pdf())],
                template_id=None,
                expires_in_days=10,
                reminder_interval_hours=None,
                meta=self.meta,
            )
        )
        self.__class__._created_envelope_ids.append(envelope.id)
        envelope = self.envelope_service.replace_recipients(
            self.sender_uid,
            envelope.id,
            [
                EsignRecipientInput(email=self.signer1_email, name="Signer One", routing_order=1),
                EsignRecipientInput(
                    email=self.cc_email, name="Copy Recipient", role="cc", routing_order=1
                ),
            ],
        )
        doc_id = envelope.documents[0].id
        signer = next(r for r in envelope.recipients if r.email == self.signer1_email)
        self.envelope_service.replace_fields(
            self.sender_uid,
            envelope.id,
            [
                EsignFieldInput(
                    document_id=doc_id, recipient_id=signer.id,
                    field_type="signature", page_number=0,
                    pos_x=0.1, pos_y=0.7, width=0.3, height=0.05,
                ),
                EsignFieldInput(
                    document_id=doc_id, recipient_id=signer.id,
                    field_type="text", page_number=0, label="Company",
                    pos_x=0.1, pos_y=0.5, width=0.3, height=0.03,
                ),
                EsignFieldInput(
                    document_id=doc_id, recipient_id=signer.id,
                    field_type="date_signed", page_number=0,
                    pos_x=0.5, pos_y=0.7, width=0.2, height=0.03,
                ),
            ],
        )
        self._run(
            self.signing_service.send_envelope(
                user_id=self.sender_uid, user_email=self.sender_email,
                envelope_id=envelope.id, meta=self.meta,
            )
        )
        return envelope.id

    def test_cc_notification_readonly_session_and_void_fanout(self) -> None:
        from services.esign.envelope_service import EsignNotFound

        self.__class__.sent_emails.clear()
        envelope_id = self._create_cc_envelope()

        # CC is notified at send with distinct copy.
        envelope = self.envelope_service.get_envelope(self.sender_uid, envelope_id)
        cc = next(r for r in envelope.recipients if r.email == self.cc_email)
        self.assertEqual(cc.status, "notified")
        cc_sends = [s for to, s in self.sent_emails if to == self.cc_email]
        self.assertTrue(any("sent you a copy" in s for s in cc_sends), cc_sends)

        # CC gets a read-only session (documents, no fields, no consent gate)
        # and their first view is recorded.
        session = self._run(
            self.signing_service.get_signing_session(
                user_id=self.cc_uid, user_email=self.cc_email,
                envelope_id=envelope_id, meta=self.meta,
            )
        )
        self.assertEqual(session.recipient_role, "cc")
        self.assertFalse(session.is_my_turn)
        self.assertFalse(session.consent_required)
        self.assertEqual(session.fields, [])
        self.assertEqual(len(session.documents), 1)
        envelope = self.envelope_service.get_envelope(self.sender_uid, envelope_id)
        cc = next(r for r in envelope.recipients if r.email == self.cc_email)
        self.assertEqual(cc.status, "viewed")

        # CCs cannot sign or save progress.
        with self.assertRaises(EsignNotFound):
            self.signing_service.save_progress(
                user_id=self.cc_uid, user_email=self.cc_email,
                envelope_id=envelope_id, field_values=[],
            )

        # Void notifies the CC too (already involved).
        self.__class__.sent_emails.clear()
        self._run(
            self.signing_service.void_envelope(
                user_id=self.sender_uid, user_email=self.sender_email,
                envelope_id=envelope_id, reason="Testing void fan-out", meta=self.meta,
            )
        )
        void_targets = [to for to, s in self.sent_emails if "voided" in s]
        self.assertIn(self.cc_email, void_targets)
        self.assertIn(self.signer1_email, void_targets)

    def test_finish_later_and_date_signed_format(self) -> None:
        from models.esign import EsignFieldValueInput, EsignSignatureInput

        envelope_id = self._create_cc_envelope()
        session = self._run(
            self.signing_service.get_signing_session(
                user_id=self.signer1_uid, user_email=self.signer1_email,
                envelope_id=envelope_id, meta=self.meta,
            )
        )
        text_field = next(f for f in session.fields if f.field_type == "text")

        # Save progress, then reopen: the draft value comes back.
        saved = self.signing_service.save_progress(
            user_id=self.signer1_uid, user_email=self.signer1_email,
            envelope_id=envelope_id,
            field_values=[EsignFieldValueInput(field_id=text_field.id, value="Acme LLC")],
        )
        self.assertEqual(saved, 1)
        session = self._run(
            self.signing_service.get_signing_session(
                user_id=self.signer1_uid, user_email=self.signer1_email,
                envelope_id=envelope_id, meta=self.meta,
            )
        )
        text_field = next(f for f in session.fields if f.field_type == "text")
        self.assertEqual(text_field.draft_value, "Acme LLC")
        self.assertIsNone(text_field.value)

        # A non-recipient can't save progress on this envelope.
        from services.esign.envelope_service import EsignNotFound

        with self.assertRaises(EsignNotFound):
            self.signing_service.save_progress(
                user_id=self.signer2_uid, user_email=self.signer2_email,
                envelope_id=envelope_id, field_values=[],
            )

        # Submit with adopted initials; drafts are cleared and the date stamp
        # uses the ceremony's M/D/YYYY format.
        self.signing_service.record_consent(
            user_id=self.signer1_uid, user_email=self.signer1_email,
            envelope_id=envelope_id, meta=self.meta,
        )
        base = self._signature_payload()
        signature = EsignSignatureInput(
            signature_type=base.signature_type,
            image_data_url=base.image_data_url,
            initials_text="S1X",
        )
        self._run(
            self.signing_service.submit_signature(
                user_id=self.signer1_uid, user_email=self.signer1_email,
                envelope_id=envelope_id, signature=signature,
                field_values=[EsignFieldValueInput(field_id=text_field.id, value="Acme LLC")],
                meta=self.meta,
            )
        )
        envelope = self.envelope_service.get_envelope(self.sender_uid, envelope_id)
        fields = {f.field_type: f for f in envelope.fields}
        now = datetime.now(timezone.utc)
        self.assertEqual(fields["date_signed"].value, f"{now.month}/{now.day}/{now.year}")
        self.assertEqual(fields["text"].value, "Acme LLC")
        self.assertIsNone(fields["text"].draft_value)

        from models.db_models import EsignSignatureRecord

        db = self.db_config.get_session()
        try:
            record = (
                db.query(EsignSignatureRecord)
                .filter(EsignSignatureRecord.envelope_id == uuid.UUID(envelope_id))
                .one()
            )
            self.assertEqual(record.initials_text, "S1X")
        finally:
            db.close()

    def test_expiration_warning_sweep_is_one_time(self) -> None:
        from sqlalchemy import text

        from services.esign.maintenance_service import esign_maintenance_service

        envelope_id = self._create_sent_envelope()
        db = self.db_config.get_session()
        try:
            db.execute(
                text("UPDATE esign_envelopes SET expires_at = :e WHERE id = :id"),
                {"e": datetime.now(timezone.utc) + timedelta(days=1), "id": envelope_id},
            )
            db.commit()
        finally:
            db.close()

        self.__class__.sent_emails.clear()
        result = self._run(esign_maintenance_service.run())
        self.assertGreaterEqual(result["expiration_warnings"], 1)
        warned = [to for to, s in self.sent_emails if s.startswith("Expiring soon")]
        self.assertIn(self.signer1_email, warned)  # current tranche only
        self.assertIn(self.sender_email, warned)
        self.assertNotIn(self.signer2_email, warned)

        audit = self.envelope_service.get_audit_trail(self.sender_uid, envelope_id)
        self.assertIn("expiration_warning", [e.event_type for e in audit.events])

        # Second run: already stamped, nothing new goes out for this envelope.
        self.__class__.sent_emails.clear()
        self._run(esign_maintenance_service.run())
        self.assertNotIn(
            self.signer1_email,
            [to for to, s in self.sent_emails if s.startswith("Expiring soon")],
        )


if __name__ == "__main__":
    unittest.main()
