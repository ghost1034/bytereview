#!/usr/bin/env python3
"""Idempotently attach token-metered prices to existing paid subscriptions.

The subscription is updated with no proration. Local token enforcement starts
at the account's next subscription-period boundary, so rollout-period events
remain shadow-only.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import stripe

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from core.database import db_config  # noqa: E402
from models.db_models import BillingAccount, SubscriptionPlan  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Apply Stripe and database changes")
    args = parser.parse_args()
    stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
    if args.apply and not stripe.api_key:
        raise SystemExit("STRIPE_SECRET_KEY is required with --apply")

    db = db_config.get_session()
    changed = 0
    try:
        accounts = db.query(BillingAccount).filter(
            BillingAccount.plan_code.in_(("basic", "pro")),
            BillingAccount.stripe_subscription_id.isnot(None),
        ).all()
        plans = {row.code: row for row in db.query(SubscriptionPlan).all()}
        for account in accounts:
            plan = plans.get(account.plan_code)
            token_price = getattr(plan, "stripe_price_token_metered_id", None) if plan else None
            if not token_price:
                print(f"skip {account.user_id}: plan has no token-metered price")
                continue
            subscription = stripe.Subscription.retrieve(account.stripe_subscription_id) if args.apply else None
            price_ids = {
                str(getattr(getattr(item, "price", None), "id", ""))
                for item in (getattr(getattr(subscription, "items", None), "data", None) or [])
            }
            if args.apply and token_price not in price_ids:
                stripe.Subscription.modify(
                    account.stripe_subscription_id,
                    items=[{"price": token_price}],
                    proration_behavior="none",
                )
            effective_at = account.current_period_end
            print(f"{'apply' if args.apply else 'would apply'} {account.user_id}: effective {effective_at}")
            if args.apply:
                account.token_billing_effective_at = effective_at
            changed += 1
        if args.apply:
            db.commit()
        else:
            db.rollback()
        print(f"processed={changed} apply={args.apply}")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
