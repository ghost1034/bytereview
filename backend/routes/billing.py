"""
Billing and subscription management routes
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List

from dependencies.auth import get_current_user_id
from core.database import get_db
from services.billing_service import get_billing_service
from models.stripe import (
    BillingAccountResponse,
    SubscriptionPlanResponse,
    UsageStatsResponse
)

router = APIRouter(prefix="/api/billing", tags=["billing"])

@router.get("/account", response_model=BillingAccountResponse)
async def get_billing_account(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get user's billing account information"""
    try:
        billing_service = get_billing_service(db)
        billing_info = billing_service.get_billing_info(user_id)
        return BillingAccountResponse(**billing_info)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get billing account: {str(e)}")

@router.get("/usage", response_model=UsageStatsResponse)
async def get_usage_stats(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Get current usage statistics"""
    try:
        billing_service = get_billing_service(db)
        billing_info = billing_service.get_billing_info(user_id)
        
        pages_remaining = max(0, billing_info['pages_included'] - billing_info['pages_used'])
        tokens_remaining = max(0, billing_info['tokens_included'] - billing_info['tokens_used'])
        
        return UsageStatsResponse(
            pages_used=billing_info['pages_used'],
            pages_included=billing_info['pages_included'],
            pages_remaining=pages_remaining,
            tokens_used=billing_info['tokens_used'],
            tokens_included=billing_info['tokens_included'],
            tokens_remaining=tokens_remaining,
            period_start=billing_info['current_period_start'],
            period_end=billing_info['current_period_end'],
            plan_code=billing_info['plan_code'],
            plan_display_name=billing_info['plan_display_name'],
            overage_cents=billing_info['overage_cents'],
            token_overage_cents=billing_info['token_overage_cents'],
            token_billing_effective_at=billing_info['token_billing_effective_at'],
            token_billing_shadow=billing_info['token_billing_shadow'],
            product_breakdown=billing_info['product_breakdown'],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get usage stats: {str(e)}")

@router.get("/plans", response_model=List[SubscriptionPlanResponse])
async def get_subscription_plans(db: Session = Depends(get_db)):
    """Get all available subscription plans"""
    try:
        billing_service = get_billing_service(db)
        plans = billing_service.get_plans()
        return [SubscriptionPlanResponse(**plan) for plan in plans]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get plans: {str(e)}")

@router.get("/limits/check")
async def check_limits(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Check current plan limits and usage"""
    try:
        billing_service = get_billing_service(db)
        billing_info = billing_service.get_billing_info(user_id)
        
        # Check if user can enable more automations
        can_enable_automation = billing_service.check_automation_limit(user_id)
        
        # Check if user can process more pages (for free plan)
        can_process_pages = billing_service.check_limit(user_id, "page", 1)
        can_process_tokens = billing_service.check_limit(user_id, "token", 1)
        
        return {
            "plan_code": billing_info['plan_code'],
            "plan_display_name": billing_info['plan_display_name'],
            "pages": {
                "used": billing_info['pages_used'],
                "included": billing_info['pages_included'],
                "remaining": max(0, billing_info['pages_included'] - billing_info['pages_used']),
                "can_process_more": can_process_pages
            },
            "tokens": {
                "used": billing_info['tokens_used'],
                "included": billing_info['tokens_included'],
                "remaining": max(0, billing_info['tokens_included'] - billing_info['tokens_used']),
                "can_process_more": can_process_tokens,
                "shadow": billing_info['token_billing_shadow'],
                "billing_effective_at": billing_info['token_billing_effective_at'],
            },
            "automations": {
                "count": billing_info['automations_count'],
                "limit": billing_info['automations_limit'],
                "can_enable_more": can_enable_automation
            },
            "period": {
                "start": billing_info['current_period_start'],
                "end": billing_info['current_period_end']
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check limits: {str(e)}")
