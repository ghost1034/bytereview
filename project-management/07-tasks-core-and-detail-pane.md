# 07 — Tasks Core & the Right-Side Detail Pane

**Goal:** A complete `Task` lifecycle and the rich right-side detail pane that lets users edit every field, exactly the way Asana does.

---

## Prompt (paste into Google AI Studio Build)

Implement the full Task creation/edit experience for Tasklytic. New code lives in `src/features/tasks/`. Do not modify the design system or the data shape from steps 01–02 beyond non-breaking additions.

### Task creation entry points (all wired now)
- "+ Add task" row at the bottom of every section in (later) views, plus a section header "+" icon.
- Topbar "+ Create → Task" opens a small **Quick Add** dialog: name (required), project (autocomplete), assignee (autocomplete), due date. Submitting creates the task and shows a toast with "Open task" link.
- Keyboard shortcut `c` opens Quick Add from anywhere.
- Inline create row on List view (added in step 08) — pre-implement the `<InlineTaskCreator/>` component now.

### Task detail pane

A right-side overlay panel (640px wide on desktop, full-width on mobile) that slides in when a task is opened. URL becomes `?task=<id>` (uses search param so any view can keep its underlying layout visible). Pressing Esc, clicking the backdrop, or clicking the close icon closes it.

**Header area**:
- Mark-complete checkmark (large pill, color `accent` when completed).
- Task subtype switcher (Task / Milestone / Approval).
- Tags pill row.
- Buttons: "Like" (heart, count), "Copy link", "Share" (small), full-screen toggle (pops the task into `/w/:workspaceId/tasks/:taskId` route), close.

**Title row**: large inline-editable name. Enter saves; Esc cancels.

**Two-column body**:

Left rail (the field stack — every row is `Label : Value`):
- **Assignee** — user picker (search by name/email, shows recent assignees, "Assign to me" shortcut).
- **Due date** — date popover with "Set start date" toggle to add a range; quick options: Today / Tomorrow / Next Monday / In 1 week / Clear; supports `due_at` time when "Add time" toggled.
- **Projects** — multi-select; each project pill shows its color/icon. Removing a project removes the section assignment for that project; adding prompts to pick a section.
- **Dependencies** — section scaffold rendering the empty state ("No dependencies"); the dependency picker is wired in step 11/12.
- **Fields** — custom fields section scaffolded here; the field renderers ship in step 14.
- **Priority / Status / Other built-ins** — if the project has the global Priority/Status custom fields (defined in step 14), render them inline. Until step 14 lands, render a "+ Add fields" action that opens the (then-empty) custom-field picker.
- **Tags** — multi-select tag picker (with create-on-the-fly via "Create new tag").
- **Followers** (collaborators) — avatar stack + Add button. Mentioning someone in the description (step 18) auto-adds them.

Right rail (the description + activity column — wider than left rail):
- **Description** — rich text editor (extend the one from step 06). Supports bold, italic, underline, headings, lists, link, code blocks, inline images via data URL, and `@mentions`. The mention picker UI ships here calling a no-op `onMention` handler; step 18 binds the real handler that opens the mention-search dropdown.
- **Subtasks section** — a collapsible "Subtasks" header with count + "+" button. The full multi-level subtask tree ships in step 12; this step ships the wrapper component, the create-subtask action, and a single-level inline list.
- **Attachments** — drag-drop zone + file input + "Add from link" item; renders attachment chips with download/remove (full storage adapter and previews in step 19).
- **Comments / Activity** — tabbed Comments / Activity feed. The structural shell ships here; both tabs are fully populated in step 18.

**Footer area**:
- "Created by <user> on <date>" small caption.
- Delete (danger) "..." menu (Mark incomplete, Duplicate, Delete, Convert to milestone, Convert to approval).

### Completing tasks
- Clicking the checkmark toggles `completed`, sets `completedAt`, sets `completedById`, and emits `task_completed` activity. The mark animates: ring scales then turns into a check.
- For `approval` subtype, clicking the checkmark shows a small popover with Approve / Reject / Request changes options, each mapping to `approvalStatus`.

### Tags
- New store: `useTagsStore` (already created in step 02). Add a tiny `<TagPicker/>` component used here and in later filters.
- Tag colors picked from the same palette as projects.

### Milestone & Approval subtypes
- Milestones render with a diamond icon and only have one date (`dueOn`).
- Approval tasks render with a `Approval` pill and an approval status indicator.

### Validation rules
- Task name required (cannot save empty; revert to previous).
- A task can be in 0 projects (it's then only on My Tasks for the assignee), 1 project, or many. Removing the last project does not delete the task.
- A `milestone` cannot have a `startOn` (clear it on conversion).
- An `approval` task tracks `approvalStatus` synced with `completed`.

### Routing
- Add a deep-link route `/w/:workspaceId/tasks/:taskId` that renders the task detail pane full-screen (no underlying view).
- Inside any project view, opening a task adds `?task=<id>` to the URL. Closing removes it.

### Components to create (one per file)
- `TaskDetailPane.tsx` (the wrapper)
- `TaskHeaderRow.tsx`
- `TaskTitleField.tsx`
- `TaskAssigneeField.tsx`
- `TaskDueDateField.tsx` (includes start+due range and time)
- `TaskProjectsField.tsx`
- `TaskTagsField.tsx`
- `TaskFollowersField.tsx`
- `TaskDescriptionEditor.tsx`
- `SubtaskList.tsx` (single-level here; nested rendering in step 12)
- `AttachmentsZone.tsx` (UI shell here; storage-adapter wiring in step 19)
- `CommentsAndActivity.tsx` (tab shell here; full content in step 18)
- `QuickAddTaskDialog.tsx`
- `InlineTaskCreator.tsx`

### Activity hooks (emit these now)
- task_created, task_completed (with completedById), task_assigned/unassigned, due_date_changed, project_added/removed.

### Success criteria
- Quick Add creates a task; ⌘K → "Create task" works; `c` shortcut works.
- Opening a task slides in the right pane and locks scroll behind it.
- Every field above edits and persists.
- Closing pane removes `?task=` from URL; navigating back reopens it.
- `Design.md` row: `07 | src/features/tasks | Task core & detail pane | <today>`.

Do not implement List/Board/Timeline content yet. Do not build subtask trees, comments, or attachments UX beyond the stubs called out. Keep components ≤ 200 lines and add docstrings.
