"""Re-verification of sealed e-sign documents: hash + PAdES seal validity.

Two modes:
- By envelope_id: downloads the stored sealed PDF, recomputes SHA-256 against
  the immutably recorded hash, and validates the embedded signature.
- By uploaded PDF: computes its SHA-256, matches it against the caller's
  envelopes, and validates whatever seal the file carries — so a copy that
  left the platform years ago can still be checked.
"""

from __future__ import annotations

import asyncio
import io
import logging
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from core.database import db_config
from models.db_models import EsignEnvelope
from models.esign import EsignVerifyResponse
from services.esign.envelope_service import EsignError, EsignNotFound, sha256_hex
from services.gcs_service import get_storage_service

logger = logging.getLogger(__name__)


class EsignVerificationService:
    def __init__(self) -> None:
        self.storage = get_storage_service()

    def _get_session(self) -> Session:
        return db_config.get_session()

    def _validate_seal(self, pdf_bytes: bytes) -> dict:
        """Validate the embedded PAdES signature. Never raises — verification
        of a tampered file should report, not 500."""
        result: dict = {
            "signature_found": False,
            "signature_valid": None,
            "modification_level": None,
            "signer_subject": None,
            "signed_at": None,
            "details": None,
        }
        try:
            from pyhanko.pdf_utils.reader import PdfFileReader
            from pyhanko.sign.validation import validate_pdf_signature
            from pyhanko_certvalidator import ValidationContext

            from services.esign.kms_signer import load_signing_cert

            reader = PdfFileReader(io.BytesIO(pdf_bytes))
            embedded = list(reader.embedded_signatures)
            if not embedded:
                result["details"] = "No embedded digital signature found"
                return result
            result["signature_found"] = True

            cert = load_signing_cert()
            vc_kwargs = {"allow_fetching": False}
            if cert is not None:
                vc_kwargs["trust_roots"] = [cert]
            validation_context = ValidationContext(**vc_kwargs)

            status = validate_pdf_signature(embedded[-1], signer_validation_context=validation_context)
            result["signature_valid"] = bool(status.intact and status.valid)
            if status.modification_level is not None:
                result["modification_level"] = status.modification_level.name.lower()
            if status.signing_cert is not None:
                result["signer_subject"] = status.signing_cert.subject.human_friendly
            result["signed_at"] = status.signer_reported_dt
            if not result["signature_valid"]:
                result["details"] = "The document was modified after it was sealed"
            elif cert is None:
                result["details"] = (
                    "Integrity verified against the embedded certificate; org trust root "
                    "not configured on this instance"
                )
            elif not status.trusted:
                result["details"] = "Signature intact but certificate is not the configured org certificate"
        except Exception as exc:
            # A malformed/tampered file often fails to parse at all — that is a
            # verification result, not a server error.
            logger.info("Seal validation failed structurally: %s", exc)
            result["signature_valid"] = False if result["signature_found"] else None
            result["details"] = f"Document could not be validated: {type(exc).__name__}"
        return result

    async def verify(
        self,
        *,
        user_id: str,
        envelope_id: Optional[str] = None,
        pdf_bytes: Optional[bytes] = None,
    ) -> EsignVerifyResponse:
        if not envelope_id and pdf_bytes is None:
            raise EsignError("Provide an envelope_id or upload a PDF to verify")

        db = self._get_session()
        try:
            envelope: Optional[EsignEnvelope] = None
            computed_sha: Optional[str] = None

            if envelope_id:
                try:
                    env_uuid = uuid.UUID(str(envelope_id))
                except ValueError:
                    raise EsignNotFound("Envelope not found")
                envelope = (
                    db.query(EsignEnvelope)
                    .filter(EsignEnvelope.id == env_uuid, EsignEnvelope.user_id == user_id)
                    .first()
                )
                if not envelope:
                    raise EsignNotFound("Envelope not found")
                if pdf_bytes is None:
                    if not envelope.sealed_gcs_object_name:
                        raise EsignError("Envelope has not been sealed yet")
                    pdf_bytes = await asyncio.to_thread(
                        lambda: self.storage.bucket.blob(envelope.sealed_gcs_object_name).download_as_bytes()
                    )

            computed_sha = sha256_hex(pdf_bytes)

            if envelope is None:
                # Match the uploaded file to one of the caller's sealed envelopes.
                envelope = (
                    db.query(EsignEnvelope)
                    .filter(
                        EsignEnvelope.user_id == user_id,
                        EsignEnvelope.sealed_sha256 == computed_sha,
                    )
                    .first()
                )

            hash_match: Optional[bool] = None
            if envelope is not None and envelope.sealed_sha256:
                hash_match = computed_sha == envelope.sealed_sha256

            seal = await asyncio.to_thread(self._validate_seal, pdf_bytes)

            return EsignVerifyResponse(
                envelope_id=str(envelope.id) if envelope else None,
                envelope_status=(
                    envelope.status.value if envelope and hasattr(envelope.status, "value") else None
                ),
                hash_match=hash_match,
                signature_found=seal["signature_found"],
                signature_valid=seal["signature_valid"],
                modification_level=seal["modification_level"],
                signer_subject=seal["signer_subject"],
                signed_at=seal["signed_at"],
                sealed_sha256=envelope.sealed_sha256 if envelope else None,
                computed_sha256=computed_sha,
                details=seal["details"],
            )
        finally:
            db.close()


esign_verification_service = EsignVerificationService()
