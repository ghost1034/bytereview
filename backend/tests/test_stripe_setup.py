from types import SimpleNamespace
from unittest.mock import patch

from scripts.setup_stripe_products import ensure_metered_price


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
            price_per_units=1_000,
        )

    params = create_price.call_args.kwargs
    assert params["tiers"] == [
        {"up_to": 1_000_000, "unit_amount": 0},
        {"up_to": "inf", "unit_amount_decimal": "0.025"},
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
            overage_cents=50,
        )

    assert create_price.call_args.kwargs["tiers"] == [
        {"up_to": 500, "unit_amount": 0},
        {"up_to": "inf", "unit_amount": 50},
    ]
