# 09 — Board (Kanban) View

**Goal:** A high-fidelity drag-and-drop Kanban board with collapsible columns, swimlanes, card density controls, and WIP-limit hints.

---

## Prompt (paste into Google AI Studio Build)

Implement the **Board view** for projects. New code lives in `src/features/views/board/`. Reuse the shared task/section model already established. Do not break previous steps.

### Layout

- Horizontal scroll of section columns. Each column has fixed width (defaults 288px, user-resizable from 240–400px via the column right edge; persisted per user × project in `useColumnsStore`).
- Sticky column headers when vertically scrolling.
- Smooth horizontal scroll on desktop; touch-friendly snap on mobile.

### Column (= Section)

- Header (sticky to column):
  - Drag handle, name (inline editable), task count, optional WIP limit (small badge "9/10" — red when exceeded; click to edit).
  - "+" to add task at top of column.
  - "..." menu: Rename, Set WIP limit, Collapse, Move column (left/right/start/end), Delete section.
  - **Collapsible**: collapsed columns become 48px-wide vertical strips with rotated label and task count; click to expand. Collapsed state persists.

### Card

`src/features/views/board/TaskCard.tsx` — minimum 80px tall, max ~280px.

Card content (top → bottom):
- Optional small "cover" color strip at top equal to the highest-priority tag's color (only if any).
- Top row: complete checkbox, subtype icon (milestone/approval), small "..." menu.
- Title (clamp 2 lines).
- Description preview (clamp 2 lines, only if `notes` not empty). Renders plain text only — no HTML.
- Tags (max 3 chips + "+N" overflow).
- Custom fields strip (only those marked as "show on card" — wire fully in step 14; expose the UI now).
- Bottom row: assignee avatar (or "+" if unassigned), due date pill (color-coded), small icons for: subtask count, comment count, attachment count, dependency status, like count.

Card sizes via density toggle:
- **Compact** (44px): just title + assignee + due.
- **Comfortable** (default, all of above).
- **Detailed** (adds description and custom fields).

### Drag-and-drop

- Drag cards within a column to reorder; drag across columns to change section.
- Drag columns horizontally to reorder.
- Drop targets: above/below other cards, anywhere in column, between columns.
- During drag: source card shows ghost outline, drag clone follows cursor with subtle rotation and shadow.
- Provide keyboard alternatives: `Space` to pick up, `←/→` to move column, `↑/↓` to move within column, `Space` to drop, `Esc` to cancel.

Implementation: write a small custom DnD with `pointer events` + state — **do not** add an external DnD library. Keep code in `src/features/views/board/useBoardDnd.ts`.

### Swimlanes (horizontal grouping)

Toggle in the Board toolbar: "Rows by" → None (default) / Assignee / Due date / Tag / Priority (when CF enabled) / Section header (i.e., flip board: rows are sections, columns are the swimlane). When swimlanes are enabled, rows render as horizontal bands. Each band has a left header (sticky) with count, and each band is independently collapsible.

### Toolbar (above board)

- Search input (filters cards by name/description).
- Filter chips (same model as step 08).
- Sort within columns: Due date / Manual / Likes / Alphabetical.
- Group rows: see swimlanes above.
- Density toggle (Compact / Comfortable / Detailed).
- "Hide completed" toggle.
- "Customize" button (column visibility — pick which sections render; useful for "Done"-hiding).

### Selection & bulk actions

- Click selects; ⌘/Ctrl-click toggles selection; Shift-click range-selects within column.
- Bulk action bar (floats at bottom): Move to section, Assign, Set due, Tag, Complete, Delete.

### Open detail pane

- Click on the card body (anywhere except checkbox / menu) opens the right pane (`?task=<id>`).

### Add section

- "+ Add section" button to the right of the last column (stays in view). Adds a section, focuses the new column header for naming.

### Empty states

- No sections → big empty state in the center: illustration + "Add a section to start."
- No cards in a column → faint "Drag cards here" text.

### Components (one per file)
- `BoardView.tsx`
- `BoardToolbar.tsx`
- `BoardColumn.tsx`
- `BoardColumnHeader.tsx`
- `TaskCard.tsx`
- `useBoardDnd.ts`
- `BoardSwimlanes.tsx`
- `DragGhost.tsx`

### Success criteria
- Switching to Board view shows the project's tasks as cards distributed across the three default columns (including the 4 starter tasks created by the project-creation flow in step 06).
- Drag-and-drop works smoothly. State persists across reloads.
- WIP limits and collapsed columns behave correctly.
- Card density toggle changes the card layout fluidly.
- Detail pane opens on click.
- `Design.md` row: `09 | src/features/views/board | Board view | <today>`.

Do not implement Calendar, Timeline, or Gantt yet. No external DnD lib.
