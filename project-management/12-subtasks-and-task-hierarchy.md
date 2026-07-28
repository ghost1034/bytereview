# 12 — Subtasks & Task Hierarchy (up to 5 levels)

**Goal:** Full subtask tree inside the detail pane and in List view; subtasks can themselves have subtasks (up to 5 levels deep, matching Asana).

---

## Prompt (paste into Google AI Studio Build)

Implement multi-level subtasks for Tasklytic. New code in `src/features/subtasks/`. Keep all prior steps intact.

### Data behavior (reuse step 02 schema)

- Subtasks are `Task`s with `parentId` set to another task. Subtasks **can also be in projects** independently — multi-homing still works.
- Enforce a max depth of **5** (root + 4 levels). Block creation beyond that with an inline message.
- Subtasks inherit nothing automatically — they have their own assignee, due date, etc. (matching Asana semantics).

### Subtasks UI in the task detail pane (extend the single-level list from step 07)

In `TaskDetailPane`, the **Subtasks** section becomes a fully interactive nested list:

- Header row: "Subtasks · N" + "+" button (or `s` shortcut while pane is focused).
- Each subtask row mirrors `TaskRow` from List view but compact (28px tall):
  - checkbox, name, assignee avatar (with inline picker), due date pill, "..." menu.
  - Drag handle on the left.
  - Click name → opens that subtask in the detail pane (the pane pushes a breadcrumb so you can navigate back).
- Indentation: 16px per depth level; rows show a tiny disclosure chevron when they have subtasks.
- Drag rows to:
  - reorder within the same parent.
  - re-parent to a sibling (drop on its disclosure chevron).
  - de-indent / un-nest by dropping onto the empty area at the parent's level.
- Inline "+ Add subtask" row at the end of each level.

### Breadcrumb navigation in detail pane

Above the title row, render a breadcrumb chain: `Project › Parent task › Grandparent › Current task`. Each crumb is clickable and navigates the pane.

Add a back arrow icon next to the breadcrumb to "go up one level".

### List view integration (extend step 08)

- Add a per-row expand/collapse chevron when `num_subtasks > 0` (compute virtual field).
- Expanded rows reveal subtask rows indented under the parent. Subtasks render at depth 1 only by default — clicking a subtask's chevron reveals depth 2, etc.
- "Expand all" / "Collapse all" buttons in the List toolbar.
- Dragging a subtask out of its parent to a section detaches it from the parent (`parentId = null`).

### Board view integration (extend step 09)

- Cards show a subtask progress indicator: a small horizontal bar with "x of y" text under the title.
- Click the indicator on a card to open a popover-flyout that lists subtasks inline (with checkboxes for quick complete).

### Counts & rollups

- Maintain a computed `num_subtasks` and `num_open_subtasks` on every task via a memoized selector. Do **not** persist; compute from the store.
- A parent task is **not** auto-completed when all subtasks are done — Asana doesn't do this. But show a small "All subtasks complete" hint banner with a one-click "Mark task complete" button.
- A parent task can be completed while subtasks remain incomplete — show an amber warning toast with "Undo" for 5 seconds (matches Asana behavior).

### Sections inside the subtask list

Allow simple section-like dividers inside subtasks (using a name only, no `Section` record). Implementation: a subtask with `resourceSubtype === 'default_task'` and `name` ending with `:` is rendered as a separator/heading — this matches Asana's separator behavior (`is_rendered_as_separator`). Render those rows as section headers (no checkbox, bold).

### Keyboard

- `s` in pane → add subtask of currently focused task.
- `Tab` to indent a focused row under the row above.
- `Shift+Tab` to de-indent.
- `↑/↓` to move focus.
- `Enter` opens row.

### Components (one per file)
- `SubtaskTree.tsx`
- `SubtaskRow.tsx`
- `SubtaskBreadcrumbs.tsx`
- `useSubtaskDnd.ts`
- `useSubtaskCounts.ts`

### Edge cases
- Reparent must validate depth limit and circular reference.
- When a parent is moved to a different project, do NOT move children automatically (they retain their own `projectIds`).
- Deleting a parent: confirmation dialog with options "Delete parent and all subtasks" or "Delete parent only (subtasks become top-level)".

### Success criteria
- I can add multi-level subtasks via UI and shortcuts; depth limit enforced.
- Drag-to-reparent works; cycle prevention is solid.
- Detail pane shows the breadcrumb stack and navigates correctly.
- List view shows subtask rows when expanded.
- Board cards show subtask progress and a quick-action flyout.
- `Design.md` row: `12 | src/features/subtasks | Subtasks & hierarchy | <today>`.

Do not introduce a separate "subtask" model — they are tasks with a `parentId`.
