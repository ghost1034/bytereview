---
title: "AI assistant"
description: "Ask the Tasklytic assistant about your workspace, apply its proposals to real work, and schedule the Tria, Summarie, and Statura AI teammates."
order: 11
---

Tasklytic has two kinds of AI help: an **assistant panel** you talk to, and **AI teammates** that run on a schedule in the background. Both work only with the data in your workspace.

## The assistant panel

The sparkles button in the bottom-right corner of any Tasklytic page opens the AI panel. It has a **Chat** tab and a **Settings** tab.

### Context

The panel knows where you are. A chip above the input shows the current scope — the workspace, a project, a task, a goal, a portfolio, or a dashboard — and the assistant answers within it. Clear the chip to widen the question back out to the whole workspace.

Quick-prompt chips change with the scope:

| Where you are | Suggested prompts |
| --- | --- |
| Workspace | Summarize workspace · What's overdue? · What's blocked? · Find risks |
| Project | Summarize this project · Draft a status update · What's blocked? · Find risks |
| Task | Summarize this task · Suggest subtasks · Improve description · Suggest priority & due date |
| Goal | Summarize goal progress · Draft status update · Find risks |
| Portfolio | Summarize portfolio · What's at risk? · Draft status update |

### Threads

Conversations are kept as threads per workspace, listed at the top of the Chat tab, so you can return to an earlier line of questioning instead of starting over.

### Proposals

When the assistant suggests a concrete change, it renders it as a **proposal card** rather than acting on its own. Review it, then apply or dismiss it. Proposals cover:

- **Draft a status update** for a project, portfolio, or goal
- **Create subtasks** under a task
- **Update a description**
- **Set smart fields** such as priority and due date
- **Create a task**

Nothing changes in your workspace until you apply the proposal.

### Inline AI actions

The same engine is available directly where you work, via the small sparkles buttons:

- **Task description** — draft or improve the description on a task.
- **Suggest subtasks** — break a task into steps, which arrive as a proposal you accept or edit.
- **Status update composer** — draft the summary, highlights, blockers, and next steps for a project or goal update.

Inline AI buttons are greyed out when AI is disabled or paused.

### Settings

The **Settings** tab in the panel turns AI on or off and selects the model. Availability depends on what your firm has enabled for the workspace.

## AI teammates

**Settings → AI teammates** configures three scheduled jobs:

| Teammate | What it does | Default cadence |
| --- | --- | --- |
| **Tria** | Triages scoped work and proposes labels, priority, and assignees | On events |
| **Summarie** | Summarizes long task discussions | Daily |
| **Statura** | Drafts a project status update | Weekly |

For each one you set:

- **Enabled** — whether the job runs at all.
- **Cadence** — on events, daily, or weekly.
- **Scope** — the workspace, a specific project, or a specific task.
- **Daily limit** — a cap on how many items it may act on per day.

Teammates produce the same proposals as the panel, so their output waits for a person to accept it. Their activity also shows up in the affected task's history.

> **Note:** AI features read the work in your workspace to answer questions. Keep that in mind when scoping teammates to projects that contain sensitive client material, and use the daily limit to keep their output reviewable.
