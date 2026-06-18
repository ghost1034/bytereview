---
title: "Using Extraction Results"
description: "Send results from a Universal Document Analysis extraction job straight into Form Fill."
order: 4
---

Form Fill connects directly to [Universal Document Analysis](/docs/universal-document-analysis/overview). Instead of exporting your extracted data and re-uploading it, you can push it straight from an extraction job's results into Form Fill as your source.

## Send results to Form Fill

1. Open an extraction job's **Results** (see [Extraction Jobs](/docs/universal-document-analysis/extraction-jobs)).
2. Click **Use in Form Fill**.

Form Fill opens with your extracted data already loaded as the source. The **Source** section shows an **Extraction results / Upload files** toggle, so you can switch back to uploading files if you prefer.

## What gets passed

What you send depends on how you're viewing the results when you click **Use in Form Fill**:

- **All rows** — the entire result set is passed, grouped by extraction task.
- **A single file** — only that file's extracted rows are passed.

The Source section shows a read-only preview of the incoming data — the column headers and the first few rows, plus the total row count — so you can confirm it's the right data before filling.

## Fill modes for extracted data

Because extraction results are row-based, you'll typically choose between two [fill modes](/docs/form-fill/filling-a-form#step-3-configure-the-output) in the Output section:

- **Fill once for all files** — combines every row into one filled document.
- **Fill once per row** — produces a separate filled document for each row, ideal when each record needs its own form.

Set your target and output options exactly as you would for uploaded files, then click **Run Form Fill**. See [Filling a Form](/docs/form-fill/filling-a-form) for the rest of the workflow.
