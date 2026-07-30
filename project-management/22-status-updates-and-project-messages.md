# 22 — Status Updates & Project Messages

**Goal:** Project **status updates** (with the standardized On Track / At Risk / Off Track / On Hold / Complete pillar) and a project **Messages** tab for broadcasts to the team.

---

## Prompt (paste into Google AI Studio Build)

Implement Status Updates and Project Messages. New code in `src/features/status-updates/` and `src/features/messages/`. Use `StatusUpdate` from step 02; add a `ProjectMessage` type below.

### Add to types (non-breaking)

```ts
export type ProjectMessage = {
  id: ID;
  projectId: ID;
  authorId: ID;
  recipientType: 'project_members' | 'team' | 'workspace';
  audienceIds: ID[];              // explicit additional recipients
  title: string;
  bodyHtml: string;
  isAnnouncement: boolean;        // pinned + sends to inbox
  attachmentIds: ID[];
  reactions: Record<string, ID[]>;
  comments: Comment[];            // nested same shape as task comments
  createdAt: ISODateTime;
};
```

Add a `useMessagesStore` (one item per message) and integrate with `src/lib/storage.ts`.

### Status updates

**Update flow from the project Overview (step 06)** is now real:
- Click "Update status" → opens a side panel composer:
  - Status pill picker (segmented control): On Track / At Risk / Off Track / On Hold / Complete.
  - Title (required, default "Weekly status — <Project name> — <Date>").
  - Summary (rich text editor).
  - Sections (collapsible, optional): **Highlights**, **Blockers**, **Next steps** (each is a small rich text block).
  - Inline data prompts (read-only auto-summaries based on current project state):
    - "Tasks completed this week: X"
    - "Tasks added this week: Y"
    - "Upcoming milestones: Z"
  - Recipients: project members (default) + optional teammates picker; "Send via email digest" checkbox that dispatches to the `EmailAdapter` from step 05 when checked.
  - Attachments.
  - Submit → creates a `StatusUpdate` and pushes notifications to project members.

After submission:
- Project Overview status pill updates to the chosen status.
- Last-update card refreshes; "View all updates" link opens a drawer listing all prior status updates with status + author + date.

**Status updates history page**
`/w/:workspaceId/projects/:projectId/updates`:
- Vertical timeline of all status updates with rich content rendered. Filters by status, author, date range. Each entry is a permalink.

### Smart "What's new" digest (use later by AI step 28)

Provide a helper `summarizeProjectActivity(projectId, since)` that returns a structured object:
```ts
{
  tasksCompleted: Task[];
  tasksOverdue: Task[];
  upcomingDue: Task[];
  recentMilestones: Task[];
  topContributors: User[];
}
```
Used in the status composer and later by the AI assistant.

### Project Messages tab

Populate the Messages tab scaffolded in step 06.

`/w/:workspaceId/projects/:projectId/messages`

- Looks similar to a Slack channel:
  - Left: list of messages (newest at top, with pinned/announcements section at the very top).
  - Right: selected message with full body + threaded comments.
- "+ New message" opens a composer:
  - Recipients picker.
  - Title.
  - Body (rich text).
  - "Mark as announcement" toggle (pins + creates notifications for everyone in the audience).
  - Attachments.
- Messages support reactions and comments exactly like task comments (step 18 — reuse components).
- Each message has a permalink `/w/:workspaceId/projects/:projectId/messages/:messageId`.

### Team & Workspace messages (light)

Add a top-level "Messages" link to the sidebar (above "Insights" group). It opens a workspace messages page with tabs:
- **Team** — broadcasts to a team.
- **Workspace** — broadcasts to the whole workspace.
- A simple list with the same composer/reader as project messages but at higher scope. Use the same `ProjectMessage` type with `projectId === null` allowed (extend type to support null OR add scope variant — pick the cleaner option and document in Design.md).

### Notifications integration

- Status update posted → notification type `'status_update'` to all project members.
- Project message announcement → notification type `'comment_on_task'`-style but with a new subtype `'project_message'` (extend the enum non-breakingly).

### Components (one per file)
- `StatusUpdateComposer.tsx`
- `StatusUpdateCard.tsx`
- `StatusUpdateHistory.tsx`
- `MessagesTab.tsx`
- `MessageList.tsx`
- `MessageComposer.tsx`
- `MessageReader.tsx`
- `WorkspaceMessagesPage.tsx`
- `summaries.ts`

### Success criteria
- Posting a status update changes the project pill and lands a notification in members' inboxes.
- All messages persist and threaded comments work.
- Permalinks deep-link correctly.
- `Design.md` row: `22 | src/features/status-updates, src/features/messages | Status updates & messages | <today>`.
