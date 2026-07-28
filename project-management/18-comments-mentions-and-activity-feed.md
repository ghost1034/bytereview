# 18 — Comments, @Mentions, Activity Feed

**Goal:** Threaded comments with @mentions on tasks, plus a full activity timeline. Comments support rich text, attachments, reactions, and pinning.

---

## Prompt (paste into Google AI Studio Build)

Build the comments + @mentions + activity experience inside the task detail pane (populating the tab shells scaffolded in step 07). New code in `src/features/comments/` and `src/features/activity/`. Hook into the notification system from step 17.

### Detail-pane Comments tab (populate the shell from step 07)

Layout:
- **Top: composer** — rich text editor (reuse the editor from step 06/07) with toolbar:
  - Formatting: bold, italic, underline, headings 2/3, bullet/numbered list, link, code, blockquote.
  - **@mention** trigger: typing `@` opens an inline picker showing workspace users + special tokens `@assignee`, `@followers`, `@here`. Arrow keys to navigate, Enter to select. Picked mentions become non-editable pills with the user's color.
  - **Attach** button: opens file picker; attachment chips render below the composer pre-send. Drag-drop also works.
  - Emoji picker (a tiny built-in 80-emoji grid; no external library).
- **Below composer: comments thread** — newest at bottom (Asana style). Pinned comments float to top with a "📌 Pinned" tag.
- Each comment:
  - Avatar + name + relative timestamp (with hover tooltip = absolute).
  - Body (HTML, sanitized).
  - Reaction row (👍 ❤️ 🎉 👀 🙏 with counts; clicking toggles your reaction).
  - Actions: Reply (inline thread — single level of nesting), Pin/Unpin, Edit (only own), Delete (only own or admin), Copy link.
  - Edited indicator if `editedAt` is set ("Edited <time>").

### Reactions

- Reactions are emoji keys mapped to user-id arrays (already in the type).
- Reaction picker on hover: a small popover with 6 default emojis + "+" to open the full picker.

### Activity tab

A clean, chronological timeline of `ActivityEvent`s scoped to the task:
- Each row: actor avatar + a typed sentence ("Aisha changed the due date to Apr 5", "Ben added this task to Project Q3 OKRs", "Carlos marked this complete").
- Filter chips at top: All / Updates / Comments / Subtasks / Custom fields / Approvals.
- Activity items showing values include from→to: "Changed Status from On Track to At Risk".
- "View older" pagination if > 100 events.

(The Activity tab shell from step 07 is populated here using selectors over `useActivityStore`.)

### Project-level activity feed

Add `<ProjectActivityFeed/>` used in the project Overview "Recent activity" card (step 06) — same item renderer, scoped to a project, last 20.

### @mention wiring

When a comment includes mention pills:
- Parse the HTML for `data-mention-user-id="..."` attributes (or whatever pill encoding you choose).
- For each, call `notify(userId, { type: 'mention', scope: {type:'task', id: taskId}, actorId: currentUserId, message: 'mentioned you in a comment' })`.
- Special tokens:
  - `@assignee` → notify `task.assigneeId` (if not the same as actor).
  - `@followers` → notify all `task.collaboratorIds`.
  - `@here` → notify all current project members (use the first project in `task.projectIds`).

Also: typing a mention adds that user to `task.collaboratorIds` automatically (matches Asana).

### Drafts

- Per-task per-user draft persistence: typing in the composer auto-saves to `useUiStore.drafts: Record<\`${userId}:${taskId}\`, string>` every 800ms. Restored on next open. Clearable via small "Discard draft" link.

### Attachments in comments

- Comments can carry attachments (just like tasks in step 19). For this step, scaffold the upload UI and persist `Attachment` records; full Attachment UX shows in step 19 — make sure it's compatible.

### Project messages / status updates references

Comments are task-scoped. Project Messages live separately (step 22). Verify that comment deep-links resolve correctly via `/w/:workspaceId/tasks/:taskId?focus=comment-<id>`.

### Keyboard

- ⌘+Enter sends the comment.
- @+search inside the composer.
- `r` while viewing a comment → reply.
- `e` while viewing your own comment → edit.

### Components (one per file)
- `CommentsTab.tsx`
- `CommentComposer.tsx`
- `CommentThread.tsx`
- `CommentRow.tsx`
- `ReplyComposer.tsx`
- `MentionPicker.tsx`
- `ReactionRow.tsx`
- `EmojiPicker.tsx`
- `ActivityTab.tsx`
- `ProjectActivityFeed.tsx`
- `activityTypeRenderer.ts`

### Success criteria
- I can post a comment with @mentions; the mentioned user appears in collaborators and gets an Inbox notification.
- Reactions persist; pin/unpin works; edit/delete works.
- Activity tab renders correctly with all types from step 02.
- Drafts persist across navigations.
- `Design.md` row: `18 | src/features/comments, src/features/activity | Comments, mentions & activity | <today>`.

Sanitize all HTML before render (write a small allowlist sanitizer in `src/lib/sanitize.ts` — no external lib). Allow: p, strong, em, u, code, pre, blockquote, a (with rel="noopener noreferrer" and target="_blank"), ul, ol, li, h2, h3, br, span[data-mention-user-id], img[src starts with "data:"].
