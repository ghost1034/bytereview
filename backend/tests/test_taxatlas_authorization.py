from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from services.paid_product_access import is_paid_plan, require_paid_plan
from taxatlas.api.deps import TaxAtlasPrincipal, principal_scopes, require_admin, require_jwt_user
from taxatlas.api.v1.account import max_scopes_for
from taxatlas.models import ApiKey, DeliveryChannel


def user(*, admin: bool = False):
    return SimpleNamespace(id="firebase-user", is_system_admin=admin, email="user@example.com")


def key(scopes: list[str] | None = None):
    return SimpleNamespace(scopes=scopes or ["read"])


def test_shared_paid_plan_policy_matches_tasklytic_contract():
    assert not is_paid_plan(None)
    assert not is_paid_plan(" free ")
    assert is_paid_plan("basic")
    assert is_paid_plan("PRO")

    with pytest.raises(HTTPException) as denied:
        require_paid_plan(
            object(),
            "firebase-user",
            product_code="taxatlas",
            product_name="TaxAtlas",
            billing_service_factory=lambda _db: SimpleNamespace(
                get_billing_info=lambda _uid: {"plan_code": "free"}
            ),
        )
    assert denied.value.status_code == 403
    assert denied.value.detail["code"] == "taxatlas_paid_plan_required"


def test_billing_lookup_failure_is_fail_closed():
    def broken(_db):
        raise RuntimeError("billing unavailable")

    with pytest.raises(HTTPException) as denied:
        require_paid_plan(
            object(),
            "firebase-user",
            product_code="taxatlas",
            product_name="TaxAtlas",
            billing_service_factory=broken,
        )
    assert denied.value.status_code == 503
    assert denied.value.detail["code"] == "taxatlas_billing_unavailable"


def test_api_key_admin_scope_is_rechecked_against_current_platform_admin_flag():
    principal = TaxAtlasPrincipal(user=user(admin=True), api_key=key(["read", "admin"]), via="api_key")
    assert principal_scopes(principal) == {"read", "admin"}
    assert require_admin(principal).id == "firebase-user"

    principal.user.is_system_admin = False
    assert principal_scopes(principal) == {"read"}
    with pytest.raises(HTTPException) as denied:
        require_admin(principal)
    assert denied.value.status_code == 403


def test_account_mutations_require_firebase_and_admin_keys_are_admin_only():
    interactive = TaxAtlasPrincipal(user=user(admin=False), api_key=None, via="firebase")
    assert require_jwt_user(interactive).id == "firebase-user"
    assert max_scopes_for(interactive.user) == {"read"}

    machine = TaxAtlasPrincipal(user=user(admin=True), api_key=key(["read", "admin"]), via="api_key")
    with pytest.raises(HTTPException) as denied:
        require_jwt_user(machine)
    assert denied.value.status_code == 403
    assert max_scopes_for(machine.user) == {"read", "admin"}


def test_personalized_models_use_firebase_uids_and_prefixed_tables():
    assert isinstance(ApiKey.__table__.c.user_id.type.length, int)
    assert ApiKey.__table__.c.user_id.type.length == 128
    assert ApiKey.__tablename__ == "taxatlas_api_keys"
    assert DeliveryChannel.__tablename__ == "taxatlas_delivery_channels"
    assert "secret" not in DeliveryChannel.__table__.c
    assert "secret_ciphertext" in DeliveryChannel.__table__.c

