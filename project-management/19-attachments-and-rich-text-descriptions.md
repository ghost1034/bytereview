# 19 — Attachments & Rich-Text Descriptions

**Goal:** First-class attachments on tasks and comments + a polished rich-text experience for task descriptions and project briefs.

---

## Prompt (paste into Google AI Studio Build)

Polish the rich-text editor used throughout Tasklytic and implement full attachments. New code in `src/features/attachments/` and improvements in `src/features/editor/`. Do not break prior steps.

### Rich text editor (unify under one component)

Extract the editor implementations from steps 06/07/18 into a single shared `<RichTextEditor/>` in `src/features/editor/RichTextEditor.tsx`. Build it as a contentEditable wrapper with selectionchange-based toolbar.

Features:
- Bold, italic, underline, strikethrough.
- Headings H1/H2/H3.
- Bulleted/numbered/task lists. Task-list checkboxes are interactive (toggle their checkmark inline; persists in the saved HTML).
- Block quote, divider (`<hr>`).
- Inline code, code block (with language selector — small set: text, js, ts, tsx, py, sql, md; uses a simple <pre> with a class — no syntax highlighter library).
- Link insertion + edit popover.
- Inline image insertion (data URL, max 2MB per image; preview, drag to resize).
- Embed link: paste a YouTube URL → inline iframe; paste a Loom/Vimeo URL → inline iframe; paste any URL → unfurl as a styled link card with title and host (compute title from the hostname; no actual fetching).
- Mention pills (`@`) — already from step 18, keep working.
- Slash menu: typing `/` at line start opens a command menu (Heading, List, Code block, Divider, Image, Mention, Date, /done) at cursor.
- Markdown autoformatting: `**bold**`, `*italic*`, `` `code` ``, `# Heading`, `- ` list, `1. ` numbered, `> ` quote, `--- ` hr, `[ ] ` task.
- Undo/Redo via a custom history stack (cap at 50 entries). ⌘Z / ⌘⇧Z.

Toolbar: floating bubble toolbar on selection, plus a permanent persistent toolbar in larger contexts (project brief). Both render the same actions.

Use the editor in:
- Task description (`TaskDescriptionEditor` from step 07).
- Project brief (step 06).
- Comments (step 18).
- Project messages (step 22, when built).
- Status updates (step 22).

### Attachments — UX

Sources:
- Drag-and-drop onto any drop zone (task detail pane, comment composer, project Files tab).
- File picker.
- "Paste from clipboard" — listen to `paste` on focused composer/description; convert image blobs to attachments.
- "Add from link" — paste a URL; creates an `Attachment` with `dataUrl` empty, but `mime` `'link/url'`, and a label derived from the URL.

Storage (via the `FileStorageAdapter` interface):

Define `src/lib/fileStorage/types.ts` exporting the adapter interface and add `src/lib/fileStorage/index.ts` with a `getFileStorage()` accessor that returns the configured adapter. This is the same adapter pattern used by the repository (step 02), auth (step 03), and email (step 05) layers.

```ts
export interface FileStorageAdapter {
  upload(input: { file: File; ownerId: ID; scope: 'task' | 'comment' | 'project'; scopeId: ID }): Promise<{ ref: string; mime: string; size: number; downloadUrl: string }>;
  getDownloadUrl(ref: string): Promise<string>;
  remove(ref: string): Promise<void>;
  zipMany(refs: string[]): Promise<Blob>;
  readonly capabilities: {
    maxFileSize: number;
    supportsThumbnailing: boolean;
    supportsVirusScan: boolean;
    supportsServerSideZip: boolean;
  };
}
```

V1 adapter (`localAdapter.ts`):
- Stores binary files inline as data URLs on the `Attachment` record (`Attachment.dataUrl`, `Attachment.storage = 'local'`).
- Caps each file at 5 MB; rejects over-limit uploads with a friendly toast.
- `zipMany` implements client-side ZIP via `CompressionStream` (the `src/lib/zip.ts` helper from the Files tab section below).
- `capabilities.maxFileSize = 5 * 1024 * 1024`; thumbnailing and virus scanning are `false`.
- Tracks storage usage per workspace in the workspace settings (informational; production enforces against the workspace plan from step 05).

Production swap-out:
- `s3Adapter.ts` / `gcsAdapter.ts` / `azureAdapter.ts` use signed-URL uploads against an object store, return a `ref` of the form `<bucket>/<key>`, and stream zip generation server-side.
- `capabilities.maxFileSize` rises to whatever the plan permits (e.g., 250 MB on Business, 5 GB on Enterprise).
- `capabilities.supportsThumbnailing` enables a CDN-side image-resize pipeline.
- `capabilities.supportsVirusScan` plugs in ClamAV / Lambda-based scanning before the file is downloadable.
- Switching is one env var: `VITE_FILE_STORAGE_ADAPTER=s3` plus the bucket and signing config. No feature code changes — every call site only knows the `FileStorageAdapter` interface.

The `Attachment` record (from step 02) already carries `storage: 'local' | 'object_store' | 'cloud_drive'` and `storageRef?: string` so the adapter swap is transparent.

Rendering:
- **Chips** (compact, used in task footer): mime icon + name + size + actions (preview, download, copy link, delete).
- **Cards** (used in the Files tab + when many attachments): tile with thumbnail (for images), file icon (for others), name (truncated), size, uploader avatar, uploaded date.
- **Preview**: click → modal preview with backdrop. For images, fit-to-screen; for PDFs, embed via `<embed>` from data URL; for other mimes, show a "No preview available" + Download.

### Files tab (project)

Populate the Files tab scaffolded in step 06. Route: `/w/:workspaceId/projects/:projectId/files`.

- Top toolbar: search by name, filter by mime category (Image, Document, Spreadsheet, Video, Audio, Other), filter by uploader, sort by date/name/size, switch view between **Grid** (cards) and **List** (table).
- Grid: responsive 4–6 columns of cards.
- List: columns Name, Type, Size, Uploaded by, Uploaded date, Task (link to the task it's attached to), Actions.
- Bulk select with checkboxes; bulk actions: Download (zip — generate a single ZIP via a tiny client-side zip helper that you implement in `src/lib/zip.ts` using deflate-raw via the browser's CompressionStream API; cap at 100 files), Delete.

### Task detail pane attachments (populate the scaffold from step 07)

A dedicated **Attachments** block:
- Drop zone with dotted border.
- "Attach files" button + "Add from link" + **"Connect cloud drive"** dropdown listing Google Drive, Microsoft OneDrive, and Dropbox with their branded icons. Each entry is wired to the `CloudDriveAdapter` interface (defined in `src/lib/cloudDrive/types.ts` alongside the file-storage adapter). The V1 adapter exposes `available: false` for every provider and renders an inline "Configure in Settings → Integrations → Cloud Drives" hint on click. Production binds OAuth handshakes per provider (`VITE_GDRIVE_CLIENT_ID`, `VITE_ONEDRIVE_CLIENT_ID`, `VITE_DROPBOX_APP_KEY`) and creates `Attachment` records with `storage: 'cloud_drive'` and a `storageRef` pointing into the provider's file ID — no bytes ever pass through Tasklytic.
- Renders chips. Click a chip name → opens preview modal.

### Comment attachments

In CommentComposer, attachments above the editor show as chips and are submitted with the comment. Render the same chips inside the comment row when shown.

### Cover image / "Hero" attachment

A task can mark one attachment as its **cover**. Show a small "Set as cover" action in the chip menu. On Board view cards (step 09), the cover image renders as a 96px-tall hero strip at the top of the card.

### Validation & limits

- Reject files > 5MB with a friendly toast.
- Reject malicious mimes (executables: `.exe`, `.bat`, `.sh`, `.dll`, `.com`).
- Strip EXIF from images is NOT in scope — note it in `Design.md` as a future TODO.

### Components (one per file)
- `RichTextEditor.tsx`
- `EditorToolbar.tsx`
- `SlashMenu.tsx`
- `LinkPopover.tsx`
- `ImageBlock.tsx`
- `AttachmentChip.tsx`
- `AttachmentCard.tsx`
- `AttachmentPreviewModal.tsx`
- `FilesTab.tsx`
- `useDropzone.ts`
- `zip.ts`

### Success criteria
- The rich text editor works everywhere it's used; all features behave consistently.
- Users can attach files via drag, picker, paste, or link.
- The Files tab lists all attachments for a project with filter/sort/search and supports a bulk-download ZIP via `FileStorageAdapter.zipMany`.
- Board cards show a cover image when set.
- The `FileStorageAdapter` and `CloudDriveAdapter` interfaces are exported and the V1 implementations are wired through their respective accessors. Swapping to a production object-store / cloud-drive provider requires only an env-var binding.
- `Design.md` row: `19 | src/features/editor, src/features/attachments, src/lib/fileStorage, src/lib/cloudDrive | Rich text + attachments + file-storage and cloud-drive adapters | <today>`.
