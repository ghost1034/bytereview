# 23 — Goals & OKRs

**Goal:** Company → team → individual goals with progress rollup, supporting projects and sub-goals, status updates, and a goal tree visualization.

---

## Prompt (paste into Google AI Studio Build)

Implement Goals (a.k.a. OKRs). New code in `src/features/goals/`. Use the `Goal` type from step 02. Reuse status update component from step 22. Do not break previous steps.

### Goals home

Populate the `/w/:workspaceId/goals` route scaffolded in step 04.

Layout:
- Top: title + filters (Time period, Team, Owner, Status), search, and a "+ Create goal" primary button.
- Body: tabs:
  - **My goals** (where I'm owner)
  - **Followed goals**
  - **Team goals** (current user's teams)
  - **All goals**
- Render as either a **tree view** (default) or **list view** (toggle in toolbar).

### Goal record (extends step 02)

Add small non-breaking fields:
- `iconEmoji?: string`
- `tagIds: ID[]`

### Create / edit goal

Modal with sections:
- Basics: name (required), description, icon, owner, time period (preset: Q1/Q2/Q3/Q4/H1/H2/Annual + Custom), privacy.
- Metric:
  - Type: Percent / Numeric / Currency / Manual.
  - For numeric/currency: target + current + unit/symbol.
  - For manual: status segmented control.
- Parent goal (autocomplete) — to build hierarchy.
- Supporting projects (multi-select).
- Supporting sub-goals (multi-select; can also create children later).
- Tags.

### Tree view

A canvas-like layout with the company root at top, sub-goals branching downward, supporting projects rendered as leaf chips under their parent goal. Use simple CSS columns (no external graph lib).

- Drag a node to re-parent (with cycle prevention).
- Click a node to open a side panel with the goal's details, status updates, supporting items, and history.
- Color a node by status.

### List view

A nested table with indentation by depth.
- Columns: Goal, Owner, Progress (computed), Status, Time period, Last update.
- Progress bar inline. Status pill.

### Progress computation (rollup)

For a goal:
- **Manual** — value taken directly from the goal's `metric.status` (mapped to a progress %: On track 80, At risk 40, Off track 10).
- **Percent / Numeric / Currency** — `current / target`.
- **Parent goal** — average of children's progress (each child weighted equally; expose a future TODO in Design.md for weights).
- **From supporting projects** — also compute average of supporting projects' completed-task ratios; show "Project-driven" badge.

Provide a `useGoalProgress(goalId)` hook returning `{ percent: number; statusInferred: GoalStatus }`.

### Goal detail panel

- Header: emoji + name (inline edit) + status pill + progress bar.
- Tabs:
  - **Overview**: metric, owner, time period, parent, supporting projects, supporting goals, tags, description.
  - **Updates**: timeline of status updates (use the StatusUpdate component scoped to `{ type: 'goal', id }`).
  - **Activity**: log of changes.
  - **Sub-goals**: nested goals.
- Right side: collapsible "Linked work" panel showing tasks across supporting projects matching tag `linked-to-<goalId>` (a simple convention).

### Status updates for goals

Use the composer from step 22 with `scope: { type:'goal', id }`. Posting:
- Updates `goal.status`.
- Notifies followers.

### Notifications

- Following a goal: button "Follow" on the detail. Followers receive notifications on status updates and metric changes ≥ 10%.

### Reporting integration (step 26 will consume this)

Expose helper selectors `selectGoals({ filters })` that the chart system in step 26 can use.

### Home page integration

On the Home page (step 04), if the user owns any goals, add a "My goals" card with up to 3 goals, their progress bars, and a "View all" link.

### Components (one per file)
- `GoalsPage.tsx`
- `GoalsTreeView.tsx`
- `GoalsListView.tsx`
- `GoalCard.tsx`
- `GoalDetailPanel.tsx`
- `CreateOrEditGoalModal.tsx`
- `GoalProgressBar.tsx`
- `GoalStatusPill.tsx`
- `goalProgress.ts`

### Success criteria
- I can create a company goal, a team goal as its child, and link 2 projects as supporting work.
- Tree view shows them correctly.
- Updating a child's manual status rolls up to the parent.
- Posting a status update updates the displayed status pill.
- `Design.md` row: `23 | src/features/goals | Goals & OKRs | <today>`.
