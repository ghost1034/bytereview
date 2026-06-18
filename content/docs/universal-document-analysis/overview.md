---
title: "Overview"
description: "What Universal Document Analysis is, how its pieces fit together, and how to run your first extraction."
order: 1
---

Universal Document Analysis turns your documents into structured, spreadsheet-ready data. Upload invoices, statements, contracts, or any other files, tell the AI which fields to pull out, and get back clean rows you can edit, download, or push to Google Drive — manually or on autopilot.

## What you can do

- **Extract data from documents** — point the AI at a file (or a whole folder) and pull out the exact fields you care about.
- **Reuse field setups** — save your field configurations as templates so every job starts in seconds.
- **Connect your tools** — link Google Drive to import files and export results, or use email to send documents in.
- **Automate the whole flow** — have a job run automatically whenever a matching email arrives, with results delivered to Google Drive.

## How the pieces fit together

Universal Document Analysis is built from four features that work together:

| Feature | What it does |
| --- | --- |
| **Extraction Jobs** | The core workflow: upload files, define fields, run the AI, and review results. |
| **Templates** | Reusable sets of fields you can apply to any job or automation. |
| **Integrations** | Connections to outside services — Google Drive for files, email for incoming documents. |
| **Automations** | Hands-off jobs that trigger automatically when a matching email arrives. |

A typical path: you build a **template** once, use it in an **extraction job**, connect **Google Drive** so results land where your team works, then set up an **automation** so future documents are processed without you lifting a finger.

## Where to find it

Everything lives in the left sidebar under **Universal Document Analysis**:

- **Jobs** — create and manage extraction jobs (`/dashboard/jobs`)
- **Templates** — build and manage reusable field sets (`/dashboard/templates`)
- **Integrations** — connect Google Drive and view the email address (`/dashboard/integrations`)
- **Automations** — set up email-triggered jobs (`/dashboard/automations`)

## Supported files and limits

You can extract from these file types:

| Type | Notes |
| --- | --- |
| PDF | Processed directly. |
| DOCX (Word) | Automatically converted to PDF before extraction. |
| PPTX (PowerPoint) | Automatically converted to PDF before extraction. |
| XLSX (Excel) | Spreadsheet data. |
| CSV | Comma-separated data. |
| ZIP | Automatically unpacked; the contents must be supported file types. |

> **Note:** Each file can be up to **50 MB**. Larger files are skipped during upload. To process many documents at once, put them in a ZIP archive or upload a folder.

Your monthly page allowance depends on your plan. See [Automations](/docs/universal-document-analysis/automations) for plan-based limits, or your billing settings for current details.

## Your first extraction in four steps

1. Go to **Jobs** and click **New job**.
2. **Upload** the documents you want to read.
3. **Configure the fields** you want extracted (or load a template).
4. **Review and start** — then watch the results come in.

For the full walkthrough, continue to [Extraction Jobs](/docs/universal-document-analysis/extraction-jobs).
