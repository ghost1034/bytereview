---
title: "Variance & Flux Analysis"
description: "Upload GL data, flag material variances against a threshold, let AI explain the drivers, and generate a flux memo."
order: 4
---

**Variance & Flux Analysis** *("Upload GL data, flag material variances against a threshold, and generate an AI-assisted flux memo.")* takes your general-ledger data, flags the movements that matter, explains them with AI, and writes a memo you can hand to a reviewer. Open it at `/dashboard/analytics/variance`.

## Create an analysis

From the list page, click **New analysis** and fill in the dialog:

- **Name** — for example, *"Q3 vs Q4 OpEx Flux."*
- **Client** — choose a client, or leave it as **No client**.
- **Data layout** — choose how your periods are arranged:
  - **Dual files (recommended)** — a **Base Period** file and a **Comparison Period** file uploaded separately.
  - **Single dataset** — one file that already contains both periods.

The list shows each analysis with its client, type, a **Flagged / Total** count, status, and last-updated date. Use the **All clients** filter to narrow the list, or open **Reports** for a cross-analysis rollup.

## The editor: five steps

Opening an analysis walks you through five steps, shown across the top: **Upload GL → Map columns → Thresholds → Review → Results**. You can revisit any completed step.

### Step 1 — Upload GL

Drag in your file(s) or click **Browse Files** (CSV or Excel). In dual mode you provide two files and assign each a role (**Base Period** / **Comparison Period**). No data handy? Click **Use Demo Data** for a realistic sample, or **Download Template** for a starter file.

### Step 2 — Map columns

The app auto-maps your columns to the fields it needs and shows you the result so you can correct anything. The key fields are **Account Name/Number**, **Amount**, **Description/Memo**, and **Period/Date** (single-dataset mode). You can also map an optional **Class/Department** and add your own dimensions for grouping. Unmatched columns are marked **(unmapped)** — set them from the dropdown.

### Step 3 — Thresholds

Set the **materiality thresholds** that decide what gets flagged:

- **Dollar threshold ($)** — the minimum absolute change to flag.
- **Percent threshold (%)** — the minimum relative change to flag.

Not sure where to set them? Click **Suggest** and the AI will *sample your GL and propose thresholds with a rationale*; click to apply the suggestion. You also choose the **Account type** and any **Analysis anchors** (the dimensions, such as account or department, that variances are grouped by).

### Step 4 — Review

Review your configuration before running. The step previews how many rows **would be flagged at the current thresholds**, then click **Run analysis**. Running moves a **Draft** analysis to **In Review**.

### Step 5 — Results

Results are organized into three tabs:

| Tab | What you see |
| --- | --- |
| **Table** | Every flagged row with its amounts, the variance, and its explanation/status. |
| **Charts** | A visual breakdown of where the variance is concentrated. |
| **Memo** | The AI-generated flux memo. |

Click a flagged row to open its detail panel, where you can read the AI's **explanation** and **suggested follow-up**, **accept** or **reject** it, or **write or refine the explanation** yourself. Use **Analyze** to have the AI explain the flagged rows in bulk. Export the rows with **Export rows** (CSV/Excel).

On the **Memo** tab, the AI drafts a formal variance/flux memo from your flagged items. Use **Export** to download it as **Word** or **PDF** for your workpapers.

## Status and reports

An analysis moves through **Draft → In Review → Approved → Finalized**. The **Reports** view (from the list page) rolls flagged variances and review status across analyses, with its own exports (**Export rollup**, **Export all flagged**).

> **Tip:** Stuck on a number? Open the [AI Assistant](/docs/ai-analytics-suite/ai-assistant) from any variance screen and ask about a specific account — it can see the data you're looking at.
