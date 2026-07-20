"""Branded email content for every e-sign notification.

Each builder is a pure function returning an EmailContent(subject, html, text)
so copy can be unit-tested without touching Gmail. All HTML shares one inline-
CSS shell (header, primary action button, sender message block) so every
notification reads as the same product.
"""

from __future__ import annotations

import html as html_lib
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

_BRAND = "CPAAutomation E-Signature"
_ACCENT = "#1d4ed8"
_TEXT = "#1f2937"
_MUTED = "#6b7280"
_BORDER = "#e5e7eb"


@dataclass(frozen=True)
class EmailContent:
    subject: str
    html: str
    text: str


def _esc(value: Optional[str]) -> str:
    return html_lib.escape(value or "")


def _fmt_date(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    return value.strftime("%B %-d, %Y")


def _shell(
    *,
    heading: str,
    body_paragraphs: list[str],
    button_label: Optional[str] = None,
    button_url: Optional[str] = None,
    quoted_message: Optional[str] = None,
    footer_note: Optional[str] = None,
) -> str:
    """Shared HTML shell. body_paragraphs are pre-escaped HTML strings."""
    paragraphs = "".join(
        f'<p style="margin:0 0 14px 0;font-size:14px;line-height:21px;color:{_TEXT};">{p}</p>'
        for p in body_paragraphs
    )
    quote = ""
    if quoted_message:
        quote = (
            f'<blockquote style="margin:0 0 14px 0;padding:10px 14px;border-left:3px solid {_ACCENT};'
            f'background:#f9fafb;font-size:14px;line-height:21px;color:{_TEXT};white-space:pre-wrap;">'
            f"{_esc(quoted_message)}</blockquote>"
        )
    button = ""
    if button_label and button_url:
        button = (
            f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px 0;"><tr><td '
            f'style="border-radius:6px;background:{_ACCENT};">'
            f'<a href="{_esc(button_url)}" style="display:inline-block;padding:11px 26px;font-size:14px;'
            f'font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">{_esc(button_label)}</a>'
            f"</td></tr></table>"
            f'<p style="margin:0 0 14px 0;font-size:12px;line-height:18px;color:{_MUTED};">'
            f"Or open this link: <a href=\"{_esc(button_url)}\" style=\"color:{_ACCENT};\">{_esc(button_url)}</a></p>"
        )
    footer = ""
    if footer_note:
        footer = (
            f'<p style="margin:0 0 6px 0;font-size:12px;line-height:18px;color:{_MUTED};">{footer_note}</p>'
        )
    return f"""\
<div style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid {_BORDER};border-radius:8px;overflow:hidden;">
    <div style="padding:16px 28px;border-bottom:1px solid {_BORDER};">
      <span style="font-size:15px;font-weight:700;color:{_TEXT};">CPAAutomation</span>
      <span style="font-size:12px;color:{_MUTED};"> · E-Signature</span>
    </div>
    <div style="padding:26px 28px 18px 28px;">
      <h1 style="margin:0 0 16px 0;font-size:18px;line-height:26px;color:{_TEXT};">{heading}</h1>
      {quote}
      {paragraphs}
      {button}
      {footer}
    </div>
    <div style="padding:14px 28px;border-top:1px solid {_BORDER};background:#f9fafb;">
      <p style="margin:0;font-size:11px;line-height:16px;color:{_MUTED};">
        Sent by {_BRAND}. Do not forward this email — the link above is intended only for the recipient.
      </p>
    </div>
  </div>
</div>"""


def _text_body(lines: list[str]) -> str:
    return "\n".join(lines) + f"\n\n— {_BRAND}"


def _expires_line(expires_at: Optional[datetime]) -> Optional[str]:
    date = _fmt_date(expires_at)
    return f"This envelope expires on {date}." if date else None


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def signature_request(
    *,
    recipient_name: str,
    sender_name: str,
    title: str,
    message: Optional[str],
    url: str,
    expires_at: Optional[datetime] = None,
    reminder: bool = False,
) -> EmailContent:
    prefix = "Reminder: " if reminder else ""
    subject = f"{prefix}{sender_name} sent you a document to review and sign"
    expires = _expires_line(expires_at)
    auth_note = (
        "This secure link is intended only for you. You do not need a CPAAutomation account; "
        "do not forward the email or share the link."
    )
    body = [
        f"{_esc(sender_name)} has requested your electronic signature on <strong>{_esc(title)}</strong>.",
    ]
    if expires:
        body.append(_esc(expires))
    html = _shell(
        heading=f"Hello {_esc(recipient_name)},",
        body_paragraphs=body,
        quoted_message=message,
        button_label="Review Documents",
        button_url=url,
        footer_note=_esc(auth_note),
    )
    text_lines = [
        f"Hello {recipient_name},",
        "",
        f"{sender_name} has requested your electronic signature on \"{title}\".",
    ]
    if message:
        text_lines += ["", "Message from the sender:", message]
    text_lines += ["", f"Review and sign here:", url]
    if expires:
        text_lines += ["", expires]
    text_lines += ["", auth_note]
    return EmailContent(subject, html, _text_body(text_lines))


def cc_copy(
    *,
    recipient_name: str,
    sender_name: str,
    title: str,
    message: Optional[str],
    url: str,
    expires_at: Optional[datetime] = None,
) -> EmailContent:
    subject = f"{sender_name} sent you a copy: {title}"
    expires = _expires_line(expires_at)
    body = [
        f"{_esc(sender_name)} sent <strong>{_esc(title)}</strong> for electronic signature and "
        f"added you as a copy recipient. No action is needed from you — you can view the "
        f"documents at any time, and you will receive the completed copy once all parties have signed.",
    ]
    if expires:
        body.append(_esc(expires))
    html = _shell(
        heading=f"Hello {_esc(recipient_name)},",
        body_paragraphs=body,
        quoted_message=message,
        button_label="View Documents",
        button_url=url,
    )
    text_lines = [
        f"Hello {recipient_name},",
        "",
        f"{sender_name} sent \"{title}\" for electronic signature and added you as a copy "
        f"recipient. No action is needed from you.",
        "",
        f"View the documents here:",
        url,
    ]
    if message:
        text_lines += ["", "Message from the sender:", message]
    if expires:
        text_lines += ["", expires]
    return EmailContent(subject, html, _text_body(text_lines))


def recipient_signed(
    *,
    signer_name: str,
    signer_email: str,
    title: str,
    url: str,
) -> EmailContent:
    subject = f"{signer_name} signed \"{title}\""
    html = _shell(
        heading="A recipient has signed",
        body_paragraphs=[
            f"{_esc(signer_name)} ({_esc(signer_email)}) signed <strong>{_esc(title)}</strong>.",
            "You can follow the envelope's progress on its detail page.",
        ],
        button_label="View Envelope",
        button_url=url,
    )
    text = _text_body(
        [
            "Hello,",
            "",
            f"{signer_name} ({signer_email}) signed \"{title}\".",
            "",
            "Follow the envelope's progress here:",
            url,
        ]
    )
    return EmailContent(subject, html, text)


def completed(
    *,
    title: str,
    url: str,
    is_sender: bool,
) -> EmailContent:
    subject = f"Completed: {title}"
    seal_note = (
        "The sealed PDF carries an embedded digital signature — any modification after "
        "completion will invalidate it."
    )
    if is_sender:
        lead = (
            f"All parties have signed <strong>{_esc(title)}</strong>. The completed, digitally "
            f"sealed document and its certificate of completion are ready."
        )
        text_lead = f"All parties have signed \"{title}\". The completed, digitally sealed document and its certificate of completion are ready."
    else:
        lead = (
            f"You're all set — every party has signed <strong>{_esc(title)}</strong>. Your copy of "
            f"the sealed document and the certificate of completion are ready to download."
        )
        text_lead = f"You're all set — every party has signed \"{title}\". Your copy of the sealed document and the certificate of completion are ready to download."
    html = _shell(
        heading="Your document has been completed",
        body_paragraphs=[lead, _esc(seal_note)],
        button_label="View Completed Documents",
        button_url=url,
    )
    text = _text_body(["Hello,", "", text_lead, "", "View the completed documents here:", url, "", seal_note])
    return EmailContent(subject, html, text)


def voided(
    *,
    sender_name: str,
    title: str,
    reason: str,
) -> EmailContent:
    subject = f"{sender_name} voided \"{title}\""
    html = _shell(
        heading="Envelope voided",
        body_paragraphs=[
            f"The envelope <strong>{_esc(title)}</strong> has been voided by {_esc(sender_name)} "
            f"and can no longer be signed.",
            f"<strong>Reason:</strong> {_esc(reason)}",
        ],
    )
    text = _text_body(
        [
            "Hello,",
            "",
            f"The envelope \"{title}\" has been voided by {sender_name} and can no longer be signed.",
            "",
            f"Reason: {reason}",
        ]
    )
    return EmailContent(subject, html, text)


def declined(
    *,
    decliner_name: str,
    decliner_email: str,
    title: str,
    reason: str,
) -> EmailContent:
    subject = f"{decliner_name} declined \"{title}\""
    html = _shell(
        heading="Envelope declined",
        body_paragraphs=[
            f"{_esc(decliner_name)} ({_esc(decliner_email)}) declined to sign "
            f"<strong>{_esc(title)}</strong>. The envelope is closed and no further signatures "
            f"can be collected.",
            f"<strong>Reason:</strong> {_esc(reason)}",
        ],
    )
    text = _text_body(
        [
            "Hello,",
            "",
            f"{decliner_name} ({decliner_email}) declined to sign \"{title}\". The envelope is "
            f"closed and no further signatures can be collected.",
            "",
            f"Reason: {reason}",
        ]
    )
    return EmailContent(subject, html, text)


def expiration_warning(
    *,
    recipient_name: str,
    title: str,
    url: str,
    expires_at: datetime,
    is_sender: bool,
) -> EmailContent:
    date = _fmt_date(expires_at)
    subject = f"Expiring soon: {title}"
    if is_sender:
        lead = (
            f"Your envelope <strong>{_esc(title)}</strong> has not been completed and will expire "
            f"on <strong>{_esc(date)}</strong>. You can send a reminder or extend the expiration "
            f"from the envelope page."
        )
        text_lead = (
            f"Your envelope \"{title}\" has not been completed and will expire on {date}. "
            f"You can send a reminder or extend the expiration from the envelope page."
        )
        label = "View Envelope"
    else:
        lead = (
            f"The envelope <strong>{_esc(title)}</strong> is waiting for your signature and will "
            f"expire on <strong>{_esc(date)}</strong>. After that date it can no longer be signed."
        )
        text_lead = (
            f"The envelope \"{title}\" is waiting for your signature and will expire on {date}. "
            f"After that date it can no longer be signed."
        )
        label = "Review Documents"
    html = _shell(
        heading=f"Hello {_esc(recipient_name)},",
        body_paragraphs=[lead],
        button_label=label,
        button_url=url,
    )
    text = _text_body([f"Hello {recipient_name},", "", text_lead, "", f"{label}:", url])
    return EmailContent(subject, html, text)


def expired(*, title: str, url: str) -> EmailContent:
    subject = f"Expired: {title}"
    html = _shell(
        heading="Envelope expired",
        body_paragraphs=[
            f"Your envelope <strong>{_esc(title)}</strong> reached its expiration date before all "
            f"parties signed, and is now expired. You can create a new envelope to try again.",
        ],
        button_label="View Envelope",
        button_url=url,
    )
    text = _text_body(
        [
            "Hello,",
            "",
            f"Your envelope \"{title}\" reached its expiration date before all parties signed, "
            f"and is now expired. You can create a new envelope to try again.",
            "",
            "View the envelope here:",
            url,
        ]
    )
    return EmailContent(subject, html, text)
