---
title: "Forms and rules"
description: "Collect work through intake forms that create tasks, and automate the routine steps with trigger-condition-action rules."
order: 6
---

Two features handle work that arrives on its own schedule: **forms** turn requests from clients or colleagues into tasks, and **rules** do the routine follow-up so nobody has to remember it.

## Intake forms

Open **Forms** from the section bar. Each form belongs to a project — a submission creates a task in that project.

### Building a form

Select a form to open the editor, which has a **Builder** tab and a **Submissions** tab.

Add questions from the field palette:

| Field type | Notes |
| --- | --- |
| **Short text** / **Long text** | With optional placeholder |
| **Number** | Numeric answers |
| **Date** | Date picker |
| **Single select** / **Multi select** | Color-coded options |
| **Attachment** | File upload from the submitter |

Every field can be marked **required**, and any field can be shown conditionally based on an earlier answer — for example, only ask for a filing deadline when the request type is "Tax return".

### Configuring what happens on submit

The configuration panel beside the builder controls:

- **Name** and **description** shown to submitters.
- **Target project**, **default section**, and **default assignee** for created tasks.
- **Task title field** — which answer becomes the task name.
- **Copy answers to task description** — write the full submission into the task body.
- **Confirmation message** shown after a successful submit.
- **Cover image** and **logo** for branding the public page.

### Publishing and sharing

Toggle **Published** to make the form live, then choose who can submit:

| Access | Who can submit |
| --- | --- |
| **Anyone with the link** | Public — no account required |
| **Workspace members only** | Requires signing in to your workspace |

The share URL is `/project-management/forms/<form-id>`; copy it from the form's entry in the list. Public form pages are excluded from search-engine indexing.

> **Note:** An admin can switch off **Allow public form sharing** under **Settings → Workspace → Security**. When it's off, every published form requires workspace sign-in regardless of its own setting.

### Submissions

The **Submissions** tab lists every response with its answers and a link to the task it created. Each submission also raises a **Form submission** notification, and can trigger rules.

## Rules

Rules run automatically inside a project. Open **Rules** from the command palette or `/w/<workspace>/rules`, and filter the list by project.

A rule is a **trigger**, optional **conditions**, and one or more **actions**.

### Triggers

| Trigger | Fires when |
| --- | --- |
| **Task added to project** | Any new task lands in the project |
| **Task moved to section** | A task enters a chosen section |
| **Task completed** | A task is marked complete |
| **Task due in N days** | Checked on a daily schedule |
| **Custom field changed** | A field changes, optionally to a specific value |
| **Form submitted** | A chosen intake form receives a response |

### Actions

| Action | Effect |
| --- | --- |
| **Assign to** | Set the assignee |
| **Set due in N days** | Schedule relative to the trigger |
| **Move to section** | Reposition within the project |
| **Add to project** | Also file the task elsewhere |
| **Set custom field** | Write a field value |
| **Add collaborator** | Add a follower |
| **Send notification** | Message someone in their inbox |
| **Create subtask** | Add a named subtask |
| **Send email** | Email the assignee or a chosen person |

Conditions narrow when the actions run — for example, only for tasks where a priority field equals *High*.

### Building and checking rules

- **Rule library** offers ready-made starting points: triage incoming requests, daily due reminders, move completed tasks to Done, an approval hand-off, round-robin assignment, and an at-risk status alert.
- **Test** runs a rule against a task you choose so you can see what it would do before enabling it.
- **History** shows past runs, and each rule tracks its run count and last run time.
- Rules can be enabled, disabled, duplicated, and deleted at any time.

Actions taken by a rule are recorded in the affected task's activity feed and can notify people through **Automations** in the inbox.

Rules can also arrive packaged with a [bundle or project template](/docs/tasklytic/templates), which keeps a standard workflow consistent across every project that uses it.
