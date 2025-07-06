from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import stripe
from typing import Optional
from .auth import verify_firebase_token

router = APIRouter()

class CreateCheckoutSessionRequest(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str

class CreatePortalSessionRequest(BaseModel):
    return_url: str

@router.post("/create-checkout-session")
async def create_checkout_session(
    request: CreateCheckoutSessionRequest,
    token_data: dict = Depends(verify_firebase_token)
):
    """Create a Stripe checkout session"""
    try:
        # Get or create customer
        customer_email = token_data.get("email")
        customer = None
        
        if customer_email:
            customers = stripe.Customer.list(email=customer_email, limit=1)
            if customers.data:
                customer = customers.data[0]
            else:
                customer = stripe.Customer.create(
                    email=customer_email,
                    metadata={"firebase_uid": token_data["uid"]}
                )

        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=customer.id if customer else None,
            payment_method_types=['card'],
            line_items=[{
                'price': request.price_id,
                'quantity': 1,
            }],
            mode='subscription',
            success_url=request.success_url,
            cancel_url=request.cancel_url,
            metadata={"firebase_uid": token_data["uid"]}
        )

        return {"checkout_url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/create-portal-session")
async def create_portal_session(
    request: CreatePortalSessionRequest,
    token_data: dict = Depends(verify_firebase_token)
):
    """Create a Stripe customer portal session"""
    try:
        # Find customer by email
        customer_email = token_data.get("email")
        if not customer_email:
            raise HTTPException(status_code=400, detail="User email not found")

        customers = stripe.Customer.list(email=customer_email, limit=1)
        if not customers.data:
            raise HTTPException(status_code=404, detail="Customer not found")

        customer = customers.data[0]

        # Create portal session
        session = stripe.billing_portal.Session.create(
            customer=customer.id,
            return_url=request.return_url,
        )

        return {"portal_url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/subscription-status")
async def get_subscription_status(token_data: dict = Depends(verify_firebase_token)):
    """Get user's subscription status"""
    try:
        customer_email = token_data.get("email")
        if not customer_email:
            return {"has_subscription": False, "plan": "free"}

        customers = stripe.Customer.list(email=customer_email, limit=1)
        if not customers.data:
            return {"has_subscription": False, "plan": "free"}

        customer = customers.data[0]
        subscriptions = stripe.Subscription.list(customer=customer.id, status="active")

        if subscriptions.data:
            subscription = subscriptions.data[0]
            price_id = subscription.items.data[0].price.id
            
            # Map price IDs to plan names (you'll need to update these with your actual price IDs)
            plan_mapping = {
                "price_starter": "starter",
                "price_professional": "professional", 
                "price_enterprise": "enterprise"
            }
            
            plan = plan_mapping.get(price_id, "unknown")
            
            return {
                "has_subscription": True,
                "plan": plan,
                "status": subscription.status,
                "current_period_end": subscription.current_period_end
            }

        return {"has_subscription": False, "plan": "free"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))