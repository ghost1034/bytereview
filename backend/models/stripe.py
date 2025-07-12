"""
Stripe-related data models
"""
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional

class CreateCheckoutSessionRequest(BaseModel):
    """Request to create a Stripe checkout session"""
    price_id: str = Field(..., description="Stripe price ID for the subscription")
    success_url: HttpUrl = Field(..., description="URL to redirect to on successful payment")
    cancel_url: HttpUrl = Field(..., description="URL to redirect to on cancelled payment")

class CreatePortalSessionRequest(BaseModel):
    """Request to create a Stripe customer portal session"""
    return_url: HttpUrl = Field(..., description="URL to return to from the portal")

class SubscriptionStatus(BaseModel):
    """User's subscription status information"""
    has_subscription: bool
    plan: str = Field(..., description="Plan name (free, starter, professional, enterprise)")
    status: Optional[str] = Field(None, description="Stripe subscription status")
    current_period_end: Optional[int] = Field(None, description="Unix timestamp of period end")

class CheckoutSessionResponse(BaseModel):
    """Response containing checkout session URL"""
    checkout_url: str

class PortalSessionResponse(BaseModel):
    """Response containing portal session URL"""
    portal_url: str