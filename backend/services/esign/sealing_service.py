"""Async sealing pipeline for completed e-sign envelopes.

Runs on the io-tasks queue after the last signer submits:
1. Advisory lock + idempotency guard (Cloud Tasks may deliver twice).
2. Flatten all field values into each PDF with PyMuPDF (single pass).
3. Generate and store the certificate of completion as a separate PDF.
4. Combine the flattened documents and signer attachments, then apply the
   PAdES digital signature via Cloud KMS (pyHanko).
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
from services.esign.routing_engine import incomplete_blocking
from services.esign.field_logic import compute_formulas, resolve_display_value, resolve_visibility
from services.esign.outbox_service import esign_outbox_service
from services.gcs_service import get_storage_service

logger = logging.getLogger(__name__)

SEAL_FIELD_NAME = "CPAAutomationSeal"

# PyMuPDF base-14 font aliases
_FONT_TEXT = "helv"
_FONT_SIGNATURE_FALLBACK = "tiit"  # Times-Italic, if the script font file is missing
_TEXTBOX_FIT_TOLERANCE = 0.01  # PDF points; avoids exact-fit rounding dropping text

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
    vertical_align: str = "middle",
    color: tuple[float, float, float] = (0, 0, 0),
    underline: bool = False,
) -> None:
    """Insert text sized to fit `box` (display space) and align it vertically.

    The flattened output uses the same vertical placement selected in the field
    editor and shown in the signer preview.
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
                color=color,
            )
            if leftover >= 0:
                break
            fontsize -= 1
    if leftover < 0:
        # Overflows even at minimum size; anchor to the full box and let it spill.
        page.insert_textbox(target, text, fontname=fontname, fontfile=fontfile, fontsize=4, rotate=rotate, align=align, color=color)
        return
    vertical_offset = (
        0.0 if vertical_align == "top" else
        max(0.0, leftover - _TEXTBOX_FIT_TOLERANCE) if vertical_align == "bottom" else
        leftover / 2.0
    )
    placed_box = fitz.Rect(box.x0, box.y0 + vertical_offset, box.x1, box.y1)
    page.insert_textbox(
        _derotate(page, placed_box),
        text,
        fontname=fontname,
        fontfile=fontfile,
        fontsize=fontsize,
        rotate=rotate,
        align=align,
        color=color,
    )
    if underline:
        # Derotating and normalizing the field rectangle loses which edge is
        # visually "below" the text.  On rotated pages that made a nominally
        # horizontal underline vertical (90 / 270 degrees) or put it above the
        # text (180 degrees).  Lay the same text out on an otherwise-empty page
        # and use its extracted baselines, which stay in PyMuPDF's unrotated
        # coordinate space and therefore preserve both rotation and wrapping.
        with fitz.open() as scratch:
            spage = scratch.new_page(width=page.mediabox.width, height=page.mediabox.height)
            try:
                spage.set_cropbox(page.cropbox)
            except ValueError:
                # A malformed/non-standard CropBox should not prevent the
                # signed value itself from being flattened.
                pass
            if rotate:
                spage.set_rotation(rotate)
            spage.insert_textbox(
                _derotate(spage, placed_box),
                text,
                fontname=fontname,
                fontfile=fontfile,
                fontsize=fontsize,
                rotate=rotate,
                align=align,
                color=color,
            )
            for block in spage.get_text("dict").get("blocks", []):
                for line in block.get("lines", []):
                    direction = fitz.Point(*line.get("dir", (1.0, 0.0)))
                    down = fitz.Point(-direction.y, direction.x)
                    for span in line.get("spans", []):
                        if not span.get("text"):
                            continue
                        origin = fitz.Point(*span["origin"])
                        span_box = fitz.Rect(span["bbox"])
                        projections = [
                            corner.x * direction.x + corner.y * direction.y
                            for corner in (
                                span_box.top_left,
                                span_box.top_right,
                                span_box.bottom_left,
                                span_box.bottom_right,
                            )
                        ]
                        advance = max(projections) - min(projections)
                        offset = max(0.5, float(span.get("size") or fontsize) * 0.08)
                        start = origin + down * offset
                        end = start + direction * advance
                        page.draw_line(
                            start,
                            end,
                            color=color,
                            width=max(0.4, min(1.0, float(span.get("size") or fontsize) * 0.05)),
                            overlay=True,
                        )


def _aligned_content_box(
    box: fitz.Rect,
    content_width: float,
    content_height: float,
    horizontal_align: str,
    vertical_align: str,
    *,
    allow_upscale: bool = True,
) -> fitz.Rect:
    """Fit content proportionally in a display-space field box and align it."""
    if content_width <= 0 or content_height <= 0:
        return box
    scale = min(box.width / content_width, box.height / content_height)
    if not allow_upscale:
        scale = min(scale, 1.0)
    width, height = content_width * scale, content_height * scale
    x0 = (
        box.x0 if horizontal_align == "left" else
        box.x1 - width if horizontal_align == "right" else
        box.x0 + (box.width - width) / 2.0
    )
    y0 = (
        box.y0 if vertical_align == "top" else
        box.y1 - height if vertical_align == "bottom" else
        box.y0 + (box.height - height) / 2.0
    )
    return fitz.Rect(x0, y0, x0 + width, y0 + height)


def _insert_aligned_image(
    page: fitz.Page,
    box: fitz.Rect,
    image_bytes: bytes,
    *,
    rotate: int,
    horizontal_align: str,
    vertical_align: str,
) -> None:
    try:
        pixmap = fitz.Pixmap(image_bytes)
        target_box = _aligned_content_box(
            box, pixmap.width, pixmap.height, horizontal_align, vertical_align
        )
    except (RuntimeError, ValueError):
        target_box = box
    page.insert_image(
        _derotate(page, target_box),
        stream=image_bytes,
        rotate=rotate,
        keep_proportion=True,
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
    date_format: str = "MM/DD/YYYY",
) -> None:
    box = _display_box(page, float(field.pos_x), float(field.pos_y), float(field.width), float(field.height))
    rotate = page.rotation
    # Field height as seen by the user (display space, rotation-aware page.rect).
    display_height = box.height
    properties = getattr(field, "properties", None) or {}
    appearance = dict(properties.get("appearance") or {})
    text_like = field.field_type not in (
        EsignFieldType.SIGNATURE, EsignFieldType.INITIALS, EsignFieldType.STAMP,
        EsignFieldType.CHECKBOX, EsignFieldType.RADIO, EsignFieldType.ATTACHMENT,
    )
    horizontal_align = str(appearance.get("alignment") or ("left" if text_like else "center"))
    vertical_align = str(appearance.get("vertical_alignment") or "middle")
    pdf_alignment = {
        "left": fitz.TEXT_ALIGN_LEFT,
        "center": fitz.TEXT_ALIGN_CENTER,
        "right": fitz.TEXT_ALIGN_RIGHT,
    }.get(horizontal_align, fitz.TEXT_ALIGN_LEFT)

    if field.field_type in (EsignFieldType.SIGNATURE, EsignFieldType.INITIALS, EsignFieldType.STAMP):
        if field.field_type == EsignFieldType.INITIALS:
            if image_bytes:
                # Signer adopted dedicated initials as an image.
                _insert_aligned_image(page, box, image_bytes, rotate=rotate, horizontal_align=horizontal_align, vertical_align=vertical_align)
                return
            # getattr: records adopted before the initials columns existed.
            text = (
                getattr(signature_record, "initials_text", None)
                if signature_record is not None
                else None
            ) or _initials_from_name(recipient.name if recipient else "")
            fontname, fontfile = _signature_font(
                (
                    getattr(signature_record, "initials_typed_font", None)
                    or signature_record.typed_font
                ) if signature_record is not None else None
            )
            _fit_textbox(page, box, text, fontname=fontname, fontfile=fontfile, rotate=rotate, max_fontsize=display_height * 0.8, align=pdf_alignment, vertical_align=vertical_align)
        elif field.field_type == EsignFieldType.STAMP:
            if image_bytes:
                _insert_aligned_image(page, box, image_bytes, rotate=rotate, horizontal_align=horizontal_align, vertical_align=vertical_align)
            # A schema-v2 stamp is always an image. No typed/signature fallback
            # is performed here; legacy records are mapped to signature bytes
            # by the loader below.
        elif signature_record is not None and signature_record.signature_type in _IMAGE_SIGNATURE_TYPES and image_bytes:
            _insert_aligned_image(page, box, image_bytes, rotate=rotate, horizontal_align=horizontal_align, vertical_align=vertical_align)
        elif signature_record is not None:
            text = signature_record.typed_text or (recipient.name if recipient else "")
            fontname, fontfile = _signature_font(signature_record.typed_font)
            _fit_textbox(page, box, text, fontname=fontname, fontfile=fontfile, rotate=rotate, max_fontsize=display_height * 0.7, align=pdf_alignment, vertical_align=vertical_align)
    elif field.field_type == EsignFieldType.CHECKBOX:
        if (field.value or "").lower() == "true":
            _fit_textbox(page, box, "X", fontname=_FONT_TEXT, rotate=rotate, max_fontsize=display_height * 0.9, align=pdf_alignment, vertical_align=vertical_align)
    elif field.field_type == EsignFieldType.RADIO:
        if (field.value or "").lower() == "true":
            diameter = min(box.width, box.height) * 0.7
            target = _derotate(page, _aligned_content_box(
                box,
                diameter,
                diameter,
                horizontal_align,
                vertical_align,
                allow_upscale=False,
            ))
            radius = min(target.width, target.height) / 2.0
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
                align=pdf_alignment,
                vertical_align=vertical_align,
            )
    else:
        display_value = resolve_display_value(
            field, field.value, recipient=recipient, date_format=date_format
        )
        if display_value:
            bold, italic = bool(appearance.get("bold")), bool(appearance.get("italic"))
            family = str(appearance.get("font") or "Helvetica").lower()
            aliases = (
                ("tibi", "tibo", "tiit", "tiro") if "times" in family else
                ("cobi", "cobo", "coit", "cour") if "courier" in family else
                ("hebi", "hebo", "heit", _FONT_TEXT)
            )
            fontname = aliases[0] if bold and italic else aliases[1] if bold else aliases[2] if italic else aliases[3]
            raw_color = str(appearance.get("color") or "#000000").lstrip("#")
            color = tuple(int(raw_color[index:index + 2], 16) / 255 for index in (0, 2, 4)) if len(raw_color) == 6 else (0, 0, 0)
            requested_size = appearance.get("font_size")
            _fit_textbox(
                page, box, display_value, fontname=fontname, rotate=rotate,
                max_fontsize=min(float(requested_size), display_height * 0.9) if requested_size else display_height * 0.7,
                align=pdf_alignment, vertical_align=vertical_align,
                color=color, underline=bool(appearance.get("underline")),
            )


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
        date_format: str = "MM/DD/YYYY",
    ) -> bytes:
        """Download the original PDF and stamp all field values in one pass."""
        import asyncio

        original = io.BytesIO()
        blob_bytes = await asyncio.to_thread(self._download_bytes, document.gcs_object_name)
        original.write(blob_bytes)

        image_cache: dict[str, bytes] = {}

        with fitz.open(stream=original.getvalue(), filetype="pdf") as pdf:
            # Bake AcroForm appearances and remove every interactive widget
            # before our deterministic single-pass stamping and PAdES seal.
            try:
                pdf.bake(annots=True, widgets=True)
            except (AttributeError, TypeError):
                for source_page in pdf:
                    for widget in list(source_page.widgets() or []):
                        source_page.delete_widget(widget)
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
                if field.field_type in (EsignFieldType.SIGNATURE, EsignFieldType.INITIALS, EsignFieldType.STAMP) and field.value:
                    signature_record = signature_records_by_id.get(str(field.value))
                    object_name = None
                    if signature_record is not None:
                        if field.field_type == EsignFieldType.INITIALS:
                            object_name = getattr(
                                signature_record, "initials_image_gcs_object_name", None
                            )
                        elif field.field_type == EsignFieldType.STAMP:
                            object_name = getattr(signature_record, "stamp_image_gcs_object_name", None)
                            # Compatibility for records sealed before schema v2.
                            if not object_name and getattr(signature_record, "stamp_type", None) is None:
                                object_name = signature_record.image_gcs_object_name
                        elif signature_record.signature_type in _IMAGE_SIGNATURE_TYPES:
                            object_name = signature_record.image_gcs_object_name
                    if object_name:
                        if object_name not in image_cache:
                            image_cache[object_name] = await asyncio.to_thread(
                                self._download_bytes, object_name
                            )
                        image_bytes = image_cache[object_name]
                attachment = (attachments_by_id or {}).get(str(field.value)) if field.value else None
                _stamp_field(
                    page, field, recipient, signature_record, image_bytes,
                    attachment, date_format,
                )
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

            unsigned = incomplete_blocking(envelope.recipients)
            if unsigned:
                return {
                    "status": "not_ready",
                    "envelope_id": envelope_id,
                    "unsigned": [r.email or r.name or str(r.id) for r in unsigned],
                }

            esign_outbox_service.mark_seal_processing(db, envelope)

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
                    document, fields, recipients_by_id, signature_records_by_id,
                    attachments_by_id,
                    getattr(envelope, "date_format", None) or "MM/DD/YYYY",
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

            # 3) Combine flattened docs and signer attachments into the final PDF.
            # The certificate remains a separate download and is intentionally
            # not appended to the signed document.
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
            esign_outbox_service.mark_seal_completed(db, envelope)
            from services.esign.signing_service import esign_signing_service
            esign_signing_service.queue_completion_emails(db, envelope)
            db.commit()
            logger.info("Sealed envelope %s (sha256=%s)", envelope_id, sealed_sha)
        except Exception as exc:
            db.rollback()
            logger.exception("Failed to seal envelope %s", envelope_id)
            esign_outbox_service.mark_seal_failed(envelope_id, exc)
            raise
        finally:
            db.close()

        await esign_outbox_service.deliver_due_emails(envelope_id=envelope_id)

        return {"status": "sealed", "envelope_id": envelope_id, "sealed_sha256": sealed_sha}


esign_sealing_service = EsignSealingService()
