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

from services.billing_service import BillingService, tokens_to_pages


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

        webhook_subscription = SimpleNamespace(id="sub_123", customer="cus_123")

        with patch("services.billing_service.stripe.Subscription.retrieve", return_value=stripe_subscription):
            service.handle_subscription_updated(webhook_subscription)

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

        webhook_subscription = SimpleNamespace(id="sub_new_456", customer="cus_456")

        with patch("services.billing_service.stripe.Subscription.retrieve", return_value=stripe_subscription):
            service.handle_subscription_updated(webhook_subscription)

        self.assertEqual(account.plan_code, "pro")
        self.assertEqual(account.stripe_subscription_id, "sub_new_456")
        self.assertEqual(account.status, "past_due")
        db.merge.assert_called_once()
        db.commit.assert_called_once()

    def test_handle_checkout_completed_supports_attribute_payloads(self) -> None:
        account = SimpleNamespace(
            user_id="user-789",
            plan_code="free",
            stripe_customer_id=None,
            stripe_subscription_id=None,
            current_period_start=None,
            current_period_end=None,
            status="active",
        )
        db = MagicMock()
        service = BillingService(db)
        service.get_or_create_billing_account = MagicMock(return_value=account)

        session = SimpleNamespace(
            metadata=SimpleNamespace(user_id="user-789", plan_code="pro"),
            subscription="sub_789",
            customer="cus_789",
        )
        stripe_subscription = SimpleNamespace(
            id="sub_789",
            status="trialing",
            current_period_start=1772323200,
            current_period_end=1775001599,
        )

        with patch("services.billing_service.stripe.Subscription.retrieve", return_value=stripe_subscription):
            service.handle_checkout_completed(session)

        self.assertEqual(account.plan_code, "pro")
        self.assertEqual(account.stripe_customer_id, "cus_789")
        self.assertEqual(account.stripe_subscription_id, "sub_789")
        self.assertEqual(account.status, "trialing")
        self.assertEqual(account.current_period_start, datetime.fromtimestamp(1772323200, tz=timezone.utc))
        self.assertEqual(account.current_period_end, datetime.fromtimestamp(1775001599, tz=timezone.utc))
        db.merge.assert_called_once()
        db.commit.assert_called_once()

    def test_handle_subscription_deleted_supports_attribute_payloads(self) -> None:
        old_start = datetime(2026, 2, 1, tzinfo=timezone.utc)
        old_end = datetime(2026, 2, 28, 23, 59, 59, tzinfo=timezone.utc)
        new_start = datetime(2026, 3, 1, tzinfo=timezone.utc)
        new_end = datetime(2026, 3, 31, 23, 59, 59, tzinfo=timezone.utc)
        account = SimpleNamespace(
            user_id="user-123",
            plan_code="pro",
            stripe_customer_id="cus_123",
            stripe_subscription_id="sub_123",
            current_period_start=old_start,
            current_period_end=old_end,
            status="canceled",
        )
        db = MagicMock()
        db.query.side_effect = [self._build_lookup_query(account)]

        service = BillingService(db)

        with patch("services.billing_service._month_bounds_utc", return_value=(new_start, new_end)):
            service.handle_subscription_deleted(SimpleNamespace(id="sub_123"))

        self.assertEqual(account.plan_code, "free")
        self.assertIsNone(account.stripe_subscription_id)
        self.assertEqual(account.status, "active")
        self.assertEqual(account.current_period_start, new_start)
        self.assertEqual(account.current_period_end, new_end)
        db.merge.assert_called_once()
        db.commit.assert_called_once()

    def test_record_usage_skips_duplicate_form_fill_run(self) -> None:
        existing_event = SimpleNamespace(id="22222222-2222-2222-2222-222222222222")
        duplicate_query = MagicMock()
        duplicate_query.filter.return_value.first.return_value = existing_event
        db = MagicMock()
        db.query.return_value.filter.return_value = duplicate_query

        service = BillingService(db)
        event_id = service.record_usage(
            user_id="user-id",
            pages=5,
            source="form_fill_run",
            form_fill_run_id="11111111-1111-1111-1111-111111111111",
        )

        self.assertEqual(event_id, "22222222-2222-2222-2222-222222222222")
        db.add.assert_not_called()
        db.commit.assert_not_called()


class BillingServiceTokenTrackingTests(unittest.TestCase):
    """Analytics token usage is persisted while billing stays page-derived."""

    def _service_with_free_account(self) -> tuple[BillingService, MagicMock]:
        db = MagicMock()
        service = BillingService(db)
        account = SimpleNamespace(
            plan_code="free",  # stays off the Stripe reporting path
            current_period_start=datetime(2026, 5, 1, tzinfo=timezone.utc),
            current_period_end=datetime(2026, 5, 31, 23, 59, 59, tzinfo=timezone.utc),
        )
        service.get_or_create_billing_account = MagicMock(return_value=account)
        service.check_page_limit = MagicMock(return_value=True)
        return service, db

    def test_record_analytics_usage_persists_tokens_and_keeps_pages(self) -> None:
        service, db = self._service_with_free_account()

        prompt_tokens, output_tokens = 1500, 1000
        service.record_analytics_usage(
            user_id="user-1",
            source="analytics_variance_analyze",
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
        )

        # The appended UsageEvent carries the raw tokens and the derived pages.
        event = db.add.call_args.args[0]
        self.assertEqual(event.prompt_tokens, prompt_tokens)
        self.assertEqual(event.output_tokens, output_tokens)
        # total_tokens defaults to prompt + output when not provided.
        self.assertEqual(event.total_tokens, prompt_tokens + output_tokens)
        # Billing is unchanged: pages are still derived via tokens_to_pages.
        self.assertEqual(event.pages, tokens_to_pages(prompt_tokens, output_tokens))

        # The counter upsert increments tokens_total alongside pages_total.
        sql, params = db.execute.call_args.args
        self.assertIn("tokens_total", str(sql))
        self.assertEqual(params["tok"], prompt_tokens + output_tokens)
        self.assertEqual(params["pg"], tokens_to_pages(prompt_tokens, output_tokens))

    def test_record_analytics_usage_prefers_provider_total(self) -> None:
        service, db = self._service_with_free_account()

        # Provider-reported total may exceed prompt+output (e.g. thinking tokens).
        service.record_analytics_usage(
            user_id="user-2",
            source="analytics_chat_assistant",
            prompt_tokens=1000,
            output_tokens=500,
            total_tokens=1800,
        )

        event = db.add.call_args.args[0]
        self.assertEqual(event.total_tokens, 1800)
        params = db.execute.call_args.args[1]
        self.assertEqual(params["tok"], 1800)
        # Pages remain derived from prompt+output only, independent of total.
        self.assertEqual(event.pages, tokens_to_pages(1000, 500))

    def test_record_analytics_usage_ignores_zero_token_calls(self) -> None:
        service, db = self._service_with_free_account()

        result = service.record_analytics_usage(
            user_id="user-3",
            source="analytics_chat_title",
            prompt_tokens=0,
            output_tokens=0,
        )

        self.assertIsNone(result)
        db.add.assert_not_called()
        db.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
