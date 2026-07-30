# 13 — Sections, Grouping, Sorting & Filtering (Power)

**Goal:** Upgrade the basic filter/sort/group from step 08 into a powerful, persisted system that works across **every** view (List, Board, Calendar, Timeline, Gantt) and respects custom fields (which arrive next in step 14).

---

## Prompt (paste into Google AI Studio Build)

Replace the lightweight filter/sort/group from step 08 with a powerful, persistent system shared across all five project views. New code in `src/features/query/`. Do not break prior steps; refactor the existing toolbars to use the new shared component.

### Concepts

A **ViewQuery** is the shared object describing how a view renders:
```ts
type ViewQuery = {
  filters: FilterClause[];
  sort?: { field: string; direction: 'asc' | 'desc' };
  groupBy?: GroupingKey;
  hiddenCompleted: boolean;
  showSubtasksInline: boolean;
  hiddenColumnIds: string[];        // for List view
  density: 'compact' | 'comfortable' | 'detailed'; // for Board
  zoom?: 'day' | 'week' | 'month' | 'quarter' | 'year'; // for Timeline/Gantt
  swimlaneKey?: GroupingKey;        // for Board/Timeline
};
type FilterClause = {
  field: string;                    // 'assigneeId' | 'tagId' | 'dueOn' | 'completed' | 'projectId' | 'customField:<id>' | 'priority' | ...
  op: 'is' | 'is_not' | 'is_any_of' | 'is_none_of' | 'is_empty' | 'is_not_empty'
     | 'before' | 'after' | 'between' | 'in_the_next' | 'in_the_last' | 'is_today'
     | 'contains' | 'does_not_contain'
     | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between_numbers';
  value: unknown;
};
type GroupingKey =
  | 'section' | 'assignee' | 'dueOn' | 'completed' | 'tag' | 'project'
  | 'priority' | `customField:${string}`;
```

### Shared toolbar component

Build `src/features/query/QueryToolbar.tsx`:

Buttons (left → right):
- **Filter** (icon + label + chip count)
- **Sort** (icon + current sort label or "None")
- **Group by** (icon + current group label)
- **Customize** (column visibility / density / show subtasks / hide completed)
- **Save view** (turns into "Update view" if modified; opens dropdown with "Save as new", "Save as default")
- **Search input** (filters by name + description, with `/` shortcut to focus)
- **Reset** (only visible when query deviates from saved/default view)

### Filter builder popover

- Opens from the Filter button.
- Top section: a vertical list of filter clauses with a "+ Add filter" button.
- Each clause renders as: Field selector → Operator selector → Value editor (input/picker varies by field type).
- AND between clauses (mention "OR coming soon" tooltip — not implementing OR groups now).
- Quick-filter chips above the clause list (one-click adds common filters): "Just my tasks", "Due this week", "Overdue", "Incomplete only".
- Apply on close (live preview as you type). "Clear all" button.

Available filter fields:
- assignee, collaborator, project, section, tag, due date, start date, completed, completed by, completed at, created by, created at, modified at, priority (when CF exists), status (when CF exists), any custom field.

### Sort menu

- Single-field sort with direction toggle.
- Available fields: Due date, Start date, Alphabetical, Created date, Modified date, Likes, Subtask progress %, any custom field (numbers/dates/enums).
- "None (manual)" returns to user's drag-and-drop order.

### Group by menu

- Sections (default for List/Board), Assignee, Due date (Today/This week/This month/Later/No date), Completed?, Tag, Project, Priority (CF), Status (CF), Any custom field.
- "No grouping" flattens.

### Saved views

- `SavedView` from step 02 is now wired in. Each project has 0..N saved views, plus the implicit "Default".
- The view selector lives on the topbar tab strip (right of the view tabs): a chip showing the current saved view name with a chevron — click to see all saved views, pick one, or "Save current as new view".
- A saved view stores the `ViewQuery` + `viewType` + visibility settings + which tab it belongs to (List/Board/Calendar/Timeline/Gantt).
- Views can be marked **Personal** (only you see) or **Project** (everyone with access sees). Toggle in the view's settings.
- Persist via `useSavedViewsStore` (already created in step 02).

### Per-view defaults

- Each project has a `defaultViewQueryByViewType: Record<ProjectView, ViewQuery>` field — extend `Project` non-breakingly. Editors can update the project's default.

### Quick find

- Pressing `/` in a project focuses the project-scoped search input. Quick find filters by task name only and is fast (no popover; instant).
- ⌘K (built in step 04) remains for global search.

### Group rendering rules

- Sections grouping = current behavior.
- Assignee grouping = headers are users, ordered by current user first, then alphabetical; unassigned last with header "Unassigned".
- Due date grouping = "Overdue", "Today", "Tomorrow", "This week", "Next week", "Later", "No date".
- For custom fields with enum options, headers are the option order set on the field.

### Refactor existing views

Update `ListView`, `BoardView`, `CalendarView`, `TimelineView`, `GanttView` to:
- Use the shared `QueryToolbar`.
- Subscribe to a `useViewQuery(projectId, viewType)` hook that hydrates from the current saved view, falling back to the project's default.
- Compute filtered+sorted+grouped task lists via a memoized selector (`src/features/query/select.ts`) that returns `{ groups: Array<{ key, label, color?, tasks: Task[] }> }`.

### Performance

- The selector must be memoized on filter/sort/group changes only (not on every task store update). Use shallow equality where possible.
- Filtering is O(n) per change; do not nest selectors.

### Components (one per file)
- `QueryToolbar.tsx`
- `FilterBuilderPopover.tsx`
- `SortMenu.tsx`
- `GroupByMenu.tsx`
- `SavedViewSelector.tsx`
- `useViewQuery.ts`
- `select.ts`
- `quickFiltersConfig.ts`

### Success criteria
- All 5 views share the same filter/sort/group experience.
- Saving a view persists and reloads; defaults work per project.
- "Just my tasks" + "Due this week" produce correct results.
- Group by works on every view.
- `Design.md` row: `13 | src/features/query | Filter/sort/group + saved views | <today>`.

Refactor cleanly; do not duplicate logic between views.
