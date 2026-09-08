"""Feedback contract tests plus isolated PostgreSQL reward/locking regressions.

Set FEEDBACK_TEST_DATABASE_URL to run the integration cases. Each case uses a
fresh schema; no existing application data is read or modified.
"""
import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import ForeignKeyConstraint, MetaData, create_engine, text
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import get_current_user_id
from models.db_models import (
    Automation, BillingAccount, FeedbackSubmission, Firm, SubscriptionPlan,
    UsageCounter, UsageEvent, User,
)
from models.feedback import FeedbackRequest
from models.pbc import PbcDocument
from routes.feedback import router
from services.billing_service import BillingService, PlanLimitExceeded
from services.feedback_service import FeedbackService, next_month
from services.pbc_storage import _firm_plan, pbc_storage_summary


def request(message="Please make uploading files easier."):
    return FeedbackRequest(request_id=uuid.uuid4(), message=message, page_path="/dashboard")


@pytest.mark.parametrize("message", ["", " \n\t ", "x" * 5001])
def test_rejects_empty_or_oversized_feedback(message):
    with pytest.raises(ValidationError):
        request(message)


def test_trims_feedback():
    assert request("  Useful idea \n").message == "Useful idea"


@pytest.mark.parametrize("start, expected", [
    ("2026-01-31", "2026-02-28"), ("2028-01-31", "2028-02-29"),
    ("2026-12-07", "2027-01-07"), ("2026-09-07", "2026-10-07"),
])
def test_month_reward_uses_calendar_month(start, expected):
    assert next_month(datetime.fromisoformat(start)).date().isoformat() == expected


@pytest.fixture
def engine():
    url = os.getenv("FEEDBACK_TEST_DATABASE_URL")
    if not url:
        pytest.skip("FEEDBACK_TEST_DATABASE_URL is required for PostgreSQL reward tests")
    schema = "feedback_test_" + uuid.uuid4().hex
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    with engine.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
    # Copy only this domain; unrelated product foreign keys are omitted in the
    # fixture. Production models and migrations retain every foreign key.
    metadata = MetaData()
    for model in (Firm, User, SubscriptionPlan, BillingAccount, UsageCounter, UsageEvent, FeedbackSubmission, Automation, PbcDocument):
        model.__table__.to_metadata(metadata)
    for table in metadata.tables.values():
        for constraint in list(table.constraints):
            if isinstance(constraint, ForeignKeyConstraint) and any(
                fk.target_fullname.split('.')[0] not in metadata.tables for fk in constraint.elements
            ):
                table.constraints.remove(constraint)
                for fk in constraint.elements:
                    table.foreign_keys.discard(fk)
                    fk.parent.foreign_keys.discard(fk)
    metadata.create_all(engine)
    with Session(engine) as db:
        db.add(Firm(id=uuid.UUID(int=1), name="Feedback test firm"))
        for code, pages, tokens in (("free", 100, 200000), ("basic", 500, 1000000), ("pro", 5000, 10000000)):
            db.add(SubscriptionPlan(
                code=code, display_name=code.title(), pages_included=pages,
                tokens_included=tokens, automations_limit=5, overage_cents=15,
                pbc_storage_bytes_included={"free": 20, "basic": 100, "pro": 1024}[code],
            ))
        db.flush()
        db.add(User(id="feedback-user", email="feedback@example.com", firm_id=uuid.UUID(int=1)))
        db.commit()
    try:
        yield engine
    finally:
        with engine.begin() as connection:
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        engine.dispose()


def paid_account(db, plan="basic"):
    account = BillingService(db).get_or_create_billing_account("feedback-user")
    now = datetime.now(timezone.utc)
    account.plan_code = plan
    account.stripe_customer_id = "cus_feedback_test"
    account.stripe_subscription_id = "sub_feedback_test"
    account.current_period_start = now - timedelta(days=10)
    account.current_period_end = now + timedelta(days=20)
    db.commit()
    return account


def test_free_reward_expires_and_caps_basic_usage(engine):
    with Session(engine) as db:
        service = BillingService(db)
        result = FeedbackService(db).submit("feedback-user", request())
        assert result.reward == "basic_month"
        assert service.get_billing_info("feedback-user")["plan_code"] == "basic"
        assert service.check_limit("feedback-user", "page", 500)
        assert not service.check_limit("feedback-user", "page", 501)
        assert not service.check_limit("feedback-user", "token", 1000001)
        assert _firm_plan(db, uuid.UUID(int=1)) == ("basic", 100)
        service.record_usage("feedback-user", product="uda", source="extraction_task", unit="page", quantity=500)
        assert db.query(UsageEvent).one().stripe_status == "non_billable"
        with pytest.raises(PlanLimitExceeded):
            service.record_usage("feedback-user", product="uda", source="extraction_task", unit="page", quantity=1)
        account = db.get(BillingAccount, "feedback-user")
        assert account.stripe_subscription_id is None
        account.feedback_basic_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        account.current_period_end = account.feedback_basic_until
        db.commit()
        assert service.get_billing_info("feedback-user")["plan_code"] == "free"
        assert _firm_plan(db, uuid.UUID(int=1)) == ("free", 20)


@pytest.mark.parametrize("plan", ["basic", "pro"])
def test_paid_reset_preserves_period_and_credits_stripe(engine, plan):
    with Session(engine) as db:
        account = paid_account(db, plan)
        period = (account.current_period_start, account.current_period_end)
        service = BillingService(db)
        service.record_usage("feedback-user", source="extraction_task", quantity=80, unit="page")
        service.record_usage("feedback-user", source="analytics_chat_basic", quantity=3000, unit="token")
        db.add_all([
            PbcDocument(request_id=uuid.uuid4(), firm_id=uuid.UUID(int=1),
                        object_name=state, filename="evidence.pdf", mime_type="application/pdf",
                        size_bytes=size, version=1, state=state, uploaded_by_kind="firm")
            for state, size in (("available", 12), ("initiated", 3))
        ])
        db.commit()
        storage = pbc_storage_summary(db, uuid.UUID(int=1))
        result = FeedbackService(db).submit("feedback-user", request())
        assert (result.pages_reset, result.tokens_reset, result.reward) == (80, 3000, "usage_reset")
        info = service.get_billing_info("feedback-user")
        assert (info["pages_used"], info["tokens_used"], info["product_breakdown"]) == (0, 0, {})
        assert (account.current_period_start, account.current_period_end) == period
        assert pbc_storage_summary(db, uuid.UUID(int=1)) == storage
        assert storage["used_bytes"] == 12 and storage["reserved_bytes"] == 3
        assert sorted(event.stripe_quantity for event in db.query(UsageEvent).filter(UsageEvent.source == "feedback_reset")) == [-3000, -80]
        with patch("services.billing_service.stripe.billing.MeterEvent.create", return_value=SimpleNamespace(identifier=None)) as meter:
            assert service.reconcile_stripe_usage()["failed"] == 0
        values = [call.kwargs["payload"]["value"] for call in meter.call_args_list]
        assert sorted(values) == [-3000, -80, 80, 3000]
        assert all(call.kwargs["identifier"] for call in meter.call_args_list)
        service.record_usage("feedback-user", source="extraction_task", quantity=7, unit="page")
        assert service.get_billing_info("feedback-user")["pages_used"] == 7
        assert service.get_billing_info("feedback-user")["product_breakdown"] == {"uda": {"pages": 7, "tokens": 0}}


def test_retries_and_additional_feedback_do_not_repeat_reward(engine):
    with Session(engine) as db:
        paid_account(db)
        payload = request()
        first = FeedbackService(db).submit("feedback-user", payload)
        assert FeedbackService(db).submit("feedback-user", payload).id == first.id
        BillingService(db).record_usage("feedback-user", source="extraction_task", quantity=7, unit="page")
        assert FeedbackService(db).submit("feedback-user", request()).reward == "none"
        assert BillingService(db).get_billing_info("feedback-user")["pages_used"] == 7
        assert db.query(FeedbackSubmission).count() == 2
        account = db.get(BillingAccount, "feedback-user")
        account.feedback_reward_available_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        account.current_period_start = datetime.now(timezone.utc)
        account.current_period_end = next_month(account.current_period_start)
        db.commit()
        assert FeedbackService(db).submit("feedback-user", request()).reward == "usage_reset"


def test_concurrent_submissions_grant_one_reward(engine):
    with Session(engine) as db:
        paid_account(db)
    def submit(_):
        with Session(engine) as db:
            return FeedbackService(db).submit("feedback-user", request()).reward
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(submit, range(2))) == ["none", "usage_reset"]


def test_failure_rolls_back_feedback_and_reward(engine):
    with Session(engine) as db:
        account = paid_account(db)
        BillingService(db).record_usage("feedback-user", source="extraction_task", quantity=9, unit="page")
        with patch.object(db, "commit", side_effect=RuntimeError("database unavailable")):
            with pytest.raises(RuntimeError):
                FeedbackService(db).submit("feedback-user", request())
        db.rollback()
        assert db.query(FeedbackSubmission).count() == 0
        assert account.feedback_reward_available_at is None
        assert BillingService(db).get_billing_info("feedback-user")["pages_used"] == 9


def test_api_validates_and_authenticates_feedback(engine):
    app = FastAPI()
    app.include_router(router)
    def database():
        with Session(engine) as db:
            yield db
    app.dependency_overrides[get_db] = database
    client = TestClient(app)
    assert client.post('/api/feedback', json=request().model_dump(mode="json")).status_code in (401, 403)
    app.dependency_overrides[get_current_user_id] = lambda: "feedback-user"
    assert client.post('/api/feedback', json={"request_id": str(uuid.uuid4()), "message": "  "}).status_code == 422
    response = client.post('/api/feedback', json=request().model_dump(mode="json"))
    assert response.status_code == 200
    assert response.json()["reward"] == "basic_month"


def test_concurrent_retry_for_new_free_account_is_idempotent(engine):
    payload = request()
    def submit(_):
        with Session(engine) as db:
            return FeedbackService(db).submit("feedback-user", payload).id
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(submit, range(2)))
    assert ids[0] == ids[1]
    with Session(engine) as db:
        assert db.query(FeedbackSubmission).count() == 1


def test_concurrent_usage_is_either_reset_or_counted_after_reset(engine):
    with Session(engine) as db:
        paid_account(db)
        BillingService(db).record_usage("feedback-user", source="extraction_task", quantity=9, unit="page")
    def operation(kind):
        with Session(engine) as db:
            if kind == "feedback":
                FeedbackService(db).submit("feedback-user", request())
            else:
                BillingService(db).record_usage("feedback-user", source="extraction_task", quantity=7, unit="page")
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(operation, ("feedback", "usage")))
    with Session(engine) as db:
        info = BillingService(db).get_billing_info("feedback-user")
        assert info["pages_used"] in (0, 7)
        assert sum(e.stripe_quantity if e.stripe_quantity is not None else e.quantity for e in db.query(UsageEvent)) == info["pages_used"]


def test_shadow_tokens_are_reset_locally_without_stripe_credit(engine):
    with Session(engine) as db:
        account = paid_account(db)
        account.token_billing_effective_at = next_month(datetime.now(timezone.utc))
        db.commit()
        BillingService(db).record_usage("feedback-user", source="analytics_chat_basic", quantity=3000, unit="token")
        result = FeedbackService(db).submit("feedback-user", request())
        assert result.tokens_reset == 3000
        assert db.query(UsageEvent).filter(UsageEvent.source == "feedback_reset").count() == 0


def test_paid_upgrade_takes_precedence_over_trial_expiration(engine):
    with Session(engine) as db:
        FeedbackService(db).submit("feedback-user", request())
        account = paid_account(db, "pro")
        account.feedback_basic_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        info = BillingService(db).get_billing_info("feedback-user")
        assert info["plan_code"] == "pro" and info["feedback_basic_until"] is None


def test_migration_roundtrip(engine):
    import importlib.util
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import inspect

    path = Path(__file__).resolve().parents[1] / "alembic/versions/080_feedback_rewards.py"
    spec = importlib.util.spec_from_file_location("feedback_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
            assert "feedback_submissions" not in inspect(connection).get_table_names()
            migration.upgrade()
            assert "feedback_submissions" in inspect(connection).get_table_names()
    with Session(engine) as db:
        assert FeedbackService(db).submit("feedback-user", request()).reward == "basic_month"
