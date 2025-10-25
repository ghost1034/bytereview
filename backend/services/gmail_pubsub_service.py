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
from sqlalchemy import func as sa_func
from google.oauth2 import service_account
from googleapiclient.discovery import build
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from models.db_models import IntegrationAccount
from services.encryption_service import encryption_service

logger = logging.getLogger(__name__)

class GmailPubSubService:
    """Service for managing central Gmail mailbox (document@cpaautomation.ai) notifications"""
    
    # Central mailbox configuration
    CENTRAL_MAILBOX = "ianstewart@cpaautomation.ai"  # Actual mailbox (document@cpaautomation.ai is an alias)
    AUTOMATION_ALIAS = "document@cpaautomation.ai"  # Public alias for automation emails
    
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
            
            # Handle relative paths by making them absolute
            if not os.path.isabs(service_account_file):
                # If relative path, resolve relative to current working directory
                service_account_file = os.path.abspath(service_account_file)
            
            if not os.path.exists(service_account_file):
                raise ValueError(f"Service account file not found: {service_account_file}")
            
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
    
    def setup_central_mailbox_watch(self, db: Session, topic_name: str) -> bool:
        """
        Set up Gmail watch on the central document@cpaautomation.ai mailbox
        
        Args:
            db: Database session
            topic_name: Google Cloud Pub/Sub topic name
            
        Returns:
            True if setup successful, False otherwise
        """
        try:
            from models.db_models import CentralMailboxState
            from datetime import datetime, timezone
            
            gmail_service = self._get_service_account_gmail_service()
            if not gmail_service:
                raise ValueError("Could not get Gmail service for central mailbox")
            
            # Set up watch on the central mailbox
            watch_request = {
                'topicName': f'projects/{self._get_project_id()}/topics/{topic_name}',
                'labelIds': ['INBOX']  # Watch for new messages in inbox
            }
            
            result = gmail_service.users().watch(
                userId='me',
                body=watch_request
            ).execute()
            
            # Extract watch details from response
            history_id = result.get('historyId')
            expiration_ms = result.get('expiration')  # Unix timestamp in milliseconds
            
            if not history_id:
                raise ValueError("No historyId returned from Gmail watch setup")
            
            # Convert expiration from milliseconds to datetime
            watch_expire_at = None
            if expiration_ms:
                watch_expire_at = datetime.fromtimestamp(int(expiration_ms) / 1000, tz=timezone.utc)
            
            # Get or create mailbox state record
            mailbox_state = db.query(CentralMailboxState).filter(
                CentralMailboxState.mailbox_address == self.CENTRAL_MAILBOX
            ).first()
            
            if mailbox_state:
                # Update existing record
                mailbox_state.last_history_id = history_id
                mailbox_state.watch_expire_at = watch_expire_at
                mailbox_state.updated_at = datetime.now(timezone.utc)
            else:
                # Create new record
                mailbox_state = CentralMailboxState(
                    mailbox_address=self.CENTRAL_MAILBOX,
                    last_history_id=history_id,
                    watch_expire_at=watch_expire_at
                )
                db.add(mailbox_state)
            
            db.commit()
            
            logger.info(f"Successfully set up Gmail watch for central mailbox")
            logger.info(f"History ID: {history_id}")
            logger.info(f"Watch expires at: {watch_expire_at}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to set up Gmail watch for central mailbox: {e}")
            db.rollback()
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
    
    def process_history_with_cursor(self, db: Session) -> List[Dict[str, Any]]:
        """
        Process Gmail history using stored cursor with proper locking and cursor advancement
        
        Args:
            db: Database session
            
        Returns:
            List of processed message data
        """
        try:
            from models.db_models import CentralMailboxState
            from datetime import datetime, timezone
            import time
            
            # Acquire per-mailbox lock (simple implementation using database)
            mailbox_state = db.query(CentralMailboxState).filter(
                CentralMailboxState.mailbox_address == self.CENTRAL_MAILBOX
            ).with_for_update().first()
            
            if not mailbox_state:
                logger.error("No mailbox state found - watch not set up")
                return []
            
            cursor = mailbox_state.last_history_id
            if not cursor:
                logger.warning("No cursor available - watch may not be properly set up")
                return []
            
            gmail_service = self._get_service_account_gmail_service()
            if not gmail_service:
                raise ValueError("Could not get Gmail service for central mailbox")
            
            all_messages = []
            current_cursor = cursor
            
            try:
                # Loop through history pages
                while True:
                    logger.info(f"Fetching history from cursor: {current_cursor}")
                    
                    # Try with all history types to see what's available
                    history_response = gmail_service.users().history().list(
                        userId='me',
                        startHistoryId=current_cursor,
                        # Remove historyTypes filter to see all changes
                        maxResults=100  # Process in batches
                    ).execute()
                    
                    logger.info(f"Gmail history API response: {history_response}")
                    
                    # Update cursor to the highest historyId from this response
                    response_history_id = history_response.get('historyId')
                    if response_history_id:
                        current_cursor = response_history_id
                    
                    # Process messages from this page
                    history_records = history_response.get('history', [])
                    logger.info(f"Found {len(history_records)} history records")
                    page_messages = []
                    
                    for record in history_records:
                        logger.info(f"Processing history record: {record}")
                        
                        # Handle different types of history events
                        message_ids_to_process = []
                        
                        if 'messagesAdded' in record:
                            logger.info(f"Found messagesAdded: {len(record['messagesAdded'])} messages")
                            for message_added in record['messagesAdded']:
                                message_ids_to_process.append(message_added['message']['id'])
                        
                        if 'messagesDeleted' in record:
                            logger.info(f"Found messagesDeleted: {len(record['messagesDeleted'])} messages")
                            # We don't process deleted messages
                        
                        if 'labelsAdded' in record:
                            logger.info(f"Found labelsAdded: {len(record['labelsAdded'])} messages")
                            # Check if this might be a draft becoming a sent message
                            for label_added in record['labelsAdded']:
                                message_ids_to_process.append(label_added['message']['id'])
                        
                        if 'labelsRemoved' in record:
                            logger.info(f"Found labelsRemoved: {len(record['labelsRemoved'])} messages")
                            # Check if this might be a draft becoming a sent message
                            for label_removed in record['labelsRemoved']:
                                message_ids_to_process.append(label_removed['message']['id'])
                        
                        # Process unique message IDs
                        unique_message_ids = list(set(message_ids_to_process))
                        logger.info(f"Processing {len(unique_message_ids)} unique messages from this record")
                        
                        for message_id in unique_message_ids:
                            try:
                                # Get full message details
                                message_detail = gmail_service.users().messages().get(
                                    userId='me',
                                    id=message_id,
                                    format='full'
                                ).execute()
                                
                                # Parse message data
                                parsed_message = self._parse_gmail_message(message_detail)
                                if parsed_message:
                                    page_messages.append(parsed_message)
                                    
                                    # Update last_internal_dt for 404 recovery
                                    internal_date = message_detail.get('internalDate')
                                    if internal_date:
                                        mailbox_state.last_internal_dt = max(
                                            mailbox_state.last_internal_dt or 0,
                                            int(internal_date)
                                        )
                            except Exception as e:
                                logger.error(f"Failed to process message {message_id}: {e}")
                    
                    all_messages.extend(page_messages)
                    logger.info(f"Processed {len(page_messages)} messages from this page")
                    
                    # Check if there are more pages
                    next_page_token = history_response.get('nextPageToken')
                    if not next_page_token:
                        break
                
                # Persist the final cursor position
                mailbox_state.last_history_id = current_cursor
                mailbox_state.updated_at = datetime.now(timezone.utc)
                db.commit()
                
                logger.info(f"Successfully processed {len(all_messages)} total messages")
                logger.info(f"Updated cursor to: {current_cursor}")
                
                return all_messages
                
            except Exception as api_error:
                # Handle 404 (historyId too old) with fallback to message list
                if "404" in str(api_error) or "historyId" in str(api_error).lower():
                    logger.warning(f"History ID too old, falling back to message list: {api_error}")
                    return self._recover_from_404(db, mailbox_state, gmail_service)
                else:
                    raise api_error
            
        except Exception as e:
            logger.error(f"Failed to process history with cursor: {e}")
            db.rollback()
            return []
    
    def _recover_from_404(self, db: Session, mailbox_state, gmail_service) -> List[Dict[str, Any]]:
        """
        Recover from 404 (historyId too old) by using message list with time filter
        """
        try:
            from datetime import datetime, timezone
            
            logger.info("Recovering from 404 using message list")
            
            # Use last_internal_dt as fallback, or last 24 hours if none
            after_time_ms = mailbox_state.last_internal_dt
            if not after_time_ms:
                # Fallback to 24 hours ago
                twenty_four_hours_ago = datetime.now(timezone.utc).timestamp() - (24 * 60 * 60)
                after_time_ms = int(twenty_four_hours_ago * 1000)
            
            # Get recent messages using message list
            query = f"in:inbox after:{after_time_ms // 1000}"  # Convert to seconds for Gmail query
            
            messages_response = gmail_service.users().messages().list(
                userId='me',
                q=query,
                maxResults=100
            ).execute()
            
            messages = []
            message_list = messages_response.get('messages', [])
            max_internal_date = after_time_ms
            
            for msg_ref in message_list:
                message_id = msg_ref['id']
                
                # Get full message details
                message_detail = gmail_service.users().messages().get(
                    userId='me',
                    id=message_id,
                    format='full'
                ).execute()
                
                # Check if this message is newer than our last processed
                internal_date = int(message_detail.get('internalDate', 0))
                if internal_date > after_time_ms:
                    parsed_message = self._parse_gmail_message(message_detail)
                    if parsed_message:
                        messages.append(parsed_message)
                        max_internal_date = max(max_internal_date, internal_date)
            
            # Re-establish watch to get new historyId
            logger.info("Re-establishing watch after 404 recovery")
            topic_name = 'gmail-central-notifications'  # Should be configurable
            watch_result = gmail_service.users().watch(
                userId='me',
                body={
                    'topicName': f'projects/{self._get_project_id()}/topics/{topic_name}',
                    'labelIds': ['INBOX']
                }
            ).execute()
            
            # Update state with new watch info
            new_history_id = watch_result.get('historyId')
            expiration_ms = watch_result.get('expiration')
            
            if new_history_id:
                mailbox_state.last_history_id = new_history_id
                mailbox_state.last_internal_dt = max_internal_date
                
                if expiration_ms:
                    mailbox_state.watch_expire_at = datetime.fromtimestamp(
                        int(expiration_ms) / 1000, tz=timezone.utc
                    )
                
                mailbox_state.updated_at = datetime.now(timezone.utc)
                db.commit()
                
                logger.info(f"404 recovery complete. New history ID: {new_history_id}")
                logger.info(f"Processed {len(messages)} messages during recovery")
            
            return messages
            
        except Exception as e:
            logger.error(f"Failed to recover from 404: {e}")
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
            to_header = None
            cc_header = None
            delivered_to = None
            
            for header in headers:
                name = header.get('name', '').lower()
                value = header.get('value', '')
                
                if name == 'from':
                    sender = value
                elif name == 'subject':
                    subject = value
                elif name == 'date':
                    date = value
                elif name == 'to':
                    to_header = value
                elif name == 'cc':
                    cc_header = value
                elif name == 'delivered-to':
                    delivered_to = value
            
            if not sender:
                logger.warning("No sender found in message")
                return None
            
            # Check if email was sent to the automation alias
            if not self._is_automation_email(to_header, cc_header, delivered_to):
                logger.info(f"Email not sent to automation alias {self.AUTOMATION_ALIAS}, skipping")
                return None
            
            # Extract sender email from "Name <email@domain.com>" format
            sender_email = self._extract_email_from_sender(sender)
            if not sender_email:
                logger.warning(f"Could not extract email from sender: {sender}")
                return None
            
            # Extract attachments
            attachments = self._extract_attachments(message_detail)
            logger.info(f"Extracted {len(attachments)} attachments from message {message_detail.get('id')}")
            
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
    
    def _is_automation_email(self, to_header: str, cc_header: str, delivered_to: str) -> bool:
        """
        Check if email was sent to the automation alias (document@cpaautomation.ai)
        
        Args:
            to_header: To header value
            cc_header: CC header value  
            delivered_to: Delivered-To header value
            
        Returns:
            True if email was sent to automation alias, False otherwise
        """
        try:
            automation_alias = self.AUTOMATION_ALIAS.lower()
            
            # Check To header
            if to_header and automation_alias in to_header.lower():
                logger.info(f"Found automation alias in To header: {to_header}")
                return True
            
            # Check CC header
            if cc_header and automation_alias in cc_header.lower():
                logger.info(f"Found automation alias in CC header: {cc_header}")
                return True
            
            # Check Delivered-To header (covers BCC and alias delivery)
            if delivered_to and automation_alias in delivered_to.lower():
                logger.info(f"Found automation alias in Delivered-To header: {delivered_to}")
                return True
            
            logger.info(f"Automation alias {automation_alias} not found in headers")
            logger.debug(f"To: {to_header}, CC: {cc_header}, Delivered-To: {delivered_to}")
            return False
            
        except Exception as e:
            logger.error(f"Failed to check automation email headers: {e}")
            return False
    
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
        """Extract attachment information from Gmail message by recursively walking MIME tree"""
        try:
            def iter_parts(part, depth=0):
                """Recursively iterate through all MIME parts to find attachments"""
                if not part:
                    return
                
                indent = "  " * depth
                filename = part.get('filename', '')
                mime_type = part.get('mimeType', '')
                body = part.get('body', {})
                attachment_id = body.get('attachmentId', '')
                
                logger.info(f"{indent}Processing part: filename='{filename}', mimeType='{mime_type}', attachmentId='{attachment_id}'")
                
                # If this part is an attachment (has both filename and attachmentId)
                if filename and attachment_id:
                    attachment_info = {
                        'filename': filename,
                        'mime_type': mime_type or 'application/octet-stream',
                        'size': body.get('size', 0),
                        'attachment_id': attachment_id
                    }
                    logger.info(f"{indent}Found attachment: {attachment_info}")
                    yield attachment_info
                
                # Recursively process child parts
                child_parts = part.get('parts', []) or []
                if child_parts:
                    logger.info(f"{indent}Processing {len(child_parts)} sub-parts")
                    for child_part in child_parts:
                        yield from iter_parts(child_part, depth + 1)
            
            payload = message_detail.get('payload', {})
            logger.info(f"Processing message payload with mimeType: {payload.get('mimeType', 'unknown')}")
            logger.info(f"Full payload structure: {payload}")
            
            # Also log the full message structure for debugging
            logger.info(f"Full message detail structure: {message_detail}")
            
            # Collect all attachments from the MIME tree
            attachments = list(iter_parts(payload))
            
            logger.info(f"Found {len(attachments)} attachments total")
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
                userId='me',
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
    
    def _normalize_gmail_address(self, email_addr: str) -> str:
        """Normalize Gmail addresses by removing dots and plus tags in the local part and mapping googlemail.com to gmail.com."""
        try:
            addr = (email_addr or '').strip().lower()
            if '@' not in addr:
                return addr
            local, domain = addr.split('@', 1)
            # Treat googlemail.com as gmail.com
            if domain in ('gmail.com', 'googlemail.com'):
                domain = 'gmail.com'
                # Drop anything after +
                if '+' in local:
                    local = local.split('+', 1)[0]
                # Remove dots
                local = local.replace('.', '')
            return f"{local}@{domain}"
        except Exception:
            return (email_addr or '').strip().lower()

    def get_user_id_from_sender_email(self, db: Session, sender_email: str) -> Optional[str]:
        """
        Get user ID from sender email address by matching to user account email
        
        Args:
            db: Database session
            sender_email: Email address of the sender
            
        Returns:
            User ID if found, None otherwise
        """
        try:
            from models.db_models import User
            
            # First try exact match on stored email
            user = db.query(User).filter(
                User.email == sender_email.lower()
            ).first()

            if not user:
                # For Gmail addresses, also try normalized comparison against stored emails.
                # Build normalization in SQL to avoid fetching all users.
                normalized_sender = self._normalize_gmail_address(sender_email)
                from sqlalchemy import case, literal
                email_col = User.email
                # Lowercase email
                lowered = sa_func.lower(email_col)
                # Domain part
                domain = sa_func.split_part(lowered, '@', 2)
                # Local part before '+'
                local_no_plus = sa_func.split_part(sa_func.split_part(lowered, '@', 1), '+', 1)
                # Remove dots from local part: use replace nestedly
                local_no_dots = sa_func.replace(local_no_plus, '.', '')
                # Map googlemail.com to gmail.com via CASE
                mapped_domain = case(
                    (domain == literal('googlemail.com'), literal('gmail.com')),
                    else_=domain
                )
                normalized_sql = local_no_dots + literal('@') + mapped_domain

                user = db.query(User).filter(
                    normalized_sql == normalized_sender
                ).first()
            
            if user:
                logger.info(f"Found user {user.id} for sender email {sender_email}")
                return user.id
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
            # Enqueue automation trigger using Cloud Run Tasks
            from services.cloud_run_task_service import cloud_run_task_service
            
            task_name = await cloud_run_task_service.enqueue_automation_task(
                task_type="automation_trigger_worker",
                user_id=user_id,
                message_data=email_data
            )
            
            logger.info(f"Enqueued automation trigger task {task_name} for user {user_id}")
            
            return {
                "success": True,
                "task_name": task_name,
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