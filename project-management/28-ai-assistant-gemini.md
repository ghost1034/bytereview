# 28 — AI Assistant (Gemini)

**Goal:** A "Smart" sidebar powered by Gemini that drafts status updates, summarizes activity, recommends fields, and suggests automations. Mirrors Asana's AI Teammate concept at a tasteful level.

---

## Prompt (paste into Google AI Studio Build)

Add an AI assistant ("**Tasklytic AI**") backed by Gemini, integrated into the app. New code in `src/features/ai/`. Use the AI Studio Gemini integration (you have access — wire it directly). Do not break previous steps.

### Where the AI lives

Three surfaces:
1. **Right-side AI panel** — toggled from a sparkles icon in the topbar. 380px wide, slides over content. Full chat interface.
2. **Inline "magic" buttons** in specific contexts (described below).
3. **"AI Teammate" assignable agents** — special "AI users" you can assign as the task assignee to trigger automated work (kept lightweight: an AI user just summarizes the task and posts a comment with suggested subtasks).

### Right-side AI panel

A chat surface like ChatGPT, with these properties:
- Persistent thread per workspace (multiple threads, switchable like ChatGPT).
- The user can attach "context": a task, project, portfolio, goal, or dashboard. Selected context renders as chips above the input.
- The system prompt seeds the model with knowledge that it is an assistant for a work-management app called Tasklytic; it summarizes data when relevant; it returns suggestions in a structured way; it should not invent fields or projects.
- Includes a tiny tool layer: the user can ask for actions, and the AI suggests them as **proposed actions** (cards). Each proposed action has an "Apply" button — clicking calls the relevant store method. Examples: "Create task X assigned to Y due Friday", "Add 3 subtasks", "Draft a status update". No action runs without user confirmation.
- Quick prompts above the input: "Summarize this project", "Draft a status update", "What's blocked?", "Suggest custom fields", "Find risks".

### Inline magic buttons

Wire these into existing screens (small sparkles icon button + label "AI"):

- **In a project's Overview → status update composer (step 22)**: "Draft from activity" — calls `summarizeProjectActivity` (helper from step 22) and passes results to Gemini with instructions to produce a Title + Summary + Highlights + Blockers + Next steps. Result fills the composer; user edits before posting.
- **In a task's detail pane (step 07)**:
  - "Suggest subtasks" — generates 3–7 subtasks for the task based on its name + description; preview list with checkboxes; click "Add selected".
  - "Summarize comments" — produces a 3-bullet summary of the comments tab.
  - "Improve description" — rewrites for clarity and structure (preview diff; accept/reject).
- **In project Custom Fields manager (step 14)**: "Suggest fields" — recommends 3 fields based on the project's name + description.
- **In Rules editor (step 21)**: "Describe what I want" — natural-language input → produces a draft `Rule` JSON the user can review and apply.
- **In Goal detail (step 23)**: "Draft status update" using the goal's progress + supporting projects.
- **In Reporting (step 26)**: "Suggest chart" given a freeform question; the AI maps to source + filter + visualization JSON and clicks through to the builder pre-filled.

### Implementation details

`src/features/ai/gemini.ts` — a small client wrapper exposing:
- `chat(systemPrompt, history, userMessage, contextChunks)`
- `runStructured<T>(prompt, schemaJson)` — for JSON outputs (use Gemini's response_schema if supported in the current API; otherwise, robustly JSON-parse with retry).
- Token / message size limits handled with truncation: prefer most-recent messages + the smallest viable context chunks.

`src/features/ai/contextBuilder.ts` — given a context type (task/project/portfolio/goal/dashboard) and id, produces a structured JSON summary (NOT raw HTML) of:
- Identifiers, dates, members
- Recent tasks (cap 50 by recency)
- Recent comments (cap 20)
- Status updates (cap 5)
- Custom field values
- Computed metrics (counts, % complete, overdue counts)

`src/features/ai/proposals.ts` — small registry of proposal types and their `apply()` functions:
- `create_task`, `create_subtasks`, `update_description`, `draft_status_update`, `add_custom_field`, `create_rule`, `add_chart_to_dashboard`, `summarize`, `propose_assignees`.

Each proposal renders as a card with a Preview + Apply / Discard.

### Safety / guardrails

- All proposals require user confirmation; the AI never directly mutates the store.
- Show the AI's reasoning collapsed by default ("Show reasoning ▾") to keep the UI clean.
- Add a "Privacy" notice in `/me`: "Tasklytic AI sends necessary context to Gemini to generate responses. You can pause AI in the topbar."
- Add a "Pause AI" toggle in the panel header.

### "AI Teammate" (lightweight)

- In workspace settings → "AI Teammates" page: list of preset AI users:
  - **Tria** — triage assistant. Assign to a triage section's tasks; she posts a comment with a triage summary and proposed labels/priority.
  - **Summarie** — comments summarizer. Assign to long-discussion tasks; she posts a TL;DR every 24 hours.
  - **Statura** — status drafter. Add to a project; once a week posts a draft status update.
- Each AI Teammate is a `User` with `role: 'ai'` (extend the User role enum non-breakingly). Avatar is a distinct gradient. Can be assigned just like a person.
- Trigger their work via a small `aiTeammateScheduler.ts` that runs on app load and on relevant events.

### Components (one per file)
- `AiPanel.tsx`
- `AiPanelHeader.tsx`
- `AiThreadList.tsx`
- `AiMessage.tsx`
- `AiProposalCard.tsx`
- `AiContextChips.tsx`
- `AiQuickPrompts.tsx`
- `MagicButton.tsx` (reusable)
- `gemini.ts`
- `contextBuilder.ts`
- `proposals.ts`
- `aiTeammateScheduler.ts`
- `AiTeammatesSettingsPage.tsx`

### Success criteria
- The AI panel opens, accepts a project as context, and produces a credible 5-sentence summary of it.
- "Draft from activity" pre-fills a status update composer with non-empty content drawn from real project data.
- "Suggest subtasks" inserts checkbox-list proposals; selected ones become real subtasks.
- Pause AI toggle disables all calls and grays out magic buttons.
- `Design.md` row: `28 | src/features/ai | AI assistant (Gemini) | <today>` plus a section **"AI surface map"** enumerating every place AI is invoked.

Strict rule: the AI must never silently mutate data. All applies are user-confirmed.
