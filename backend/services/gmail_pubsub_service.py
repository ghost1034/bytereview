"""
Gmail Pub/Sub service for handling Gmail push notifications
"""
import logging
import json
import base64
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from models.db_models import IntegrationAccount
from services.encryption_service import encryption_service

logger = logging.getLogger(__name__)

class GmailPubSubService:
    """Service for managing Gmail Pub/Sub push notifications"""
    
    def setup_push_notifications(self, db: Session, user_id: str, topic_name: str) -> bool:
        """
        Set up Gmail push notifications via Pub/Sub for a user
        
        Args:
            db: Database session
            user_id: User ID
            topic_name: Google Cloud Pub/Sub topic name
            
        Returns:
            True if setup successful, False otherwise
        """
        try:
            from services.google_service import google_service
            
            # Get Gmail service for the user
            gmail_service = google_service.get_gmail_service(db, user_id)
            if not gmail_service:
                logger.error(f"Could not get Gmail service for user {user_id}")
                return False
            
            # Set up Gmail watch request
            watch_request = {
                'topicName': f'projects/{self._get_project_id()}/topics/{topic_name}',
                'labelIds': ['INBOX'],  # Watch inbox messages
                'labelFilterAction': 'include'
            }
            
            # Call Gmail API to start watching
            result = gmail_service.users().watch(
                userId='me',
                body=watch_request
            ).execute()
            
            logger.info(f"Gmail watch setup successful for user {user_id}: {result}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to setup Gmail push notifications for user {user_id}: {e}")
            return False
    
    def process_push_notification(self, message_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Process incoming Gmail push notification from Pub/Sub
        
        Args:
            message_data: Pub/Sub message data
            
        Returns:
            Processed notification data or None if invalid
        """
        try:
            # Extract message data
            if 'message' not in message_data:
                logger.warning("No message in Pub/Sub data")
                return None
            
            message = message_data['message']
            
            # Decode base64 data
            if 'data' not in message:
                logger.warning("No data in Pub/Sub message")
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
            
            if not email_address or not history_id:
                logger.warning(f"Missing required fields in notification: {notification_data}")
                return None
            
            logger.info(f"Processing Gmail notification for {email_address}, historyId: {history_id}")
            
            return {
                'email_address': email_address,
                'history_id': history_id,
                'raw_data': notification_data
            }
            
        except Exception as e:
            logger.error(f"Failed to process Gmail push notification: {e}")
            return None
    
    def get_user_id_from_email(self, db: Session, email_address: str) -> Optional[str]:
        """
        Get user ID from email address using integration accounts
        
        For development, we'll just return the first Google integration user
        since we don't store email addresses in the integration table.
        
        Args:
            db: Database session
            email_address: Gmail email address
            
        Returns:
            User ID if found, None otherwise
        """
        try:
            # For development: find any Google integration
            # In production, you'd need to match the email address properly
            integration = db.query(IntegrationAccount).filter(
                IntegrationAccount.provider == 'google'
            ).first()
            
            if integration:
                logger.info(f"Found user {integration.user_id} for Gmail integration (development mode)")
                return integration.user_id
            else:
                logger.warning(f"No Google integration found for email address: {email_address}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to get user ID for email {email_address}: {e}")
            return None
    
    async def trigger_automations_for_user(
        self, 
        db: Session, 
        user_id: str, 
        notification_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Trigger automations for a user based on Gmail notification
        
        Args:
            db: Database session
            user_id: User ID
            notification_data: Processed notification data
            
        Returns:
            Dict with trigger results
        """
        try:
            # Enqueue automation trigger worker
            from arq import create_pool
            from workers.worker import AutomationWorkerSettings
            
            redis = await create_pool(AutomationWorkerSettings.redis_settings)
            
            job_result = await redis.enqueue_job(
                'automation_trigger_worker',
                user_id=user_id,
                message_data=notification_data,
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
        import os
        project_id = os.getenv('GOOGLE_CLOUD_PROJECT_ID')
        if not project_id:
            raise ValueError("GOOGLE_CLOUD_PROJECT_ID environment variable is required")
        return project_id

# Create service instance
gmail_pubsub_service = GmailPubSubService()