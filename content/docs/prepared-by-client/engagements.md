---
title: "Engagements"
description: "Create a PBC engagement for a client and period, publish it to the portal, and close it out when every request is resolved."
order: 2
---

An engagement is one request list for one client and one period. Everything else in PBC — requests, contacts, evidence, comments, the audit trail — hangs off it.

## Create an engagement

From the PBC workspace, click **New engagement**.

| Field | Notes |
| --- | --- |
| **Engagement name** | How the engagement appears to your team and in the portal, for example `2026 Financial Statement Audit`. |
| **Client** | One of your firm's clients. Use **Add a new client** to create one first; you return to PBC afterwards. |
| **Request-list template** | Copies a template's requests into the new engagement, or choose **Blank engagement**. The engagement type (audit, tax, bookkeeping, advisory, other) comes from the template you pick. |
| **Linked project management project** | Optional. Shown only when you belong to a Tasklytic workspace with projects you can access. Adds an **Open linked project** shortcut to the engagement. |
| **Period end** | The period the evidence relates to. Copied onto template requests that do not set their own. |
| **Default due date** | Applied to every request that does not have its own due date, including imported and AI-drafted ones. |

The engagement is created as a **draft** and opens immediately. You are set as its owner and as the default internal owner of the copied requests.

## The engagement workspace

The engagement page is split into three parts:

- **Header** — status badge, client, period end, due date, completion percentage, and the action buttons (**Check completeness**, **Draft with AI**, **Tracker**, **Package**, **Publish** or **Complete**).
- **Request list** — every request with its number, owner, due date, status, and file count. Overdue dates are shown in red. Select a row to open it.
- **Detail panel** — the selected request's instructions, configured expectations, evidence versions, conversation, and review actions.

Below that sits **Client access**, where you invite contacts and manage who can see which requests.

## Publish

Publishing turns a draft into an **active** engagement: every draft request becomes **open**, the portal starts working, reminders begin, and each assigned contact is emailed that the request list is ready.

Before it will publish, the engagement needs:

- at least one request;
- at least one client contact assigned to the engagement;
- a title, an internal owner, and a due date on every request;
- a recipient for every request — either a coordinator on the engagement, or a contributor assigned to that specific request.

If something is missing, PBC lists the request numbers that need attention. Fix them and publish again.

After publishing you can still add and edit requests. New requests created in an active engagement go straight to **open**, so a coordinator (or an assigned contributor) sees them the next time they open the portal.

## Complete

Click **Complete** once every request is **accepted** or **waived**. If anything is still outstanding, PBC tells you and nothing changes.

A completed engagement is locked: requests can no longer be created or edited. Existing portal links keep working for contacts, so the client can still see and download what they provided.

## Locking rules worth knowing

- Requests in a **completed** or **archived** engagement cannot be edited.
- **Accepted** and **waived** requests cannot be edited until they are reopened.
- Requests can only be deleted while both the engagement and the request are still drafts. After publishing, waive the request instead so the history is preserved — see [Reviewing evidence](/docs/prepared-by-client/reviewing-evidence).
- If a teammate changed the same engagement or request while you had it open, you will see *"changed; refresh and try again"*. Reload and reapply your edit.

Continue to [Building the request list](/docs/prepared-by-client/building-the-request-list).
