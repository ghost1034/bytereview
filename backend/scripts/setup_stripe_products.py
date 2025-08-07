#!/usr/bin/env python3
"""
Setup Stripe products, prices, and a billing meter for ByteReview.

Creates:
  - billing.meter: "ByteReview Pages" (event_name: "bytereview_pages")
  - product: "ByteReview Basic"
      - price: monthly recurring $9.99
      - price: metered (0 up to 500 pages, then $0.50/page) ATTACHED TO METER
  - product: "ByteReview Pro"
      - price: monthly recurring $49.99
      - price: metered (0 up to 5000 pages, then $0.20/page) ATTACHED TO METER

Re-runnable/idempotent:
  Uses lookup_key on prices, searches products by name, and reuses an existing meter by display_name.

Requirements:
  pip install stripe
  export STRIPE_SECRET_KEY=sk_test_xxx
  # (optional) export STRIPE_API_VERSION=2025-07-30.basil
"""

import os
import sys
import textwrap
from typing import Optional
from dotenv import load_dotenv

import stripe

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

BASIC = {
    "product_name": "ByteReview Basic",
    "plan_code": "basic",
    "monthly_cents": 999,       # $9.99
    "free_pages": 500,
    "overage_cents": 50,        # $0.50/page
    "price_lookup_recurring": "bytereview_basic_recurring_v1",
    "price_lookup_metered":   "bytereview_basic_metered_v1",
}

PRO = {
    "product_name": "ByteReview Pro",
    "plan_code": "pro",
    "monthly_cents": 4999,      # $49.99
    "free_pages": 5000,
    "overage_cents": 20,        # $0.20/page
    "price_lookup_recurring": "bytereview_pro_recurring_v1",
    "price_lookup_metered":   "bytereview_pro_metered_v1",
}

METER = {
    "display_name": "ByteReview Pages",
    "event_name": "bytereview_pages",
    "customer_mapping_type": "by_id",          # expects payload[stripe_customer_id]
    "value_payload_key": "value",              # expects payload[value]
    "aggregation_formula": "sum",              # sum values over the period
}

CURRENCY = "usd"

def fatal(msg: str):
    print(f"❌ {msg}")
    sys.exit(1)

def init_stripe():
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe.api_key:
        print("❌ Error: STRIPE_SECRET_KEY not found in environment variables")
        print("Please add your Stripe secret key to backend/.env")
        sys.exit(1)

    # Optional: pin API version. If not set, uses account default.
    api_ver = os.getenv("STRIPE_API_VERSION")
    if api_ver:
        stripe.api_version = api_ver

    print("🔧 Setting up Stripe products...")
    print(f"Using API key: {stripe.api_key[:12]}...")
    if api_ver:
        print(f"Using Stripe API version override: {api_ver}")

def ensure_meter() -> stripe.billing.Meter:
    """
    Create or fetch the single 'pages' billing meter.
    """
    # Try to find by display_name via list and filter in code (API search isn't offered for meters)
    existing = stripe.billing.Meter.list(limit=100)
    for m in existing.auto_paging_iter():
        if getattr(m, "display_name", None) == METER["display_name"]:
            print(f"✅ Reusing existing meter: {m.id} ({m.display_name})")
            return m

    # Create new meter
    print("➕ Creating billing meter for pages…")
    m = stripe.billing.Meter.create(
        display_name=METER["display_name"],
        event_name=METER["event_name"],
        default_aggregation={"formula": METER["aggregation_formula"]},
        value_settings={"event_payload_key": METER["value_payload_key"]},
        customer_mapping={
            "type": METER["customer_mapping_type"],
            "event_payload_key": "stripe_customer_id",
        },
    )
    print(f"✅ Created meter: {m.id}")
    return m

def search_product_by_name(name: str) -> Optional[stripe.Product]:
    """
    Use the Products Search API (fast path). Falls back to list if search unavailable.
    """
    try:
        res = stripe.Product.search(query=f"name:'{name}' AND active:'true'", limit=1)
        if res and res.data:
            return res.data[0]
    except Exception:
        # Fallback: list & filter
        lst = stripe.Product.list(active=True, limit=100)
        for p in lst.auto_paging_iter():
            if p.name == name:
                return p
    return None

def ensure_product(name: str, plan_code: str) -> stripe.Product:
    p = search_product_by_name(name)
    if p:
        print(f"✅ Reusing existing product: {p.id} ({name})")
        return p
    print(f"➕ Creating product: {name}")
    p = stripe.Product.create(
        name=name,
        active=True,
        metadata={"plan_code": plan_code},
    )
    print(f"✅ Created product: {p.id}")
    return p

def ensure_recurring_price(product_id: str, lookup_key: str, monthly_cents: int) -> stripe.Price:
    """
    Licensed recurring monthly price ($X.XX / month).
    """
    found = stripe.Price.search(query=f"lookup_key:'{lookup_key}'", limit=1)
    if found and found.data:
        pr = found.data[0]
        print(f"✅ Reusing recurring price: {pr.id} (lookup_key={lookup_key})")
        return pr

    print(f"➕ Creating recurring monthly price (lookup_key={lookup_key})…")
    pr = stripe.Price.create(
        currency=CURRENCY,
        unit_amount=monthly_cents,
        recurring={"interval": "month", "usage_type": "licensed"},
        product=product_id,
        lookup_key=lookup_key,
        billing_scheme="per_unit",
        metadata={"kind": "recurring_fixed"},
        nickname="Monthly subscription",
    )
    print(f"✅ Created recurring price: {pr.id}")
    return pr

def ensure_metered_price(product_id: str, lookup_key: str, meter_id: str, free_pages: int, overage_cents: int) -> stripe.Price:
    """
    Metered, tiered price attached to the billing meter.
    Tier 1: 0 → free_pages @ $0
    Tier 2: >free_pages → $overage_cents per page
    """
    found = stripe.Price.search(query=f"lookup_key:'{lookup_key}'", limit=1)
    if found and found.data:
        pr = found.data[0]
        print(f"✅ Reusing metered price: {pr.id} (lookup_key={lookup_key})")
        return pr

    print(f"➕ Creating metered price (lookup_key={lookup_key}) attached to meter {meter_id}…")
    # NOTE: meter must be attached via recurring.meter, and usage_type='metered'
    pr = stripe.Price.create(
        currency=CURRENCY,
        product=product_id,
        lookup_key=lookup_key,
        recurring={
            "interval": "month",
            "usage_type": "metered",
            "meter": meter_id,  # <-- critical for Basil+ API versions
        },
        billing_scheme="tiered",
        tiers_mode="graduated",
        tiers=[
            {"up_to": free_pages, "unit_amount": 0},
            {"up_to": "inf", "unit_amount": overage_cents},
        ],
        metadata={"kind": "metered_pages"},
        nickname=f"Pages (first {free_pages} free, then overage)",
    )
    print(f"✅ Created metered price: {pr.id}")
    return pr

def main():
    init_stripe()

    # Create/reuse billing meter
    meter = ensure_meter()

    # Create/reuse products & prices
    created = {}

    for spec in (BASIC, PRO):
        product = ensure_product(spec["product_name"], spec["plan_code"])
        recurring = ensure_recurring_price(
            product_id=product.id,
            lookup_key=spec["price_lookup_recurring"],
            monthly_cents=spec["monthly_cents"],
        )
        metered = ensure_metered_price(
            product_id=product.id,
            lookup_key=spec["price_lookup_metered"],
            meter_id=meter.id,
            free_pages=spec["free_pages"],
            overage_cents=spec["overage_cents"],
        )
        created[spec["plan_code"]] = {
            "product_id": product.id,
            "recurring_price_id": recurring.id,
            "metered_price_id": metered.id,
        }

    # Summary output
    print("\n" + "=" * 60)
    print("🎉 SUCCESS! Stripe products created successfully!")
    print("=" * 60)

    # Env vars
    env_block = textwrap.dedent(f"""
    # Stripe product & price IDs (test mode)
    STRIPE_METER_PAGES={meter.id}

    # Basic
    STRIPE_PRODUCT_BASIC={created['basic']['product_id']}
    STRIPE_PRICE_BASIC_RECURRING={created['basic']['recurring_price_id']}
    STRIPE_PRICE_BASIC_METERED={created['basic']['metered_price_id']}

    # Pro
    STRIPE_PRODUCT_PRO={created['pro']['product_id']}
    STRIPE_PRICE_PRO_RECURRING={created['pro']['recurring_price_id']}
    STRIPE_PRICE_PRO_METERED={created['pro']['metered_price_id']}
    """).strip()
    print("\n📝 Add these to your backend/.env file:")
    print(env_block)

    # SQL for subscription_plans
    sql_block = textwrap.dedent(f"""
    -- Update your subscription_plans mapping (test mode IDs)
    UPDATE subscription_plans
       SET stripe_product_id='{created['basic']['product_id']}',
           stripe_price_recurring_id='{created['basic']['recurring_price_id']}',
           stripe_price_metered_id='{created['basic']['metered_price_id']}'
     WHERE code='basic';

    UPDATE subscription_plans
       SET stripe_product_id='{created['pro']['product_id']}',
           stripe_price_recurring_id='{created['pro']['recurring_price_id']}',
           stripe_price_metered_id='{created['pro']['metered_price_id']}'
     WHERE code='pro';
    """).strip()
    print("\n📝 SQL to update your database:")
    print(sql_block)

    print("\n🔗 Next steps:")
    print("1. Add the environment variables above to backend/.env")
    print("2. Run the SQL commands above to update your database")
    print("3. Set up webhook endpoint in Stripe dashboard")
    print("4. Test the subscription flow!")

if __name__ == "__main__":
    try:
        main()
    except stripe.error.StripeError as e:
        # Helpful hint if user hits the Basil meter requirement again
        body = getattr(e, "user_message", None) or str(e)
        print("❌ Stripe API error")
        print(body)
        print("\nHint: If you see 'metered prices must be backed by meters',")
        print("make sure you're passing recurring[meter]=<meter_id> when creating the metered price,")
        print("and consider pinning STRIPE_API_VERSION to a Basil-era version (e.g. 2025-07-30.basil).")
        sys.exit(2)
    except Exception as e:
        print("❌ Unexpected error:", e)
        sys.exit(3)
