---
title: "Settings and Reminders"
description: "Brand the client portal, set your firm's timezone, and control when PBC chases outstanding requests."
order: 8
---

## Firm settings

Open **Settings** from the PBC workspace (`/dashboard/pbc/settings`). These settings apply to every PBC engagement in your firm, and only an admin can change them.

| Setting | Effect |
| --- | --- |
| **Portal name** | The name shown in the client portal header. Defaults to your firm's name. |
| **Logo URL** | An image shown beside the portal name. Leave it blank for the default mark. |
| **Firm timezone** | An IANA timezone such as `America/Los_Angeles` or `America/New_York`. Determines what "today" means when reminders are calculated. |
| **Remind before due date** | How many days ahead of the due date the first reminder goes out. `0` disables the advance reminder. |
| **Overdue reminder interval** | How many days between overdue reminders. |

## Reminder emails

PBC checks hourly and emails the client about outstanding requests. A request is eligible when its engagement is **active**, the request is **open** or **needs changes**, and it has a due date.

| Reminder | When |
| --- | --- |
| **Due soon** | Exactly *Remind before due date* days before the due date. |
| **Due today** | On the due date. |
| **Overdue** | After the due date, every *Overdue reminder interval* days. |

Reminders go to the contacts assigned to that specific request. If the request has no assigned contributors, they go to the engagement's coordinators instead. Each contact receives a given reminder once, so a retry or a second check never produces duplicates.

Reminders stop by themselves when the request is submitted, accepted, or waived, and when the engagement is completed or archived.

## Other emails

Alongside reminders, PBC sends:

| Email | Trigger |
| --- | --- |
| **Secure PBC request** | You invite a contact, or send them a new access link. Contains the expiring portal link. |
| **PBC request list is ready** | The engagement is published. Goes to every assigned contact. |
| **Changes requested** | A reviewer returns a submitted request. Includes the reviewer's note. |
| **New PBC message** | Someone at the firm posts a client-visible comment. |

Notification emails point the client back to their most recent secure link rather than embedding a new one. If a link has expired, use **Send new link** in the engagement's **Client access** panel — see [Client access and the portal](/docs/prepared-by-client/client-access-and-the-portal).

Delivery failures are retried automatically with an increasing delay, so a temporary problem at the recipient's mail provider does not silently drop a notification.

## Session and upload housekeeping

The same hourly job that queues reminders also tidies up:

- portal sessions past their 12-hour lifetime are revoked;
- uploads that were started but never finished are marked abandoned after 24 hours.

Neither affects evidence a client successfully uploaded.
