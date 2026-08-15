---
title: "Tracking and Exports"
description: "Follow progress across the firm, then export the Excel tracker or a zipped evidence package with checksums and an audit trail."
order: 7
---

## Firm-wide tracking

The PBC workspace summarizes everything that is not archived:

| Tile | Counts |
| --- | --- |
| **Active engagements** | Published engagements still in progress. |
| **Awaiting review** | Requests a client has submitted that nobody has accepted or returned yet. |
| **Overdue requests** | Requests past their due date that are not accepted or waived. |
| **Accepted evidence** | Requests accepted across the firm. |

Below the tiles, each engagement shows its completion percentage and request count. Completion is the share of requests that are **accepted or waived** — a submitted request that has not been reviewed does not count yet. The portal shows the client a slightly different number, which also counts what they have submitted.

## Excel tracker

**Tracker** downloads a `.xlsx` workbook of the engagement with four sheets:

| Sheet | Contents |
| --- | --- |
| **Summary** | Engagement name, client, period end, total requests, accepted plus waived, and completion percentage. |
| **Status** | One row per request: number, category, title, description, owner, due date, period end, priority, expected filename and formats, GL account and balance, sensitive and redaction flags, dependencies, external source ID, status, available file count, and last update. |
| **Overdue** | The same columns, filtered to requests past due that are not accepted or waived. |
| **Audit Trail** | Every recorded event for the engagement, in order. |

This is the file to share with an engagement partner or attach to a workpaper — it needs no access to CPAAutomation.

## Evidence package

**Package** downloads a `.zip` built for handoff and archiving:

```
pbc_readiness.xlsx                     the tracker above
index.csv                              manifest: request, status, filename, version, SHA-256 checksum
evidence/<category>/<number>/v<n>_<filename>
README.txt
```

Waived requests are excluded. Requests with no evidence still appear in `index.csv` with an empty filename, so the gaps are visible. Every file carries its SHA-256 checksum, letting anyone confirm later that a document has not changed.

The package is generated on the spot, so it is capped at 1 GB of evidence. Larger engagements can be exported by category using the tracker plus targeted downloads.

## Audit trail

PBC records an event for everything that matters, with who did it and when:

- engagement created, updated, published, completed, and archived;
- requests created, updated, deleted, and every status transition with its reason;
- documents uploaded, including the version and whether the firm or the client uploaded them;
- comments added, with their visibility;
- contacts assigned and removed, access links created, and portal sessions started;
- request lists imported and packages exported.

Actions taken by a client in the portal are attributed to their contact record, not to a firm user. The full trail is in the **Audit Trail** sheet of the tracker and in the evidence package.

Continue to [Settings and reminders](/docs/prepared-by-client/settings-and-reminders).
