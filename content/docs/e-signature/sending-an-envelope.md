---
title: "Sending an Envelope"
description: "Create an envelope, add recipients, place signature fields, and send PDF documents for signature."
order: 2
---

Sending an envelope starts with creating a draft, then walks through a four-step wizard: **Documents**, **Recipients**, **Fields**, and **Review**. Each step is its own page; the step indicator at the top shows your progress and lets you return to a completed step.

## Create the draft

From **E-Signature**, click **New envelope**. Complete the available settings:

| Setting | What it controls |
| --- | --- |
| **Title** | The name shown in CPAAutomation and in signature-request emails. A blank title becomes *Untitled envelope*. |
| **Message to signers** | Optional text included in the signature-request email and signing page. |
| **Start from template** | Uses documents and field positions saved in an E-Signature template. |
| **Documents** | The PDFs to sign, in the order shown. This replaces the template choice. |
| **Signing order** | **Sequential** notifies signers by routing order; **Any order** lets all signers act independently. |
| **Expires in (days)** | How long the request remains active. The default is 30 days. |
| **Remind every (hours)** | The interval after which CPAAutomation can send another reminder. The default is 72 hours. |

Click **Create & add recipients** when the documents and settings are ready. Envelopes started from a template open at the **Recipients** step; envelopes with uploaded PDFs open at **Documents**.

> **Note:** The expiration date is set when you create the draft. If a draft sits unsent for several days, those days count toward the selected expiration period.

## Step 1: Documents

The **Documents** step lists the PDFs attached to the draft. You can drop in additional PDFs or remove one you no longer need — removing a document also removes any fields already placed on it. An envelope always keeps at least one document.

### PDF requirements

- An envelope can contain up to **10 PDFs**.
- Each PDF can be up to **25 MB**.
- PDFs must contain at least one page and cannot be password-protected.

Click **Continue to recipients** when the document list is complete.

## Step 2: Add recipients

Enter a **Name**, **Email**, and **Role** for each recipient.

- Choose **Signer** for someone who must complete fields.
- Choose **CC** for someone who should be copied on notifications but does not sign.
- For sequential signing, **drag recipients by the grip handle** to arrange the signing order. The number badge on each signer shows their position in the sequence; each signer is notified only after the one before them finishes.
- You can add up to **20 recipients** in total. Every email must be unique, and at least one recipient must be a signer.

Use the exact email address the signer will use for their CPAAutomation account. A signer cannot open the request while signed in with a different address.

Click **Continue to fields** to save the recipients.

> **Warning:** Saving the recipient list replaces the existing recipient records and clears fields already placed in the envelope. If you return to **Recipients** after placing fields, plan to place the fields again.

## Step 3: Place fields

The field editor shows signer names on the left and the PDF pages on the right.

1. Under **Assign to**, select the signer who should complete the field.
2. Under **Fields**, select a field type.
3. Click the relevant position on the PDF page.
4. Drag the field to move it or drag its corner to resize it.
5. Select a placed text or checkbox field to change whether it is required or to remove it.

If the envelope contains multiple PDFs, use the **Document** menu to switch between them.

### Available fields

| Field | How it is completed |
| --- | --- |
| **Signature** | Uses the signer's adopted typed or drawn signature. |
| **Initials** | Uses initials derived from the signer's name. |
| **Date signed** | Filled automatically when the signer signs. |
| **Text** | Entered by the signer; it can be required or optional. |
| **Checkbox** | Selected by the signer; it can be required or optional. |

Every signer needs at least one required field and at least one **Signature** field before the envelope can be sent. Fields cannot be assigned to CC recipients.

Click **Continue to review** after placing and saving all fields.

## Step 4: Review and send

The **Review & send** step summarizes the documents, signers, number of fields, expiration, and reminder interval. Use **Back** if anything needs correction.

You can also click **Save as template** to preserve this document layout for future envelopes. See [Templates](/docs/e-signature/templates).

Click **Send for signature** to start the request:

- With **Any order**, all signers are eligible and notified.
- With **Sequential** signing, only the first signer is initially eligible and notified.
- As each signer finishes, CPAAutomation advances to and notifies the next one in the order you arranged.

After sending, the envelope and its recipients can no longer be edited. Follow it from the detail page as described in [Managing and Verifying Envelopes](/docs/e-signature/managing-and-verifying).
