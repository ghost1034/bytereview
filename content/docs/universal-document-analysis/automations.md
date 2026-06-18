---
title: "Automations"
description: "Run an extraction job automatically whenever a matching email arrives, with results delivered to Google Drive."
order: 5
---

An automation runs an extraction job for you whenever a matching email arrives at `document@cpaautomation.ai`. Forward an invoice, statement, or report to that address and the attachments are extracted automatically — and optionally exported to Google Drive — with no manual steps. Manage automations from **Automations** in the sidebar (`/dashboard/automations`).

## Before you start

An automation runs an existing job, so set those up first:

1. **Create an extraction job** and **configure its fields**. See [Extraction Jobs](/docs/universal-document-analysis/extraction-jobs). Jobs without configured fields can't be selected in an automation.
2. (Optional) **Connect Google Drive** if you want results exported there automatically. See [Integrations](/docs/universal-document-analysis/integrations).

## Create an automation

On the Automations page, click **New automation** and fill in the form.

### Name and trigger

- **Automation Name** — a label for this workflow (e.g., "Process Invoice Attachments").
- **Trigger Type** — **Email (document@cpaautomation.ai)**. This is the available trigger today; Google Drive, Outlook, OneDrive, and SharePoint triggers are marked *Coming Soon*.
- **Extraction Job** — the job whose fields will be used to process incoming attachments.
- **Enable automation immediately** — toggle on to start it right away, or off to set it up now and enable later.

### Email filters

Filters decide which emails trigger the automation. Enter a query using email filter syntax in the **Email Filters Setup** box. **Quick Templates** buttons fill in common queries for you.

> **Note:** Sender filtering is automatic — the system only processes emails sent from your account's email address, so your filters just need to narrow down *which* of your emails qualify.

Filter syntax you can use:

| Syntax | Meaning |
| --- | --- |
| `term1 term2` | Match both terms (AND). |
| `term1 OR term2` | Match either term. |
| `"exact phrase"` | Match an exact phrase. |
| `-term` | Exclude a term (NOT). |
| `( ... )` | Group terms together. |
| `filename:pdf`, `subject:invoice`, `from:user@domain` | Match a specific part of the email. |
| `newer_than:7d`, `older_than:30d`, `in:inbox`, `-in:spam` | Filter by age or location. |

Examples:

- `has:attachment` — any email that has attachments.
- `subject:invoice has:attachment` — attachments where the subject contains "invoice".
- `has:attachment (filename:pdf OR filename:docx OR filename:pptx OR filename:xlsx)` — only supported document attachments.

### Choose the job and processing

- **Processing Mode** — **Individual** processes each attached file separately; **Combined** processes all attachments together as one document.
- **Append results to previous run** — when on, each automation run adds to the job's existing results instead of starting a fresh set. (See [runs and appending](/docs/universal-document-analysis/extraction-jobs#runs-and-appending-results).)

### Export destination

Under **Export Results**, choose where results go:

- **No automatic export** — results stay in the job for you to review.
- **Google Drive** — export automatically. Pick a **destination folder** (or leave it on My Drive) and a **file format**, CSV or Excel (.xlsx). This requires the Google Drive integration to be connected.

> **Note:** Email, Outlook, OneDrive, and SharePoint export destinations are marked *Coming Soon* and aren't available yet. Google Drive is the supported automatic export today.

Click **Create Automation** to save.

## Enable, edit, or delete

Each automation in the list shows its name, whether it's **Enabled** or **Disabled**, and its trigger query. From there you can:

- **Pause / Resume** to disable or re-enable it.
- **Edit** to change its settings.
- **Delete** to remove it.

## Monitor automation runs

Click **View runs** on an automation to see its history. Each run shows its **status** (pending, running, completed, or failed), when it was triggered and completed, how many attachments were imported and processed, and any error message if something went wrong.

> **Tip:** If a run shows zero imports, check that the email was sent from your account's address and that your filter actually matches it.

## Plan limits

The number of automations you can enable depends on your plan, along with a monthly page allowance:

| Plan | Automations | Pages per month |
| --- | --- | --- |
| Free | 1 | 100 |
| Basic | 5 | 500 |
| Pro | 25 | 5,000 |

If you reach your automation limit, disable or delete one before enabling another, or upgrade your plan. Check your billing settings for current limits and pricing.
