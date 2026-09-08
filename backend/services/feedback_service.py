"""Store feedback and apply one reward per account billing month atomically."""
from calendar import monthrange
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.db_models import FeedbackSubmission, SubscriptionPlan, UsageCounter, UsageEvent
from models.feedback import FeedbackRequest
from services.billing_service import BillingService


def next_month(now: datetime) -> datetime:
    year = now.year + (now.month == 12)
    month = now.month % 12 + 1
    return now.replace(year=year, month=month, day=min(now.day, monthrange(year, month)[1]))


class FeedbackService:
    def __init__(self, db: Session):
        self.db = db

    def submit(self, user_id: str, request: FeedbackRequest) -> FeedbackSubmission:
        account = BillingService(self.db).get_or_create_billing_account(user_id, lock=True)
        existing = self.db.query(FeedbackSubmission).filter(
            FeedbackSubmission.user_id == user_id,
            FeedbackSubmission.request_id == request.request_id,
        ).first()
        if existing:
            return existing

        now = datetime.now(timezone.utc)
        submission = FeedbackSubmission(
            user_id=user_id, request_id=request.request_id, message=request.message,
            page_path=request.page_path, reward="none", pages_reset=0, tokens_reset=0,
            created_at=now, next_reward_at=account.feedback_reward_available_at,
        )
        available_at = account.feedback_reward_available_at
        if available_at is None or available_at <= now:
            if account.plan_code == "free":
                basic = self.db.query(SubscriptionPlan).filter(
                    SubscriptionPlan.code == "basic", SubscriptionPlan.is_active.is_(True),
                ).first()
                if basic is None:
                    raise ValueError("Basic plan is unavailable. Please try again later.")
                account.feedback_basic_until = next_month(now)
                account.current_period_start = now
                account.current_period_end = account.feedback_basic_until
                account.token_billing_effective_at = now
                submission.reward = "basic_month"
                submission.basic_until = account.feedback_basic_until
            else:
                # An expired Stripe period must be refreshed by the webhook before
                # granting a reset: credits must belong to an open billing month.
                if not account.current_period_end or account.current_period_end <= now:
                    raise ValueError("Your billing period is updating. Please try again shortly.")
                submission.reward = "usage_reset"

            counter = self.db.query(UsageCounter).filter(
                UsageCounter.user_id == user_id,
                UsageCounter.period_start == account.current_period_start,
            ).with_for_update().first()
            if counter is not None:
                submission.pages_reset = counter.pages_total
                submission.tokens_reset = counter.tokens_total or 0
                counter.pages_total = 0
                counter.tokens_total = 0
            else:
                self.db.add(UsageCounter(
                    user_id=user_id, period_start=account.current_period_start,
                    period_end=account.current_period_end, pages_total=0, tokens_total=0,
                ))

            if submission.reward == "usage_reset":
                # Credit only billable events, including pending outbox rows. Shadow
                # and complimentary usage never reached Stripe and must not be credited.
                totals = self.db.query(
                    UsageEvent.unit,
                    func.sum(func.coalesce(UsageEvent.stripe_quantity, UsageEvent.quantity)),
                ).filter(
                    UsageEvent.user_id == user_id,
                    UsageEvent.occurred_at >= account.current_period_start,
                    UsageEvent.occurred_at <= now,
                    UsageEvent.stripe_status.in_(("pending", "failed", "reported")),
                ).group_by(UsageEvent.unit).all()
                for unit, quantity in totals:
                    if quantity and quantity > 0:
                        self.db.add(UsageEvent(
                            user_id=user_id, occurred_at=now, source="feedback_reset",
                            product="platform", unit=unit, quantity=0, pages=0,
                            stripe_quantity=-int(quantity), operation_id=str(request.request_id),
                            stripe_status="pending", stripe_reported=False,
                            notes="Monthly feedback reward: reset current-period usage",
                        ))

            account.usage_reset_at = now
            account.feedback_reward_available_at = account.current_period_end
            submission.next_reward_at = account.feedback_reward_available_at

        self.db.add(submission)
        self.db.commit()
        self.db.refresh(submission)
        return submission
