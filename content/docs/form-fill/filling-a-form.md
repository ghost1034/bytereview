---
title: "Filling a Form"
description: "The full Form Fill workflow: choose a source and target, set output options, run, and download your filled document."
order: 2
---

This page walks through a complete Form Fill run from start to finish. The Form Fill page is organized top to bottom in three numbered sections — **Source**, **Target**, and **Output** — followed by the **Run status** and your recent runs. Work down the page, then click **Run Form Fill**.

## Step 1: Choose your source

The **Source** is the information used to fill your form. Click **Choose files** to upload one or more files from your computer.

- Supported types: **CSV, XLSX, PDF, DOCX**.
- You can add up to **100 files**, **1000 MB** total.
- Each selected file is listed with its type and size. Click **Remove** to drop one.

> **Note:** When you add multiple files, each one fills its own copy of the form by default. You control this with the [fill mode](#step-3-configure-the-output) in Step 3.

If you arrived here from an extraction job, an **Extraction results / Upload files** toggle appears at the top of the Source section, letting you fill directly from your extracted data. See [Using Extraction Results](/docs/form-fill/using-extraction-results).

## Step 2: Choose your target

The **Target** is the PDF or DOCX form you want filled. Use the toggle at the top of the section to choose:

- **Upload target** — upload a `.pdf` or `.docx` form from your computer.
- **Saved template** — pick a form you previously saved. See [Templates](/docs/form-fill/templates).

### Save a target as a template

While uploading a target, tick **Save this target as a reusable Form Fill template** to keep it for next time. Give it a **Template name** (required) and an optional **Template description**. The form is saved along with the options you set below. See [Templates](/docs/form-fill/templates) for details.

### Form options

Beneath the target, up to two options appear:

- **Fill entries in chronological order** — orders dated rows oldest-first when your source data isn't already sorted by date. Available for any target.
- **Allow AI to add new rows or columns in the form** — lets the AI grow a table to fit more data than the original form had room for. Available for **DOCX targets only**.

> **Tip:** When you save a target as a template, these options are saved with it and re-applied automatically the next time you select that template.

## Step 3: Configure the output

**Output format.** Choose the format of the finished document:

- A **PDF** target always produces a **PDF**.
- A **DOCX** target can produce either **DOCX** or **PDF**.

**Fill mode.** Choose how many documents to create from your source:

| Mode | What it does | When to use it |
| --- | --- | --- |
| **Fill once for all files** | Combines all your sources into a single filled document. | Several files that together describe one form. |
| **Fill once per file** | Creates one filled document per source file. | A batch of files that each need their own form. |
| **Fill once per row** | Creates one filled document per row of a spreadsheet. | A single CSV/XLSX where each row is its own record. |

> **Note:** *Fill once per row* is available only when your source is exactly one CSV or XLSX file (or row-based extraction results). Otherwise the option is greyed out.

When everything is set, click **Run Form Fill**. The button stays disabled until you've chosen a source, a target, and — if you're saving a template — entered a template name.

## Step 4: Run and track progress

After you start a run, the **Run status** section appears with live updates:

- **Status** — moves from *pending* to *processing* to *completed* (or *completed with errors*, or *failed*).
- **Progress** — when a run produces more than one document, a counter shows how many of the total are completed and how many failed.
- **Strategy** — the method Form Fill chose for your form, such as *Fillable PDF* or *DOCX Placeholder Replacement*. Form Fill detects the form type and picks the best approach automatically.

> **Note:** Processing runs in the background — you can leave the page and come back. Your runs are saved and listed under **Recent Form Fill runs**.

## Step 5: Review and download

When the run finishes, the Run status section shows everything about it:

- **Download** the result. A single document downloads directly; a run with multiple documents downloads as a **ZIP**.
- The **Source** and **Target** files are listed with their own **Download** buttons, so you can retrieve exactly what went in.
- **Warnings** — if the AI flags anything (for example, a value it couldn't place), expand the entry for that document to read the details. A run that finishes with warnings is marked *completed with errors* but still produces output.

## Recent Form Fill runs

Every run is saved under **Recent Form Fill runs**, newest first, and stays available after you leave the page. For each run you can:

- **View** — reopen its Run status to review the details or re-download results.
- **Download** — grab the finished document (or ZIP) once the run has completed.

The run you're currently viewing is marked **Selected**.
