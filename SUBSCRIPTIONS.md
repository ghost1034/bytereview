# Subscriptions

_Stripe integration, plan limits, and usage metering for ByteReview — Phase 1_

---

## 1 · Goals & scope

- Charge for **Basic** and **Pro** via Stripe (recurring + metered overage).
    
- Enforce **monthly page** limits and **automation-count** limits per plan.
    
- Track usage (pages) reliably and surface near‑real‑time totals in the UI.
    
- Reset usage at period boundaries (Stripe period for paid; calendar month for Free).
    
- Keep workers fast; never double‑count; make all state changes idempotent.
    

---

## 2 · Plans & entitlements

|Plan|Price|Included pages / month|Automations (enabled)|Overage|
|---|---|---|---|---|
|**Free**|$0|**100**|**0** (blocked)|**None** (hard cap)|
|**Basic**|$9.99|**500**|**5**|**$0.50/page**|
|**Pro**|$49.99|**5000**|**50**|**$0.20/page**|

---

## 3 · Stripe configuration (paid plans only)

Create **two products** in Stripe: **Basic** and **Pro**.

Each product has **two Prices**:

1. **Recurring fixed** monthly fee.
    
2. **Metered per-page** usage with _tiers_:
    
    - **Basic:** $0 up to **500**, then **$0.50/page**.
        
    - **Pro:** $0 up to **5000**, then **$0.20/page**.  
        Aggregation: `sum`.
        

**Checkout & Portal**

- Use Checkout (mode `subscription`) to start Basic/Pro.
    
- Enable Customer Portal for upgrades/downgrades and payment method changes.
    
- **Free** has **no** Stripe subscription/customer until upgrade.
    

**Webhooks** (with signature verification):  
`checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.upcoming`, `invoice.finalized`, `invoice.payment_failed`.

---

## 4 · Data model (DDL)

```
-- Plan catalog and Stripe mapping (no versioning in Phase 1)
CREATE TABLE subscription_plans (
  code                        text PRIMARY KEY,            -- 'free'|'basic'|'pro'
  display_name                text NOT NULL,
  pages_included              int  NOT NULL,
  automations_limit           int  NOT NULL,
  overage_cents               int  NOT NULL,               -- 0 for free
  stripe_product_id           text,                        -- NULL for 'free'
  stripe_price_recurring_id   text,
  stripe_price_metered_id     text,
  is_active                   boolean NOT NULL DEFAULT true,
  sort_order                  int NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- One row per user; free users: plan_code='free', no Stripe IDs
CREATE TABLE billing_accounts (
  user_id                varchar(128) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_code              text NOT NULL REFERENCES subscription_plans(code),
  stripe_customer_id     text,                 -- NULL until first upgrade
  stripe_subscription_id text,                 -- NULL for free
  current_period_start   timestamptz,          -- from Stripe for paid; calendar month for free
  current_period_end     timestamptz,
  status                 text NOT NULL DEFAULT 'active',  -- 'active','past_due','canceled','paused'
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Authoritative, append-only usage events
CREATE TABLE usage_events (
  id               uuid PRIMARY KEY,
  user_id          varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurred_at      timestamptz  NOT NULL DEFAULT now(),
  source           text NOT NULL,          -- 'extraction_task', 'manual_adjustment', etc.
  task_id          uuid REFERENCES extraction_tasks(id) ON DELETE SET NULL,  -- NULL for manual adjustments
  pages            int  NOT NULL CHECK (pages >= 0),
  stripe_reported  boolean NOT NULL DEFAULT false,
  stripe_record_id text,
  notes            text
);

-- Cached totals per active period (fast UI reads)
CREATE TABLE usage_counters (
  user_id       varchar(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start  timestamptz  NOT NULL,
  period_end    timestamptz  NOT NULL,
  pages_total   int          NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period_start)
);

-- Convenience view to read effective entitlements without duplicating cols
CREATE VIEW v_billing_effective AS
SELECT ba.user_id,
       ba.plan_code,
       ba.current_period_start,
       ba.current_period_end,
       sp.pages_included,
       sp.automations_limit,
       sp.overage_cents
  FROM billing_accounts ba
  JOIN subscription_plans sp ON sp.code = ba.plan_code;
```

Seed plans:

```
INSERT INTO subscription_plans
(code, display_name, pages_included, automations_limit, overage_cents,
 stripe_product_id, stripe_price_recurring_id, stripe_price_metered_id, sort_order)
VALUES
('free','Free',   100,  0,   0,   NULL, NULL, NULL, 1),
('basic','Basic', 500,  5,  50,  '<prod_basic>', '<price_basic_rec>', '<price_basic_metered>', 2),
('pro','Pro',   5000, 50,  20,  '<prod_pro>',   '<price_pro_rec>',   '<price_pro_metered>',   3);
```


---

## 5 · Period boundaries & usage reset

**Paid (Stripe authoritative):** on `customer.subscription.updated`, copy `current_period_start/end` from Stripe into `billing_accounts`. Ensure a fresh `usage_counters` row exists for `(user_id, period_start)`.

**Free:** a monthly cron at 00:00 UTC on the 1st advances `current_period_start/end` to the new month’s boundaries and inserts the new period row in `usage_counters`.

We never delete history; each period has its own `usage_counters` row. The UI reads the row where `period_start = billing_accounts.current_period_start`.

---

## 6 · Page metering (when & how)

**When:** at **extraction task completion** (success only).  
**How:** sum `source_files.page_count` of the files that the task processed. Combined tasks sum their members. ZIP members are counted **after** unpacking (the archive itself is ignored).

**Worker outline (pseudo):**

```
pages = sum_page_counts(file_ids)
if pages <= 0:
    return

acct = db.one("""
  SELECT plan_code, current_period_start, current_period_end
    FROM billing_accounts WHERE user_id=:u
""", {"u": user_id})

# Hard cap for Free
used = db.scalar("""
  SELECT pages_total FROM usage_counters
   WHERE user_id=:u AND period_start=:ps
""", {"u": user_id, "ps": acct.current_period_start}) or 0

if acct.plan_code == 'free' and used + pages > (
   db.scalar("SELECT pages_included FROM subscription_plans WHERE code='free'")
):
    raise PlanLimitExceeded

# 1) append authoritative event (link to the finishing extraction task)
event_id = uuid4()
db.execute("""
  INSERT INTO usage_events(id, user_id, occurred_at, source, task_id, pages)
  VALUES (:id,:u,now(),'extraction_task',:task,:pg)
""", {"id": event_id, "u": user_id, "task": str(task_id), "pg": pages})

# 2) bump cached counter (idempotent upsert)
db.execute("""
  INSERT INTO usage_counters(user_id, period_start, period_end, pages_total)
  VALUES (:u,:ps,:pe,:pg)
  ON CONFLICT (user_id, period_start) DO UPDATE
  SET pages_total = usage_counters.pages_total + EXCLUDED.pages_total
""", {"u": user_id, "ps": acct.current_period_start, "pe": acct.current_period_end, "pg": pages})

# 3) report to Stripe for paid plans
if acct.plan_code in ('basic','pro'):
    stripe_usage_increment_async(user_id, pages, idempotency=f"usage_event/{event_id}")
```

> **Idempotency:** usage is recorded once per task; Stripe call uses an idempotency key derived from the usage event ID. Retries are safe.

---

## 7 · Reporting usage to Stripe (Basic/Pro)

- On subscription creation, store the **metered subscription item ID** (or look it up on each call).
    
- Send `UsageRecords.create` with `{quantity: pages, timestamp: now(), action: 'increment'}` and `Idempotency-Key: usage_event/<uuid>`.
    
- Mark `usage_events.stripe_reported=true` on success; keep a retry job that scans for `stripe_reported=false`.
    

> We report **all pages**; Stripe’s tiers ensure $0 within included pages and bill only overage.

---

## 8 · Limits enforcement

### Automations limit

- Free: **0** (block enablement).
    
- Basic: **5**, Pro: **50** (count enabled rows).
    

```
SELECT COUNT(*)
  FROM automations
 WHERE user_id=:u AND is_enabled = true;
```

If `count >= automations_limit` (from `subscription_plans`), reject with 403 + upgrade hint.  
`automation_trigger_worker` re-checks at fire time to avoid work after downgrade.

### Page cap

- Free: block job start if `used` + sum of `page_count` from `source_files` > `pages_included`.
    
- Basic/Pro: allow (overage billed by Stripe). Optional future: user-configurable spend cap.
    

---

## 9 · Backend API (selected)

- `GET /billing/account` → `{ planCode, periodStart, periodEnd, pagesUsed, pagesIncluded, automationsLimit, status }` (join with `subscription_plans`).
    
- `POST /billing/checkout` → starts Checkout for Basic/Pro (returns URL).
    
- `POST /billing/portal` → returns Stripe Portal URL (only if paid or has customer ID).
    

---

## 10 · Webhook handling

`**checkout.session.completed**`

- Create/fetch Stripe customer; create subscription.
    
- Set `billing_accounts.plan_code` to `basic|pro`, store `stripe_customer_id` and `stripe_subscription_id`.
    
- Initialize period dates from subscription; insert `usage_counters` row for new period if missing.
    

`**customer.subscription.updated**`

- Map prices → `plan_code`; update plan and period dates.
    
- Ensure a `usage_counters` row exists for the new period.
    
- If `status` transitions to `past_due`, consider pausing automations.
    

`**customer.subscription.deleted**`

- Downgrade to `plan_code='free'` (no Stripe product for Free).
    
- Clear subscription ID; set free period dates (calendar month) on next cron tick.
    

`**invoice.finalized**`

- Optional reconciliation: compare Stripe’s usage to `usage_events` sum for the period; log discrepancies.
    

---

## 11 · Monitoring & reconciliation

- Metrics: `billing_pages_used{plan}`, `paid_customers_total`, `stripe_usage_report_errors_total`, `automation_limit_blocks_total`.
    
- Nightly read-only reconciler: `SUM(pages)` from `usage_events` for active period vs. `usage_counters.pages_total`; correct drift if any.
    

---

## 12 · Migration plan

1. Apply DDL for `subscription_plans`, `billing_accounts`, `usage_events`, `usage_counters`, and `v_billing_effective`.
    
2. Seed plans (Free, Basic, Pro).
    
3. Backfill `billing_accounts` for all users as **Free** with current calendar-month period.
    
4. Implement Checkout/Portal endpoints and webhooks.
    
5. Add usage recording in extraction workers.
    
6. Turn on enforcement: automations limit, then Free page cap, then Stripe metered reporting.
    

---

## 13 · Testing matrix

- **Unit:** page counting across PDFs/ZIPs; Free cap rejections; automation enable limit.
    
- **Integration (Stripe test mode):** Checkout to Basic/Pro; report usage; finalize invoice; verify overage lines; downgrade back to Free.
    
- **Boundary:** tasks finishing exactly at period rollover; missed `subscription.updated` webhook (lazy new-period row creation on first usage).
    
- **Fault-inject:** Stripe outage during usage report → events retained and retried.
    

---

## 14 · Future work (out of scope for Phase 1)

- Plan **versioning** & grandfathered entitlements.
    
- Team/Org billing (one account, multiple users).
    
- Spend caps and pre-paid page packs.
    
- Stripe Tax, coupons, trials.
    
- Alerts for nearing Free cap.
    

---

### TL;DR

- Only **Basic/Pro** exist in Stripe; **Free** is in-app.
    
- Meter all pages to Stripe (tiered prices handle overage).
    
- Record usage in `usage_events`; surface via `usage_counters`.
    
- Enforce limits by joining `billing_accounts` → `subscription_plans`.
    
- Reset usage by rolling to a **new period row**, never by deleting history.