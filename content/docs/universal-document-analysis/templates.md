---
title: "Templates"
description: "Save reusable field configurations and apply them to any extraction job or automation."
order: 3
---

A template is a saved set of fields — names, data types, and AI prompts — that you can apply to any extraction job or automation. Build a template once and every future job starts pre-configured, instead of defining the same fields by hand each time.

## Create a template

1. Open **Templates** in the sidebar (`/dashboard/templates`).
2. Click **New template**.
3. Fill in:
   - **Template Name** (required).
   - **Description** (optional) — a short note on what the template is for.
   - **Type** — choose **Extraction** for Universal Document Analysis. (The CPE type is used by a different product.)
4. Build your fields. Each field has a **name**, a **data type**, and an optional **AI prompt**. Add, reorder, and remove fields just like in a job's field configuration — see the [data types reference](/docs/universal-document-analysis/extraction-jobs#data-types-reference) on the Extraction Jobs page.
5. Click **Save template**.

> **Tip:** Write clear AI prompts in your templates (for example, "The invoice's grand total including tax"). Good prompts carry over to every job that uses the template and improve extraction accuracy.

## Public vs. private templates

The Templates page is organized into two groups:

- **My templates** — private templates only you can see. You can view, edit, and delete these.
- **Public templates** — curated templates shared with everyone on the team. These are view-only; you can use them but not edit or delete them.

Each template card shows its type, whether it's public or private, and how many fields it contains.

## View, edit, or delete a template

- **View** opens a read-only preview of a template's fields — handy for checking a public template before you use it.
- **Edit** (private templates only) reopens the template so you can change its name, description, and fields.
- **Delete** (private templates only) removes the template after a confirmation prompt.

## Use a template in a job

To apply a template:

1. In an extraction job, go to **Configure fields** (Step 2).
2. Choose **Use template** and select the template you want.
3. Load its fields, then adjust them for this job if needed.

> **Note:** Applying a template copies its fields into the job at that moment. Editing the template later does **not** change jobs that already used it, so your past results stay consistent.
