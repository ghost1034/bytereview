from types import SimpleNamespace
from unittest.mock import patch

from scripts.setup_stripe_products import (
    BASIC,
    PRO,
    TOKEN_OVERAGE_PRICE_UNITS,
    ensure_metered_price,
)


def test_plan_overage_rates_use_current_pricing():
    assert BASIC["overage_cents"] == 15
    assert BASIC["token_overage_cents"] == 25
    assert BASIC["price_lookup_metered"].endswith("_v2")
    assert BASIC["price_lookup_token_metered"].endswith("_v2")
    assert PRO["overage_cents"] == 5
    assert PRO["token_overage_cents"] == 10
    assert PRO["price_lookup_metered"].endswith("_v2")
    assert PRO["price_lookup_token_metered"].endswith("_v2")
    assert TOKEN_OVERAGE_PRICE_UNITS == 10_000


def test_token_metered_price_uses_raw_token_tier_and_decimal_rate():
    with (
        patch("scripts.setup_stripe_products.stripe.Price.search", return_value=SimpleNamespace(data=[])),
        patch(
            "scripts.setup_stripe_products.stripe.Price.create",
            return_value=SimpleNamespace(id="price_tokens"),
        ) as create_price,
    ):
        ensure_metered_price(
            product_id="prod_basic",
            lookup_key="basic_tokens",
            meter_id="meter_tokens",
            included=1_000_000,
            overage_cents=25,
            unit="token",
            price_per_units=TOKEN_OVERAGE_PRICE_UNITS,
        )

    params = create_price.call_args.kwargs
    assert params["tiers"] == [
        {"up_to": 1_000_000, "unit_amount": 0},
        {"up_to": "inf", "unit_amount_decimal": "0.0025"},
    ]
    assert "transform_quantity" not in params


def test_page_metered_price_keeps_integer_cent_rate():
    with (
        patch("scripts.setup_stripe_products.stripe.Price.search", return_value=SimpleNamespace(data=[])),
        patch(
            "scripts.setup_stripe_products.stripe.Price.create",
            return_value=SimpleNamespace(id="price_pages"),
        ) as create_price,
    ):
        ensure_metered_price(
            product_id="prod_basic",
            lookup_key="basic_pages",
            meter_id="meter_pages",
            included=500,
            overage_cents=15,
        )

    assert create_price.call_args.kwargs["tiers"] == [
        {"up_to": 500, "unit_amount": 0},
        {"up_to": "inf", "unit_amount": 15},
    ]
