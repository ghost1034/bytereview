"""Standalone certificate of completion PDF for sealed e-sign envelopes."""

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
    EsignSignerAttachment,
)

_MUTED = colors.HexColor("#4b5563")
_BORDER = colors.HexColor("#d1d5db")
_HEADER_BG = colors.HexColor("#f3f4f6")

_FONT_DISPLAY_NAMES = {
    "dancing-script": "Dancing Script",
    "caveat": "Caveat",
    "great-vibes": "Great Vibes",
    "homemade-apple": "Homemade Apple",
}


def _signature_description(sig) -> str:
    kind = _enum_val(sig.signature_type)
    if kind == "typed":
        font = _FONT_DISPLAY_NAMES.get(sig.typed_font or "", sig.typed_font or "default")
        return f"Pre-selected style ({font}) — \"{sig.typed_text}\""
    if kind == "uploaded":
        return f"Uploaded image (SHA-256 {sig.image_sha256 or '—'})"
    return f"Drawn on device (image SHA-256 {sig.image_sha256 or '—'})"


def _initials_description(sig) -> str:
    # getattr: records adopted before the initials columns existed.
    initials_image_sha = getattr(sig, "initials_image_sha256", None)
    if initials_image_sha:
        return f"Adopted image (SHA-256 {initials_image_sha})"
    initials_text = getattr(sig, "initials_text", None)
    if initials_text:
        return f"\"{initials_text}\""
    return "—"


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
    attachments: Iterable[EsignSignerAttachment] = (),
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
    signed_ip_by_recipient = {
        str(getattr(e, "recipient_id", None)): e.ip_address
        for e in events
        if _enum_val(e.event_type) == "signed" and getattr(e, "recipient_id", None) is not None
    }
    signed_event_by_recipient = {
        str(getattr(e, "recipient_id", None)): e
        for e in events
        if _enum_val(e.event_type) == "signed" and getattr(e, "recipient_id", None) is not None
    }
    sender_name = ""
    sender_user = getattr(envelope, "user", None)
    if sender_user is not None:
        sender_name = (sender_user.display_name or "").strip()

    story = []
    story.append(Paragraph("Certificate of Completion", title_style))
    story.append(
        _para(
            "CPAAutomation E-Signature — tamper-evident record of electronic signing. "
            "All times are UTC.",
            small,
        )
    )
    story.append(Spacer(1, 10))

    # ------------------------------------------------------------------
    # Envelope summary
    # ------------------------------------------------------------------
    summary_rows = [
        [_para("Envelope ID", small), _para(str(envelope.id), mono)],
        [_para("Title", small), _para(envelope.title, body)],
        [
            _para("Sender", small),
            _para(f"{sender_name} <{sender_email}>" if sender_name else sender_email, body),
        ],
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

    attachment_list = list(attachments)
    if attachment_list:
        story.append(Paragraph("Signer Attachments", h2))
        attachment_rows = [[
            _para("Filename", small),
            _para("Uploader", small),
            _para("Size", small),
            _para("SHA-256", small),
        ]]
        recipients_by_id = {str(recipient.id): recipient for recipient in recipients}
        for attachment in attachment_list:
            uploader = recipients_by_id.get(str(attachment.recipient_id))
            attachment_rows.append([
                _para(attachment.original_filename, body),
                _para(f"{uploader.name} <{uploader.email}>" if uploader else "—", body),
                _para(f"{int(attachment.file_size_bytes):,} bytes", body),
                _para(attachment.sha256, mono),
            ])
        attachment_table = Table(attachment_rows, colWidths=[1.7 * inch, 2.2 * inch, 0.9 * inch, 2.0 * inch])
        attachment_table.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
            ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(attachment_table)

    # ------------------------------------------------------------------
    # Signers
    # ------------------------------------------------------------------
    story.append(Paragraph("Signature Events", h2))
    for recipient in recipients:
        if recipient.role not in (
            EsignRecipientRole.SIGNER,
            EsignRecipientRole.WITNESS,
            EsignRecipientRole.IN_PERSON_SIGNER,
        ):
            continue
        consent = consent_by_recipient.get(str(recipient.id))
        sig = signature_by_recipient.get(str(recipient.id))
        sig_desc = _signature_description(sig) if sig is not None else "—"
        initials_desc = _initials_description(sig) if sig is not None else "—"
        signed_ip = signed_ip_by_recipient.get(str(recipient.id))
        signed_event = signed_event_by_recipient.get(str(recipient.id))
        event_details = dict(getattr(signed_event, "details", None) or {})
        access_method = event_details.get("access_method")
        if recipient.role == EsignRecipientRole.IN_PERSON_SIGNER:
            security_level = "Verified host account; signer identity self-declared during hosted handoff"
        elif access_method == "email_link":
            security_level = "Secure link delivered to the recipient email address; no CPAAutomation account required"
        elif getattr(signed_event, "mfa_verified", False):
            security_level = "CPAAutomation account authentication with recorded phone MFA"
        else:
            security_level = "CPAAutomation account authentication"
        rows = [
            [_para("Role", small), _para(_enum_val(recipient.role).replace("_", " ").title(), body)],
            [_para("Signer", small), _para(f"{recipient.name or 'Self-declared guest'} <{recipient.email or 'guest'}>", body)],
            [
                _para("Security level", small),
                _para(
                    security_level,
                    body,
                ),
            ],
            [_para("Routing order", small), _para(str(recipient.routing_order), body)],
            [_para("Sent", small), _para(_fmt_dt(envelope.sent_at), body)],
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
            [
                _para("Signed", small),
                _para(
                    f"{_fmt_dt(recipient.signed_at)}"
                    + (f" — from IP {signed_ip}" if signed_ip else ""),
                    body,
                ),
            ],
            [_para("Signature adopted", small), _para(sig_desc, body)],
            [_para("Initials adopted", small), _para(initials_desc, body)],
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

    action_recipients = [
        recipient for recipient in recipients
        if recipient.role not in (
            EsignRecipientRole.SIGNER, EsignRecipientRole.WITNESS,
            EsignRecipientRole.IN_PERSON_SIGNER, EsignRecipientRole.CC,
        )
    ]
    if action_recipients:
        story.append(Paragraph("Routing Action Events", h2))
        action_rows = [[
            _para("Recipient", small), _para("Role", small), _para("Status", small),
            _para("Completed", small), _para("Routing order", small),
        ]]
        for recipient in action_recipients:
            action_rows.append([
                _para(f"{recipient.name or recipient.role_label or 'Placeholder'} <{recipient.email or '—'}>", body),
                _para(_enum_val(recipient.role).replace("_", " ").title(), body),
                _para(_enum_val(recipient.status), body),
                _para(_fmt_dt(recipient.action_completed_at), body),
                _para(str(recipient.routing_order), body),
            ])
        action_table = Table(action_rows, colWidths=[2.4 * inch, 1.25 * inch, 1.0 * inch, 1.45 * inch, 0.75 * inch])
        action_table.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
            ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(action_table)

    # ------------------------------------------------------------------
    # Carbon copy recipients
    # ------------------------------------------------------------------
    cc_recipients = [r for r in recipients if r.role == EsignRecipientRole.CC]
    if cc_recipients:
        story.append(Paragraph("Carbon Copy Recipients", h2))
        cc_rows = [
            [
                _para("Recipient", small),
                _para("Routing order", small),
                _para("Status", small),
                _para("Viewed", small),
            ]
        ]
        for recipient in cc_recipients:
            cc_rows.append(
                [
                    _para(f"{recipient.name} <{recipient.email}>", body),
                    _para(str(recipient.routing_order), body),
                    _para(_enum_val(recipient.status), body),
                    _para(_fmt_dt(recipient.viewed_at), body),
                ]
            )
        cc_table = Table(cc_rows, colWidths=[3.4 * inch, 1.0 * inch, 1.0 * inch, 1.4 * inch])
        cc_table.setStyle(
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
        story.append(cc_table)

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
            "used the access method recorded above, consented to electronic records, and explicitly "
            "adopted their signature. "
            "The completed signed PDF carries an embedded PAdES digital signature; any modification "
            "after completion invalidates that signature. This certificate is retained as a separate "
            "record. Verify the signed PDF at any time "
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
