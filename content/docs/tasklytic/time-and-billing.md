---
title: "Time and billing"
description: "Tasklytic's professional-services layer: timers and timesheets, expenses and reimbursements, clients and engagements, invoicing, payments, and trust accounting."
order: 10
---

The **PSA** group in the navigator turns delivery into billing: hours and expenses captured against real work, approved, then invoiced to a client. Which actions you can take depends on the capabilities your admin granted — see [Roles and capabilities](/docs/tasklytic/workspaces-teams-and-members#roles-and-capabilities).

> **Note:** Law-mode workspaces call engagements **matters** and use matter numbering, practice areas, and responsible attorneys. Other workspaces call them **engagements**. The two are the same object with different labels.

## Tracking time

Open **Time** in the PSA group. The header shows this week's total hours, billable hours, and utilization against your target.

### Three ways to log

- **Timer** — start one from the timer chip in the top bar or the **Track time** button on any task. The chip shows elapsed time while it runs, and stopping it creates an entry. `Shift+T` opens the timer controls.
- **Week grid** — type hours into the day cells of **My week**, one row per task or project.
- **Manual entry** — **Log time** opens a dialog for date, task or project, description, hours, billable flag, and activity code.

### Entry lifecycle

| Status | Meaning |
| --- | --- |
| **Draft** | Yours to edit |
| **Submitted** | Sent for approval |
| **Approved** / **Rejected** | Reviewed by an approver, with a reason on rejection |
| **Billed** | Attached to an invoice |
| **Written off** | Deliberately not billed, with a reason |

Each entry stores a **rate snapshot** and the source that rate came from, so historical entries keep their value when rates change later.

The **All entries** tab lists your entries with status filters and per-row actions: edit, submit, duplicate, write off (with Billing capability), and delete. **To approve** appears for approvers.

### Rate cascade

When an entry is created, Tasklytic resolves the hourly rate from the most specific source available:

1. Engagement rate for the person or their timekeeper role
2. Engagement rate card
3. Project
4. Client, or the client's default rate card
5. Team role
6. Workspace role
7. The person's default rate

Rates carry effective-from and effective-to dates, so a mid-year increase applies only to work done after it.

## Timesheets

**Submit week** rolls your week's entries into a timesheet for the workspace's period — weekly, biweekly, semimonthly, or monthly, with the week starting Monday or Sunday. While a timesheet is submitted or rejected, that week's entries are read-only; a banner tells you which.

**Timesheets** lists each period with its user, status, hours, amount, and utilization percentage. Statuses run draft → submitted → approved (or partially approved, or rejected) → locked. Someone with Billing capability can **Lock** an approved timesheet to freeze it for billing.

## Expenses

Open **Expenses**. The header totals your spend, the billable portion, and the reimbursable portion.

**Add expense** offers **Manual entry** or **Mileage** (miles × the workspace mileage rate). An expense records date, description, vendor, amount and tax, category, and payment method, plus three flags:

- **Billable** — chargeable to the client, with an optional **markup %**.
- **Pass-through** — billed at cost with no markup.
- **Reimbursable** — owed back to the person who paid.

Attach a receipt image, or enter receipt details manually. Admins can require receipts above a threshold amount.

Categories cover travel, meals, supplies, third-party and professional fees, court and filing fees, experts and witnesses, service and process, copies, postage, telecom, software, training, mileage, parking and tolls, and other.

Group expenses into an **expense report** to submit them together. Reports move draft → submitted → approved (or partially approved, or rejected) → reimbursed, and record the reimbursement method — payroll, ACH, or check — with a reference.

## Approvals

**Settings → Approvals** is the single policy surface:

- Require approval for **time** and for **expenses**.
- Set the **receipt required above** threshold.
- Allow or forbid **self-approval**.
- Route approvals per person, with separate time and expense approver lists. Workspace admins are always approvers.

Approvers work through **To approve** tabs on the Time and Expenses pages. Approving, rejecting, locking, writing off, and reimbursing each require the matching capability, so approval routing and capability flags work together.

## Clients and engagements

**Clients** lists each client with its engagement count, work in progress, accounts receivable, and retainer balance. A client record holds type, industry, contacts, fiscal year end, billing address, tax ID, payment terms (due on receipt, net 15/30/45/60), default rate card, default currency, and notes. Clients can be archived.

**Engagements** (or **Matters**) tie a project to a client for billing. Each holds a number, practice area, responsible and originating leads, fee arrangement (hourly, flat fee, contingency, hybrid, or retainer), budget hours and amount, rate card, UTBMS coding, trust flag, open and close dates, status, and conflict-check status.

A project can also carry its own billing setup — client, engagement, fee arrangement, budgets, rate card, engagement code, whether time or expense tracking is required, and its approval chains.

## Invoicing

**Invoicing** lists invoices with status, due date, total, and outstanding balance, and totals outstanding by currency.

**Generate invoice** opens a five-step wizard: pick the client, choose the unbilled time and expenses to include, review and adjust the line items, preview the invoice, then set the due date and notes to create a draft.

From an invoice's detail page:

| Action | Requires | Notes |
| --- | --- | --- |
| **Save narrative** | Billing | Edit the narrative, notes, and any discount while in draft |
| **Submit invoice** | Billing | Sends it for approval when approval is required |
| **Approve invoice** | Approve | Moves it to approved |
| **Record delivery** / **Resend** | Billing | Log a manual delivery in the history |
| **Email invoice** / **Email again** | Billing | Send it by email through the connected provider |
| **Download PDF** | — | Generates the invoice PDF |
| **Record payment** | Record payments | Check, ACH, wire, card, trust application, or other |
| **Create payment link** | Billing | A client payment link, when Stripe Connect is connected |
| **Void** / **Write off AR** | Billing | Both require a reason |

The page also shows the running balance, payment history (with reversal, which also requires the payments capability), and a full audit trail of billing events. Invoice numbering uses the workspace prefix and next number from **Settings → Billing controls**.

## Trust accounting

**Trust** tracks client funds held on account. Record **deposits** and **withdrawals** per client — the trust capability is required — and applications against invoices when a payment draws on trust. Every transaction stores the balance after it, and transactions can be reversed with a reason rather than deleted.

The page lists each client's balance and flags any that fall below the workspace's low-balance threshold, so you know when to request a top-up.

## Billing settings

**Settings → Billing controls** has seven tabs:

| Tab | Covers |
| --- | --- |
| **Rates** | Billing rates by scope, person, role, and effective dates |
| **Rate cards** | Named collections of rates, assignable to clients and engagements |
| **Activity codes** | Codes for classifying time, including UTBMS |
| **Invoicing** | Invoice prefix and numbering, payment terms, footer, and branded header |
| **Approvals** | Whether invoices need approval, and who approves them |
| **Budgets** | Amount and hour budgets by client, engagement, or project, with a warning percentage |
| **FX rates** | Workspace overrides for currency conversion |

## PSA reporting

**PSA reporting** (`/w/<workspace>/psa/reports`) opens with four headline metrics — **WIP**, **realization**, **utilization**, and **effective rate** — followed by charts for WIP aging, AR aging, utilization by staff, and trust balances. A second tab holds the billing rates panel.

For custom reports across the same data, build a dashboard from the time, expenses, utilization, WIP, invoices, payments, realization, effective-rate, or AR-aging sources in [Reporting](/docs/tasklytic/reporting).
