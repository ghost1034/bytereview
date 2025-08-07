"""
Webhook endpoints for external service integrations
"""
import logging
import os
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from services.gmail_pubsub_service import gmail_pubsub_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

async def verify_pubsub_request(request: Request):
    """
    Simple authentication for development/testing
    
    For production, this should be replaced with proper Google Cloud Pub/Sub JWT verification.
    Currently using a simple approach for development.
    """
    # For development: Allow requests from localhost or with a simple check
    # In production, implement proper JWT verification
    
    # Check if request is from localhost (development)
    client_host = request.client.host if request.client else None
    if client_host in ['127.0.0.1', 'localhost', '::1']:
        logger.info("Allowing request from localhost for development")
        return
    
    # Check for a simple development token
    dev_token = os.getenv('GMAIL_PUBSUB_DEV_TOKEN')
    if dev_token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header == f'Bearer {dev_token}':
            logger.info("Allowing request with development token")
            return
    
    # For now, allow all requests in development
    # TODO: Implement proper JWT verification for production
    logger.warning("Allowing unauthenticated request for development - implement proper auth for production")
    return

@router.post("/gmail-push")
async def gmail_push_webhook(
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(verify_pubsub_request)
):
    """
    Handle Gmail Pub/Sub push notifications
    
    This endpoint receives notifications when Gmail messages are received
    and triggers automations for users who have Gmail automations configured.
    
    Security: Simple authentication for development. Implement proper JWT verification for production.
    """
    try:
        
        # Get request body
        try:
            body = await request.json()
        except Exception as e:
            logger.error(f"Failed to parse webhook body: {e}")
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        
        logger.info(f"Received Gmail push notification: {body}")
        
        # Process the push notification
        notification_data = gmail_pubsub_service.process_push_notification(body)
        if not notification_data:
            logger.warning("Failed to process push notification data")
            return {"status": "ignored", "reason": "Invalid notification data"}
        
        # Get user ID from email address
        email_address = notification_data['email_address']
        user_id = gmail_pubsub_service.get_user_id_from_email(db, email_address)
        
        if not user_id:
            logger.info(f"No user found for email {email_address}, ignoring notification")
            return {"status": "ignored", "reason": "No user found for email"}
        
        # Trigger automations for the user
        trigger_result = await gmail_pubsub_service.trigger_automations_for_user(
            db, user_id, notification_data
        )
        
        if trigger_result['success']:
            logger.info(f"Successfully triggered automations for user {user_id}")
            return {
                "status": "success",
                "user_id": user_id,
                "email_address": email_address,
                "automation_job_id": trigger_result['job_id']
            }
        else:
            logger.error(f"Failed to trigger automations: {trigger_result['error']}")
            return {
                "status": "error",
                "user_id": user_id,
                "email_address": email_address,
                "error": trigger_result['error']
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gmail webhook error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/gmail-push")
async def gmail_push_verification(
    request: Request,
    _: None = Depends(verify_pubsub_request)
):
    """
    Handle Gmail Pub/Sub subscription verification
    
    Google Cloud Pub/Sub may send a GET request to verify the webhook endpoint
    during subscription setup. Simple authentication for development.
    """
    try:
        logger.info("Gmail Pub/Sub webhook verification successful")
        return {"status": "verified", "message": "Gmail webhook endpoint verified"}
        
    except Exception as e:
        logger.error(f"Gmail webhook verification error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/test-automation")
async def test_automation_trigger(
    request: Request,
    db: Session = Depends(get_db),
    user_id: str = Query(..., description="User ID to test"),
    token: str = Query(None, description="Test token")
):
    """
    Test endpoint for triggering automations manually (development/testing only)
    """
    try:
        # Validate token
        if not token or not gmail_pubsub_service.validate_pub_sub_token(token):
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Create mock notification data
        mock_notification = {
            'email_address': f'test-{user_id}@example.com',
            'history_id': '12345',
            'raw_data': {'test': True}
        }
        
        # Trigger automations
        trigger_result = await gmail_pubsub_service.trigger_automations_for_user(
            db, user_id, mock_notification
        )
        
        return {
            "status": "test_completed",
            "user_id": user_id,
            "result": trigger_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Test automation trigger error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")