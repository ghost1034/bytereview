"""Certificate of completion PDF for sealed e-sign envelopes (reportlab).

The certificate is appended to the combined document *before* the PAdES seal
is applied, so it is covered by the tamper-evident signature.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Iterable

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from models.db_models import (
    EsignConsentRecord,
    EsignDocument,
    EsignEnvelope,
    EsignEvent,
    EsignRecipient,
    EsignRecipientRole,
    EsignSignatureRecord,
)

_MUTED = colors.HexColor("#4b5563")
_BORDER = colors.HexColor("#d1d5db")
_HEADER_BG = colors.HexColor("#f3f4f6")


def _fmt_dt(value) -> str:
    if not value:
        return "—"
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    return str(value)


def _enum_val(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _para(text: str, style) -> Paragraph:
    safe = (text or "—").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(safe, style)


def build_certificate_pdf(
    *,
    envelope: EsignEnvelope,
    documents: Iterable[EsignDocument],
    recipients: Iterable[EsignRecipient],
    consent_records: Iterable[EsignConsentRecord],
    signature_records: Iterable[EsignSignatureRecord],
    events: Iterable[EsignEvent],
    sender_email: str,
    flattened_hashes: dict[str, str],
) -> bytes:
    """Render the certificate of completion as PDF bytes."""
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("CertTitle", parent=styles["Title"], fontSize=18, spaceAfter=4)
    h2 = ParagraphStyle("CertH2", parent=styles["Heading2"], fontSize=12, spaceBefore=14, spaceAfter=6)
    body = ParagraphStyle("CertBody", parent=styles["BodyText"], fontSize=8.5, leading=11)
    small = ParagraphStyle("CertSmall", parent=body, fontSize=7.5, leading=9.5, textColor=_MUTED)
    mono = ParagraphStyle("CertMono", parent=body, fontName="Courier", fontSize=7, leading=9)

    consent_by_recipient = {str(c.recipient_id): c for c in consent_records}
    signature_by_recipient = {str(s.recipient_id): s for s in signature_records}

    story = []
    story.append(Paragraph("Certificate of Completion", title_style))
    story.append(_para("CPAAutomation E-Signature — tamper-evident record of electronic signing", small))
    story.append(Spacer(1, 10))

    # ------------------------------------------------------------------
    # Envelope summary
    # ------------------------------------------------------------------
    summary_rows = [
        [_para("Envelope ID", small), _para(str(envelope.id), mono)],
        [_para("Title", small), _para(envelope.title, body)],
        [_para("Sender", small), _para(sender_email, body)],
        [_para("Status", small), _para("Completed", body)],
        [_para("Sent", small), _para(_fmt_dt(envelope.sent_at), body)],
        [_para("Completed", small), _para(_fmt_dt(datetime.now(timezone.utc)), body)],
        [_para("Signing order", small), _para(_enum_val(envelope.signing_type), body)],
    ]
    summary = Table(summary_rows, colWidths=[1.4 * inch, 5.4 * inch])
    summary.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
                ("BACKGROUND", (0, 0), (0, -1), _HEADER_BG),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(summary)

    # ------------------------------------------------------------------
    # Documents + integrity hashes
    # ------------------------------------------------------------------
    story.append(Paragraph("Documents and Integrity Hashes (SHA-256)", h2))
    doc_rows = [[_para("Document", small), _para("Original SHA-256", small), _para("Flattened SHA-256", small)]]
    for doc in documents:
        doc_rows.append(
            [
                _para(doc.original_filename, body),
                _para(doc.original_sha256, mono),
                _para(flattened_hashes.get(str(doc.id), doc.flattened_sha256 or "—"), mono),
            ]
        )
    doc_table = Table(doc_rows, colWidths=[1.8 * inch, 2.5 * inch, 2.5 * inch])
    doc_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
                ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(doc_table)
    story.append(
        _para(
            "The 'original' hash covers each PDF exactly as uploaded by the sender. The 'flattened' hash "
            "covers the document after signature and field values were stamped. This certificate is "
            "appended to the combined document before the digital seal is applied, so it is protected by "
            "the same tamper-evident signature.",
            small,
        )
    )

    # ------------------------------------------------------------------
    # Signers
    # ------------------------------------------------------------------
    story.append(Paragraph("Signer Events", h2))
    for recipient in recipients:
        if recipient.role != EsignRecipientRole.SIGNER:
            continue
        consent = consent_by_recipient.get(str(recipient.id))
        sig = signature_by_recipient.get(str(recipient.id))
        sig_desc = "—"
        if sig is not None:
            kind = _enum_val(sig.signature_type)
            if kind == "typed":
                sig_desc = f"Typed (\"{sig.typed_text}\", font {sig.typed_font or 'default'})"
            else:
                sig_desc = f"Drawn (image SHA-256 {sig.image_sha256 or '—'})"
        rows = [
            [_para("Signer", small), _para(f"{recipient.name} <{recipient.email}>", body)],
            [_para("Identity verification", small), _para("CPAAutomation account login + SMS phone MFA (Firebase)", body)],
            [_para("Routing order", small), _para(str(recipient.routing_order), body)],
            [_para("Viewed", small), _para(_fmt_dt(recipient.viewed_at), body)],
            [
                _para("ESIGN consent", small),
                _para(
                    f"{_fmt_dt(consent.consented_at)} — IP {consent.ip_address or '—'} — disclosure SHA-256 {consent.consent_text_sha256}"
                    if consent
                    else "—",
                    body,
                ),
            ],
            [_para("Signed", small), _para(_fmt_dt(recipient.signed_at), body)],
            [_para("Signature adopted", small), _para(sig_desc, body)],
        ]
        table = Table(rows, colWidths=[1.4 * inch, 5.4 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
                    ("BACKGROUND", (0, 0), (0, -1), _HEADER_BG),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(table)
        story.append(Spacer(1, 8))

    # ------------------------------------------------------------------
    # Full event history
    # ------------------------------------------------------------------
    story.append(Paragraph("Complete Audit Trail", h2))
    event_rows = [
        [
            _para("Time (UTC)", small),
            _para("Event", small),
            _para("Actor", small),
            _para("IP address", small),
            _para("MFA", small),
        ]
    ]
    for event in events:
        mfa = "phone" if event.mfa_verified else ("—" if event.mfa_verified is None else "no")
        event_rows.append(
            [
                _para(_fmt_dt(event.created_at), body),
                _para(_enum_val(event.event_type), body),
                _para(event.actor_email or "system", body),
                _para(event.ip_address or "—", body),
                _para(mfa, body),
            ]
        )
    event_table = Table(
        event_rows, colWidths=[1.5 * inch, 1.1 * inch, 2.2 * inch, 1.2 * inch, 0.8 * inch], repeatRows=1
    )
    event_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
                ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(event_table)

    story.append(Spacer(1, 12))
    story.append(
        _para(
            "This envelope was executed electronically under the U.S. ESIGN Act and UETA. Each signer "
            "authenticated with a CPAAutomation account protected by SMS multi-factor authentication, "
            "consented to electronic records before viewing, and explicitly adopted their signature. "
            "The combined document (including this certificate) carries an embedded PAdES digital "
            "signature; any modification after completion invalidates that signature. Verify at any time "
            "in CPAAutomation under E-Signature → Verify.",
            small,
        )
    )

    buffer = io.BytesIO()
    doc_template = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        title=f"Certificate of Completion — {envelope.title}",
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
    )
    doc_template.build(story)
    return buffer.getvalue()
