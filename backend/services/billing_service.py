"""
Billing service for subscription management, usage tracking, and Stripe integration.
Hardened for Basil-era Stripe API where Subscription period fields may live on items.
"""

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Tuple, Literal, Mapping

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
from sqlalchemy import text, and_, func
from sqlalchemy.exc import IntegrityError

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


UsageUnit = Literal["page", "token"]


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
    "analytics_chat_title",
    "tasklytic_assistant",
    "tasklytic_receipt_extraction",
    "pbc_assistant",
    "hosted_claw",
}

class PlanLimitExceeded(Exception):
    """Structured quota failure shared by every metered product."""

    def __init__(self, *, unit: UsageUnit, used: int, included: int, plan_code: str):
        self.unit = unit
        self.used = int(used)
        self.included = int(included)
        self.remaining = max(0, self.included - self.used)
        self.plan_code = plan_code
        super().__init__(f"{unit.title()} allowance exhausted for {plan_code} plan")

    @property
    def detail(self) -> Dict[str, Any]:
        return {
            "code": "billing_limit_exceeded",
            "unit": self.unit,
            "used": self.used,
            "included": self.included,
            "remaining": self.remaining,
            "plan_code": self.plan_code,
        }


def billing_limit_http_exception(exc: PlanLimitExceeded) -> HTTPException:
    return HTTPException(status_code=402, detail=exc.detail)


@dataclass
class TokenAccumulator:
    """Aggregate provider calls/retries into one top-level token operation."""

    prompt_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    calls_with_usage: int = 0
    calls_missing_usage: int = 0

    def add(self, usage: Optional[Mapping[str, Any]]) -> None:
        if not usage:
            self.calls_missing_usage += 1
            return
        prompt = max(0, int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0))
        output = max(0, int(usage.get("output_tokens") or usage.get("completion_tokens") or 0))
        reported_total = usage.get("total_tokens")
        total = max(0, int(reported_total)) if reported_total is not None else prompt + output
        if total <= 0:
            self.calls_missing_usage += 1
            return
        self.prompt_tokens += prompt
        self.output_tokens += output
        self.total_tokens += total
        self.calls_with_usage += 1

    @property
    def token_details(self) -> Dict[str, int]:
        return {
            "prompt_tokens": self.prompt_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
        }


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


def _product_for_source(source: str) -> str:
    if source.startswith("analytics_"):
        return "analytics"
    for prefix, product in (
        ("pbc_", "pbc"),
        ("tasklytic_", "tasklytic"),
        ("inkwise_", "inkwise"),
        ("form_fill", "form_fill"),
        ("esign_", "esign"),
        ("cpe_", "cpe"),
        ("hosted_claw", "hosted_claw"),
    ):
        if source.startswith(prefix):
            return product
    return "uda"


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
            token_price_id = getattr(plan, "stripe_price_token_metered_id", None)
            if token_price_id and token_price_id in price_ids:
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
            token_billing_effective_at=now,
            status="active",
        )
        self.db.add(acct)

        # Ensure a counter row for the current period
        counter = UsageCounter(
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
            pages_total=0,
            tokens_total=0,
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
        tokens_used = (counter.tokens_total if counter else 0) or 0

        breakdown_rows = (
            self.db.query(UsageEvent.product, UsageEvent.unit, func.sum(UsageEvent.quantity))
            .filter(
                UsageEvent.user_id == user_id,
                UsageEvent.occurred_at >= acct.current_period_start,
                UsageEvent.occurred_at <= acct.current_period_end,
            )
            .group_by(UsageEvent.product, UsageEvent.unit)
            .all()
        )
        product_breakdown: Dict[str, Dict[str, int]] = {}
        for product, unit, quantity in breakdown_rows:
            bucket = product_breakdown.setdefault(str(product), {"pages": 0, "tokens": 0})
            bucket["pages" if unit == "page" else "tokens"] += int(quantity or 0)

        now = datetime.now(timezone.utc)
        token_effective_at = getattr(acct, "token_billing_effective_at", None)
        token_shadow = isinstance(token_effective_at, datetime) and token_effective_at > now

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
            "tokens_included": getattr(plan, "tokens_included", 0) if plan else 0,
            "tokens_used": tokens_used,
            "pbc_storage_bytes_included": getattr(plan, "pbc_storage_bytes_included", 0) if plan else 0,
            "automations_limit": plan.automations_limit if plan else 0,
            "automations_count": automations_count,
            "overage_cents": plan.overage_cents if plan else 0,
            "token_overage_cents": getattr(plan, "token_overage_cents", 0) if plan else 0,
            "token_billing_effective_at": token_effective_at,
            "token_billing_shadow": token_shadow,
            "product_breakdown": product_breakdown,
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
                "tokens_included": getattr(p, "tokens_included", 0),
                "pbc_storage_bytes_included": getattr(p, "pbc_storage_bytes_included", 0),
                "automations_limit": p.automations_limit,
                "overage_cents": p.overage_cents,
                "token_overage_cents": getattr(p, "token_overage_cents", 0),
                "stripe_price_recurring_id": p.stripe_price_recurring_id,
                "stripe_price_metered_id": p.stripe_price_metered_id,
                "stripe_price_token_metered_id": getattr(p, "stripe_price_token_metered_id", None),
                "sort_order": p.sort_order,
            }
            for p in plans
        ]

    # ------------------------ Limit checks ------------------------

    def check_limit(self, user_id: str, unit: UsageUnit, additional_quantity: int) -> bool:
        """Return whether work may start under the independent unit quota."""
        if unit not in ("page", "token"):
            raise ValueError(f"Unsupported billing unit: {unit}")
        if additional_quantity < 0:
            raise ValueError("additional_quantity must be non-negative")
        info = self.get_billing_info(user_id)
        if unit == "token" and info["token_billing_shadow"]:
            return True
        if info["plan_code"] == "free":
            used = info["pages_used"] if unit == "page" else info["tokens_used"]
            included = info["pages_included"] if unit == "page" else info["tokens_included"]
            return used + additional_quantity <= included
        # paid plans: allow overage (Stripe tiers handle billing)
        return True

    def require_limit(self, user_id: str, unit: UsageUnit, additional_quantity: int) -> None:
        if self.check_limit(user_id, unit, additional_quantity):
            return
        info = self.get_billing_info(user_id)
        raise PlanLimitExceeded(
            unit=unit,
            used=info["pages_used"] if unit == "page" else info["tokens_used"],
            included=info["pages_included"] if unit == "page" else info["tokens_included"],
            plan_code=info["plan_code"],
        )

    def check_automation_limit(self, user_id: str) -> bool:
        """True if user can enable another automation."""
        info = self.get_billing_info(user_id)
        return info["automations_count"] < info["automations_limit"]

    # ------------------------ Usage metering ------------------------

    def record_usage(
        self,
        user_id: str,
        product: Optional[str] = None,
        source: Optional[str] = None,
        unit: Optional[UsageUnit] = None,
        quantity: Optional[int] = None,
        operation_id: Optional[str] = None,
        token_details: Optional[Mapping[str, Any]] = None,
        *,
        pages: Optional[int] = None,
        task_id: Optional[str] = None,
        inkwise_ingestion_id: Optional[str] = None,
        form_fill_run_id: Optional[str] = None,
        esign_ai_field_placement_run_id: Optional[str] = None,
        notes: Optional[str] = None,
        prompt_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        total_tokens: Optional[int] = None,
        commit: bool = True,
    ) -> Optional[str]:
        """Append one idempotent unit event and increment the active counter.

        The ledger is also the Stripe outbox. Paid, effective events are saved
        as ``pending`` and reconciliation reports them after commit. No
        provider call is made from this transaction.

        ``pages=`` and legacy reference IDs remain accepted while page modules
        roll over; canonical callers use product/source/unit/quantity/operation.
        """
        # Compatibility with the former positional shape
        # record_usage(user_id, pages, source, ...).
        if isinstance(product, int):
            pages = int(product)
            product = None
        source = source or "manual_adjustment"
        if quantity is None and pages is not None:
            quantity = int(pages)
            unit = "page"
        unit = unit or "page"
        if unit not in ("page", "token"):
            raise ValueError(f"Unsupported billing unit: {unit}")
        billed_quantity = int(quantity or 0)
        if billed_quantity <= 0:
            return None

        product = product or _product_for_source(source)

        task_uuid = _coerce_uuid(task_id)
        inkwise_ingestion_uuid = _coerce_uuid(inkwise_ingestion_id)
        form_fill_run_uuid = _coerce_uuid(form_fill_run_id)
        esign_ai_run_uuid = _coerce_uuid(esign_ai_field_placement_run_id)

        operation_id = str(
            operation_id
            or task_uuid
            or inkwise_ingestion_uuid
            or form_fill_run_uuid
            or esign_ai_run_uuid
            or uuid.uuid4()
        )
        existing_event = self.db.query(UsageEvent).filter(
            UsageEvent.user_id == user_id,
            UsageEvent.product == product,
            UsageEvent.source == source,
            UsageEvent.operation_id == operation_id,
            UsageEvent.unit == unit,
        ).first()
        if existing_event is not None:
            logger.info("Usage already recorded for %s/%s operation %s", product, unit, operation_id)
            return str(existing_event.id)

        acct = self.get_or_create_billing_account(user_id)

        info = self.get_billing_info(user_id)
        # Known page workloads must fit. Token workloads are checked before the
        # provider with quantity=1; an in-flight call may cross the boundary and
        # its full provider-reported quantity is still recorded.
        if unit == "page":
            self.require_limit(user_id, unit, billed_quantity)
        elif acct.plan_code == "free" and not info["token_billing_shadow"]:
            if int(info["tokens_used"]) >= int(info["tokens_included"]):
                raise PlanLimitExceeded(
                    unit="token",
                    used=info["tokens_used"],
                    included=info["tokens_included"],
                    plan_code=info["plan_code"],
                )

        details = dict(token_details or {})
        if prompt_tokens is not None:
            details.setdefault("prompt_tokens", prompt_tokens)
        if output_tokens is not None:
            details.setdefault("output_tokens", output_tokens)
        if total_tokens is not None:
            details.setdefault("total_tokens", total_tokens)
        prompt_tokens = details.get("prompt_tokens")
        output_tokens = details.get("output_tokens")
        total_tokens = details.get("total_tokens")
        if unit == "token" and total_tokens is None:
            total_tokens = int(prompt_tokens or 0) + int(output_tokens or 0)

        token_effective_at = getattr(acct, "token_billing_effective_at", None)
        token_shadow = (
            unit == "token"
            and isinstance(token_effective_at, datetime)
            and token_effective_at > datetime.now(timezone.utc)
        )
        if token_shadow:
            stripe_status = "shadow"
        elif acct.plan_code in ("basic", "pro"):
            stripe_status = "pending"
        else:
            stripe_status = "non_billable"

        event_id = str(uuid.uuid4())
        event = UsageEvent(
            id=event_id,
            user_id=user_id,
            product=product,
            source=source,
            unit=unit,
            quantity=billed_quantity,
            operation_id=operation_id,
            task_id=task_uuid,
            inkwise_ingestion_id=inkwise_ingestion_uuid,
            form_fill_run_id=form_fill_run_uuid,
            esign_ai_field_placement_run_id=esign_ai_run_uuid,
            pages=billed_quantity if unit == "page" else 0,
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            stripe_status=stripe_status,
            stripe_reported=False,
            notes=notes,
        )
        savepoint = self.db.begin_nested()
        try:
            # Detect a concurrent duplicate before incrementing counters.
            self.db.add(event)
            self.db.flush()
            savepoint.commit()
        except IntegrityError:
            savepoint.rollback()
            existing_event = self.db.query(UsageEvent).filter(
                UsageEvent.user_id == user_id,
                UsageEvent.product == product,
                UsageEvent.source == source,
                UsageEvent.operation_id == operation_id,
                UsageEvent.unit == unit,
            ).first()
            if existing_event is not None:
                return str(existing_event.id)
            raise

        # Upsert the counter for the active period
        self.db.execute(
            text(
                """
            INSERT INTO usage_counters(user_id, period_start, period_end, pages_total, tokens_total)
            VALUES (:u, :ps, :pe, :pg, :tok)
            ON CONFLICT (user_id, period_start) DO UPDATE
            SET pages_total = usage_counters.pages_total + EXCLUDED.pages_total,
                tokens_total = usage_counters.tokens_total + EXCLUDED.tokens_total
            """
            ),
            {
                "u": user_id,
                "ps": acct.current_period_start,
                "pe": acct.current_period_end,
                "pg": billed_quantity if unit == "page" else 0,
                "tok": billed_quantity if unit == "token" else 0,
            },
        )

        if not commit:
            self.db.flush()
            return event_id

        self.db.commit()

        return event_id

    def record_analytics_usage(
        self,
        user_id: str,
        source: str,
        prompt_tokens: Optional[int],
        output_tokens: Optional[int],
        total_tokens: Optional[int] = None,
        notes: Optional[str] = None,
        operation_id: Optional[str] = None,
        product: str = "analytics",
    ) -> Optional[str]:
        """Record provider-reported tokens without converting them to pages."""
        if source not in ANALYTICS_SOURCES:
            logger.warning(
                "record_analytics_usage called with unknown source '%s'; recording anyway",
                source,
            )

        if total_tokens is None:
            total_tokens = int(prompt_tokens or 0) + int(output_tokens or 0)
        if int(total_tokens or 0) <= 0:
            logger.error("billing_missing_provider_usage product=%s source=%s user_id=%s", product, source, user_id)
            return None

        return self.record_usage(
            user_id=user_id,
            product=product,
            source=source,
            unit="token",
            quantity=int(total_tokens),
            operation_id=operation_id,
            token_details={
                "prompt_tokens": prompt_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens,
            },
            notes=notes,
        )

    def _report_usage_to_stripe(self, event: UsageEvent) -> bool:
        """Report one pending/failed outbox row to its unit-specific meter."""
        try:
            acct = self.db.query(BillingAccount).filter(BillingAccount.user_id == event.user_id).first()
            if not acct or not acct.stripe_customer_id:
                event.stripe_status = "failed"
                event.stripe_last_error = "Paid usage event has no Stripe customer"
                self.db.commit()
                return False

            event_name = (
                os.getenv("STRIPE_TOKEN_METER_EVENT_NAME", "cpaautomation_tokens")
                if event.unit == "token"
                else os.getenv("STRIPE_PAGE_METER_EVENT_NAME", os.getenv("STRIPE_METER_EVENT_NAME", "cpaautomation_pages"))
            )

            evt = stripe.billing.MeterEvent.create(
                event_name=event_name,
                payload={
                    "stripe_customer_id": acct.stripe_customer_id,
                    "value": int(event.quantity),
                },
                timestamp=int(event.occurred_at.timestamp()),
                identifier=str(event.id),
            )
            event.stripe_status = "reported"
            event.stripe_reported = True
            event.stripe_record_id = getattr(evt, "identifier", None) or str(event.id)
            event.stripe_last_error = None
            self.db.commit()
            return True

        except Exception as e:
            event.stripe_status = "failed"
            event.stripe_last_error = str(e)[:2000]
            self.db.commit()
            logger.error("Failed to report %s usage event %s to Stripe: %s", event.unit, event.id, e)
            return False

    def reconcile_stripe_usage(self, limit: int = 500) -> Dict[str, int]:
        events = (
            self.db.query(UsageEvent)
            .filter(UsageEvent.stripe_status.in_(("pending", "failed")))
            .order_by(UsageEvent.occurred_at, UsageEvent.id)
            .limit(limit)
            .all()
        )
        reported = sum(1 for event in events if self._report_usage_to_stripe(event))
        return {"attempted": len(events), "reported": reported, "failed": len(events) - reported}

    # ------------------------ Checkout / Portal ------------------------

    def create_checkout_session(self, user_id: str, plan_code: str, success_url: str, cancel_url: str) -> str:
        """Create a Stripe Checkout Session for Basic/Pro subscriptions."""
        plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.code == plan_code).first()
        if (
            not plan
            or not plan.stripe_price_recurring_id
            or not plan.stripe_price_metered_id
            or not plan.stripe_price_token_metered_id
        ):
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
            {"price": plan.stripe_price_token_metered_id},
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
        # Checkout creates a subscription containing both meters, so token
        # enforcement starts immediately for new subscriptions.
        acct.token_billing_effective_at = datetime.now(timezone.utc)
        acct.status = _get_object_value(sub, "status") or "active"

        # Ensure counter exists for the new period
        self.db.merge(
            UsageCounter(
                user_id=user_id,
                period_start=acct.current_period_start,
                period_end=acct.current_period_end,
                pages_total=0,
                tokens_total=0,
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
                        tokens_total=0,
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
        acct.token_billing_effective_at = now

        self.db.merge(UsageCounter(user_id=acct.user_id, period_start=start, period_end=end, pages_total=0, tokens_total=0))
        self.db.commit()


# DI helper
def get_billing_service(db: Session = None) -> BillingService:
    if db is None:
        db = next(get_db())
    return BillingService(db)
