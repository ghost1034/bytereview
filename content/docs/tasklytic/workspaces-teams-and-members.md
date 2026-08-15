---
title: "Workspaces, teams, and members"
description: "Set up a Tasklytic workspace, organize people into teams, invite colleagues, assign roles and capabilities, and configure workspace settings."
order: 2
---

A **workspace** is the container for everything in Tasklytic — projects, tasks, goals, clients, and billing all belong to one. Inside it, **teams** group people and own projects, and **members** hold roles that decide what they can do. This page is mostly for admins.

## Switching and creating workspaces

The workspace switcher sits at the top of the Tasklytic navigator. It lists every workspace you belong to and lets you create a new one. Switching workspaces changes the whole module: the URL becomes `/dashboard/project-management/w/<workspace>/…` and all sidebar content reloads for that workspace.

New workspaces start with the setup wizard described in [First run](#first-run-and-starter-content).

## Teams

Open **Teams** in the navigator. Each team card shows its privacy, member count, and a join action.

| Privacy | Who can see it | How people join |
| --- | --- | --- |
| **Public** | Everyone in the workspace | Anyone can click **Join** |
| **Private** | Everyone in the workspace | Click **Request to join**; a team or workspace admin approves |
| **Secret** | Members only | Invitation by a team admin |

Join requests for private teams can be approved automatically — turn on that behavior in the team's settings. Pending requests appear for admins on the team page and as **Team requests** notifications in the inbox.

A team page has three tabs:

- **Overview** — members and recent activity.
- **Projects** — every project owned by the team, including pinned ones.
- **Settings** — name, icon, description, privacy, admins, and join-request handling.

Every project belongs to exactly one team. That team plus the project's own privacy setting determine who can see the work — see [Projects and tasks](/docs/tasklytic/projects-and-tasks).

## Inviting people

Click **Invite** in the navigator footer, or open **Settings → Members** and invite from there. In the dialog:

1. Enter one or more **email addresses**, separated by commas or new lines.
2. Choose the **role** the invitees should receive — admin, member, or guest.
3. Optionally add them straight to a **team** and include a **note** in the invitation.
4. Click **Send invites**.

Each recipient gets its own result line: **Email sent** when delivery succeeded, or **Queued locally** when the workspace has no mail delivery connected yet. Invitations expire, and admins can revoke a pending one from the members table.

Invited people accept from the link in the invitation, which lands them on the accept-invite page and drops them into the workspace.

## Roles and capabilities

Roles are set per workspace and changed from the members table.

| Role | Can view | Can edit work | Can administer |
| --- | --- | --- | --- |
| **Admin** | Yes | Yes | Yes — settings, members, roles, billing |
| **Member** | Yes | Yes | No |
| **Guest** | Yes | No | No |

On top of the role, admins grant capabilities to individual members for professional-services work:

| Capability | Unlocks |
| --- | --- |
| **Submit** | Submitting time entries, timesheets, and expense reports |
| **Approve** | Approving or rejecting submitted time and expenses |
| **Billing** | Generating invoices, locking timesheets, write-offs, reimbursements |
| **Record payments** | Recording and reversing payments against invoices |
| **Trust** | Recording trust deposits, withdrawals, and applications |
| **Manage rates** | Editing billing rates, rate cards, activity codes, and budgets |

Admins hold every capability implicitly. Approvers can also be assigned by routing — see [Time and billing](/docs/tasklytic/time-and-billing).

## The members table

**Settings → Members** lists everyone in the workspace alongside pending invitations. From here you can change a member's role, remove members, and revoke invitations. The same table appears under **Settings → Workspace → Members**.

Selecting a person's name opens their profile page, which shows their work across the workspace.

## Workspace settings

**Settings** in the section bar is the hub. It links to:

| Page | What it covers |
| --- | --- |
| **Workspace** | Name, domain, icon, members, plan and seats, security, and the danger zone |
| **Members** | Roles, removals, and invitations |
| **Field library** | Workspace-wide custom fields — see [Projects and tasks](/docs/tasklytic/projects-and-tasks) |
| **Forms** | Intake forms — see [Forms and rules](/docs/tasklytic/forms-and-rules) |
| **Billing controls** | Rates, rate cards, activity codes, invoicing, budgets, and FX |
| **Approvals** | Time and expense approval policy and routing |
| **AI teammates** | Scheduled AI jobs — see [AI assistant](/docs/tasklytic/ai-assistant) |
| **Integrations** | Status of connected providers |
| **Billing inquiries** | Upgrade and payment contact requests raised from the plan page |

### Workspace tab

- **General** — rename the workspace, set an informational domain, pick an icon emoji, and (for admins) delete the workspace after typing its name to confirm.
- **Members** — the members table.
- **Billing** — current plan tier, seat usage against the seat limit, renewal date, and buttons to request an upgrade or a payment-method change. Those requests land in **Billing inquiries** for follow-up.
- **Security** — **Allow public form sharing**. When it's off, published intake forms require workspace sign-in instead of being open to the public.

### Integrations

**Settings → Integrations** reports the live status of each supported provider: Google Drive import, Vertex receipt extraction, Gmail delivery, private GCS storage, and Stripe Connect client payments. Each shows **Available**, **Reconnect required**, or **Not enabled**, plus the last error if one occurred. Google connections are managed in the main CPAAutomation integrations page.

> **Note:** Workspace-plan billing (your CPAAutomation subscription) is separate from client-payment integrations. Plan changes live under **Workspace → Billing**.

## First run and starter content

A new workspace opens a five-step setup wizard: **Welcome → About your team → Pick templates → Invite teammates → Finish**. It's skippable and resumable, and on finish it provisions the starter projects you selected. Replay it any time from **Settings → Onboarding**.

Two more aids sit alongside it:

- **Product tour** — a guided, route-aware walkthrough covering the shell, projects, tasks, automation, planning, reporting, and the professional-services pages. Start it from **Help** in the navigator footer.
- **Home checklist** — inline prompts on the workspace home page for creating a project, adding a task, and inviting teammates.

Admins can also reset a workspace's contents from **Settings → Workspace**, which clears work data so you can start clean.
