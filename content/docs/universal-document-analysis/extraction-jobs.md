---
title: "Extraction Jobs"
description: "Create a job, upload documents, define fields, run the AI, and review, edit, and export your results."
order: 2
---

An extraction job is the core workflow of Universal Document Analysis. You upload documents, define the fields you want pulled out, and the AI returns the data as editable rows. This page walks through the full process from start to finish.

## Create a job

1. In the sidebar, open **Jobs** (`/dashboard/jobs`).
2. Click **New job**.
3. Give the job a name (for example, "Q1 Invoices") and click **Start Job**.

You'll be taken straight into the first step, **Upload files**. A job moves through four steps — Upload, Configure fields, Review, and Processing — and each job card on the Jobs page shows which step it's currently on.

## Step 1: Upload files

Add the documents you want to extract data from. You have several options:

- **Drag and drop** files onto the upload area.
- **Select files** to pick individual documents from your computer.
- **Select folder** to upload a whole folder — the folder structure is preserved, which matters for how files are grouped during extraction.
- **Import from Google Drive** to pull files straight from Drive. This requires the Google Drive integration — see [Integrations](/docs/universal-document-analysis/integrations).

As files upload, each shows a status: **uploading**, **importing** (from Google Drive), **unpacking** (for ZIP archives), **ready**, or **failed**. You can download or delete any file from the list before moving on.

> **Tip:** Drop a ZIP archive to upload many documents at once — it's unpacked automatically, and only supported file types inside it are kept.

When your files are ready, continue to the next step.

## Step 2: Configure fields

This is where you tell the AI what to extract. You can start two ways:

- **Use a template** — pick one of your saved templates or a public one, load its fields, and tweak them if needed. See [Templates](/docs/universal-document-analysis/templates).
- **Custom configuration** — build your fields from scratch.

For each field you add, set:

| Setting | Description |
| --- | --- |
| **Field name** | The column name for the extracted value (e.g., `invoice_number`). |
| **Data type** | The kind of value to expect (see the reference below). |
| **AI prompt** *(optional)* | A short instruction telling the AI exactly what to look for, e.g., "The total amount due, including tax." |

Use **Add field** to create fields, the up/down arrows to reorder them, and the trash icon to remove one.

**Processing mode (per folder).** If your upload contains folders, you choose how each folder is read:

- **Individual** — extract from each file separately, producing one result per document.
- **Combined** — treat all files in the folder as a single document and extract one combined result.

You can also add an optional **description** for the run to note its purpose. Save your configuration and continue to review.

### Data types reference

Pick the data type that best matches each field. The type guides how the AI interprets and formats the value.

| Data type | Use it for |
| --- | --- |
| Text | General text — the all-purpose default. |
| Email | Email addresses. |
| Phone Number | Phone numbers. |
| Address | Physical or mailing addresses. |
| Name | A person's or company's name. |
| URL | Web links. |
| Number | Any numeric value, including decimals. |
| Currency | Monetary amounts (the numeric value only). |
| Percentage | Percentage values. |
| Integer | Whole numbers. |
| Date (MM/DD/YYYY) | Dates in US month-first format. |
| Date (DD/MM/YYYY) | Dates in day-first format. |
| Date (YYYY-MM-DD) | Dates in ISO format. |
| Time (HH:MM) | Times of day. |
| Boolean (Yes/No) | True/false or yes/no values. |

## Step 3: Review and start

The review step summarizes everything before you commit:

- The files to be processed, with total count and size.
- The fields you configured.
- The processing mode for each folder.
- An estimated processing time.

When everything looks right, click **Start processing**.

## Step 4: Processing

The AI now reads your documents. You'll see a live progress bar and counters for tasks **total**, **completed**, and **failed**, updating in real time.

> **Note:** You don't have to stay on this page — processing continues in the background. When it finishes, you're taken to the results automatically.

## Step 5: Results and export

Results appear in an editable table, with one column per field and one row per extracted record. A tree on the side lets you browse results by file and by result set.

**Editing results.** Click any cell to correct a value. You can delete rows or add new rows manually — useful for capturing something the AI missed.

**Exporting.** You can export your results several ways:

- **Download CSV** or **Download Excel (.xlsx)** to your computer.
- **Export to Google Drive** — choose a destination folder (or use My Drive) and the file format. This requires the Google Drive integration.

## Runs and appending results

A single job can be run more than once. Each run keeps its own files and results, and you can switch between runs using the run selector at the top of each step.

- **New run** — start a fresh run on the same job, reusing the job's setup.
- **Append results** — add a new run's output to the existing results instead of replacing them. Appended results appear as separate sets (labeled "Results (original)", "Results (append 1)", and so on), so you can keep growing one combined dataset over time.

Use a new run when you want a clean result set; use append when you're adding more documents to the same ongoing collection.

## Managing your jobs

From the Jobs list you can:

- See each job's **status** and the **step** it's currently on.
- **Refresh** the list to pull the latest status.
- Use the **⋯** menu on a job card to **Edit** (rename) or **Delete** a job. Deleting a job removes all its runs, files, and results.
