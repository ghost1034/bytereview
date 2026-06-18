---
title: "Fixed Assets"
description: "Manage assets, leases, loans, intangibles, and software with GAAP and tax depreciation schedules and auto-generated journal entries."
order: 6
---

**Fixed Assets** manages depreciation and amortization for assets, leases, loans, intangibles, and software — producing both **GAAP** and **tax** schedules and the journal entries to book them. Open it at `/dashboard/analytics/amortization`.

## Choose a client

Fixed Assets is organized per client, so you'll first pick a **client** — or **General** for firm-wide assets. You can switch later with **Change client**.

## The asset register

The list page is your asset register. At the top, an **As of** date controls the point in time the figures are calculated for, and summary cards (total cost basis, net book value, period expense, active count) update to *"As of"* that date. The table shows each asset's type, cost basis, accumulated depreciation, net book value, GAAP and tax methods, and status (**Active**, **Disposed**, **Fully Depreciated**, or **Impaired**).

From here you can also open **Reports**, **Bulk upload**, and **Journal entries** (covered below).

## Add an asset

Click **New asset** to open the form. You can fill it in two ways:

- **By hand** — type the details directly.
- **From a document** — click **Upload document** and the AI extracts the asset's details (name, cost, dates, method, lease terms, and more) and pre-fills the form. Review the prefilled fields, since extraction can occasionally need a correction.

### Core fields

- **Asset name** and **Asset type** — choose from **Fixed Assets**, **Lease – Operating**, **Lease – Finance**, **Loan Amortization**, **Intangible Assets**, or **Software Costs**. The form reveals extra fields based on the type you pick.
- **Cost basis**, **salvage value**, **useful life**, and **start date**.
- **GAAP method** and **Tax method** — choose a book method and a tax method. Selecting **MACRS** as the tax method reveals **MACRS property class**, **system**, and **convention**, and adds a separate tax schedule.

### Type-specific fields

- **Leases (ASC 842)** — classification (**Operating** / **Finance**), payment amount, payment frequency (Monthly, Quarterly, Semi-Annually, Annually), payment timing (Beginning/End of Period), incremental borrowing rate, and lease incentives.
- **Loans** — principal, interest rate, rate type (Fixed/Variable), and term.
- **Intangibles / Software** — life type, legal life, and software stage.
- **Tax elections** (where applicable) — Section 179, bonus depreciation, listed property, and business-use percentage.

### Schedule, compliance, and saving

- Click **Generate** to compute the schedule. The preview shows the GAAP schedule and, when a tax method like MACRS applies, the **MACRS tax schedule** alongside it, plus a **Journal entries** tab.
- Click **Compliance check** for an AI **compliance insight** — a short, ASC-cited note on whether your setup looks right.
- Click **Save asset** (or **Save changes** when editing) to add it to the register.

## Journal entries

The **Journal entries** view lets you pick a period and book that period's depreciation/amortization for your assets. Saved entries are listed for reference and export.

## Disposing an asset

To retire an asset, use its **Dispose** action to open the **Dispose asset** dialog. Enter the disposal date and proceeds; the suite computes the gain or loss against book value, marks the asset **Disposed**, and appends a disposal journal entry.

## Bulk upload and reports

- **Bulk upload** imports many assets at once from a CSV/Excel template (up to 5,000 rows). Click **Download Template** to get the exact columns, or **Use Demo Data** to see a populated example.
- **Reports** exports consolidated schedules and registers across the assets in view.

> **Tip:** Not sure which method or election applies? Ask the [AI Assistant](/docs/ai-analytics-suite/ai-assistant) from the Fixed Assets screen, or consult the [GAAP & IRS researchers](/docs/ai-analytics-suite/research-bots) for cited guidance.
