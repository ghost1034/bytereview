# Accounting One-Platform Demo Script

Target runtime: **10 minutes**  
Presenter: **Ian Stewart, Senior Accountant at Sterling & Brooks CPA**  
Fictional client: **Riverstone Manufacturing**  
Fictional client contact: **Ray Sang, Controller**

This is the presenter talk track for the workflow in
`demo/accounting-one-platform-demo-steps.md`. The detailed runbook remains the
source of truth for field values, clicks, and checkpoints.

## Recording approach

This should feel like one continuous client-service story, not a feature tour.
Use short jump cuts or 2–4x speed for repetitive form entry, uploads, task
creation, and processing waits. Return to normal speed for each result and
control checkpoint.

Do not skip an outcome checkpoint when shortening data entry. The audience
should see the engagement, evidence status, reconciliation results, flux
drivers, approved time, and approved invoice.

Before recording:

- Sign in as Ian Stewart and start at the CPAAutomation dashboard.
- Confirm the three synthetic PDFs in `demo/pdf/` and three structured Excel
  files in `demo/xlsx/` are available.
- Arrange the firm-side application and client portal in separate tabs.
- Use the reserved address `alex.rivera@riverstone.example`; never substitute a
  real email address.
- Clear or relocate earlier downloads with the same filenames so the three new
  exports are easy to verify.
- Keep all sensitive notifications, bookmarks, browser profiles, and unrelated
  client data out of frame.

All Riverstone data shown in this demo is synthetic. Do not record delivery of
the final invoice.

## Timing map

| Time | Story beat | Product area |
| --- | --- | --- |
| 0:00–0:30 | Introduce the end-to-end close | Dashboard |
| 0:30–1:35 | Establish the engagement and delivery plan | Tasklytic |
| 1:35–3:00 | Request and receive client evidence | PBC |
| 3:00–5:05 | Reconcile bank activity to the GL | Analytics — Reconciliation |
| 5:05–6:50 | Explain the July OpEx change | Analytics — Variance |
| 6:50–7:30 | Close the evidence workflow | PBC and Tasklytic |
| 7:30–8:35 | Capture and approve time | Tasklytic PSA |
| 8:35–9:35 | Generate and approve the invoice | Tasklytic PSA |
| 9:35–10:00 | Verify the connected end state | Tasklytic and downloads |

## Presenter script

### 0:00–0:30 — Open with the outcome

**On screen:** Start on the CPAAutomation dashboard. Move the pointer across
Tasklytic, PBC, and Analytics in the product navigation without opening them.

**Say:**

> I’m Ian Stewart, a senior accountant at Sterling & Brooks CPA. Today I’ll run
> Riverstone Manufacturing’s July close from request list to approved invoice
> in one platform. We’ll organize the engagement, collect evidence securely,
> reconcile cash, explain operating-expense movement, complete the review, and
> bill the work. Riverstone and every document and transaction in this demo are
> fictional.

**Transition:** Open **Tasklytic**.

### 0:30–1:35 — Establish the engagement and delivery plan

**On screen:** Create the Riverstone Manufacturing client. Create engagement
`ENG-2026-071 — Riverstone Manufacturing — July 2026 Close & Advisory`, with
practice area **Accounting**. Open its linked project.

**Say while entering the core fields:**

> I’ll begin in Tasklytic, where the commercial and delivery records stay
> connected. Riverstone is the client, and this engagement covers the July 2026
> close and advisory work. Creating the engagement also gives the team a linked
> project, so the work plan and the billing matter start from the same record.

**On screen — brief montage:** Add these seven tasks in List view:

1. `Build PBC list`
2. `Review client evidence`
3. `Extract accepted evidence`
4. `Reconcile cash`
5. `Perform July OpEx flux`
6. `Reviewer sign-off`
7. `Bill engagement`

Then create and assign rate card `Riverstone — Jordan Demo Rate` for **Senior
Accountant**, **$200 per hour**, effective **July 1, 2026**. Set invoice
numbering to prefix `INV-`, starting at `2048`, with net 30 terms.

**Say:**

> The linked project makes ownership and status visible from request setup
> through billing. I’ve added seven delivery tasks and assigned the engagement’s
> senior-accountant rate of two hundred dollars per hour. Invoice numbering and
> payment terms are governed once in billing controls.

**Checkpoint on screen:** Show the engagement as **active**, the linked project
as **On track**, the seven open tasks, and the assigned rate card.

**Transition:** Open **PBC**.

### 1:35–3:00 — Request and receive client evidence

**On screen — brief montage:** Create template `Monthly close and analytics`
for **Bookkeeping** with three requests:

- `July bank statement`
- `July cash GL detail`
- `June–July comparative operating expense detail`

Show the expected PDF filename on one request. Create PBC engagement
`Riverstone Manufacturing — July 2026 Close Evidence` from the template and
link it to the Tasklytic project. Set the July period, August 7 due date, and
invite Ray Sang as **Coordinator — all requests** using the reserved `.example`
address. Publish the engagement.

**Say:**

> In PBC, I’ll turn a reusable monthly-close template into Riverstone’s request
> list. Each request carries instructions, an expected format and filename, a
> period end, and a due date. The engagement is linked back to the delivery
> project, so evidence collection is part of the same workflow. Ray Sang, the
> fictional client controller, receives coordinator access to all three
> requests. Publishing moves the engagement to Active and the requests to Open.

**On screen:** From Ray’s client-access row, copy a new secure link and open it
in the client portal tab. Show `Welcome, Ray Sang`, the three requests due
**2026-08-07**, and `0 of 3 ready`.

**Say:**

> This is the client’s focused view: only the requests, instructions, dates,
> and evidence controls they need—without access to the firm workspace.

**On screen — brief montage:** Upload each matching PDF and click **Submit for
review**. End on the request list with all three requests **Submitted** and the
progress indicator showing all three ready for firm review.

**Say:**

> Ray uploads the bank statement, cash GL detail, and comparative expense
> report, then submits each item for review. The firm now has a clear handoff:
> all three files are received and ready, with no status chasing by email.

**Transition:** Return to the firm tab and open **Analytics → Reconciliation**.

### 3:00–5:05 — Reconcile bank activity to the GL

**On screen:** Create `Riverstone — July 2026 Bank to GL`. Upload
`Riverstone_July_Bank_Structured.xlsx` as Source A and
`Riverstone_July_Cash_GL_Structured.xlsx` as Source B. Show the automatic date,
description, and amount mappings; add and map `Reference ID`. Process and
validate.

**Say:**

> Next, I’ll reconcile the July bank activity to cash account 1010. For demo
> pacing, I’m using structured Excel exports prepared from the same synthetic
> source documents we just collected. The uploader maps transaction date,
> description, and amount, and I can preserve a reference ID as a custom
> attribute. Both sources pass validation before any matching begins.

**On screen:** Confirm each source contains **9 rows**. Show the four generated
passes—**Exact Match**, **Near Match**, **Group Match**, and **Complex Group
Match**—then click **Run AI Match**.

**Say during processing:**

> The engine proposes four matching passes, from exact transaction logic to
> grouped sum matching. That matters because not every real-world deposit is a
> one-to-one entry.

**On screen:** On Review results, deliberately point to:

- **83%** match rate
- **15 of 18** rows matched
- **7** matched groups
- **3** unmatched items and **3** exceptions
- **$4,160.00** remaining difference

Open **Matched (7)**. Show one one-to-one match and the July 18 **1:Many**
group: one **$41,250** bank deposit against **$25,000** and **$16,250** GL
receipts. Approve all seven groups using a jump cut after the first approval.

**Say:**

> Fifteen of eighteen rows match across seven groups. Six are one-to-one. The
> seventh is the key exception to simple matching: a single forty-one-thousand,
> two-hundred-fifty-dollar bank deposit equals two customer receipts of
> twenty-five thousand and sixteen thousand, two hundred fifty. I can inspect
> the supporting rows before approving every group.

**On screen:** Open **Exceptions (3)** and resolve each item with its note:

- Bank fee, **-$125** — `Book July bank charge.`
- Interest credit, **$35** — `Book July interest income.`
- Outstanding check, **-$4,250** — `Valid timing item; cleared August 3.`

**Say:**

> The remaining four-thousand, one-hundred-sixty-dollar source difference is
> fully explained by three reconciling items: a bank charge, interest income,
> and an outstanding check. I document the required entries and the valid timing
> item directly in the workpaper, then resolve each exception.

**On screen:** Export the full reconciliation to Excel, then **Submit for
review**, **Approve**, and **Finalize**. Show status **Finalized**.

**Say:**

> With every match approved and every exception documented, I export the full
> workpaper and move it through review, approval, and finalization with explicit
> status changes.

**Transition:** Open **Analytics → Variance**.

### 5:05–6:50 — Explain the July operating-expense change

**On screen:** Create `Riverstone — July 2026 OpEx Flux` in single-file mode.
Upload `Riverstone_Jun-Jul_OpEx_Structured.xlsx`. Show the account, amount,
period, memo, and department mappings and the successful validation of **16
rows** across **6 columns**.

**Say:**

> I’ll use the comparative operating-expense detail to explain what changed from
> June to July. The same controlled upload flow validates the source and maps
> the accounting dimensions needed for analysis.

**On screen:** Configure a **$5,000 OR 20%** threshold, comparison type **MoM**,
account type **Expense**, anchors **Account** and **Department**, June as the
base period, and July as the comparison period. Continue to review and pause on
the expected **8 grouped rows** and **5 flagged rows**, then run the analysis.

**Say:**

> I’ll flag a group when its movement is at least five thousand dollars or
> twenty percent. Anchoring by account and department preserves who owns the
> cost. Before execution, the review screen confirms the periods, thresholds,
> and the expected aggregation.

**On screen:** In Results → Table, point to the totals: June **$94,600**, July
**$143,450**, variance **$48,850**, with **5** of **8** groups flagged. Move the
pointer down the five flagged rows: Marketing, Freight, Software, Professional
Fees, and Travel.

**Say:**

> July expense increased forty-eight thousand, eight hundred fifty dollars,
> from ninety-four thousand, six hundred to one hundred forty-three thousand,
> four hundred fifty. Five groups meet the policy: Marketing, Freight,
> Software, Professional Fees, and Travel. Salaries, Rent, and Utilities remain
> below the combined threshold logic.

**On screen:** Click **Explain variances**. Open the Marketing explanation and
show evidence for the summer product launch. In a short montage, review and
accept all five explanations, ending with all five rows **Accepted**.

**Say:**

> Explanations stay grounded in the source memos: the summer product launch,
> expedited materials for the customer backlog, the annual ERP support renewal,
> an ERP consulting milestone, and a supplier qualification visit. I review and
> accept each explanation rather than treating generated text as final by
> default.

**On screen:** Generate the memo. Briefly show its periods, totals, material
drivers, methodology, and recommendations. **Submit for review**, **Approve**,
export to Word, and **Finalize**.

**Say:**

> The accepted analysis becomes a reviewable management memo with the period,
> methodology, totals, drivers, and recommendations carried through. I approve,
> export, and finalize it as a controlled deliverable.

**Transition:** Open **PBC**.

### 6:50–7:30 — Close the evidence workflow

**On screen:** Open the Riverstone PBC engagement. Accept the bank statement,
cash GL detail, and comparative OpEx report. Show **100%**, run **Check
completeness**, and show **Completeness check passed**. Complete the engagement,
then use **Open linked project**.

**Say:**

> Back in PBC, I verify and accept each source file. The engagement reaches one
> hundred percent, passes its completeness check, and moves to Completed. From
> here, the linked-project control takes me straight back to delivery.

**On screen:** In Tasklytic, complete the first six tasks. Leave **Bill
engagement** open. Show that the first six now offer **Mark incomplete** while
the billing task still offers **Mark complete**.

**Say:**

> I close the six finished delivery and review tasks, while deliberately leaving
> billing open until the invoice is created and approved.

### 7:30–8:35 — Capture and approve time

**On screen:** Open the **Reconcile cash** task and add **2.5 billable hours** on
July 31 with description `PBC evidence review and July bank-to-GL
reconciliation`. Show the inherited **$200** rate and **$500** amount. On
**Perform July OpEx flux**, add **1.5 billable hours** with description `July
operating expense flux analysis and memo`. Show the **$300** amount.

**Say:**

> Time entry inherits the engagement’s approved rate card. Two and a half hours
> for evidence review and the cash reconciliation produces five hundred
> dollars. One and a half hours for the flux analysis and memo produces three
> hundred dollars. No manual rate or amount entry is needed.

**On screen:** Go to **PSA → Time**, week **July 27–August 2**. Show both July 31
entries, **4.00 hours**, and **$800.00** billable. Submit the week, open **To
approve**, approve Ian Stewart’s timesheet, and confirm status **Approved** in
Timesheets or All entries.

**Say:**

> The weekly control total is four hours and eight hundred dollars. I submit the
> timesheet, then show the approval step here in the demo workspace. Only
> approved time will be available to invoice.

**Transition:** Open **PSA → Invoicing**.

### 8:35–9:35 — Generate and approve the invoice

**On screen:** Click **Generate invoice**. Select Riverstone, then matter
`ENG-2026-071`, and the July 1–31 billing period. Show both approved entries
selected, with no write-offs, tax, or discount, and a total of **$800.00**. Set
issue date **2026-08-17**, due date **2026-09-14**, presentation **Detailed**,
bill-to **Riverstone Manufacturing**, and note `July close and advisory
services.` Create the invoice.

**Say:**

> Invoice generation filters approved, unbilled time by client, engagement, and
> period. Both narratives flow through at their approved amounts. There are no
> write-offs, taxes, or discounts, so the invoice total remains eight hundred
> dollars. I’ll use a detailed presentation and add the July close and advisory
> note.

**On screen:** Open `INV-2048`. Point to the two lines:

- **2.5 × $200 = $500**
- **1.5 × $200 = $300**

Show the **$800** total and outstanding balance, the dates, notes, and audit
history. Download the PDF, then click **Submit invoice**. Show status
**Approved**. Do not click **Record delivery**.

**Say:**

> Invoice 2048 ties directly to the approved time: two and a half hours at two
> hundred dollars, plus one and a half hours at the same rate. The audit history
> records invoice generation. I download the PDF and submit the invoice into
> Approved status. I will not record delivery because this is a synthetic demo
> and no invoice should be sent.

### 9:35–10:00 — Verify the connected end state

**On screen:** Return to the linked project and complete **Bill engagement**.
Show all seven tasks complete. Then show, in quick succession, the final status
of each record and the three downloaded files.

**Say:**

> With the invoice approved, I can close the final billing task. We now have a
> completed PBC engagement at one hundred percent, a finalized bank
> reconciliation, a finalized OpEx flux analysis, an approved four-hour
> timesheet for eight hundred dollars, and approved invoice 2048 for the same
> amount. The reconciliation workbook, management memo, and invoice PDF are all
> preserved as outputs. That’s Riverstone’s July close—from client request to
> approved billing—managed as one connected workflow.

**Final frame:** Hold for two seconds on the completed seven-task project or a
clean view of the Riverstone engagement. Do not display the secure portal URL.

## Required final-state checklist

Before ending the recording, verify:

- PBC engagement `Riverstone Manufacturing — July 2026 Close Evidence` is
  **Completed** at **100%**.
- Reconciliation `Riverstone — July 2026 Bank to GL` is **Finalized**.
- Variance analysis `Riverstone — July 2026 OpEx Flux` is **Finalized**.
- The July timesheet is **Approved** for **4.00 hours** and **$800.00**.
- Invoice `INV-2048` is **Approved** for **$800.00**, with due date
  **2026-09-14** and **$800.00** outstanding.
- All seven Tasklytic project tasks are complete.
- These downloads exist:
  - `Riverstone_July_2026_Bank_to_GL_full_reconciliation_2026-08-17.xlsx`
  - `Riverstone_July_2026_OpEx_Flux_memo.docx`
  - `INV-2048.pdf`

## Presenter guardrails

- If a processing step takes more than a few seconds, cut the wait rather than
  filling it with unsupported performance claims.
- Describe AI output as proposed or generated until a person reviews and accepts
  it.
- Do not claim that evidence moves into Analytics automatically; this workflow
  uploads prepared structured exports from the same synthetic source documents.
- Do not expose Ray’s secure portal link, even though the data is fictional.
- Do not click **Record delivery** or enter a real recipient address.
- If a displayed total or status differs from this script, stop and correct the
  demo state using the detailed runbook before continuing.
