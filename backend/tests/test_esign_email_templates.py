"""Unit tests for the e-sign email template builders (pure functions)."""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.esign import email_templates

URL = "https://cpaautomation.ai/esign/sign/abc"
EXPIRES = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)


class SignatureRequestTests(unittest.TestCase):
    def test_subject_and_button_url(self) -> None:
        content = email_templates.signature_request(
            recipient_name="Jane",
            sender_name="Ian Stewart",
            title="Engagement Letter",
            message="Please sign by Friday",
            url=URL,
            expires_at=EXPIRES,
        )
        self.assertEqual(content.subject, "Ian Stewart sent you a document to review and sign")
        self.assertIn(URL, content.html)
        self.assertIn(URL, content.text)
        self.assertIn("Review Documents", content.html)
        self.assertIn("Please sign by Friday", content.html)
        self.assertIn("Please sign by Friday", content.text)
        self.assertIn("August 1, 2026", content.text)
        self.assertIn("do not need a CPAAutomation account", content.text)
        self.assertNotIn("create one", content.text)

    def test_reminder_prefix(self) -> None:
        content = email_templates.signature_request(
            recipient_name="Jane",
            sender_name="Ian",
            title="T",
            message=None,
            url=URL,
            reminder=True,
        )
        self.assertTrue(content.subject.startswith("Reminder: "))

    def test_html_is_escaped(self) -> None:
        content = email_templates.signature_request(
            recipient_name="<b>Jane</b>",
            sender_name="Ian",
            title="T",
            message="<script>alert(1)</script>",
            url=URL,
        )
        self.assertNotIn("<script>", content.html)
        self.assertNotIn("<b>Jane</b>", content.html)


class CcCopyTests(unittest.TestCase):
    def test_no_action_needed_copy(self) -> None:
        content = email_templates.cc_copy(
            recipient_name="Sam",
            sender_name="Ian",
            title="Engagement Letter",
            message=None,
            url=URL,
        )
        self.assertEqual(content.subject, "Ian sent you a copy: Engagement Letter")
        self.assertIn("No action is needed", content.html)
        self.assertIn("no action is needed", content.text.lower())
        self.assertIn(URL, content.text)


class TerminalEventTests(unittest.TestCase):
    def test_voided_includes_reason(self) -> None:
        content = email_templates.voided(sender_name="Ian", title="T", reason="wrong PDF")
        self.assertEqual(content.subject, 'Ian voided "T"')
        self.assertIn("wrong PDF", content.html)
        self.assertIn("wrong PDF", content.text)

    def test_declined_includes_reason_and_decliner(self) -> None:
        content = email_templates.declined(
            decliner_name="Jane", decliner_email="jane@x.com", title="T", reason="typo in terms"
        )
        self.assertEqual(content.subject, 'Jane declined "T"')
        self.assertIn("typo in terms", content.text)
        self.assertIn("jane@x.com", content.text)

    def test_completed_sender_vs_recipient_copy(self) -> None:
        sender = email_templates.completed(title="T", url=URL, is_sender=True)
        signer = email_templates.completed(title="T", url=URL, is_sender=False)
        self.assertEqual(sender.subject, "Completed: T")
        self.assertNotEqual(sender.text, signer.text)
        self.assertIn(URL, sender.text)
        self.assertIn(URL, signer.text)

    def test_recipient_signed_notice(self) -> None:
        content = email_templates.recipient_signed(
            signer_name="Jane", signer_email="jane@x.com", title="T", url=URL
        )
        self.assertEqual(content.subject, 'Jane signed "T"')
        self.assertIn("jane@x.com", content.text)


class ExpirationTests(unittest.TestCase):
    def test_warning_shows_date_for_signer_and_sender(self) -> None:
        signer = email_templates.expiration_warning(
            recipient_name="Jane", title="T", url=URL, expires_at=EXPIRES, is_sender=False
        )
        sender = email_templates.expiration_warning(
            recipient_name="Ian", title="T", url=URL, expires_at=EXPIRES, is_sender=True
        )
        self.assertEqual(signer.subject, "Expiring soon: T")
        self.assertIn("August 1, 2026", signer.text)
        self.assertIn("August 1, 2026", sender.text)
        self.assertNotEqual(signer.text, sender.text)

    def test_expired_notice(self) -> None:
        content = email_templates.expired(title="T", url=URL)
        self.assertEqual(content.subject, "Expired: T")
        self.assertIn(URL, content.text)


if __name__ == "__main__":
    unittest.main()
