---
title: "Overview"
description: "What Prepared by Client does, how engagements and requests move from draft to accepted, and how to get started."
order: 1
---

Prepared by Client (PBC) replaces the request-list spreadsheet and the email chase. You build one request list per client and period, publish it, and your client responds in a secure portal — uploading evidence, asking questions, and submitting each item for review. Every upload is versioned, every message stays attached to its request, and every action is written to an audit trail you can export.

## What you can do

- **Build a request list** — add requests by hand, import a spreadsheet, start from a template, or ask AI for a first draft.
- **Set clear expectations** — expected filename, expected formats, GL account and balance, period end, priority, dependencies, and redaction instructions.
- **Share it securely** — invite client contacts, give each one access to all requests or just some, and send an expiring, one-time portal link.
- **Review as evidence arrives** — accept a submission, return it with a note, or waive the request entirely.
- **Keep the conversation in one place** — client-visible comments and internal-only notes on each request.
- **Track and hand off** — a dashboard of what is overdue or awaiting review, an Excel tracker, and a zipped evidence package with checksums.

## How the pieces fit together

| Concept | What it is |
| --- | --- |
| **Engagement** | One request list for one client and one period. Holds the requests, the client contacts, and the audit trail. |
| **Request** | A single item you need from the client: what to provide, who owns it internally, when it is due, and what evidence is acceptable. |
| **Contact** | A person at the client. Contacts belong to your firm (one per email address) and are given access per engagement. |
| **Evidence** | Files uploaded against a request. Every upload is a new version; nothing overwrites anything. |
| **Template** | A reusable request list you copy into new engagements. Your firm starts with a library of 17. |
| **Portal** | The accountless client workspace at `/pbc/access`, opened from a secure link or from a matching signed-in account. |

## How an engagement moves

| Status | What it means |
| --- | --- |
| **Draft** | You are still building. Requests can be added, edited, imported, and deleted. Clients cannot see anything. |
| **Active** | Published. Draft requests became **open**, contacts were emailed, and reminders start running. |
| **Completed** | Every request has been accepted or waived. The engagement is locked. |
| **Archived** | Closed out and hidden from the dashboard counts. |

Each request runs its own smaller cycle inside that:

| Status | Meaning |
| --- | --- |
| **Draft** | Created in an unpublished engagement. Not visible to the client. |
| **Open** | Live in the portal, waiting on the client. |
| **Submitted** | The client uploaded evidence and submitted it for review. |
| **Needs changes** | A reviewer returned it with a note. The client can upload again and resubmit. |
| **Accepted** | A reviewer accepted the evidence. |
| **Waived** | The firm decided the item is not required. |

Accepted and waived requests can be reopened, which puts them back to **open**.

## Where to find it

Open **PBC** in the CPAAutomation sidebar (`/dashboard/pbc`). The workspace page has:

| Area | What it contains |
| --- | --- |
| **Summary tiles** | Active engagements, requests awaiting review, overdue requests, and accepted evidence across your firm. |
| **Engagements** | Every request list in your firm, with completion percentage and request count. Searchable by client or engagement name. |
| **Engagements shared with you** | Appears only if your own signed-in email is also a client contact somewhere. See [Client access and the portal](/docs/prepared-by-client/client-access-and-the-portal). |
| **Templates / Settings** | Buttons at the top right for the [template library](/docs/prepared-by-client/templates) and [firm settings](/docs/prepared-by-client/settings-and-reminders). |

## Who can do what

PBC uses your firm's existing CPAAutomation role.

| Action | Admin | Manager | Analyst | Reviewer | Viewer |
| --- | --- | --- | --- | --- | --- |
| View engagements, run exports, check completeness | ✓ | ✓ | ✓ | ✓ | ✓ |
| Comment (client-visible or internal) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create engagements, add and edit requests, import, upload evidence, draft with AI | ✓ | ✓ | ✓ | | |
| Accept or return a submitted request | ✓ | ✓ | | ✓ | |
| Publish, complete, waive, reopen, manage contacts and links, manage templates | ✓ | ✓ | | | |
| Change PBC firm settings | ✓ | | | | |

## Get started

1. Click **New engagement**, pick the client, and choose a [template](/docs/prepared-by-client/templates) — or start blank.
2. [Build the request list](/docs/prepared-by-client/building-the-request-list): set owners, due dates, and what evidence you expect.
3. [Invite client contacts](/docs/prepared-by-client/client-access-and-the-portal) as coordinators or contributors.
4. Click **Publish**. Contacts are emailed and the requests go live in the portal.
5. [Review submissions](/docs/prepared-by-client/reviewing-evidence) as they arrive, then [export the tracker or evidence package](/docs/prepared-by-client/tracking-and-exports).

Continue to [Engagements](/docs/prepared-by-client/engagements).
