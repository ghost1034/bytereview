---
title: "Client Access and the Portal"
description: "Invite client contacts, control which requests they see, send secure portal links, and understand what the client experiences."
order: 5
---

Clients never need a CPAAutomation account. You invite them as **contacts**, and they work in a secure portal opened from an expiring link. Managing contacts and links requires an admin or manager role.

## Invite a contact

In the **Client access** panel at the bottom of the engagement, click **Invite contact** and enter a name, email address, and role.

| Role | Access |
| --- | --- |
| **Coordinator** | Every request in the engagement, including requests added later. Use this for the client's main point of contact. |
| **Contributor** | Only the requests you select. Pick at least one. Use this for a payroll manager, a controller, or anyone who should not see the whole list. |

Saving does three things: it creates (or reuses) the contact, sets their access on this engagement, and emails them a secure portal link. Contacts belong to your firm and are unique by email address, so inviting someone who already exists updates their name and reuses the record.

The panel shows each contact's role and how many of the engagement's requests they can see.

## Manage access and links

| Control | What it does |
| --- | --- |
| **Manage** | Change the contact's role, or adjust exactly which requests a contributor can see. |
| **Send new link** | Issues a fresh secure link and emails it to the contact. |
| **Copy new link** | Issues a fresh link and copies it to your clipboard, for sending through your own channel. |
| **Remove access** | Immediately revokes the contact's outstanding links and active portal sessions for this engagement, drops their request assignments, and cancels their pending notification emails. The contact record stays available for other engagements. |

Portal links expire after 7 days and can be used once — opening the link starts a session, after which the link itself is spent. Sessions last 12 hours. If a client says their link no longer works, send a new one; there is no penalty for issuing links freely.

Contacts can be invited before publishing, but portal links only work once the engagement is **active**. A client who opens a link too early is told the engagement has not been published yet.

## Clients who already have an account

If a client contact's email address also belongs to a verified CPAAutomation account, they do not need an email link at all. When they open **PBC** in their own sidebar, an **Engagements shared with you** panel lists the engagements where their verified email is a contact, and **View engagement** opens the portal directly.

This requires a verified email address on their account, and only shows active and completed engagements.

## What the client sees

The portal (`/pbc/access`) is branded with your firm's portal name and logo — see [Settings and reminders](/docs/prepared-by-client/settings-and-reminders). It shows overall progress, the list of requests they have access to, and a detail pane for the selected one:

- your instructions, the expected filename and formats, the period end, and any GL reference;
- **Complete first** — the requests this one depends on;
- a redaction warning when the request requires it;
- the reviewer's note when a request was returned;
- the evidence they have uploaded, with version numbers, downloadable at any time;
- the conversation, where they can ask a question or add context.

To respond, the client uploads a file and clicks **Submit for review**. Submission requires at least one successfully uploaded file. Uploading is possible while a request is **open** or **needs changes**; after submitting, the request is locked until a reviewer accepts it or returns it.

Uploads are limited to 100 MB per file and are stored as new versions — a re-upload never overwrites an earlier file. Executable and script file types are rejected, as are file types outside documents, spreadsheets, archives, text, and images.

Comments a client writes are always visible to your team. Internal notes your team writes are never shown in the portal.

Continue to [Reviewing evidence](/docs/prepared-by-client/reviewing-evidence).
