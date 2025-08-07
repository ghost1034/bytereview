#!/usr/bin/env python3
"""
Setup script for Gmail Pub/Sub integration

This script sets up the necessary Google Cloud Pub/Sub infrastructure
and Gmail watch for automation triggers.

Usage:
    python setup_gmail_pubsub.py [--check-only] [--user-id USER_ID]
"""
import os
import sys
import argparse
import asyncio
import logging
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

# Load .env file from the backend directory
env_path = backend_dir / '.env'
load_dotenv(env_path)

from core.database import get_db
from services.gmail_subscription_service import gmail_subscription_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_environment():
    """Check if all required environment variables are set"""
    logger.info("Checking environment configuration...")
    
    # Check required environment variables directly
    required_vars = [
        'GOOGLE_CLOUD_PROJECT_ID',
        'GMAIL_WEBHOOK_URL',
        'ADMIN_TOKEN'
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        logger.error("❌ Environment configuration is invalid")
        for var in missing_vars:
            logger.error(f"❌ Missing required environment variable: {var}")
        return False
    else:
        logger.info("✅ Environment configuration is valid")
        
        # Check optional variables and warn if using defaults
        optional_vars = {
            'GMAIL_PUBSUB_TOPIC': 'gmail-notifications',
            'GMAIL_PUBSUB_SUBSCRIPTION': 'gmail-notifications-sub'
        }
        
        for var, default in optional_vars.items():
            if not os.getenv(var):
                logger.warning(f"⚠️  Using default value for {var}: {default}")
        
        return True

def setup_pubsub_infrastructure():
    """Set up Google Cloud Pub/Sub topic and subscription"""
    logger.info("Setting up Google Cloud Pub/Sub infrastructure...")
    
    try:
        success = gmail_subscription_service.setup_pubsub_infrastructure()
        
        if success:
            logger.info("✅ Pub/Sub infrastructure setup completed successfully")
            logger.info(f"   Topic: {gmail_subscription_service.get_topic_name()}")
            logger.info(f"   Webhook: {gmail_subscription_service.get_webhook_url()}")
        else:
            logger.error("❌ Pub/Sub infrastructure setup failed")
            
        return success
        
    except Exception as e:
        logger.error(f"❌ Pub/Sub setup error: {e}")
        return False

def setup_gmail_watch_all_users():
    """Set up Gmail watch for all users with Google integrations"""
    logger.info("Setting up Gmail watch for all users...")
    
    try:
        with next(get_db()) as db:
            results = gmail_subscription_service.setup_gmail_watch_for_all_users(db)
        
        logger.info(f"Gmail watch setup results:")
        logger.info(f"  Total users: {results['total_users']}")
        logger.info(f"  Successful: {results['successful']}")
        logger.info(f"  Failed: {results['failed']}")
        
        if results['errors']:
            logger.warning("Errors encountered:")
            for error in results['errors']:
                logger.warning(f"  - {error}")
        
        if results['successful'] > 0:
            logger.info("✅ Gmail watch setup completed")
        else:
            logger.warning("⚠️  No successful Gmail watch setups")
            
        return results['failed'] == 0
        
    except Exception as e:
        logger.error(f"❌ Gmail watch setup error: {e}")
        return False

def setup_gmail_watch_user(user_id: str):
    """Set up Gmail watch for a specific user"""
    logger.info(f"Setting up Gmail watch for user: {user_id}")
    
    try:
        with next(get_db()) as db:
            success = gmail_subscription_service.setup_gmail_watch_for_user(db, user_id)
        
        if success:
            logger.info(f"✅ Gmail watch setup successful for user {user_id}")
        else:
            logger.error(f"❌ Gmail watch setup failed for user {user_id}")
            
        return success
        
    except Exception as e:
        logger.error(f"❌ Gmail watch setup error for user {user_id}: {e}")
        return False

def print_setup_instructions():
    """Print setup instructions for manual configuration"""
    logger.info("\n" + "="*60)
    logger.info("GMAIL PUB/SUB SETUP INSTRUCTIONS")
    logger.info("="*60)
    
    logger.info("\n1. Required Environment Variables:")
    logger.info("   GOOGLE_CLOUD_PROJECT_ID=your-project-id")
    logger.info("   GMAIL_WEBHOOK_URL=https://your-domain.com/api/webhooks/gmail-push")
    logger.info("   ADMIN_TOKEN=your-admin-token")
    
    logger.info("\n2. Optional Environment Variables:")
    logger.info("   GMAIL_PUBSUB_TOPIC=gmail-notifications")
    logger.info("   GMAIL_PUBSUB_SUBSCRIPTION=gmail-notifications-sub")
    
    logger.info("\n3. Google Cloud Setup:")
    logger.info("   - Enable Pub/Sub API in your Google Cloud project")
    logger.info("   - Enable Gmail API in your Google Cloud project")
    logger.info("   - Set up service account with Pub/Sub Admin permissions")
    logger.info("   - Download service account key and set GOOGLE_APPLICATION_CREDENTIALS")
    
    logger.info("\n4. Gmail API Setup:")
    logger.info("   - Configure OAuth consent screen")
    logger.info("   - Add Gmail API scopes")
    logger.info("   - Set up OAuth credentials for web application")
    
    logger.info("\n5. Webhook Setup:")
    logger.info("   - Ensure your webhook URL is publicly accessible")
    logger.info("   - Use HTTPS for production")
    logger.info("   - Test webhook endpoint: GET /api/webhooks/gmail-push?token=YOUR_TOKEN")

def main():
    parser = argparse.ArgumentParser(description="Setup Gmail Pub/Sub integration")
    parser.add_argument("--check-only", action="store_true", 
                       help="Only check configuration, don't set up infrastructure")
    parser.add_argument("--user-id", type=str,
                       help="Set up Gmail watch for specific user only")
    parser.add_argument("--instructions", action="store_true",
                       help="Show setup instructions")
    
    args = parser.parse_args()
    
    if args.instructions:
        print_setup_instructions()
        return
    
    logger.info("Starting Gmail Pub/Sub setup...")
    
    # Check environment configuration
    if not check_environment():
        logger.error("❌ Environment check failed. Please fix configuration and try again.")
        print_setup_instructions()
        sys.exit(1)
    
    if args.check_only:
        logger.info("✅ Configuration check completed successfully")
        return
    
    success = True
    
    # Set up Pub/Sub infrastructure
    if not setup_pubsub_infrastructure():
        success = False
    
    # Set up Gmail watch
    if args.user_id:
        if not setup_gmail_watch_user(args.user_id):
            success = False
    else:
        if not setup_gmail_watch_all_users():
            success = False
    
    if success:
        logger.info("\n🎉 Gmail Pub/Sub setup completed successfully!")
        logger.info("\nNext steps:")
        logger.info("1. Start the automation worker: python run_workers.py automation")
        logger.info("2. Test the webhook endpoint")
        logger.info("3. Create automations via the API or frontend")
    else:
        logger.error("\n❌ Setup completed with errors. Please check the logs above.")
        sys.exit(1)

if __name__ == "__main__":
    main()