# 17 — Inbox & Notifications

**Goal:** A real notifications inbox with archive/snooze/filter, mirroring Asana's Inbox.

---

## Prompt (paste into Google AI Studio Build)

Implement the **Inbox** page and end-to-end notifications wiring. New code in `src/features/inbox/`. Use `Notification` type from step 02 and the existing `useNotificationsStore`.

### Notification producers

Wire emitters in every place a notification should fire. Use a helper `src/lib/notify.ts`:
- `notify(userId, payload)` — pushes to the store, persists, updates the topbar bell badge.

Trigger points:
- **mention** — someone @mentions me in a comment or task description. (Step 18 will produce these.)
- **assigned** — assigneeId changed to me. (Already produced via the task store.)
- **due_soon** — daily computation: for each of my tasks due in 24h, generate at most one notification per task per day.
- **comment_on_task** — a new comment on a task I follow (step 18).
- **status_update** — a status update is posted on a project I'm a member of (step 22).
- **rule_action** — automation acted on something I follow (step 21).
- **form_submission** — a form I own received a submission (step 20).
- **approval_request** — an approval task I'm the assignee of.

### Inbox page

Route: `/w/:workspaceId/inbox`.

Layout: two-pane.
- Left pane (440px): tabs **Inbox** / **Archive**, then list of notifications grouped by **Today** / **Yesterday** / **This week** / **Earlier**.
- Right pane: contextual preview of the selected notification's underlying resource (task → opens the detail pane in-place; project status → renders the update; etc.). On wide screens, right pane uses the existing detail pane component embedded inline (not as overlay).

Row contents:
- Avatar of `actorId` (or system icon).
- One-line title with a typed message ("Aisha assigned you a task", "Ben mentioned you in Q3 OKR planning", "Status update: at risk on Redesign", "Form 'Design intake' got a new submission").
- Subtitle: resource name + a tiny breadcrumb.
- Right side: timestamp (relative), Archive button (on hover), Snooze button (on hover).

Bulk:
- Multi-select via checkbox.
- Bulk actions in a sticky footer bar: Archive, Mark read/unread, Snooze.

Filters (top of the list):
- By type (multi-select chips).
- By person (autocomplete).
- By project (autocomplete).
- By "Unread only" toggle.
- "Mark all as read" link.

### Snooze

- Snooze options: Later today (4pm local), Tomorrow morning (9am), Next Monday, Custom (datetime picker).
- Snoozed notifications disappear from Inbox until `snoozedUntil`, then return with a small "Snoozed" pill.

### Topbar bell

- The bell from step 04 now reflects `unread === true && archived === false` count. Click opens a small **mini-inbox dropdown** (latest 7 notifications + "Open Inbox" CTA + "Mark all as read").

### Mention rendering (renderer scaffolded here; populated in step 18)

Render `Mention` and `Assigned` notifications with proper text now; the @mention wiring lives in step 18 (call `notify(...)` from the comment composer at that point).

### Settings

In `/me` profile **Notifications** tab (scaffolded in step 03 — populate it now):
- A matrix: rows = notification types, columns = "In-app" (mandatory) / "Email digest" (toggle that controls whether the `EmailAdapter` from step 05 receives a digest entry for this type) / "Push" (toggle, surfaces in production once a push-notification adapter is bound). Persisted on `User.notificationPreferences: Record<NotificationType, {inApp: true, emailDigest: boolean, push: boolean}>` — extend `User` non-breakingly.
- "Pause notifications" duration picker (1h / 4h / Today / Custom). When paused, the bell shows a small moon icon.

### Empty + first-run states

- Inbox empty: "You're all caught up. New activity lands here."
- Archive empty: "Nothing archived yet."

### Components (one per file)
- `InboxPage.tsx`
- `InboxList.tsx`
- `InboxRow.tsx`
- `InboxFilters.tsx`
- `InboxPreviewPane.tsx`
- `MiniInboxDropdown.tsx`
- `SnoozeMenu.tsx`
- `notify.ts` (lib helper)

### Success criteria
- Assigning a task to a user produces an Inbox row for them.
- Snooze persists across reloads.
- Bell badge reflects unread count and resets on visiting Inbox or per-row read.
- `Design.md` row: `17 | src/features/inbox | Inbox & notifications | <today>`.
