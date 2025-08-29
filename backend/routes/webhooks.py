"""
Webhook endpoints for external service integrations
"""
import logging
import os
import stripe
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from services.gmail_pubsub_service import gmail_pubsub_service
from services.billing_service import get_billing_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

# Stripe webhook endpoint secret
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

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

@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """Handle Stripe webhook events for billing and subscription management"""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    if not STRIPE_WEBHOOK_SECRET:
        logger.error("Stripe webhook secret not configured")
        raise HTTPException(status_code=500, detail="Stripe webhook secret not configured")
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        logger.error(f"Invalid Stripe webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Invalid Stripe webhook signature: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    billing_service = get_billing_service(db)
    
    try:
        # Handle the event
        if event['type'] == 'checkout.session.completed':
            logger.info(f"Processing checkout.session.completed: {event['data']['object']['id']}")
            session = event['data']['object']
            billing_service.handle_checkout_completed(session)
            
        elif event['type'] == 'customer.subscription.updated':
            logger.info(f"Processing customer.subscription.updated: {event['data']['object']['id']}")
            subscription = event['data']['object']
            billing_service.handle_subscription_updated(subscription)
            
        elif event['type'] == 'customer.subscription.deleted':
            logger.info(f"Processing customer.subscription.deleted: {event['data']['object']['id']}")
            subscription = event['data']['object']
            billing_service.handle_subscription_deleted(subscription)
            
        elif event['type'] == 'invoice.finalized':
            logger.info(f"Processing invoice.finalized: {event['data']['object']['id']}")
            # Optional: Add reconciliation logic here
            pass
        else:
            logger.info(f"Unhandled Stripe event type: {event['type']}")
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Error processing Stripe webhook: {e}")
        raise HTTPException(status_code=500, detail="Error processing webhook")

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
        
        # Process Gmail history using stored cursor (proper Gmail Pub/Sub pattern)
        logger.info("Calling gmail_pubsub_service.process_history_with_cursor()")
        new_messages = gmail_pubsub_service.process_history_with_cursor(db)
        logger.info(f"Gmail Pub/Sub service returned {len(new_messages)} new messages")
        
        # Debug: log each message
        for i, msg in enumerate(new_messages):
            logger.info(f"Message {i+1}: {msg}")
        
        if not new_messages:
            logger.info("No new messages found in history")
            return {"status": "ignored", "reason": "No new messages"}
        
        # Process each new message
        processed_messages = []
        for message in new_messages:
            logger.info(f"Processing message: {message}")
            sender_email = message.get('sender_email')
            if not sender_email:
                logger.warning("No sender email found in message")
                continue
            
            # Get user ID from sender email
            user_id = gmail_pubsub_service.get_user_id_from_sender_email(db, sender_email)
            if not user_id:
                logger.info(f"No user found for sender email {sender_email}, ignoring message")
                continue
            
            logger.info(f"Triggering automations for user {user_id} with message data: {message}")
            # Trigger automations for the user
            trigger_result = await gmail_pubsub_service.trigger_automations_for_email(
                db, user_id, message
            )
            
            processed_messages.append({
                'sender_email': sender_email,
                'user_id': user_id,
                'trigger_result': trigger_result
            })
        
        if not processed_messages:
            return {"status": "ignored", "reason": "No messages matched any users"}
        
        # Return summary of processed messages
        successful_triggers = [m for m in processed_messages if m['trigger_result']['success']]
        trigger_result = {
            'success': len(successful_triggers) > 0,
            'processed_count': len(processed_messages),
            'successful_count': len(successful_triggers)
        }
        
        if trigger_result['success']:
            logger.info(f"Successfully processed {trigger_result['successful_count']} messages")
            return {
                "status": "success",
                "processed_messages": trigger_result['processed_count'],
                "successful_triggers": trigger_result['successful_count'],
                "messages": processed_messages
            }
        else:
            logger.error(f"Failed to trigger any automations from {trigger_result['processed_count']} messages")
            return {
                "status": "partial_success",
                "processed_messages": trigger_result['processed_count'],
                "successful_triggers": trigger_result['successful_count'],
                "messages": processed_messages
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