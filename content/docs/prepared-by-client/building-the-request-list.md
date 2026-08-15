---
title: "Building the Request List"
description: "Add requests by hand, import a spreadsheet, or draft with AI — and configure exactly what evidence each request expects."
order: 3
---

The request list is the heart of an engagement. Each request tells the client what to provide, tells your team who owns it, and records what arrived.

## Add a request

Click **Request** above the list. The editor is grouped into three sections.

### Request details

| Field | Notes |
| --- | --- |
| **Request number** | Leave blank on a new request and PBC assigns the next free `PBC-001`, `PBC-002`, … Numbers must be unique within the engagement. |
| **List position** | Where the request sits in the list. Changing it renumbers the positions around it. |
| **Title** | What you need, in one line. Up to 500 characters. |
| **Description / client instructions** | The long form: scope, cut-off, how to prepare the file. Shown to the client above the upload area. |
| **Category** | Groups the request, for example `Cash` or `Fixed assets`. Also used to organize the [evidence package](/docs/prepared-by-client/tracking-and-exports). |
| **Priority** | Low, Normal, High, or Urgent. |
| **Due date** | Drives reminders and the overdue counts. Defaults to the engagement's due date. |
| **Period end** | The period the evidence should cover, if it differs from the engagement. |
| **Internal owner** | The firm member responsible. Required before the engagement can be published; defaults to you. |

### Evidence expectations

These are shown to the client before they upload.

| Field | Effect |
| --- | --- |
| **Expected filename** | A suggested name, for example `bank_reconciliation_2026.xlsx`. Not enforced. |
| **Expected formats** | Comma-separated extensions (`xlsx, csv, pdf`). The portal's file picker filters to these, and the completeness check flags evidence that does not match. |
| **GL account** / **Expected GL balance** | Reference values shown to the client and included in the tracker export. |
| **Sensitive evidence** | Flags the request for heightened handling on your side. |
| **Redaction required** | Shows the client a warning to remove protected or unnecessary personal information before uploading. |

### Dependencies and source tracking

- **Depends on** — pick other requests that should be completed first. The portal shows them to the client as *Complete first*. A request cannot depend on itself.
- **External source ID** — an identifier from a source system or another auditor's list. Used to skip duplicates on re-import.

## Import a spreadsheet

Click **Import** and choose a `.csv` or `.xlsx` file. Import is only available while the engagement is a **draft**.

PBC reads the first sheet, shows how many rows it parsed, and asks you to confirm before anything is created. Files can be up to 10 MB, and the first 5,000 rows are imported.

Column headers are matched case-insensitively, with spaces treated as underscores. Several common headings are mapped for you:

| Your column | Maps to |
| --- | --- |
| `Description`, `Request`, `Title` | Request title |
| `Request description`, `Details`, `Instructions` | Client instructions |
| `Request ID`, `Number` | Request number |
| `Due` | Due date |
| `Format`, `Expected format` | Expected formats |
| `Source ID` | External source ID |
| `Redaction required` | Requires redaction |

`Category`, `Owner`, `Priority`, `Period end`, `Expected filename`, `GL account`, `GL balance`, and `Sensitive` are read directly.

- Every row needs a title. A row without one stops the import and names the offending row.
- Dates must be real Excel dates or `YYYY-MM-DD` text.
- Yes/no columns accept `true`/`false`, `yes`/`no`, `y`/`n`, and `1`/`0`.
- Multiple formats can be separated by commas, semicolons, or slashes.
- **Owner** is matched against your firm members by display name or email. No match means the request is assigned to you.
- Rows without a due date inherit the engagement's default due date.
- A row whose **external source ID** already exists in the engagement is skipped, so you can re-import a corrected list. A duplicate **request number**, on the other hand, stops the import.

## Draft with AI

**Draft with AI** proposes a starting request list from the engagement's metadata (client, type, period, due date) and your firm's templates. It is available while the engagement is a draft.

You get a short summary plus up to 40 proposals, each with a title, category, instructions, priority, expected formats, and the reason it was suggested. Nothing is created until you click **Confirm and add** — which adds every proposal still in the list, using the engagement's due date.

AI cannot publish an engagement, contact a client, or see client documents; it works from engagement metadata and your templates only. Review each proposal before adding it, then edit owners, due dates, and expectations as usual. AI can make mistakes, so treat the output as a first pass, not a finished request list.

## Edit, reorder, and remove

Select a request and use **Edit all details** in the detail panel. You can edit a request while it is **draft**, **open**, or **needs changes**.

To reorder, change **List position** in the editor. To remove a request, use **Delete draft request** — available only when both the engagement and the request are still drafts. Once an engagement is published, waive the request instead so its history survives.

Continue to [Templates](/docs/prepared-by-client/templates).
