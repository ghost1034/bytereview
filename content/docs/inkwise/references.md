---
title: "References"
description: "Build the source library that grounds Inkwise: add references, let them process, edit citation metadata, and manage your sources."
order: 3
---

Your references are the sources Inkwise reads to ground its AI suggestions and citations. You build this library on the **References** page (`/dashboard/inkwise/references`), then bind the sources you need to a document in **Write** — see [Writing with AI](/docs/inkwise/writing-with-ai). This page covers adding and managing the library itself.

## Add references

Use the **References** panel at the top of the page to bring in sources:

- **Add Files** — upload one or more files from your computer.
- **Add Folder** — upload a whole folder at once.
- **Capture Webpage** — type a URL (for example, `example.com/reference`) and click **Capture Webpage** to store a snapshot of the page.
- **Google Drive** — pick files directly from Google Drive. (Requires the Google Drive connection.)

Supported file types are **PDF**, **DOCX**, **ZIP** (unpacked automatically), and images (**JPG/JPEG**, **PNG**). On the **Pro plan** you can also add audio (**MP3**, **WAV**) and video (**MP4**, **MPEG**).

> **Note:** Audio and video references require the **Pro plan**. The page tells you so directly when your plan doesn't include them.

## How a reference becomes ready

Adding a reference kicks off three stages, summarized in the cards on the page:

1. **Add References** — upload, capture, or import the material.
2. **Wait For Ingestion** — Inkwise processes the file so it can support grounded writing. This happens automatically; you don't need to do anything.
3. **Bind In Write** — once a reference is ready, bind it to a document so chat, inline tools, and predictions can use it.

While a reference processes, its card shows a live status. The status label tells you what each state means:

| Status | What it means |
| --- | --- |
| **Uploading** | The file is still being sent. |
| **Queued for ingestion** | Waiting to be processed. |
| **Preparing for grounding** | Being processed now. |
| **Ready for binding** | Done — the reference can be bound and used to ground the AI. |
| **Needs attention** | Processing failed; the card shows the reason. |

The page refreshes these statuses on its own while anything is still processing.

> **Tip:** A reference must reach **Ready for binding** before it can ground predictions, writing tools, or chat. If one is stuck or failed, use **Re-ingest** to process it again.

## Search and browse the library

The **Source Library** lists every reference. Use the search box to filter by **title, path, URL, filename, or status**. Each card shows the reference's type (pdf, docx, image, audio, video, zip, or webpage), its raw and friendly status, its path or filename and size, when it was last updated, and how many pages were processed.

## Edit citation metadata

Accurate citations depend on accurate source details. Click **Metadata** on a reference to open **Edit Bibliographic Metadata**, where you can set:

- **Source title**, **Citation type** (Other, Book, Article, Case, Statute, Webpage, Report), **Year**, and **Authors** (one per line).
- **Short title**, **Container title**, **Publisher**, and **URL**.
- Legal-citation fields: **Court**, **Reporter**, **Reporter volume**, **First page**, **Pin cite**, and **Docket number**.

Click **Save metadata** to apply.

> **Note:** Updating a reference's metadata automatically refreshes the citations in any documents that already use it.

## Manage a source

Each reference card has four actions:

- **Preview** — open the source (or its processed PDF) in a new tab.
- **Re-ingest** — process the reference again, rebuilding the data used for grounding. Useful if a reference failed or you want to refresh it.
- **Metadata** — edit its citation details (above).
- **Remove** — delete the reference from your library.

When you're ready to put these sources to work, head to [Writing with AI](/docs/inkwise/writing-with-ai) to bind them to a document.
