# 06 — Projects CRUD & Overview Tab

**Goal:** Real project creation, settings, and the **Overview** tab (project brief, key resources, recent activity, members, status). Views (List/Board/Calendar/Timeline/Gantt) come in steps 08–11.

---

## Prompt (paste into Google AI Studio Build)

Build the full Project experience in Tasklytic. Build on steps 01–05; do not break them. New work goes under `src/features/projects/`.

### Create-Project flow

A multi-step modal `<CreateProjectDialog/>`:

**Step 1 — Choose how**: three large cards
1. "Blank project" (default)
2. "From template" — opens the template gallery scaffolded here (the full template engine and gallery land in step 27; until then this card surfaces a "Browse templates" CTA that opens an empty gallery shell)
3. "Import from CSV" — opens the CSV import dialog (scaffolded here with column-mapping UI; the actual parser and bulk-create flow land in step 08 alongside the List view)

**Step 2 — Details**:
- Name (required)
- Description (single line, rich version edited later in Overview)
- Icon emoji + color (pick from the brand palette — `primary`, `accent`, `warning`, `danger`, `info`, plus 6 muted swatches: rose, peach, amber, lime, teal, indigo)
- Team (select from current workspace's teams the user belongs to; if none, prompt to create one — link routes to `/w/:workspaceId/teams/new`)
- Privacy: `public_to_team` / `private_to_members` / `public_to_workspace`

**Step 3 — Default view**: 5 large cards with small inline-SVG previews for List, Board, Calendar, Timeline, Gantt. Pick a default; check all that should be enabled (`enabledViews`). All five are enabled by default.

Submitting:
- Creates the `Project` record.
- Creates 3 default sections: "To do", "In progress", "Done".
- Creates 4 starter tasks (one in To do, one in In progress, two in Done) so the new project lands populated. Task names come from `src/features/onboarding/content/taskCorpus.ts` (introduced in step 30; until then use a small inline list of neutral phrases like "Kickoff meeting", "Define success metrics", "First milestone", "Document outcomes").
- Routes to `/w/:workspaceId/projects/:projectId` (defaults to the chosen `defaultView`, but with the Overview tab first per spec below).

### Project page layout

Route: `/w/:workspaceId/projects/:projectId/:view?`
- Topbar tabs (rendered into the `#topbar-tabs` portal from step 04):
  - **Overview** (default landing)
  - **List** (`?view=list`)
  - **Board** (`?view=board`)
  - **Timeline** (`?view=timeline`)
  - **Calendar** (`?view=calendar`)
  - **Gantt** (`?view=gantt`)
  - **Dashboard** (tab scaffolded here; wired in step 26)
  - **Messages** (tab scaffolded here; wired in step 22)
  - **Files** (tab scaffolded here; wired in step 19)
  - **Forms** (tab scaffolded here; wired in step 20)
  - **Workflow** (tab scaffolded here; wired in step 21 — Rules + Templates)
- Tab visibility respects `project.enabledViews`.
- Above tabs: project header row — icon emoji in a colored tile, project name (inline-editable on click), members avatar stack, status pill (`On track` / `At risk` / `Off track` / `On hold` — defaults to none), "Set status" link, share button, "..." menu (Edit details, Duplicate, Convert to template, Archive, Delete).

### Overview tab

A two-column responsive layout, ~70/30 split:

**Left column**:
- **Project brief** card — a rich text editor (small built-in contentEditable wrapper — no external library — supporting bold, italic, underline, headings 2/3, bullet list, numbered list, link, code, image-via-data-URL). Empty-state prompt: *"What's this project about? Outline goals, scope, and deliverables."*
- **Project roles** card — table with columns Name, Role, Avatar. Inline-edit roles like "Project lead", "Approver", "Stakeholder".
- **Key resources** card — list of inline-added "resource" rows: title + URL or attached file (data URL, later wired through `Attachment`). Default empty state with "Add resource" button.
- **Milestones** card — small horizontal list showing the project's milestone tasks (`resourceSubtype === 'milestone'`) and their dates. "Add milestone" creates a task with that subtype.

**Right column**:
- **Status** card — current status pill + "Update status" button (opens a small composer: title, summary, custom-fields-of-status). Persist as a `StatusUpdate` via `useStatusUpdatesStore`. List the last 3 status updates inline.
- **Members** card — avatar stack, "+ Add members" button. Roles (Editor/Commenter) shown on hover.
- **Project details** card — start date, due date, default view, privacy, team, owner. Each inline-editable.
- **Recent activity** card — show last 10 `ActivityEvent` items scoped to this project. (Activity events are emitted by mutations — see below.)

### Activity emission
Add a `src/lib/activity.ts` helper `emitActivity(event)` that:
- Pushes to `useActivityStore`.
- Persists to localStorage.

Emit events from the relevant store mutations:
- Project create, archive, status change.
- Task create, complete, assign, due date change, project add/remove, dependency add (later steps will trigger these).

### Project settings dialog
"..." menu → **Edit details** opens a dialog with tabs:
- **General** (name, description, icon, color, privacy, team)
- **Members** (uses `MemberTable` from step 05 scoped to project)
- **Views** (checkbox list to enable/disable List/Board/Timeline/Calendar/Gantt; reorder via drag)
- **Custom fields** (tab scaffolded here; wired in step 14)
- **Notifications** (tab scaffolded here; wired in step 17)
- **Advanced** (Archive project, Convert to template, Delete project)

Archive sets `archived: true` and removes the project from the sidebar list (keeps it accessible from a new "Archived projects" link in workspace settings).

### Project card (used in Home, Team page, Portfolios later)

`src/features/projects/ProjectCard.tsx`:
- 280px wide tile.
- Top-left: 40px rounded-md colored tile with icon emoji.
- Title.
- Subtitle: team name • member count.
- Bottom row: progress bar (computed: completed tasks / total tasks), status pill, due date.
- Hover: subtle lift (`shadow-md`) and a "..." menu (Star, Open, Archive).

### List of projects
- New route: `/w/:workspaceId/projects` — a searchable, sortable list of all projects the user can see in this workspace. Filters: team, privacy, status, owner. Toggle between grid (cards) and list (table) view. Persist the toggle per user in `useUiStore`.

### Stars / favorites
- Star icon on cards and in sidebar. Persisted in `User.starredProjectIds` (extend `User` non-breakingly in step 03's type — add the field). Starred projects appear pinned in the sidebar above unpinned ones.

### Success criteria
- A user can create a project end-to-end. The Overview tab opens by default and looks polished.
- Project settings work. Archiving hides the project from the sidebar but preserves all content.
- Status updates appear in the Overview.
- The "..." actions all work, with not-yet-wired surfaces clearly labeled (e.g., "Duplicate" routes to the templates engine when it lands in step 27).
- Switching between view tabs is instant. The actual List view content lands in step 08; until then each view tab renders a `<ViewSkeleton kind="list" lands="step 08" />` component.
- `Design.md` row: `06 | src/features/projects | Project CRUD & Overview | <today>`.

Keep components ≤ 200 lines, add docstrings. Do not implement view content yet — that's the next several steps.
