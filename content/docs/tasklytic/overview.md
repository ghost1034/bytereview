---
title: "Overview"
description: "What Tasklytic is, how workspaces, projects, and tasks fit together, and how to find your way around the module."
order: 1
---

Tasklytic is CPAAutomation's work-management module. It holds your projects and tasks, the people who do the work, the deadlines and dependencies between them, and — through its professional-services layer — the time, expenses, and invoices that come out the other side. If your firm runs client engagements, Tasklytic is where the plan, the delivery, and the billing live together.

## What you can do

- **Plan work in projects** — sections, tasks, subtasks, milestones, dependencies, and custom fields, viewed as a list, board, calendar, timeline, or Gantt chart.
- **Run your own day** — a personal My Tasks hub and a notification inbox that collects mentions, assignments, approvals, and automation results.
- **Collect and route incoming work** — public intake forms that create tasks, plus rules that assign, schedule, and move work automatically.
- **Track strategy** — goals with progress rollup, portfolios that group projects, and a workload heatmap for per-person capacity.
- **Report on delivery** — dashboards built from tasks, projects, goals, time, expenses, and billing data, with scheduled email digests.
- **Bill client work** — timers and timesheets, expenses and reimbursements, clients and engagements, invoices, payments, and trust accounting.
- **Ask AI for help** — a workspace-aware assistant panel plus scheduled AI teammates that triage, summarize, and draft status updates.

## How the pieces fit together

| Concept | What it is |
| --- | --- |
| **Workspace** | The top-level container for your firm's work. Everything below belongs to exactly one workspace, and you can belong to more than one. |
| **Team** | A group of people inside a workspace. Every project belongs to a team, which drives default visibility. |
| **Project** | A body of work with its own members, sections, views, custom fields, and (optionally) a client and engagement. |
| **Task** | The unit of work: assignee, dates, tags, custom fields, subtasks, dependencies, comments, attachments, time, and expenses. |
| **Client / engagement** | The professional-services layer that ties a project to a billable relationship. Law-mode workspaces call engagements *matters*. |

## Where to find it

Open **Tasklytic** in the CPAAutomation sidebar (`/dashboard/project-management`). You land in your current workspace at `/dashboard/project-management/w/<workspace>/home`.

Inside the module, a second navigator sits beside the CPAAutomation sidebar. It is grouped into:

| Group | Destinations |
| --- | --- |
| **Pinned** | Home, My Tasks, Inbox, Teams, My Searches |
| **Insights** | Portfolios |
| **PSA** | Time, Timesheets, Expenses, Clients, Engagements (or Matters) |
| **Starred / Projects** | Your starred projects, then the projects you're a member of |

The navigator can be collapsed to icons, resized by dragging its edge, or opened as a drawer on small screens. Goals, Forms, Workload, Reporting, Templates, and Settings are reachable from the section bar at the top of the workspace and from the command palette.

## Getting around quickly

The shared CPAAutomation top bar carries Tasklytic's own controls while you're in the module:

- **Create** — a menu for a new Task, Project, Form, Portfolio, or Dashboard.
- **Timer chip** — start a timer against a task, or see and stop the one that's running.
- **Inbox dropdown** — recent notifications with a link into the full inbox.
- **Search / ⌘K** — opens Tasklytic's command palette instead of the global one, searching projects, tasks, goals, and people, with create actions and links back out to the rest of CPAAutomation.

Press `?` anywhere for the shortcut list:

| Shortcut | Action |
| --- | --- |
| `⌘K` | Open the command palette |
| `c` | Quick-create a task |
| `g h` / `g m` / `g i` | Go to Home / My Tasks / Inbox |
| `[` / `]` | Collapse / expand the navigator |
| `Shift+T` | Open timer controls |
| `/` | Focus the search box in the current view |
| `?` | Show the shortcut list |

## Who can do what

Every member of a workspace holds one role, and admins can grant extra capabilities on top of it.

| Role | What it means |
| --- | --- |
| **Admin** | Full access, including workspace settings, members, roles, and every billing capability. |
| **Member** | Can view and edit work — projects, tasks, goals, forms, rules, and their own time and expenses. |
| **Guest** | Read-only access to what they've been given. |

Admins can additionally flag individual members with **Submit**, **Approve**, **Billing**, **Record payments**, **Trust**, and **Manage rates** capabilities. These gate the professional-services actions described in [Time and billing](/docs/tasklytic/time-and-billing) — approving a timesheet, generating an invoice, recording a payment, or moving trust funds.

## First steps

**If you're setting up a workspace:**

1. Finish the five-step setup wizard (welcome, about your team, starter templates, invite teammates, finish). You can replay it later from **Settings → Onboarding**.
2. Invite the rest of the firm and set roles — see [Workspaces, teams, and members](/docs/tasklytic/workspaces-teams-and-members).
3. Create your first project from a [template](/docs/tasklytic/templates) or from scratch.

**If you're joining an existing workspace:**

1. Accept your invitation and pick your workspace from the switcher at the top of the navigator.
2. Take the product tour from the **Help** menu in the navigator footer — it visits every major area.
3. Open [My Tasks](/docs/tasklytic/my-tasks-and-inbox) to see what's assigned to you.

Continue to [Projects and tasks](/docs/tasklytic/projects-and-tasks) for the core workflow.
