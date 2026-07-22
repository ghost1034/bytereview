# AccountingClaw demo script — S3 document intake to structured results

## Producer setup: documents to generate

This section is for demo preparation only. Do not show it, refer to generated data, or describe the documents as samples during the recording. All entities and transactions below are fictional.

Create the following five polished vendor documents for **Northstar Outdoor Supply, Inc.** Use distinct, realistic layouts and logos, but keep every key value sharply legible. Export each document as a PDF, then place the PDFs in a ZIP archive named `northstar_ap_2026-06.zip`.

| # | Filename | Pages | Document design | Values the document must contain |
|---:|---|---:|---|---|
| 1 | `01_summit_freight_INV-20614.pdf` | 1 | Freight-services invoice with the vendor address at upper left, invoice metadata at upper right, and a compact charges table. | Vendor: **Summit Freight Partners**; type: **Invoice**; invoice: **INV-20614**; date: **06/05/2026**; due: **07/05/2026**; PO: **NSO-4812**; subtotal: **$1,850.00**; shipping: **$0.00**; tax: **$0.00**; total: **$1,850.00**; currency: **USD**; terms: **Net 30**. |
| 2 | `02_bluepeak_interiors_BPO-8841.pdf` | 2 | Office-interiors invoice. Put the item detail on page 1 and the subtotal, tax, total, terms, and remittance instructions on page 2. | Vendor: **BluePeak Office Interiors**; type: **Invoice**; invoice: **BPO-8841**; date: **06/08/2026**; due: **07/08/2026**; PO: **NSO-4799**; subtotal: **$4,680.00**; shipping: **$0.00**; tax: **$409.50**; total: **$5,089.50**; currency: **USD**; terms: **Net 30**. |
| 3 | `03_alder_it_AIS-2026-0617.pdf` | 1 | Professional-services invoice with a monthly support description and a conspicuous blank or omitted PO field. | Vendor: **Alder IT Services**; type: **Invoice**; invoice: **AIS-2026-0617**; date: **06/17/2026**; due: **07/17/2026**; PO: **not stated**; subtotal: **$2,400.00**; shipping: **$0.00**; tax: **$0.00**; total: **$2,400.00**; currency: **USD**; terms: **Net 30**. |
| 4 | `04_mesa_packaging_MP-77504.pdf` | 1 | Packaging-supplies invoice with a dense line-item table and shipping shown separately beneath the subtotal. | Vendor: **Mesa Packaging Co.**; type: **Invoice**; invoice: **MP-77504**; date: **06/23/2026**; due: **07/23/2026**; PO: **NSO-4870**; subtotal: **$3,125.00**; shipping: **$180.00**; tax: **$273.44**; total: **$3,578.44**; currency: **USD**; terms: **Net 30**. |
| 5 | `05_redwood_safety_CM-1048.pdf` | 1 | Credit memo with a clear **CREDIT MEMO** heading and negative amounts. Refer to the returned items and the original invoice. | Vendor: **Redwood Safety Supply**; type: **Credit Memo**; credit memo: **CM-1048**; date: **06/27/2026**; due: **not applicable**; PO: **NSO-4755**; original invoice: **RSS-41002**; subtotal: **-$650.00**; shipping: **$0.00**; tax: **-$56.88**; total: **-$706.88**; currency: **USD**; terms: **Credit to account**. |

Expected batch control totals:

- **5 documents / 6 pages** — four invoices and one credit memo.
- Gross invoice total: **$12,917.94**.
- Credit memo total: **-$706.88**.
- Net batch total: **$12,211.06**.
- One clear follow-up item: **AIS-2026-0617 has no purchase order number stated**.

Put the ZIP in the demo S3 bucket at:

```text
s3://northstar-demo-docs/ap-intake/2026-06/northstar_ap_2026-06.zip
```

Leave this destination prefix empty before recording:

```text
s3://northstar-demo-docs/ap-processed/2026-06/
```

## Producer setup: extraction template

Create or confirm a private Universal Document Analysis extraction template named **AP Invoice Intake** with these fields in this order:

| Field | Data type | AI prompt |
|---|---|---|
| `document_type` | Text | Classify the document as Invoice, Credit Memo, or another clearly stated document type. |
| `vendor_name` | Name | The legal or trading name of the vendor issuing the document. |
| `document_number` | Text | The invoice number or credit memo number. |
| `document_date` | Date (MM/DD/YYYY) | The invoice or credit memo issue date. |
| `due_date` | Date (MM/DD/YYYY) | The payment due date. Return null when the document is a credit memo or no due date is stated. |
| `purchase_order_number` | Text | The customer's purchase order number. Return null when none is stated. |
| `original_invoice_number` | Text | The original invoice referenced by a credit memo. Return null for a standard invoice. |
| `subtotal` | Currency | The subtotal before shipping and tax. Preserve a negative sign for a credit. |
| `shipping_amount` | Currency | The separately stated shipping or freight charge. Return 0 when the document clearly has none. |
| `tax_amount` | Currency | The total tax amount. Preserve a negative sign for a credit. |
| `total_amount` | Currency | The final document total, including shipping and tax. Preserve a negative sign for a credit. |
| `currency` | Text | The three-letter currency code, using USD only when the document clearly indicates US dollars. |
| `payment_terms` | Text | The stated payment terms or credit treatment. |

Use **Individual** processing mode so Universal Document Analysis produces one result for each PDF unpacked from the ZIP.

## Recording preparation

- Use the AccountingClaw desktop chat or an equivalent Hermes chat session with the CPAAutomation MCP gateway active.
- In **CPAAutomation → Integrations**, connect **AWS S3** with a dedicated, least-privilege demo credential. The credential needs list/read access to `ap-intake/2026-06/` and write access to `ap-processed/2026-06/`. Set `northstar-demo-docs` as the default bucket.
- Confirm that the connected integration is labeled **AWS S3** and active. Never expose the access key ID, secret access key, session token, signed URLs, or Claw connector token on screen.
- Confirm that the **AP Invoice Intake** template is visible to the same CPAAutomation user who activated AccountingClaw.
- Keep an authenticated browser tab ready on **Universal Document Analysis → Jobs** and an AWS console tab open directly to the empty `ap-processed/2026-06/` prefix.
- Use a fresh AccountingClaw chat. Remove prior runs named **Northstar June 2026 AP Intake** or give the demo run a unique date suffix.
- Rehearse the analysis once. Confirm that the approval summary says **5 files, 6 pages, 13 fields, Individual processing**, all five expected rows are returned, and the net total is **$12,211.06**.
- Delete the rehearsal output from the destination prefix before the final take.
- Hide notifications, unrelated clients, browser bookmarks, terminal history, credentials, signed URLs, and local filesystem paths.
- If processing takes longer than the desired edit, record the submission and completed result as separate takes and bridge them with a short time-lapse.

## Demo script

Target length: approximately **5½ minutes**.

### 0:00–0:25 — The outcome first

**Action:** Start in the AWS S3 console on `ap-intake/2026-06/`. Show the single ZIP archive, then briefly switch to the empty `ap-processed/2026-06/` prefix. Do not open the ZIP or expose a signed URL.

**Dialogue:**

> A document workflow usually starts in one system and ends in another. Here, five June AP documents have arrived in an S3 intake folder. I'm going to ask AccountingClaw to bring them into CPAAutomation, run Universal Document Analysis, and return a clean result file to S3—without manually downloading, uploading, or rekeying the documents.

### 0:25–0:47 — A connected integration, without an OAuth app

**Action:** Switch to **CPAAutomation → Integrations**. In **Connected integrations**, hold on the active **AWS S3** row. Keep credential fields and tokens off screen. Then switch to the fresh AccountingClaw chat.

**Dialogue:**

> AWS S3 is connected with a scoped credential, so this workflow doesn't depend on an OAuth app. The connection is available to AccountingClaw through CPAAutomation's authenticated integration gateway.

### 0:47–1:13 — Brief AccountingClaw like a staff accountant

**Action:** Paste the prompt below into AccountingClaw and send it. Keep the full prompt visible long enough to read the entity, period, basis, source, and requested destination.

**Typed prompt:**

> Client: Northstar Outdoor Supply, Inc. Period: June 2026. Basis: US GAAP. Source system: our connected AWS S3 account. Find the ZIP in `s3://northstar-demo-docs/ap-intake/2026-06/`, import its documents into a new Universal Document Analysis job named `Northstar June 2026 AP Intake`, and use the `AP Invoice Intake` extraction template with Individual processing. Before starting the analysis, show me the file, page, and field summary for approval. When processing is complete, summarize the results, flag missing PO numbers, and export a CSV to `s3://northstar-demo-docs/ap-processed/2026-06/northstar_ap_2026-06_results.csv`.

**Dialogue:**

> The brief supplies the engagement context AccountingClaw needs, identifies the connected source and destination, and tells it to pause before the metered analysis begins.

### 1:13–1:55 — Import from S3 and prepare the analysis

**Action:** Let AccountingClaw work. As its progress updates appear, keep the integration and Universal Document Analysis tool activity in view. The expected sequence is: discover the connected S3 account, list the intake prefix, select the ZIP, create the job, download the archive into its workspace, upload it to the job, wait for expansion and page counting, locate the template, and configure Individual processing.

**Expected AccountingClaw response, paraphrased:**

> I found `northstar_ap_2026-06.zip` in the connected S3 intake prefix and imported it into a new Universal Document Analysis job. The archive expanded successfully.
>
> Ready for approval:
> - 5 documents
> - 6 pages
> - 13 extraction fields from `AP Invoice Intake`
> - Processing mode: Individual
>
> This action will start metered document analysis. Shall I proceed?

**Dialogue:**

> AccountingClaw is doing more than moving a file. It has created the job in CPAAutomation, expanded the batch, counted the pages, applied the extraction template, and stopped at the approval boundary.

**Contingency:** If the agent reports that the ZIP is still unpacking or page counting is still in progress, let it poll status. Do not approve until the summary matches **5 documents, 6 pages, and 13 fields**.

### 1:55–2:12 — Human approval remains explicit

**Action:** Type and send the approval below.

**Typed prompt:**

> Approved. Start the analysis.

**Dialogue:**

> I can verify the scope and cost driver before anything is submitted. The final decision to start stays with me.

### 2:12–2:48 — Universal Document Analysis runs the batch

**Action:** When AccountingClaw confirms submission, switch to **CPAAutomation → Universal Document Analysis → Jobs**. Open **Northstar June 2026 AP Intake**. Show the processing progress, file count, and task counters. When the run completes, move to **Results**.

**Dialogue:**

> The job is visible in Universal Document Analysis just like one created in the web application. Each document is processed individually, and the run continues in the background. I can monitor total, completed, and failed tasks here while AccountingClaw watches the same job through the platform gateway.

### 2:48–3:42 — Review structured results and the exception

**Action:** In the results table, show the five rows and scroll horizontally only as needed. Pause on `document_type`, `vendor_name`, `document_number`, `purchase_order_number`, and `total_amount`. Select the Alder IT Services row and show that the PO value is not found. Then return to AccountingClaw as its summary appears.

**Expected AccountingClaw response, paraphrased:**

> Universal Document Analysis completed successfully: 5 of 5 documents processed with no failed tasks.
>
> - 4 invoices totaling $12,917.94
> - 1 credit memo totaling -$706.88
> - Net batch total: $12,211.06
> - Follow-up: Alder IT Services invoice AIS-2026-0617 does not state a purchase order number
>
> I prepared the result rows for CSV export.

**Dialogue:**

> Universal Document Analysis has normalized five different layouts into one reviewable table. The standard invoices, the two-page invoice, and the credit memo all follow the same field structure. AccountingClaw also calls out the missing purchase order instead of filling the gap with an invented value.

**On-screen verification:** The five `total_amount` values should be **1,850.00**, **5,089.50**, **2,400.00**, **3,578.44**, and **-706.88**.

### 3:42–4:22 — Export the result file back to S3

**Action:** If AccountingClaw has paused before writing to S3, type the confirmation below. If the original prompt was accepted as sufficient explicit intent and the export has already completed, omit the extra confirmation and hold on the completed export response.

**Typed prompt, only if requested:**

> Yes. Export the reviewed result rows as CSV to the S3 destination I specified.

**Expected AccountingClaw response, paraphrased:**

> Export complete. I wrote `northstar_ap_2026-06_results.csv` to `s3://northstar-demo-docs/ap-processed/2026-06/` and verified that the object is present.

**Dialogue:**

> The structured output is now going back through the connected S3 integration. The source archive remains in the intake prefix, and the CSV lands in the processed prefix with a predictable name for the next step in the workflow.

### 4:22–4:55 — Verify the handoff in the destination system

**Action:** Switch to the AWS S3 console at `ap-processed/2026-06/` and refresh. Hold on `northstar_ap_2026-06_results.csv`. Open its details or preview only if this can be done without showing credentials or a signed URL. If preview is safe, show the header and first two result rows.

**Dialogue:**

> And here is the completed CSV in S3. It contains the document-level fields we reviewed in CPAAutomation, ready for an AP workflow, a data warehouse, or another downstream process.

### 4:55–5:25 — Traceability and close

**Action:** Return to the Universal Document Analysis results page. Hold on the file tree, editable results table, and the extraction summary. End on AccountingClaw's completion message beside the job's dashboard link.

**Dialogue:**

> The workflow stays traceable end to end: the original documents remain tied to their extracted rows, the results can be reviewed and corrected in Universal Document Analysis, and AccountingClaw reports the exception and the delivery location. What started as a folder of mixed vendor documents is now structured, reviewable data in the system where the next process begins.

**Closing title:**

> **AccountingClaw + Universal Document Analysis**  
> From connected documents to review-ready data.

## Optional 90-second cut

Keep the outcome-first opening, the AccountingClaw brief, the approval summary, the five-row results view, and the refreshed S3 destination. Remove the Integrations screen, live processing monitor, detailed exception drill-down, and the second export confirmation.

## Expected CSV

Use this only to validate the recorded result. The precise column order should follow the extraction template; null values may appear as empty CSV cells.

```csv
document_type,vendor_name,document_number,document_date,due_date,purchase_order_number,original_invoice_number,subtotal,shipping_amount,tax_amount,total_amount,currency,payment_terms
Invoice,Summit Freight Partners,INV-20614,06/05/2026,07/05/2026,NSO-4812,,1850.00,0.00,0.00,1850.00,USD,Net 30
Invoice,BluePeak Office Interiors,BPO-8841,06/08/2026,07/08/2026,NSO-4799,,4680.00,0.00,409.50,5089.50,USD,Net 30
Invoice,Alder IT Services,AIS-2026-0617,06/17/2026,07/17/2026,,,2400.00,0.00,0.00,2400.00,USD,Net 30
Invoice,Mesa Packaging Co.,MP-77504,06/23/2026,07/23/2026,NSO-4870,,3125.00,180.00,273.44,3578.44,USD,Net 30
Credit Memo,Redwood Safety Supply,CM-1048,06/27/2026,,NSO-4755,RSS-41002,-650.00,0.00,-56.88,-706.88,USD,Credit to account
```

## Claims and guardrails

- Say that AccountingClaw uses the user's connected AWS S3 account through CPAAutomation's authenticated integration gateway. Do not imply that AccountingClaw receives or displays the AWS secret.
- Say that AWS S3 uses a scoped credential in this demo and does not require CPAAutomation to register an OAuth app.
- Say that AccountingClaw imports the documents into a Universal Document Analysis job. Behind the scenes, it obtains the object through the integration, stages the bytes in its workspace, and uploads them through the platform's signed upload flow.
- Preserve the explicit approval moment before starting analysis. The platform requires user confirmation before a metered Universal Document Analysis run begins.
- Describe results as extracted, editable, and reviewable. Do not claim that the AI's values are authoritative or that the documents were approved for payment.
- Do not imply that AccountingClaw posts invoices, approves payments, or writes to an ERP in this workflow.
- A missing value must remain blank or null. Do not let the agent infer a PO number or due date that is not present in the source document.
- Confirm the figures shown on screen before narrating them. If any extracted value differs, correct it in the results table before exporting or re-record the run.
- Never show AWS credentials, connector tokens, authorization headers, pre-signed URLs, local file paths, or raw tool payloads in the final cut.
