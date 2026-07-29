# CPAAutomation E-Signature: End-to-End Demo Script

## Demo configuration

| Item | Demo value |
| --- | --- |
| Target runtime | 5 to 6 minutes |
| Sender | Maya Chen, Research Coordinator |
| Sender account | `maya.chen@cpaautomation.ai` (signed in to CPAAutomation) |
| Signer | Jordan Lee |
| Signer inbox | `jordan.lee@cpaautomation.ai` (accessible during recording) |
| Signer access | Continue as guest; no CPAAutomation account |
| Source document | `examples/e-signature/Informed_Consent.pdf` |
| Envelope title | `Informed Consent - Jordan Lee (Demo)` |
| Message | `Hi Jordan - please review the informed consent form and complete the highlighted fields. Thank you.` |
| Signing order | Sequential / Routing steps |
| Date format | MM/DD/YYYY |
| Expiration | Enabled; 30 days after recording date |
| Automatic reminders | Enabled; every 72 hours |
| Recipient reassignment | Nobody |
| Signature method | Select style; Dancing Script |
| Fields on page 3 | Required Checkbox over **Yes**; Full name over **Name of Participant (print)**; required Signature over the participant signature line; Date signed over the participant date line |
| Completion evidence | Signed PDF, certificate of completion, SHA-256 hash, and audit trail |
| Recording setup | Sender in the primary browser; signer email and guest flow in a private/incognito browser; both at 100% zoom |

The addresses above are the on-screen demo identities. Provision them as real inboxes or aliases before recording. If different inboxes must be used, keep the display names and replace only the addresses everywhere in this script.

## Pre-recording checklist

- Confirm that outbound E-Signature email delivery and the digital sealing worker are running in the recording environment.
- Confirm that both demo inboxes work and that the sender account's display name is **Maya Chen**.
- Use a clean E-Signature dashboard or remove prior envelopes with the same demo title.
- Keep the signer signed out in the private browser so **Continue as guest** appears.
- Put `Informed_Consent.pdf` in the file picker's recent location, but do not upload it before recording.
- Close notifications and unrelated tabs. Keep the signer inbox off-screen until the script calls for it.
- Run the complete flow once before recording. Digital sealing is asynchronous, so be prepared to make a short edit between the signer confirmation and the completed sender view.
- Use demo-only identities and data. The source PDF is a generic example form, not a real research consent record.

## Demo script

### 1. Open with the envelope dashboard - 0:00 to 0:20

**Action**

Open **E-Signature** in the CPAAutomation sidebar. Start on the **Envelopes** page with the quick views and **New envelope** button visible.

**Dialogue**

> This is CPAAutomation E-Signature, our free alternative for preparing, sending, and tracking electronic signature requests. Let me show you the main flow from a PDF on my computer to a completed, digitally sealed document.

### 2. Create the envelope - 0:20 to 0:50

**Action**

1. Click **New envelope**.
2. Enter the title `Informed Consent - Jordan Lee (Demo)`.
3. Paste the configured message into **Message to signers**.
4. Leave **Signing order** set to **Sequential**, expiration at **30** days, and reminders at **72** hours.
5. Click **Continue to prepare**.

**Dialogue**

> Every signature request is organized as an envelope. It holds the documents, recipients, fields, delivery settings, and the audit history in one place. I will give this one a clear title, add a short message for the signer, and keep the standard expiration and reminder settings.

### 3. Upload the PDF and add the signer - 0:50 to 1:30

**Action**

1. In **Documents**, browse for and upload `examples/e-signature/Informed_Consent.pdf`.
2. Pause long enough for `Informed_Consent.pdf - 3 pages` to appear.
3. In **Recipients**, enter `Jordan Lee` and `jordan.lee@cpaautomation.ai`.
4. Leave the role as **Signer** and the routing step as **1**.
5. Briefly point to the **Message** and **Delivery settings** cards. Confirm:
   - Signing order: **Routing steps**
   - Date format: **MM/DD/YYYY**
   - Recipient reassignment: **Nobody**
   - Envelope expires: on
   - Automatic reminders: on, every **72** hours
6. Wait for the header to show **Saved**, then click **Next**.

**Dialogue**

> I can upload one or more PDFs or Word documents, then add the people who need to act. For this focused demo, Jordan is the only signer and is first in the routing order. Recipients receive a private, expiring link, and they can complete the request without creating a CPAAutomation account. Draft changes save automatically as I work.

### 4. Place the signing fields - 1:30 to 2:20

**Action**

1. In **Assign to**, confirm **Jordan Lee** is selected.
2. Scroll the document to page 3.
3. Click **Checkbox**, then place it directly over the box beside **Yes**.
4. Click **Full name**, then place and resize it over the line after **Name of Participant (print)**.
5. Click **Signature**, then place and resize it over the participant **Signature** line.
6. Click **Date signed**, then place it over the participant **Date** line.
7. Select the checkbox and signature fields in turn and keep **Required** enabled.
8. Pause for the header to show **Saved**.

**Dialogue**

> Now I assign fields directly on the PDF. Jordan confirms participation, their full name comes from the recipient record, and the signature and completion date land on the existing lines. Fields can be moved and resized precisely, and required fields drive the guided signing experience.

**Framing note**

Keep page 3 large enough that the four field overlays are readable. Do not place fields on the witness or person-obtaining-consent lines; those roles are outside this single-signer demo.

### 5. Review and send - 2:20 to 2:50

**Action**

1. Click **Review & send**.
2. Slowly scan the drawer: one 3-page document, Jordan as signer, routing, message, expiration, and reminders.
3. Hold briefly on **Ready to send**.
4. Click **Send envelope**.
5. On the envelope detail page, show the **Sent** status and `0 of 1 signed` progress.

**Dialogue**

> Before anything goes out, CPAAutomation gives me one final review of the document, recipient, routing, message, and delivery settings. It also checks the field setup. Everything is ready, so I will send the envelope. The request is now locked for signing, and I can monitor it from this detail page.

### 6. Open the request as the signer - 2:50 to 3:25

**Action**

1. Cut to Jordan's inbox in the private browser.
2. Open the email with the subject **Maya Chen sent you a document to review and sign**.
3. Briefly show the sender message, expiration text, and the warning not to forward the private link.
4. Click **Review Documents**.
5. On the account choice page, click **Continue as guest**.

**Dialogue**

> Jordan receives a branded signature request with my message and a secure link intended only for them. A recipient can create a free account or sign in, but an account is not required. I will continue as a guest to show that experience.

### 7. Consent and complete the required fields - 3:25 to 4:30

**Action**

1. On the **Electronic records and signatures** disclosure, briefly scroll or pause on the disclosure text.
2. Click **I agree to use electronic records and signatures**.
3. Click **Start**. The guide should move to the required **Yes** checkbox.
4. Click the checkbox.
5. Click **Next** to move to the signature field.
6. Click **Sign here** if the signature dialog does not open automatically.
7. In **Adopt your signature and initials**, keep **Select style**, confirm `Jordan Lee`, choose **Dancing Script**, and click **Adopt and Sign**.
8. Pause on page 3 to show:
   - the checked **Yes** box,
   - `Jordan Lee` filled on the participant name line,
   - the adopted signature,
   - **Completed when submitted** in the date field.

**Dialogue**

> Before the document becomes interactive, Jordan reviews and accepts the electronic-records disclosure. The signing guide then moves through each required field in document order. Jordan confirms participation and adopts a signature style. Their name is already filled from the recipient record, and the server will record the actual signing date when the envelope is submitted.

### 8. Finish signing - 4:30 to 4:50

**Action**

1. Click **Finish signing**.
2. Hold on the **Signature recorded** confirmation.

**Dialogue**

> With every required field complete, Jordan finishes signing. The signature and field values are now recorded and can no longer be revised. CPAAutomation begins preparing and digitally sealing the completed PDF.

### 9. Show the completed envelope - 4:50 to 5:40

**Action**

1. Cut back to Maya's sender browser and refresh the envelope detail page.
2. If sealing is still in progress, briefly show the **Digital sealing** status, then cut to the completed state.
3. Hold on **Completed and digitally sealed**, the SHA-256 hash, and the buttons for **Signed PDF**, **Certificate**, and **Verify**.
4. Open the **Recipients** tab and show Jordan's viewed, consented, and signed timeline.
5. Open the **History** tab and scroll through the append-only events: sent, viewed, consent given, signed, digitally sealed, and completed.
6. Return to the top and click **Signed PDF**. Briefly show page 3 with the completed fields.
7. Return and click **Certificate** long enough to establish that completion evidence is available.

**Dialogue**

> Back on the sender side, the envelope is complete and digitally sealed. I can download the signed PDF and its certificate of completion, verify the sealed document, or inspect the recipient timeline and append-only audit trail. Together, those records show what was sent, who acted, when they consented and signed, and whether the completed document has changed.

### 10. Close - 5:40 to 5:55

**Action**

End on the completed envelope banner with **Signed PDF**, **Certificate**, and **Verify** visible.

**Dialogue**

> That is the complete CPAAutomation E-Signature flow: prepare, send, sign from any browser, and retain a sealed document with completion evidence - without paying per envelope.

## Recording contingencies

- **Email delay:** Pause the recording after send and resume when the invitation arrives. Do not expose mail headers, unrelated messages, or the raw private signing URL.
- **Sealing delay:** It is normal for the envelope to show an intermediate digital-sealing state. Use a short cut after explaining that sealing happens in the background.
- **Development disclaimer:** If the in-product development notice appears, acknowledge it once or dismiss it before the take. Do not describe the current beta as legal advice or promise enforceability in every jurisdiction.
- **Field placement miss:** Use undo and replace the field rather than dragging through a long correction on camera.
- **Unexpected account session:** If the signer browser is already authenticated, sign out and reopen the invitation in a fresh private window so the guest choice is visible.
- **Completed date:** The signing view intentionally says **Completed when submitted**. The actual date is written by the server when Jordan finishes signing and appears in the completed PDF.
