"""
Gmail Pub/Sub service for handling central document@cpaautomation.ai mailbox

This service processes emails sent to the central document@cpaautomation.ai mailbox
and triggers automations based on sender email matching and user-configured filters.
"""
import logging
import json
import base64
import os
import email
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from google.oauth2 import service_account
from googleapiclient.discovery import build

from models.db_models import IntegrationAccount
from services.encryption_service import encryption_service

logger = logging.getLogger(__name__)

class GmailPubSubService:
    """Service for managing central Gmail mailbox (document@cpaautomation.ai) notifications"""
    
    # Central mailbox configuration
    CENTRAL_MAILBOX = "document@cpaautomation.ai"
    
    def _get_service_account_gmail_service(self):
        """
        Get Gmail service using service account with domain-wide delegation
        for accessing the central document@cpaautomation.ai mailbox
        """
        try:
            # Get service account credentials
            service_account_file = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
            if not service_account_file:
                raise ValueError("GOOGLE_APPLICATION_CREDENTIALS environment variable is required")
            
            # Create credentials with domain-wide delegation
            credentials = service_account.Credentials.from_service_account_file(
                service_account_file,
                scopes=['https://www.googleapis.com/auth/gmail.readonly'],
                subject=self.CENTRAL_MAILBOX  # Impersonate the central mailbox
            )
            
            # Build Gmail service
            service = build('gmail', 'v1', credentials=credentials)
            return service
            
        except Exception as e:
            logger.error(f"Failed to create service account Gmail service: {e}")
            return None
    
    def setup_central_mailbox_watch(self, topic_name: str) -> bool:
        """
        Set up Gmail watch on the central document@cpaautomation.ai mailbox
        
        Args:
            topic_name: Google Cloud Pub/Sub topic name
            
        Returns:
            True if setup successful, False otherwise
        """
        try:
            gmail_service = self._get_service_account_gmail_service()
            if not gmail_service:
                raise ValueError("Could not get Gmail service for central mailbox")
            
            # Set up watch on the central mailbox
            watch_request = {
                'topicName': f'projects/{self._get_project_id()}/topics/{topic_name}',
                'labelIds': ['INBOX']  # Watch for new messages in inbox
            }
            
            result = gmail_service.users().watch(
                userId=self.CENTRAL_MAILBOX,
                body=watch_request
            ).execute()
            
            logger.info(f"Successfully set up Gmail watch for central mailbox: {result}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to set up Gmail watch for central mailbox: {e}")
            return False
    
    def process_push_notification(self, notification_body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Process Gmail Pub/Sub push notification for the central mailbox
        
        Args:
            notification_body: Raw notification body from Pub/Sub
            
        Returns:
            Processed notification data or None if invalid
        """
        try:
            if 'message' not in notification_body:
                logger.warning("No message in notification body")
                return None
            
            message = notification_body['message']
            
            if 'data' not in message:
                logger.warning("No data in message")
                return None
            
            try:
                decoded_data = base64.b64decode(message['data']).decode('utf-8')
                notification_data = json.loads(decoded_data)
            except (ValueError, json.JSONDecodeError) as e:
                logger.error(f"Failed to decode Pub/Sub message data: {e}")
                return None
            
            # Extract Gmail notification details
            email_address = notification_data.get('emailAddress')
            history_id = notification_data.get('historyId')
            
            # Verify this is for our central mailbox
            if email_address != self.CENTRAL_MAILBOX:
                logger.warning(f"Received notification for unexpected email: {email_address}")
                return None
            
            if not history_id:
                logger.warning(f"Missing historyId in notification: {notification_data}")
                return None
            
            logger.info(f"Processing Gmail notification for central mailbox, historyId: {history_id}")
            
            return {
                'email_address': email_address,
                'history_id': history_id,
                'raw_data': notification_data
            }
            
        except Exception as e:
            logger.error(f"Failed to process Gmail push notification: {e}")
            return None
    
    def get_new_messages_from_history(self, history_id: str) -> List[Dict[str, Any]]:
        """
        Get new messages from Gmail history for the central mailbox
        
        Args:
            history_id: Gmail history ID from notification
            
        Returns:
            List of new message data
        """
        try:
            gmail_service = self._get_service_account_gmail_service()
            if not gmail_service:
                raise ValueError("Could not get Gmail service for central mailbox")
            
            # Get history since the given history ID
            history_response = gmail_service.users().history().list(
                userId=self.CENTRAL_MAILBOX,
                startHistoryId=history_id,
                historyTypes=['messageAdded']
            ).execute()
            
            messages = []
            history_records = history_response.get('history', [])
            
            for record in history_records:
                if 'messagesAdded' in record:
                    for message_added in record['messagesAdded']:
                        message_id = message_added['message']['id']
                        
                        # Get full message details
                        message_detail = gmail_service.users().messages().get(
                            userId=self.CENTRAL_MAILBOX,
                            id=message_id,
                            format='full'
                        ).execute()
                        
                        # Parse message data
                        parsed_message = self._parse_gmail_message(message_detail)
                        if parsed_message:
                            messages.append(parsed_message)
            
            logger.info(f"Found {len(messages)} new messages in history")
            return messages
            
        except Exception as e:
            logger.error(f"Failed to get new messages from history: {e}")
            return []
    
    def _parse_gmail_message(self, message_detail: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Parse Gmail message to extract sender, subject, attachments, etc.
        
        Args:
            message_detail: Full Gmail message from API
            
        Returns:
            Parsed message data or None if invalid
        """
        try:
            headers = message_detail.get('payload', {}).get('headers', [])
            
            # Extract headers
            sender = None
            subject = None
            date = None
            
            for header in headers:
                name = header.get('name', '').lower()
                value = header.get('value', '')
                
                if name == 'from':
                    sender = value
                elif name == 'subject':
                    subject = value
                elif name == 'date':
                    date = value
            
            if not sender:
                logger.warning("No sender found in message")
                return None
            
            # Extract sender email from "Name <email@domain.com>" format
            sender_email = self._extract_email_from_sender(sender)
            if not sender_email:
                logger.warning(f"Could not extract email from sender: {sender}")
                return None
            
            # Extract attachments
            attachments = self._extract_attachments(message_detail)
            
            # Extract message body
            body = self._extract_message_body(message_detail)
            
            return {
                'message_id': message_detail.get('id'),
                'sender': sender,
                'sender_email': sender_email,
                'subject': subject or '',
                'date': date,
                'body': body,
                'attachments': attachments,
                'raw_message': message_detail
            }
            
        except Exception as e:
            logger.error(f"Failed to parse Gmail message: {e}")
            return None
    
    def _extract_email_from_sender(self, sender: str) -> Optional[str]:
        """Extract email address from sender string"""
        try:
            import re
            # Match email pattern in "Name <email@domain.com>" or just "email@domain.com"
            email_pattern = r'<([^>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'
            match = re.search(email_pattern, sender)
            
            if match:
                return match.group(1) or match.group(2)
            return None
            
        except Exception as e:
            logger.error(f"Failed to extract email from sender {sender}: {e}")
            return None
    
    def _extract_attachments(self, message_detail: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract attachment information from Gmail message"""
        try:
            attachments = []
            
            def process_part(part):
                if part.get('filename'):
                    # This is an attachment
                    attachment_id = None
                    if 'body' in part and 'attachmentId' in part['body']:
                        attachment_id = part['body']['attachmentId']
                    
                    attachments.append({
                        'filename': part['filename'],
                        'mime_type': part.get('mimeType', 'application/octet-stream'),
                        'size': part.get('body', {}).get('size', 0),
                        'attachment_id': attachment_id
                    })
                
                # Recursively process parts
                if 'parts' in part:
                    for subpart in part['parts']:
                        process_part(subpart)
            
            payload = message_detail.get('payload', {})
            process_part(payload)
            
            logger.info(f"Found {len(attachments)} attachments")
            return attachments
            
        except Exception as e:
            logger.error(f"Failed to extract attachments: {e}")
            return []
    
    def _extract_message_body(self, message_detail: Dict[str, Any]) -> str:
        """Extract text body from Gmail message"""
        try:
            def get_body_from_part(part):
                mime_type = part.get('mimeType', '')
                
                if mime_type == 'text/plain':
                    body_data = part.get('body', {}).get('data')
                    if body_data:
                        return base64.urlsafe_b64decode(body_data).decode('utf-8')
                
                if 'parts' in part:
                    for subpart in part['parts']:
                        body = get_body_from_part(subpart)
                        if body:
                            return body
                
                return None
            
            payload = message_detail.get('payload', {})
            body = get_body_from_part(payload)
            return body or ''
            
        except Exception as e:
            logger.error(f"Failed to extract message body: {e}")
            return ''
    
    def download_attachment(self, message_id: str, attachment_id: str) -> Optional[bytes]:
        """
        Download attachment from Gmail message
        
        Args:
            message_id: Gmail message ID
            attachment_id: Gmail attachment ID
            
        Returns:
            Attachment data as bytes or None if failed
        """
        try:
            gmail_service = self._get_service_account_gmail_service()
            if not gmail_service:
                raise ValueError("Could not get Gmail service for central mailbox")
            
            attachment = gmail_service.users().messages().attachments().get(
                userId=self.CENTRAL_MAILBOX,
                messageId=message_id,
                id=attachment_id
            ).execute()
            
            data = attachment.get('data')
            if data:
                return base64.urlsafe_b64decode(data)
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to download attachment {attachment_id}: {e}")
            return None
    
    def get_user_id_from_sender_email(self, db: Session, sender_email: str) -> Optional[str]:
        """
        Get user ID from sender email address by matching to Google integration
        
        Args:
            db: Database session
            sender_email: Email address of the sender
            
        Returns:
            User ID if found, None otherwise
        """
        try:
            # Look up user by their Google integration email address
            account = db.query(IntegrationAccount).filter(
                IntegrationAccount.provider == "google",
                IntegrationAccount.email == sender_email.lower()
            ).first()
            
            if account:
                logger.info(f"Found user {account.user_id} for sender email {sender_email}")
                return account.user_id
            else:
                logger.info(f"No user found for sender email {sender_email}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to get user ID for sender email {sender_email}: {e}")
            return None
    
    async def trigger_automations_for_email(
        self, 
        db: Session, 
        user_id: str, 
        email_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Trigger automations for a user based on received email
        
        Args:
            db: Database session
            user_id: User ID
            email_data: Parsed email data
            
        Returns:
            Dict with trigger results
        """
        try:
            # Enqueue automation trigger worker with email data
            from arq import create_pool
            from workers.worker import AutomationWorkerSettings
            
            redis = await create_pool(AutomationWorkerSettings.redis_settings)
            
            job_result = await redis.enqueue_job(
                'automation_trigger_worker',
                user_id=user_id,
                message_data=email_data,
                _queue_name='automation'
            )
            
            await redis.close()
            
            logger.info(f"Enqueued automation trigger job {job_result.job_id} for user {user_id}")
            
            return {
                "success": True,
                "job_id": str(job_result.job_id),
                "user_id": user_id,
                "message": "Automation trigger enqueued successfully"
            }
            
        except Exception as e:
            logger.error(f"Failed to trigger automations for user {user_id}: {e}")
            return {
                "success": False,
                "error": str(e),
                "user_id": user_id
            }
    
    def _get_project_id(self) -> str:
        """Get Google Cloud Project ID from environment"""
        project_id = os.getenv('GOOGLE_CLOUD_PROJECT_ID')
        if not project_id:
            raise ValueError("GOOGLE_CLOUD_PROJECT_ID environment variable is required")
        return project_id

# Create service instance
gmail_pubsub_service = GmailPubSubService()