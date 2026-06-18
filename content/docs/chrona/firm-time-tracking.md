---
title: "The firm Time Tracking dashboard"
description: "Read firm-wide hours across paired devices: filter by device and date, view charts and totals, drill into a device's day, and export CSV."
order: 8
---

The **Time Tracking** dashboard is where managers see tracked hours across the whole firm. It rolls up the timeline cards synced from every paired Chrona device into charts, totals, and per-device timelines. Open it from the sidebar under **Time Tracking** (`/dashboard/analytics/chrona`).

> **Note:** This page is for managers. Anyone with a viewer role and above can read the dashboard; you only need write access to manage devices, covered in [Managing devices](/docs/chrona/managing-devices).

## Filter the view

At the top of the page, set what you're looking at:

- **Device** — **All devices**, or a single device.
- **From** / **To** — the date range. It defaults to roughly the last two weeks.

Everything below updates to match your filters.

## Summary cards

Three cards summarize the selected range:

| Card | What it shows |
| --- | --- |
| **Total hours** | All tracked hours across the matching devices. |
| **Active devices** | How many devices logged time, out of the total (e.g. `3 / 5`). |
| **Timeline cards** | The number of activity cards in range. |

## Charts

Two charts visualize the range:

- **Hours by category** — a bar chart of your top categories by total time, so you can see what the firm spent time on.
- **Hours by day** — a daily bar chart, stacked by category, using each device's local day.

> **Note:** If devices are paired but there's no activity in the dates you picked, you'll see "No tracked time in this range." If no devices are paired yet, the dashboard points you to **Manage devices**.

## Devices table

The **Devices** table lists each device's totals for the range:

| Column | Meaning |
| --- | --- |
| **Device** | The device's name (with a **Revoked** badge if it's been revoked). |
| **Hours** | Total tracked hours in range. |
| **Cards** | Number of timeline cards. |
| **Last sync** | When the device last synced. |

Use the search box to find a device, and **click any row** to open that device's daily timeline.

## Drill into a device's day

Clicking a device opens its timeline for a single day (`/dashboard/analytics/chrona/[deviceId]`):

- Move between days with the **previous**/**next** arrows or the date picker (you can't go past today).
- Each card shows its **time range** and duration, **title**, **category** and optional **subcategory** badges, and a summary. Expand **Details** for the longer description.
- A day with no synced cards shows "No activity on this day."

## Export to CSV

Click **Export CSV** (top right) to download the tracked time for the current date range and device filter. The file has one row per device, category, and day, with columns for day, device, category, hours, and card count — ready for timesheets, WIP review, or client billing.

To pair new devices, rename them, or revoke access, continue to [Managing devices](/docs/chrona/managing-devices).
