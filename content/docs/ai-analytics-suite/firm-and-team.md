---
title: "Firm & Team"
description: "Create or join a firm, manage members and roles, generate invitation codes, view the audit log, and export or purge firm data."
order: 2
---

Everything in the AI Analytics Suite belongs to a **firm** — a shared workspace your team works in together. Before you can open any Analytics module you set up a firm once; after that, you invite teammates and manage them from **Settings**.

## Create or join a firm

The first time you open any Analytics page, you'll land on **Welcome to CPA Analytics**. Choose one of two paths:

- **Create a new firm** — pick this if you're setting up a new organization. Enter a **Firm name** and click **Create firm**. You become the firm's first administrator.
- **Join an existing firm** — pick this if a teammate gave you an **invitation code**. Enter the code and click **Join firm**.

> **Note:** Invitation codes are short, single-use codes (for example, `A1B2C3`). They're not case-sensitive — the field upper-cases what you type automatically.

Once you belong to a firm, the Analytics modules unlock and the welcome screen no longer appears.

## Settings

Open **Settings** from the Analytics sidebar (`/dashboard/analytics/settings`) — *"Platform settings: manage firm membership, compliance controls, and the firm-wide audit log."* It has three tabs:

| Tab | What it covers |
| --- | --- |
| **Firm management** | Firm details, the invitation code, and who belongs to the firm. |
| **Compliance & security** | Export all firm data, or permanently purge the firm. |
| **Audit logger** | A firm-wide log of recent actions. |

## Firm management

This tab has two sections.

**Firm details** shows your **Firm name**, your **Firm ID**, and your **Invitation code**. Admins see a **Generate** button next to the code (it becomes **Regenerate** once a code exists); click the copy icon to copy the current code so you can share it with a new teammate.

**User management** lists everyone in the firm with the date they joined. Each person has a role.

### Roles

The suite uses two roles you can assign from the UI:

| Role | What they can do |
| --- | --- |
| **Admin** | Everything a User can do, **plus** manage the firm: generate/regenerate the invitation code, change members' roles, export firm data, and purge the firm. |
| **User** | Use all the analytics modules — create, edit, and run analyses — but cannot manage firm membership or settings. |

To change someone's role, an **Admin** uses the dropdown next to that member and selects **Admin** or **User**. You can't change your own role, and the role control only appears for admins.

> **Note:** The person who creates the firm starts as an Admin. Promote at least one teammate to Admin so the firm is never left without one.

## Compliance & security

Two firm-wide controls live here, both **Admin-only**:

- **Export all data** — downloads a complete copy of your firm's analytics data. Use it for backups or to hand off records.
- **Purge firm data** — permanently deletes the firm and everything in it. This is a multi-step confirmation because it can't be undone.

> **Warning:** Purging a firm is irreversible. Every client, analysis, reconciliation, schedule, and chat session is destroyed. Export first if you might need the data later.

## Audit logger

The **Audit logger** tab shows a firm-wide trail of recent actions — who did what and when — so you can review activity for compliance. The view loads the most recent entries; you can download the log for your records.

## Where to go next

With your firm set up, add the [clients](/docs/ai-analytics-suite/clients) you work with, then start your first [variance](/docs/ai-analytics-suite/variance) or [reconciliation](/docs/ai-analytics-suite/reconciliation).
