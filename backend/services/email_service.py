"""
Email service for sending notifications via Gmail API using domain-wide delegation.
Sends from noreply@cpaautomation.ai (alias on ianstewart@cpaautomation.ai).
"""
import os
import base64
import logging
from typing import Optional
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

from google.oauth2 import service_account
from googleapiclient.discovery import build

from core.runtime import is_local

logger = logging.getLogger(__name__)

class EmailService:
    """Service to send emails via Gmail API with domain-wide delegation"""

    # Sender details
    SENDER_ACCOUNT = os.getenv("GMAIL_SENDER_ACCOUNT", "ianstewart@cpaautomation.ai")
    FROM_ALIAS = os.getenv("GMAIL_FROM_ALIAS", "noreply@cpaautomation.ai")

    def _get_gmail_service(self):
        """Build a Gmail service client using service account with DWD"""
        try:
            service_account_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if not service_account_file:
                raise ValueError("GOOGLE_APPLICATION_CREDENTIALS environment variable is required")
            if not os.path.isabs(service_account_file):
                service_account_file = os.path.abspath(service_account_file)
            if not os.path.exists(service_account_file):
                raise ValueError(f"Service account file not found: {service_account_file}")

            credentials = service_account.Credentials.from_service_account_file(
                service_account_file,
                scopes=[
                    "https://www.googleapis.com/auth/gmail.send",
                ],
                subject=self.SENDER_ACCOUNT,
            )
            service = build("gmail", "v1", credentials=credentials)
            return service
        except Exception as e:
            logger.error(f"Failed to build Gmail service: {e}")
            return None

    def _create_message(self, to_email: str, subject: str, body_text: str, reply_to: Optional[str] = None) -> dict:
        message = MIMEText(body_text)
        message["to"] = to_email
        message["from"] = self.FROM_ALIAS
        message["subject"] = subject
        if reply_to:
            message["reply-to"] = reply_to
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        return {"raw": raw}

    def send_email(self, to_email: str, subject: str, body_text: str, reply_to: Optional[str] = None) -> bool:
        """Send a simple text email. Returns True on success, False otherwise."""
        if is_local():
            logger.info("Local email sink: to=%s subject=%s", to_email, subject)
            return True
        try:
            service = self._get_gmail_service()
            if not service:
                raise RuntimeError("Gmail service is unavailable")

            message = self._create_message(to_email, subject, body_text, reply_to=reply_to)
            result = service.users().messages().send(userId="me", body=message).execute()
            logger.info(f"Email sent to {to_email}: messageId={result.get('id')}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False

    def send_html_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
        reply_to: Optional[str] = None,
        inline_images: Optional[list[tuple[str, bytes, str, str]]] = None,
        attachments: Optional[list[tuple[str, bytes, str]]] = None,
    ) -> bool:
        """Send HTML/text alternatives with optional inline images and attachments."""
        if is_local():
            logger.info("Local HTML email sink: to=%s subject=%s", to_email, subject)
            return True
        try:
            service = self._get_gmail_service()
            if not service:
                raise RuntimeError("Gmail service is unavailable")

            message = MIMEMultipart("mixed") if attachments else (MIMEMultipart("related") if inline_images else MIMEMultipart("alternative"))
            message["to"] = to_email
            message["from"] = self.FROM_ALIAS
            message["subject"] = subject
            if reply_to:
                message["reply-to"] = reply_to
            related = MIMEMultipart("related") if attachments and inline_images else message
            alternative = MIMEMultipart("alternative") if inline_images or attachments else message
            # Order matters: last alternative is preferred by capable clients.
            alternative.attach(MIMEText(text_body, "plain"))
            alternative.attach(MIMEText(html_body, "html"))
            if inline_images or attachments:
                related.attach(alternative)
                for content_id, content, mime_type, filename in inline_images or []:
                    major, _, subtype = mime_type.partition("/")
                    image = MIMEBase(major or "application", subtype or "octet-stream")
                    image.set_payload(content)
                    encoders.encode_base64(image)
                    image.add_header("Content-ID", f"<{content_id}>")
                    image.add_header("Content-Disposition", "inline", filename=filename)
                    related.attach(image)
                if attachments and related is not message:
                    message.attach(related)
            for filename, content, mime_type in attachments or []:
                major, _, subtype = mime_type.partition("/")
                attachment = MIMEBase(major or "application", subtype or "octet-stream")
                attachment.set_payload(content)
                encoders.encode_base64(attachment)
                attachment.add_header("Content-Disposition", "attachment", filename=filename)
                message.attach(attachment)
            raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
            result = service.users().messages().send(userId="me", body={"raw": raw}).execute()
            logger.info(f"HTML email sent to {to_email}: messageId={result.get('id')}")
            return True
        except Exception as e:
            logger.error(f"Failed to send HTML email to {to_email}: {e}")
            return False

    def send_automation_notification(self, to_email: str, automation_name: str, status: str, run_id: Optional[str] = None, error_message: Optional[str] = None):
        """
        Send a notification when an automation run starts or ends.
        status: 'running' | 'completed' | 'failed'
        """
        try:
            if status == "running":
                subject = f"Your automation has started: {automation_name}"
                body = (
                    f"Hello,\n\n"
                    f"This is a confirmation that your automation '{automation_name}' has started running.\n"
                    f"We'll email you again when it finishes.\n\n"
                    f"— CPAAutomation"
                )
            elif status == "completed":
                subject = f"Your automation has finished: {automation_name}"
                body = (
                    f"Hello,\n\n"
                    f"Good news! Your automation '{automation_name}' has completed successfully.\n\n"
                    f"— CPAAutomation"
                )
            elif status == "failed":
                subject = f"Your automation failed: {automation_name}"
                reason = f"Reason: {error_message}\n" if error_message else ""
                body = (
                    f"Hello,\n\n"
                    f"Unfortunately, your automation '{automation_name}' encountered an error and did not complete.\n"
                    f"{reason}"
                    f"You can review the run in your dashboard for details.\n\n"
                    f"— CPAAutomation"
                )
            else:
                logger.info(f"No email template for status '{status}', skipping notification")
                return

            sent = self.send_email(to_email, subject, body)
            if not sent:
                logger.warning(f"Automation email failed to send to {to_email} for status {status}")
        except Exception as e:
            logger.error(f"Error sending automation notification: {e}")

# Singleton instance
email_service = EmailService()
