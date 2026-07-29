---
title: "Sending an Envelope"
description: "Prepare documents and recipients, add fields, review, and send PDFs for signature."
order: 2
---

Sending an envelope uses two focused stages: **Prepare** and **Add fields & send**. The composer fills the browser window so the document and recipient setup stays in context. Draft changes save automatically; the header reports **Saving**, **Saved**, or **Save failed**.

## Create the draft

From **E-Signature**, click **New envelope**. Upload one or more PDFs or select a template, add a title and optional message, then click **Create & prepare**.

- An envelope can contain up to **10 PDFs**, each up to **25 MB**.
- PDFs must have at least one page and cannot be password-protected.
- A draft can have up to **20 recipients** with unique email addresses.

## Stage 1: Prepare

Prepare keeps the complete delivery setup on one screen:

- Upload more PDFs and drag documents to change their reading order.
- Add signers and CC recipients, then drag them to change routing order.
- Set sequential or any-order signing.
- Edit the email message, expiration date, and reminder interval.

Every recipient needs a name and unique email address, and at least one recipient must be a signer. CPAAutomation sends a private, expiring access link to that address. Recipients can sign in, create a free account, or continue as a guest without an account.

Use **Recipient reassignment** to choose one clear policy for the envelope: nobody, all eligible recipients, or only recipients you select. When you choose specific recipients, enable **May reassign this step** on their recipient cards. Copy recipients, witnesses, and in-person signers cannot initiate reassignment.

Removing a document also removes fields placed on that document. Removing a recipient removes only fields assigned to that recipient. CPAAutomation shows the exact number of affected fields before either destructive change. Editing a recipient's name, email, role, or routing position preserves that recipient's identity and placed fields.

Click **Next** when the setup is valid. Pending changes are saved before the composer advances.

## Stage 2: Add fields & send

Select a signer under **Assign to**, choose a field from the palette, and click the PDF to place it. You can also drag, resize, multi-select, duplicate, and move fields with the keyboard. Undo and redo are available in the palette.

If the active PDF already contains fillable form fields, click **Import fillable fields** in the field palette. Choose which fields to import and assign each one to a signer. Imported fields keep their original positions and appear immediately in the editor.

Available fields include:

| Field | Behavior |
| --- | --- |
| **Signature / Initials** | Uses the signature or initials adopted by the signer. |
| **Date signed** | Filled automatically at signing. |
| **Text / Checkbox** | Required or optional signer input. |
| **Radio group / Dropdown** | Constrained choices configured in field properties. |
| **Attachment** | Requires a supported PDF or image upload. |
| **Formula** | Calculates from referenced numeric fields. |
| **Auto-fill** | Uses recipient name, email, company, or sent date. |

Fields can be conditional, and text anchors can be used for repeatable placement. To use an anchor, select the field type, click **Place by anchor**, enter the text to match, and configure:

- **Placement** — Auto, Right, Left, Below, or Above the complete matching-text rectangle.
- **Alignment** — Auto, Start, Center, or End. For Left and Right placements, Start and End mean top and bottom. For Above and Below placements, they mean left and right.
- **Horizontal and vertical offsets** — Positive horizontal values move the field right; positive vertical values move it down. Choose points, millimeters, or inches.

Auto placement evaluates each text match independently. It tries Right, Left, Below, then Above. Auto alignment tries Center, Start, then End. The first combination whose complete field fits within the page is used. If none fits, CPAAutomation chooses the combination with the largest visible area and keeps the field inside the page. This calculation uses page boundaries only; it does not avoid nearby PDF content or other fields.

Matching text and dashed field previews appear on the PDF. Select each dashed preview you want to accept, or skip it and continue to the next match. Placement and alignment do not change this individual match-review workflow. Field changes autosave after a short pause.

Click **Review & send** to open the review drawer. It summarizes documents, recipients, routing, message, expiration, reminders, and validation issues. Select a field-specific issue to return to that field. Every signer must have a required field and a signature field.

The drawer also lets you save the draft as a template. Click **Send envelope** when no issues remain. Sent envelopes can no longer be edited; follow progress from the envelope detail page.

Old Documents, Recipients, and Review bookmarks continue to work and redirect into the appropriate stage.
