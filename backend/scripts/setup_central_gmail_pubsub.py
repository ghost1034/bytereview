#!/usr/bin/env python3
"""
Setup script for central Gmail mailbox Pub/Sub integration

This script sets up Gmail Pub/Sub integration for the central document@cpaautomation.ai
mailbox instead of individual user Gmail access.

This script:
1. Creates a Google Cloud Pub/Sub topic for Gmail notifications
2. Creates a subscription to handle the notifications  
3. Sets up Gmail watch on document@cpaautomation.ai mailbox
4. Configures service account permissions

Prerequisites:
- Google Cloud SDK installed and authenticated
- Project with Pub/Sub API enabled
- Gmail API enabled
- Service account with domain-wide delegation configured
- document@cpaautomation.ai mailbox set up in Google Workspace

Usage:
    python setup_central_gmail_pubsub.py --project-id YOUR_PROJECT_ID
"""
import os
import sys
import argparse
import logging
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_environment():
    """Check if required environment variables are set"""
    logger.info("Checking environment configuration...")
    
    required_vars = [
        'GOOGLE_CLOUD_PROJECT_ID',
        'GOOGLE_APPLICATION_CREDENTIALS',
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        logger.error(f"Missing required environment variables: {missing_vars}")
        return False
    
    # Check if service account file exists
    service_account_file = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if not os.path.isabs(service_account_file):
        # If relative path, check relative to backend directory
        service_account_file = os.path.join(backend_dir, service_account_file)
    
    if not os.path.exists(service_account_file):
        logger.error(f"Service account file not found: {service_account_file}")
        logger.info(f"Checked absolute path: {os.path.abspath(service_account_file)}")
        logger.info(f"Current working directory: {os.getcwd()}")
        logger.info(f"Backend directory: {backend_dir}")
        return False
    
    logger.info("✅ Environment configuration looks good")
    return True

def setup_pubsub_infrastructure():
    """Set up Google Cloud Pub/Sub topic and subscription"""
    logger.info("Setting up Pub/Sub infrastructure...")
    
    try:
        from google.cloud import pubsub_v1
        
        project_id = os.getenv('GOOGLE_CLOUD_PROJECT_ID')
        topic_name = 'gmail-central-notifications'
        subscription_name = 'gmail-central-webhook'
        
        # Initialize Pub/Sub client
        publisher = pubsub_v1.PublisherClient()
        subscriber = pubsub_v1.SubscriberClient()
        
        topic_path = publisher.topic_path(project_id, topic_name)
        subscription_path = subscriber.subscription_path(project_id, subscription_name)
        
        # Create topic if it doesn't exist
        try:
            publisher.create_topic(request={"name": topic_path})
            logger.info(f"✅ Created Pub/Sub topic: {topic_name}")
        except Exception as e:
            if "already exists" in str(e).lower():
                logger.info(f"✅ Pub/Sub topic already exists: {topic_name}")
            else:
                raise e
        
        # Create subscription if it doesn't exist
        try:
            # Configure push endpoint
            webhook_url = os.getenv('WEBHOOK_BASE_URL', 'https://your-domain.com') + '/api/webhooks/gmail-push'
            
            push_config = pubsub_v1.types.PushConfig(push_endpoint=webhook_url)
            
            subscriber.create_subscription(
                request={
                    "name": subscription_path,
                    "topic": topic_path,
                    "push_config": push_config,
                }
            )
            logger.info(f"✅ Created Pub/Sub subscription: {subscription_name}")
            logger.info(f"✅ Webhook endpoint: {webhook_url}")
        except Exception as e:
            if "already exists" in str(e).lower():
                logger.info(f"✅ Pub/Sub subscription already exists: {subscription_name}")
            else:
                raise e
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to set up Pub/Sub infrastructure: {e}")
        return False

def setup_central_gmail_watch():
    """Set up Gmail watch for the central document@cpaautomation.ai mailbox"""
    logger.info("Setting up Gmail watch for central mailbox...")
    
    try:
        from services.gmail_pubsub_service import gmail_pubsub_service
        from core.database import get_db
        
        topic_name = 'gmail-central-notifications'
        
        # Get database session
        db = next(get_db())
        
        try:
            # Set up watch on central mailbox with proper state persistence
            success = gmail_pubsub_service.setup_central_mailbox_watch(db, topic_name)
            
            if success:
                logger.info("✅ Gmail watch successfully configured for document@cpaautomation.ai")
                logger.info(f"✅ Notifications will be sent to topic: {topic_name}")
                logger.info("✅ Watch state persisted to database")
            else:
                logger.error("❌ Failed to set up Gmail watch")
                return False
            
            return True
            
        finally:
            db.close()
        
    except Exception as e:
        logger.error(f"❌ Error setting up Gmail watch: {e}")
        logger.info("\nTroubleshooting:")
        logger.info("1. Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set")
        logger.info("2. Ensure service account has domain-wide delegation configured")
        logger.info("3. Ensure document@cpaautomation.ai mailbox exists in Google Workspace")
        logger.info("4. Ensure service account has Gmail API access with domain-wide delegation")
        logger.info("5. Ensure database is accessible and migrations are run")
        return False

def test_service_account_access():
    """Test if service account can access the central mailbox"""
    logger.info("Testing service account access to central mailbox...")
    
    try:
        from services.gmail_pubsub_service import gmail_pubsub_service
        
        # Try to get Gmail service
        gmail_service = gmail_pubsub_service._get_service_account_gmail_service()
        
        if gmail_service:
            # Try to get profile of central mailbox
            profile = gmail_service.users().getProfile(userId=gmail_pubsub_service.CENTRAL_MAILBOX).execute()
            email_address = profile.get('emailAddress')
            
            if email_address == gmail_pubsub_service.CENTRAL_MAILBOX:
                logger.info(f"✅ Service account can access central mailbox: {email_address}")
                return True
            else:
                logger.error(f"❌ Service account accessed wrong mailbox: {email_address}")
                return False
        else:
            logger.error("❌ Could not create Gmail service with service account")
            return False
            
    except Exception as e:
        logger.error(f"❌ Service account access test failed: {e}")
        return False

def print_setup_instructions():
    """Print detailed setup instructions"""
    logger.info("\n" + "="*80)
    logger.info("CENTRAL GMAIL MAILBOX SETUP INSTRUCTIONS")
    logger.info("="*80)
    logger.info("\n1. Google Workspace Setup:")
    logger.info("   - Create document@cpaautomation.ai mailbox in Google Workspace")
    logger.info("   - Set up email forwarding to ianstewart@cpaautomation.ai")
    logger.info("\n2. Service Account Setup:")
    logger.info("   - Create service account in Google Cloud Console")
    logger.info("   - Enable domain-wide delegation for the service account")
    logger.info("   - Download service account JSON key file")
    logger.info("   - Set GOOGLE_APPLICATION_CREDENTIALS environment variable")
    logger.info("\n3. Google Workspace Admin Setup:")
    logger.info("   - Go to Google Workspace Admin Console")
    logger.info("   - Navigate to Security > API Controls > Domain-wide Delegation")
    logger.info("   - Add service account client ID with Gmail API scope:")
    logger.info("     https://www.googleapis.com/auth/gmail.readonly")
    logger.info("\n4. Environment Variables:")
    logger.info("   - GOOGLE_CLOUD_PROJECT_ID: Your Google Cloud project ID")
    logger.info("   - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON file")
    logger.info("   - WEBHOOK_BASE_URL: Your application's base URL for webhooks")
    logger.info("\n5. Test the setup:")
    logger.info("   - Run: python setup_central_gmail_pubsub.py --test-only")
    logger.info("   - Send a test email to document@cpaautomation.ai")
    logger.info("="*80)

def main():
    parser = argparse.ArgumentParser(description='Set up central Gmail mailbox Pub/Sub integration')
    parser.add_argument('--project-id', help='Google Cloud Project ID (overrides env var)')
    parser.add_argument('--test-only', action='store_true', help='Only test service account access')
    parser.add_argument('--instructions', action='store_true', help='Show setup instructions')
    parser.add_argument('--check-env', action='store_true', help='Only check environment configuration')
    
    args = parser.parse_args()
    
    if args.instructions:
        print_setup_instructions()
        return
    
    # Override project ID if provided
    if args.project_id:
        os.environ['GOOGLE_CLOUD_PROJECT_ID'] = args.project_id
    
    logger.info("Starting central Gmail mailbox Pub/Sub setup...")
    
    # Check environment configuration
    if not check_environment():
        logger.error("❌ Environment check failed. Please fix configuration and try again.")
        print_setup_instructions()
        sys.exit(1)
    
    if args.check_env:
        logger.info("✅ Environment configuration check completed successfully")
        return
    
    # Test service account access
    if not test_service_account_access():
        logger.error("❌ Service account access test failed.")
        print_setup_instructions()
        sys.exit(1)
    
    if args.test_only:
        logger.info("✅ Service account access test completed successfully")
        return
    
    success = True
    
    # Set up Pub/Sub infrastructure
    if not setup_pubsub_infrastructure():
        success = False
    
    # Set up Gmail watch
    if not setup_central_gmail_watch():
        success = False
    
    if success:
        logger.info("\n🎉 Central Gmail mailbox Pub/Sub setup completed successfully!")
        logger.info("\nNext steps:")
        logger.info("1. Start the automation worker: python run_workers.py automation")
        logger.info("2. Test by sending an email to document@cpaautomation.ai")
        logger.info("3. Check webhook logs for processing")
        logger.info("4. Create automations via the API or frontend")
        logger.info("\nThe system will now:")
        logger.info("- Receive emails sent to document@cpaautomation.ai")
        logger.info("- Match sender emails to user accounts")
        logger.info("- Trigger automations based on user-configured filters")
        logger.info("- Process attachments for document extraction")
        logger.info("- Automatically renew Gmail watch daily via maintenance worker (watches expire after ~7 days)")
    else:
        logger.error("\n❌ Setup completed with errors. Please check the logs above.")
        print_setup_instructions()
        sys.exit(1)

if __name__ == "__main__":
    main()