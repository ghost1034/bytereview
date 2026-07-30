# 20 — Forms (Intake)

**Goal:** A complete intake-form system: build a form per project, share by URL, branch logic, and auto-create tasks from submissions.

---

## Prompt (paste into Google AI Studio Build)

Implement Forms for Tasklytic. New code in `src/features/forms/`. Use the `Form`, `FormField`, and `FormSubmission` types from step 02. Do not break prior steps.

### Forms tab on projects

Populate the Forms tab scaffolded in step 06.

`/w/:workspaceId/projects/:projectId/forms`

- Left side: list of forms on this project (a project can have multiple). Each row: form name, status (Published/Draft), submissions count, last submission time.
- Right side: editor/preview pane.
- Top: "+ New form" button.

### Form builder

A WYSIWYG builder with three panes:

1. **Left: Field palette**
   - Cards: Short text, Long text, Number, Date, Single select, Multi select, Attachment.
   - Drag a card onto the canvas to insert.

2. **Center: Form canvas** (live preview as users will see it)
   - Form header: cover image (data URL), logo, title (= form name by default), description (rich text).
   - Field stack. Each field row when selected shows handles to delete, duplicate, drag to reorder.
   - Footer: required-field legend, submit button.

3. **Right: Inspector** (changes based on selection)
   - **Form-level**: name, description, cover, logo, color theme (use the brand palette tokens).
   - **Field-level**: label, placeholder, required toggle, type-specific options (e.g., options for dropdown), "Show this field if…" (branching: choose another field + operator + value).
   - **Mapping**: which field is the **Task title**, **Default assignee**, **Default section**, **copy answers to description** toggle.

### Branching logic

Each field has an optional `visibleIf` rule: `{ fieldId, op: 'eq'|'neq'|'is_set'|'is_not_set', value? }`. Evaluate live in the preview and on the public form.

### Sharing

Top-right of editor: **Publish** button. When published:
- Generate a `publicSlug` (`crypto.randomUUID()` first 8 chars).
- Show share controls: public URL `/forms/<slug>` (this is a route OUTSIDE `RequireAuth`), copy-to-clipboard, "Embed" code snippet (a copy-ready `<iframe src="…/forms/<slug>" />` tag pre-filled with the published URL).
- Toggle: "Only people in this workspace" (signed-in only) vs "Anyone with the link" (public).

### Public form page

Route `/forms/:slug` — accessible without auth.
- Clean, minimal layout, brand color from the form's theme.
- Renders cover, logo, title, description, fields with branching, and a submit button.
- Validates required fields inline.
- On submit:
  - Creates a `FormSubmission`.
  - Creates a `Task` in the form's project + default section + default assignee.
  - Maps the chosen "Task title" field to `task.name`.
  - If `copyAnswersToDescription === true`, writes all answers to `task.notes` as an HTML definition list.
  - For attachment fields, creates `Attachment` records linked to the task.
  - Shows the form's confirmation message (default: "Thanks! Your request has been received.") + optional "Submit another response" button.
- If the form requires sign-in, redirect to `/signin?redirect=/forms/<slug>`.

### Submissions inbox

Per-form tab "Submissions":
- Table: submitted at, submitter (name/email if available, otherwise "Anonymous"), task created (link), short snippet of answers.
- Click a row → side panel showing all answers and the linked task.
- Bulk select + "Open created tasks in List view filtered by form" link.

### Embed mode

A simple GET param `/forms/<slug>?embed=1` removes outer chrome and renders the form alone, so it could be iframed.

### Form-to-task automations preview (handoff to step 21)

Show a small "Add automation" link in the Forms tab that routes to `/w/:workspaceId/projects/:projectId/workflow` (built in step 21). The intent is "When form submission → do X".

### Permissions

- Project editors can edit forms.
- Anyone with form view permission (workspace member or public, depending on setting) can submit.
- Workspace admins can disable public-form sharing globally (toggle in workspace settings → Security tab, add it).

### Components (one per file)
- `FormsTab.tsx`
- `FormsListSidebar.tsx`
- `FormBuilder.tsx`
- `FieldPalette.tsx`
- `FormCanvas.tsx`
- `FormFieldRow.tsx`
- `Inspector.tsx`
- `PublicFormPage.tsx`
- `SubmissionsTab.tsx`
- `useFormEvaluator.ts`
- `useFormSubmitter.ts`

### Success criteria
- I can build a 5-field form with branching, publish it, open the public URL in another tab, submit, and see the resulting task in the project + the submission row.
- The form's task title mapping works.
- Submission attachments arrive on the task.
- `Design.md` row: `20 | src/features/forms | Forms (intake) | <today>`.
