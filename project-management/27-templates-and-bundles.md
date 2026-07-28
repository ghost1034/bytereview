# 27 — Templates & Bundles

**Goal:** Project templates (custom + curated), task templates, and **Bundles** — reusable packs of fields + rules + sections that can be applied to multiple projects at once.

---

## Prompt (paste into Google AI Studio Build)

Implement Templates and Bundles. New code in `src/features/templates/` and `src/features/bundles/`. Use `ProjectTemplate` and `TaskTemplate` from step 02. Do not break prior steps.

### Project templates

**Saving a template**:
- From any project: "..." → "Save as template". Modal asks for: template name, description, icon, "Include tasks?" (toggle), "Include rules?" (toggle), "Include custom fields?" (toggle). Stores a `ProjectTemplate` with `defaults: Partial<Project>`, `sectionNames`, `taskTemplates`, `customFieldIds`, and (extend non-breakingly) `ruleTemplates: Array<Omit<Rule,'id'|'projectId'|'createdBy'|'createdAt'>>`.
- Templates live at the workspace level. Listed in the workspace settings → Templates page.

**Curated templates shipped with the platform**:
Provide 8 ready-to-use ones (do not persist — render from a constants file). Each loaded into the create-project dialog from step 06's "From template" card:
1. **Product launch** — sections: Plan / Build / Launch / Measure. Fields: Priority, Status, Effort.
2. **Marketing campaign** — sections: Strategy / Assets / Distribution / Analyze. Fields: Channel, Owner, Due, Cost.
3. **Editorial calendar** — sections: Pitched / Drafting / Editing / Published. Fields: Author, Publish date, Channel.
4. **Engineering sprint** — sections: Backlog / In progress / Review / Done. Fields: Story points, Type, Priority.
5. **Onboarding (new hire)** — Sections: Pre-day-1 / Week 1 / Month 1 / Month 3. Fields: Owner, Done.
6. **Bug tracker** — Sections: Triage / In progress / Verifying / Closed. Fields: Severity, Reporter, Steps to reproduce, Build version.
7. **Event planning** — Sections: Pre / Day-of / Post. Fields: Vendor, Cost, Status.
8. **OKR planning** — Sections: Q1 / Q2 / Q3 / Q4. Fields: Objective, KR, Confidence.

When the user creates a project from a template, instantiate sections, tasks (per `taskTemplates`), custom fields, and rules. Track `Project.templateId` (extend non-breakingly).

### Task templates

From any task → "..." → "Save as template". Stores `TaskTemplate` keyed by name, with `defaults: Partial<Task>` and `subtaskTemplates`.

Where they're usable:
- Inline create row in List view shows a small "From template" dropdown.
- Rules action "Create subtask" (step 21) can pick a task template by name.
- Right-click an empty section → "Add tasks from template" inserts the full subtask tree.

### Bundles

A **Bundle** is a reusable pack — apply to any project to add its custom fields, sections, rules, and starter tasks without replacing the project.

Type (add to types):
```ts
export type Bundle = {
  id: ID;
  workspaceId: ID;
  name: string;
  description?: string;
  iconEmoji?: string;
  customFieldIds: ID[];           // global fields to add to the project
  sectionNames: string[];         // append-only sections
  taskTemplates: TaskTemplate[];
  ruleTemplates: Array<Omit<Rule, 'id' | 'projectId' | 'createdBy' | 'createdAt'>>;
  appliedToProjectIds: ID[];      // tracking for show/sync
  createdBy: ID;
  createdAt: ISODateTime;
};
```
Add a `useBundlesStore`.

**Bundles UI**:
- Workspace settings → "Bundles" page: list, create, edit, delete. Editor mirrors the structure above.
- On a project (Workflow tab → Bundles sub-tab from step 21): "Apply bundle" button opens a picker. Applying merges the bundle's contents into the project. Multiple bundles can be applied. A bundle can be unapplied (best-effort: removes fields & rules that came from it; leaves data untouched).

### Updating templates and bundles

- Save updates → option "Apply updates to projects using this template/bundle?" (best-effort). Shows a diff (added fields/rules) and lets the user confirm.

### Permissions

- Workspace admins manage templates and bundles.
- Team admins can create templates within their team.

### Components (one per file)
- `TemplatesSettingsPage.tsx`
- `TemplateCard.tsx`
- `CreateTemplateModal.tsx`
- `SaveProjectAsTemplateModal.tsx`
- `TaskTemplateMenu.tsx`
- `BundlesSettingsPage.tsx`
- `BundleEditor.tsx`
- `ApplyBundleDialog.tsx`
- `useTemplateInstantiate.ts`
- `useBundleApply.ts`

### Curated content as fixtures

- Put curated project templates in `src/features/templates/curated.ts`.
- Put curated task templates in `src/features/templates/curatedTasks.ts` (e.g., "Weekly standup", "Bug fix", "Sprint review").

### Success criteria
- I can create a project from each of the 8 curated templates and see realistic sections/fields/tasks.
- "Save as template" workflow works end-to-end.
- Applying a bundle to a project adds its fields/sections/rules without overwriting existing content.
- `Design.md` row: `27 | src/features/templates, src/features/bundles | Templates & bundles | <today>`.
