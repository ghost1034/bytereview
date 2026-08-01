---
title: "Templates"
description: "Save reusable PDF layouts, signer roles, and field positions for recurring signature requests."
order: 4
---

An E-Signature template stores one or more PDFs, named signer roles, and the fields assigned to each role. Use templates for recurring documents such as engagement letters or authorization forms so you do not need to place the same fields for every envelope.

> **Note:** E-Signature templates are separate from [Form Fill templates](/docs/form-fill/templates) and [Universal Document Analysis templates](/docs/universal-document-analysis/templates). Each template type is used only within its own product.

## Create a template from scratch

1. Open **E-Signature** and click **Templates**.
2. Click **New template**.
3. Enter a template **Name**.
4. Under **Signer roles**, name each role in signing order, such as *Client* and *Partner*.
5. Upload the PDF documents.
6. Click **Create & place fields**.
7. Select each signer role and place its fields on the document. Field changes save automatically.

The template editor uses roles instead of real recipients. When you create an envelope from the template, CPAAutomation maps those role positions to the people you enter.

## Save an envelope as a template

You can also create a template while preparing a draft envelope:

1. Complete Prepare and field placement.
2. Open **Review & send** and use the **Save as template** section.
3. Enter a template name and click **Save template**.

This keeps the draft's documents and field layout as a reusable template. Saving the template does not send the current envelope.

## Use a template

You can start from either location:

- From **Templates**, click **Use** next to a template.
- From **New envelope**, choose it under **Start from template**.

Set the envelope title, message, expiration, and reminder interval, then click **Create & prepare**. Add real signers in the same order as the template's roles. The saved fields appear after the recipients are saved; review their assignments and positions before sending.

The envelope receives its own copy of the template documents and fields. Later edits to or deletion of the template do not change envelopes already created from it.

## Edit and publish a template

Click a template row to open the immersive editor. You can edit roles and their relationships, documents, message defaults, date and signing settings, branding, and field placement. Field changes save automatically; use **Save settings** for the remaining draft settings.

The template draft also supports **Place fields with AI**. It uses role labels rather than real recipient identities, runs in the background, and stages dashed suggestions outside the saved field layout. Review warnings and remove unwanted suggestions before applying the rest. Completed AI suggestions must be applied or discarded before publishing; selected pages consume the same page allowance as envelope analysis. Published versions stay immutable and cannot be analyzed in place—create a new draft from a version when you need a different layout. Manual placement remains available when AI omits an ambiguous or unsupported field.

Click **Publish** to create an immutable numbered version for Bulk Send and PowerForms. Published snapshots never change when the working draft is edited. The version history can create a new editable template draft from any prior version.

## Archive or delete a template

Use the delete button in the **Templates** table to remove an unused draft. If an envelope or published history references the template, CPAAutomation archives it instead of hard-deleting it. Archived templates cannot be used for new sends, but their immutable versions and retained envelope provenance remain available. Use **Show archived** to inspect them.
