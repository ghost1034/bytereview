from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.billing_service import BillingService


class BillingServiceSubscriptionSyncTests(unittest.TestCase):
    def _build_lookup_query(self, first_result):
        query = MagicMock()
        query.filter.return_value.first.return_value = first_result
        return query

    def _build_plans_query(self, plans):
        query = MagicMock()
        query.filter.return_value.all.return_value = plans
        return query

    def test_handle_subscription_updated_syncs_plan_from_subscription_prices(self) -> None:
        old_start = datetime(2026, 2, 1, tzinfo=timezone.utc)
        old_end = datetime(2026, 2, 28, 23, 59, 59, tzinfo=timezone.utc)
        account = SimpleNamespace(
            user_id="user-123",
            plan_code="basic",
            stripe_customer_id="cus_123",
            stripe_subscription_id="sub_123",
            current_period_start=old_start,
            current_period_end=old_end,
            status="active",
        )
        basic_plan = SimpleNamespace(
            code="basic",
            stripe_price_recurring_id="price_basic_recurring",
            stripe_price_metered_id="price_basic_metered",
        )
        pro_plan = SimpleNamespace(
            code="pro",
            stripe_price_recurring_id="price_pro_recurring",
            stripe_price_metered_id="price_pro_metered",
        )
        db = MagicMock()
        db.query.side_effect = [
            self._build_lookup_query(account),
            self._build_plans_query([basic_plan, pro_plan]),
        ]

        service = BillingService(db)
        stripe_subscription = {
            "id": "sub_123",
            "status": "active",
            "current_period_start": 1772323200,
            "current_period_end": 1775001599,
            "items": {
                "data": [
                    {"price": {"id": "price_pro_recurring"}},
                    {"price": {"id": "price_pro_metered"}},
                ]
            },
        }

        with patch("services.billing_service.stripe.Subscription.retrieve", return_value=stripe_subscription):
            service.handle_subscription_updated({"id": "sub_123", "customer": "cus_123"})

        self.assertEqual(account.plan_code, "pro")
        self.assertEqual(account.stripe_subscription_id, "sub_123")
        self.assertEqual(account.stripe_customer_id, "cus_123")
        self.assertEqual(account.current_period_start, datetime.fromtimestamp(1772323200, tz=timezone.utc))
        self.assertEqual(account.current_period_end, datetime.fromtimestamp(1775001599, tz=timezone.utc))
        self.assertEqual(account.status, "active")
        db.merge.assert_called_once()
        db.commit.assert_called_once()

    def test_handle_subscription_updated_falls_back_to_customer_lookup(self) -> None:
        account = SimpleNamespace(
            user_id="user-456",
            plan_code="basic",
            stripe_customer_id="cus_456",
            stripe_subscription_id=None,
            current_period_start=None,
            current_period_end=None,
            status="active",
        )
        basic_plan = SimpleNamespace(
            code="basic",
            stripe_price_recurring_id="price_basic_recurring",
            stripe_price_metered_id="price_basic_metered",
        )
        pro_plan = SimpleNamespace(
            code="pro",
            stripe_price_recurring_id="price_pro_recurring",
            stripe_price_metered_id="price_pro_metered",
        )
        db = MagicMock()
        db.query.side_effect = [
            self._build_lookup_query(None),
            self._build_lookup_query(account),
            self._build_plans_query([basic_plan, pro_plan]),
        ]

        service = BillingService(db)
        stripe_subscription = {
            "id": "sub_new_456",
            "status": "past_due",
            "current_period_start": 1772323200,
            "current_period_end": 1775001599,
            "items": {
                "data": [
                    {"price": {"id": "price_pro_recurring"}},
                    {"price": {"id": "price_pro_metered"}},
                ]
            },
        }

        with patch("services.billing_service.stripe.Subscription.retrieve", return_value=stripe_subscription):
            service.handle_subscription_updated({"id": "sub_new_456", "customer": "cus_456"})

        self.assertEqual(account.plan_code, "pro")
        self.assertEqual(account.stripe_subscription_id, "sub_new_456")
        self.assertEqual(account.status, "past_due")
        db.merge.assert_called_once()
        db.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
