# Chrona demo script — billable time without timers

## Producer setup: timeline cards to generate

This section is for demo preparation only. Do not show it or refer to generated data in the recording.

Use one date throughout the demo (`DEMO_DATE`) and pair the device as **Jordan's MacBook Pro**. Configure these categories before loading the cards:

- **Billable** — subcategories: Harbor Manufacturing, Redwood Dental Group, Northstar Ventures
- **Non-billable** — subcategories: Firm Administration, Internal Meetings
- **Personal**
- **Idle**

| # | Time | Duration | Initial category | Initial subcategory | Card title | Summary | App/site metadata |
|---:|---|---:|---|---|---|---|---|
| 1 | 8:30–8:50 AM | 20m | Non-billable | Firm Administration | Plan the day and triage inbox | Reviewed overnight messages, prioritized client deadlines, and mapped the day's work. | Outlook, CPAAutomation |
| 2 | 8:50–10:20 AM | 1h 30m | Billable | Harbor Manufacturing | Reconcile Harbor Manufacturing operating accounts | Matched bank activity to the general ledger and cleared reconciling items for the month-end close. | Excel, NetSuite |
| 3 | 10:20–10:35 AM | 15m | Non-billable | Internal Meetings | Daily team check-in | Confirmed engagement priorities, open questions, and ownership for the day. | Microsoft Teams |
| 4 | 10:35 AM–12:05 PM | 1h 30m | Billable | Harbor Manufacturing | Investigate inventory and freight variance | Analyzed the month-over-month variance, traced freight postings, and documented the likely drivers. | Excel, NetSuite |
| 5 | 12:05–12:45 PM | 40m | Personal | — | Lunch | Stepped away for lunch. | — |
| 6 | 12:45–2:15 PM | 1h 30m | Billable | Redwood Dental Group | Review Redwood Dental tax workpapers | Reviewed fixed-asset additions, tied supporting schedules, and noted follow-up items for the client. | CCH Axcess, Excel |
| 7 | 2:15–2:30 PM | 15m | Non-billable | Firm Administration | Inbox and engagement administration | Responded to internal messages and organized open engagement items. | Outlook, CPAAutomation |
| 8 | 2:30–3:25 PM | 55m | **Non-billable** | **—** | Redwood client call and follow-up | Discussed missing fixed-asset support with the controller, then documented decisions and sent the request list. | Microsoft Teams, Outlook |
| 9 | 3:25–3:35 PM | 10m | Idle | — | Away from computer | No active computer use was detected. | — |
| 10 | 3:35–4:50 PM | 1h 15m | Billable | Northstar Ventures | Test Northstar expense samples | Selected and tested operating-expense samples, linked support, and documented exceptions for review. | Excel, CPAAutomation |
| 11 | 4:50–5:20 PM | 30m | Non-billable | Firm Administration | Finalize time notes and plan tomorrow | Reviewed the day's activity, organized follow-ups, and set tomorrow's engagement priorities. | CPAAutomation, Outlook |

Card 8 is deliberately loaded as **Non-billable** with no subcategory. During the demo, change it to **Billable → Redwood Dental Group**.

Expected totals before that correction:

- Tracked: **8h 50m** across **11 cards**
- Billable: **5h 45m**
- Non-billable: **2h 15m**
- Personal: **40m**
- Idle: **10m**

Expected totals after the correction:

- Tracked: **8h 50m** across **11 cards**
- Billable: **6h 40m** — Harbor Manufacturing **3h**, Redwood Dental Group **2h 25m**, Northstar Ventures **1h 15m**
- Non-billable: **1h 20m**
- Personal: **40m**
- Idle: **10m**

For richer inspector and CPAAutomation drill-down views, use these detailed summaries:

- **Harbor reconciliation:** “Compared bank activity with the general ledger, investigated outstanding checks and deposits in transit, and cleared supported reconciling items. Flagged one duplicate vendor payment for client confirmation.”
- **Harbor variance:** “Compared current- and prior-month balances, traced freight-in entries to inventory receipts, and documented timing and volume as the primary variance drivers. Prepared a concise note for the close file.”
- **Redwood workpapers:** “Reviewed fixed-asset additions against invoices and the depreciation schedule, tied totals to the trial balance, and prepared a short list of missing support.”
- **Redwood call:** “Met with the controller to resolve missing fixed-asset support and classification questions. Documented the agreed treatment and sent a follow-up request list.”
- **Northstar sampling:** “Selected operating-expense samples, agreed amounts to invoices and approvals, linked the supporting documents, and documented two items for reviewer follow-up.”

## Recording preparation

- Use `DEMO_DATE` everywhere and verify that the Chrona timeline contains exactly the 11 cards above.
- Load Card 8 with the incorrect category, then sync once so CPAAutomation initially holds the same version.
- Leave Chrona paired to CPAAutomation as **Jordan's MacBook Pro** with sync enabled.
- In Chrona's Ask settings, select **Selected day**, turn **Use observations** off, and clear any prior chat.
- Test the Ask prompt in advance, confirm that it returns the expected client totals and source chips, then clear the chat again.
- Keep Chrona on **Today** with capture healthy. Keep CPAAutomation authenticated in a browser tab.
- In CPAAutomation, make sure the demo firm has only this device, or filter to this device before quoting totals.
- Hide notifications, bookmarks, tokens, pairing codes, unrelated dates, and other client information.
- Record at a size where card titles, categories, totals, and source chips remain legible. Move the pointer away from figures after each action.

## Demo script

Target length: approximately **5 minutes**.

### 0:00–0:18 — The problem

**Action:** Start on Chrona's **Today** view. Hold briefly on “Capture is healthy,” the tracked-time metric, and the recent activity list.

**Dialogue:**

> At the end of a busy day, the hard question isn't whether I worked. It's how much of that work was billable, which client it belonged to, and whether I can support the time entry. Chrona reconstructs that answer without asking me to start and stop timers all day.

### 0:18–0:42 — From activity to a usable day

**Action:** Point briefly to the “Capture is healthy” status, then select **Timeline** in the left navigation. Use the date control to show `DEMO_DATE` if it is not already selected. Pause on the full-day timeline.

**Dialogue:**

> Chrona runs quietly while I work. It turns the activity on my computer into a structured timeline with a time range, title, summary, category, and—when I use them—a client subcategory. I'm going to jump ahead to the completed day.

### 0:42–1:20 — Inspect the evidence behind a time block

**Action:** Scroll to the morning. Select **Investigate inventory and freight variance**, opening the activity inspector. Hold on its **Billable** category, **Harbor Manufacturing** subcategory, summary, and details. Keep the view above the Observations section.

**Dialogue:**

> Here, Chrona identified ninety minutes of variance analysis for Harbor Manufacturing. I can see not only the time block, but what the work involved: tracing freight postings, analyzing the change, and documenting the drivers. That gives me a much better starting point for a defensible time entry than trying to remember the day on Friday afternoon.

### 1:20–1:58 — Keep the accountant in control

**Action:** Close the inspector. Select **Redwood client call and follow-up** at 2:30 PM. In the inspector, show that the card is currently **Non-billable**. Change **Category** to **Billable**, then change **Subcategory** to **Redwood Dental Group**. Pause on the updated values.

**Dialogue:**

> Chrona does the first pass, but I keep the final say. This client call was classified as non-billable. It covered specific tax-workpaper questions and the follow-up request list, so I'll correct it to Billable and assign it to Redwood Dental Group. That judgment stays with the professional—and the correction becomes part of the record.

### 1:58–2:42 — Ask for the billable breakdown

**Action:** Select **Ask**. Enter: **How much billable time did I record today, broken down by client?** Select **Ask**. When the response appears, hold on the answer and its source chips. If helpful, point to one source chip but do not navigate away.

**Dialogue while the answer loads:**

> Because the timeline is structured, I don't have to add these blocks up myself. I can ask Chrona a plain-language question about the selected day.

**Dialogue after the answer appears:**

> The answer is six hours and forty minutes of billable time: three hours for Harbor Manufacturing, two hours and twenty-five minutes for Redwood Dental Group, and one hour and fifteen minutes for Northstar Ventures. The source links take me back to the exact blocks behind those numbers.

**Expected on-screen answer:**

- Harbor Manufacturing — **3h**
- Redwood Dental Group — **2h 25m**
- Northstar Ventures — **1h 15m**
- Total billable — **6h 40m**

If the generated wording differs, narrate the figures actually shown only after confirming they match these totals.

### 2:42–3:12 — See the whole day at a glance

**Action:** Select **Insights**. Set **Range** to **Selected day (`DEMO_DATE`)** and leave **Include System cards** off. Hold on **Tracked: 8h 50m** and the category breakdown. Point to **Billable: 6h 40m** and **Non-billable: 1h 20m**.

**Dialogue:**

> Insights gives me the day in one view. I have eight hours and fifty minutes tracked, with six hours and forty minutes billable and one hour and twenty minutes of firm administration and internal work. Personal and idle time stay visible, so gaps don't quietly turn into billable hours.

### 3:12–3:44 — Send the structured record to CPAAutomation

**Action:** Open **Settings**, select **Data & Sync**, and scroll to **Sync**. Show the paired status for **Jordan's MacBook Pro** and the privacy copy. Select **Sync now**. Wait until the status returns to **Paired** with no pending cards and an updated last-sync time.

**Dialogue:**

> When the day is ready, Chrona syncs the timeline cards to CPAAutomation. The sync sends the structured card text, categories, client subcategories, and times—not screenshots or videos. I can leave it automatic, pause it, or push the latest changes now.

### 3:44–4:25 — Firm-level reporting in CPAAutomation

**Action:** Switch to the authenticated CPAAutomation browser tab on **Time Tracking**. Set **From** and **To** to `DEMO_DATE`, and select **Jordan's MacBook Pro** in the device filter if needed. Hold on **Total hours: 8h 50m**, **Active devices: 1 / 1**, and **Timeline cards: 11**. Then move down to **Hours by category** and **Hours by day**.

**Dialogue:**

> In CPAAutomation, that same structured day becomes a reporting view for the firm. A manager can filter by date and device, see total tracked hours and card counts, and compare the mix of billable and non-billable time. With more paired devices, this becomes the roll-up across the team.

### 4:25–4:52 — Drill down and export

**Action:** In the **Devices** table, select **Jordan's MacBook Pro**. On the device timeline, scroll to **Redwood client call and follow-up** and expand **Details**. Hold on **Billable** and **Redwood Dental Group**. Return to **Time Tracking**, point to **Export CSV**, then select it if a clean download animation or toast is available.

**Dialogue:**

> The totals remain traceable. I can drill into a device, open the underlying card, and see the corrected client assignment and supporting detail. When the firm is ready to move the totals into another workflow, the selected range can be exported as CSV.

### 4:52–5:08 — Close

**Action:** End on the CPAAutomation category chart, or cut back to Chrona's timeline with the three clients visible. Add the Chrona logo and a simple closing title: **Know where the day went. Capture billable time with confidence.**

**Dialogue:**

> Chrona replaces timer memory with a reviewable record of the day. I get faster time entry, clearer client allocation, and evidence behind the hours—while CPAAutomation gives the firm the reporting view it needs.

## Optional shorter cut

For a 90-second version, keep the opening, the Redwood category correction, the Ask result, and the CPAAutomation dashboard. Remove the morning card inspection, Chrona Insights, the device drill-down, and the live CSV download.

## Claims to keep precise

- Say Chrona creates a structured reconstruction or timeline of computer activity; do not call it a payroll, invoicing, or automatic billing system.
- Say the user reviews and controls billable classification; do not imply AI classification is authoritative.
- Say screenshots and videos do not sync to CPAAutomation. The synced timeline record includes titles, summaries/details, categories/subcategories, and times.
- CPAAutomation's **Total hours** includes every synced card category in the selected range. Use the category chart—not the Total hours card—as the billable total.
- The CPAAutomation CSV is a summary by day, device, and category. Do not describe it as a line-item invoice export.
