from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

from routes import billing as billing_routes


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
