"""
Billing service for subscription management, usage tracking, and Stripe integration.
Hardened for Basil-era Stripe API where Subscription period fields may live on items.
"""

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple

import stripe

# Ensure Stripe is initialized in any entrypoint that imports this module (API or workers)
# Use environment variables only, consistent with other settings
if not getattr(stripe, "api_key", None):
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe.api_key:
        # Do not raise here to avoid crashing workers; calls will log errors if used without key
        logging.getLogger(__name__).warning("STRIPE_SECRET_KEY is not set; Stripe calls will fail.")

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text, and_

from core.database import get_db
from models.db_models import (
    User,
    BillingAccount,
    SubscriptionPlan,
    UsageEvent,
    UsageCounter,
    ExtractionTask,   # kept for future hooks
    SourceFile,       # kept for future hooks
    Automation,
)

logger = logging.getLogger(__name__)


# Tokens-to-pages conversion for analytics LLM calls.
# Defaults to 2000 tokens/page; tunable via env in case we recalibrate later.
TOKENS_PER_PAGE = int(os.getenv("ANALYTICS_TOKENS_PER_PAGE", "2000"))


# Allowed `source` values for analytics UsageEvent rows. Routes use these
# constants so the value space stays explicit and greppable.
ANALYTICS_SOURCES = {
    "analytics_variance_threshold",
    "analytics_variance_analyze",
    "analytics_variance_memo",
    "analytics_recon_rules",
    "analytics_recon_additional_pass",
    "analytics_recon_match",
    "analytics_recon_basic",
    "analytics_amort_extract",
    "analytics_amort_compliance",
    "analytics_waterfall_extract",
    "analytics_document_extract",
    "analytics_chat_assistant",
    "analytics_chat_irs",
    "analytics_chat_gaap",
    "analytics_chat_basic",
}


def tokens_to_pages(prompt_tokens: Optional[int], output_tokens: Optional[int]) -> int:
    """Convert a (prompt, output) token pair to billable pages.

    Returns `ceil((prompt + output) / TOKENS_PER_PAGE)` with a floor of 1 page
    whenever at least one token was produced. Missing token counts contribute 0.
    """
    p = int(prompt_tokens or 0)
    o = int(output_tokens or 0)
    total = p + o
    if total <= 0:
        return 0
    # ceiling division
    return max(1, -(-total // TOKENS_PER_PAGE))


class PlanLimitExceeded(Exception):
    """Raised when user exceeds their plan limits."""
    pass


# ---------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------

def _month_bounds_utc(now: datetime) -> Tuple[datetime, datetime]:
    """Return (period_start, period_end) for the calendar month containing `now`."""
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
    next_month = (start + timedelta(days=32)).replace(day=1)
    end = next_month - timedelta(seconds=1)
    return start, end


def _coerce_uuid(value: Any) -> Optional[uuid.UUID]:
    if value in (None, ""):
        return None
    if isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))


def _get_object_value(obj: Any, key: str, default: Any = None) -> Any:
    """Read a field from dict-like or attribute-based webhook payload objects."""
    if obj is None:
        return default

    if isinstance(obj, dict):
        return obj.get(key, default)

    getter = getattr(obj, "get", None)
    if callable(getter):
        try:
            return getter(key, default)
        except TypeError:
            try:
                return getter(key)
            except Exception:
                pass
        except Exception:
            pass

    value = getattr(obj, key, None)
    if value is not None:
        return value

    try:
        return obj[key]
    except Exception:
        return default


def _extract_period_from_subscription(sub: Any) -> Tuple[Optional[int], Optional[int]]:
    """
    Extract (current_period_start, current_period_end) from a Subscription object/dict.

    Supports both:
      - Older Stripe API (fields on subscription root)
      - Basil-era API (fields on each subscription_item)
      - Fallback to latest_invoice.period if needed

    Returns epoch seconds (int) or (None, None) if not found.
    """
    # 1) Try top-level (older API versions)
    cps = getattr(sub, "current_period_start", None)
    cpe = getattr(sub, "current_period_end", None)
    if cps and cpe:
        return int(cps), int(cpe)

    if isinstance(sub, dict):
        cps = sub.get("current_period_start")
        cpe = sub.get("current_period_end")
        if cps and cpe:
            return int(cps), int(cpe)

    # 2) Try subscription items (Basil-era API)
    items = getattr(sub, "items", None)
    data = getattr(items, "data", None) if items is not None else None
    if not data and isinstance(sub, dict):
        data = ((sub.get("items") or {}).get("data")) or None

    if data:
        starts: List[int] = []
        ends: List[int] = []
        for it in data:
            if hasattr(it, "current_period_start") or isinstance(it, dict):
                s = getattr(it, "current_period_start", None) if not isinstance(it, dict) else it.get("current_period_start")
                e = getattr(it, "current_period_end", None) if not isinstance(it, dict) else it.get("current_period_end")
                if s is not None:
                    starts.append(int(s))
                if e is not None:
                    ends.append(int(e))
        if starts and ends:
            # Usually identical across items; be safe and bound them.
            return min(starts), max(ends)

    # 3) Fallback: latest invoice period
    inv_id = getattr(sub, "latest_invoice", None)
    if not inv_id and isinstance(sub, dict):
        inv_id = sub.get("latest_invoice")
    if inv_id:
        try:
            inv = stripe.Invoice.retrieve(inv_id)
            ps = getattr(inv, "period_start", None) if not isinstance(inv, dict) else inv.get("period_start")
            pe = getattr(inv, "period_end", None) if not isinstance(inv, dict) else inv.get("period_end")
            if ps and pe:
                return int(ps), int(pe)
        except Exception as e:
            logger.warning(f"Failed to retrieve invoice {inv_id} for period fallback: {e}")

    return None, None


def _extract_price_ids_from_subscription(sub: Any) -> List[str]:
    """Extract all price ids attached to a subscription's items."""
    items = getattr(sub, "items", None)
    data = getattr(items, "data", None) if items is not None else None
    if not data and isinstance(sub, dict):
        data = ((sub.get("items") or {}).get("data")) or None

    price_ids: List[str] = []
    for item in data or []:
        price = getattr(item, "price", None) if not isinstance(item, dict) else item.get("price")
        if not price:
            continue
        price_id = getattr(price, "id", None) if not isinstance(price, dict) else price.get("id")
        if price_id:
            price_ids.append(str(price_id))

    return price_ids


# ---------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------

class BillingService:
    def __init__(self, db: Session):
        self.db = db

    def _resolve_plan_code_from_subscription(self, sub: Any) -> Optional[str]:
        """Map a Stripe subscription's item prices back to a local plan code."""
        price_ids = set(_extract_price_ids_from_subscription(sub))
        if not price_ids:
            return None

        plans = (
            self.db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.is_active.is_(True))
            .all()
        )

        best_plan_code: Optional[str] = None
        best_score = 0
        for plan in plans:
            score = 0
            if plan.stripe_price_recurring_id and plan.stripe_price_recurring_id in price_ids:
                score += 2
            if plan.stripe_price_metered_id and plan.stripe_price_metered_id in price_ids:
                score += 1
            if score > best_score:
                best_plan_code = plan.code
                best_score = score

        return best_plan_code

    # ------------------------ Accounts & Plans ------------------------

    def get_or_create_billing_account(self, user_id: str) -> BillingAccount:
        """Fetch the user's billing account; create a Free one if absent."""
        acct = self.db.query(BillingAccount).filter(BillingAccount.user_id == user_id).first()
        if acct:
            return acct

        now = datetime.now(timezone.utc)
        period_start, period_end = _month_bounds_utc(now)

        acct = BillingAccount(
            user_id=user_id,
            plan_code="free",
            current_period_start=period_start,
            current_period_end=period_end,
            status="active",
        )
        self.db.add(acct)

        # Ensure a counter row for the current period
        counter = UsageCounter(
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
            pages_total=0,
        )
        self.db.merge(counter)
        self.db.commit()
        return acct

    def get_billing_info(self, user_id: str) -> Dict[str, Any]:
        """Return merged plan + usage + automation info for UI and guards."""
        acct = self.get_or_create_billing_account(user_id)

        plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.code == acct.plan_code).first()

        counter = (
            self.db.query(UsageCounter)
            .filter(and_(UsageCounter.user_id == user_id, UsageCounter.period_start == acct.current_period_start))
            .first()
        )
        pages_used = counter.pages_total if counter else 0

        automations_count = (
            self.db.query(Automation)
            .filter(and_(Automation.user_id == user_id, Automation.is_enabled.is_(True)))
            .count()
        )

        return {
            "user_id": user_id,
            "plan_code": acct.plan_code,
            "plan_display_name": plan.display_name if plan else "Unknown",
            "pages_included": plan.pages_included if plan else 0,
            "pages_used": pages_used,
            "automations_limit": plan.automations_limit if plan else 0,
            "automations_count": automations_count,
            "overage_cents": plan.overage_cents if plan else 0,
            "current_period_start": acct.current_period_start,
            "current_period_end": acct.current_period_end,
            "status": acct.status,
            "stripe_customer_id": acct.stripe_customer_id,
            "stripe_subscription_id": acct.stripe_subscription_id,
        }

    def get_plans(self) -> List[Dict[str, Any]]:
        """Return active plans for UI."""
        plans = (
            self.db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.is_active.is_(True))
            .order_by(SubscriptionPlan.sort_order)
            .all()
        )
        return [
            {
                "code": p.code,
                "display_name": p.display_name,
                "pages_included": p.pages_included,
                "automations_limit": p.automations_limit,
                "overage_cents": p.overage_cents,
                "stripe_price_recurring_id": p.stripe_price_recurring_id,
                "sort_order": p.sort_order,
            }
            for p in plans
        ]

    # ------------------------ Limit checks ------------------------

    def check_page_limit(self, user_id: str, additional_pages: int) -> bool:
        """True if user can process `additional_pages` without violating plan hard caps."""
        info = self.get_billing_info(user_id)
        if info["plan_code"] == "free":
            return info["pages_used"] + additional_pages <= info["pages_included"]
        # paid plans: allow overage (Stripe tiers handle billing)
        return True

    def check_automation_limit(self, user_id: str) -> bool:
        """True if user can enable another automation."""
        info = self.get_billing_info(user_id)
        return info["automations_count"] < info["automations_limit"]

    # ------------------------ Usage metering ------------------------

    def record_usage(
        self,
        user_id: str,
        pages: int,
        source: str,
        task_id: Optional[str] = None,
        inkwise_ingestion_id: Optional[str] = None,
        form_fill_run_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Optional[str]:
        """Append a usage event and bump the cached counter. Report to Stripe for paid plans.

        Returns the usage_event id (uuid) or None if pages <= 0.
        """
        if pages <= 0:
            return None

        task_uuid = _coerce_uuid(task_id)
        inkwise_ingestion_uuid = _coerce_uuid(inkwise_ingestion_id)
        form_fill_run_uuid = _coerce_uuid(form_fill_run_id)

        duplicate_query = self.db.query(UsageEvent).filter(
            UsageEvent.user_id == user_id,
            UsageEvent.source == source,
        )
        if task_uuid is not None:
            existing_event = duplicate_query.filter(UsageEvent.task_id == task_uuid).first()
            if existing_event is not None:
                logger.info(f"Usage already recorded for task {task_uuid}; skipping duplicate metering")
                return str(existing_event.id)
        if inkwise_ingestion_uuid is not None:
            existing_event = duplicate_query.filter(UsageEvent.inkwise_ingestion_id == inkwise_ingestion_uuid).first()
            if existing_event is not None:
                logger.info(
                    f"Usage already recorded for Inkwise ingestion {inkwise_ingestion_uuid}; skipping duplicate metering"
                )
                return str(existing_event.id)
        if form_fill_run_uuid is not None:
            existing_event = duplicate_query.filter(UsageEvent.form_fill_run_id == form_fill_run_uuid).first()
            if existing_event is not None:
                logger.info(f"Usage already recorded for Form Fill run {form_fill_run_uuid}; skipping duplicate metering")
                return str(existing_event.id)

        acct = self.get_or_create_billing_account(user_id)

        # Hard cap for Free
        if acct.plan_code == "free" and not self.check_page_limit(user_id, pages):
            raise PlanLimitExceeded("Page limit exceeded for Free plan")

        event_id = str(uuid.uuid4())
        self.db.add(
            UsageEvent(
                id=event_id,
                user_id=user_id,
                source=source,
                task_id=task_uuid,
                inkwise_ingestion_id=inkwise_ingestion_uuid,
                form_fill_run_id=form_fill_run_uuid,
                pages=pages,
                notes=notes,
            )
        )

        # Upsert the counter for the active period
        self.db.execute(
            text(
                """
            INSERT INTO usage_counters(user_id, period_start, period_end, pages_total)
            VALUES (:u, :ps, :pe, :pg)
            ON CONFLICT (user_id, period_start) DO UPDATE
            SET pages_total = usage_counters.pages_total + EXCLUDED.pages_total
            """
            ),
            {
                "u": user_id,
                "ps": acct.current_period_start,
                "pe": acct.current_period_end,
                "pg": pages,
            },
        )

        self.db.commit()

        # Report to Stripe for paid plans
        if acct.plan_code in ("basic", "pro"):
            self._report_usage_to_stripe(user_id, pages, event_id)

        return event_id

    def record_analytics_usage(
        self,
        user_id: str,
        source: str,
        prompt_tokens: Optional[int],
        output_tokens: Optional[int],
        notes: Optional[str] = None,
    ) -> Optional[str]:
        """Convert token usage from an analytics LLM call to pages and record it.

        Returns the usage_event id (uuid) or None if the call consumed zero tokens.
        Raises PlanLimitExceeded for Free users over quota.
        """
        if source not in ANALYTICS_SOURCES:
            logger.warning(
                "record_analytics_usage called with unknown source '%s'; recording anyway",
                source,
            )

        pages = tokens_to_pages(prompt_tokens, output_tokens)
        if pages <= 0:
            return None

        return self.record_usage(user_id=user_id, pages=pages, source=source, notes=notes)

    def _report_usage_to_stripe(self, user_id: str, pages: int, event_id: str) -> None:
        """Send a meter event to Stripe. Swallows errors (logs only)."""
        try:
            acct = self.db.query(BillingAccount).filter(BillingAccount.user_id == user_id).first()
            if not acct or not acct.stripe_customer_id:
                logger.info("No Stripe customer on account; skipping usage report.")
                return

            event_name = os.getenv("STRIPE_METER_EVENT_NAME", "cpaautomation_pages")

            # Create meter event. Basil-era API requires meter-backed price; this is the event feed.
            evt = stripe.billing.MeterEvent.create(
                event_name=event_name,
                payload={
                    "stripe_customer_id": acct.stripe_customer_id,
                    "value": pages,
                },
                timestamp=int(datetime.now(timezone.utc).timestamp())
            )

            # Mark reported
            self.db.query(UsageEvent).filter(UsageEvent.id == event_id).update(
                {"stripe_reported": True, "stripe_record_id": getattr(evt, "identifier", None)}
            )
            self.db.commit()

        except Exception as e:
            logger.error(f"Failed to report usage to Stripe: {e}")

    # ------------------------ Checkout / Portal ------------------------

    def create_checkout_session(self, user_id: str, plan_code: str, success_url: str, cancel_url: str) -> str:
        """Create a Stripe Checkout Session for Basic/Pro subscriptions."""
        plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.code == plan_code).first()
        if not plan or not plan.stripe_price_recurring_id or not plan.stripe_price_metered_id:
            raise HTTPException(status_code=400, detail="Invalid plan")

        acct = self.get_or_create_billing_account(user_id)
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Ensure a Stripe customer exists (re-create if the stored id is invalid)
        customer_id = acct.stripe_customer_id
        customer = None
        if customer_id:
            try:
                customer = stripe.Customer.retrieve(customer_id)
            except Exception:
                logger.warning("Stored Stripe customer invalid; creating a new one.")
                customer = None

        if not customer:
            customer = stripe.Customer.create(email=user.email, metadata={"user_id": user_id})
            acct.stripe_customer_id = customer.id
            self.db.commit()

        # Cancel existing subscription if user is switching between paid plans
        if acct.stripe_subscription_id and acct.plan_code in ("basic", "pro") and plan_code in ("basic", "pro"):
            try:
                logger.info(f"Canceling existing subscription {acct.stripe_subscription_id} for user {user_id} before creating new one")
                stripe.Subscription.cancel(acct.stripe_subscription_id)
                # Clear the subscription ID immediately to prevent conflicts
                acct.stripe_subscription_id = None
                self.db.commit()
            except Exception as e:
                logger.error(f"Failed to cancel existing subscription {acct.stripe_subscription_id}: {e}")
                # Continue with checkout creation - the webhook will handle cleanup

        line_items = [
            {"price": plan.stripe_price_recurring_id, "quantity": 1},
            {"price": plan.stripe_price_metered_id},
        ]

        session = stripe.checkout.Session.create(
            customer=customer.id,
            payment_method_types=["card"],
            line_items=line_items,
            mode="subscription",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": user_id, "plan_code": plan_code},
        )
        return session.url

    def create_portal_session(self, user_id: str, return_url: str) -> str:
        """Return a Stripe Customer Portal URL."""
        acct = self.get_or_create_billing_account(user_id)
        if not acct.stripe_customer_id:
            raise HTTPException(status_code=400, detail="No Stripe customer found")
        session = stripe.billing_portal.Session.create(
            customer=acct.stripe_customer_id,
            return_url=return_url,
        )
        return session.url


    # ------------------------ Webhook handlers ------------------------

    def handle_checkout_completed(self, session: Any) -> None:
        """Handle `checkout.session.completed` (creates/activates subscription)."""
        metadata = _get_object_value(session, "metadata", {})
        user_id = _get_object_value(metadata, "user_id")
        plan_code = _get_object_value(metadata, "plan_code")
        if not user_id or not plan_code:
            logger.error("checkout.session.completed missing user_id or plan_code in metadata")
            return

        acct = self.get_or_create_billing_account(user_id)

        sub_id = _get_object_value(session, "subscription")
        if not sub_id:
            logger.warning("checkout.session.completed without subscription id; ignoring.")
            return

        # Fetch Subscription to read period boundaries
        sub = stripe.Subscription.retrieve(sub_id)

        start_ts, end_ts = _extract_period_from_subscription(sub)
        if start_ts is None or end_ts is None:
            logger.error(f"Subscription {_get_object_value(sub, 'id')} missing period fields; payload={sub}")
            return

        customer_id = _get_object_value(session, "customer")
        if customer_id:
            acct.stripe_customer_id = str(customer_id)
        acct.plan_code = plan_code
        acct.stripe_subscription_id = str(_get_object_value(sub, "id", sub_id) or sub_id)
        acct.current_period_start = datetime.fromtimestamp(start_ts, tz=timezone.utc)
        acct.current_period_end = datetime.fromtimestamp(end_ts, tz=timezone.utc)
        acct.status = _get_object_value(sub, "status") or "active"

        # Ensure counter exists for the new period
        self.db.merge(
            UsageCounter(
                user_id=user_id,
                period_start=acct.current_period_start,
                period_end=acct.current_period_end,
                pages_total=0,
            )
        )
        self.db.commit()

    def handle_subscription_updated(self, subscription_obj: Any) -> None:
        """Handle `customer.subscription.updated` / `.created`."""
        sub_id = _get_object_value(subscription_obj, "id")
        if not sub_id:
            return

        customer_id = _get_object_value(subscription_obj, "customer")
        acct = self.db.query(BillingAccount).filter(BillingAccount.stripe_subscription_id == sub_id).first()
        if not acct and customer_id:
            acct = self.db.query(BillingAccount).filter(BillingAccount.stripe_customer_id == customer_id).first()
        if not acct:
            logger.info(f"No BillingAccount for subscription {sub_id}; ignoring update.")
            return

        # Retrieve up-to-date Stripe object so we can fall back to invoice if needed
        try:
            sub = stripe.Subscription.retrieve(sub_id)
        except Exception as e:
            logger.error(f"Failed to retrieve subscription {sub_id}: {e}")
            return

        start_ts, end_ts = _extract_period_from_subscription(sub)
        if start_ts and end_ts:
            new_start = datetime.fromtimestamp(int(start_ts), tz=timezone.utc)
            new_end = datetime.fromtimestamp(int(end_ts), tz=timezone.utc)
            if acct.current_period_start != new_start:
                acct.current_period_start = new_start
                acct.current_period_end = new_end
                self.db.merge(
                    UsageCounter(
                        user_id=acct.user_id,
                        period_start=new_start,
                        period_end=new_end,
                        pages_total=0,
                    )
                )

        plan_code = self._resolve_plan_code_from_subscription(sub)
        if plan_code:
            acct.plan_code = plan_code
        else:
            logger.warning(f"Could not map Stripe subscription {sub_id} prices to a local plan code")

        acct.stripe_subscription_id = sub_id
        if customer_id:
            acct.stripe_customer_id = str(customer_id)

        status = _get_object_value(sub, "status") or _get_object_value(subscription_obj, "status")
        if status:
            acct.status = status

        self.db.commit()

    def handle_subscription_deleted(self, subscription_obj: Any) -> None:
        """Handle `customer.subscription.deleted`: downgrade to Free and set calendar period."""
        sub_id = _get_object_value(subscription_obj, "id")
        if not sub_id:
            return

        acct = self.db.query(BillingAccount).filter(BillingAccount.stripe_subscription_id == sub_id).first()
        if not acct:
            return

        acct.plan_code = "free"
        acct.stripe_subscription_id = None
        acct.status = "active"

        now = datetime.now(timezone.utc)
        start, end = _month_bounds_utc(now)
        acct.current_period_start = start
        acct.current_period_end = end

        self.db.merge(UsageCounter(user_id=acct.user_id, period_start=start, period_end=end, pages_total=0))
        self.db.commit()


# DI helper
def get_billing_service(db: Session = None) -> BillingService:
    if db is None:
        db = next(get_db())
    return BillingService(db)
