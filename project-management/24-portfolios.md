# 24 — Portfolios

**Goal:** Portfolios — collections of projects with status rollups, a portfolio Progress tab, a Dashboard tab, and a Workload tab (workload built fully in step 25).

---

## Prompt (paste into Google AI Studio Build)

Implement Portfolios. New code in `src/features/portfolios/`. Use the `Portfolio` type from step 02. Reuse status updates from step 22. Do not break previous steps.

### Portfolios home

Populate the `/w/:workspaceId/portfolios` route scaffolded in step 04.

- Top: title + "+ New portfolio" button + filters (Owner, Status, Time period, Search).
- Body: cards or table toggle.
- Each card shows: portfolio icon (color tile), name, owner, # projects, status pill, progress bar (% complete based on rolled-up project tasks).

### Create / edit portfolio

Modal:
- Name, description, icon, color.
- Owner.
- Add projects (multi-select).
- Add goals (multi-select).
- Optional custom fields (apply only at the portfolio level — separate from project CFs; reuse `CustomField` and `CustomFieldValue` types).

### Portfolio page

Route: `/w/:workspaceId/portfolios/:portfolioId/:tab?`

Tabs (rendered into the `#topbar-tabs` portal):
- **Projects** (default) — the main grid.
- **Progress** — status snapshot + post update.
- **Dashboard** — charts (defaults; see step 26 for full chart builder).
- **Workload** — tab scaffolded here; full Workload view ships in step 25.
- **Timeline** — portfolio-wide timeline of all included projects' tasks (reuse the Timeline renderer).
- **Settings**

### Projects tab (the main view)

A table with columns:
- Project (icon + name)
- Status (pill)
- Progress (bar)
- Owner (avatar)
- Start date / Due date
- Priority (CF) (when present)
- Custom fields (the portfolio's CFs)

Features:
- Search, filter (by status/owner), sort.
- Inline-edit project status and the portfolio's CF values from this table.
- Drag rows to reorder; persist in `Portfolio.projectIds`.
- Bulk actions: Set status, Set priority, Remove from portfolio.

### Add projects

A "+ Add work" button at the bottom of the list, opening a multi-select picker. Also support "Create new project (in this portfolio)" which opens the standard project creation flow with the portfolio pre-attached.

### Progress tab

- Same Status Update composer as step 22 but scoped to `{ type: 'portfolio', id }`.
- Header card showing:
  - Overall status pill + counts of projects in each status.
  - Quick stats: total projects, % complete, on-time %, members count.
- List of past status updates with permalinks.

### Dashboard tab

Render a default dashboard (3 charts) until step 26's full builder:
1. Donut: Projects by status.
2. Bar: Projects by owner.
3. Number: Average % complete.

Charts here use the same primitives that will be expanded in step 26. Build a minimal `<Chart/>` primitive now in `src/features/charts/Chart.tsx` for donut, bar, line, number. Step 26 will extend it.

### Permissions

- Portfolio owner + admins manage membership and CFs.
- All workspace members can view portfolios they're added to (mirror project privacy).

### Goal linkage

In Settings: select goals this portfolio supports. Render the linked goals as chips in the Progress tab header.

### Timeline tab

Use `TimelineRenderer` from step 11 with a special data source: all tasks in all portfolio projects, with rows = projects (collapsible to reveal that project's sections). Color bars by their parent project.

### Sidebar integration

Sidebar already lists portfolios under Insights → Portfolios (step 04). Make those expand to show child portfolios.

### Components (one per file)
- `PortfoliosPage.tsx`
- `PortfolioCard.tsx`
- `CreateOrEditPortfolioModal.tsx`
- `PortfolioLayout.tsx` (tabs)
- `PortfolioProjectsTab.tsx`
- `PortfolioProgressTab.tsx`
- `PortfolioDashboardTab.tsx`
- `PortfolioTimelineTab.tsx`
- `PortfolioSettingsTab.tsx`
- `PortfolioCustomFieldsManager.tsx`

### Success criteria
- I can create a portfolio, add 3 projects, edit portfolio CFs inline, post a portfolio status update, and see the dashboard tabs populate.
- Timeline tab renders bars for all included projects.
- `Design.md` row: `24 | src/features/portfolios, src/features/charts (started) | Portfolios | <today>`.
