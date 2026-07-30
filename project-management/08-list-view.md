# 08 — List View

**Goal:** The default Asana view — a dense spreadsheet-style task list grouped by section, with inline editing, multi-select, drag-and-drop reorder, and column management.

---

## Prompt (paste into Google AI Studio Build)

Implement the **List view** for a project in Tasklytic. New work goes under `src/features/views/list/`. Keep steps 01–07 intact.

### Layout

A scrollable grid table with sticky header, sticky leftmost column, and sticky section headers.

**Columns** (default order, all reorderable via drag on header):
1. **Task name** (sticky-left, takes remaining space; min 320px) — checkbox + task name + small indicator icons (subtask count, comment count, attachment count, dependency marker).
2. **Assignee** — avatar + name; click to open assignee picker.
3. **Due date** — formatted "MMM d" with relative coloring (red if overdue and not complete, amber if due today, gray if no date).
4. **Priority** (only renders if the Priority custom field is enabled — built in step 14; show empty cell otherwise).
5. **Status** (same — empty if not enabled).
6. **Tags** — chips.
7. **Projects** — chips (when task is multi-homed).

All columns resizable by dragging a 4px-wide column edge. Persist column widths and order per (user × project) in a new store: `useColumnsStore`.

**Show/Hide columns**: a "Customize" button at the top-right of the view opens a dropdown listing every column with checkboxes. Custom fields (added in step 14) also appear here.

### Sections

- Sections are collapsible. Header row: ▸/▾ chevron + section name (inline editable) + task count + "+" button to add a task in that section + a "..." menu (Rename, Delete, Move up/down, Move to top, Move to bottom).
- "+ Add section" button below the last section.
- Drag-handle on section header to reorder sections.

### Rows

- 36px row height.
- Hover reveals row actions on the right: drag handle, "..." menu (Open, Duplicate, Convert to milestone, Convert to approval, Delete).
- Multi-select via checkboxes (click first, Shift-click to extend range).
- When 1+ selected, a floating bulk-action bar appears at the bottom: Assign to..., Set due date..., Move to project..., Tag..., Mark complete, Delete. Esc clears selection.
- Drag rows to reorder within a section (persists row order in `Section`-scoped task ordering — add a `taskOrderBySection: Record<sectionId, ID[]>` map on the `Project` non-breakingly).
- Drag rows across sections — updates `sectionIdByProject[projectId]` on the task.

### Inline editing

- Click task name → opens inline edit (Enter to save, Esc to cancel).
- Click assignee → opens popover assignee picker.
- Click due date → opens date popover.
- Click tag cell → opens tag multi-select.
- All edits commit on blur.

### Inline creation

- The first row under any section is a faint "+ Add task" with prompt text. Clicking starts an editable row at row height. Enter creates and starts a new editable row below (rapid-fire creation). Esc cancels the unsaved row.

### Open detail pane

- Clicking anywhere on a row's name area (outside the checkbox / edit hotspots) opens the task detail pane (step 07) via URL `?task=<id>`.

### Sort, group, filter (light versions; full version in step 13)

Provide a toolbar above the table:
- **Filter** button → popover with quick filters: "Incomplete tasks", "Just my tasks", "Due this week", "Recently assigned". Each is a chip that adds itself to a chip strip below the toolbar.
- **Sort** dropdown → None / Due date / Likes / Alphabetical / Creation date / Modification date. Asc/Desc toggle.
- **Group by** dropdown → Section (default) / Assignee / Due date / Priority. (Group by reflows the table — sections only render when grouped by section; for other groupings, headers become the group key.)
- **Hide completed** toggle.

(The advanced/filter/group/sort UI overhaul ships in step 13 — this step is the basic version.)

### Performance

- Virtualize the row list if it exceeds 200 visible rows. Use a minimal hand-rolled virtualizer (no external library): render a window of rows based on scrollTop and rowHeight.

### Empty states

- No sections, no tasks: "This project is a blank canvas — add a section, then start adding tasks."
- Sections but no tasks: each section shows "+ Add task" prominently.

### Keyboard shortcuts (inside List view)
- `Tab` jumps focus between cells.
- `↑/↓` move row focus.
- `Enter` opens task in detail pane.
- `Space` toggles complete.
- `⌘+Enter` quickly creates a new task at the end of the current section.
- `Delete` (with selection) opens confirm dialog.

### Components (one per file)
- `ListView.tsx`
- `ListToolbar.tsx`
- `SectionHeaderRow.tsx`
- `TaskRow.tsx`
- `InlineNewTaskRow.tsx`
- `ColumnHeader.tsx`
- `ColumnCustomizer.tsx`
- `BulkActionsBar.tsx`
- `useColumnsStore.ts`

### Success criteria
- Switching to the "List" tab on a project shows the table populated with the project's tasks (including the 4 starter tasks created by the project-creation flow in step 06).
- I can inline-create, edit, reorder, multi-select, and complete tasks.
- Column show/hide and reordering works and persists.
- Sections drag/reorder works.
- Opening a task opens the detail pane from step 07.
- `Design.md` row: `08 | src/features/views/list | List view | <today>`.

Do not yet implement: Board, Calendar, Timeline, Gantt. Keep components ≤ 200 lines and add docstrings.
