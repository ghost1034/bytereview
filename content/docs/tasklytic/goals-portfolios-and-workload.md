---
title: "Goals, portfolios, and workload"
description: "Track objectives with progress rollup, group projects into portfolios with health indicators, and see per-person capacity across the workspace."
order: 7
---

Three surfaces sit above individual projects: **goals** for what the firm is trying to achieve, **portfolios** for how related projects are tracking, and **workload** for whether the people doing the work have room for it.

## Goals

Open **Goals** from the section bar. Tabs filter the list to **My goals**, **Followed goals**, **Team goals**, **Company goals**, or **All goals**, and you can view them as a **tree** (showing the parent/child hierarchy) or a flat **list**. Filter further by time frame, owner, status, or text.

### Anatomy of a goal

| Element | Notes |
| --- | --- |
| **Owner** | One person accountable for it |
| **Time frame** | A start and end date |
| **Metric** | How progress is measured |
| **Status** | On track, at risk, off track, achieved, missed, or dropped |
| **Supporting work** | Child goals and projects that roll up into it |
| **Privacy** | Public to the workspace, or members only |

Four metric types are available:

- **Percent** — progress toward 100%.
- **Numeric** — a current and target number, with an optional unit.
- **Currency** — a current and target amount with a symbol.
- **Manual** — no number; you set on track, at risk, or off track yourself.

### Rollup

A goal's progress can be computed from the goals and projects that support it. Each supporting item can carry a **weight**, so a goal that depends mostly on one project reflects that. Sub-goals roll into their parent the same way, which is how company → team → individual objectives stay consistent.

Post progress updates from the goal detail panel — they appear in the goal's history and notify followers as **Status updates**.

## Portfolios

Open **Portfolios** from the navigator's **Insights** group. The index lists your portfolios as cards or a table, filtered by search, owner, and status, with a computed health indicator per portfolio.

A portfolio groups projects (and optionally goals) and has six tabs:

| Tab | What it shows |
| --- | --- |
| **Projects** | Member projects with status, dates, owner, and portfolio-level custom fields |
| **Progress** | Rollup of completion across the portfolio, plus status updates |
| **Timeline** | All member projects on one time axis |
| **Workload** | Capacity for the people staffed on those projects |
| **Dashboard** | Charts scoped to the portfolio |
| **Settings** | Name, description, owner, membership, and custom fields |

Portfolio custom fields are useful for the attributes that only make sense across projects — a delivery lead, a business line, or a risk rating. Post a portfolio status update from the Progress tab; the history is kept alongside the projects' own updates.

## Workload

Open **Workload** from the section bar. It's a heatmap: one row per person (or team, or project), one column per time bucket, and a color that darkens as allocation approaches and exceeds capacity.

### Controls

| Control | Options |
| --- | --- |
| **Range** | This week, next week, this month, or a custom start and end |
| **Scale** | Day, week, month, or quarter buckets |
| **Group by** | Person, team, or project |
| **Scope** | The whole workspace, one team, or one project |
| **Effort field** | Which numeric custom field supplies effort estimates |
| **Export** | Download the current matrix as CSV |

### Capacity and time off

Each person has a **weekly capacity** in hours, defaulting to 40. Managers open **Edit capacity** to change it and to record **time off**, which reduces available hours for those dates and is drawn as a band across the row.

Effort comes from a task's explicit estimate, falling back to the effort custom field you selected, so the numbers are only as good as the estimates on the tasks.

### Drilling in

Click any cell to list the tasks driving that person's allocation in that bucket, and open a person's row for a fuller breakdown across projects. That's usually the fastest route from "this week looks red" to "these three tasks need to move" — reassign or reschedule them straight from the drilldown.
