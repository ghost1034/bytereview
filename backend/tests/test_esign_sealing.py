"""End-to-end seal pipeline tests (flatten + standalone certificate -> PAdES seal -> verify)
using a local EC key + self-signed cert so no GCP access is needed.
"""

from __future__ import annotations

import asyncio
import os
import sys
import types
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz
from cryptography import x509 as cx509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

NS = types.SimpleNamespace


def _provision_local_signer_env() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    name = cx509.Name(
        [
            cx509.NameAttribute(NameOID.COMMON_NAME, "CPAAutomation E-Signature Seal (test)"),
            cx509.NameAttribute(NameOID.ORGANIZATION_NAME, "CPAAutomation"),
        ]
    )
    now = datetime.now(timezone.utc)
    cert = (
        cx509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(cx509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=365))
        .sign(key, hashes.SHA256())
    )
    os.environ["ESIGN_SIGNING_CERT_PEM"] = cert.public_bytes(serialization.Encoding.PEM).decode()
    os.environ["ESIGN_LOCAL_SIGNING_KEY_PEM"] = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    os.environ.pop("ESIGN_KMS_SIGNING_KEY_VERSION", None)


class EsignSealingPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _provision_local_signer_env()

    def _build_source_pdf(self) -> bytes:
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 72), "Engagement letter")
        doc.new_page(width=612, height=792)
        data = doc.tobytes()
        doc.close()
        d = fitz.open(stream=data, filetype="pdf")
        d[1].set_rotation(90)
        data = d.tobytes()
        d.close()
        return data

    def _sealed_envelope_bytes(self) -> tuple[bytes, NS]:
        from models.db_models import (
            EsignEnvelopeStatus,
            EsignFieldType,
            EsignRecipientRole,
            EsignRecipientStatus,
            EsignSignatureType,
            EsignSigningType,
        )
        from services.esign.sealing_service import _stamp_field, esign_sealing_service

        now = datetime.now(timezone.utc)
        pdf_bytes = self._build_source_pdf()
        env_id, doc_id, rec_id, sig_id = (uuid.uuid4() for _ in range(4))

        recipient = NS(
            id=rec_id, name="Jane Q. Client", email="jane@example.com",
            role=EsignRecipientRole.SIGNER, status=EsignRecipientStatus.SIGNED,
            routing_order=1, viewed_at=now, consented_at=now, signed_at=now,
        )
        sig_record = NS(
            id=sig_id, recipient_id=rec_id, signature_type=EsignSignatureType.TYPED,
            typed_text="Jane Q. Client", typed_font="dancing-script",
            image_gcs_object_name=None, image_sha256=None,
        )
        fields = [
            NS(id=uuid.uuid4(), document_id=doc_id, recipient_id=rec_id,
               field_type=EsignFieldType.SIGNATURE, page_number=0,
               pos_x=0.1, pos_y=0.7, width=0.3, height=0.05, value=str(sig_id), label=None),
            NS(id=uuid.uuid4(), document_id=doc_id, recipient_id=rec_id,
               field_type=EsignFieldType.DATE_SIGNED, page_number=1,
               pos_x=0.5, pos_y=0.8, width=0.2, height=0.03, value="2026-07-09", label=None),
        ]

        pdf = fitz.open(stream=pdf_bytes, filetype="pdf")
        for field in fields:
            sig = sig_record if field.field_type == EsignFieldType.SIGNATURE else None
            _stamp_field(pdf[field.page_number], field, recipient, sig, None)
        flattened = pdf.tobytes(deflate=True, garbage=3)
        pdf.close()

        envelope = NS(
            id=env_id, title="Test Engagement", sent_at=now, user_id="u1",
            signing_type=EsignSigningType.SEQUENTIAL, status=EsignEnvelopeStatus.IN_PROGRESS,
        )
        combined = fitz.open()
        with fitz.open(stream=flattened, filetype="pdf") as part:
            combined.insert_pdf(part)
        combined_bytes = combined.tobytes(deflate=True, garbage=3)
        combined.close()

        sealed, evidence = esign_sealing_service._seal_pdf(combined_bytes, envelope)
        return sealed, NS(evidence=evidence)

    def test_flatten_removes_interactive_acroform_widgets(self) -> None:
        from services.esign.sealing_service import EsignSealingService

        source = fitz.open()
        page = source.new_page()
        widget = fitz.Widget()
        widget.field_name = "Client name"
        widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
        widget.field_value = "Jane Client"
        widget.rect = fitz.Rect(72, 72, 240, 100)
        page.add_widget(widget)
        source_bytes = source.tobytes()
        source.close()

        service = EsignSealingService.__new__(EsignSealingService)
        service._download_bytes = lambda _name: source_bytes
        document = NS(id=uuid.uuid4(), gcs_object_name="source.pdf")
        flattened = asyncio.run(service._flatten_document(document, [], {}, {}, {}))
        with fitz.open(stream=flattened, filetype="pdf") as result:
            self.assertEqual(list(result[0].widgets() or []), [])

    def test_flatten_skips_disabled_generated_labels_only(self) -> None:
        from models.db_models import EsignFieldType
        from services.esign.sealing_service import EsignSealingService

        source = fitz.open()
        source.new_page(width=612, height=792)
        source_bytes = source.tobytes()
        source.close()
        document_id = uuid.uuid4()
        recipient_id = uuid.uuid4()
        document = NS(id=document_id, gcs_object_name="source.pdf")
        fields = [
            NS(id=uuid.uuid4(), document_id=document_id, recipient_id=recipient_id,
               field_type=EsignFieldType.NOTE, page_number=0, pos_x=0.1, pos_y=0.1,
               width=0.3, height=0.05, value=None, label="Enabled",
               properties={"sender_prefill": "Enabled generated label", "label_link": {"kind": "field", "source_id": "source-a", "enabled": True}}),
            NS(id=uuid.uuid4(), document_id=document_id, recipient_id=recipient_id,
               field_type=EsignFieldType.NOTE, page_number=0, pos_x=0.1, pos_y=0.2,
               width=0.3, height=0.05, value=None, label="Disabled",
               properties={"sender_prefill": "Disabled generated label", "label_link": {"kind": "field", "source_id": "source-b", "enabled": False}}),
        ]
        service = EsignSealingService.__new__(EsignSealingService)
        service._download_bytes = lambda _name: source_bytes
        flattened = asyncio.run(service._flatten_document(document, fields, {}, {}, {}))
        with fitz.open(stream=flattened, filetype="pdf") as result:
            text = result[0].get_text()
        self.assertIn("Enabled generated label", text)
        self.assertNotIn("Disabled generated label", text)

    def test_seal_and_verify_round_trip(self) -> None:
        from services.esign.verification_service import esign_verification_service

        sealed, meta = self._sealed_envelope_bytes()
        self.assertEqual(meta.evidence["seal_backend"], "local_dev_key")

        result = esign_verification_service._validate_seal(sealed)
        self.assertTrue(result["signature_found"])
        self.assertTrue(result["signature_valid"])
        self.assertEqual(result["modification_level"], "none")
        self.assertIn("CPAAutomation", result["signer_subject"])
        self.assertIsNotNone(result["signed_at"])

    def test_sealed_pdf_does_not_include_certificate_pages(self) -> None:
        sealed, _ = self._sealed_envelope_bytes()

        with fitz.open(stream=sealed, filetype="pdf") as pdf:
            text = "".join(page.get_text() for page in pdf)
            self.assertEqual(pdf.page_count, 2)
        self.assertNotIn("Certificate of Completion", text)

    def test_tampered_document_fails_verification(self) -> None:
        from services.esign.verification_service import esign_verification_service

        sealed, _ = self._sealed_envelope_bytes()
        tampered = bytearray(sealed)
        tampered[len(tampered) // 3] ^= 0xFF
        result = esign_verification_service._validate_seal(bytes(tampered))
        self.assertNotEqual(result["signature_valid"], True)

    def test_unsigned_document_reports_no_signature(self) -> None:
        from services.esign.verification_service import esign_verification_service

        result = esign_verification_service._validate_seal(self._build_source_pdf())
        self.assertFalse(result["signature_found"])
        self.assertIsNone(result["signature_valid"])


class AdoptionStampingTests(unittest.TestCase):
    """Initials come from the adopted record; uploaded signatures stamp as images."""

    def _page(self):
        doc = fitz.open()
        return doc, doc.new_page(width=612, height=792)

    def _field(self, field_type, value="sig-id"):
        return NS(
            id=uuid.uuid4(), document_id=uuid.uuid4(), recipient_id=uuid.uuid4(),
            field_type=field_type, page_number=0,
            pos_x=0.1, pos_y=0.4, width=0.3, height=0.05, value=value, label=None,
        )

    def _png(self) -> bytes:
        pm = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 40, 16))
        pm.clear_with(255)
        return pm.tobytes("png")

    def test_initials_stamped_from_adopted_record(self) -> None:
        from models.db_models import EsignFieldType, EsignSignatureType
        from services.esign.sealing_service import _stamp_field

        doc, page = self._page()
        recipient = NS(name="Jane Q. Client", email="jane@example.com")
        record = NS(
            signature_type=EsignSignatureType.TYPED, typed_text="Jane Q. Client",
            typed_font="dancing-script", initials_text="JQX",
            initials_image_gcs_object_name=None,
        )
        _stamp_field(page, self._field(EsignFieldType.INITIALS), recipient, record, None)
        text = page.get_text()
        doc.close()
        self.assertIn("JQX", text)
        self.assertNotIn("JQC", text)  # not derived from the account name

    def test_initials_fall_back_to_name_for_legacy_records(self) -> None:
        from models.db_models import EsignFieldType, EsignSignatureType
        from services.esign.sealing_service import _stamp_field

        doc, page = self._page()
        recipient = NS(name="Jane Q. Client", email="jane@example.com")
        legacy = NS(  # pre-044 record: no initials_* attributes at all
            signature_type=EsignSignatureType.TYPED, typed_text="Jane Q. Client",
            typed_font="dancing-script",
        )
        _stamp_field(page, self._field(EsignFieldType.INITIALS), recipient, legacy, None)
        text = page.get_text()
        doc.close()
        self.assertIn("JQC", text)

    def test_uploaded_signature_stamped_as_image(self) -> None:
        from models.db_models import EsignFieldType, EsignSignatureType
        from services.esign.sealing_service import _stamp_field

        doc, page = self._page()
        recipient = NS(name="Jane", email="jane@example.com")
        record = NS(
            signature_type=EsignSignatureType.UPLOADED, typed_text=None, typed_font=None,
            initials_text="J", initials_image_gcs_object_name=None,
        )
        _stamp_field(page, self._field(EsignFieldType.SIGNATURE), recipient, record, self._png())
        images = page.get_images(full=True)
        doc.close()
        self.assertEqual(len(images), 1)

    def test_schema_v2_stamp_uses_only_its_distinct_image(self) -> None:
        from models.db_models import EsignFieldType, EsignSignatureType
        from services.esign.sealing_service import _stamp_field

        doc, page = self._page()
        recipient = NS(name="Jane Signature", email="jane@example.com")
        record = NS(
            signature_type=EsignSignatureType.TYPED, typed_text="Jane Signature",
            typed_font="dancing-script", stamp_type=EsignSignatureType.UPLOADED,
        )
        _stamp_field(page, self._field(EsignFieldType.STAMP), recipient, record, self._png())
        self.assertEqual(len(page.get_images(full=True)), 1)
        self.assertNotIn("Jane Signature", page.get_text())
        doc.close()

    def test_radio_selection_draws_filled_dot(self) -> None:
        from models.db_models import EsignFieldType
        from services.esign.sealing_service import _stamp_field

        doc, page = self._page()
        _stamp_field(page, self._field(EsignFieldType.RADIO, value="true"), None, None, None)
        drawings = page.get_drawings()
        doc.close()
        self.assertTrue(drawings)
        self.assertIsNotNone(drawings[0]["fill"])

    def test_attachment_field_stamps_filename(self) -> None:
        from models.db_models import EsignFieldType
        from services.esign.sealing_service import _stamp_field

        doc, page = self._page()
        attachment = NS(original_filename="support.pdf")
        _stamp_field(page, self._field(EsignFieldType.ATTACHMENT, value="attachment-id"), None, None, None, attachment)
        text = page.get_text()
        doc.close()
        self.assertIn("Attachment: support.pdf", text)

    def test_all_typed_fonts_are_embedded(self) -> None:
        from services.esign.sealing_service import _TYPED_FONT_FILES
        from services.esign.signing_service import ALLOWED_TYPED_FONTS

        self.assertEqual(set(_TYPED_FONT_FILES), ALLOWED_TYPED_FONTS)
        for slug, path in _TYPED_FONT_FILES.items():
            self.assertTrue(path.is_file(), f"missing font file for {slug}: {path}")


class CertificateContentTests(unittest.TestCase):
    def _build(self, recipients, signature_records):
        from services.esign.certificate_service import build_certificate_pdf

        now = datetime.now(timezone.utc)
        envelope = NS(
            id=uuid.uuid4(), title="Cert test", sent_at=now, user_id="u1",
            signing_type=NS(value="sequential"), status=NS(value="in_progress"),
            user=NS(display_name="Ian Stewart", email="cpa@firm.com"),
        )
        document = NS(
            id=uuid.uuid4(), original_filename="letter.pdf",
            original_sha256="aa" * 32, flattened_sha256="bb" * 32, display_order=0,
        )
        return build_certificate_pdf(
            envelope=envelope, documents=[document], recipients=recipients,
            consent_records=[], signature_records=signature_records,
            events=[
                NS(created_at=now, event_type="signed", actor_email="jane@example.com",
                   ip_address="9.8.7.6", mfa_verified=True,
                   recipient_id=recipients[0].id),
            ],
            sender_email="cpa@firm.com", flattened_hashes={},
        )

    def test_certificate_lists_cc_ip_and_adoption_style(self) -> None:
        from models.db_models import EsignRecipientRole, EsignSignatureType

        now = datetime.now(timezone.utc)
        signer_id = uuid.uuid4()
        signer = NS(
            id=signer_id, name="Jane Q. Client", email="jane@example.com",
            role=EsignRecipientRole.SIGNER, routing_order=1,
            viewed_at=now, consented_at=now, signed_at=now,
        )
        cc = NS(
            id=uuid.uuid4(), name="Copy Person", email="copy@example.com",
            role=EsignRecipientRole.CC, routing_order=1,
            status=NS(value="viewed"), viewed_at=now,
        )
        record = NS(
            recipient_id=signer_id, signature_type=EsignSignatureType.TYPED,
            typed_text="Jane Q. Client", typed_font="caveat",
            image_sha256=None, initials_text="JQC", initials_image_sha256=None,
        )
        pdf_bytes = self._build([signer, cc], [record])
        with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
            text = "".join(page.get_text() for page in pdf)
        self.assertIn("Carbon Copy Recipients", text)
        self.assertIn("copy@example.com", text)
        self.assertIn("from IP 9.8.7.6", text)
        self.assertIn("Pre-selected style (Caveat)", text)
        self.assertIn("Security level", text)
        self.assertIn("Ian Stewart", text)


if __name__ == "__main__":
    unittest.main()
