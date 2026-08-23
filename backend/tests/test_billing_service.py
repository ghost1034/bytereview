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

from services.billing_service import BillingService, PlanLimitExceeded, TokenAccumulator


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
        db.query.return_value.filter.return_value.first.return_value = None
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
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = existing_event

        service = BillingService(db)
        event_id = service.record_usage(
            user_id="user-id",
            product="form_fill",
            source="form_fill_run",
            unit="page",
            quantity=5,
            operation_id="11111111-1111-1111-1111-111111111111",
            form_fill_run_id="11111111-1111-1111-1111-111111111111",
        )

        self.assertEqual(event_id, "22222222-2222-2222-2222-222222222222")
        db.add.assert_not_called()
        db.commit.assert_not_called()


class BillingServiceTokenTrackingTests(unittest.TestCase):
    """Pages and provider tokens remain independent billing units."""

    def _service_with_free_account(self) -> tuple[BillingService, MagicMock]:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        service = BillingService(db)
        account = SimpleNamespace(
            plan_code="free",
            stripe_customer_id=None,
            token_billing_effective_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
            current_period_start=datetime(2026, 5, 1, tzinfo=timezone.utc),
            current_period_end=datetime(2026, 5, 31, 23, 59, 59, tzinfo=timezone.utc),
        )
        service.get_or_create_billing_account = MagicMock(return_value=account)
        service.get_billing_info = MagicMock(return_value={
            "plan_code": "free",
            "pages_used": 0,
            "pages_included": 100,
            "tokens_used": 0,
            "tokens_included": 200_000,
            "token_billing_shadow": False,
        })
        return service, db

    def test_record_analytics_usage_bills_provider_tokens_only(self) -> None:
        service, db = self._service_with_free_account()
        service.record_analytics_usage(
            user_id="user-1",
            source="analytics_variance_analyze",
            prompt_tokens=1500,
            output_tokens=1000,
            operation_id="analysis-1",
        )

        event = db.add.call_args.args[0]
        self.assertEqual(event.prompt_tokens, 1500)
        self.assertEqual(event.output_tokens, 1000)
        self.assertEqual(event.total_tokens, 2500)
        self.assertEqual(event.product, "analytics")
        self.assertEqual(event.unit, "token")
        self.assertEqual(event.quantity, 2500)
        self.assertEqual(event.pages, 0)
        _sql, params = db.execute.call_args.args
        self.assertEqual(params["tok"], 2500)
        self.assertEqual(params["pg"], 0)

    def test_record_analytics_usage_prefers_provider_total(self) -> None:
        service, db = self._service_with_free_account()
        service.record_analytics_usage(
            user_id="user-2",
            source="analytics_chat_assistant",
            prompt_tokens=1000,
            output_tokens=500,
            total_tokens=1800,
            operation_id="analysis-2",
        )
        event = db.add.call_args.args[0]
        self.assertEqual(event.total_tokens, 1800)
        self.assertEqual(event.quantity, 1800)
        self.assertEqual(db.execute.call_args.args[1]["tok"], 1800)

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

    def test_token_call_may_cross_final_free_boundary(self) -> None:
        service, db = self._service_with_free_account()
        service.get_billing_info.return_value.update(tokens_used=199_999)
        service.record_analytics_usage(
            user_id="user-4",
            source="analytics_chat_assistant",
            prompt_tokens=100,
            output_tokens=50,
            total_tokens=150,
            operation_id="boundary-call",
        )
        self.assertEqual(db.add.call_args.args[0].quantity, 150)

    def test_subsequent_token_work_is_blocked_after_boundary(self) -> None:
        service, _db = self._service_with_free_account()
        service.get_billing_info.return_value.update(tokens_used=200_001)
        with self.assertRaises(PlanLimitExceeded) as raised:
            service.record_analytics_usage(
                user_id="user-5",
                source="analytics_chat_assistant",
                prompt_tokens=1,
                output_tokens=1,
                operation_id="blocked-call",
            )
        self.assertEqual(raised.exception.detail["code"], "billing_limit_exceeded")
        self.assertEqual(raised.exception.detail["unit"], "token")

    def test_token_accumulator_sums_provider_totals_and_retries(self) -> None:
        accumulator = TokenAccumulator()
        accumulator.add({"prompt_tokens": 10, "output_tokens": 5, "total_tokens": 20})
        accumulator.add({"prompt_tokens": 3, "output_tokens": 2})
        self.assertEqual(accumulator.total_tokens, 25)
        self.assertEqual(accumulator.prompt_tokens, 13)
        self.assertEqual(accumulator.output_tokens, 7)

    def test_free_page_and_token_limits_are_independent(self) -> None:
        service, _db = self._service_with_free_account()
        service.get_billing_info.return_value.update(
            pages_used=100,
            tokens_used=10,
        )
        self.assertFalse(service.check_limit("user-6", "page", 1))
        self.assertTrue(service.check_limit("user-6", "token", 1))

    def test_paid_plans_allow_page_and_token_overages(self) -> None:
        service, _db = self._service_with_free_account()
        service.get_billing_info.return_value.update(
            plan_code="basic",
            pages_used=999,
            pages_included=500,
            tokens_used=2_000_000,
            tokens_included=1_000_000,
        )
        self.assertTrue(service.check_limit("user-7", "page", 100))
        self.assertTrue(service.check_limit("user-7", "token", 100_000))

    def test_shadow_token_event_is_tracked_but_not_sent_to_stripe(self) -> None:
        service, db = self._service_with_free_account()
        account = service.get_or_create_billing_account.return_value
        account.plan_code = "basic"
        account.token_billing_effective_at = datetime(2099, 1, 1, tzinfo=timezone.utc)
        service.get_billing_info.return_value.update(
            plan_code="basic",
            token_billing_shadow=True,
        )
        service.record_analytics_usage(
            user_id="user-8",
            source="analytics_chat_assistant",
            prompt_tokens=100,
            output_tokens=50,
            operation_id="shadow-call",
        )
        self.assertEqual(db.add.call_args.args[0].stripe_status, "shadow")


class BillingServiceStripeOutboxTests(unittest.TestCase):
    def test_unit_specific_meter_and_event_uuid_identifier(self) -> None:
        db = MagicMock()
        account = SimpleNamespace(stripe_customer_id="cus_123")
        db.query.return_value.filter.return_value.first.return_value = account
        event = SimpleNamespace(
            id="11111111-1111-1111-1111-111111111111",
            user_id="user-1",
            unit="token",
            quantity=2400,
            occurred_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
            stripe_status="pending",
            stripe_reported=False,
            stripe_record_id=None,
            stripe_last_error=None,
        )
        with patch("services.billing_service.stripe.billing.MeterEvent.create", return_value=SimpleNamespace(identifier=None)) as create:
            self.assertTrue(BillingService(db)._report_usage_to_stripe(event))
        create.assert_called_once_with(
            event_name="cpaautomation_tokens",
            payload={"stripe_customer_id": "cus_123", "value": 2400},
            timestamp=int(datetime(2026, 8, 1, tzinfo=timezone.utc).timestamp()),
            identifier="11111111-1111-1111-1111-111111111111",
        )
        self.assertEqual(event.stripe_status, "reported")

    def test_failed_meter_event_retries_with_the_same_identifier(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(
            stripe_customer_id="cus_123"
        )
        event = SimpleNamespace(
            id="22222222-2222-2222-2222-222222222222",
            user_id="user-2",
            unit="page",
            quantity=3,
            occurred_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
            stripe_status="pending",
            stripe_reported=False,
            stripe_record_id=None,
            stripe_last_error=None,
        )
        with patch(
            "services.billing_service.stripe.billing.MeterEvent.create",
            side_effect=[RuntimeError("temporary"), SimpleNamespace(identifier=None)],
        ) as create:
            service = BillingService(db)
            self.assertFalse(service._report_usage_to_stripe(event))
            self.assertEqual(event.stripe_status, "failed")
            self.assertTrue(service._report_usage_to_stripe(event))
        self.assertEqual(
            [call.kwargs["identifier"] for call in create.call_args_list],
            [str(event.id), str(event.id)],
        )
        self.assertEqual(event.stripe_status, "reported")

    def test_checkout_contains_fixed_page_and_token_prices(self) -> None:
        db = MagicMock()
        plan = SimpleNamespace(
            code="basic",
            stripe_price_recurring_id="price_fixed",
            stripe_price_metered_id="price_pages",
            stripe_price_token_metered_id="price_tokens",
        )
        user = SimpleNamespace(email="person@example.com")
        db.query.return_value.filter.return_value.first.side_effect = [plan, user]
        account = SimpleNamespace(
            plan_code="free",
            stripe_customer_id="cus_123",
            stripe_subscription_id=None,
        )
        service = BillingService(db)
        service.get_or_create_billing_account = MagicMock(return_value=account)
        with (
            patch("services.billing_service.stripe.Customer.retrieve", return_value=SimpleNamespace(id="cus_123")),
            patch("services.billing_service.stripe.checkout.Session.create", return_value=SimpleNamespace(url="https://checkout")) as create,
        ):
            self.assertEqual(service.create_checkout_session("user-1", "basic", "https://ok", "https://cancel"), "https://checkout")
        self.assertEqual(
            create.call_args.kwargs["line_items"],
            [{"price": "price_fixed", "quantity": 1}, {"price": "price_pages"}, {"price": "price_tokens"}],
        )


if __name__ == "__main__":
    unittest.main()
