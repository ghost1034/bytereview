from fastapi import APIRouter, HTTPException, Depends
import stripe
from typing import Optional, List
from sqlalchemy.orm import Session
from dependencies.auth import verify_firebase_token, get_current_user_email
from core.database import get_db
from services.billing_service import get_billing_service
from models.stripe import (
    CreateCheckoutSessionRequest, 
    CreatePortalSessionRequest,
    BillingAccountResponse,
    SubscriptionPlanResponse,
    UsageStatsResponse,
    SubscriptionStatus,
    CheckoutSessionResponse,
    PortalSessionResponse
)

router = APIRouter()

# ===================================================================
# Billing Account & Usage Endpoints
# ===================================================================

@router.get("/account", response_model=BillingAccountResponse)
async def get_billing_account(
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db)
):
    """Get user's billing account information"""
    billing_service = get_billing_service(db)
    billing_info = billing_service.get_billing_info(token_data["uid"])
    return BillingAccountResponse(**billing_info)

@router.get("/usage", response_model=UsageStatsResponse)
async def get_usage_stats(
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db)
):
    """Get current usage statistics"""
    billing_service = get_billing_service(db)
    billing_info = billing_service.get_billing_info(token_data["uid"])
    
    pages_remaining = max(0, billing_info['pages_included'] - billing_info['pages_used'])
    
    return UsageStatsResponse(
        pages_used=billing_info['pages_used'],
        pages_included=billing_info['pages_included'],
        pages_remaining=pages_remaining,
        automations_count=billing_info['automations_count'],
        automations_limit=billing_info['automations_limit'],
        period_start=billing_info['current_period_start'],
        period_end=billing_info['current_period_end'],
        plan_code=billing_info['plan_code'],
        plan_display_name=billing_info['plan_display_name']
    )

@router.get("/plans", response_model=List[SubscriptionPlanResponse])
async def get_subscription_plans(db: Session = Depends(get_db)):
    """Get all available subscription plans"""
    billing_service = get_billing_service(db)
    plans = billing_service.get_plans()
    return [SubscriptionPlanResponse(**plan) for plan in plans]

# ===================================================================
# Stripe Integration Endpoints
# ===================================================================

@router.post("/create-checkout-session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    request: CreateCheckoutSessionRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db)
):
    """Create a Stripe checkout session for plan upgrade"""
    try:
        billing_service = get_billing_service(db)
        checkout_url = billing_service.create_checkout_session(
            user_id=token_data["uid"],
            plan_code=request.plan_code,
            success_url=str(request.success_url),
            cancel_url=str(request.cancel_url)
        )
        return CheckoutSessionResponse(checkout_url=checkout_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/create-portal-session", response_model=PortalSessionResponse)
async def create_portal_session(
    request: CreatePortalSessionRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db)
):
    """Create a Stripe customer portal session"""
    try:
        billing_service = get_billing_service(db)
        portal_url = billing_service.create_portal_session(
            user_id=token_data["uid"],
            return_url=str(request.return_url)
        )
        return PortalSessionResponse(portal_url=portal_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ===================================================================
# Legacy Compatibility Endpoint
# ===================================================================

@router.get("/subscription-status", response_model=SubscriptionStatus)
async def get_subscription_status(
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db)
):
    """Get user's subscription status (legacy compatibility)"""
    try:
        billing_service = get_billing_service(db)
        billing_info = billing_service.get_billing_info(token_data["uid"])
        
        has_subscription = billing_info['plan_code'] != 'free'
        current_period_end = None
        
        if billing_info['current_period_end']:
            current_period_end = int(billing_info['current_period_end'].timestamp())
        
        return SubscriptionStatus(
            has_subscription=has_subscription,
            plan=billing_info['plan_code'],
            status=billing_info['status'],
            current_period_end=current_period_end
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))