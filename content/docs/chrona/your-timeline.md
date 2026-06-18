---
title: "Exploring your timeline"
description: "Read and navigate your day on the timeline, open card details, recategorize activity, search and filter, manage categories, and export."
order: 4
---

The **Timeline** is the heart of the Chrona desktop app: a reconstruction of your day as a stack of activity cards. This page (for **staff**) covers reading and navigating the timeline, editing cards, searching, managing categories, and exporting.

## Navigate your day

Open **Timeline** from the top toolbar. The day is drawn as a vertical grid from 4 AM to 4 AM, with each activity shown as a card. When you're viewing the current day, a **Now** line marks the present moment.

Move around with the toolbar controls:

- **Prev** / **Next** — step back or forward one day.
- **Today** — jump to today; **Now** — scroll to the current time.
- The **date picker** — jump straight to any date.
- **Zoom −** / **Zoom +** / **Reset** — change how tall the day is drawn. You can also use **Cmd/Ctrl + +**, **Cmd/Ctrl + −**, and **Cmd/Ctrl + 0**, or hold **Cmd/Ctrl** while scrolling.

## Read a card and open its details

Each card shows its title, time range, and category. Very short cards hide their text to stay readable — hover to see a tooltip.

Click a card to open the **details panel**, which can include:

- The **time range** of the activity.
- **Sites** — websites Chrona detected during that block.
- A **timelapse** video, if you enabled timelapses in Storage settings.
- A **Summary** and longer **Details**.
- **Observations** — the time-stamped moments Gemini noted within the block.

## Recategorize a card

From the details panel you can correct how an activity is classified:

- Change the **Category** from the dropdown.
- Set or change the **Subcategory** in the text field (it suggests existing subcategories as you type).

Changes save immediately.

> **Note:** **System** cards (automatic entries such as errors or idle periods) can't be recategorized, and cards can't be deleted from the timeline.

## Search and filter

Use the search bar above the timeline to find activity. Focus it quickly with **Cmd/Ctrl + F**, and press **Esc** to clear.

- **Scope** — how far the search reaches: **Selected day**, **Today**, **Yesterday**, **Last 7 days**, **Last 30 days**, or **All time**. On the selected day, matches are highlighted right on the timeline; wider scopes show a results list you can click through (with a **Load more** button when there are many hits).
- **Filter pills** narrow what's shown:

| Pill | Shows |
| --- | --- |
| **Include System** | Adds automatic System cards to the view. |
| **Only errors** | Just System cards flagged as errors. |
| **Has video** | Cards that have a timelapse. |
| **Has details** | Cards with a detailed summary. |

- **Category chips** let you toggle individual categories on and off.

## Manage categories and subcategories

Categories are how your time is grouped everywhere in Chrona — on the timeline, the dashboard, and the firm reports. Manage them in **Settings → Timeline**.

- **Add a category** with a **Name**, **Color**, and optional **Description**, then click **Create**.
- Edit any category's name, color, or description inline and click **Save**.
- Add **subcategories** under a category the same way.
- **Locked** categories are system-defined and can't be removed.

> **Note:** Deleting a category or subcategory requires **reassignment** — Chrona asks where to move the affected cards (or to clear the subcategory) so no activity is left uncategorized.

## Export your timeline

To get your tracked time out of Chrona, click **Export Timeline** in the toolbar. In the **Export timeline** dialog:

1. Choose a **Start** and **End** date.
2. Pick a **Format**: **Excel (.xlsx)**, **CSV (.csv)**, or **Markdown (.md)**.
3. Optionally toggle **Include System cards** and **Include review coverage**.
4. Click **Export** and choose where to save the file.

> **Tip:** Your journal exports separately — see [Ask & Journal](/docs/chrona/ask-and-journal). Firm-wide CSV exports are produced from the web dashboard, covered in [The firm Time Tracking dashboard](/docs/chrona/firm-time-tracking).

Next, turn your timeline into insight with [Insights & review](/docs/chrona/insights-and-review).
