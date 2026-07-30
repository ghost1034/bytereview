# 14 — Custom Fields (local + global, all types)

**Goal:** Full Custom Fields support — local to a project or global to the workspace library; all field types; reordering; show-on-card toggles; notifications on dropdown changes.

---

## Prompt (paste into Google AI Studio Build)

Implement custom fields end-to-end. New code in `src/features/custom-fields/`. Use `CustomField` and `CustomFieldValue` types from step 02. Do not break any prior steps.

### Field types & UI editors

For each type, create a `<FieldValueCell/>` (rendered in List/Board/Detail pane) and a `<FieldValueEditor/>` (popover/inline editor).

- **Text** — single-line; multiline option in the field config.
- **Number** — number input with optional precision; format `plain | percent | currency` (with `currencySymbol` config) and optional `custom_label` ("hours", "items"); show right-aligned with format.
- **Date** — same picker as task due date; optional time toggle.
- **People** — single or multi (config toggle); avatar picker.
- **Dropdown** — single select with colored chip options.
- **Multi-select** — multiple colored chips.
- **Checkbox** — small switch.
- **Formula** — read-only; user enters a tiny expression in the field config supporting `+ - * /`, numeric custom-field references like `[Hours] * 75`, and `IF([Done], 100, [Progress])`. Implement a minimal safe evaluator (no `eval`) parsing tokens for numbers, identifiers (custom field names), parentheses, operators, and a single `IF(cond, a, b)` function. Show errors inline.

### Field library (global)

- A workspace-level "Field library" page at `/w/:workspaceId/settings/fields`.
- Table: Name, Type, Used in (project count), Created by, Notifications enabled. Search + sort.
- Create / edit / archive fields. Archived fields disappear from pickers but values are kept.
- Permissions: workspace admins manage the library; team admins can create new global fields.

### Project field management

In **Project settings → Custom fields** tab (scaffolded in step 06 — populate it now):
- Two columns: **Project fields** (left, ordered, drag to reorder) and **Field library** (right, searchable).
- Add a library field to the project via "+" button. Create a new local field via "Create field" — opens a modal:
  - Name, Type, Description, Options (for dropdown/multi), Number format, "Notify task collaborators on change" (for dropdown only — matches Asana behavior), and a toggle "Show on board card".
- Removing a field from a project keeps the value on the task but stops showing it in this project; deleting the field everywhere requires confirm.
- Drag to reorder — order matters for List columns and detail pane.

### List view integration

- Each project field appears as a column in List view. Reorder/show-hide via the existing column customizer (step 08). Save order in `useColumnsStore`.
- Cell editors are the per-type editors above.
- Headers show field type icons.

### Board view integration

- Card "fields strip" shows fields with **Show on card** = true (max 4). Click to edit inline.
- Density "Compact" hides custom fields.

### Detail pane integration

In the task detail pane, after the built-in fields, render a **Fields** section listing all project fields (or all fields across all of the task's projects, deduped). Plus a "+ Add field" button to add an ad-hoc local field to the project.

### Filter/sort/group integration (with step 13)

- Custom fields appear in the Filter / Sort / Group menus with appropriate operators per type.
- For dropdown / multi-select, group-by uses the option order configured on the field; option labels render with the option color.

### Notifications

- When a dropdown field with `notify: true` changes value on a task, push a Notification (type `'custom_field_changed'`) to every task collaborator (their `User.id` in `task.collaboratorIds`). Wire to `useNotificationsStore` (full inbox UI ships in step 17).

### Asana-AI–style "Recommended fields"

Add a "Recommended fields" panel in the project field manager that suggests common fields:
- **Priority** (dropdown: Low / Medium / High — `gray`, `warning`, `danger`)
- **Status** (dropdown: On track / At risk / Off track / Complete)
- **Estimate (h)** (number, plain, label "h")
- **Cost** (number, currency)
- **Effort** (dropdown: Small / Medium / Large)
- **Department** (dropdown — empty until configured)

Each suggestion has an "Add" button. They are created as **global** library fields if a workspace admin clicks, otherwise as local fields.

### Validation

- Required fields (config toggle) prevent task completion until set. Show a small inline warning in the field row of the detail pane.
- Number precision and min/max validated on entry.

### Components (one per file)
- `FieldsTab.tsx` (in project settings)
- `FieldLibraryPage.tsx`
- `CreateOrEditFieldModal.tsx`
- `FieldValueCell.tsx`
- `FieldValueEditor.tsx`
- `FormulaEvaluator.ts`
- `RecommendedFieldsPanel.tsx`
- `useProjectFields.ts`

### Success criteria
- I can create global and local fields of every type.
- They render correctly in List columns, Board card strips, and the detail pane.
- Filter/sort/group menus include them.
- Dropdown change notifications flow into the notifications store.
- Formula fields compute live.
- `Design.md` row: `14 | src/features/custom-fields | Custom fields | <today>` plus a section **"Custom field types reference"**.

Keep components ≤ 200 lines.
