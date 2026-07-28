# 10 — Calendar View

**Goal:** A weekly/monthly project calendar with drag-to-reschedule, multi-day spans, overflow handling, and an unscheduled-tasks tray.

---

## Prompt (paste into Google AI Studio Build)

Implement the **Calendar view** for projects. New code: `src/features/views/calendar/`. Build on previous steps without changing the design system or data shape.

### Layout & modes

Toolbar at top:
- View toggle: **Month** (default) / **Week**.
- Prev / Today / Next nav.
- Date label that opens a small mini-calendar to jump to any month.
- Filter chips and search (same model as List view).
- "Show weekends" toggle.
- "Color by" dropdown: Section (default), Assignee, Tag, Priority CF (when present).
- "Open unscheduled drawer" button — toggles a right-side drawer of tasks with no due date.

### Month view

- A 6-row × 7-column grid filling the available area; row heights flex to fill.
- Each day cell:
  - Date label at top-left (current day highlighted in `primary-soft`, today's number bold).
  - "+ Add" appears on hover at top-right.
  - Up to 3 task chips per cell; if more, show "+N more" — clicking opens a popover listing all tasks for that day.
- Multi-day tasks (have `startOn` and `dueOn` spanning more than one day) render as horizontal bars across cells, continuing across week rows where needed.
- Days outside the current month dim to gray-400.
- Click empty area in a day → opens Quick Add prefilled with that due date.
- Click a chip → opens task detail pane.
- Drag a chip onto another day → updates `dueOn` (and shifts `startOn` proportionally if a range).

### Week view

- 7 columns × full-height time grid (24h or 8am–8pm with `showOffHours` toggle).
- All-day row at top for tasks without `due_at` time.
- Time-anchored tasks (`due_at`) render at their hour as 40-min default blocks. Drag the bottom edge to resize → snaps to 15-minute increments. Persist the resized duration on `Task.durationMinutes` (extend `Task` non-breakingly with this optional field).
- Drag vertically to change time, horizontally to change day.

### Multi-day tasks

- Bars use the section's color or fall back to the assignee's avatar color (per "Color by").
- Bar shows truncated task name + assignee avatar at left.
- Crossing week rows: ends with rounded-right radius set to 0 on the wrap-out side, rounded-left 0 on the wrap-in side.

### Unscheduled drawer

- Right-side drawer (320px). Lists tasks in the project with no `dueOn`. Drag a task into the calendar to schedule it.
- Search + filter inside the drawer (assignee, tag).

### Interactions

- Drag-and-drop reschedule (single click + drag).
- Click on day → Quick Add prefilled.
- Right-click on day → context menu (Add task, Add milestone, Add approval).
- Right-click on a chip → context menu (Open, Duplicate, Mark complete, Remove from calendar).
- Today shortcut button always visible.

### Heat-map mini overview (top of view)

A thin row above the grid showing each day of the visible range as a 16px tile, colored by task count (light → dark gradient using `primary`). Hovering a tile highlights the corresponding day in the grid.

### Print-friendly mode

A "Print / PDF" button in the toolbar opens a print-stylesheet preview that strips chrome, uses bold borders, and renders well in B/W.

### Empty states

- No tasks have dates → a friendly empty grid with "Drag tasks from the unscheduled drawer or click a day to add one."

### Components (one per file)
- `CalendarView.tsx`
- `CalendarToolbar.tsx`
- `MonthGrid.tsx`
- `WeekGrid.tsx`
- `DayCell.tsx`
- `EventChip.tsx`
- `MultiDayBar.tsx`
- `UnscheduledDrawer.tsx`
- `useCalendarDnd.ts`

### Performance

- Memoize rows and day cells.
- Only re-render the cells whose task set changed.

### Success criteria
- Calendar shows the project's tasks on their due dates.
- Switching Month/Week works; nav (Prev/Today/Next) works; mini-calendar jump works.
- Drag-to-reschedule persists and emits a `due_date_changed` activity.
- Unscheduled drawer drag works.
- Detail pane opens on chip click.
- `Design.md` row: `10 | src/features/views/calendar | Calendar view | <today>`.

Do not implement Timeline or Gantt yet.
