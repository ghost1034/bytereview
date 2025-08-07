"""
Service for managing Gmail Pub/Sub subscriptions
"""
import logging
import os
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

class GmailSubscriptionService:
    """Service for managing Gmail Pub/Sub subscriptions and topics"""
    
    def __init__(self):
        self.project_id = os.getenv('GOOGLE_CLOUD_PROJECT_ID')
        self.topic_name = os.getenv('GMAIL_PUBSUB_TOPIC', 'gmail-notifications')
        self.subscription_name = os.getenv('GMAIL_PUBSUB_SUBSCRIPTION', 'gmail-notifications-sub')
        self.webhook_url = os.getenv('GMAIL_WEBHOOK_URL', 'https://your-domain.com/api/webhooks/gmail-push')
        
        if not self.project_id:
            raise ValueError("GOOGLE_CLOUD_PROJECT_ID environment variable is required")
    
    def setup_pubsub_infrastructure(self) -> bool:
        """
        Set up Google Cloud Pub/Sub topic and subscription for Gmail notifications
        
        Returns:
            True if setup successful, False otherwise
        """
        try:
            from google.cloud import pubsub_v1
            from google.api_core import exceptions
            
            # Initialize Pub/Sub clients
            publisher = pubsub_v1.PublisherClient()
            subscriber = pubsub_v1.SubscriberClient()
            
            topic_path = publisher.topic_path(self.project_id, self.topic_name)
            subscription_path = subscriber.subscription_path(self.project_id, self.subscription_name)
            
            # Create topic if it doesn't exist
            try:
                publisher.create_topic(request={"name": topic_path})
                logger.info(f"Created Pub/Sub topic: {topic_path}")
            except exceptions.AlreadyExists:
                logger.info(f"Pub/Sub topic already exists: {topic_path}")
            except Exception as e:
                logger.error(f"Failed to create topic: {e}")
                return False
            
            # Create push subscription if it doesn't exist
            try:
                from google.cloud.pubsub_v1.types import PushConfig
                push_config = PushConfig(
                    push_endpoint=self.webhook_url
                )
                
                subscriber.create_subscription(
                    request={
                        "name": subscription_path,
                        "topic": topic_path,
                        "push_config": push_config,
                    }
                )
                logger.info(f"Created Pub/Sub subscription: {subscription_path}")
            except exceptions.AlreadyExists:
                logger.info(f"Pub/Sub subscription already exists: {subscription_path}")
                
                # Update existing subscription with new push config
                try:
                    from google.cloud.pubsub_v1.types import PushConfig
                    push_config = PushConfig(
                        push_endpoint=self.webhook_url
                    )
                    
                    subscriber.modify_push_config(
                        request={
                            "subscription": subscription_path,
                            "push_config": push_config,
                        }
                    )
                    logger.info(f"Updated push config for subscription: {subscription_path}")
                except Exception as e:
                    logger.warning(f"Failed to update push config: {e}")
                    
            except Exception as e:
                logger.error(f"Failed to create subscription: {e}")
                return False
            
            logger.info("Gmail Pub/Sub infrastructure setup completed successfully")
            return True
            
        except ImportError:
            logger.error("google-cloud-pubsub library not installed")
            return False
        except Exception as e:
            logger.error(f"Failed to setup Pub/Sub infrastructure: {e}")
            return False
    
    def setup_gmail_watch_for_user(self, db: Session, user_id: str) -> bool:
        """
        Set up Gmail watch for a specific user
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            True if setup successful, False otherwise
        """
        try:
            from services.gmail_pubsub_service import gmail_pubsub_service
            
            # Set up Gmail watch for the user
            success = gmail_pubsub_service.setup_push_notifications(
                db, user_id, self.topic_name
            )
            
            if success:
                logger.info(f"Gmail watch setup successful for user {user_id}")
            else:
                logger.error(f"Gmail watch setup failed for user {user_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to setup Gmail watch for user {user_id}: {e}")
            return False
    
    def setup_gmail_watch_for_all_users(self, db: Session) -> Dict[str, Any]:
        """
        Set up Gmail watch for all users with Google integrations
        
        Args:
            db: Database session
            
        Returns:
            Dict with setup results
        """
        try:
            from models.db_models import IntegrationAccount
            
            # Get all users with Google integrations
            google_integrations = db.query(IntegrationAccount).filter(
                IntegrationAccount.provider == 'google'
            ).all()
            
            results = {
                'total_users': len(google_integrations),
                'successful': 0,
                'failed': 0,
                'errors': []
            }
            
            for integration in google_integrations:
                try:
                    success = self.setup_gmail_watch_for_user(db, integration.user_id)
                    if success:
                        results['successful'] += 1
                    else:
                        results['failed'] += 1
                        results['errors'].append({
                            'user_id': integration.user_id,
                            'error': 'Gmail watch setup failed'
                        })
                except Exception as e:
                    results['failed'] += 1
                    results['errors'].append({
                        'user_id': integration.user_id,
                        'error': str(e)
                    })
            
            logger.info(f"Gmail watch setup completed: {results['successful']}/{results['total_users']} successful")
            return results
            
        except Exception as e:
            logger.error(f"Failed to setup Gmail watch for all users: {e}")
            return {
                'total_users': 0,
                'successful': 0,
                'failed': 0,
                'errors': [{'general': str(e)}]
            }
    
    def get_topic_name(self) -> str:
        """Get the Pub/Sub topic name"""
        return self.topic_name
    
    def get_webhook_url(self) -> str:
        """Get the webhook URL"""
        return self.webhook_url
    
    def validate_configuration(self) -> Dict[str, Any]:
        """
        Validate Gmail Pub/Sub configuration
        
        Returns:
            Dict with validation results
        """
        config_status = {
            'valid': True,
            'errors': [],
            'warnings': []
        }
        
        # Check required environment variables
        required_vars = [
            'GOOGLE_CLOUD_PROJECT_ID',
            'GMAIL_PUBSUB_TOKEN',
            'GMAIL_WEBHOOK_URL'
        ]
        
        for var in required_vars:
            if not os.getenv(var):
                config_status['valid'] = False
                config_status['errors'].append(f"Missing required environment variable: {var}")
        
        # Check optional variables
        optional_vars = [
            'GMAIL_PUBSUB_TOPIC',
            'GMAIL_PUBSUB_SUBSCRIPTION'
        ]
        
        for var in optional_vars:
            if not os.getenv(var):
                config_status['warnings'].append(f"Using default value for {var}")
        
        # Validate webhook URL format
        webhook_url = os.getenv('GMAIL_WEBHOOK_URL', '')
        if webhook_url and not webhook_url.startswith('https://'):
            config_status['warnings'].append("Webhook URL should use HTTPS for production")
        
        return config_status

# Create service instance
gmail_subscription_service = GmailSubscriptionService()