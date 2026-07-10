"""End-to-end seal pipeline tests (flatten -> certificate -> PAdES seal -> verify)
using a local EC key + self-signed cert so no GCP access is needed.
"""

from __future__ import annotations

import hashlib
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
        from services.esign.certificate_service import build_certificate_pdf
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
        document = NS(
            id=doc_id, original_filename="letter.pdf",
            original_sha256=hashlib.sha256(pdf_bytes).hexdigest(),
            flattened_sha256=None, display_order=0,
        )
        event = NS(created_at=now, event_type="signed", actor_email="jane@example.com",
                   ip_address="1.2.3.4", mfa_verified=True)
        consent = NS(recipient_id=rec_id, consented_at=now, ip_address="1.2.3.4",
                     consent_text_sha256="ab" * 32)

        certificate = build_certificate_pdf(
            envelope=envelope, documents=[document], recipients=[recipient],
            consent_records=[consent], signature_records=[sig_record], events=[event],
            sender_email="cpa@firm.com",
            flattened_hashes={str(doc_id): hashlib.sha256(flattened).hexdigest()},
        )

        combined = fitz.open()
        with fitz.open(stream=flattened, filetype="pdf") as part:
            combined.insert_pdf(part)
        with fitz.open(stream=certificate, filetype="pdf") as part:
            combined.insert_pdf(part)
        combined_bytes = combined.tobytes(deflate=True, garbage=3)
        combined.close()

        sealed, evidence = esign_sealing_service._seal_pdf(combined_bytes, envelope)
        return sealed, NS(evidence=evidence)

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


if __name__ == "__main__":
    unittest.main()
