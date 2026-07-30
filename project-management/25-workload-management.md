# 25 — Workload Management

**Goal:** A Workload view inside Portfolios showing per-person capacity across all selected projects, with overload detection and drag-to-reassign.

---

## Prompt (paste into Google AI Studio Build)

Implement Workload for Tasklytic. New code in `src/features/workload/`. Populates the Workload tab scaffolded in step 24. Do not break prior steps.

### Where it lives

- **Portfolio Workload tab**: `/w/:workspaceId/portfolios/:portfolioId/workload`
- **Team Workload tab**: add a new sub-tab in the team page (step 05) at `/w/:workspaceId/teams/:teamId/workload`.
- **Workspace Workload page** (lite): `/w/:workspaceId/workload` (sidebar entry under Insights).

Each is the same component scoped differently.

### Concept

Workload renders a horizontal timeline (reuse `TimelineRenderer` from step 11 in a special "by-assignee" mode) where:
- **Rows = people** (or unassigned bucket).
- Each row shows that person's effort load over time.
- Hovering reveals the tasks contributing to that load.

### Effort accounting

Add a per-user **capacity** that can be set globally:
- Extend `User` non-breakingly with `weeklyCapacityHours?: number` (default 40).
- Each task contributes effort:
  - If the project has a custom field named "Estimate" (numeric, plain or labelled hours) on the task, use that as `effortHours`. Otherwise, use a default of 4 hours for any incomplete task with a date range or 1 hour if it's a single-day task.
  - Distribute effort evenly across the task's date range (`startOn..dueOn`). For example, an 8h task from Mon–Fri = 1.6h per weekday.
  - If a task has `dueOn` but no `startOn`, assume 1 day at `dueOn`.

### Capacity rendering

For each person row, the day cell shows the sum of `effortHours` across all their tasks for that day:
- Background gradient from green (<70% of daily capacity) → yellow (70–100%) → red (>100%).
- The text label shows "Xh / Yh" where Y is `weeklyCapacityHours / 5` (assume 5 workdays).
- A vertical stripe over the day visually exceeds the cell when overloaded.

Above each person row, show summary numbers: this-week total, overload days.

### Aggregations

Group toggles in the toolbar:
- **Group by**: Person (default) / Team / Project.
- **Time scale**: Day / Week / Month / Quarter.
- **Effort field**: choose any numeric custom field as the source of "hours"; default to the conventional "Estimate" if present.

### Interactions

- Drag a task bar from one person row to another → reassign the task. Animate.
- Drag a task to a different time slot → update dates (same as Timeline).
- Right-click a task bar → quick actions (Open, Reassign, Set due date, Change estimate).
- Click a person row header → opens that user's mini "people page": their bio, today's work, capacity, capacity history (if any).

### Capacity editor

A "Edit capacity" button (visible to managers — admin/team admin) opens a dialog:
- Set weekly capacity per person (uses User.weeklyCapacityHours).
- Optional time-off blocks: extend `User` non-breakingly with `timeOff: Array<{ start: ISODate; end: ISODate; reason?: string }>`. Rendered as gray hatched bands in their workload row that "consume" capacity for those days.

### Empty + first-run

- No tasks: encourage adding estimates to projects.
- No estimates: show a yellow info banner "No effort field detected — using default estimates. Add a numeric custom field named 'Estimate' to your projects for accurate workload."

### Performance

Sum effort per (user, date) once per visible date range and memoize. Recompute on task/user/customField changes via store subscriptions.

### Components (one per file)
- `WorkloadView.tsx`
- `WorkloadToolbar.tsx`
- `WorkloadRow.tsx`
- `CapacityCell.tsx`
- `TimeOffBand.tsx`
- `CapacityEditorDialog.tsx`
- `useWorkloadEffort.ts`

### Success criteria
- A Workload tab in a Portfolio shows people rows with daily load coloring.
- Drag-to-reassign actually changes the task's assignee.
- Overload days highlight in red.
- Time-off bands appear and consume capacity.
- `Design.md` row: `25 | src/features/workload | Workload management | <today>`.
