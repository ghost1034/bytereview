"""
Admin endpoints for system management and setup
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from services.gmail_subscription_service import gmail_subscription_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.post("/setup-gmail-pubsub")
async def setup_gmail_pubsub(
    db: Session = Depends(get_db),
    admin_token: str = Query(..., description="Admin token for authentication")
):
    """
    Set up Gmail Pub/Sub infrastructure and watch for all users
    
    This endpoint should be called once during deployment to set up:
    1. Google Cloud Pub/Sub topic and subscription
    2. Gmail watch for all existing users with Google integrations
    """
    try:
        # Validate admin token
        import os
        expected_token = os.getenv('ADMIN_TOKEN')
        if not expected_token or admin_token != expected_token:
            raise HTTPException(status_code=401, detail="Invalid admin token")
        
        # Validate configuration first
        config_status = gmail_subscription_service.validate_configuration()
        if not config_status['valid']:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid configuration: {config_status['errors']}"
            )
        
        # Set up Pub/Sub infrastructure
        logger.info("Setting up Gmail Pub/Sub infrastructure...")
        pubsub_success = gmail_subscription_service.setup_pubsub_infrastructure()
        
        if not pubsub_success:
            raise HTTPException(
                status_code=500, 
                detail="Failed to set up Pub/Sub infrastructure"
            )
        
        # Set up Gmail watch for all users
        logger.info("Setting up Gmail watch for all users...")
        watch_results = gmail_subscription_service.setup_gmail_watch_for_all_users(db)
        
        return {
            "status": "success",
            "message": "Gmail Pub/Sub setup completed",
            "pubsub_setup": "successful",
            "gmail_watch_results": watch_results,
            "configuration": {
                "topic_name": gmail_subscription_service.get_topic_name(),
                "webhook_url": gmail_subscription_service.get_webhook_url()
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gmail Pub/Sub setup failed: {e}")
        raise HTTPException(status_code=500, detail=f"Setup failed: {str(e)}")

@router.post("/setup-gmail-watch/{user_id}")
async def setup_gmail_watch_for_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin_token: str = Query(..., description="Admin token for authentication")
):
    """
    Set up Gmail watch for a specific user
    
    This can be used to set up Gmail watch for new users or retry failed setups.
    """
    try:
        # Validate admin token
        import os
        expected_token = os.getenv('ADMIN_TOKEN')
        if not expected_token or admin_token != expected_token:
            raise HTTPException(status_code=401, detail="Invalid admin token")
        
        # Set up Gmail watch for the user
        success = gmail_subscription_service.setup_gmail_watch_for_user(db, user_id)
        
        if success:
            return {
                "status": "success",
                "message": f"Gmail watch setup successful for user {user_id}",
                "user_id": user_id
            }
        else:
            raise HTTPException(
                status_code=500, 
                detail=f"Gmail watch setup failed for user {user_id}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gmail watch setup failed for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Setup failed: {str(e)}")

@router.get("/gmail-pubsub-status")
async def get_gmail_pubsub_status(
    admin_token: str = Query(..., description="Admin token for authentication")
):
    """
    Get Gmail Pub/Sub configuration status
    """
    try:
        # Validate admin token
        import os
        expected_token = os.getenv('ADMIN_TOKEN')
        if not expected_token or admin_token != expected_token:
            raise HTTPException(status_code=401, detail="Invalid admin token")
        
        # Get configuration status
        config_status = gmail_subscription_service.validate_configuration()
        
        return {
            "configuration": config_status,
            "settings": {
                "topic_name": gmail_subscription_service.get_topic_name(),
                "webhook_url": gmail_subscription_service.get_webhook_url(),
                "project_id": os.getenv('GOOGLE_CLOUD_PROJECT_ID')
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get Gmail Pub/Sub status: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")