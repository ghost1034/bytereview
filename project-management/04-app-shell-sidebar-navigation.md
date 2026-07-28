# 04 — App Shell, Sidebar & Navigation

**Goal:** Build the persistent Asana-style left sidebar, topbar, page-shell, command palette (⌘K) and breadcrumbs. After this step, the app *feels* like a real product even though most pages are still empty.

---

## Prompt (paste into Google AI Studio Build)

Build the full navigation chrome for Tasklytic. Keep all previous steps intact. New work goes in `src/features/shell/`. The shell scaffolded in step 01 is populated here with the full sidebar, topbar, command palette, and routing chrome.

### Sidebar (240px expanded / 56px collapsed, persistent on desktop, drawer on mobile)

Sections, top to bottom:

1. **Workspace switcher** (top, full width)
   - Shows workspace icon + name + chevron.
   - Clicking opens a dropdown listing every workspace the user belongs to + a "+ Create workspace" item (opens a small dialog with `name` and `iconEmoji`).
   - On switch, route to `/w/:workspaceId` and update a `useWorkspaceContext` hook.

2. **Pinned shortcuts** (small section)
   - Items: **Home** (`/w/:workspaceId/home`), **My Tasks** (`/w/:workspaceId/my-tasks`), **Inbox** (`/w/:workspaceId/inbox`, badge for unread count — wire up in step 17).
   - Each row: icon + label, active state uses `primary-soft` background.

3. **Insights** (collapsible group)
   - **Reporting** (`/w/:workspaceId/reporting`), **Portfolios** (`/w/:workspaceId/portfolios`), **Goals** (`/w/:workspaceId/goals`).

4. **Projects** (collapsible group, biggest area)
   - Header row: "Projects" label + small "+" icon. Clicking opens an empty "Create project" dialog scaffold; the full creation flow is wired in step 06.
   - List of projects the current user is a member of, sorted by recently opened.
   - Each row: project iconEmoji (or a colored dot using `project.color`) + name. On hover, a "⋯" menu (Rename, Star, Duplicate, Archive — Rename and Star are wired now; Duplicate and Archive wire in step 06).
   - Stars are persisted in a `starredProjectIds` field on the User (extend the User type non-breakingly).

5. **Teams** (collapsible group)
   - Lists teams the user belongs to in the current workspace. Each team row expands inline to show that team's projects.

6. **Footer**
   - "+ Invite people" button — opens the invite dialog scaffolded here; full invite flow (with the email-delivery adapter) lands in step 05.
   - User avatar + name (from step 03)
   - Collapse-sidebar IconButton at the very bottom corner.

Collapsed state (56px): icons only, labels become tooltips on hover.

State to add:
- `useUiStore` in `src/stores/ui.ts` with `sidebarCollapsed: boolean`, `setSidebarCollapsed(v)`, plus `breadcrumbs: Crumb[]` and `setBreadcrumbs([])`. Persist `sidebarCollapsed` in localStorage.

### Topbar (52px)

Layout, left → right:
- **Breadcrumbs** powered by `useUiStore.breadcrumbs`. Each page sets them via a small hook `usePageMeta({ title, breadcrumbs })`.
- **Tabs slot** — pages can render their own tab bar inside the topbar via a portal (`#topbar-tabs`). Implement this with a React portal target.
- **Global search input** (center, max 480px) with placeholder text "Search… (⌘K)". Clicking or pressing ⌘K opens the **Command Palette**.
- **Create button** — primary "+" button with dropdown: "Task", "Project", "Form", "Goal", "Portfolio", "Dashboard". Each item dispatches an `onCreate` callback registered by the matching feature step (Task → step 07, Project → step 06, Form → step 20, Goal → step 23, Portfolio → step 24, Dashboard → step 26). The dispatch wiring ships now; the handlers register themselves as their steps land.
- **Notifications IconButton** — bell with a red dot driven by `useNotificationsStore.unreadCount` (the store is created in step 17; until then the count is `0` from an empty selector). Clicking routes to `/w/:workspaceId/inbox`.
- **Help IconButton** — opens a popover with: "Send feedback" (opens a feedback form that writes to `useFeedbackStore` and surfaces the entry in Settings → Feedback; production binds an outbound webhook adapter), "Keyboard shortcuts" (opens the real shortcuts dialog — see below), "Docs" (links to `/docs` in the marketing site), and "Restart product tour".
- **Theme toggle** (Light/Dark/System cycle).
- **User avatar dropdown** (from step 03).

### Command Palette (`⌘K` / `Ctrl+K`)

Build a centered dialog modeled on macOS Spotlight / cmdk:
- 600px wide, search input at the top, list of grouped results below.
- Result groups: **Pages** (Home, My Tasks, Inbox, Reporting, etc.), **Projects** (live-filtered from store), **Tasks** (live-filtered by name), **Actions** ("Create task", "Create project", "Toggle theme", "Sign out").
- Keyboard navigation: ↑/↓ to move, Enter to select, Esc to close.
- Highlight matching substrings in results.
- Empty state: "Type to search…".
- Implement without external cmdk lib — write it yourself in `src/features/shell/CommandPalette.tsx`.

### Keyboard shortcuts dialog
Triggered by `?` key OR from the Help menu. Shows a list of all shortcuts:
- `⌘K` Open command palette
- `c` Quick-create task
- `g h` Go to Home
- `g m` Go to My Tasks
- `g i` Go to Inbox
- `[` / `]` Collapse / expand sidebar
- `t` Toggle theme
- `?` Show this dialog

Bind these globally via a `useGlobalHotkeys()` hook. Use a tiny custom hook — don't add an external library.

### Routes scaffolded here (each step below populates its route's content)
```
/w/:workspaceId/home
/w/:workspaceId/my-tasks
/w/:workspaceId/inbox
/w/:workspaceId/reporting
/w/:workspaceId/portfolios
/w/:workspaceId/goals
/w/:workspaceId/projects/:projectId
/w/:workspaceId/teams/:teamId
/w/:workspaceId/settings
```

Each route renders a `<PageSkeleton title="Page name" lands="step XX"/>` component until its owning step lands — except Home, which ships its full content now:
- Greeting ("Good <morning/afternoon/evening>, <first name>")
- Today's date in large gray text
- Section "My tasks" (renders the live `<MyTasksPreviewCard />` once step 16 is in; until then renders a small inline note "Your assigned tasks will appear here.")
- Section "Recent projects" (uses `useProjectsStore`, shows last 6 by `modifiedAt`, empty state "You don't have any projects yet — create one from the sidebar.")
- Section "People I work with" (avatars of the 5 most-recently-collaborated users — empty state "Add teammates to start collaborating")

### Responsive behavior
- ≥ 1024px: sidebar persistent.
- < 1024px: sidebar becomes a slide-in drawer triggered from a hamburger button in the topbar; the topbar simplifies to title + search icon + avatar.

### Polish details (do NOT skip)
- Subtle bottom border under the topbar.
- `aria-current="page"` on active sidebar items.
- Focus rings visible on all interactive elements.
- Skip-to-content link for keyboard users.

### Success criteria
- The app feels like a real product. Sidebar works, persists collapsed state, supports drag-resize between 200–320px (with a thin grab handle on its right edge).
- `⌘K` opens the palette, filters live across pages/projects/tasks (will be empty for tasks until step 07), supports keyboard nav.
- Theme toggle works from topbar AND from the keyboard shortcut.
- Mobile drawer works smoothly.
- `Design.md` gets row `04 | src/features/shell, src/stores/ui.ts | App shell, sidebar, command palette | <today>` and a new section **"Routes"** listing every route declared so far.

Do not introduce real project/task creation logic yet — those are in steps 06 and 07. Keep components ≤ 200 lines; split where needed.
