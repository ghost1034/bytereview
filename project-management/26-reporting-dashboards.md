# 26 — Reporting Dashboards (Universal Reporting)

**Goal:** Universal reporting dashboards with persisted chart definitions, role-aware sharing, accessible drill-downs, and server-rendered digest snapshots.

## Production reporting contract (Phase 6)

The reporting-source registry is the extension seam for later PSA phases. Tasks and projects are registered as server snapshot sources now; existing portfolio and goal client sources remain compatible. Chart persistence stores date field, metric field, granularity, grouping, and top-N independently and repairs legacy field aliases on write.

Dashboard roles are owner, editor, and viewer. Workspace visibility grants viewing only; editors may change charts/layout/schedules; only owners and workspace administrators may change sharing. Scheduled digests run only in the server maintenance pipeline, embed a current PNG snapshot, persist snapshot metadata, advance from the schedule anchor, and expose `schedule.nextRunAt` in dashboard cards.

---

## Prompt (paste into Google AI Studio Build)

Implement the Reporting feature. New code in `src/features/reporting/`. Build on top of the minimal `<Chart/>` primitive started in step 24. Do not break prior steps.

### Reporting home

Populate the `/w/:workspaceId/reporting` route scaffolded in step 04.

- Top: title + search + "+ New dashboard" primary button + dashboard filters (Owner, Created date, Tags).
- Body: grid of dashboard cards. Each card shows mini chart thumbnails, title, owner, share scope, last updated.
- Empty state with a "Create your first dashboard" CTA.

### Dashboard page

Route: `/w/:workspaceId/reporting/dashboards/:dashboardId`

Layout:
- Top: dashboard title (inline editable) + actions (Share, Duplicate, Delete, Export PNG, **Schedule digest** — opens a dialog that configures recurrence and recipients; dispatches via the `EmailAdapter` from step 05 on each scheduled run).
- A 12-column responsive grid powered by a tiny custom layout engine in `src/features/reporting/useGridLayout.ts`. Charts are draggable + resizable (corner handle) within the grid. Persist layout per dashboard.
- "+ Add chart" inserts at the end.

### Chart builder

Open via "+ Add chart" or by clicking the "..." menu of an existing chart → Edit. The builder modal has three steps tabs:

**1. Source** — Pick one of:
- Tasks
- Projects
- Portfolios
- Goals

Then a **scope** picker:
- Across the workspace
- A specific portfolio
- A specific team
- A specific project
- A saved view

**2. Filters & Metrics**
- Reuse the filter builder from step 13 (scoped to the source's fields).
- Metric: `count` / `sum(field)` / `avg(field)` / `min(field)` / `max(field)`. The field selector shows numeric custom fields and built-ins (e.g., for projects: task count; for goals: progress %).
- For time-series charts: a **Date field** picker (created date, completion date, due date, custom date fields, etc.) and a granularity selector (day/week/month/quarter).

**3. Visualization**
- Chart types:
  - **Number** (big-number tile with optional sparkline)
  - **Bar / Column** (with optional stacking by a second dimension)
  - **Line** (multi-series allowed)
  - **Donut**
  - **Lollipop** (for ranked categories)
  - **Burnup** (cumulative completed vs total scope over time)
  - **Heatmap** (tasks by day of week × hour OR by week × person)
- X axis, Y axis, group-by (second dimension), top-N limit (5/10/25/50/all).
- Color palette: defaults to brand; allow choosing a categorical palette of 6 muted colors.

Live preview to the right of the builder updates as you change inputs.

### `<Chart/>` primitive

Extend `src/features/charts/Chart.tsx` (started in step 24) to render every type above. Implementation:
- Pure SVG.
- Bar / Column: rounded-2 corners, animated entrance, axis ticks, gridlines, hover tooltip, click to drill down.
- Line: smoothed line (Catmull–Rom), dots on hover, multi-series legend.
- Donut: arcs with hover lift; center label shows total.
- Lollipop: horizontal lines from baseline with circle markers.
- Burnup: two lines (Scope + Completed) with shaded area; ideal line dashed.
- Heatmap: cell-grid with color scale legend.
- Number: big number, secondary delta-vs-previous-period in colored text.

All charts respect dark mode.

### Drill-down

Clicking a data point opens a side panel showing the underlying records (tasks/projects/etc.) as a List. Clicking a record opens the detail pane (or routes to that record's page if it's a project/portfolio).

### Sharing & permissions

- Dashboard owner + shared users can edit (toggle).
- Set **Visibility**: Private / Specific people / Workspace.
- Persist in `Dashboard.sharedWith`.

### Saving charts to dashboards

- Each chart can also live standalone — but here we focus on dashboards.
- Inside a project's existing **Dashboard** tab (scaffolded in step 06), use the same builder/primitive to add charts scoped to that project's tasks only.

### Schedules

A "Schedule digest" button opens a dialog with frequency (Daily / Weekly Mon / Monthly 1st) and recipients. Save as `dashboard.schedule: { frequency, recipients, nextRunAt }` (extend type non-breakingly). A small recurring scheduler in `src/features/reporting/scheduler.ts` runs on app boot and at the next-run timestamp, renders the dashboard snapshot (PNG via the same export pipeline as the "Export PNG" action), and dispatches it through the `EmailAdapter` from step 05. Display a small "Scheduled" badge on the dashboard card showing the next run.

### Templates / Recommended charts

A "Start from template" panel in the new-chart modal with curated starters:
- "Tasks completed this quarter" — Burnup, tasks source, completion date.
- "Workload by assignee" — Bar, tasks, group by assignee, count incomplete.
- "Project health" — Donut, projects, group by status.
- "Goals by status" — Donut, goals, group by status.
- "Overdue tasks by project" — Lollipop, tasks, filter overdue, group by project.
- "Throughput per week" — Line, tasks completed, weekly.

### Components (one per file)
- `ReportingHomePage.tsx`
- `DashboardCard.tsx`
- `CreateDashboardDialog.tsx`
- `DashboardPage.tsx`
- `DashboardGrid.tsx`
- `useGridLayout.ts`
- `ChartCard.tsx`
- `ChartBuilderModal.tsx`
- `ChartSourcePicker.tsx`
- `ChartFiltersStep.tsx`
- `ChartVisualizationStep.tsx`
- `Chart.tsx` (extended)
- `DrillDownPanel.tsx`
- `ChartTemplatesPanel.tsx`

### Success criteria
- I can create a dashboard with at least 5 different chart types using my existing data.
- Charts react to dark mode and resize fluidly.
- Drill-down works on at least Bar and Donut.
- Schedules persist and are executed exactly once per schedule occurrence by the server job pipeline.
- `Design.md` row: `26 | src/features/reporting, src/features/charts | Universal reporting dashboards | <today>`.
