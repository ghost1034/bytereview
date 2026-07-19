"""Async sealing pipeline for completed e-sign envelopes.

Runs on the io-tasks queue after the last signer submits:
1. Advisory lock + idempotency guard (Cloud Tasks may deliver twice).
2. Flatten all field values into each PDF with PyMuPDF (single pass).
3. Generate the certificate of completion and append it to the combined PDF
   *before* sealing so it is covered by the seal.
4. Apply the PAdES digital signature via Cloud KMS (pyHanko).
5. Store hashes, mark completed, write sealed+completed audit events, email
   all parties.

The envelope is never marked completed unless the sealed object is durably
uploaded — a KMS/GCS failure raises and Cloud Tasks retries.
"""

from __future__ import annotations

import io
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import fitz
from pathlib import Path
from sqlalchemy.orm import Session, joinedload

from core.database import db_config
from models.db_models import (
    EsignConsentRecord,
    EsignDocument,
    EsignEnvelope,
    EsignEnvelopeStatus,
    EsignEvent,
    EsignEventType,
    EsignField,
    EsignFieldType,
    EsignRecipient,
    EsignRecipientRole,
    EsignRecipientStatus,
    EsignSignatureRecord,
    EsignSignatureType,
    EsignSignerAttachment,
)
from services.esign import audit_service
from services.esign.certificate_service import build_certificate_pdf
from services.esign.envelope_service import sha256_hex
from services.esign.signing_service import acquire_envelope_lock
from services.esign.field_logic import compute_formulas, resolve_visibility
from services.gcs_service import get_storage_service

logger = logging.getLogger(__name__)

SEAL_FIELD_NAME = "CPAAutomationSeal"

# PyMuPDF base-14 font aliases
_FONT_TEXT = "helv"
_FONT_SIGNATURE_FALLBACK = "tiit"  # Times-Italic, if the script font file is missing

# Embedded script fonts for typed signatures, keyed by the typed_font slug the
# signer adopted (see ALLOWED_TYPED_FONTS in signing_service).
_FONTS_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "fonts"
_TYPED_FONT_FILES = {
    "dancing-script": _FONTS_DIR / "DancingScript-Regular.ttf",
    "caveat": _FONTS_DIR / "Caveat-Regular.ttf",
    "great-vibes": _FONTS_DIR / "GreatVibes-Regular.ttf",
    "homemade-apple": _FONTS_DIR / "HomemadeApple-Regular.ttf",
}
_DEFAULT_TYPED_FONT = "dancing-script"

# Signature types stamped from a stored PNG rather than typed text.
_IMAGE_SIGNATURE_TYPES = (EsignSignatureType.DRAWN, EsignSignatureType.UPLOADED)


def _signature_font(typed_font: Optional[str]) -> tuple[str, Optional[str]]:
    """(fontname, fontfile) for a typed signature; base-14 italic as fallback."""
    slug = typed_font or _DEFAULT_TYPED_FONT
    path = _TYPED_FONT_FILES.get(slug)
    if path is not None and path.is_file():
        return slug, str(path)
    logger.warning("Typed signature font %r unavailable; falling back to Times-Italic", slug)
    return _FONT_SIGNATURE_FALLBACK, None


def _display_box(page: fitz.Page, pos_x: float, pos_y: float, width: float, height: float) -> fitz.Rect:
    """Fraction coords -> rect in rotation-aware display space (top-left origin)."""
    pw, ph = page.rect.width, page.rect.height
    return fitz.Rect(pos_x * pw, pos_y * ph, (pos_x + width) * pw, (pos_y + height) * ph)


def _derotate(page: fitz.Page, rect: fitz.Rect) -> fitz.Rect:
    """Display-space rect -> the unrotated rect PyMuPDF insert_* methods expect.

    Convention locked by test (see tests/test_esign_coordinates.py):
    page.rect is rotation-aware; insert_textbox/insert_image take unrotated
    coordinates plus rotate=page.rotation to keep content upright.
    """
    target = rect * page.derotation_matrix
    target.normalize()
    return target


def _display_rect(page: fitz.Page, pos_x: float, pos_y: float, width: float, height: float) -> fitz.Rect:
    return _derotate(page, _display_box(page, pos_x, pos_y, width, height))


def _fit_textbox(
    page: fitz.Page,
    box: fitz.Rect,
    text: str,
    *,
    fontname: str,
    rotate: int,
    max_fontsize: float,
    fontfile: Optional[str] = None,
    align: int = fitz.TEXT_ALIGN_LEFT,
) -> None:
    """Insert text sized to fit `box` (display space) and centered vertically.

    The field editor and signer previews center content inside the field box,
    so the flattened output must match; insert_textbox alone pins text to the
    top of the rect, which made stamps land visibly above where they were
    placed. Sizing is dry-run on a scratch page because insert_textbox's fit
    logic doesn't match Font metrics; its leftover return value is the exact
    unused box height, which is what centering needs.
    """
    target = _derotate(page, box)
    with fitz.open() as scratch:
        spage = scratch.new_page(width=page.mediabox.width, height=page.mediabox.height)
        if rotate:
            spage.set_rotation(rotate)
        fontsize = max(max_fontsize, 4.0)
        leftover = -1.0
        while fontsize >= 4:
            leftover = spage.insert_textbox(
                target,
                text,
                fontname=fontname,
                fontfile=fontfile,
                fontsize=fontsize,
                rotate=rotate,
                align=align,
            )
            if leftover >= 0:
                break
            fontsize -= 1
    if leftover < 0:
        # Overflows even at minimum size; anchor to the full box and let it spill.
        page.insert_textbox(target, text, fontname=fontname, fontfile=fontfile, fontsize=4, rotate=rotate, align=align)
        return
    centered = fitz.Rect(box.x0, box.y0 + leftover / 2.0, box.x1, box.y1)
    page.insert_textbox(
        _derotate(page, centered),
        text,
        fontname=fontname,
        fontfile=fontfile,
        fontsize=fontsize,
        rotate=rotate,
        align=align,
    )


def _initials_from_name(name: str) -> str:
    parts = [p for p in (name or "").split() if p]
    return "".join(p[0].upper() for p in parts[:3]) or "??"


def _stamp_field(
    page: fitz.Page,
    field: EsignField,
    recipient: Optional[EsignRecipient],
    signature_record: Optional[EsignSignatureRecord],
    image_bytes: Optional[bytes],
    attachment: Optional[EsignSignerAttachment] = None,
) -> None:
    box = _display_box(page, float(field.pos_x), float(field.pos_y), float(field.width), float(field.height))
    rotate = page.rotation
    # Field height as seen by the user (display space, rotation-aware page.rect).
    display_height = box.height

    if field.field_type in (EsignFieldType.SIGNATURE, EsignFieldType.INITIALS):
        if field.field_type == EsignFieldType.INITIALS:
            if image_bytes:
                # Signer adopted dedicated initials as an image.
                page.insert_image(_derotate(page, box), stream=image_bytes, rotate=rotate, keep_proportion=True)
                return
            # getattr: records adopted before the initials columns existed.
            text = (
                getattr(signature_record, "initials_text", None)
                if signature_record is not None
                else None
            ) or _initials_from_name(recipient.name if recipient else "")
            fontname, fontfile = _signature_font(
                signature_record.typed_font if signature_record is not None else None
            )
            _fit_textbox(page, box, text, fontname=fontname, fontfile=fontfile, rotate=rotate, max_fontsize=display_height * 0.8, align=fitz.TEXT_ALIGN_CENTER)
        elif signature_record is not None and signature_record.signature_type in _IMAGE_SIGNATURE_TYPES and image_bytes:
            page.insert_image(_derotate(page, box), stream=image_bytes, rotate=rotate, keep_proportion=True)
        elif signature_record is not None:
            text = signature_record.typed_text or (recipient.name if recipient else "")
            fontname, fontfile = _signature_font(signature_record.typed_font)
            _fit_textbox(page, box, text, fontname=fontname, fontfile=fontfile, rotate=rotate, max_fontsize=display_height * 0.7, align=fitz.TEXT_ALIGN_CENTER)
    elif field.field_type == EsignFieldType.CHECKBOX:
        if (field.value or "").lower() == "true":
            _fit_textbox(page, box, "X", fontname=_FONT_TEXT, rotate=rotate, max_fontsize=display_height * 0.9, align=fitz.TEXT_ALIGN_CENTER)
    elif field.field_type == EsignFieldType.RADIO:
        if (field.value or "").lower() == "true":
            target = _derotate(page, box)
            radius = min(target.width, target.height) * 0.35
            center = fitz.Point((target.x0 + target.x1) / 2, (target.y0 + target.y1) / 2)
            page.draw_circle(center, radius, color=(0, 0, 0), fill=(0, 0, 0), overlay=True)
    elif field.field_type == EsignFieldType.ATTACHMENT:
        if attachment is not None:
            _fit_textbox(
                page,
                box,
                f"Attachment: {attachment.original_filename}",
                fontname=_FONT_TEXT,
                rotate=rotate,
                max_fontsize=display_height * 0.55,
            )
    else:  # date_signed / text
        if field.value:
            _fit_textbox(page, box, str(field.value), fontname=_FONT_TEXT, rotate=rotate, max_fontsize=display_height * 0.7)


class EsignSealingService:
    def __init__(self) -> None:
        self.storage = get_storage_service()

    def _get_session(self) -> Session:
        return db_config.get_session()

    async def _flatten_document(
        self,
        document: EsignDocument,
        fields: list[EsignField],
        recipients_by_id: dict[str, EsignRecipient],
        signature_records_by_id: dict[str, EsignSignatureRecord],
        attachments_by_id: Optional[dict[str, EsignSignerAttachment]] = None,
    ) -> bytes:
        """Download the original PDF and stamp all field values in one pass."""
        import asyncio

        original = io.BytesIO()
        blob_bytes = await asyncio.to_thread(self._download_bytes, document.gcs_object_name)
        original.write(blob_bytes)

        image_cache: dict[str, bytes] = {}

        with fitz.open(stream=original.getvalue(), filetype="pdf") as pdf:
            for field in fields:
                if str(field.document_id) != str(document.id):
                    continue
                page_index = int(field.page_number)
                if page_index < 0 or page_index >= pdf.page_count:
                    logger.warning(
                        "Skipping field %s: page %s out of range for document %s",
                        field.id, page_index, document.id,
                    )
                    continue
                page = pdf[page_index]
                recipient = recipients_by_id.get(str(field.recipient_id))
                signature_record = None
                image_bytes = None
                if field.field_type in (EsignFieldType.SIGNATURE, EsignFieldType.INITIALS) and field.value:
                    signature_record = signature_records_by_id.get(str(field.value))
                    object_name = None
                    if signature_record is not None:
                        if field.field_type == EsignFieldType.INITIALS:
                            object_name = getattr(
                                signature_record, "initials_image_gcs_object_name", None
                            )
                        elif signature_record.signature_type in _IMAGE_SIGNATURE_TYPES:
                            object_name = signature_record.image_gcs_object_name
                    if object_name:
                        if object_name not in image_cache:
                            image_cache[object_name] = await asyncio.to_thread(
                                self._download_bytes, object_name
                            )
                        image_bytes = image_cache[object_name]
                attachment = (attachments_by_id or {}).get(str(field.value)) if field.value else None
                _stamp_field(page, field, recipient, signature_record, image_bytes, attachment)
            return pdf.tobytes(deflate=True, garbage=3)

    def _download_bytes(self, object_name: str) -> bytes:
        blob = self.storage.bucket.blob(object_name)
        return blob.download_as_bytes()

    def _seal_pdf(self, pdf_bytes: bytes, envelope: EsignEnvelope) -> tuple[bytes, dict[str, Any]]:
        """Apply the PAdES seal; returns (sealed_bytes, evidence_details).

        pyHanko's sign_pdf spins up its own event loop, so this must run in a
        worker thread when called from async code (see process_envelope_seal).
        """
        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        from pyhanko.sign import signers
        from pyhanko.sign.fields import SigSeedSubFilter

        from services.esign.kms_signer import build_seal_signer

        signer, evidence = build_seal_signer()
        buffer = io.BytesIO(pdf_bytes)
        writer = IncrementalPdfFileWriter(buffer)
        meta = signers.PdfSignatureMetadata(
            field_name=SEAL_FIELD_NAME,
            reason=f"CPAAutomation e-signature completion seal (envelope {envelope.id})",
            location="CPAAutomation",
            subfilter=SigSeedSubFilter.PADES,
            md_algorithm="sha256",
        )
        output = signers.sign_pdf(writer, meta, signer=signer)
        return output.getvalue(), evidence

    async def process_envelope_seal(self, envelope_id: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            acquire_envelope_lock(db, envelope_id)

            envelope = (
                db.query(EsignEnvelope)
                .options(
                    joinedload(EsignEnvelope.documents),
                    joinedload(EsignEnvelope.recipients),
                    joinedload(EsignEnvelope.fields),
                )
                .filter(EsignEnvelope.id == uuid.UUID(str(envelope_id)))
                .first()
            )
            if not envelope:
                return {"status": "not_found", "envelope_id": envelope_id}

            # Idempotency: duplicate Cloud Tasks delivery.
            if envelope.status == EsignEnvelopeStatus.COMPLETED and envelope.sealed_gcs_object_name:
                return {"status": "already_sealed", "envelope_id": envelope_id}
            if envelope.status not in (EsignEnvelopeStatus.IN_PROGRESS, EsignEnvelopeStatus.SENT):
                return {"status": f"skipped_status_{envelope.status.value}", "envelope_id": envelope_id}

            signers_list = [r for r in envelope.recipients if r.role == EsignRecipientRole.SIGNER]
            unsigned = [r for r in signers_list if r.status != EsignRecipientStatus.SIGNED]
            if unsigned:
                return {
                    "status": "not_ready",
                    "envelope_id": envelope_id,
                    "unsigned": [r.email for r in unsigned],
                }

            recipients_by_id = {str(r.id): r for r in envelope.recipients}
            signature_records = (
                db.query(EsignSignatureRecord)
                .filter(EsignSignatureRecord.envelope_id == envelope.id)
                .all()
            )
            signature_records_by_id = {str(s.id): s for s in signature_records}
            consent_records = (
                db.query(EsignConsentRecord)
                .filter(EsignConsentRecord.envelope_id == envelope.id)
                .all()
            )
            attachments = (
                db.query(EsignSignerAttachment)
                .filter(EsignSignerAttachment.envelope_id == envelope.id)
                .order_by(EsignSignerAttachment.uploaded_at.asc())
                .all()
            )
            attachments_by_id = {str(item.id): item for item in attachments}
            events = (
                db.query(EsignEvent)
                .filter(EsignEvent.envelope_id == envelope.id)
                .order_by(EsignEvent.created_at.asc())
                .all()
            )
            sender_email = envelope.user.email if envelope.user else ""

            documents = sorted(envelope.documents, key=lambda d: d.display_order)
            all_fields = list(envelope.fields or [])
            field_values = {str(field.id): field.value for field in all_fields}
            for field_id, result in compute_formulas(all_fields, field_values).items():
                field = next((item for item in all_fields if str(item.id) == field_id), None)
                if field is not None:
                    field.value = result or None
                    field_values[field_id] = field.value
            visible = resolve_visibility(all_fields, field_values)
            fields = [field for field in all_fields if visible.get(str(field.id), True)]

            # 1) Flatten each document and record flattened hashes.
            flattened: list[tuple[EsignDocument, bytes]] = []
            flattened_hashes: dict[str, str] = {}
            for document in documents:
                flat_bytes = await self._flatten_document(
                    document, fields, recipients_by_id, signature_records_by_id, attachments_by_id
                )
                digest = sha256_hex(flat_bytes)
                object_name = f"esign/{envelope.user_id}/{envelope.id}/flattened/{document.id}.pdf"
                await self.storage.upload_file_content(flat_bytes, object_name)
                document.flattened_gcs_object_name = object_name
                document.flattened_sha256 = digest
                flattened_hashes[str(document.id)] = digest
                flattened.append((document, flat_bytes))

            # 2) Certificate of completion (also stored standalone for download).
            certificate_bytes = build_certificate_pdf(
                envelope=envelope,
                documents=documents,
                recipients=envelope.recipients,
                consent_records=consent_records,
                signature_records=signature_records,
                events=events,
                sender_email=sender_email,
                flattened_hashes=flattened_hashes,
                attachments=attachments,
            )
            certificate_object = f"esign/{envelope.user_id}/{envelope.id}/certificate.pdf"
            await self.storage.upload_file_content(certificate_bytes, certificate_object)

            # 3) Combine flattened docs + certificate into the final PDF.
            combined = fitz.open()
            for _document, flat_bytes in flattened:
                with fitz.open(stream=flat_bytes, filetype="pdf") as part:
                    combined.insert_pdf(part)
            for attachment in attachments:
                attachment_bytes = await asyncio.to_thread(
                    self._download_bytes, attachment.gcs_object_name
                )
                if attachment.content_type == "application/pdf":
                    with fitz.open(stream=attachment_bytes, filetype="pdf") as attachment_pdf:
                        combined.insert_pdf(attachment_pdf)
                else:
                    page = combined.new_page(width=612, height=792)
                    margin = 36
                    page.insert_image(
                        fitz.Rect(margin, margin, 612 - margin, 792 - margin),
                        stream=attachment_bytes,
                        keep_proportion=True,
                    )
            with fitz.open(stream=certificate_bytes, filetype="pdf") as cert_pdf:
                combined.insert_pdf(cert_pdf)
            combined_bytes = combined.tobytes(deflate=True, garbage=3)
            combined.close()

            # 4) PAdES seal — the final byte-altering operation.
            sealed_bytes, seal_evidence = await asyncio.to_thread(
                self._seal_pdf, combined_bytes, envelope
            )
            sealed_sha = sha256_hex(sealed_bytes)
            sealed_object = f"esign/{envelope.user_id}/{envelope.id}/sealed.pdf"
            await self.storage.upload_file_content(sealed_bytes, sealed_object)

            # 5) Mark completed + audit. Only after the sealed object is durable.
            now = datetime.now(timezone.utc)
            envelope.sealed_gcs_object_name = sealed_object
            envelope.sealed_sha256 = sealed_sha
            envelope.certificate_gcs_object_name = certificate_object
            envelope.status = EsignEnvelopeStatus.COMPLETED
            envelope.completed_at = now

            audit_service.record_event(
                db,
                envelope_id=envelope.id,
                event_type=EsignEventType.SEALED,
                details={
                    **seal_evidence,
                    "sealed_sha256": sealed_sha,
                    "flattened_sha256": flattened_hashes,
                    "seal_field_name": SEAL_FIELD_NAME,
                },
            )
            audit_service.record_event(
                db,
                envelope_id=envelope.id,
                event_type=EsignEventType.COMPLETED,
                details={"completed_at": now.isoformat()},
            )
            db.commit()
            logger.info("Sealed envelope %s (sha256=%s)", envelope_id, sealed_sha)
        except Exception:
            db.rollback()
            logger.exception("Failed to seal envelope %s", envelope_id)
            raise
        finally:
            db.close()

        # Best-effort notifications after commit.
        try:
            from services.esign.signing_service import esign_signing_service

            await esign_signing_service.send_completion_emails(envelope_id)
        except Exception:
            logger.exception("Completion emails failed for envelope %s", envelope_id)

        return {"status": "sealed", "envelope_id": envelope_id, "sealed_sha256": sealed_sha}


esign_sealing_service = EsignSealingService()
