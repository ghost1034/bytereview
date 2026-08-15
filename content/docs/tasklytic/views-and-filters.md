---
title: "Views and filters"
description: "List, Board, Calendar, Timeline, and Gantt views, plus the shared filter, sort, group, and saved-view controls and workspace search."
order: 4
---

Every project holds one set of tasks and offers several ways to look at them. The filter, sort, and group controls are the same in each view, so a habit you build in List works everywhere.

## The five views

| View | Best for |
| --- | --- |
| **List** | A dense spreadsheet-style grid — the default for most projects |
| **Board** | Kanban columns, one per section, with drag-and-drop |
| **Calendar** | Month or week layout of dated work |
| **Timeline** | Bars across time, grouped how you choose |
| **Gantt** | Timeline plus dependency arrows and critical path |

Which views a project offers is set when it's created and can be changed in project settings, along with which one opens by default.

### List

Rows show the task name plus whichever columns you leave visible. You can:

- Add tasks inline with the new-task row, at the end of any section.
- Drag rows to reorder them or move them between sections.
- Select rows for the bulk actions bar — complete, assign, set due date, add to project, move section, delete.
- Show or hide columns from **Customize**: assignee, due date, start date, tags, projects, created, and modified, plus any custom field.

Long lists are virtualized, so large projects stay responsive.

### Board

Each section becomes a column; drag cards between them to move work. The board toolbar adds:

- **Density** — compact or comfortable cards.
- **Swimlanes by assignee** — split the board into a row per person.

A section with a **WIP limit** flags its column when the limit is exceeded.

### Calendar

Switch between **Month** and **Week**, jump with **Today** and the arrows, and toggle weekends on or off. Drag a task to a different day to reschedule it, and use a day's quick-add to create work directly on a date. Undated tasks sit in the **Unscheduled** drawer — drag them onto the calendar to give them dates.

### Timeline and Gantt

Both views draw tasks as bars you can drag to move and resize; Gantt adds dependency arrows between them. The toolbar controls:

| Control | Options |
| --- | --- |
| **Zoom** | In and out across day-to-quarter scales |
| **Rows by** | Flat list, section, assignee, or tag |
| **Color by** | Section, assignee, tag, or priority |
| **Auto-shift when dragging** | Moving a predecessor later drags its dependents along; switching it on runs a one-time alignment pass |
| **Highlight critical path** | Emphasizes the chain that determines the finish date |

Milestones appear as diamonds on their date.

## Filtering, sorting, and grouping

The toolbar above every view carries the same controls.

- **Search** — filter by text within the view. Press `/` to jump into the box.
- **Filter** — build conditions on any built-in or custom field, combined with and/or groups. The button shows how many conditions are active.
- **Sort** — due date, start date, alphabetical, created, modified, likes, subtask progress, or any custom field, ascending or descending.
- **Group by** — none, section, assignee, due date, completion, tag, project, priority, status, or a custom field.
- **Show completed** — include or hide finished tasks.
- **Customize** — density and column visibility.
- **Reset** — returns everything except the search text to defaults; it appears only once you've changed something.

Quick-filter chips cover the common cases: **Just my tasks**, **Due this week**, **Overdue**, **Incomplete only**, and **Completed only**.

## Saved views

Once a view is filtered the way you like, open **Saved views → Save current view…** and name it. Saved views remember the filters, sort, grouping, and hidden fields for that project and view type.

From the same menu you can load, rename, delete, or set a saved view as the project's default.

## Workspace search

**My Searches** in the navigator (`/w/<workspace>/my-searches`) searches the whole workspace rather than one project. It uses the same toolbar, plus:

- **Result tabs** — Tasks, Projects, Goals, and People, each with a live count.
- **Result layouts** — list, board, or chart.
- **Include archived** — bring archived projects into the results.
- **Save this search** — saved searches can be pinned into the navigator, where they show a live count, and can be kept personal or shared with the workspace.

Task search also matches comment text, and results show a snippet of the matching passage.

## Command palette

Press `⌘K` (or use the top-bar search) anywhere in Tasklytic for the command palette. It groups results into **Pages**, **Projects**, **Tasks**, **Goals**, **People**, **Create** actions, and **CPAAutomation destinations** for jumping out to other products. With an empty query it shows recent and suggested destinations.
