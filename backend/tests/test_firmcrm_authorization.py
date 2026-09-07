from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute

from firmcrm import router as firmcrm_routes


def test_firmcrm_pro_gate_rejects_free_and_basic_accounts(monkeypatch):
    plan = {"code": "free"}
    service = SimpleNamespace(
        get_billing_info=lambda _user_id: {"plan_code": plan["code"]}
    )
    monkeypatch.setattr(firmcrm_routes, "get_billing_service", lambda _db: service)

    for plan_code in ("free", "basic", None):
        plan["code"] = plan_code
        with pytest.raises(HTTPException) as exc_info:
            firmcrm_routes.require_pro_firmcrm_user(
                token={"uid": "non-pro-user"},
                db=MagicMock(),
            )

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == {
            "code": "firmcrm_pro_plan_required",
            "message": "FirmCRM requires the Pro plan.",
        }


def test_firmcrm_pro_gate_allows_pro_accounts(monkeypatch):
    service = SimpleNamespace(get_billing_info=lambda _user_id: {"plan_code": "PRO"})
    monkeypatch.setattr(firmcrm_routes, "get_billing_service", lambda _db: service)
    token = {"uid": "pro-user"}

    assert firmcrm_routes.require_pro_firmcrm_user(
        token=token,
        db=MagicMock(),
    ) is token


def test_every_firmcrm_route_requires_the_pro_plan():
    for route in firmcrm_routes.router.routes:
        if not isinstance(route, APIRoute):
            continue
        dependency_calls = {dependency.call for dependency in route.dependant.dependencies}
        assert firmcrm_routes.require_pro_firmcrm_user in dependency_calls, route.path
