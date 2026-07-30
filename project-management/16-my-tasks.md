# 16 — My Tasks (Personal Hub)

**Goal:** The "My Tasks" page — the single place users start their day. Today / Upcoming / Later / Recently Assigned sections, with the same views (List/Board/Calendar) that work for projects.

---

## Prompt (paste into Google AI Studio Build)

Implement the **My Tasks** hub for Tasklytic. New code in `src/features/my-tasks/`. Reuse view components from steps 08–11 and the query system from step 13.

### Route

`/w/:workspaceId/my-tasks` (route scaffolded in step 04 — populate it with the full page now).

### Data definition

"My Tasks" is the union of:
- Tasks where `assigneeId === currentUserId`, in the current workspace, not archived.
- (Read-only mention: "Recently assigned" sub-section also includes tasks assigned to me within the last 14 days.)

Subtasks count as their own tasks here.

### Sections (built-in, can't be deleted but can be hidden/renamed by the user)

- **Recently assigned** — assigned within last 14 days; sorted by assignedAt desc.
- **Today** — due today or earlier (incomplete).
- **Upcoming** — due within the next 7 days.
- **Later** — due > 7 days from now OR no due date.
- (Plus completed tasks if "Show completed" is on, in their own collapsed section.)

Auto-promotion behavior (mimics Asana):
- A task with `dueOn === today` moves into Today automatically on date change.
- A task in Upcoming whose date passes becomes Today.

User-defined custom sections:
- The user can add their own sections (e.g., "Quick wins"). Tasks dragged into custom sections persist in those sections regardless of date until completed. Store the assignment as a per-user map on the Task: extend `Task` non-breakingly with `myTasksSection: Record<userId, ID | 'today'|'upcoming'|'later'|'recently_assigned'>` — keep `'today' | 'upcoming' | 'later' | 'recently_assigned'` as reserved string IDs for built-ins.

### Views

Three view tabs — List (default), Board, Calendar — reusing the existing components and the `QueryToolbar`.

- **List view** scoped to my tasks; sections are the auto-categorized + user-defined sections above.
- **Board view** — columns are the same sections (Today, Upcoming, Later, …). Drag a task between columns to change its categorization or set a date if the destination column requires one (e.g., dropping into Today prompts to set due to today if not).
- **Calendar view** — pre-filtered to my assigned tasks across all projects, with the same calendar UX as step 10. The unscheduled drawer shows my tasks without dates.

### Privacy

- My Tasks is private to me. Each task line shows the projects it belongs to as small chips. Mention-only collaborators of a task do not see it here (matches Asana).

### Toolbar quick filters

- Defaults: "Hide completed" on.
- Quick-toggle chips: "Mine only" (already implied), "Has due date", "Overdue", "By project: X" (autocomplete).

### Personal "Customize" panel

A right-rail "Customize" drawer (similar to Project Customize) where the user can:
- Reorder/hide built-in sections.
- Add/rename/delete custom sections.
- Change defaults like sort and group.
- Toggle showing tasks assigned to subtasks where parent isn't assigned to me.

### Home page integration (extend step 04 Home)

Populate the My Tasks card on Home (the placement was reserved in step 04):
- 3-up tabs: Today (default) / Upcoming / Overdue.
- Up to 5 tasks per tab + a "View all" link routing to `/w/:workspaceId/my-tasks`.
- Click a task → opens detail pane.

### Components (one per file)
- `MyTasksPage.tsx`
- `MyTasksHeader.tsx`
- `MyTasksList.tsx` (thin wrapper composing ListView with a my-tasks data source)
- `MyTasksBoard.tsx`
- `MyTasksCalendar.tsx`
- `MyTasksCustomizeDrawer.tsx`
- `useMyTasksSelector.ts`

### Success criteria
- The page works in all three views and reflects all current tasks assigned to me.
- Auto-promotion (Today ↔ Upcoming ↔ Later) works as dates pass.
- Custom sections persist per user.
- Home page card uses real data.
- `Design.md` row: `16 | src/features/my-tasks | My Tasks personal hub | <today>`.
