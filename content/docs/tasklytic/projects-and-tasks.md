---
title: "Projects and tasks"
description: "Create projects, organize them into sections, and work with tasks — assignees, dates, subtasks, dependencies, custom fields, files, comments, and status updates."
order: 3
---

Projects hold the work; tasks are the work. This page covers creating a project, everything on a task, and the collaboration surfaces around them. For the different ways to *look* at the same tasks, see [Views and filters](/docs/tasklytic/views-and-filters).

## Creating a project

Click **New project** on the workspace home page, the **+** beside **Projects** in the navigator, or **Create → Project** in the top bar. The dialog walks through three steps:

1. **Start from** — a blank project (default sections and starter tasks) or a curated [template](/docs/tasklytic/templates).
2. **Details** — name, description, icon, color, owning team, and privacy.
3. **Views** — which views the project offers and which one opens by default.

Project privacy decides who can find it:

| Privacy | Who can see the project |
| --- | --- |
| **Public to team** | Everyone on the owning team |
| **Public to workspace** | Everyone in the workspace |
| **Private to members** | Only people added to the project |

## Inside a project

A project page has a header (name, status, members, star, settings) and a row of tabs. Which view tabs appear depends on what was enabled for the project.

| Tab | What it holds |
| --- | --- |
| **Overview** | Project brief, roles, documents, key resources, milestones, recent activity, status, members, and details |
| **Messages** | Project-wide announcements and discussion |
| **List / Board / Timeline / Gantt / Calendar** | The task views |
| **Dashboard** | Charts scoped to this project |
| **Files** | Every attachment across the project's tasks |

Use **Add task** in the header to quick-add, and the star icon to pin a project to the top of your navigator.

### Overview tab

- **Project brief** — a rich-text description of what the project is for.
- **Project roles** — who's responsible for what, per member.
- **Key resources** — bookmarks to external pages; enter a title and URL.
- **Milestones** — dated checkpoints, created from **Add milestone**. Milestones are tasks with a milestone subtype, so they appear in views and on the timeline.
- **Status** — the current project status and its history. Post an update with **On track**, **At risk**, **Off track**, **On hold**, or **Complete**, plus a summary, highlights, blockers, and next steps. Followers are notified.

### Sections

Sections group tasks inside a project — they're the rows in List view and the columns in Board view. Rename, reorder, and collapse them from either view. A section can carry a **WIP limit**, which flags the board column when too many tasks pile up in it.

## Tasks

Click any task to open the detail pane — a right-hand panel over the current view, or a full page at `/w/<workspace>/tasks/<task>` if you open it directly or use **Open full screen**. Copy a link to a task from the same header menu.

The pane holds:

| Field | Notes |
| --- | --- |
| **Title and completion** | Mark complete from the header; completed tasks can be hidden in any view |
| **Assignee** | One person per task |
| **Due date** | Optional start date, due date, and due time |
| **Projects** | A task can live in several projects at once, with a different section in each |
| **Dependencies** | **Blocked by** and **Blocking** links to other tasks |
| **Custom fields** | The project's fields, edited inline |
| **Tags** | Workspace-wide, color-coded labels |
| **Followers** | People notified about activity on the task |
| **Description** | Rich text, with an AI assist button |
| **Subtasks** | Nested checklists, with AI suggestions |
| **Attachments** | Files on the task |

Tasks come in three kinds: a normal **task**, a **milestone** (a dated checkpoint), and an **approval** (which carries an approval status of pending, approved, rejected, or changes requested).

### Subtasks

Subtasks nest up to **five levels** deep, counting the root task as level one. Each one is a full task with its own assignee, dates, and fields, and breadcrumbs at the top of the pane show where you are in the hierarchy. Promoting or moving a subtask that would push the tree past five levels is blocked with an explanation.

### Dependencies

Add **Blocked by** links for work this task waits on, and **Blocking** links for work waiting on it. Dependencies drive the arrows, critical path, and drag-to-reschedule behavior in [Timeline and Gantt](/docs/tasklytic/views-and-filters#timeline-and-gantt).

### Custom fields

Fields can be **project-local** or **global** to the workspace. Manage the shared set in **Settings → Field library**, and add fields to a project from its settings or straight from a task with **+ Add fields**.

| Type | Notes |
| --- | --- |
| **Text**, **Number**, **Date**, **Checkbox** | Number fields format as plain, percent, or currency |
| **Dropdown**, **Multi-select** | Color-coded option lists |
| **People** | One or more workspace members |
| **Formula** | Derived from other fields |

Fields can be set to notify followers when their value changes, and any field can be used to filter, sort, group, and chart.

### Attachments and files

Drop files onto a task, upload them, link a URL, or import from a connected Google Drive. Attachments appear as chips on the task, in a preview modal, and in the project's **Files** tab. One attachment can be promoted to the task's cover image.

### Comments and activity

The bottom of the task pane has four tabs:

- **Comments** — rich-text comments with `@` mentions, emoji reactions, pinning, editing, and deletion. Mentioning someone notifies them and adds them as a follower.
- **Activity** — an automatic history: created, completed, assigned, due date changed, added to a project, subtask added, dependency added, field changed, attachment added, status update posted, and automation runs.
- **Time** — time entries logged against this task, plus a timer button in the pane header.
- **Expenses** — expenses charged to this task.

Time and expenses are covered in [Time and billing](/docs/tasklytic/time-and-billing).

## Project messages

The **Messages** tab is for broadcasts rather than task-level chatter: a title, rich-text body, attachments, and an audience of project members, the team, or the whole workspace. Messages support threaded replies and reactions, and can be pinned as announcements. Recipients get a **Project message** notification.

## Bulk edits and undo

Select several tasks in List view to get the bulk actions bar: complete, assign, set a due date, add to a project, move to a section, or delete. Task changes made this way can be reverted from the undo control that appears after the action.
