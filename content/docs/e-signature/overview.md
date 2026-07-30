---
title: "Overview"
description: "What E-Signature does, how envelopes move from draft to completion, and how to get started as a sender or signer."
order: 1
---

E-Signature lets you send PDF documents for electronic signature inside CPAAutomation. Each request is packaged as an **envelope** containing the documents, recipients, fields to complete, signing rules, and an audit trail.

## What you can do

- **Send one or more PDFs for signature** - add signers, optional CC recipients, and fields directly on each page.
- **Control signing order** - ask signers to complete the envelope sequentially or let everyone sign in any order.
- **Track every envelope** - see who has viewed, consented to, signed, or declined a request.
- **Reuse common documents** - save documents, signer roles, and field positions as templates.
- **Download completion evidence** - completed envelopes include a digitally sealed PDF and a certificate of completion.
- **Check document integrity** - verify the embedded digital seal and compare a PDF with CPAAutomation's stored record.

## How an envelope works

An envelope moves through four main stages:

| Stage | What happens |
| --- | --- |
| **Prepare** | The sender uploads PDFs, adds recipients, and places fields. The envelope remains a draft. |
| **Send** | CPAAutomation emails the eligible signer or signers and records the send in the envelope's audit trail. |
| **Sign** | Each signer reviews the electronic-records disclosure, adopts a typed or drawn signature, and completes assigned fields. |
| **Complete** | After the last signature, CPAAutomation prepares the final PDF, adds completion evidence, and applies a tamper-evident digital seal. |

The seal and audit trail provide evidence about the document and signing process. They do not by themselves guarantee that an agreement is enforceable in every jurisdiction or situation.

## Who does what

- **Senders** create envelopes, assign fields, monitor progress, send reminders, void active requests, and download completed files.
- **Signers** open the secure link delivered to the email address selected by the sender, consent to electronic records, and complete their assigned fields. No CPAAutomation account is required.
- **CC recipients** use their secure link for read-only access and are included in the completion notification.

## Where to find it

Open **E-Signature** in the CPAAutomation sidebar (`/dashboard/esign`). The page has three views:

| View | What it contains |
| --- | --- |
| **All** | Envelopes you sent, with status filters and signing progress. |
| **Awaiting my signature** | An optional inbox for signed-in users whose account email also appears on an envelope. |
| **Drafts** | Envelopes you have started but not sent. |

Use the buttons at the top of the page to open **Legal basis**, **Templates**, **Verify**, or create a **New envelope**.

## Get started

**To send a document:**

1. Click **New envelope** and upload your PDFs or select a template.
2. Add the people who need to sign and place their fields.
3. Review the request and click **Send for signature**.
4. Follow progress from the envelope detail page.

Continue to [Sending an Envelope](/docs/e-signature/sending-an-envelope) for the complete workflow.

**To sign a document:**

1. Open the request from its email link or from **Awaiting my signature**.
2. Review and accept the electronic-records disclosure.
3. Adopt your signature, complete all required fields, and click **Finish signing**.

See [Signing an Envelope](/docs/e-signature/signing-an-envelope) for details.
