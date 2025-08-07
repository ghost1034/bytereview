"""
Billing and subscription-related data models
"""
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List
from datetime import datetime

class CreateCheckoutSessionRequest(BaseModel):
    """Request to create a Stripe checkout session"""
    plan_code: str = Field(..., description="Plan code (basic, pro)")
    success_url: HttpUrl = Field(..., description="URL to redirect to on successful payment")
    cancel_url: HttpUrl = Field(..., description="URL to redirect to on cancelled payment")

class CreatePortalSessionRequest(BaseModel):
    """Request to create a Stripe customer portal session"""
    return_url: HttpUrl = Field(..., description="URL to return to from the portal")

class BillingAccountResponse(BaseModel):
    """User's billing account information"""
    user_id: str
    plan_code: str
    plan_display_name: str
    pages_included: int
    pages_used: int
    automations_limit: int
    automations_count: int
    overage_cents: int
    current_period_start: Optional[datetime]
    current_period_end: Optional[datetime]
    status: str
    stripe_customer_id: Optional[str]
    stripe_subscription_id: Optional[str]

class SubscriptionPlanResponse(BaseModel):
    """Subscription plan information"""
    code: str
    display_name: str
    pages_included: int
    automations_limit: int
    overage_cents: int
    stripe_price_recurring_id: Optional[str]
    sort_order: int

class UsageStatsResponse(BaseModel):
    """Usage statistics for current period"""
    pages_used: int
    pages_included: int
    pages_remaining: int
    automations_count: int
    automations_limit: int
    period_start: Optional[datetime]
    period_end: Optional[datetime]
    plan_code: str
    plan_display_name: str

class CheckoutSessionResponse(BaseModel):
    """Response containing checkout session URL"""
    checkout_url: str

class PortalSessionResponse(BaseModel):
    """Response containing portal session URL"""
    portal_url: str

# Legacy compatibility
class SubscriptionStatus(BaseModel):
    """Legacy subscription status (for backward compatibility)"""
    has_subscription: bool
    plan: str = Field(..., description="Plan name (free, basic, pro)")
    status: Optional[str] = Field(None, description="Stripe subscription status")
    current_period_end: Optional[int] = Field(None, description="Unix timestamp of period end")