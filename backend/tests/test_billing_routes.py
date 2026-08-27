from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute

from routes import billing as billing_routes
from routes import tasklytic as tasklytic_routes


def _billing_info() -> dict:
    return {
        "pages_used": 4,
        "pages_included": 20,
        "tokens_used": 100,
        "tokens_included": 1_000,
        "pbc_storage_bytes_included": 20 * 1024 * 1024,
        "current_period_start": None,
        "current_period_end": None,
        "plan_code": "free",
        "plan_display_name": "Free",
        "overage_cents": 0,
        "token_overage_cents": 0,
        "token_billing_effective_at": None,
        "token_billing_shadow": False,
        "product_breakdown": {},
    }


def test_usage_stats_include_firm_wide_pbc_storage(monkeypatch):
    firm_id = uuid.uuid4()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(firm_id=firm_id)
    summary = {
        "plan_code": "basic",
        "used_bytes": 12,
        "reserved_bytes": 3,
        "included_bytes": 100,
        "remaining_bytes": 85,
    }
    service = SimpleNamespace(get_billing_info=lambda _user_id: _billing_info())
    monkeypatch.setattr(billing_routes, "get_billing_service", lambda _db: service)
    monkeypatch.setattr(
        billing_routes,
        "pbc_storage_summary",
        lambda _db, resolved_firm_id: summary if resolved_firm_id == firm_id else None,
    )

    response = asyncio.run(billing_routes.get_usage_stats(user_id="user-1", db=db))

    assert response.pbc_storage_bytes_used == 12
    assert response.pbc_storage_bytes_reserved == 3
    assert response.pbc_storage_bytes_included == 100
    assert response.pbc_storage_bytes_remaining == 85


def test_pbc_storage_usage_falls_back_to_account_allowance_without_a_firm():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    assert billing_routes._pbc_storage_usage(db, "user-1", 123) == {
        "used_bytes": 0,
        "reserved_bytes": 0,
        "included_bytes": 123,
        "remaining_bytes": 123,
    }


def test_tasklytic_paid_gate_rejects_free_accounts(monkeypatch):
    service = SimpleNamespace(get_billing_info=lambda _user_id: {"plan_code": "free"})
    monkeypatch.setattr(tasklytic_routes, "get_billing_service", lambda _db: service)

    with pytest.raises(HTTPException) as exc_info:
        tasklytic_routes.require_paid_tasklytic_user(
            token={"uid": "free-user"},
            db=MagicMock(),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == {
        "code": "tasklytic_paid_plan_required",
        "message": "Tasklytic requires a paid plan.",
    }


def test_tasklytic_paid_gate_allows_paid_accounts(monkeypatch):
    service = SimpleNamespace(get_billing_info=lambda _user_id: {"plan_code": "basic"})
    monkeypatch.setattr(tasklytic_routes, "get_billing_service", lambda _db: service)
    token = {"uid": "paid-user"}

    assert tasklytic_routes.require_paid_tasklytic_user(
        token=token,
        db=MagicMock(),
    ) is token


def test_every_authenticated_tasklytic_route_requires_a_paid_plan():
    intentionally_public_paths = {
        "/api/tasklytic/public/forms/{form_key}",
        "/api/tasklytic/public/forms/{form_key}/files:initiate",
        "/api/tasklytic/public/files:complete",
        "/api/tasklytic/public/forms/{form_key}/submit",
        "/api/tasklytic/integrations/stripe-connect/webhook",
    }

    for route in tasklytic_routes.router.routes:
        if not isinstance(route, APIRoute) or route.path in intentionally_public_paths:
            continue
        dependency_calls = {dependency.call for dependency in route.dependant.dependencies}
        assert tasklytic_routes.require_paid_tasklytic_user in dependency_calls, route.path
