---
title: "Waterfall"
description: "Build revenue-recognition and deferral schedules — deferred revenue, prepaids, accruals, and deferred commissions — with auto-generated journal entries."
order: 7
---

**Waterfall** *("Build revenue-recognition and deferral schedules with auto-generated journal entries.")* spreads an amount across periods and books the recognition for you. Open it at `/dashboard/analytics/waterfall`.

## What you can schedule

A waterfall handles four schedule **types**:

| Type | Use it for |
| --- | --- |
| **Deferred Revenue** | Recognizing revenue over a contract term. |
| **Prepaid Expenses** | Spreading a prepaid cost (insurance, software) over its benefit period. |
| **Accrued Expenses** | Accruing an expense and reversing it when paid. |
| **Deferred Commission** | Amortizing a sales commission over the benefit period. |

## The list page

The list shows your schedules with the **party**, total amount, recognized-to-date, current balance, and status. An **As of** selector sets the point in time the balances reflect, and summary cards break the totals down by type. Use the **All clients** filter to focus on one client. From here you can also reach **Bulk upload**, **Reports**, and **Monthly journal entries**.

## Create a schedule

Click **New schedule** to open the form. As with Fixed Assets, you can enter it by hand or click **Upload contract** to have the AI extract the details (type, party, amount, dates) from a contract or invoice and pre-fill the form.

Fill in:

- **Type** — one of the four above. The form adapts to the type you choose.
- **Name** and **Party** — for example, *"Acme Corp — Annual SaaS License 2026."*
- **Total amount**, **Start date**, and **End date**.
- **Recognition method** — such as **Straight-Line** or **Pro-Rata Daily**.
- Type-specific options — for accruals, a **reversal method** (Reverse on Payment Date, Auto-Reverse Next Period, No Reversal); for commissions, the **commission type** and **benefit-period method**; and the relevant GL accounts.

As you edit, the form previews the **period-by-period recognition schedule** and the **journal entries** it will generate. Click **Save schedule** (or **Save changes** when editing).

## Monthly journal entries

The **Monthly journal entries** view books *"every contract's recognition for a chosen month as one consolidated journal."* Pick a month to see — and export — the combined entry across all active schedules.

## Writing off a schedule

To stop recognizing a schedule early, use its **Write-off** action. Enter the effective date, reason, and amount; the suite adjusts the remaining balance and records the write-off.

## Bulk upload and reports

- **Bulk upload** imports many schedules at once from a CSV/Excel template (up to 5,000 rows) — grab the template with **Download Template** or try **Use Demo Data**.
- **Reports** exports consolidated, period-by-period schedule detail and a monthly recognition summary.

> **Tip:** Wondering whether a schedule is ASC 606-compliant or how much revenue you'll recognize next month? Ask the [AI Assistant](/docs/ai-analytics-suite/ai-assistant) right from the Waterfall screen.
