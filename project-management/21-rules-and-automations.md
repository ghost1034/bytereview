# 21 — Rules & Automations

**Goal:** A visual **Rule builder** with triggers, conditions, and actions, plus an evaluation engine that runs on every relevant store mutation. Includes templates from a small library.

---

## Prompt (paste into Google AI Studio Build)

Implement Rules and the automation engine for Tasklytic. New code in `src/features/rules/`. Use `Rule`, `RuleTrigger`, `RuleAction` from step 02. Do not break prior steps.

### Where Rules live in the UI

- Populate the Project **Workflow** tab scaffolded in step 06:
  `/w/:workspaceId/projects/:projectId/workflow`
- Sub-tabs inside Workflow:
  - **Rules** (this step)
  - **Bundles** (step 27)
  - **Templates** (step 27)

### Workflow → Rules tab

- Header: title "Rules" + "New rule" primary button + small "From template" dropdown listing the library below.
- Body: a list of existing rules (cards). Each card shows:
  - Rule name (inline-editable).
  - One-line summary: `When <trigger> [if <conditions>] then <action 1, action 2, …>` rendered with colored pills.
  - Enabled toggle (switch).
  - Run count + last run relative time.
  - "..." menu: Edit, Duplicate, Delete, View history.

### Rule editor (sheet / dialog)

A vertically scrolling card with three sections:

**1. Trigger** (1 trigger per rule)
Choose one of:
- Task added to this project (default).
- Task moved to a section (with section picker).
- Task completed.
- Task is due in N days (with N input; runs daily).
- Custom field changed (pick field; optional "to value").
- Form submission (pick form).

**2. Conditions** (optional, 0..N — AND only)
A small filter builder reusing components from step 13's filter UI. Operates on the task. Operators per field type.

**3. Actions** (1..N — ordered)
Pickable actions:
- Assign to (user picker; also "Round-robin among members" with member multi-select).
- Set due in N days.
- Move to section.
- Add to project.
- Set a custom field value (field + value editor).
- Add collaborator.
- Send notification (to a user with a custom message).
- Create subtask (with name template that supports `{{taskName}}`, `{{assigneeName}}`, `{{today}}`, `{{dueIn:N}}`).
- Send email — renders the email-composition UI (subject, body with `{{taskName}}` / `{{assigneeName}}` / `{{dueDate}}` interpolation, recipient picker). Dispatches through the `EmailAdapter` defined in step 05; the V1 adapter queues the message into the workspace's pending-emails list, production sends through the configured provider.

Add/Remove and drag-to-reorder action chips.

### Rule library (templates)

A curated library shipped with the platform (read-only — users instantiate from these into their own editable rules):
- "Triage incoming requests" — Trigger: Form submission → Actions: Assign to triage lead, Add Priority field, Move to "To triage".
- "Daily reminder" — Trigger: Task is due in 1 day → Action: Send notification to assignee.
- "Move completed to Done" — Trigger: Task completed → Action: Move to section "Done".
- "Approval workflow" — Trigger: Task moved to "Ready for approval" → Action: Convert to Approval subtype + Assign to approver.
- "Round-robin assignment" — Trigger: Task added → Action: Round-robin among project members.
- "On at-risk status change" — Trigger: Custom field "Status" changed to "At Risk" → Action: Send notification to project owner + Add tag "needs-attention".

Clicking a template opens the editor pre-filled.

### Engine

Engine code lives in `src/features/rules/engine.ts`.

- Subscribe to store mutations (tasks, customFieldValues, sections, formSubmissions, status updates). For each mutation, evaluate matching rules.
- Avoid infinite loops:
  - Track a per-mutation "rule trace stack". If a rule action causes another mutation, allow up to depth 3, then abort with a log.
  - Skip a rule if it last ran on the same `(rule.id, task.id)` within the last 250 ms.
- Daily-style triggers (Task due in N days): run at app open (and every 30 minutes while app is open) for each enabled rule with that trigger.
- After running, increment `runCount` and `lastRunAt`. Push an `ActivityEvent` of type `'rule_action'` to the task. Send notifications when the action says so.

### Rule history

Sub-page from a rule card → "View history": modal listing the last 50 runs with task link, action result, and any error message.

### Permissions

- Rules can be created by project editors + workspace admins.
- A rule can only act on resources visible to its creator (best-effort: respect privacy of the project — already implied because rules are project-scoped).

### Components (one per file)
- `WorkflowTab.tsx`
- `RulesList.tsx`
- `RuleCard.tsx`
- `RuleEditor.tsx`
- `TriggerPicker.tsx`
- `ConditionBuilder.tsx`
- `ActionList.tsx`
- `ActionEditor.tsx`
- `RuleLibrary.tsx`
- `RuleHistoryModal.tsx`
- `engine.ts`

### Success criteria
- I can create the "Daily reminder" rule and see a notification appear when I set a task to be due tomorrow.
- I can build a custom rule with 2 conditions and 3 actions.
- Triggering loops are prevented.
- Rule history accumulates entries.
- `Design.md` row: `21 | src/features/rules | Rules & automations | <today>` plus a section **"Automation engine semantics"**.
