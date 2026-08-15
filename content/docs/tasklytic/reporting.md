---
title: "Reporting dashboards"
description: "Build dashboards from tasks, projects, goals, time, and billing data with the chart builder, then share them and schedule email digests."
order: 8
---

Reporting turns the data already in your workspace into charts you can arrange, share, and have delivered on a schedule. Open **Reporting** from the section bar; project- and portfolio-level dashboards are also available from their own **Dashboard** tabs.

## Dashboards

The reporting home lists every dashboard you can see, filtered by name, owner, and creation date. Click **New dashboard** to create one, then add charts to it.

Charts sit on a resizable grid — drag to reposition, drag a corner to resize. The layout is saved with the dashboard.

## Building a chart

**Add chart** opens a three-step builder with a live preview.

### 1. Source and scope

Pick what the chart counts, and how far it reaches.

| Source | Typical use |
| --- | --- |
| **Tasks** | Throughput, workload distribution, due-date pressure |
| **Projects** | Status mix, project counts by team or owner |
| **Portfolios**, **Goals** | Health and progress rollups |
| **Time entries** | Hours and amounts by person, client, engagement, or activity code |
| **Expenses** | Spend by category, person, or client, billable or not |
| **Utilization** | Hours and utilization percentage per person |
| **Work in progress** | Unbilled value by client or engagement |
| **Invoices**, **Payments** | Invoiced, paid, and outstanding amounts |
| **Realization**, **Effective rate** | Billed value against work performed |
| **AR aging** | Outstanding balances by aging bucket |

Scope the chart to the whole workspace, one portfolio, one team, one project, or a saved view.

### 2. Filters

Add conditions to narrow the data — the same filter builder used in [project views](/docs/tasklytic/views-and-filters).

### 3. Visualization

Choose a title and a chart type: **bar**, **column**, **line**, **donut**, **lollipop**, a single **number**, or a **burn-up**. Then set:

- **Group by** — the category axis, from the fields the source offers.
- **Measure** — count, sum, or average, and which field to measure.
- **Date field** and **granularity** — day, week, month, or quarter for time-based charts.
- **Top N** — all, or the top 5, 10, 25, or 50 categories.

Chart templates offer pre-built configurations if you'd rather start from a common report and adjust it.

## Reading a dashboard

Click into a chart segment to open the **drill-down** panel, which lists the underlying records — the tasks, entries, or invoices behind that bar or slice. It's the quickest way to go from a number that looks wrong to the rows that produced it.

Charts can be edited, duplicated, and removed from each card's menu.

## Sharing

**Share** on a dashboard sets its visibility:

| Visibility | Who can open it |
| --- | --- |
| **Private** | Only the owner |
| **Specific people** | People you name, as viewers or editors |
| **Workspace** | Everyone in the workspace |

Editors can change charts and layout; viewers can only read and drill down.

## Scheduled digests

**Schedule digest** emails a dashboard's charts on a recurring basis:

- **Daily**
- **Weekly (Monday)**
- **Monthly (1st)**

Add recipients as a comma-separated list and save. The schedule shows its next run, and clearing it stops delivery. Digests are sent by the server-side worker, so they keep arriving whether or not anyone opens the app.

## PSA reporting

Billing-specific reports live under **PSA reporting** (`/w/<workspace>/psa/reports`), which pairs a standard dashboard of professional-services metrics with the **Billing rates** panel. See [Time and billing](/docs/tasklytic/time-and-billing) for what those metrics mean.
