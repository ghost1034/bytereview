---
title: "Managing and Verifying Envelopes"
description: "Track envelope status, remind signers, void a request, download completed files, and verify a digital seal."
order: 5
---

The **E-Signature** dashboard shows every envelope you sent and each request awaiting your own signature. Click a sent envelope to open its detail page and monitor the signing process.

## Envelope statuses

| Status | Meaning |
| --- | --- |
| **Draft** | The sender is still adding recipients or fields. It has not been sent. |
| **Sent** | The request was sent, but no signer has opened an active signing session yet. |
| **In progress** | At least one signer has opened the request; one or more signatures are still outstanding. |
| **Completed** | Every signer finished and CPAAutomation produced the digitally sealed PDF. |
| **Declined** | A signer declined the envelope, ending the request for everyone. |
| **Voided** | The sender stopped the request before completion. |
| **Expired** | The expiration date passed before all signers finished. |

Use the status menu in the **All** view to filter the list. The **Signers** column shows completed signers against the total number of recipients.

## Monitor recipients and documents

The envelope detail page contains:

- **Signers** - each signer's routing order, current state, signing time, and any decline reason.
- **Documents & integrity** - original documents and their SHA-256 hashes, plus flattened-document hashes after processing.
- **Audit trail** - a chronological record of envelope events with the actor, time, IP address, and recorded MFA evidence when available.

The audit trail records events such as creation, sending, viewing, consent, signing, reminders, declines, voiding, sealing, completion, and expiration.

## Send a reminder

For an active envelope, click **Remind** to notify the signers who are currently eligible and have not finished. In a sequential envelope, this targets the current routing order rather than future signers.

CPAAutomation also checks for automatic reminders based on the interval selected when the draft was created. These checks and email delivery are not instantaneous, so treat the configured interval as a threshold rather than an exact delivery time.

## Void an envelope

Click **Void**, enter a reason, and confirm **Void envelope** to permanently stop an active request. Eligible recipients can no longer sign, and notified signers receive a message about the change.

The envelope and audit trail remain available after voiding. A voided envelope cannot be reopened or resent; create a new envelope if the request needs to start again.

## Download completed files

After an envelope reaches **Completed**, the sender can download:

- **Signed PDF** - the completed document with the certificate pages and embedded digital seal.
- **Certificate** - a separate certificate of completion for the envelope.

The completion panel also displays the sealed PDF's SHA-256 hash. Preparing and sealing the final document happens in the background, so there can be a short delay after the last signer finishes.

## Verify a document

Open **E-Signature** and click **Verify**, or click **Verify** on a completed envelope. You can verify in either of two ways:

1. Upload a sealed PDF to check its embedded digital signature.
2. Enter the ID of a stored envelope you own to verify CPAAutomation's completed copy.

You can also provide both. In that case, CPAAutomation validates the uploaded PDF and compares its SHA-256 hash with the stored envelope record.

The result reports:

| Result | What it tells you |
| --- | --- |
| **Digital seal** | Whether an embedded seal was found and whether its signature validates. |
| **Modification level** | Whether the PDF reports changes after signing. |
| **Hash match** | Whether the uploaded bytes exactly match the stored sealed document, when a stored record is available. |
| **Sealed at** | The time recorded in the digital signature. |
| **Sealing certificate** | The identity information from the certificate used to seal the PDF. |
| **Computed SHA-256** | The fingerprint calculated from the document being checked. |

A valid result indicates that the digital seal validates and the document has not been modified in a way that invalidates it. An invalid seal or hash mismatch means the file should not be treated as the same completed document. Verification checks document integrity; it is not a legal opinion about the underlying agreement.

## Legal basis

Open **E-Signature** and click **Legal basis** to review how the product's consent, signer-intent, authentication, record-association, tamper-evidence, retention, audit, and verification controls map to core ESIGN, UETA, and New York ESRA requirements. This technical compliance summary is not legal advice, and document-specific or agency-specific acceptance rules still apply.
