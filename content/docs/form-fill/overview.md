---
title: "Overview"
description: "What Form Fill is, how source, target, and output fit together, and how to fill your first form."
order: 1
---

Form Fill takes information you already have — spreadsheets, extracted data, or other documents — and uses AI to fill out a PDF or DOCX form for you. Point it at your data, choose the form to fill, and download a finished document in seconds, with no manual copying and pasting.

## What you can do

- **Fill PDF and DOCX forms automatically** — give Form Fill your data and a target form, and the AI maps each value into the right place.
- **Fill from files or extracted data** — use uploaded spreadsheets and documents, or send in results straight from a [Universal Document Analysis](/docs/universal-document-analysis/overview) extraction job.
- **Batch-fill many documents at once** — produce one filled form per source file, or one per row of a spreadsheet.
- **Reuse your forms** — save a target as a template so you can fill it again later without re-uploading.

## How the pieces fit together

A Form Fill run is built from three choices you make on the page, top to bottom:

| Step | What it is |
| --- | --- |
| **Source** | The information used to fill the form — uploaded files or extraction results. |
| **Target** | The PDF or DOCX form to fill — an uploaded file or a saved template. |
| **Output** | The format of the finished document and how many documents to produce. |

Pick a source, pick a target, set the output options, and click **Run Form Fill**. The AI works in the background and hands back a finished document (or a ZIP of documents) to download.

## Where to find it

Form Fill lives in the left sidebar under **Form Fill** (`/dashboard/form-fill`). Everything — source, target, output, run status, and your recent runs — is on that one page.

## Supported files and limits

You can fill from these **source** types (the data to fill *from*):

| Type | Notes |
| --- | --- |
| CSV | Spreadsheet rows — required for *Fill once per row*. |
| XLSX (Excel) | Spreadsheet rows — required for *Fill once per row*. |
| PDF | Read for supporting information. |
| DOCX (Word) | Read for supporting information. |

You can fill into these **target** types (the form to fill *into*):

| Type | Output formats |
| --- | --- |
| PDF | PDF |
| DOCX (Word) | DOCX or PDF |

> **Note:** You can add up to **100 source files**, totaling **1000 MB**. A PDF target always produces a PDF; a DOCX target can be filled and saved as either DOCX or PDF.

> **Scanned PDFs:** Scanned or image-only PDFs work as both sources and targets. When a target form is a scan, Form Fill first adds an invisible OCR text layer so values can be placed accurately; the run's warnings note when this happened. Very low-quality scans that OCR cannot read are rejected with a clear error instead of producing a badly filled form.

## Fill your first form in four steps

1. Go to **Form Fill** (`/dashboard/form-fill`) and, under **Source**, click **Choose files** to upload your data.
2. Under **Target**, upload the PDF or DOCX form you want filled.
3. Under **Output**, pick the output format and a fill mode.
4. Click **Run Form Fill**, then download the finished document when the run completes.

For the full walkthrough, continue to [Filling a Form](/docs/form-fill/filling-a-form).
