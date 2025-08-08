"""
Billing service for subscription management, usage tracking, and Stripe integration
"""
import os
import stripe
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import text, and_, or_
from fastapi import HTTPException

from models.db_models import (
    User, BillingAccount, SubscriptionPlan, UsageEvent, UsageCounter,
    ExtractionTask, SourceFile
)
from core.database import get_db

logger = logging.getLogger(__name__)


class PlanLimitExceeded(Exception):
    """Raised when user exceeds their plan limits"""
    pass


class BillingService:
    def __init__(self, db: Session):
        self.db = db

    def get_or_create_billing_account(self, user_id: str) -> BillingAccount:
        """Get or create billing account for user, defaulting to free plan"""
        billing_account = self.db.query(BillingAccount).filter(
            BillingAccount.user_id == user_id
        ).first()
        
        if not billing_account:
            # Create free plan billing account with current month period
            now = datetime.now(timezone.utc)
            period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)
            
            billing_account = BillingAccount(
                user_id=user_id,
                plan_code='free',
                current_period_start=period_start,
                current_period_end=period_end,
                status='active'
            )
            self.db.add(billing_account)
            
            # Create initial usage counter
            usage_counter = UsageCounter(
                user_id=user_id,
                period_start=period_start,
                period_end=period_end,
                pages_total=0
            )
            self.db.add(usage_counter)
            self.db.commit()
            
        return billing_account

    def get_billing_info(self, user_id: str) -> Dict[str, Any]:
        """Get comprehensive billing information for user"""
        billing_account = self.get_or_create_billing_account(user_id)
        
        # Get plan details
        plan = self.db.query(SubscriptionPlan).filter(
            SubscriptionPlan.code == billing_account.plan_code
        ).first()
        
        # Get current usage
        usage_counter = self.db.query(UsageCounter).filter(
            and_(
                UsageCounter.user_id == user_id,
                UsageCounter.period_start == billing_account.current_period_start
            )
        ).first()
        
        pages_used = usage_counter.pages_total if usage_counter else 0
        
        # Count enabled automations
        from models.db_models import Automation
        automations_count = self.db.query(Automation).filter(
            and_(
                Automation.user_id == user_id,
                Automation.is_enabled == True
            )
        ).count()
        
        return {
            'user_id': user_id,
            'plan_code': billing_account.plan_code,
            'plan_display_name': plan.display_name if plan else 'Unknown',
            'pages_included': plan.pages_included if plan else 0,
            'pages_used': pages_used,
            'automations_limit': plan.automations_limit if plan else 0,
            'automations_count': automations_count,
            'overage_cents': plan.overage_cents if plan else 0,
            'current_period_start': billing_account.current_period_start,
            'current_period_end': billing_account.current_period_end,
            'status': billing_account.status,
            'stripe_customer_id': billing_account.stripe_customer_id,
            'stripe_subscription_id': billing_account.stripe_subscription_id
        }

    def check_page_limit(self, user_id: str, additional_pages: int) -> bool:
        """Check if user can process additional pages without exceeding limits"""
        billing_info = self.get_billing_info(user_id)
        
        # Free plan has hard cap
        if billing_info['plan_code'] == 'free':
            total_after = billing_info['pages_used'] + additional_pages
            return total_after <= billing_info['pages_included']
        
        # Paid plans allow overage
        return True

    def check_automation_limit(self, user_id: str) -> bool:
        """Check if user can enable another automation"""
        billing_info = self.get_billing_info(user_id)
        return billing_info['automations_count'] < billing_info['automations_limit']

    def record_usage(self, user_id: str, pages: int, source: str, task_id: Optional[str] = None, notes: Optional[str] = None) -> str:
        """Record usage event and update counters"""
        if pages <= 0:
            return None
            
        billing_account = self.get_or_create_billing_account(user_id)
        
        # Check limits for free plan
        if billing_account.plan_code == 'free':
            if not self.check_page_limit(user_id, pages):
                raise PlanLimitExceeded("Page limit exceeded for free plan")
        
        # Create usage event
        event_id = str(uuid.uuid4())
        usage_event = UsageEvent(
            id=event_id,
            user_id=user_id,
            source=source,
            task_id=task_id,
            pages=pages,
            notes=notes
        )
        self.db.add(usage_event)
        
        # Update usage counter (upsert)
        self.db.execute(text("""
            INSERT INTO usage_counters(user_id, period_start, period_end, pages_total)
            VALUES (:user_id, :period_start, :period_end, :pages)
            ON CONFLICT (user_id, period_start) DO UPDATE
            SET pages_total = usage_counters.pages_total + EXCLUDED.pages_total
        """), {
            'user_id': user_id,
            'period_start': billing_account.current_period_start,
            'period_end': billing_account.current_period_end,
            'pages': pages
        })
        
        self.db.commit()
        
        # Report to Stripe for paid plans (async)
        if billing_account.plan_code in ('basic', 'pro'):
            self._report_usage_to_stripe_async(user_id, pages, event_id)
        
        return event_id

    def _report_usage_to_stripe_async(self, user_id: str, pages: int, event_id: str):
        """Report usage to Stripe using the new meter-based billing system"""
        try:
            billing_account = self.db.query(BillingAccount).filter(
                BillingAccount.user_id == user_id
            ).first()
            
            if not billing_account or not billing_account.stripe_customer_id:
                return
            
            # Get the shared meter ID from environment
            meter_id = os.getenv("STRIPE_METER_PAGES")
            if not meter_id:
                print("Warning: STRIPE_METER_PAGES not configured")
                return
            
            # Report usage to Stripe meter
            meter_event = stripe.billing.MeterEvent.create(
                event_name="bytereview_pages",
                payload={
                    "stripe_customer_id": billing_account.stripe_customer_id,
                    "value": pages
                },
                timestamp=int(datetime.now(timezone.utc).timestamp()),
                idempotency_key=f"usage_event/{event_id}"
            )
            
            # Mark as reported
            self.db.query(UsageEvent).filter(UsageEvent.id == event_id).update({
                'stripe_reported': True,
                'stripe_record_id': meter_event.identifier
            })
            self.db.commit()
            
        except Exception as e:
            # Log error but don't fail the main operation
            print(f"Failed to report usage to Stripe: {e}")

    def create_checkout_session(self, user_id: str, plan_code: str, success_url: str, cancel_url: str) -> str:
        """Create Stripe checkout session for plan upgrade"""
        plan = self.db.query(SubscriptionPlan).filter(
            SubscriptionPlan.code == plan_code
        ).first()
        
        if not plan or not plan.stripe_price_recurring_id:
            raise HTTPException(status_code=400, detail="Invalid plan")
        
        billing_account = self.get_or_create_billing_account(user_id)
        user = self.db.query(User).filter(User.id == user_id).first()
        
        # Get or create Stripe customer
        customer = None
        if billing_account.stripe_customer_id:
            try:
                customer = stripe.Customer.retrieve(billing_account.stripe_customer_id)
            except:
                pass
        
        if not customer:
            customer = stripe.Customer.create(
                email=user.email,
                metadata={"user_id": user_id}
            )
            billing_account.stripe_customer_id = customer.id
            self.db.commit()
        
        # Create line items for both recurring and metered pricing
        line_items = [
            {
                'price': plan.stripe_price_recurring_id,
                'quantity': 1,
            },
            {
                'price': plan.stripe_price_metered_id,
            }
        ]
        
        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=customer.id,
            payment_method_types=['card'],
            line_items=line_items,
            mode='subscription',
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": user_id, "plan_code": plan_code}
        )
        
        return session.url

    def create_portal_session(self, user_id: str, return_url: str) -> str:
        """Create Stripe customer portal session"""
        billing_account = self.get_or_create_billing_account(user_id)
        
        if not billing_account.stripe_customer_id:
            raise HTTPException(status_code=400, detail="No Stripe customer found")
        
        session = stripe.billing_portal.Session.create(
            customer=billing_account.stripe_customer_id,
            return_url=return_url,
        )
        
        return session.url

    def handle_checkout_completed(self, session: Dict[str, Any]):
        """Handle successful checkout completion"""
        user_id = session['metadata']['user_id']
        plan_code = session['metadata']['plan_code']
        
        billing_account = self.get_or_create_billing_account(user_id)
        
        # Get subscription from Stripe
        subscription = stripe.Subscription.retrieve(session['subscription'])
        
        # Update billing account
        billing_account.plan_code = plan_code
        billing_account.stripe_subscription_id = subscription.id
        billing_account.current_period_start = datetime.fromtimestamp(
            subscription.current_period_start, tz=timezone.utc
        )
        billing_account.current_period_end = datetime.fromtimestamp(
            subscription.current_period_end, tz=timezone.utc
        )
        billing_account.status = subscription.status
        
        # Create usage counter for new period
        usage_counter = UsageCounter(
            user_id=user_id,
            period_start=billing_account.current_period_start,
            period_end=billing_account.current_period_end,
            pages_total=0
        )
        self.db.merge(usage_counter)  # Use merge to handle conflicts
        self.db.commit()

    def handle_subscription_updated(self, subscription: Dict[str, Any]):
        """Handle subscription updates from Stripe"""
        # Find billing account by subscription ID
        billing_account = self.db.query(BillingAccount).filter(
            BillingAccount.stripe_subscription_id == subscription['id']
        ).first()
        
        if not billing_account:
            return
        
        # Update period dates
        new_period_start = datetime.fromtimestamp(
            subscription['current_period_start'], tz=timezone.utc
        )
        new_period_end = datetime.fromtimestamp(
            subscription['current_period_end'], tz=timezone.utc
        )
        
        # Check if period changed
        if billing_account.current_period_start != new_period_start:
            billing_account.current_period_start = new_period_start
            billing_account.current_period_end = new_period_end
            
            # Create new usage counter for new period
            usage_counter = UsageCounter(
                user_id=billing_account.user_id,
                period_start=new_period_start,
                period_end=new_period_end,
                pages_total=0
            )
            self.db.merge(usage_counter)
        
        billing_account.status = subscription['status']
        self.db.commit()

    def handle_subscription_deleted(self, subscription: Dict[str, Any]):
        """Handle subscription cancellation"""
        billing_account = self.db.query(BillingAccount).filter(
            BillingAccount.stripe_subscription_id == subscription['id']
        ).first()
        
        if not billing_account:
            return
        
        # Downgrade to free plan
        billing_account.plan_code = 'free'
        billing_account.stripe_subscription_id = None
        billing_account.status = 'active'
        
        # Set free plan period (calendar month)
        now = datetime.now(timezone.utc)
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)
        
        billing_account.current_period_start = period_start
        billing_account.current_period_end = period_end
        
        # Create usage counter for free plan period
        usage_counter = UsageCounter(
            user_id=billing_account.user_id,
            period_start=period_start,
            period_end=period_end,
            pages_total=0
        )
        self.db.merge(usage_counter)
        self.db.commit()

    def get_plans(self) -> List[Dict[str, Any]]:
        """Get all available subscription plans"""
        plans = self.db.query(SubscriptionPlan).filter(
            SubscriptionPlan.is_active == True
        ).order_by(SubscriptionPlan.sort_order).all()
        
        return [
            {
                'code': plan.code,
                'display_name': plan.display_name,
                'pages_included': plan.pages_included,
                'automations_limit': plan.automations_limit,
                'overage_cents': plan.overage_cents,
                'stripe_price_recurring_id': plan.stripe_price_recurring_id,
                'sort_order': plan.sort_order
            }
            for plan in plans
        ]


def get_billing_service(db: Session = None) -> BillingService:
    """Get billing service instance"""
    if db is None:
        db = next(get_db())
    return BillingService(db)