# One Platform Accounting Workflow — Demo Video Script

## Synthetic documents to generate before recording

All entities, people, account numbers, transactions, and financial results in this demo are fictional. Add a small footer to every source PDF: **“Synthetic demo document — not a real bank or company record.”** Do not use a real bank logo, routing number, account number, signature, address, or tax identifier.

### 1. `Riverstone_Bank_Statement_2026-07.pdf`

- Format: polished, text-based, two-page PDF resembling a generic commercial-bank statement without copying a real bank’s trade dress.
- Fictional customer: **Riverstone Manufacturing**.
- Account label: **Operating Checking · ending 4821**.
- Statement period: **July 1–31, 2026**.
- Beginning balance: **$120,000.00**.
- Ending balance: **$178,910.00**.
- Include this transaction table:

| Reference ID | Date | Description | Amount |
| --- | --- | --- | ---: |
| BS-0702 | 2026-07-02 | ACH CUSTOMER RECEIPT INV-1042 | 52,000.00 |
| BS-0703 | 2026-07-03 | PAYROLL ACH | -28,400.00 |
| BS-0707 | 2026-07-07 | VENDOR PAYMENT STEELWORKS | -12,750.00 |
| BS-0710 | 2026-07-10 | ACH CUSTOMER RECEIPT INV-1046 | 18,500.00 |
| BS-0715 | 2026-07-15 | SOFTWARE SUBSCRIPTION ERP CLOUD | -3,600.00 |
| BS-0718 | 2026-07-18 | BATCH CUSTOMER DEPOSIT | 41,250.00 |
| BS-0725 | 2026-07-25 | FACILITY RENT | -8,000.00 |
| BS-0728 | 2026-07-28 | BANK SERVICE CHARGE | -125.00 |
| BS-0731 | 2026-07-31 | INTEREST CREDIT | 35.00 |

Design intent: six 1:1 matches, one 1:Many batch-deposit match, and two bank-only reconciling items.

### 2. `Riverstone_GL_Cash_Detail_2026-07.pdf`

- Format: text-based, two-page accounting-system report.
- Header: **Cash GL Detail · Account 1010 · July 1–31, 2026**.
- Opening balance: **$120,000.00**.
- Unadjusted ending balance: **$174,750.00**.
- Include this transaction table:

| Reference ID | Date | Description | Amount |
| --- | --- | --- | ---: |
| GL-0702 | 2026-07-02 | Customer receipt INV-1042 | 52,000.00 |
| GL-0703 | 2026-07-03 | Payroll ACH | -28,400.00 |
| GL-0707 | 2026-07-07 | Steelworks vendor payment | -12,750.00 |
| GL-0710 | 2026-07-10 | Customer receipt INV-1046 | 18,500.00 |
| GL-0715 | 2026-07-15 | ERP Cloud subscription | -3,600.00 |
| GL-0718A | 2026-07-18 | Customer receipt INV-1048 | 25,000.00 |
| GL-0718B | 2026-07-18 | Customer receipt INV-1051 | 16,250.00 |
| GL-0725 | 2026-07-25 | Facility rent | -8,000.00 |
| GL-0731 | 2026-07-31 | Outstanding check 8824 | -4,250.00 |

Design intent: the $41,250 bank deposit matches the two July 18 GL receipts; the outstanding check is GL-only. The bank fee and interest remain unrecorded in the GL. The unreconciled source difference is **$4,160** and the three reconciling items bridge the balances exactly.

### 3. `Riverstone_Comparative_Operating_Expense_Detail_Jun-Jul_2026.pdf`

- Format: text-based, two- or three-page management-report PDF.
- Header: **Comparative Operating Expense Detail · June and July 2026**.
- Present the data as 16 structured rows with columns **Period/Date**, **Account Name/Number**, **Class/Department**, **Description/Memo**, and **Amount**.
- Repeat the same management note for both periods of an account so it remains attached after aggregation.

| Period/Date | Account Name/Number | Class/Department | Description/Memo | Amount |
| --- | --- | --- | --- | ---: |
| 2026-06-30 | 6000 Salaries | Operations | Normal staffing; July includes scheduled merit increases | 42,000.00 |
| 2026-07-31 | 6000 Salaries | Operations | Normal staffing; July includes scheduled merit increases | 43,500.00 |
| 2026-06-30 | 6100 Marketing | Sales & Marketing | July summer product launch campaign | 12,000.00 |
| 2026-07-31 | 6100 Marketing | Sales & Marketing | July summer product launch campaign | 29,500.00 |
| 2026-06-30 | 6200 Freight | Operations | July expedited inbound materials for customer backlog | 18,500.00 |
| 2026-07-31 | 6200 Freight | Operations | July expedited inbound materials for customer backlog | 27,800.00 |
| 2026-06-30 | 6300 Software | G&A | July annual ERP support renewal | 6,200.00 |
| 2026-07-31 | 6300 Software | G&A | July annual ERP support renewal | 9,800.00 |
| 2026-06-30 | 6400 Professional Fees | G&A | July ERP implementation consulting milestone | 4,500.00 |
| 2026-07-31 | 6400 Professional Fees | G&A | July ERP implementation consulting milestone | 16,500.00 |
| 2026-06-30 | 6500 Rent | Operations | Fixed monthly facility rent | 8,000.00 |
| 2026-07-31 | 6500 Rent | Operations | Fixed monthly facility rent | 8,000.00 |
| 2026-06-30 | 6600 Utilities | Operations | Normal seasonal usage | 2,200.00 |
| 2026-07-31 | 6600 Utilities | Operations | Normal seasonal usage | 2,450.00 |
| 2026-06-30 | 6700 Travel | Operations | July supplier qualification site visit | 1,200.00 |
| 2026-07-31 | 6700 Travel | Operations | July supplier qualification site visit | 5,900.00 |

Control totals: June **$94,600**, July **$143,450**, increase **$48,850**. With a **$5,000 OR 20%** threshold, Marketing, Freight, Software, Professional Fees, and Travel should be flagged.

### In-app outputs to produce during setup, not source documents to fabricate

- UDA Excel exports with these names:
  - `Riverstone_July_Bank_Structured.xlsx`
  - `Riverstone_July_Cash_GL_Structured.xlsx`
  - `Riverstone_Jun-Jul_OpEx_Structured.xlsx`
- Analytics outputs created during the demo: full reconciliation workbook and July flux memo in Word or PDF.
- Tasklytic output created during the demo: draft invoice PDF.

## Demo setup and recording state

Target length: **9–11 minutes**. Presenter: **Jordan Blake, Senior Accountant at Sterling & Brooks CPA**. Client contact: **Alex Rivera, Controller at Riverstone Manufacturing**. Both names and organizations are already identified as fictional in the repository.

Before recording:

1. In Tasklytic, create the client **Riverstone Manufacturing**, a $200/hour rate for Jordan, and the engagement project **Riverstone Manufacturing — July 2026 Close & Advisory**. Use engagement number **ENG-2026-071**, status **On track**, and these tasks: Build PBC list; Review client evidence; Extract accepted evidence; Reconcile cash; Perform July OpEx flux; Reviewer sign-off; Bill engagement.
2. Give Jordan Billing capability and either pre-approve the final time entries in a second take or have a second approver account ready. Set invoice prefix to **INV-** and the next demo number to **2048**.
3. In PBC, create a reusable demo template named **Monthly close and analytics** with three PDF requests matching the source documents above. Make sure Alex Rivera is available as the fictional client contact; assign Alex as coordinator when the engagement is created. Use a default due date of **August 7, 2026**.
4. Have a separate browser/profile ready as Alex Rivera so the video can cut cleanly between the firm workspace and the secure client portal.
5. In UDA, save two extraction templates:
   - **Cash transaction rows**: `Transaction Date`, `Description`, `Amount`, `Reference ID`.
   - **Operating expense rows**: `Period/Date`, `Account Name/Number`, `Class/Department`, `Description/Memo`, `Amount`.
6. Preprocess three one-document UDA jobs so each source can be exported separately. Leave the jobs on the Results step with values already checked. This avoids making the audience watch AI processing and gives Analytics one clean file per role.
7. In Analytics, make sure **Riverstone Manufacturing** exists as a client. Keep a backup, precomputed reconciliation and variance analysis in another tab in case a live AI call is slow. Do not imply that PBC automatically pushes files into UDA or that UDA automatically pushes exports into Analytics; the current workflow uses downloads and uploads within the platform.
8. Keep all product tabs signed in, close unrelated tabs, disable personal notifications, use a clean demo download folder, and zoom the browser so table labels remain legible.

## Script

### 0:00–0:25 — Opening promise

**Dialogue**

> “A month-end close usually gets split across a project tracker, a request-list spreadsheet, email attachments, PDF tools, analysis workbooks, time entry, and billing. In CPAAutomation, we can carry the same engagement from kickoff to invoice in one platform. Let’s close July for Riverstone Manufacturing.”

**On-screen actions**

- Start on the CPAAutomation product home or dashboard.
- Briefly reveal the product navigation, then open **Tasklytic**.
- Display a restrained lower-third: **Project → Evidence → Data → Analysis → Billing**.

### 0:25–1:15 — Tasklytic: the engagement is the operating backbone

**Dialogue**

> “We begin in Tasklytic. This is not a disconnected checklist; it is the billable engagement project for Riverstone, with the client, engagement number, responsible lead, fee arrangement, work status, and delivery tasks in one place.”

> “The work is already sequenced from building the PBC list through evidence review, extraction, reconciliation, flux analysis, reviewer sign-off, and billing. The team can work from a list, board, timeline, calendar, or project dashboard without duplicating the tasks.”

**On-screen actions**

- In the Tasklytic PSA group, open **Engagements**.
- Open **Riverstone Manufacturing — July 2026 Close & Advisory** and pause on the engagement summary long enough to show the client, active status, responsible lead, and WIP.
- Open the linked project and select **List** or **Board**.
- Slowly pan over the seven seeded tasks. Open **Review client evidence** for one beat so the task detail pane and its Comments / Activity / Time / Expenses tabs are visible.
- Close the pane and leave the project name visible for the transition.

**Optional on-screen callout**

> **One engagement record · Delivery + WIP + billing context**

### 1:15–2:05 — PBC: create a request list and link it to the project

**Dialogue**

> “From the same platform, I open Prepared by Client and create the close request list. I select Riverstone, start from our Monthly close and analytics template, set the reporting period and due date, and—most importantly—link this request list to the Tasklytic project we just saw.”

> “That keeps the evidence workflow connected to the engagement instead of creating another orphaned spreadsheet.”

**On-screen actions**

- Open **PBC** and click **New engagement**.
- Enter **Riverstone Manufacturing — July 2026 Close Evidence**.
- Select client **Riverstone Manufacturing**.
- Choose **Template · Monthly close and analytics**.
- Set period start **2026-07-01**, period end **2026-07-31**, and default due date **2026-08-07**.
- Under **Linked project management project**, select **Riverstone Manufacturing — July 2026 Close & Advisory**.
- Click **Create engagement**.
- On the engagement page, show the three requests: July bank statement, July cash GL detail, and June–July comparative operating expense detail.
- Scroll to **Client access**, click **Invite contact**, select **Coordinator**, and add Alex Rivera. Then click **Publish**.

**Editing note**

If the record is pre-created for reliability, recreate the form in a short insert shot and then cut to the published engagement.

### 2:05–2:55 — Client portal: submit the evidence

**Dialogue — presenter voice-over**

> “Alex does not need to trade attachments over email. The secure portal tells the client exactly what is expected, filters the file type, keeps every upload as a version, and keeps the conversation attached to the request.”

**Dialogue — Alex Rivera on camera or as a second voice**

> “I can see all three requests and the due date. I’ll upload the July bank statement first, add the accounting-system cash detail, and finish with the comparative expense report. Then I submit each item for review.”

**On-screen actions**

- Cut to the clean PBC client portal as Alex.
- Show the overall progress indicator and **Your requests** list.
- Select the bank-statement request; pause on expected filename/format and the empty **Evidence** area.
- Click **Upload**, select `Riverstone_Bank_Statement_2026-07.pdf`, then click **Submit for review**.
- Use quick cuts to repeat for the cash GL and comparative expense PDFs.
- End on all three requests showing **Submitted**.

### 2:55–3:40 — PBC: accept evidence and return to the linked project

**Dialogue**

> “Back on the firm side, the submissions are waiting for review. I can inspect each version, keep a client-visible conversation or an internal note, and either return the request with a reason or accept it.”

> “All three files agree to our request instructions, so I accept them. The engagement reaches 100 percent, and the linked-project shortcut takes me straight back to the delivery plan.”

**On-screen actions**

- Cut back to Jordan’s profile and open **PBC workspace**.
- Let the **Awaiting review** tile and engagement progress register on screen.
- Open the engagement, select each submitted request, briefly open/download the evidence, and click **Accept**.
- When all three are accepted, click **Check completeness** and show **Completeness check passed**.
- Click **Complete** in the engagement header.
- Click **Package** to download the evidence package for the workpapers.
- In **Client access**, click **Open linked project**; cut to Tasklytic and mark **Review client evidence** complete.

**Accuracy note for the presenter**

Say that the **PBC engagement** is linked to the Tasklytic project. Do not say the accepted PDFs are automatically copied into Tasklytic; the implemented link is an explicit project shortcut.

### 3:40–4:50 — UDA: turn accepted PDFs into structured rows

**Dialogue**

> “The evidence is accepted, but the source is still PDF. Universal Document Analysis converts those documents into reviewable rows. We use a saved cash-transaction template for the bank and GL reports, and an operating-expense template for the comparative report.”

> “The important control is that extraction is not a black box. I can browse by source file, inspect the row-level results, correct a cell, add a missed row, or delete one before anything moves into the analysis.”

**On-screen actions**

- Open **Universal Document Analysis → Jobs**.
- Open the preprocessed job **Riverstone July Bank — Structured** on **Results**.
- Show the bank PDF in the result tree and the nine editable transaction rows. Click into one harmless description cell, then press Escape without changing it.
- Click **Export Excel** and save as `Riverstone_July_Bank_Structured.xlsx`.
- Use two fast jump cuts:
  - **Riverstone July Cash GL — Structured** → nine rows → export `Riverstone_July_Cash_GL_Structured.xlsx`.
  - **Riverstone Jun–Jul OpEx — Structured** → 16 rows → export `Riverstone_Jun-Jul_OpEx_Structured.xlsx`.
- Keep field headers readable in each shot.

**Optional insert shot**

Show the UDA workflow header—**Upload · Fields · Review · Processing · Results**—for two seconds so viewers understand the full job lifecycle even though processing was completed before recording.

### 4:50–6:20 — Analytics: reconcile bank to GL

**Dialogue**

> “Now the PDFs have become clean source data. In Analytics, I create a July bank-to-GL reconciliation for Riverstone and assign the UDA exports as Source A and Source B. The app maps transaction date, description, and amount, while carrying the reference IDs through for matching.”

> “AI proposes ordered matching passes, including exact one-to-one matches and a one-to-many pass for batched deposits. Here, the $41,250 bank deposit is correctly grouped to the $25,000 and $16,250 customer receipts in the GL.”

> “The remaining exceptions are the actual accounting work: a $125 bank fee, $35 of interest, and a $4,250 outstanding check. Together they bridge the unadjusted GL balance to the bank balance exactly.”

**On-screen actions**

- Open **Analytics → Reconciliation** and click **New reconciliation**.
- Name it **Riverstone — July 2026 Bank to GL**; select Riverstone; click **Create & upload**.
- Upload `Riverstone_July_Bank_Structured.xlsx` as **Source A** and `Riverstone_July_Cash_GL_Structured.xlsx` as **Source B**.
- Confirm the auto-mapping for **Transaction Date**, **Description**, and **Amount**, then process the sources.
- On **Matching rules**, show the proposed passes and click **Run AI Match**. Cut to the saved result if the call takes longer than a few seconds.
- On **Matched**, open the $41,250 group and show the 1:Many relationship. Approve the group.
- On **Exceptions**, add concise notes:
  - Bank fee: **“Book July bank charge.”** Set to **Resolved**.
  - Interest: **“Book July interest income.”** Set to **Resolved**.
  - Outstanding check: **“Valid timing item; cleared August 3.”** Set to **Resolved**.
- Open **Summary** or **Reports** and show seven match groups plus the exception trail. Export the full reconciliation to Excel.
- Click **Submit for review**, then use the reviewer account or a prepared insert to **Approve** and **Finalize**.

**Optional on-screen callout**

> **9 bank rows · 9 GL rows · 7 match groups · 3 documented exceptions**

### 6:20–7:45 — Analytics: variance analysis and flux memo

**Dialogue**

> “Next, I use the structured comparative expense data for a month-over-month flux. This is a single dataset with both periods, so I map account, amount, period, department, and memo once.”

> “I set materiality to $5,000 or 20 percent and group by account and department. Before the analysis runs, the review step tells me how many rows will be flagged.”

> “The result focuses our attention on five drivers: the summer product launch, expedited freight, the ERP support renewal, implementation consulting, and a supplier site visit. I can accept or refine the explanations, then generate a formal flux memo from the reviewed results.”

**On-screen actions**

- Open **Analytics → Variance** and click **New analysis**.
- Name it **Riverstone — July 2026 OpEx Flux**, select Riverstone, and choose **Single dataset**.
- Upload `Riverstone_Jun-Jul_OpEx_Structured.xlsx`.
- On **Map columns**, map:
  - Account → `Account Name/Number`
  - Amount → `Amount`
  - Period / Date → `Period/Date`
  - Department / Class → `Class/Department`
  - Description / Memo → `Description/Memo`
- On **Thresholds**, set dollar **5000**, percent **20**, logic **Either ($ OR %)**, comparison type **MoM**, account type **Expense**, anchors **Account** and **Department**, base period **2026-06-01 through 2026-06-30**, and comparison period **2026-07-01 through 2026-07-31**.
- On **Review**, show 16 source rows aggregating to eight account/department groups and five expected flags. Click **Run analysis**.
- On **Results → Table**, show the five flagged accounts and click **Explain variances**.
- Open one row—Marketing works best—show the evidence-derived memo text, make a small wording refinement if desired, and accept it.
- Open **Charts** for a brief visual cut, then **Memo** and click **Generate memo**.
- Scroll slowly through methodology, material variances, and recommendations; click **Export → Word (.docx)** or **PDF**.
- Move the analysis from **In Review** to **Approved**, then **Finalized** using the appropriate reviewer shot.

**Optional on-screen callout**

> **June $94,600 → July $143,450 · $48,850 increase · 5 material drivers**

### 7:45–9:15 — Tasklytic: time, approval, billing, and invoice

**Dialogue**

> “The accounting work is complete, so we return to the same engagement to finish the commercial workflow. Time is recorded against the actual delivery tasks, which means the engagement, client, rate, and invoice context travel with the entry.”

> “I log two and a half hours for evidence review and the bank reconciliation, and one and a half hours for the flux analysis and memo. At the engagement rate of $200 per hour, Tasklytic calculates $800 of billable work.”

> “The week is submitted and approved, and those approved entries become available to the invoice wizard. I choose Riverstone, scope the invoice to this engagement, review the narratives, and create the draft. The source time is now tied to the invoice, and the invoice keeps its own approval and audit trail.”

**On-screen actions**

- Return to the Tasklytic project and mark **Extract accepted evidence**, **Reconcile cash**, and **Perform July OpEx flux** complete.
- Open the **Reconcile cash** task → **Time** → **Add time**. Enter **2:30 / 2.5 hours**, description **“PBC evidence review and July bank-to-GL reconciliation”**, keep **Billable** on, and save. Show the $200/hour rate and $500 amount.
- Open **Perform July OpEx flux** → **Time** → **Add time**. Enter **1:30 / 1.5 hours**, description **“July operating expense flux analysis and memo”**, keep **Billable** on, and save. Show $300.
- Open **PSA → Time → My week**. Show **4.00h billable** and **$800**; click **Submit week**.
- Cut to the approver’s **To approve** tab and approve the timesheet. If your role combines capabilities, use a clean insert that makes the status transition clear.
- Navigate directly to Tasklytic **Invoicing** from the prepared bookmark or route and click **Generate invoice**.
- In the five-step wizard:
  1. Client: **Riverstone Manufacturing**.
  2. Billing scope: **Riverstone Manufacturing — July 2026 Close & Advisory**.
  3. Period: **2026-07-01 to 2026-07-31**.
  4. Include both approved time entries; refine the two narratives if needed; show total **$800.00**.
  5. Due date: **2026-09-14**; notes: **“July close and advisory services.”**
- Click **Create invoice**, open **INV-2048**, and show the two lines, total, status **draft**, and audit history.
- Click **Download PDF**. If invoice approval is enabled, follow with a quick **Submit invoice → Approve invoice** insert; do not email a real address.

### 9:15–9:45 — Close

**Dialogue**

> “That was one engagement from plan to payment-ready invoice: Tasklytic organized the work, PBC collected and governed the evidence, Universal Document Analysis turned PDFs into data, Analytics completed the reconciliation and flux memo, and Tasklytic captured the time and billing.”

> “The value is not another isolated AI feature. It is an accounting workflow where the handoffs, review states, evidence, work, and economics stay visible in one platform.”

**On-screen actions**

- Use a five-shot recap: Tasklytic project, PBC 100% complete, UDA structured rows, Analytics finalized work, invoice PDF.
- End on a simple product-suite title card:

> **CPAAutomation**  
> **From client request to reviewed work to invoice.**

## Producer notes and fallback shots

- Record asynchronous steps as two shots: click the action, then cut to the completed result. Never accelerate a spinner while claiming the result was instantaneous.
- Keep a duplicate finalized reconciliation and variance analysis available. If a live AI response differs in wording, preserve the exact financial control totals and use manual review/refinement to align the explanation with the synthetic source notes.
- PBC can package accepted evidence, but the demo handoff into UDA is an explicit upload. UDA exports are then explicitly uploaded to Analytics. Describe these as controlled handoffs within the platform, not invisible automatic sync.
- The current Tasklytic sidebar exposes Time, Timesheets, Expenses, Clients, and Engagements in the PSA group, while the Invoicing route exists but may not be pinned in that group. Use a prepared bookmark/direct route for the invoicing segment unless navigation is updated before filming.
- Use the terms shown in the product: **Engagements** for an accounting-mode Tasklytic workspace; **Submitted / Accepted** in PBC; **Source A / Source B** in reconciliation; **Base period / Comparison period** in variance; **Draft / In Review / Approved / Finalized** for Analytics status.
- Avoid unsupported claims such as autonomous posting of journal entries, automatic file propagation between products, automatic Tasklytic task completion from PBC, or a single shared client master across every product.
