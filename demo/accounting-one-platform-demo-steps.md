# Accounting One-Platform Demo Steps

This runbook reproduces the complete Riverstone Manufacturing demo from setup through the approved invoice. Use the exact names, dates, labels, and values below.

## Prerequisites

1. Open Google Chrome with the ChatGPT browser extension connected.
2. In `chrome://extensions`, open **Details** for the ChatGPT browser extension and enable **Allow access to file URLs**.
3. Sign in to CPAAutomation and open `https://cpaautomation.ai/dashboard`.
4. Confirm these source files exist in `demo/pdf/`:
   - `Riverstone_Bank_Statement_2026-07.pdf`
   - `Riverstone_GL_Cash_Detail_2026-07.pdf`
   - `Riverstone_Comparative_Operating_Expense_Detail_Jun-Jul_2026.pdf`

## 1. Create the Tasklytic client

1. From the CPAAutomation dashboard, click **Tasklytic** in the product navigation.
2. Wait for **Ian's Workspace** to load.
3. In the Tasklytic sidebar, open **PSA → Clients**.
4. Click **New client**.
5. Enter the following:
   - **Name:** `Riverstone Manufacturing`
   - **Type:** `business`
   - **Contact email:** leave blank
   - **Payment terms:** `net_30`
   - **Default rate card:** `No default rate card`
   - **Billing currency:** `USD`
6. Click **Save**.
7. Confirm `Riverstone Manufacturing` appears in the Clients table.

## 2. Create the Tasklytic engagement and linked project

1. In the Tasklytic sidebar, open **PSA → Engagements**.
2. Click **New engagement**.
3. Enter the following:
   - **Engagement name:** `Riverstone Manufacturing — July 2026 Close & Advisory`
   - **Engagement number:** `ENG-2026-071`
   - **Client:** `Riverstone Manufacturing`
   - **Practice area:** `Accounting`
   - **Rate card:** `Client / workspace default`
   - **Budget hours:** leave blank
   - **Budget amount:** leave blank
   - **UTBMS codes:** on
   - **Trust accounting:** off
4. Click **Create**.
5. Confirm the Engagements table shows:
   - Number `ENG-2026-071`
   - Client `Riverstone Manufacturing`
   - Practice `Accounting`
   - Responsible person `Ian Stewart`
   - Status `active`
6. Open the engagement and confirm its linked Tasklytic project is named `Riverstone Manufacturing — July 2026 Close & Advisory` and displays **On track**.

## 3. Add the seven delivery tasks

1. Open the linked project `Riverstone Manufacturing — July 2026 Close & Advisory`.
2. Stay on the **List** view.
3. Click **Add task** and create each of the following tasks, one at a time:
   1. `Build PBC list`
   2. `Review client evidence`
   3. `Extract accepted evidence`
   4. `Reconcile cash`
   5. `Perform July OpEx flux`
   6. `Reviewer sign-off`
   7. `Bill engagement`
4. Leave every task incomplete and in the initial open/no-section state.
5. Confirm each task appears exactly once in the project.

## 4. Configure the $200 billing rate

1. Open the Tasklytic workspace's **Billing settings** page under **Settings → Billing controls**.
2. Select the **Rate cards** tab.
3. Enter the following:
   - **Rate card name:** `Riverstone — Jordan Demo Rate`
   - **Role:** `Senior Accountant`
   - **Hourly rate:** `200`
   - **Currency:** `USD`
   - **Effective from:** `2026-07-01`
4. Click **Create rate card**.
5. Confirm the card displays `Senior Accountant` at `$200.00/hr` and is effective `2026-07-01`.
6. Return to **PSA → Engagements** and open `Riverstone Manufacturing — July 2026 Close & Advisory`.
7. Click **Edit engagement**.
8. Set **Rate card** to `Riverstone — Jordan Demo Rate`.
9. Click **Save changes**.
10. Confirm the engagement uses `Riverstone — Jordan Demo Rate` before continuing.

## 5. Configure invoice numbering

1. On **Billing settings**, select the **Invoicing** tab.
2. Set:
   - **Invoice prefix:** `INV-`
   - **Starting number:** `2048`
   - **Default payment terms:** `net 30`
3. Leave the remaining settings at their current defaults.
4. Click **Save invoicing settings**.

## 6. Create the PBC template

1. Click **PBC** in the CPAAutomation product navigation.
2. Click **Templates** in the PBC workspace.
3. Click **New template**.
4. Enter:
   - **Template name:** `Monthly close and analytics`
   - **Engagement type:** `Bookkeeping`
   - **Description:** `Monthly close evidence for cash reconciliation and comparative operating expense analytics.`
5. Click **Add the first request**.
6. Configure request 1:
   - **Category:** `Cash`
   - **Title:** `July bank statement`
   - **Client instructions:** `Upload the July 1–31, 2026 operating checking bank statement as a PDF.`
   - **Priority:** `Normal`
   - **Expected formats:** `pdf`
   - **Expected filename:** `Riverstone_Bank_Statement_2026-07.pdf`
   - Leave the remaining fields blank or off.
7. Click **Add** and configure request 2:
   - **Category:** `Cash`
   - **Title:** `July cash GL detail`
   - **Client instructions:** `Upload Cash GL Detail for account 1010 covering July 1–31, 2026 as a PDF.`
   - **Priority:** `Normal`
   - **Expected formats:** `pdf`
   - **Expected filename:** `Riverstone_GL_Cash_Detail_2026-07.pdf`
   - Leave the remaining fields blank or off.
8. Click **Add** and configure request 3:
   - **Category:** `Expenses`
   - **Title:** `June–July comparative operating expense detail`
   - **Client instructions:** `Upload comparative operating expense detail for June and July 2026 as a PDF.`
   - **Priority:** `Normal`
   - **Expected formats:** `pdf`
   - **Expected filename:** `Riverstone_Comparative_Operating_Expense_Detail_Jun-Jul_2026.pdf`
   - Leave the remaining fields blank or off.
9. Click **Create template**.
10. Confirm the success message says `Monthly close and analytics is ready to use for new PBC engagements.`

## 7. Create and link the PBC engagement

1. Return to **PBC workspace**.
2. Click **New engagement**.
3. Enter:
   - **Engagement name:** `Riverstone Manufacturing — July 2026 Close Evidence`
   - **Client:** `Riverstone Manufacturing`
   - **Start request list from:** `Template · Monthly close and analytics`
   - **Linked project management project:** `Riverstone Manufacturing — July 2026 Close & Advisory`
   - **Period start:** `2026-07-01`
   - **Period end:** `2026-07-31`
   - **Default due date:** `2026-08-07`
4. Click **Create engagement**.
5. Open `Riverstone Manufacturing — July 2026 Close Evidence`.
6. Confirm the request list contains exactly three requests:
   - `PBC-001 — July bank statement`
   - `PBC-002 — July cash GL detail`
   - `PBC-003 — June–July comparative operating expense detail`
7. In **Client access**, confirm **Open linked project** points to the Tasklytic project created above.

## 8. Set each request's dates

Perform the following for each of `PBC-001`, `PBC-002`, and `PBC-003`:

1. Select the request.
2. Click **Edit all details**.
3. Enter:
   - **Due date:** `2026-08-07`
   - **Period end:** `2026-07-31`
4. Leave the owner as `Ian Stewart` and retain all other configured values.
5. Click **Save changes**.
6. Confirm the request row shows due date `2026-08-07`.

## 9. Invite the fictional client coordinator

1. In **Client access**, click **Invite contact**.
2. Enter:
   - **Name:** `Alex Rivera`
   - **Email:** `alex.rivera@riverstone.example`
   - **Role:** `Coordinator — all requests`
3. Click **Add contact and send link**.
4. Confirm Alex Rivera appears with:
   - Role `Coordinator`
   - Access `All requests`
   - `Full engagement access`

The `.example` domain is reserved and keeps this synthetic demo contact non-deliverable.

## 10. Publish the PBC engagement

1. Click **Publish**.
2. Confirm the engagement status changes from **Draft** to **Active**.
3. Confirm all three requests change from **Draft** to **Open**.
4. Confirm each request still shows due date `2026-08-07` and period end `2026-07-31`.

## 11. Open the secure client portal

1. In Alex Rivera's client-access row, open **More controls for Alex Rivera**.
2. Click **Copy new link**.
3. Open the copied link in a new Chrome tab.
4. Wait for the secure PBC portal to load.
5. Confirm the portal says `Welcome, Alex Rivera.`
6. Confirm **Your requests** lists all three items with due date `2026-08-07`.
7. Confirm the progress indicator shows `0 of 3 ready` before uploading.

## 12. Upload and submit the three PDFs

### PBC-001 — July bank statement

1. Select **PBC-001 — July bank statement**.
2. Confirm the portal shows:
   - Expected filename `Riverstone_Bank_Statement_2026-07.pdf`
   - Expected format `.pdf`
   - Period end `2026-07-31`
3. Click **Upload**.
4. Select `demo/pdf/Riverstone_Bank_Statement_2026-07.pdf`.
5. Wait for the uploaded version to appear under **Evidence**.
6. Click **Submit for review**.
7. Confirm the request status changes to **Submitted**.

### PBC-002 — July cash GL detail

1. Select **PBC-002 — July cash GL detail**.
2. Click **Upload**.
3. Select `demo/pdf/Riverstone_GL_Cash_Detail_2026-07.pdf`.
4. Wait for the uploaded version to appear under **Evidence**.
5. Click **Submit for review**.
6. Confirm the request status changes to **Submitted**.

### PBC-003 — June–July comparative operating expense detail

1. Select **PBC-003 — June–July comparative operating expense detail**.
2. Click **Upload**.
3. Select `demo/pdf/Riverstone_Comparative_Operating_Expense_Detail_Jun-Jul_2026.pdf`.
4. Wait for the uploaded version to appear under **Evidence**.
5. Click **Submit for review**.
6. Confirm the request status changes to **Submitted**.

## 13. Verify the handoff state

1. Confirm all three portal requests show **Submitted**.
2. Confirm the portal progress indicates all three items are ready for firm review.
3. Leave both tabs open:
   - The secure client portal showing the submitted request list.
   - The firm-side PBC engagement ready to review the evidence.

## 14. Confirm the UDA Excel exports are available

Before starting Analytics, confirm these three files exist in `demo/xlsx/`:

1. `Riverstone_July_Bank_Structured.xlsx`
2. `Riverstone_July_Cash_GL_Structured.xlsx`
3. `Riverstone_Jun-Jul_OpEx_Structured.xlsx`

## 15. Create the July bank-to-GL reconciliation

1. In the CPAAutomation product navigation, open **Analytics → Reconciliation**.
2. Wait for the Reconciliation workspace to finish loading.
3. Click **New reconciliation**.
4. Enter:
   - **Name:** `Riverstone — July 2026 Bank to GL`
   - **Client:** `Riverstone Manufacturing`
5. Click **Create & upload**.
6. Confirm the reconciliation opens with status **Draft** on workflow step **1 Upload sources**.

## 16. Upload and map the reconciliation sources

1. In the reconciliation uploader, click **Browse Files**.
2. Select both files:
   - `demo/xlsx/Riverstone_July_Bank_Structured.xlsx`
   - `demo/xlsx/Riverstone_July_Cash_GL_Structured.xlsx`
3. Confirm the files are assigned as follows:
   - `Riverstone_July_Bank_Structured.xlsx` → **Source A**
   - `Riverstone_July_Cash_GL_Structured.xlsx` → **Source B**
4. For both files, leave **Sheet1** selected.
5. Leave **Date Format** set to `Auto-detect (YYYY-MM-DD)`.
6. Confirm the required columns are auto-mapped for both Source A and Source B:
   - **Transaction Date** → `Transaction Date`
   - **Description** → `Description`
   - **Amount** → `Amount`
7. Click **Add Custom Attribute Column**.
8. Enter **Custom Column Name** as `Reference ID`.
9. Map the custom column for both sources:
   - **Source A Column:** `Reference ID`
   - **Source B Column:** `Reference ID`
10. Click **Process & Validate**.
11. Confirm the page displays **Validation Passed** and `All records are valid and ready to process.`
12. Click **Confirm & Process**.
13. Confirm the page displays **Upload Successful**.
14. Click **View Results**.

## 17. Generate and run the reconciliation matching passes

1. On **2 Matching rules**, confirm the source totals are:
   - **Source A:** `9` rows
   - **Source B:** `9` rows
2. Wait for the app to generate four matching passes:
   1. `Exact Match`
   2. `Near Match`
   3. `Group Match`
   4. `Complex Group Match`
3. Confirm the generated passes include exact amount/date logic and sum-match logic for grouped transactions.
4. Click **Run AI Match**.
5. Wait for all four passes to finish.
6. Confirm **3 Review results** shows:
   - **Match rate:** `83%`
   - **Rows matched:** `15 of 18`
   - **Matched groups:** `7`
   - **Unmatched items:** `3`
   - **Source A unmatched:** `2`
   - **Source B unmatched:** `1`
   - **Remaining difference:** `$4,160.00`
   - **Exceptions:** `3`

## 18. Review and approve the seven match groups

1. Select the **Matched (7)** tab.
2. Review the six one-to-one match groups:
   - July 2 customer receipt for `$52,000.00`
   - July 3 payroll for `-$28,400.00`
   - July 7 Steelworks vendor payment for `-$12,750.00`
   - July 10 customer receipt for `$18,500.00`
   - July 15 ERP Cloud subscription for `-$3,600.00`
   - July 25 facility rent for `-$8,000.00`
3. Review the one-to-many match group dated July 18:
   - **Source A:** `BATCH CUSTOMER DEPOSIT` for `$41,250.00`
   - **Source B:** `Customer receipt INV-1048` for `$25,000.00`
   - **Source B:** `Customer receipt INV-1051` for `$16,250.00`
4. Confirm the two Source B receipts total `$41,250.00` and the group is identified as **1:Many**.
5. Click **Approve** on each of the seven match groups.
6. Confirm no match group remains in the suggested/unapproved state.

## 19. Document and resolve the three reconciliation exceptions

1. Select the **Exceptions (3)** tab.
2. For the `BANK_FEE` exception dated `2026-07-28` for `-$125.00`:
   - Enter note `Book July bank charge.`
   - Set **Status** to `Resolved`.
3. For the `MISSING` exception dated `2026-07-31` for `$35.00`:
   - Enter note `Book July interest income.`
   - Set **Status** to `Resolved`.
4. For the `TIMING` exception dated `2026-07-31` for `-$4,250.00`:
   - Enter note `Valid timing item; cleared August 3.`
   - Set **Status** to `Resolved`.
5. Confirm all three exceptions display **Resolved** and retain their notes.

## 20. Export and finalize the reconciliation

1. Select the **Reports** tab.
2. Under **Full reconciliation**, click **Export**.
3. Select **Excel (.xlsx)**.
4. Confirm Chrome downloads:
   - `Riverstone_July_2026_Bank_to_GL_full_reconciliation_2026-08-17.xlsx`
5. Click **Submit for review**.
6. Confirm the reconciliation status changes to **In review**.
7. Click **Approve**.
8. Confirm the status changes to **Approved**.
9. Click **Finalize**.
10. Confirm the status changes to **Finalized**.

## 21. Create the July operating-expense flux analysis

1. In the Analytics navigation, open **Variance**.
2. Wait for the **Variance & Flux Analysis** workspace to load.
3. Click **New variance analysis**.
4. Enter:
   - **Name:** `Riverstone — July 2026 OpEx Flux`
   - **Client:** `Riverstone Manufacturing`
   - **Upload mode:** `Single file`
5. Click **Create & upload**.
6. Confirm the analysis opens with status **Draft** on workflow step **1 Upload GL**.

## 22. Upload and map the comparative OpEx data

1. Click **Browse Files**.
2. Select `demo/xlsx/Riverstone_Jun-Jul_OpEx_Structured.xlsx`.
3. Leave **Sheet1** selected.
4. Confirm these upload mappings:
   - **Account Name/Number** → `Account Name/Number`
   - **Amount** → `Amount`
   - **Period/Date** → `Period/Date`
   - **Description/Memo** → `Description/Memo`
   - **Class/Department (Optional)** → `Class/Department`
5. Click **Process & Validate**.
6. Confirm the page displays **Validation Passed**.
7. Click **Confirm & Process**.
8. Confirm the page displays **Upload Successful**.
9. Click **View Results**.
10. On **2 Map columns**, confirm:
    - **Account:** `Account Name/Number`
    - **Amount:** `Amount`
    - **Period / Date:** `Period/Date`
    - **Department / Class:** `Class/Department`
    - **Description / Memo:** `Description/Memo`
11. Confirm the source summary says `16 row(s) parsed across 6 column(s).`
12. Click **Continue to thresholds**.

## 23. Configure the July OpEx flux thresholds and periods

1. On **3 Thresholds**, set:
   - **Dollar threshold ($):** `5000`
   - **Percent threshold (%):** `20`
   - **Flag when:** `Either ($ OR %)`
   - **Comparison type:** `MoM`
   - **Account type:** `Expense`
2. Under **Analysis anchors**, select both:
   - `Account`
   - `Department`
3. Under **Period date ranges**, enter:
   - **Base start:** `06/01/2026`
   - **Base end:** `06/30/2026`
   - **Comparison start:** `07/01/2026`
   - **Comparison end:** `07/31/2026`
4. Leave **Positive values are** set to `Debit`.
5. Click **Continue to review**.
6. On **4 Review**, confirm:
   - **Upload mode:** `Single file`
   - **Rows:** `16`
   - **Columns:** `6`
   - **Dollar threshold:** `$5,000.00`
   - **Percent threshold:** `20%`
   - **Logic:** `Either`
   - **Account type:** `Expense`
   - **Anchors:** `Account` and `Department`
   - **Comparison type:** `MoM`
   - **Base period:** `2026-06-01 → 2026-06-30`
   - **Comparison period:** `2026-07-01 → 2026-07-31`
7. Confirm the expected result says the aggregation will produce `8` grouped rows and `5` flagged rows.
8. Stop before clicking **Run analysis**.

## 24. Run the July OpEx flux analysis

1. On **4 Review**, click **Run analysis**.
2. Wait for the analysis to finish and for **5 Results** to load.
3. Open the **Table** tab.
4. Confirm the analysis contains `8` account-and-department groups and `5` flagged groups.
5. Confirm the summary totals are:
   - **June base-period expense:** `$94,600.00`
   - **July comparison-period expense:** `$143,450.00`
   - **Total variance:** `$48,850.00`
6. Confirm the five flagged groups are:
   - `6100 Marketing` — `Sales & Marketing`: `$12,000.00` to `$29,500.00`; increase `$17,500.00`
   - `6200 Freight` — `Operations`: `$18,500.00` to `$27,800.00`; increase `$9,300.00`
   - `6300 Software` — `G&A`: `$6,200.00` to `$9,800.00`; increase `$3,600.00`
   - `6400 Professional Fees` — `G&A`: `$4,500.00` to `$16,500.00`; increase `$12,000.00`
   - `6700 Travel` — `Operations`: `$1,200.00` to `$5,900.00`; increase `$4,700.00`
7. Confirm the remaining three groups are not flagged:
   - `6000 Salaries` — `Operations`
   - `6500 Rent` — `Operations`
   - `6600 Utilities` — `Operations`

## 25. Generate and accept the five variance explanations

1. On **Results → Table**, click **Explain variances**.
2. Wait for explanations to finish generating for all five flagged groups.
3. Open `6100 Marketing — Sales & Marketing`.
4. Confirm its supporting evidence refers to the `July summer product launch campaign`.
5. Review the generated explanation and click **Accept**.
6. Open `6200 Freight — Operations`.
7. Confirm its supporting evidence refers to `July expedited inbound materials for customer backlog`.
8. Review the generated explanation and click **Accept**.
9. Open `6300 Software — G&A`.
10. Confirm its supporting evidence refers to the `July annual ERP support renewal`.
11. Review the generated explanation and click **Accept**.
12. Open `6400 Professional Fees — G&A`.
13. Confirm its supporting evidence refers to the `July ERP implementation consulting milestone`.
14. Review the generated explanation and click **Accept**.
15. Open `6700 Travel — Operations`.
16. Confirm its supporting evidence refers to the `July supplier qualification site visit`.
17. Review the generated explanation and click **Accept**.
18. Return to the table and confirm all five flagged rows show status **Accepted**.

## 26. Generate, approve, export, and finalize the flux memo

1. Open the **Memo** tab.
2. Click **Generate memo**.
3. Wait for the memo to finish generating.
4. Confirm the memo identifies:
   - Client `Riverstone Manufacturing`
   - Analysis `Riverstone — July 2026 OpEx Flux`
   - Base period `2026-06-01` through `2026-06-30`
   - Comparison period `2026-07-01` through `2026-07-31`
   - June expense `$94,600.00`
   - July expense `$143,450.00`
   - Increase `$48,850.00`
   - Five material drivers
5. Review the memo's methodology, material-variance discussion, and recommendations.
6. Click **Submit for review**.
7. Confirm the analysis status changes from **Draft** to **In Review**.
8. Click **Approve**.
9. Confirm the status changes to **Approved**.
10. Return to **Memo** and click **Export**.
11. Select **Word (.docx)**.
12. Confirm Chrome downloads `Riverstone_July_2026_OpEx_Flux_memo.docx`.
13. Click **Finalize**.
14. Confirm the analysis status changes to **Finalized**.

## 27. Accept and complete the PBC engagement

1. Open **PBC** from the product navigation.
2. Open `Riverstone Manufacturing — July 2026 Close Evidence`.
3. Confirm all three requests are **Submitted** and awaiting firm review.
4. Select `PBC-001 — July bank statement`.
5. Confirm its evidence contains `Riverstone_Bank_Statement_2026-07.pdf`, then click **Accept**.
6. Select `PBC-002 — July cash GL detail`.
7. Confirm its evidence contains `Riverstone_GL_Cash_Detail_2026-07.pdf`, then click **Accept**.
8. Select `PBC-003 — June–July comparative operating expense detail`.
9. Confirm its evidence contains `Riverstone_Comparative_Operating_Expense_Detail_Jun-Jul_2026.pdf`, then click **Accept**.
10. Confirm all three requests show **Accepted** and engagement progress reaches `100%`.
11. Click **Check completeness**.
12. Confirm the result says **Completeness check passed**.
13. Click **Complete** in the engagement header.
14. Confirm the engagement status changes to **Completed** and no request remains in **Awaiting review**.
15. In **Client access**, click **Open linked project** to return to `Riverstone Manufacturing — July 2026 Close & Advisory` in Tasklytic.

## 28. Complete the six finished delivery tasks

1. In the Tasklytic project, stay on **List** view and make sure completed tasks are visible.
2. Click **Mark complete** for each of the following tasks:
   1. `Build PBC list`
   2. `Review client evidence`
   3. `Extract accepted evidence`
   4. `Reconcile cash`
   5. `Perform July OpEx flux`
   6. `Reviewer sign-off`
3. Leave `Bill engagement` incomplete until the invoice has been created and approved.
4. Confirm the first six tasks show **Mark incomplete**, indicating that they are complete.
5. Confirm `Bill engagement` still shows **Mark complete**.

## 29. Log 2.5 hours to Reconcile cash

1. Click the `Reconcile cash` task name.
2. Open the task's **Time** tab.
3. Click **Add time**.
4. Enter:
   - **Date:** `2026-07-31`
   - **Duration:** `2:30` / `2.5 hours`
   - **Description:** `PBC evidence review and July bank-to-GL reconciliation`
   - **Billable:** on
   - **Rate override:** leave blank
5. Confirm the configured rate is `$200.00` per hour.
6. Confirm the calculated billable amount is `$500.00`.
7. Click **Save**.
8. Confirm the time entry appears on the task with date `2026-07-31`, duration `2:30`, and amount `$500.00`.

## 30. Log 1.5 hours to Perform July OpEx flux

1. Close the `Reconcile cash` task and open `Perform July OpEx flux`.
2. Open the task's **Time** tab.
3. Click **Add time**.
4. Enter:
   - **Date:** `2026-07-31`
   - **Duration:** `1:30` / `1.5 hours`
   - **Description:** `July operating expense flux analysis and memo`
   - **Billable:** on
   - **Rate override:** leave blank
5. Confirm the configured rate is `$200.00` per hour.
6. Confirm the calculated billable amount is `$300.00`.
7. Click **Save**.
8. Confirm the time entry appears on the task with date `2026-07-31`, duration `1:30`, and amount `$300.00`.

## 31. Submit and approve the July timesheet

1. In the Tasklytic sidebar, open **PSA → Time**.
2. On **My week**, click **Prev week** until the displayed week starts `2026-07-27` and ends `2026-08-02`.
3. Confirm the weekly grid shows both entries on `07-31`:
   - `Reconcile cash` — `2.50`
   - `Perform July OpEx flux` — `1.50`
4. Confirm the daily and weekly total is `4.00` hours.
5. Confirm **Billable amount** is `$800.00`.
6. Click **Submit week**.
7. In the **Submit timesheet** dialog, confirm:
   - Period `2026-07-27 — 2026-08-02`
   - Total `4.00` hours
   - Both July 31 entries are included
8. Click **Submit week** in the dialog.
9. Confirm the page displays `Timesheet submitted — awaiting approval` and the weekly grid is read-only.
10. Remain signed in as `Ian Stewart` and open the **To approve** tab.
11. Locate Ian Stewart's timesheet for `2026-07-27 — 2026-08-02` showing `4.00h · $800.00`.
12. Click **Approve**.
13. Confirm the approval queue no longer contains the timesheet.
14. Open **PSA → Timesheets** and confirm the timesheet status is **Approved**.
15. Return to **PSA → Time → All entries** and confirm both July 31 entries show status **Approved**.

## 32. Generate the Riverstone invoice

1. In the Tasklytic sidebar, open **PSA → Invoicing**.
2. Click **Generate invoice**.
3. On step 1 of the wizard, select client `Riverstone Manufacturing` and click **Next**.
4. On step 2, select billing scope `Matter ENG-2026-071 — Riverstone Manufacturing — July 2026 Close & Advisory` and click **Next**.
5. On step 3, confirm or enter:
   - **Period start:** `2026-07-01`
   - **Period end:** `2026-07-31`
6. Click **Next**.
7. On step 4, confirm both approved time entries are selected:
   - `PBC evidence review and July bank-to-GL reconciliation` — `$500.00`
   - `July operating expense flux analysis and memo` — `$300.00`
8. Leave both narratives unchanged.
9. Leave both **Write off** checkboxes off.
10. Leave **Tax** at `0`.
11. Leave **Discount** at `0` and **Discount reason** blank.
12. Confirm the invoice total is `$800.00`.
13. Click **Next**.
14. On step 5, enter or confirm:
   - **Issue date:** `2026-08-17`
   - **Due date:** `2026-09-14`
   - **Line presentation:** `Detailed`
   - **Bill-to name:** `Riverstone Manufacturing`
   - **Invoice notes:** `July close and advisory services.`
15. Leave the remaining optional bill-to fields blank unless they are already populated from the client record.
16. Review the invoice preview and confirm the two lines and `$800.00` total.
17. Click **Create invoice**.
18. Confirm the invoice list shows:
   - **Invoice:** `INV-2048`
   - **Client:** `Riverstone Manufacturing`
   - **Status:** `Draft`
   - **Due:** `2026-09-14`
   - **Total:** `$800.00`
   - **Outstanding:** `$800.00`

## 33. Verify, download, and approve INV-2048

1. Open `INV-2048`.
2. Confirm the invoice header shows:
   - Status **Draft**
   - Client `Riverstone Manufacturing`
   - Issue date `2026-08-17`
   - Due date `2026-09-14`
3. Confirm the invoice contains exactly two lines:
   - `PBC evidence review and July bank-to-GL reconciliation` — quantity `2.5`, rate `$200.00`, amount `$500.00`
   - `July operating expense flux analysis and memo` — quantity `1.5`, rate `$200.00`, amount `$300.00`
4. Confirm:
   - Discount `$0.00`
   - Total `$800.00`
   - Outstanding balance `$800.00`
   - Notes `July close and advisory services.`
5. Confirm **Audit history** includes the invoice-generation event.
6. Click **Download PDF**.
7. Confirm Chrome downloads `INV-2048.pdf`.
8. Click **Submit invoice**.
9. Confirm the invoice status changes to **Approved**.
10. Do not click **Record delivery** and do not send the invoice to a real address.
11. Return to the invoice list and confirm `INV-2048` shows status **Approved**, due date `2026-09-14`, total `$800.00`, and outstanding `$800.00`.

## 34. Complete the final billing task and verify the end state

1. Return to `Riverstone Manufacturing — July 2026 Close & Advisory`.
2. On **List** view, click **Mark complete** for `Bill engagement`.
3. Confirm `Bill engagement` now shows **Mark incomplete**.
4. Confirm all seven project tasks are complete:
   1. `Build PBC list`
   2. `Review client evidence`
   3. `Extract accepted evidence`
   4. `Reconcile cash`
   5. `Perform July OpEx flux`
   6. `Reviewer sign-off`
   7. `Bill engagement`
5. Confirm the final workflow state:
   - PBC engagement `Riverstone Manufacturing — July 2026 Close Evidence` is **Completed** at `100%`.
   - Reconciliation `Riverstone — July 2026 Bank to GL` is **Finalized**.
   - Variance analysis `Riverstone — July 2026 OpEx Flux` is **Finalized**.
   - The July timesheet is **Approved** for `4.00` hours and `$800.00`.
   - Invoice `INV-2048` is **Approved** for `$800.00` and is due `2026-09-14`.
6. Confirm the final downloaded artifacts exist:
   - `Riverstone_July_2026_Bank_to_GL_full_reconciliation_2026-08-17.xlsx`
   - `Riverstone_July_2026_OpEx_Flux_memo.docx`
   - `INV-2048.pdf`
