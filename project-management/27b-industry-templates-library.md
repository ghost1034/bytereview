# 27b — Industry Templates Library (Business, Accounting, Law, Finance, Procurement, HR)

**Goal:** Ship Tasklytic with a deep, professional-grade library of curated templates across the functions teams use most: General Business, Accounting/CPA, Law, Finance, Procurement, and HR. These are detailed enough that a real team could open one and start working immediately.

**Drop after:** `27-templates-and-bundles.md` (the engine). **Followed immediately by `27c-transactions-templates.md`** which adds two heavy corporate-transactions templates (M&A acquisition and spin-off/divestiture). The onboarding step (`30`) references templates from both files by name when provisioning new tenants and internal evaluation tenants.

**Note:** The B-series (Accounting & Tax) and C-series (Law Firm) templates are **retrofitted in step 28b** to natively support time tracking, expense tracking, billing rates, matters, and invoicing. If you plan to use Tasklytic in a billable-services firm, drop step 28b after step 28 — it adds the PSA layer that these templates rely on.

---

## Prompt (paste into Google AI Studio Build)

Extend Tasklytic's curated template library with the 25 detailed industry templates below. They go into `src/features/templates/curated/` — one file per category (`business.ts`, `accounting.ts`, `law.ts`, `finance.ts`, `procurement.ts`, `hr.ts`). They are exported as `ProjectTemplate` objects matching the type from step 02, with the non-breaking extensions added in step 27 (`ruleTemplates`, `formTemplates`, `dashboardTemplates`).

**Critical rules**:
1. Do not modify the design system, data model, or any prior feature.
2. Each template must instantiate cleanly via the existing flow (`useTemplateInstantiate` from step 27).
3. Where templates reference global custom fields (Priority, Status, etc.), reuse the existing recommended fields from step 14 instead of duplicating.
4. All dates in template tasks are RELATIVE to project start date (use a `relativeStart` and `relativeDue` in days; the instantiator already supports this from step 27).
5. Group the curated templates by category in the "Create from template" gallery (step 06's Create Project dialog) with category headers: **Business**, **Accounting & Tax**, **Law**, **Finance**, **Procurement**, **HR**.
6. Each template has an **icon** emoji, **color** token, **default view**, **suggested bundles**, **starter tasks**, **suggested rules**, optionally **suggested forms**, and optionally **suggested dashboard charts**.
7. Append a row to `Design.md` at the end: `27b | src/features/templates/curated | Industry templates library | <today>` plus a section **"Curated Template Index"** that lists all 25 by category.

Render the templates in the gallery with a small preview card showing icon + name + category + 1-line description + a "Preview tasks" button that opens a read-only modal showing the sections and a preview of the starter tasks.

---

## The 25 Templates

> Conventions used below:
> - `D+N` = N days after project start.
> - **A→B** between tasks denotes a dependency (B is blocked by A).
> - Custom field options listed in parentheses with their colors.
> - "Role" assignees are role labels — the instantiator leaves the task unassigned and tags it with the role name as a `Tag`. After provisioning, the workspace owner can bulk-assign by role from the template's "Assign roles" CTA.

---

## A. General Business (4 templates)

### A1. Quarterly Business Review (QBR)
**Icon:** 📊 | **Color:** primary | **Default view:** List | **Bundles:** "Status field", "Priority field"

**Sections:**
1. Pre-QBR (Data gathering)
2. Build (Narrative & deck)
3. Internal review
4. Customer / Executive review
5. Follow-ups

**Custom fields (local to project):**
- `Workstream` — dropdown: Sales (blue), Product (purple), CS (teal), Finance (amber), Marketing (rose)
- `Confidence` — dropdown: High (green), Medium (amber), Low (red)
- `Priority` — global (reuse)
- `Status` — global (reuse)

**Starter tasks:**
- *Pre-QBR*
  - "Lock metrics scope with CRO" — Role: PMO — D+0
  - "Pull pipeline, ARR, churn, NRR from CRM" — Role: RevOps — D+1
  - "Pull product usage trends" — Role: Product Ops — D+1
  - "Compile NPS / CSAT" — Role: CS Ops — D+2
  - "Update competitive intel" — Role: PMM — D+2
- *Build*
  - "Draft narrative outline" — Role: Chief of Staff — D+3 (depends on data tasks)
  - "Build slides — Wins & misses" — Role: Strategy — D+5
  - "Build slides — Forward look" — Role: Strategy — D+5
  - "Insert metrics & charts" — Role: Strategy — D+6
- *Internal review*
  - "Dry run with leadership" — Role: All execs — D+8 (M)  ← Milestone
  - "Incorporate feedback" — Role: Chief of Staff — D+9
- *Customer / Executive review*
  - "Send pre-read to attendees" — Role: EA — D+10
  - "Run QBR meeting" — Role: Account exec — D+12 (M)
  - "Capture action items" — Role: Note-taker — D+12
- *Follow-ups*
  - "Distribute deck & recap" — Role: Account exec — D+13
  - "Open action item tickets" — Role: PMO — D+14

**Rules:**
- When *Status* changes to *At Risk* → notify project owner.
- When task in **Customer / Executive review** is completed → auto-move to **Follow-ups**.

**Dashboard charts (suggested):**
- Donut: Tasks by Status.
- Burnup: Tasks completed vs scope across the QBR window.

---

### A2. B2B Customer Onboarding
**Icon:** 🚀 | **Color:** accent | **Default view:** Board | **Bundles:** "Status", "Priority"

**Sections (board columns):**
1. Kickoff
2. Configuration
3. Data migration
4. Training
5. Go-live
6. 30-day check-in
7. 90-day check-in / Healthy

**Custom fields:**
- `Customer name` — text
- `CSM` — people (single)
- `AE` — people (single)
- `Contract ARR` — number (currency, $)
- `Plan tier` — dropdown: Starter, Growth, Enterprise
- `Launch date` — date
- `Health` — dropdown: Green, Yellow, Red

**Starter tasks (one per task):**
- *Kickoff*: Welcome email | Schedule kickoff call | Confirm success criteria | Identify exec sponsors | Provision sandbox
- *Configuration*: Provision production tenant | Set SSO | Configure roles & permissions | Brand customization | Webhook setup
- *Data migration*: Source data audit | Map fields | Build importer | Sample import & validation | Full import (M) | UAT sign-off (M)
- *Training*: Admin training | End-user training (2 cohorts) | Record knowledge-base walkthrough | Distribute job aids
- *Go-live*: Go/no-go meeting | Cutover | Day-0 hypercare | First-week check-in
- *30-day*: Adoption review | NPS survey | Address blockers
- *90-day*: ROI report | Quarterly review | Expand opportunities

**Form (intake):**
- "Kickoff intake" — fields: Company name, Primary contact, Exec sponsor, Use cases (multi), Launch target date, Data sources (multi), SSO required? (checkbox), File attachments (logo, brand guide).

**Rules:**
- On form submission → create tasks in **Kickoff** auto-assigned to the AE.
- When *Health* changes to *Red* → notify CSM and CSM manager.
- When section reaches **Go-live** → post automated status update.

---

### A3. Sales Pipeline Management
**Icon:** 💼 | **Color:** indigo | **Default view:** Board | **Bundles:** "Status"

**Sections (Board columns = pipeline stages):**
1. Lead
2. Qualified
3. Discovery
4. Demo
5. Proposal
6. Negotiation
7. Closed Won
8. Closed Lost

**Custom fields:**
- `Account` — text
- `Primary contact` — text
- `Deal value` — number (currency)
- `Close date` — date
- `Source` — dropdown: Inbound, Outbound, Referral, Partner, Event
- `Stage probability` — number (percent, computed via formula by stage default)
- `Next step` — text
- `Last activity` — date

**Starter tasks (each card = a deal — pre-populate 3 example deals):**
- "Acme Corp — Platform expansion" — *Qualified* — $120,000 — Close date D+45
- "Beacon Logistics — Pilot" — *Demo* — $35,000 — Close date D+20
- "Crestwood Health — Renewal & upsell" — *Negotiation* — $250,000 — Close date D+10

**Rules:**
- When moved to **Closed Won** → set `Stage probability` to 100, notify CRO, copy task to "Wins" archive project.
- When moved to **Closed Lost** → require a `Loss reason` text field (created on the fly).
- When *Last activity* > 14 days and not in Closed → notify deal owner.

**Dashboard charts:**
- Bar: Pipeline by stage ($).
- Line: Weighted pipeline over time.
- Number: Forecast for the quarter (sum of `Deal value × Stage probability` for deals with `Close date` in quarter).

---

### A4. Annual Strategic Planning
**Icon:** 🧭 | **Color:** teal | **Default view:** Timeline | **Bundles:** "Status"

**Sections:**
1. Discovery & inputs
2. Strategy hypotheses
3. Financial modeling
4. Cross-functional reviews
5. Board prep
6. Cascade & rollout

**Custom fields:**
- `Workstream` — dropdown: Market, Product, Org, Finance, Tech
- `Owner` — people (single)
- `Confidence` — dropdown: High, Medium, Low
- `Status` — global

**Starter tasks (15 incl. milestones & dependencies):**
- *Discovery*: Customer interviews (15) | Competitive analysis | Macro trends scan | Win/loss analysis | Internal stakeholder survey
- *Strategy*: Draft 3-horizon framework | Identify 5 strategic bets | Risk register
- *Modeling*: Top-down model | Bottom-up model | Reconciliation
- *Cross-functional reviews*: Product roadmap alignment | Hiring plan | GTM plan
- *Board prep*: Draft board deck | Board pre-read | Board meeting (M)
- *Cascade*: All-hands announcement | Department goal-setting | OKR rollout

---

## B. Accounting & Tax (5 templates)

### B1. Month-End Close
**Icon:** 📅 | **Color:** info | **Default view:** List | **Recurring:** Monthly | **Bundles:** "Accounting Status", "Priority"

**Sections (close days):**
1. Day -2 (Pre-close prep)
2. Day 1–2 (Cutoff)
3. Day 3–5 (Reconciliations)
4. Day 6–8 (Adjustments & accruals)
5. Day 9–10 (Reporting & flux)
6. Wrap-up (Day 11+)

**Custom fields:**
- `GL account` — text
- `Preparer` — people (single)
- `Reviewer` — people (single)
- `Materiality threshold` — number (currency)
- `Close status` — dropdown: Not started (gray), In progress (blue), Submitted (amber), Reviewed (green), Returned (red), Reposted (purple)
- `Cycle` — dropdown: Revenue, Cash, AR, Inventory, AP, Payroll, Tax, Equity, Other
- `Risk` — dropdown: Low, Medium, High

**Starter tasks (organized to match cycle ownership):**
- *Pre-close*: Confirm close calendar | Lock prior period | Distribute close checklist
- *Cutoff*: AR cutoff review | AP cutoff review | Inventory cutoff | Revenue cutoff (ASC 606) | Payroll cutoff
- *Reconciliations*: Bank reconciliation — all accounts | AR aging review | AP aging review | Credit card reconciliation | Intercompany reconciliation | Prepaid expense schedule | Fixed asset roll-forward
- *Adjustments*: Accrued payroll | Accrued bonuses | Accrued revenue | Deferred revenue recognition (ASC 606) | Lease expense (ASC 842) | Stock-based compensation (ASC 718) | Bad debt / CECL allowance | Inventory reserve | FX revaluation
- *Reporting*: P&L draft | Balance sheet draft | Cash flow statement | Flux variance — P&L | Flux variance — BS | MD&A draft | Executive deck
- *Wrap-up*: Close post-mortem | Update SOPs | Schedule next month's close

**Rules:**
- When *Close status* = *Submitted* → auto-assign Reviewer.
- When *Reviewer* marks *Returned* → notify Preparer + add red tag.
- When all tasks in **Reporting** complete → post project status update "Books closed for <Month>".

**Form (PBC request to operations):**
- "Operational data request" — Cutoff date, Bank statements (attachment), Vendor invoices outstanding, Customer disputes, Inventory counts (attachment), Headcount changes.

**Dashboard charts:**
- Lollipop: Open reconciliations by Preparer.
- Number: Days to close (target vs actual).
- Burnup: Close completion vs day-of-close.

---

### B2. Year-End Close & Audit Readiness
**Icon:** 🗂️ | **Color:** primary | **Default view:** Gantt | **Bundles:** "Accounting Status", inherits B1

**Sections:**
1. Pre-close prep (Q4 Week 1)
2. Hard close (Q4 Weeks 2–3)
3. Audit prep (Q4 Week 4)
4. External audit fieldwork (Q1 Weeks 1–4)
5. Financial statements & footnotes
6. Sign-off & filing

**Custom fields (in addition to B1's):**
- `Audit area` — dropdown: Revenue, Inventory, PP&E, Intangibles & Goodwill, Leases, Income Tax, Stock Comp, Debt, Equity, Going Concern, Subseq Events, Sox ITGC, Sox Business
- `Audit risk` — dropdown: Significant, Elevated, Standard
- `Materiality threshold` — number (currency)
- `PBC status` — dropdown: Not requested, Requested, Received, Reviewed, Approved
- `Reviewer level` — dropdown: Senior, Manager, Partner

**Starter tasks (selected, ~30 in the template):**
- *Pre-close*: Roll-forward trial balance | Confirm chart of accounts mapping | Update fixed asset additions/disposals | Stock comp roll-forward | Convertible debt classification review
- *Hard close*: Revenue cutoff (extended testing) | Inventory observation (M) | Confirmations — AR (positive, large balances) | Confirmations — AP (negative) | Confirmations — Bank/Debt | Goodwill impairment test (ASC 350) | Long-lived asset impairment (ASC 360) | Lease modifications & remeasurements (ASC 842) | Income tax provision (ASC 740) | Stock comp expense (ASC 718) | Loss contingency assessment (ASC 450) | Going concern memo | Subsequent events review through filing date
- *Audit prep*: PBC list build | Open audit portal | Sample selection methodology | Walkthroughs refresh (Revenue, Procure-to-pay, Payroll) | ITGC walkthroughs (Change mgmt, Access, Ops)
- *External audit*: Field auditor onboarding | Daily standups | Open items log | Management representations | Audit committee communications (SAS 114/115)
- *Financial statements*: Draft statements | Footnotes — Significant accounting policies | Footnotes — Revenue disaggregation | Footnotes — Leases | Footnotes — Income taxes | Footnotes — Stock comp | Footnotes — Subsequent events | XBRL tagging
- *Sign-off*: Disclosure committee | Audit committee approval | Officer certifications | Auditor consent | Filing

**Rules:**
- When `PBC status` = *Requested* → start an SLA timer (auto-add tag "SLA-watch") and notify owner if not *Received* in 3 days.
- When `Audit risk` = *Significant* → auto-add Manager and Partner as collaborators.

**Form ("PBC request to client"):** dynamically generates document upload tasks based on selected `Audit area` items.

**Dashboard charts:**
- Bar: Open PBC items by area.
- Donut: Tasks by `Reviewer level`.
- Line: Days-to-audit-completion trend.

---

### B3. Individual Tax Return Preparation (Form 1040)
**Icon:** 🧾 | **Color:** warning | **Default view:** Board | **Recurring:** Annual | **Bundles:** "Tax Status"

**Sections (Board columns = workflow stages):**
1. Engagement / Docs requested
2. Docs received & organized
3. Input / Preparation
4. Senior review
5. Manager review
6. Partner sign-off
7. Client signature (Form 8879)
8. E-filed
9. Acknowledged & archived

**Custom fields:**
- `Client name` — text
- `Tax year` — number
- `Return type` — dropdown: 1040, 1040 + State, 1040 + Multi-state, 1040NR
- `Complexity` — dropdown: Simple, Standard, Complex, High-net-worth
- `Estimated fee` — number (currency)
- `Filed date` — date
- `Refund / balance due` — number (currency)
- `Extension filed?` — checkbox
- `IRS letter received?` — checkbox

**Starter tasks (each task = a section of the return / a workflow step):**
- *Engagement / Docs requested*:
  - Send 1040 organizer
  - Send engagement letter (renewal if continuing)
  - Send portal invite (Secure Portal)
- *Docs received*:
  - Receive W-2(s)
  - Receive 1099-INT / 1099-DIV / 1099-B
  - Receive K-1s (S-corp, partnership, trust)
  - Receive 1098 mortgage interest
  - Receive cap gains supplemental (cost basis)
  - Receive HSA / 1099-SA
  - Receive 1095-A (Marketplace) / 1095-B/C
  - Receive prior-year return (if new client)
- *Input*:
  - Wages & withholding
  - Interest & dividends (Schedule B)
  - Itemized deductions (Schedule A) — SALT cap check
  - Self-employment (Schedule C) — QBI eligibility
  - Capital gains (Schedule D / Form 8949)
  - Rental real estate (Schedule E) — passive activity rules
  - K-1 pass-through inputs
  - Foreign accounts (FBAR / Form 8938)
  - AMT calculation
  - Retirement contributions / IRA deduction
  - Education credits
  - Child tax credit / dependent care
  - Estimated tax payments applied
- *Senior review*: Diagnostic check | Tie-out to source docs | Variance from prior year
- *Manager review*: Sign-off checklist | Risk areas review
- *Partner sign-off*: Final review | Approve invoice
- *Client signature*: Send Form 8879 e-sign | Confirm payment of fee
- *E-filed*: Submit return | Confirm acknowledgement
- *Archived*: File in DMS | Update client master record

**Rules:**
- When all *Docs received* tasks complete → move ticket to **Input**.
- When *Complexity* = *High-net-worth* → require Manager + Partner reviewers.
- When *Partner sign-off* is marked complete → auto-trigger Form 8879 e-sign workflow via the e-signature integration (action surfaces here; dispatches through the e-signature adapter when bound — DocuSign / Adobe Sign / Anvil — otherwise records the trigger in the audit log).
- When *Filed date* set → move to **E-filed** and archive.

**Form ("1040 client questionnaire"):** Filing status, dependents, life changes (marriage, divorce, new dependent, home purchase), foreign accounts (Y/N), virtual currency (Y/N), estimated payments made, energy credits (EV / solar).

**Dashboard charts:**
- Bar: Returns by `Complexity` and status.
- Number: Returns filed YTD.
- Lollipop: Average days from "Docs received" to "E-filed", by preparer.

---

### B4. Financial Statement Audit Engagement
**Icon:** 🔍 | **Color:** danger | **Default view:** Gantt | **Bundles:** "Accounting Status", "Audit"

**Sections (engagement lifecycle):**
1. Client acceptance / continuance
2. Planning & risk assessment
3. Interim fieldwork
4. Year-end fieldwork
5. Completion & wrap-up
6. Report issuance

**Custom fields:**
- `Client` — text
- `Engagement partner` — people
- `Manager` — people
- `Senior in-charge` — people
- `Risk rating` — dropdown: Standard, Elevated, Significant
- `Materiality` — number (currency)
- `Audit area` — dropdown (same as B2)
- `Control` — text (control ID, e.g., R-01, P2P-04)
- `Sample size` — number
- `Workpaper status` — dropdown: Not started, In progress, Submitted, Reviewed, Approved
- `Independence status` — dropdown: Cleared, Pending, Issue

**Starter tasks (~35 in the template):**
- *Acceptance*: Independence checks | AML/KYC | Engagement letter | Pricing memo | Risk acceptance memo (if elevated)
- *Planning*: Understand entity & environment | Identify significant accounts | Identify significant risks | Fraud risk assessment | Set materiality (overall, performance, posting threshold) | Audit strategy memo | Engagement budget | Staffing & schedule | Specialist needs (Tax, Valuation, IT, Actuarial)
- *Interim*: Walkthroughs — Revenue, P2P, Payroll, FCR, Treasury | Test design of controls | Test operating of key controls | ITGC testing (Change, Access, Ops, Backup) | Identify deficiencies
- *Year-end fieldwork*: Trial balance tie-out | Substantive analytical procedures | Test of details by area (Revenue, AR, Inventory, PP&E, Goodwill, Leases, Income Tax, Stock Comp, Debt, Equity) | Journal entry testing (full population + risk-based) | Related party review | Litigation letter | Going concern memo | Subsequent events
- *Completion*: Final analytical review | Summary of audit differences (SAD) | Aggregate misstatements vs materiality | Management representations | Disclosure checklist | EQR / second partner review (M) | Audit committee communications (SAS 114, 115) | Wrap-up file index
- *Report issuance*: Draft opinion | Tie-out report to financials | Issue opinion (M) | Archive workpapers (per AS 1215 / 60-day rule)

**Rules:**
- When `Workpaper status` = *Submitted* → auto-assign to Reviewer 1 level up.
- When `Risk rating` = *Significant* on any task → require EQR completion before issuance.
- When all wrap-up tasks complete → require auditor confirmation before Issue opinion task can be marked done.

---

### B5. New Client Engagement Onboarding (CPA Firm)
**Icon:** 🤝 | **Color:** accent | **Default view:** List | **Bundles:** "Status"

**Sections:**
1. Prospect
2. Conflict & risk acceptance
3. Engagement letter & pricing
4. Kickoff & data access
5. Active

**Custom fields:**
- `Client name` — text
- `Service line` — dropdown: Tax, Audit, Advisory, Bookkeeping, Wealth, R&D Credit, SALT, IPO Readiness
- `Industry` — dropdown: Tech, Manufacturing, Healthcare, Real Estate, Professional Services, Nonprofit, Other
- `Entity type` — dropdown: C-Corp, S-Corp, Partnership, LLC, Sole Prop, Trust, Individual, Nonprofit
- `Fee structure` — dropdown: Hourly, Fixed, Value-based, Retainer, Contingency
- `Engagement partner` — people

**Starter tasks:**
- *Prospect*: Discovery call | Send capabilities deck | Pricing scoping | Proposal sent
- *Conflict & risk*: Conflict check across firm | AML / KYC (PEP, sanctions) | Independence check (if attest) | Risk acceptance memo (if elevated risk)
- *Engagement letter*: Draft engagement letter (SSARS 21 / GAAS / Circular 230 as applicable) | Internal review | Send for client signature
- *Kickoff*: Schedule kickoff | Provision portal | Provision DMS folder | Add engagement to billing system | Add client to CRM | Issue retainer invoice (if applicable)
- *Active*: Set up recurring engagement template (e.g., monthly bookkeeping) | Confirm staffing | Update partner & manager rosters

**Rules:**
- When `Service line` includes *Audit* → automatically add Independence check.
- When engagement letter is signed → create kickoff project from the relevant service-line template (Month-End, 1040, Audit, etc.).
- When AML/KYC stuck > 5 days → notify partner.

---

## C. Law Firm (4 templates)

### C1. New Matter Intake & Conflict Check
**Icon:** ⚖️ | **Color:** indigo | **Default view:** List | **Bundles:** "Status"

**Sections:**
1. Intake
2. Conflict check
3. Engagement & pricing
4. Trust accounting
5. Matter open

**Custom fields:**
- `Client (new or existing)` — dropdown: New, Existing
- `Practice area` — dropdown: Litigation, Corporate, M&A, IP, Tax, Employment, Real Estate, Bankruptcy, Immigration, Estate, Regulatory
- `Responsible attorney` — people
- `Originating attorney` — people
- `Fee arrangement` — dropdown: Hourly, Flat fee, Contingency, Hybrid, Retainer
- `Trust deposit required` — number (currency)
- `Conflict status` — dropdown: Not run, Cleared, Waivable, Hard conflict
- `Court jurisdiction` — text (if litigation)
- `Statute of limitations` — date (if litigation)

**Starter tasks:**
- *Intake*: Client intake form | Initial call (30 min) | Identify scope & deliverables | Identify parties (client, adverse, related)
- *Conflict check*: Run conflict search (firm-wide) | Review hits | Resolve conflicts / obtain waivers | Document conflict resolution
- *Engagement & pricing*: Draft engagement letter (rules of professional conduct compliant) | Pricing approval (if outside guidelines) | Send for client signature
- *Trust accounting*: Calculate trust deposit | Send trust deposit invoice | Confirm funds received (IOLTA account)
- *Matter open*: Open matter in practice management system | Assign matter number | Set up timekeeper assignments | Set up billing rates | Calendar key dates (SOL, statutes) | Open electronic matter folder | Update CRM

**Rules:**
- When `Conflict status` = *Hard conflict* → automatic decline workflow + notify managing partner.
- When `Practice area` = *Litigation* → require `Statute of limitations` and `Court jurisdiction` before matter open.
- When trust funds confirmed → unlock "Matter open" section.

**Form ("Client intake"):** Client name, contact details, party names, opposing parties, brief description of matter, prior counsel, urgent deadlines, document uploads (existing contracts, complaints).

---

### C2. Litigation Case Management
**Icon:** 🧑‍⚖️ | **Color:** danger | **Default view:** Timeline | **Bundles:** inherits C1

**Sections (litigation lifecycle):**
1. Pre-filing / Demand
2. Pleadings
3. Discovery
4. Motions
5. Trial preparation
6. Trial
7. Post-trial / Appeal
8. Closed

**Custom fields (in addition to C1):**
- `Docket number` — text
- `Opposing counsel` — text
- `Judge` — text
- `Trial date` — date
- `Discovery deadline` — date
- `Dispositive motion deadline` — date
- `Critical?` — checkbox (drives critical path highlight)

**Starter tasks (many — ~50 — with dependencies):**
- *Pre-filing*: Investigate facts | Interview client / fact witnesses | Demand letter draft | Demand letter sent (M) | Tolling agreement (if needed)
- *Pleadings*: Draft complaint (or answer, if defending) | Review with client | File complaint (M) | Serve summons | Receive answer / counterclaim | Reply to counterclaim
- *Discovery*: Initial disclosures (FRCP 26) | Document preservation hold | Document requests (set 1) | Interrogatories (set 1) | Requests for admission | Subpoenas to third parties | Receive opposing party documents | Privilege log | Depositions — plaintiff | Depositions — defendant | Depositions — key witnesses | Expert disclosures (M) | Expert depositions
- *Motions*: Motion to dismiss (if applicable) | Motion to compel discovery | Motion for summary judgment | Motions in limine | Daubert challenges
- *Trial prep*: Trial brief | Witness list & order | Exhibit list & binders | Jury instructions proposed | Voir dire questions | Demonstratives | Mock trial (if appropriate) | Settlement conference (M)
- *Trial*: Opening statement | Direct & cross examinations | Close | Jury deliberation | Verdict (M)
- *Post-trial*: Post-trial motions | Notice of appeal (if applicable) | Cost bill | Judgment satisfaction
- *Closed*: Final invoice | Final report to client | Archive matter

**Rules:**
- When *Discovery deadline* is in 14 days → notify lead attorney with "Critical" tag.
- When task is in *Trial* section → require partner as collaborator.
- When *Filed complaint* is marked complete → set SOL field to filed date and lock.

**Dashboard charts:**
- Gantt: Litigation timeline visualization (use default Gantt).
- Number: Days to discovery deadline.
- Donut: Open motions by type.

---

### C3. Contract Review & Negotiation
**Icon:** 📝 | **Color:** primary | **Default view:** Board | **Recurring:** As needed | **Bundles:** "Status", "Priority"

**Sections:**
1. Intake
2. First-pass review
3. Internal redlines
4. Counterparty negotiation
5. Approvals
6. Signature
7. Storage

**Custom fields:**
- `Counterparty` — text
- `Contract type` — dropdown: MSA, NDA, SOW, DPA, BAA, License, Lease, Employment, Service, Consulting, Reseller, Vendor
- `Contract value` — number (currency)
- `Term length (months)` — number
- `Auto-renew?` — checkbox
- `Governing law` — text
- `Risk rating` — dropdown: Low, Medium, High
- `Approval required` — dropdown: Legal only, VP, CFO, CEO, Board
- `Playbook deviations` — multi-select: Liability cap, Indemnification, IP ownership, Data privacy, Termination, Audit rights, Warranties

**Starter tasks:**
- *Intake*: Receive request | Confirm counterparty info | Assign reviewer | Set deadline (target close date)
- *First-pass review*: Confirm contract type & playbook | Identify deviations | Draft risk memo (1-pager)
- *Internal redlines*: Mark up in track changes | Get business owner sign-off on key terms | Get legal sign-off
- *Counterparty negotiation*: Send redlines | Discussion call | Receive counterparty markup | Reconcile changes | Repeat as needed (max 5 rounds)
- *Approvals*: Route per `Approval required` chain | Capture approval evidence
- *Signature*: Send via e-sign | Confirm both signatures | Effective date
- *Storage*: Save executed PDF to CLM | Tag metadata (counterparty, type, value, term, key dates) | Calendar renewal reminders

**Rules:**
- When `Risk rating` = *High* OR `Playbook deviations` is not empty → auto-add CFO and General Counsel as approvers.
- When `Auto-renew?` is true → on save to CLM, create a "Contract Renewal" task in the renewal project 120 days before term end.
- When signed → notify business owner with executed PDF.

**Form ("Contract request"):** Counterparty, type, term, value, business owner, target close date, attach draft (if any), notes.

---

### C4. M&A Deal Closing Checklist
**Icon:** 🏛️ | **Color:** primary | **Default view:** Gantt | **Bundles:** "Status", "Priority"

**Sections:**
1. Pre-LOI
2. Due diligence
3. Definitive agreement
4. Regulatory & financing
5. Pre-closing deliverables
6. Closing
7. Post-closing

**Custom fields:**
- `Workstream` — dropdown: Legal, Tax, Finance, HR, IT, Commercial, Real Estate, IP, Regulatory, Environmental, Integration
- `Critical path?` — checkbox
- `Approval body` — dropdown: None, Board, Shareholders, Regulator
- `Document` — text (link to deal room)
- `Deliverable status` — dropdown: Not started, In drafting, In negotiation, Agreed, Signed

**Starter tasks (~60 in the full template):**
- *Pre-LOI*: NDA executed | Confidentiality terms confirmed | Initial info exchange | Indicative offer | Exclusivity agreement
- *Due diligence*: Open virtual data room | Diligence request list issued | Legal DD memo | Financial DD memo (QoE) | Tax DD memo | HR DD memo | IT/Security DD memo | Commercial DD (top customers/contracts) | IP DD | Environmental (Phase I/II if applicable) | Insurance DD | Litigation review | Anti-corruption review (FCPA)
- *Definitive agreement*: Purchase agreement (SPA/APA/Merger) drafted | Disclosure schedules | Representations & warranties insurance bound | Working capital target methodology | Earn-out structure | Escrow agreement | Non-compete & non-solicit terms | Employment agreements for key employees
- *Regulatory & financing*: HSR filing (if applicable) | Other antitrust filings (EU, UK) | CFIUS notification (if applicable) | Industry-specific approvals | Financing commitments (debt commitment letters, equity) | Solvency opinions
- *Pre-closing*: Bring-down certificates | Officer's certificate | Secretary's certificate | Good standing certificates | Lien searches & releases | UCC-3s | Consents & waivers from third parties (landlord, customer, lender) | Closing payments schedule (funds flow)
- *Closing*: Execute closing documents (M) | Funds flow executed (M) | Wire confirmations | Closing book assembled | Press release
- *Post-closing*: 8-K filing (if public) | Update entity records | Integration kickoff | TSA execution | Working capital true-up (60–90 days) | Earn-out tracking setup | Tax elections (338(h)(10), 754, etc.)

**Rules:**
- When `Critical path?` is true and task is delayed → notify Deal Lead + Managing Partner.
- When `Workstream` = *Regulatory* and *Deliverable status* = *Signed* → enable "Closing" section.
- When closing is complete → automatically create a "Post-merger integration" project from the integration template (instantiate skeleton if no integration template exists).

---

## D. Finance (4 templates)

### D1. Annual Budget Planning
**Icon:** 💰 | **Color:** accent | **Default view:** Timeline | **Bundles:** "Status", "Priority"

**Sections:**
1. Assumptions & drivers
2. Department submissions
3. Consolidation
4. FP&A review
5. Executive review
6. Board approval
7. Finalize & load

**Custom fields:**
- `Department` — dropdown: Sales, Marketing, Product, Engineering, G&A, Customer Success, Operations, Finance, People
- `Budget category` — dropdown: Personnel, OpEx, CapEx, T&E, Software, Marketing programs, Professional services
- `Submission status` — dropdown: Not started, Drafting, Submitted, FP&A review, Approved, Revised
- `Approved amount` — number (currency)
- `Headcount delta` — number
- `Owner` — people

**Starter tasks:**
- *Assumptions*: Set FX rates | Set inflation assumptions | Set revenue plan (sales) | Set hiring philosophy | Set comp inflation | Set software inflation | Define cost-allocation methodology
- *Department submissions*: Distribute templates | Q&A office hours (Sales, Marketing, Eng, etc.) | Sales budget submitted | Marketing budget submitted | Eng budget submitted | G&A budget submitted | CS budget submitted
- *Consolidation*: Top-down model | Bottom-up consolidation | Reconciliation top-down vs bottom-up | Sensitivity & scenario analysis (Base, Conservative, Aggressive)
- *FP&A review*: Department review meetings (one per dept) | Pushback memo per dept | Revised submissions
- *Executive review*: CFO review | CEO review | Operating committee approval
- *Board approval*: Board package | Board meeting (M)
- *Finalize*: Load into ERP / planning tool | Lock budget | Distribute approved budgets | Update commission plans, comp letters

**Rules:**
- When *Submission status* = *Submitted* → auto-assign to FP&A reviewer.
- When `Approved amount` differs from submitted > 10% → require department head sign-off.
- When all departments reach *Approved* → unlock Executive review section.

**Dashboard charts:**
- Bar: Approved budget by department.
- Number: Total OpEx vs revenue plan.
- Line: Budget submission progress over time.

---

### D2. Monthly FP&A Close & Reporting
**Icon:** 📈 | **Color:** info | **Default view:** List | **Recurring:** Monthly | **Bundles:** "Status"

**Sections:**
1. Data load (Day 1–3)
2. Variance analysis (Day 4–6)
3. Commentary (Day 6–8)
4. Reporting pack (Day 8–10)
5. Distribution (Day 10–11)
6. Forecasting (Day 12–15)

**Custom fields:**
- `Function` — dropdown: Sales, Marketing, Product, Engineering, G&A, CS, Operations, Treasury
- `Metric` — text (e.g., ARR, NRR, GRR, CAC, Magic Number, Payback, Gross margin)
- `Variance threshold` — number (percent)
- `Variance direction` — dropdown: Favorable, Unfavorable, Within tolerance
- `Status` — global

**Starter tasks:**
- *Data load*: Confirm books closed (handshake with Accounting) | Load actuals into FP&A tool | Reconcile to GL | Refresh data connections | Validate (T-bal tie-out)
- *Variance analysis*: P&L vs budget — by department | P&L vs forecast — by department | KPI deltas | Headcount actual vs plan | Cost driver analysis | Win/loss revenue drivers
- *Commentary*: Draft executive summary | Drill commentary by department (collect from FBPs) | Risks & opportunities log update
- *Reporting pack*: CFO pack | CEO 1-pager | Board snapshot (if reporting month) | Investor metrics pack | Functional decks (Sales, Marketing, CS) | Self-serve dashboards refresh
- *Distribution*: Send to leadership | Department FBP review meetings | Update wiki / knowledge base
- *Forecasting*: Rolling forecast update | Reforecast risk-adjusted | Cash forecast update | Scenario refresh

**Rules:**
- When `Variance direction` = *Unfavorable* and variance > `Variance threshold` → notify CFO and the department FBP.
- When all *Reporting pack* tasks complete → post project status update "Month-end reporting delivered for <Month>".

**Dashboard charts:**
- Burnup: Reporting deliverables completed vs target day.
- Lollipop: Variance % by department (sorted).
- Number: Days from accounting close to FP&A delivery.

---

### D3. SOX 404 Compliance Cycle
**Icon:** 🛡️ | **Color:** warning | **Default view:** List | **Recurring:** Quarterly | **Bundles:** "Status", "Priority"

**Sections:**
1. Scoping & risk assessment
2. Process narratives & walkthroughs
3. Design effectiveness
4. Operating effectiveness
5. Deficiency tracking & remediation
6. Reporting & certifications

**Custom fields:**
- `Process area` — dropdown: Order-to-Cash, Procure-to-Pay, Record-to-Report, Hire-to-Retire, Tax, Treasury, IT General Controls, IT Business
- `Control ID` — text
- `Control objective` — text
- `Control type` — dropdown: Preventive, Detective
- `Control automation` — dropdown: Manual, IT-Dependent, Automated
- `Frequency` — dropdown: Daily, Weekly, Monthly, Quarterly, Annual, Ad-hoc
- `Risk` — dropdown: High, Medium, Low
- `Test status` — dropdown: Designed, Tested-Effective, Tested-Exception, Remediated, Re-tested
- `Severity` — dropdown: Deficiency, Significant Deficiency, Material Weakness

**Starter tasks (~40):**
- *Scoping*: Materiality calculation | Significant account scoping | Significant process scoping | Significant location scoping | Significant systems (ITGC) scoping | Update risk and control matrix (RCM)
- *Walkthroughs*: Walkthrough — O2C | Walkthrough — P2P | Walkthrough — R2R | Walkthrough — H2R | Walkthrough — Treasury | Walkthrough — ITGCs (Change, Access, Operations) | Document any process changes
- *Design effectiveness*: Evaluate control design vs risk | Identify design gaps | Approve RCM updates
- *Operating effectiveness*: Test plan per control | Sample selection methodology | Pull samples | Perform testing | Document workpapers | Identify exceptions
- *Deficiency tracking*: Root cause analysis | Remediation plan | Remediation owner & date | Re-test post-remediation | Aggregate deficiencies vs materiality
- *Reporting*: Management's assessment | CEO / CFO certifications (302/906) | Internal Audit report | External auditor coordination | Audit committee report

**Rules:**
- When `Severity` = *Material Weakness* → notify CFO, CEO, GC, Audit committee chair within 24h.
- When *Test status* = *Tested-Exception* → require remediation task to be created automatically.
- When all controls in a quarter reach *Tested-Effective* or *Remediated* → enable certification task.

**Dashboard charts:**
- Donut: Controls by `Risk`.
- Bar: Open exceptions by `Process area`.
- Number: % of controls tested-effective YTD.

---

### D4. 10-K / 10-Q Financial Reporting
**Icon:** 📄 | **Color:** primary | **Default view:** List | **Recurring:** Quarterly (10-Q) / Annual (10-K) | **Bundles:** "Status"

**Sections:**
1. Pre-close coordination
2. Drafting
3. Internal review
4. Disclosure committee
5. Audit committee
6. Auditor sign-off
7. EDGAR filing

**Custom fields:**
- `Section of filing` — dropdown: Cover, Forward-looking statements, Item 1 Business, Item 1A Risk Factors, Item 1B Unresolved staff comments, Item 2 Properties, Item 3 Legal proceedings, Item 4 Mine safety, Item 5 Market for registrant's equity, Item 6 Selected financial data, Item 7 MD&A, Item 7A Quantitative & Qualitative, Item 8 Financials, Item 9 Changes & disagreements, Item 9A Controls, Item 9B Other, Item 10–14 Part III, Item 15 Exhibits
- `Owner` — people
- `Reviewer` — people
- `Status` — dropdown: Not started, Draft, In review, Approved, Final
- `Tie-out done?` — checkbox
- `XBRL tagged?` — checkbox

**Starter tasks:**
- *Pre-close*: Close calendar finalized with Accounting | Confirm material events (acquisitions, divestitures, restructuring, debt) | Confirm restatements (if any)
- *Drafting*: Update business description | Update risk factors | Update MD&A | Liquidity & capital resources | Critical accounting estimates | Quantitative & qualitative disclosures (market risk) | Financial statements draft | Footnotes (Significant accounting policies, Revenue, Segment, Leases, Stock comp, Income tax, Debt, Equity, Earnings per share, Commitments & contingencies, Subsequent events, Related party) | Exhibits update (contracts, certifications)
- *Internal review*: Cross-functional review (Legal, Tax, IR, Operations) | Tie-out (numbers, references) | Edgar-ready file build
- *Disclosure committee*: Disclosure committee meeting (M) | Address comments
- *Audit committee*: Pre-read distribution | Audit committee meeting (M)
- *Auditor sign-off*: Provide near-final draft | Auditor consent | Auditor comfort letter (if applicable)
- *EDGAR filing*: Final certifications (CEO/CFO 302, 906) | EDGAR file & XBRL | File on EDGAR (M) | Press release & 8-K (if applicable) | Earnings call materials prep (Q only)

**Rules:**
- When *Tie-out done?* is unchecked and *Status* = *Approved* → block; require tie-out first.
- When *EDGAR filing* milestone is complete → post a project status update "10-Q/10-K filed for <Period>".

---

## E. Procurement (3 templates)

### E1. Strategic Sourcing / RFP
**Icon:** 📦 | **Color:** info | **Default view:** Gantt | **Bundles:** "Status"

**Sections:**
1. Requirements gathering
2. RFP build
3. Vendor outreach
4. Vendor responses
5. Evaluation
6. Negotiation
7. Award
8. Contract execution

**Custom fields:**
- `Category` — dropdown: IT/SaaS, Professional services, Marketing, Real estate, Travel, Logistics, Manufacturing inputs, Office, Legal, Insurance
- `Estimated annual spend` — number (currency)
- `Expected savings %` — number (percent)
- `Stakeholders` — people (multi)
- `Vendor candidate` — text (task title becomes the vendor when in the Vendor responses section)
- `Score (weighted)` — number
- `Recommendation` — dropdown: Award, Reject, Shortlist for round 2
- `Risk flags` — multi-select: Financial, Security, Insurance, Reference, Legal, Geopolitical

**Starter tasks:**
- *Requirements*: Business case | Define functional requirements | Define non-functional requirements (security, SLAs, compliance) | Define commercial requirements | Build evaluation scoring matrix
- *RFP build*: Draft RFP document | Internal stakeholder review | Approve RFP | Identify vendor longlist
- *Vendor outreach*: Send NDAs | Issue RFP (M) | Pre-bid Q&A window | Receive vendor questions | Respond
- *Vendor responses*: Receive responses (one task per vendor, scored) | Scoring per vendor
- *Evaluation*: Scoring calibration | Shortlist (3 vendors) | Demos / orals | Reference calls | Site visits (if applicable) | Best & final offer (BAFO)
- *Negotiation*: Commercial negotiation | Legal review of redlines | Risk acceptance memo (if needed)
- *Award*: Recommendation memo to steering committee | Steering committee decision (M) | Notify winners & losers
- *Contract execution*: Final contract (use C3 template — Contract Review) | Sign | Onboard vendor (use E2)

**Rules:**
- When task moves to *Award* → auto-create a child project from "Vendor Onboarding & Risk" (E2).
- When `Estimated annual spend` ≥ $500K → require CFO approval in *Award* before close.
- When `Risk flags` includes *Security* → auto-add Security team as collaborators.

**Form ("Sourcing request from business unit"):** Category, requirement summary, current spend, business owner, target go-live, current vendor (if any), urgency.

---

### E2. Vendor Onboarding & Risk
**Icon:** 🏷️ | **Color:** teal | **Default view:** List | **Bundles:** "Status", "Priority"

**Sections:**
1. Intake
2. Due diligence
3. Approvals
4. Setup
5. Active

**Custom fields:**
- `Vendor name` — text
- `Spend tier` — dropdown: Low (<$10K), Medium ($10K–$100K), High ($100K–$1M), Critical (>$1M)
- `Data access` — dropdown: None, Limited, Sensitive, Highly sensitive (PII/PHI/financial)
- `System access` — dropdown: None, Cloud-only, On-prem network, Both
- `Risk rating` — dropdown: Low, Medium, High, Critical
- `W-9 / W-8 received?` — checkbox
- `Insurance COI received?` — checkbox
- `SOC 2 / ISO 27001 received?` — checkbox
- `Vendor ID (ERP)` — text
- `Owner (internal)` — people

**Starter tasks:**
- *Intake*: Vendor intake form | Confirm sponsor & business owner | Confirm spend tier & data access
- *Due diligence*:
  - Financial: Collect W-9/W-8 | D&B lookup | Annual report review (if material vendor)
  - Insurance: Request COI | Verify policy limits per category (General Liability, Professional Liability, Cyber, Workers Comp)
  - Security: Security questionnaire | SOC 2 report review | Penetration test summary | Privacy review (DPA if PII) | Subprocessor list
  - Compliance: Sanctions / OFAC screening | PEP screening | Anti-bribery (FCPA) check
  - References: 2–3 customer references
- *Approvals*: Procurement approval | Legal approval | Security approval (if data) | Privacy approval (if PII) | Finance approval (banking & payment terms)
- *Setup*: Vendor master in ERP | Banking (ACH form, fraud verification call) | Tax setup | PO process explained to vendor | Set up vendor portal access
- *Active*: Ongoing risk monitoring | Annual COI refresh | Annual SOC 2 refresh

**Rules:**
- When `Spend tier` = *Critical* or `Data access` = *Highly sensitive* → require ALL DD tasks + escalate `Risk rating` minimum to *High*.
- When `Insurance COI received?` is true and `SOC 2` is true and all approvals are done → unlock *Setup*.
- When *Active* is reached → create recurring annual refresh tasks (COI, SOC 2).

**Form ("Vendor intake"):** Vendor name, business owner, sponsor, type of service, expected annual spend, data access, system access, urgency, attach proposal.

---

### E3. Contract Renewal Management
**Icon:** 🔄 | **Color:** warning | **Default view:** Board | **Recurring:** Ongoing | **Bundles:** "Status"

**Sections (Board columns = days-out windows):**
1. 180 days out
2. 120 days out
3. 90 days out
4. 60 days out
5. 30 days out
6. Decision made
7. Renewed
8. Cancelled

**Custom fields:**
- `Vendor / Counterparty` — text
- `Contract type` — dropdown (reuse from C3)
- `Current annual cost` — number (currency)
- `Renewal date` — date
- `Notice period (days)` — number
- `Auto-renew?` — checkbox
- `Owner (business)` — people
- `Owner (procurement)` — people
- `Decision` — dropdown: Renew (same terms), Renegotiate, Replace, Terminate
- `Usage / value rating` — dropdown: High, Medium, Low

**Starter tasks (each task = one renewing contract):**
- "Salesforce — Enterprise CRM" — Renewal date D+150 — Annual $480K
- "AWS — Production accounts" — Renewal date D+90 — Annual $1.2M
- "Office Lease — HQ" — Renewal date D+200 — Annual $850K
- (provision 3–5 example contract rows)

**Per-task subtask checklist (created by rule when a renewal enters its window):**
- Confirm `Usage / value rating`
- Internal stakeholder survey
- Decision: Renew / Renegotiate / Replace / Terminate
- If Renegotiate: market price benchmark, draft RFP if needed
- If Replace: kick off E1 sourcing project
- If Terminate: send notice within notice period
- Legal review of renewal terms
- Approvals per signing authority
- Execute and store

**Rules:**
- Daily: Any renewal whose `Renewal date - today < section threshold` moves to the appropriate column. (e.g., 180 → 120 → 90 → 60 → 30.)
- When entering the **30 days out** column without a Decision → notify Procurement Director.
- When `Auto-renew?` is true and `Notice period` window opens → flag with red tag "Notice deadline".
- When Decision = *Replace* → create a new project from the RFP template (E1).

**Dashboard charts:**
- Bar: Renewals by category, next 12 months.
- Number: Annualized contract value renewing this quarter.
- Lollipop: Top 10 renewals by `Current annual cost`.

---

## F. HR / People (4 templates)

### F1. Talent Acquisition — Req to Hire
**Icon:** 🧑‍💼 | **Color:** primary | **Default view:** Board | **Bundles:** "Status", "Priority"

**Sections (Board columns = recruitment stages):**
1. Req approval
2. Sourcing
3. Recruiter screen
4. Hiring manager screen
5. Panel / Onsite
6. Debrief & decision
7. Offer
8. Background check
9. Accepted
10. Declined / Rejected

**Custom fields:**
- `Role` — text
- `Department` — dropdown (reuse)
- `Hiring manager` — people
- `Recruiter` — people
- `Stage` — dropdown (mirrors sections)
- `Source` — dropdown: Inbound, Outbound, Referral, Agency, University, Returning candidate, LinkedIn, Boomerang
- `Compensation band` — dropdown: Level I, II, III, IV, V, VI
- `Offer amount` — number (currency)
- `Equity grant` — number
- `Start date target` — date
- `Diversity slate?` — checkbox
- `Visa sponsorship?` — checkbox

**Starter tasks (each task = a candidate):**
- "Maya P. — Senior Product Designer" — *Hiring manager screen* — Source: Referral
- "Theo R. — Backend Engineer III" — *Panel* — Source: Inbound
- (provision 3–6 example candidate rows)

**Per-task subtasks (auto-created on req approval):**
- Sourcing plan
- Job description review & approval
- Post role (LinkedIn, careers page, niche boards)
- Initial outreach pipeline (15+ candidates)
- Recruiter screens
- Hiring manager screen
- Panel scheduling
- Debrief & scorecards
- Reference checks
- Offer prep (comp benchmarking)
- Offer extended
- Background check
- Welcome / pre-onboarding handoff

**Rules:**
- When a candidate moves to *Offer* → notify Finance (for comp budget alignment).
- When *Diversity slate?* is unchecked at *Panel* → notify recruiter to broaden sourcing.
- When *Accepted* → automatically create an Onboarding project (F2) with the new hire's start date.

**Form ("New role request"):** Role title, department, level, justification, headcount source (backfill / new), key competencies, target start date, attach JD.

**Dashboard charts:**
- Donut: Open reqs by department.
- Lollipop: Average days in stage (Sourcing → Offer).
- Number: Offer accept rate (last 90 days).

---

### F2. New Hire Onboarding — Day 0 to Day 90
**Icon:** 👋 | **Color:** accent | **Default view:** Timeline | **Bundles:** "Status", "Priority"

**Sections:**
1. Pre-start (Offer signed → Day 0)
2. Day 1
3. Week 1
4. Weeks 2–4
5. Month 2
6. Month 3 (30-60-90 review)

**Custom fields:**
- `Employee name` — text
- `Start date` — date
- `Manager` — people
- `Buddy` — people
- `Department` — dropdown
- `Location` — dropdown: HQ, Remote-US, Remote-International, Office X, Office Y
- `Equipment status` — dropdown: Not ordered, Ordered, Shipped, Received
- `I-9 status` — dropdown: Not started, Section 1, Section 2 verified, E-Verified
- `Benefits enrolled?` — checkbox
- `IT access provisioned?` — checkbox

**Starter tasks:**
- *Pre-start*:
  - Send welcome packet & first-day instructions
  - Order equipment (laptop, monitor, peripherals) per location & role
  - Provision IT accounts (email, Slack, Workday, Salesforce, GitHub, …)
  - Building access badge / remote-work stipend
  - Add to org chart & directory
  - Manager pre-week: prep first-week plan, schedule intros
  - Compliance: I-9 Section 1, W-4, direct deposit, state withholding, background check
  - Add to relevant Slack channels & mailing lists
- *Day 1*:
  - Welcome session (HR & IT)
  - Manager 1:1 — Welcome & overview
  - Buddy intro
  - I-9 Section 2 verification (in-person or authorized rep) (M)
  - Tour / Remote orientation
- *Week 1*:
  - Role-specific training kickoff
  - Team intros (one per teammate)
  - Manager 1:1s daily
  - Security & compliance training (mandatory)
  - Privacy training (mandatory)
  - Benefits 1:1 with People Ops
  - Tooling deep dive
- *Weeks 2–4*:
  - First small deliverable
  - Cross-functional intros
  - Customer / product overview sessions
  - Optional ERG intros
- *Month 2*:
  - 30-day check-in with manager (M)
  - 30-day People Ops survey
  - Mid-ramp project assignment
- *Month 3 (60-90)*:
  - 60-day check-in
  - 90-day review (M)
  - Probation period close (if applicable)
  - Confirm full-cycle deliverables

**Rules:**
- When `Start date - today = 14 days` → kick off Pre-start automation (provision tasks).
- When *Equipment status* not *Received* by Start date − 3 days → notify IT manager.
- When 90-day review marked complete → notify Compensation team for any review cycle eligibility.

**Form ("Manager onboarding intake"):** Buddy assignment, first project, suggested intro list, equipment exceptions, special access needs.

---

### F3. Performance Review Cycle
**Icon:** ⭐ | **Color:** indigo | **Default view:** List | **Recurring:** Semi-annual or Annual | **Bundles:** "Status"

**Sections:**
1. Cycle setup
2. Self-review
3. Manager review
4. Peer / Upward feedback
5. Calibration
6. Compensation decisions
7. Delivery (1:1s)
8. Wrap-up

**Custom fields:**
- `Employee` — people
- `Manager` — people
- `Department` — dropdown
- `Level` — dropdown: IC1, IC2, IC3, IC4, IC5, IC6+, M1, M2, M3, M4+
- `Tenure (months)` — number
- `Rating (proposed)` — dropdown: Significantly exceeds, Exceeds, Meets, Below, Significantly below
- `Rating (final, post-calibration)` — dropdown (same)
- `Promotion eligible?` — checkbox
- `Promotion (final)` — checkbox
- `Comp recommendation` — number (percent)
- `Equity refresh ($)` — number (currency)
- `Bonus modifier` — number (percent)

**Starter tasks:**
- *Cycle setup*: Define cycle dates | Calibration philosophy | Distribute manager training | Comp planning guardrails (budget envelope) | Launch communications
- *Self-review*: Self-review template launched | Reminders | Late list
- *Manager review*: Manager review template launched | Calibration training | Coaching for newer managers
- *Peer / Upward*: Solicit peer feedback | Aggregate feedback | Make available to managers
- *Calibration*: Department calibration meetings | Cross-department calibration | Adjustments tracked
- *Comp decisions*: Comp recommendation per employee | Budget reconciliation | Comp committee approval (if needed) | Equity refresh decisions
- *Delivery*: Generate comp letters | Train managers on delivery | Schedule 1:1s | Deliver reviews (Day X) | HR available for escalations
- *Wrap-up*: Post-cycle survey | Lessons learned | Update next-cycle plan

**Rules:**
- When *Self-review* not submitted by deadline − 2 days → reminder; deadline − 0 → escalate to manager.
- When `Promotion eligible?` = true → require explicit decision and supporting documentation.
- When `Comp recommendation` > budget guardrail → require department head + CHRO approval.

**Dashboard charts:**
- Donut: Distribution of ratings by department (pre- & post-calibration).
- Bar: Comp spend by department vs budget envelope.
- Number: Promotion rate (this cycle vs prior).

---

### F4. Open Enrollment
**Icon:** 🩺 | **Color:** info | **Default view:** Gantt | **Recurring:** Annual | **Bundles:** "Status", "Priority"

**Sections:**
1. Vendor selection & renewals
2. Plan design
3. Communications planning
4. System setup
5. Enrollment window
6. Confirmation & file feeds
7. Post-OE wrap-up

**Custom fields:**
- `Plan type` — dropdown: Medical, Dental, Vision, Life, AD&D, STD, LTD, 401(k), HSA, FSA-Healthcare, FSA-Dependent care, Commuter, EAP, Voluntary benefits
- `Carrier` — text
- `Plan year` — number
- `Premium change %` — number (percent)
- `Employer contribution change %` — number (percent)
- `Status` — global
- `Enrollment rate` — number (percent)

**Starter tasks:**
- *Vendor selection*: RFP non-renewing carriers (use E1) | Broker review of market | Negotiate renewals | Approve final lineup (CFO + CHRO)
- *Plan design*: Plan changes for next year | Contribution strategy | HDHP / HSA strategy | Network adequacy review | Compliance reviews (ACA affordability, MHPAEA, HIPAA notices, SBC, SAR)
- *Communications planning*: Communication calendar | Build benefits guide (PDF + web) | Build decision tools (calculator) | Schedule town halls | Schedule benefits 1:1s | FAQ
- *System setup*: Configure HRIS open enrollment module | Build new plans / rates | Build dependent verification | Test enrollment flow (E2E) | Configure carrier file feeds (834 EDI)
- *Enrollment window*: Launch enrollment (M) | Town halls | Daily reminder cadence | Weekly enrollment progress reports | Address questions queue | Late-stage one-on-ones
- *Confirmation*: Close enrollment (M) | Send confirmation statements | Reconcile elections | Generate carrier files (initial 834) | Resolve discrepancies | Update payroll deductions
- *Post-OE*: Year-end testing reminders | New plan year kickoff communications | Continuous enrollment monitoring (qualifying life events) | Post-mortem

**Rules:**
- When *Enrollment rate* < 60% with 5 days left → mass reminder + push to managers.
- When *Plan year* setup completed → auto-create payroll deduction changes effective Jan 1.
- When close enrollment (M) hits → lock benefits HRIS, except for life events.

**Form ("Benefits questions intake"):** Employee, plan type, question, urgency. Submissions create tasks in a "Benefits Q&A" backlog (separate project) auto-assigned to People Ops.

**Dashboard charts:**
- Burnup: Enrollments completed vs total employees.
- Bar: Premium change % by plan.
- Donut: HDHP vs PPO election mix.

---

## Implementation requirements

1. Put each category in its own file under `src/features/templates/curated/`:
   - `business.ts` (A1–A4)
   - `accounting.ts` (B1–B5)
   - `law.ts` (C1–C4)
   - `finance.ts` (D1–D4)
   - `procurement.ts` (E1–E3)
   - `hr.ts` (F1–F4)
   Export a single combined index in `index.ts`.

2. Each template should also expose:
   - `formTemplates: Partial<Form>[]` (where listed above)
   - `ruleTemplates: Array<Omit<Rule,'id'|'projectId'|'createdBy'|'createdAt'>>`
   - `dashboardTemplates: Array<Omit<Dashboard,'id'|'workspaceId'|'ownerId'|'createdAt'|'sharedWith'>>` (where listed)

3. Add a **category filter** to the template gallery (step 06 / step 27) with chips: All • Business • Accounting & Tax • Law • Finance • Procurement • HR. Default to All.

4. Each template card shows the icon, name, category badge, 1-line description, section count, starter-task count, rule count, and a "Preview" button.

5. The "Preview" modal shows tabs:
   - **Overview** — description, default view, recommended bundles.
   - **Sections** — ordered list with task counts.
   - **Custom fields** — table.
   - **Starter tasks** — flat list (first 20).
   - **Rules** — list of automations.
   - **Forms** — embedded form preview (read-only).
   - **Dashboards** — chart cards (read-only).

6. The instantiator should:
   - Create the project with the template's `defaults` (color, icon, default view).
   - Create custom fields (or attach existing global ones by name).
   - Create sections in order.
   - Create tasks with their relative dates resolved against the chosen project start date.
   - Create rules.
   - Create forms.
   - Create dashboards.
   - Add a row in the project's activity feed: "Created from template: <Template name>".

7. Add a row to `Design.md`: `27b | src/features/templates/curated | Industry templates library | <today>` plus the **"Curated Template Index"** section with all 25 by category.

### Success criteria
- The "Create from template" dialog (step 06) now shows a categorized gallery with 25 industry templates.
- Picking any template creates a working project with realistic sections, custom fields, ≥ 15 starter tasks, ≥ 2 rules, and (where applicable) a form and dashboard.
- The onboarding step (step 30) references these templates by name when provisioning new tenants and the internal evaluation tenant suite.
- `Design.md` lists every template with its category and short description.

Do not break any existing functionality. Keep one template per category file. Add docstrings to each template export explaining when to use it.
