# 28b — Time Tracking & Expense Tracking (PSA)

**Goal:** Turn Tasklytic into a real Professional Services Automation (PSA) platform for billable work. Every task can capture **time entries** (timer-based or manual, billable or non-billable, with auto-resolved billing rates) and **expenses** (with receipts, categories, pass-through markup, reimbursement, and approvals). Reporting gains Work-in-Progress (WIP), Realization, Utilization, Effective Rate, Aging WIP, and AR Aging. The accounting and law-firm templates from 27b retrofit to use this by default.

**Drop after:** `28-ai-assistant-gemini.md`. **Before:** `29-polish-mobile-and-accessibility.md` (so the polish pass also polishes the new screens) and `30-onboarding-and-starter-content.md` (so the onboarding pipeline provisions realistic PSA starter content for accounting and law-firm tenants).

---

## Prompt (paste into Google AI Studio Build)

Add native **time tracking** and **expense tracking** to Tasklytic, plus the supporting PSA infrastructure (billing rates, clients, matters, timesheets, expense reports, approvals, light invoicing, and PSA reporting). New code under `src/features/billing/`, `src/features/time/`, `src/features/expenses/`, `src/features/clients/`, `src/features/matters/`, `src/features/invoices/`, and extensions to `src/features/reporting/`. Do not break previous steps.

**Critical rules**
1. Extend the step 02 data model **additively only** — new types and new optional fields. Do not rename or remove anything.
2. Time tracking and expense tracking are **per task by default** but also work at the project/matter level when no task is selected.
3. All amounts have explicit `currency` (ISO 4217). The workspace has a `defaultCurrency` (extend `Workspace` non-breakingly with this field). The UI shows mixed-currency totals separately by default; conversion is performed through the `FxRatesAdapter` (`src/lib/fxRates/types.ts`) — the V1 adapter returns 1:1 with a clear "FX provider not configured — totals shown per currency" banner; production binds the adapter to a real rates provider (Open Exchange Rates / ECB / xe.com) via Settings → Integrations → FX Rates.
4. Time and expense entries follow a clear status lifecycle: `draft → submitted → approved → billed/written_off`. Rejected entries return to `draft` with a reason.
5. Billing rate resolution uses a **cascade** (most specific wins): Matter override > Project override > Client override > Team/Role rate > User default rate.
6. Approval routing is configurable per workspace and can be overridden per project/matter.
7. Append a row to `Design.md`: `28b | src/features/time, src/features/expenses, src/features/billing, src/features/clients, src/features/matters, src/features/invoices, src/features/reporting (ext) | Time tracking & expenses | <today>` plus a section **"PSA model"** with the rate cascade rule and the status lifecycle diagram (text).

---

## 1. Data model (extend step 02 — all additive)

Add to `src/types/`:

```ts
// Time entry
export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'billed' | 'written_off';

export type TimeEntry = {
  id: ID;
  workspaceId: ID;
  userId: ID;                        // who logged it
  taskId?: ID;                       // task-level OR
  projectId?: ID;                    // project-level (when not attached to a task)
  matterId?: ID;                     // legal: redundant when project's matterId is set
  clientId?: ID;                     // computed: derived from matter/project
  date: ISODate;                     // the work date (timezone-aware via user TZ)
  startedAt?: ISODateTime;           // when started (timer-based)
  stoppedAt?: ISODateTime;           // when stopped (timer-based)
  durationMinutes: number;           // minutes; timer-derived OR manual
  description: string;               // narrative (visible on invoice if billable)
  billable: boolean;
  rateSnapshot: number;              // hourly rate at the time of entry (snapshotted for audit trail)
  rateSource: 'user_default' | 'role' | 'team' | 'project' | 'matter' | 'client' | 'override';
  currency: string;                  // ISO 4217
  amount: number;                    // billable ? rate × hours : 0
  activityCode?: string;             // e.g., UTBMS 'A101' (Plan)
  taskCode?: string;                 // e.g., UTBMS 'L110' (Fact Investigation)
  status: TimeEntryStatus;
  submittedAt?: ISODateTime;
  approvedById?: ID;
  approvedAt?: ISODateTime;
  rejectedReason?: string;
  invoiceId?: ID;                    // populated when billed
  writeOffReason?: string;
  createdAt: ISODateTime;
  modifiedAt: ISODateTime;
};

// Expense
export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed' | 'billed' | 'written_off';

export type ExpenseCategory =
  | 'travel_air' | 'travel_lodging' | 'travel_ground' | 'meals_client' | 'meals_team'
  | 'supplies' | 'third_party' | 'filing_fees' | 'court_fees' | 'expert_fees'
  | 'witness_fees' | 'service_fees' | 'process_server'
  | 'copies' | 'postage_shipping' | 'telecom' | 'software_subscriptions'
  | 'training_cpe' | 'mileage' | 'parking_tolls' | 'other';

export type Expense = {
  id: ID;
  workspaceId: ID;
  userId: ID;                        // who incurred / submits the expense
  taskId?: ID;
  projectId?: ID;
  matterId?: ID;
  clientId?: ID;
  date: ISODate;
  description: string;
  category: ExpenseCategory;
  vendor: string;
  amount: number;                    // base amount (pre-tax)
  taxAmount: number;
  totalAmount: number;               // amount + taxAmount
  currency: string;
  paymentMethod: 'corporate_card' | 'personal' | 'cash' | 'wire' | 'check' | 'ach';
  receiptAttachmentId?: ID;
  billable: boolean;
  passThrough: boolean;              // bill at cost (no markup) — common in legal
  markupPercent: number;             // 0 for pass-through; e.g., 10 = 10%
  billableAmount: number;            // totalAmount × (1 + markupPercent/100) when billable
  reimbursable: boolean;             // true when paid personally → owed to user
  mileageMiles?: number;             // for `category=mileage`; rate × miles → amount
  mileageRate?: number;
  status: ExpenseStatus;
  submittedAt?: ISODateTime;
  approvedById?: ID;
  approvedAt?: ISODateTime;
  rejectedReason?: string;
  reimbursedAt?: ISODateTime;
  reimbursementBatchId?: ID;
  invoiceId?: ID;
  writeOffReason?: string;
  createdAt: ISODateTime;
  modifiedAt: ISODateTime;
};

// Billing rate (one resolved rate at a point in time)
export type BillingRateScope = 'user_default' | 'role' | 'team' | 'workspace' | 'client' | 'project' | 'matter';

export type BillingRate = {
  id: ID;
  workspaceId: ID;
  scope: BillingRateScope;
  scopeId?: ID;                      // teamId / projectId / matterId / clientId / userId
  role?: string;                     // 'Partner' | 'Manager' | 'Senior' | 'Associate' | 'Paralegal' | …
  userId?: ID;                       // when scope=user_default or role+user-specific override
  hourlyRate: number;
  currency: string;
  effectiveFrom: ISODate;
  effectiveTo?: ISODate;
  notes?: string;
  createdAt: ISODateTime;
};

// Rate card — a named set of rates (often per client or matter)
export type RateCard = {
  id: ID;
  workspaceId: ID;
  name: string;                      // "Standard 2026", "Government rate", "Crestwood discount"
  description?: string;
  rates: BillingRate[];              // bundled rates (typically scope='role' or 'user_default')
  currency: string;
  effectiveFrom: ISODate;
  effectiveTo?: ISODate;
};

// Client (separate from contact records)
export type Client = {
  id: ID;
  workspaceId: ID;
  name: string;
  type: 'individual' | 'business' | 'nonprofit' | 'government';
  industry?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  billingAddress?: string;
  taxId?: string;                    // EIN / SSN / VAT
  paymentTerms: 'due_on_receipt' | 'net_15' | 'net_30' | 'net_45' | 'net_60';
  defaultRateCardId?: ID;
  defaultCurrency: string;
  retainerBalance?: number;          // legal: trust account / advance balance
  notes?: string;
  archived: boolean;
  createdAt: ISODateTime;
};

// Matter (legal): a billable engagement scoped to a client.
// Backed by a Project under the hood — see "Project extension" below — but exposed as Matter UI.
export type Matter = {
  id: ID;                            // typically equal to the Project's id
  workspaceId: ID;
  projectId: ID;                     // 1:1 with the underlying project
  clientId: ID;
  matterNumber: string;              // human-readable: "2026-0012"
  practiceArea: string;
  responsibleAttorneyId: ID;
  originatingAttorneyId: ID;
  feeArrangement: 'hourly' | 'flat_fee' | 'contingency' | 'hybrid' | 'retainer';
  flatFeeAmount?: number;
  contingencyPercent?: number;
  budgetHours?: number;
  budgetAmount?: number;
  rateCardId?: ID;                   // overrides client's default
  openedAt: ISODate;
  closedAt?: ISODate;
  status: 'active' | 'on_hold' | 'closed' | 'collections';
  conflictStatus: 'cleared' | 'pending' | 'waivable' | 'conflict';
};

// Project extension (non-breaking — add as optional fields on existing Project)
// Project.clientId?: ID
// Project.matterId?: ID
// Project.feeArrangement?: 'hourly'|'flat_fee'|'contingency'|'hybrid'|'retainer'|'mixed'
// Project.budgetHours?: number
// Project.budgetAmount?: number
// Project.rateCardId?: ID
// Project.engagementCode?: string   // CPA firms commonly use this
// Project.requireTimeTracking?: boolean
// Project.requireExpenseTracking?: boolean
// Project.timeApprovalChain?: ID[]  // user ids in approval order
// Project.expenseApprovalChain?: ID[]

// Timesheet (collection of time entries for a period)
export type Timesheet = {
  id: ID;
  workspaceId: ID;
  userId: ID;
  periodStart: ISODate;
  periodEnd: ISODate;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'locked';
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  totalAmount: number;
  utilizationPercent: number;        // billableHours / target
  targetHours: number;
  submittedAt?: ISODateTime;
  approvedById?: ID;
  approvedAt?: ISODateTime;
  rejectedReason?: string;
  notes?: string;
};

// Expense report (collection of expenses)
export type ExpenseReport = {
  id: ID;
  workspaceId: ID;
  userId: ID;
  name: string;                      // "October 2026 — Atlanta trip"
  expenseIds: ID[];
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed';
  totalAmount: number;
  reimbursableAmount: number;
  currency: string;
  submittedAt?: ISODateTime;
  approvedById?: ID;
  approvedAt?: ISODateTime;
  rejectedReason?: string;
  reimbursedAt?: ISODateTime;
  reimbursementMethod?: 'payroll' | 'ach' | 'check';
  reimbursementReference?: string;
};

// Invoice — generated client-side in the V1 adapter (PDF export + JSON export); production adapter (AccountingAdapter) syncs invoices to QuickBooks / Xero / NetSuite
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'void' | 'written_off';

export type Invoice = {
  id: ID;
  workspaceId: ID;
  clientId: ID;
  projectIds: ID[];
  matterIds: ID[];
  invoiceNumber: string;             // workspace-configurable scheme
  issueDate: ISODate;
  dueDate: ISODate;
  periodStart: ISODate;
  periodEnd: ISODate;
  timeEntryIds: ID[];
  expenseIds: ID[];
  subtotalFees: number;
  subtotalExpenses: number;
  discountAmount: number;
  discountReason?: string;
  taxAmount: number;
  total: number;
  amountPaid: number;
  amountOutstanding: number;
  currency: string;
  notes?: string;
  status: InvoiceStatus;
  pdfDataUrl?: string;
  sentAt?: ISODateTime;
  paidAt?: ISODateTime;
  voidedAt?: ISODateTime;
  voidedReason?: string;
  createdAt: ISODateTime;
};

// Payment (against invoice)
export type Payment = {
  id: ID;
  workspaceId: ID;
  invoiceId: ID;
  amount: number;
  currency: string;
  method: 'check' | 'ach' | 'wire' | 'card' | 'trust_application' | 'other';
  reference?: string;
  paidAt: ISODate;
  recordedById: ID;
  createdAt: ISODateTime;
};

// Reimbursement batch
export type ReimbursementBatch = {
  id: ID;
  workspaceId: ID;
  expenseReportIds: ID[];
  totalAmount: number;
  method: 'payroll' | 'ach' | 'check';
  reference?: string;
  paidAt: ISODate;
};

// Workspace settings extensions (extend Workspace non-breakingly)
// Workspace.defaultCurrency?: string
// Workspace.timesheetPeriod?: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
// Workspace.timesheetWeekStart?: 'monday' | 'sunday'
// Workspace.targetWeeklyHours?: number   // default 40
// Workspace.targetUtilizationPercent?: number  // e.g., 75
// Workspace.requireTimeApproval?: boolean
// Workspace.requireExpenseApproval?: boolean
// Workspace.expenseReceiptRequiredAbove?: number  // e.g., $25
// Workspace.mileageRate?: number          // e.g., 0.67 ($/mile)
// Workspace.invoicePrefix?: string         // e.g., "INV-2026-"
// Workspace.invoiceStartNumber?: number    // e.g., 1001
// Workspace.feeArrangements?: Array<'hourly'|'flat_fee'|'contingency'|'hybrid'|'retainer'>

// User extensions
// User.defaultHourlyRate?: number
// User.timekeeperRole?: string             // 'Partner' | 'Manager' | 'Senior' | ...
// User.defaultActivityCode?: string
// User.timekeeperId?: string               // external timekeeper code if any
```

Add new Zustand stores (one per collection): `useTimeEntriesStore`, `useExpensesStore`, `useBillingRatesStore`, `useRateCardsStore`, `useClientsStore`, `useMattersStore`, `useTimesheetsStore`, `useExpenseReportsStore`, `useInvoicesStore`, `usePaymentsStore`, `useReimbursementBatchesStore`. Persist all to localStorage.

Add a running-timer store: `useTimerStore` with `running: { taskId, startedAt, description, activityCode } | null`, plus actions `start(taskId,…)`, `stop()`, `discard()`.

---

## 2. Rate resolution (the single source of truth)

Create `src/features/billing/useRateResolver.ts` with:

```ts
type ResolveArgs = {
  userId: ID;
  date?: ISODate;            // defaults to today
  matterId?: ID;
  projectId?: ID;
  clientId?: ID;
};
function resolveRate(args: ResolveArgs): {
  hourlyRate: number;
  currency: string;
  rateSource: BillingRate['scope'] | 'role' | 'override';
};
```

**Cascade (most specific wins, first match):**
1. Matter-level rate override for this user (or role)
2. Matter's rate card → user/role rate within the card
3. Project-level rate override
4. Client-level rate (or client's default rate card)
5. Team rate for the user's role
6. Workspace-level rate card for the user's role
7. User's default hourly rate
8. Fallback: 0 with `rateSource: 'override'` and a `console.warn`

All rates filtered by `effectiveFrom <= date < effectiveTo`.

Render the resolved rate everywhere a time entry is created. Snapshot the rate into `TimeEntry.rateSnapshot` and `rateSource` at creation/submission for audit-trail.

---

## 3. UI — Task detail pane extensions

Extend the task detail pane (step 07) tab bar. Current tabs are: Comments | Activity. Add two new tabs: **Time** and **Expenses**. Tab order: Comments | Activity | **Time** | **Expenses**.

### Time tab

**Header strip** (across the top):
- "**N.NN h logged**" (sum of duration on this task)
- "**$X,XXX billable**" (sum of billable amount)
- "**Y.YY h non-billable**"
- Right side: "+ Add time" button + "▶ Start timer" button (if no timer running on this task) or "■ Stop timer" (if a timer is running on this task).

**Entry list**:
- Rows of `TimeEntry`: avatar, date, duration (h:mm), description (truncated), billable badge, rate, amount, status pill, "..." menu (Edit, Submit, Duplicate, Delete, Write off).
- Sort: newest first by default; allow sort by duration, amount, status.
- Filter chips: All / Mine / Billable only / Non-billable / Unsubmitted / Submitted / Approved / Billed / Written off.
- Bulk select with checkboxes → bulk actions: Submit, Approve (if you have permission), Reject, Delete, Mark billable / non-billable, Move to project, Write off.

**Add time entry dialog** (`<ManualTimeEntryDialog/>`):
- Date (defaults to today)
- Duration: support BOTH a `h:mm` text input AND a decimal hours input; live-sync between them. Also support natural input like `1h 15m` or `0.25`.
- Description (multiline, supports basic markdown; @-mentions allowed; mention an Activity code chip via slash `/`)
- Billable toggle (default = the project's `requireTimeTracking` ? true : task default)
- Rate (auto-resolved; show source label like "From Matter rate card – Crestwood Discount"; editable as override)
- Activity / Task code pickers (when project's `useUtbms` flag is on — set on B/C templates)
- Apply to: This task (default) | This project | Pick another...

**Start timer flow**:
- Big primary button on the task. Click → timer starts. The task pill in the topbar reads "▶ Working on: <task name> · 00:14" and ticks every second.
- Stop timer → opens a confirmation popover pre-filled with elapsed duration, lets you edit description, billable, activity code → Save creates the TimeEntry. "Discard" abandons.
- Only **one timer can run at a time per user**. Starting a new one prompts: "Stop and save current timer first?" → with options Save / Discard / Cancel.
- A persistent banner appears at the very top of the app when a timer is running, with elapsed time, the task, and Stop/Discard.

### Expenses tab

**Header strip**:
- "**$X,XXX total**", "**$Y,YYY billable**", "**$Z,ZZZ reimbursable**"
- Right side: "+ Add expense" button + dropdown ("From receipt", "Mileage", "Manual").

**Entry list**:
- Rows of `Expense`: thumbnail of receipt (small), vendor, category icon, date, total amount (with currency), markup (if any), billable badge, reimbursable badge, status pill, "..." menu (Edit, Submit, Duplicate, Delete, Attach to expense report, Write off).
- Filter chips: All / Mine / Billable / Reimbursable / By category / Status.
- Bulk actions: Submit, Approve, Reject, Add to expense report, Mark billable / non-billable, Delete, Write off.

**Add expense dialog** (`<ExpenseEntryDialog/>`):
- Date
- Description (single line)
- Category (dropdown with icons)
- Vendor (free text with autocomplete from past entries)
- Amount + Currency
- Tax amount (auto-suggests rate by location if a `defaultTaxRate` is set on workspace; otherwise 0)
- Total (computed; editable)
- Payment method
- Receipt: drag-drop, file picker, or "Take photo" (on mobile, opens camera via `<input capture>`). After upload, the receipt is dispatched to the `OcrAdapter` (`src/lib/ocr/types.ts`) which auto-fills vendor / date / amount / tax fields. The V1 adapter returns an empty result and surfaces "OCR provider not configured — enter amounts manually (Settings → Integrations → OCR)"; production binds Veryfi / Mindee / Textract.
- Billable toggle
- Pass-through toggle (default on for legal `filing_fees`, `court_fees`, `expert_fees`, `service_fees`, `process_server`)
- Markup % (hidden when pass-through)
- Reimbursable toggle (auto-true when `paymentMethod = personal`)
- Apply to: This task / This project / This matter / Other

**Mileage variant**: instead of amount, enter miles → amount = miles × `Workspace.mileageRate` (defaults to current IRS standard, e.g., 0.67); show calc.

---

## 4. Floating timer widget (topbar)

Add a topbar element (between Create button and Notifications bell):
- When **no timer running**: small icon button "⏱". Click → opens a quick-start popover:
  - "What are you working on?" task autocomplete
  - Description (optional)
  - Activity code (optional)
  - Billable toggle
  - Start button
- When **timer running**: a chip "▶ <task name> · 1:23:45" that ticks every second. Click → opens a popover with Stop / Discard / Edit description / View task.

Keyboard shortcut: `T` from anywhere → opens the start-timer popover (or stop if running).

If the user closes the tab while a timer is running, persist `startedAt` in localStorage. On next open, show a banner: "You have a running timer started <X ago>. Save what you have, continue, or discard?"

---

## 5. New pages

### `/w/:workspaceId/time` — My Time

Default landing. Tabs: **My week** (default) | **My month** | **All my entries** | **To approve** (if approver) | **Approval history**.

#### My week — weekly grid timesheet

A grid where:
- **Rows = tasks** (or projects/matters when no task is set). Each row shows: client/matter, project, task name, billable/non-billable indicator.
- **Columns = the 7 days** of the current week (Mon-Sun by default).
- **Cells = decimal hours** for that (row, day). Click → inline editor or popover.
- **Row totals** on the right.
- **Daily totals** at the bottom; below daily totals: billable hours, non-billable hours, target gap.
- **+ Add row** at the bottom — pick a task (autocomplete) to add a row.
- **Copy from last week** button — duplicates last week's row structure with zero hours.
- **Submit week** button — top right. Moves the period's entries to `submitted` and creates a Timesheet record. The grid becomes read-only with a banner "Timesheet submitted Oct 21".
- **Pending approval** banner if the latest submitted timesheet is awaiting approval.
- **Rejected** banner with reason if the latest timesheet was rejected; "Reopen for editing" returns it to draft.

Right rail:
- **This week**: total hours, billable hours, non-billable hours, utilization %.
- **Target**: weekly target (from workspace), gap.
- **By project** mini bar chart.
- **By activity code** mini bar chart (when codes used).

#### All my entries — flat list

Filterable list of all TimeEntry rows for the user. Same row design as the task tab. Bulk actions including "Add to current timesheet" for any unsubmitted entries.

#### To approve — approvers' inbox

For users in someone's approval chain: shows pending timesheets and pending standalone entries. Approval flow:
- Click a timesheet → opens a side panel showing all entries grouped by day, with each row showing the rate snapshot and amount.
- Approver actions: **Approve all**, **Reject all** (with reason), **Approve partial** (uncheck specific rows; rejected rows return to draft with the reason).

### `/w/:workspaceId/expenses` — Expenses

Tabs: **My expenses** | **My reports** | **To approve** | **Reimbursements**.

- **My expenses**: list of expenses (with filter chips). Bulk action "Create expense report from selection".
- **My reports**: list of expense reports + "+ New report" button. Report detail shows expenses grouped by date and category; total reimbursable amount; status timeline; receipts viewable inline.
- **To approve**: approvers' inbox; review reports + line items; approve/reject with reason. Bulk approve.
- **Reimbursements**: admin-only; list of approved-but-not-reimbursed reports; bulk "Mark reimbursed" with a reference + method, creating a `ReimbursementBatch`.

### `/w/:workspaceId/approvals` — Unified Approvals inbox

Tabs: **Time** | **Expenses** | **Invoices**. List view with the same approver actions. Helpful for managers who approve both for their team.

### `/w/:workspaceId/clients` — Clients

- List of `Client` records. New tenants land with no clients; onboarding (step 30) provisions starter clients for accounting and law firm tenants. Customers add their real clients here.
- Each row: name, type, # active matters/projects, WIP, AR outstanding, last activity.
- "+ New client" opens a modal.
- Client detail page tabs:
  - **Overview** — contact info, payment terms, retainer balance, totals (WIP, AR, billed YTD).
  - **Matters / Projects** — list with link.
  - **Rate card** — assign / change.
  - **Time & Expenses** — all entries scoped to this client across matters/projects.
  - **Invoices** — list of invoices to this client.
  - **Payments** — list of payments.
  - **Activity** — feed.
- Archive sets `archived = true`.

### `/w/:workspaceId/matters` — Matters (alternate view of projects for law firms)

- A specialized view that lists **Project** rows where a `Matter` record exists.
- Columns: matter number, name, client, practice area, responsible attorney, fee arrangement, status, budget vs actual hours/$, last time entry, WIP, AR.
- Filter by status, practice area, attorney, client.
- "+ New matter" opens a guided dialog that also creates the underlying Project and a `Matter` record. Uses **C1 matter-intake template** by default.

For CPA firms, the same surface is reachable at `/w/:workspaceId/engagements` (UI label changes; both routes work). The Workspace settings toggle `Workspace.psaMode` = `'legal' | 'accounting' | 'generic'` controls which label is the primary nav label.

### `/w/:workspaceId/settings/billing` — Billing settings

Tabs: **Rates** | **Rate cards** | **Activity codes** | **Invoicing** | **Approvals**.

- **Rates** — per-user default rate table; per-role rate table; effective-date history. Inline edit, version-aware (creates a new BillingRate row rather than mutating).
- **Rate cards** — named bundles. Editor lets you build a card with per-role rows, optional per-user overrides; assign to clients/matters.
- **Activity codes** — load UTBMS codes by default for `psaMode='legal'`; allow custom code lists otherwise.
- **Invoicing** — invoice prefix, starting number, default payment terms, default footer text, branded header (logo upload).
- **Approvals** — default approval chain for time and expenses; override per user or per project.

### `/w/:workspaceId/invoices` — Invoices

- List with columns: number, client, period, amount, paid, outstanding, status, issued, due, age.
- Filter chips: All / Draft / Sent / Paid / Overdue / Voided.
- "+ Generate invoice" → wizard:
  - **Step 1**: Pick a client.
  - **Step 2**: Pick a matter/project (or all open ones for the client).
  - **Step 3**: Pick a period (date range).
  - **Step 4**: Preview — shows draft fees (time entries `approved` + not yet billed) and expenses (`approved` + not yet billed), grouped by matter/project. Lets the user **edit narratives**, **toggle line items**, **apply discounts**, **write off** specific entries inline. Show a live total.
  - **Step 5**: Final review — issue date, due date, notes, send method (Email / Mail / Save as PDF). Submitting creates an Invoice; sets included entries to `billed` and stamps `invoiceId`.
- Invoice detail page:
  - Header: status badge, dates, totals, "..." menu (Resend, Void, Mark sent, Download PDF, Add payment).
  - Body: line items with edit-inline.
  - Right rail: Payments received (with "Record payment" button), aging info.
  - Print/PDF stylesheet renders a clean invoice layout with workspace branding.

When a time entry / expense becomes `billed`, it is locked from edit. Voiding the invoice returns line items to `approved` (and frees them for re-billing).

### Recording payments

"Record payment" on an Invoice → modal: amount, method, reference, paid date. Creates a `Payment`. Updates Invoice `amountPaid`, `amountOutstanding`, `status`. If `amountPaid >= total`, status = `paid`. If 0 < paid < total, status = `partial`.

For legal: a payment with `method = 'trust_application'` reduces the client's `retainerBalance` instead of recording a cash receipt.

### Trust accounting (light — legal only)

Client detail → Retainer tab:
- Current retainer balance, history of additions (deposits) and applications (against invoices).
- "Add deposit" creates an entry; "Apply to invoice" creates a Payment with `method='trust_application'`.
- Warns if a deposit would commingle (UI hint only; full IOLTA accounting is out of scope).

---

## 6. Permissions

Add to `src/lib/permissions.ts`:

- **Log own time / expenses**: all members.
- **View team's time / expenses**: managers (team admin or set as approver).
- **View all time / expenses across workspace**: workspace admin or members with `canViewAllTime` role flag.
- **Approve time / expenses**: anyone listed in the relevant approval chain; workspace admin.
- **Manage rates / rate cards**: workspace admin only.
- **Generate / void invoices**: workspace admin + users with `canBill` flag.
- **Record payments**: workspace admin + users with `canRecordPayments` flag.

Add `User.roleFlags?: { canViewAllTime?: boolean; canBill?: boolean; canRecordPayments?: boolean }` non-breakingly.

---

## 7. Rules (engine integrations — step 21)

Add new triggers + actions:

**Triggers**:
- `time_entry_submitted` (with optional duration/amount thresholds)
- `time_entry_approved`
- `expense_submitted`
- `expense_above_threshold` (threshold in $)
- `wip_above_budget` (matter/project)
- `timesheet_not_submitted_by` (cutoff day-of-week)
- `retainer_balance_below` (threshold)
- `invoice_overdue` (days past due)

**Actions**:
- `notify_approver`
- `auto_approve_under_threshold`
- `block_task_completion_without_time_entries`
- `escalate_to_responsible_attorney_or_partner`
- `apply_retainer_to_invoice`
- `freeze_matter`

Default rules instantiated on relevant templates (B-series and C-series):
- "Block task completion without time entries" (on B3/B4, C2/C3/C4) — when a task is marked complete and `Project.requireTimeTracking` is true and there are zero time entries → confirm dialog "Mark complete without logging time?" with options Log time / Continue / Cancel.
- "Friday 5pm timesheet reminder" — workspace-level.
- "Expense > $1,000 routes to partner" — if amount > 1000, set approver to project owner's partner.
- "WIP 20% over budget alerts" — for any matter/project where `(WIP – budget) / budget > 0.20`, notify responsible attorney and the matter's originating attorney.
- "Retainer balance < $5,000" — notify originating attorney to request top-up.

---

## 8. Reporting extensions (step 26)

Add new chart **sources** in the chart builder:
- `time_entries`
- `expenses`
- `invoices`
- `payments`
- `wip` (synthetic — see definitions below)

Add new chart **types**:
- **WIP report** — table or stacked bar by client/matter showing unbilled time + unbilled expenses.
- **WIP Aging** — bar by age bucket (0–30 / 31–60 / 61–90 / 90+ days since the entry date).
- **Realization** — line/bar = `billed_amount / standard_amount` (standard = rate snapshot × hours, regardless of writedowns), grouped by user/practice area/client/period.
- **Utilization** — bar = `billable_hours / target_hours`, by user/team/period; target uses `Workspace.targetWeeklyHours × weeks`.
- **Effective rate** — number/line = `billed_amount / billable_hours`, by user/practice area.
- **AR Aging** — bar by invoice age bucket (Current / 1–30 / 31–60 / 61–90 / 90+).
- **Time by activity code** — donut/bar by UTBMS code.
- **Expense breakdown** — donut by category; bar by user; line over time.
- **Billings vs. Collections** — twin-line over time.
- **Trust / Retainer balances** — bar by client.

### WIP definition (single source of truth, in `src/features/billing/selectors.ts`)
- `wipTime` = `sum(rateSnapshot × hours)` for time entries with status in {`approved`, `submitted`} AND `billable=true` AND `invoiceId == null`.
- `wipExpenses` = `sum(billableAmount)` for expenses with status in {`approved`, `submitted`} AND `billable=true` AND `invoiceId == null`.
- `wip = wipTime + wipExpenses`.

### Two starter dashboards (auto-create on workspaces with `psaMode` set)

**"CPA Firm Operations" dashboard** (workspaces with `psaMode='accounting'`):
- Number: WIP this period
- Number: Hours logged this week (vs target)
- Bar: WIP by engagement
- Bar: Hours by staff (this week)
- Line: Utilization % by staff (last 8 weeks)
- Donut: Time by service line (Tax / Audit / Advisory / Bookkeeping)
- Bar: Realization by client (last quarter)
- Number: Bookings this month (sum of invoiced fees)
- Number: AR outstanding
- Bar: AR aging buckets

**"Law Firm Operations" dashboard** (workspaces with `psaMode='legal'`):
- Number: WIP all matters
- Number: Hours logged this week (vs target)
- Bar: WIP by matter (top 10)
- Bar: WIP aging
- Line: Billable hours by attorney (last 8 weeks)
- Donut: Time by practice area
- Bar: Realization by practice area
- Bar: Retainer balances by client
- Number: AR outstanding
- Bar: AR aging buckets
- Bar: Top 5 attorneys by billings YTD

---

## 9. AI assistant integration (extend step 28)

Add AI proposals in `src/features/ai/proposals.ts`:
- **"Draft narrative from this week's tasks"** — generates a billable description for a draft time entry based on the task name, recent comments, and Activity tab events.
- **"Suggest activity codes"** — given a description, suggest UTBMS task/activity codes.
- **"Generate invoice from this matter for the period"** — opens the invoice wizard pre-filled with a recommended period and a suggested narrative grouping.
- **"Flag suspicious entries"** — scan a timesheet for outliers (very long entries, weekend work without notes, gaps).
- **"Reconcile timer drift"** — when a stopped timer's elapsed time is much longer than typical for that task, suggest a corrected duration.

Add a sparkles button on the Time tab, Expenses tab, Timesheet page, and Invoice generation wizard. All proposals require user confirmation before applying.

---

## 10. Template retrofits (27b accounting & law)

When this step runs, update the curated templates in `src/features/templates/curated/` accordingly. **Do not break the templates' existing structure — only add fields and rule entries.**

### B1 Month-End Close
- Set `Project.requireTimeTracking = true`.
- Custom field "Engagement code" (text).
- Tag tasks with default Activity codes for "Close" cycles.

### B2 Year-End Close
- Same as B1 + budget hours per audit area.

### B3 Individual Tax Return (1040)
- Set `requireTimeTracking = true` and `requireExpenseTracking = true` (for filing fees, e-file fees passed through).
- New custom field "Budget hours" (number).
- Add default rules: "Block task completion without time entries", "Notify Manager when actual > budget by 25%".
- Add "1040 Activity code" custom field (dropdown: Organizer prep, Input, Review-Senior, Review-Manager, Sign-off, E-file, Admin).

### B4 Financial Statement Audit Engagement
- `requireTimeTracking = true`.
- New field "Audit budget hours" per audit area.
- Default rule: WIP > 20% over budget → notify Engagement Partner + Manager.
- Activity codes: AICPA audit codes (Planning, Risk Assessment, Walkthroughs, Tests of Controls, Substantive — Revenue/AR/Inventory/PP&E/Goodwill/Tax/etc., Completion, Reporting).

### B5 New Client Engagement
- Adds tasks to set up Client record, Rate card, Fee arrangement, Engagement code.
- When complete, prompts "Create matching Project from a service-line template? (Month-End, 1040, Audit…)" — pre-attaches `clientId`.

### C1 Matter Intake & Conflict Check
- Auto-create a `Matter` record on instantiation.
- Tasks: "Set up rate card on matter", "Set timekeeper assignments", "Confirm fee arrangement".

### C2 Litigation Case Management
- `requireTimeTracking = true`, `requireExpenseTracking = true`, `useUtbms = true`.
- Activity codes pre-loaded with the **UTBMS L-series**: L100 Case Assessment, L110 Fact Investigation, L120 Analysis, L200 Pre-Trial Pleadings, L210 Pleadings, L220 Preliminary Injunctions, L230 Court Mandated Conferences, L240 Dispositive Motions, L250 Other Written Motions, L300 Discovery, L310 Written Discovery, L320 Document Production, L330 Depositions, L340 Expert Discovery, L350 Discovery Motions, L400 Trial Preparation, L410 Fact Witnesses, L420 Expert Witnesses, L430 Written Motions/Submissions, L440 Other Trial Preparation, L450 Trial, L460 Post-Trial Motions, L500 Appeal.
- Expense codes E-series (Expert fees, Filing fees, Service of process, Witness fees, etc.).
- Default rule: All expert fees auto pass-through.

### C3 Contract Review & Negotiation
- `requireTimeTracking = true`.
- UTBMS C-series (Counseling/Contracts) activity codes pre-loaded.

### C4 M&A Deal Closing Checklist
- Optional `requireTimeTracking = true` toggle.
- Tracks by workstream-as-activity-code.

### Accounting/law templates also provision on first use:
- A starter `RateCard` named "<Firm name> — Standard 2026" with role-based rates: Partner $650, Manager $400, Senior $275, Staff $185, Paralegal $145 (legal); or for CPA: Partner $550, Director $400, Senior Manager $350, Manager $275, Senior $200, Staff $145, Admin $95. Customers edit these rates immediately on first sign-in via Settings → Billing → Rate Cards.
- A single starter `Client` record so the new firm can record their first time entry against a real client.

---

## 11. PSA starter content for the internal evaluation tenants (extends step 30)

The PSA-specific population for each evaluation tenant (used by Sales / CS / Support; behind `VITE_INTERNAL_EVAL=true`) is specified in detail inside step 30. PSA touch points per tenant:

**Sterling & Brooks CPA (evaluation tenant 2, `psaMode='accounting'`)** — full PSA population:
- 10 `Client` records with payment terms, industry, default rate card.
- "Sterling & Brooks — Standard 2026" rate card pre-loaded as default (Partner $550 → Staff $145 plus Admin).
- Engagements (projects) linked to clients via `clientId`.
- For the past 4 weeks: ~30 time entries per active staff member across various engagements; mix of submitted/approved/billed; some written-off.
- 6 starter timesheets (last 2 weeks, 3 staff each), one pending approval, one rejected with reason "Please split Crestwood entries by service line".
- 8 expenses (CPE travel meals, software subscriptions, filing fees passed through).
- 4 invoices: 2 paid, 1 sent (overdue 12 days), 1 draft.
- 1 reimbursement batch (paid via payroll).
- AI proposal example: "Draft narrative for Lin Family 1040 — Oct 15 work block".

**Hartwell & Cross LLP (evaluation tenant 3, `psaMode='legal'`)** — full PSA population:
- 8 `Client` records with retainer balances.
- 6 `Matter` records linked to clients (one already in "Doe v. Acme" — re-keyed to the matter system).
- "Hartwell — Standard 2026" rate card.
- ~50 time entries across attorneys, all with UTBMS activity codes; mix of statuses.
- 5 expenses with pass-through (filing fees, deposition transcripts, expert fees) and 3 reimbursable travel.
- 3 starter timesheets (current week + 2 weeks back).
- 2 invoices: 1 paid (with `trust_application` payment), 1 sent (current).
- AR aging shows a healthy mix.
- A "Pro bono" matter with non-billable entries.

**Meridian Capital — Corp Dev (evaluation tenant 7, `psaMode='advisory'`)**:
- Internal time tracking only (non-billable): time entries on Project Falcon and Project Helix are tracked for capitalization analysis and internal cost allocation, not customer billing.

**Other evaluation tenants (Atlas, Crestwood, Northwind, Lighthouse)**:
- Time tracking enabled but not required.
- A handful of entries that exercise the PSA reporting selectors.

**Real new tenants (production onboarding flow, step 30)**:
- The accounting and law-firm onboarding paths provision a `RateCard` and a single starter `Client` so the firm can record their first time entry immediately on first sign-in.
- All other content is the customer's real work from day one — no pre-populated tasks beyond the chosen industry template.

---

## 12. Components (one per file unless noted)

```
src/features/time/
  TimeTab.tsx                          (in task detail pane)
  ManualTimeEntryDialog.tsx
  TimeEntryRow.tsx
  TimerWidget.tsx                      (topbar)
  TimerBanner.tsx                      (persistent banner when timer running)
  useTimerStore.ts
  TimePage.tsx                         (/w/:wsId/time)
  TimesheetWeekGrid.tsx
  TimesheetCell.tsx
  TimesheetRow.tsx
  TimesheetSubmitDialog.tsx
  ApprovalsTimePane.tsx

src/features/expenses/
  ExpensesTab.tsx
  ExpenseEntryDialog.tsx
  ExpenseRow.tsx
  ExpensesPage.tsx
  ExpenseReportDetail.tsx
  ExpenseReportEditor.tsx
  ApprovalsExpensesPane.tsx
  ReimbursementsAdminPage.tsx

src/features/billing/
  useRateResolver.ts
  selectors.ts                         (wip, realization, utilization, etc.)
  BillingSettingsPage.tsx
  RateTableEditor.tsx
  RateCardEditor.tsx
  ActivityCodesEditor.tsx
  ApprovalChainEditor.tsx

src/features/clients/
  ClientsPage.tsx
  ClientDetailPage.tsx
  ClientDialog.tsx
  ClientRetainerTab.tsx

src/features/matters/
  MattersPage.tsx                      (alias view of Projects when matterId present)
  MatterDialog.tsx
  MatterDetailHeader.tsx               (shows fee arrangement, budget vs actual, retainer)

src/features/invoices/
  InvoicesPage.tsx
  InvoiceGenerationWizard.tsx          (5-step wizard)
  InvoiceDetailPage.tsx
  InvoiceLineEditor.tsx
  InvoicePreview.tsx                   (printable)
  RecordPaymentDialog.tsx
  ApprovalsInvoicesPane.tsx

src/features/reporting/charts/
  WipChart.tsx
  WipAgingChart.tsx
  RealizationChart.tsx
  UtilizationChart.tsx
  EffectiveRateChart.tsx
  ArAgingChart.tsx
  ActivityCodeBreakdownChart.tsx
  ExpenseBreakdownChart.tsx
  BillingsVsCollectionsChart.tsx
  TrustBalancesChart.tsx

src/features/reporting/templates/
  cpaFirmDashboard.ts
  lawFirmDashboard.ts
```

Plus extensions to:
- `TaskDetailPane.tsx` — register the two new tabs.
- `Topbar.tsx` — register the timer widget.
- `Sidebar.tsx` — register the "Time", "Expenses", "Approvals", "Clients", "Matters", "Invoices" links (visible only when `psaMode` is set OR the user has logged any time/expenses).

---

## 13. Routes summary (added)

```
/w/:wsId/time
/w/:wsId/time/sheet/:sheetId
/w/:wsId/expenses
/w/:wsId/expenses/reports/:reportId
/w/:wsId/approvals
/w/:wsId/clients
/w/:wsId/clients/:clientId
/w/:wsId/matters
/w/:wsId/matters/new
/w/:wsId/matters/:matterId           (alias to underlying project page)
/w/:wsId/engagements                 (alias of /matters when psaMode='accounting')
/w/:wsId/invoices
/w/:wsId/invoices/new
/w/:wsId/invoices/:invoiceId
/w/:wsId/settings/billing
```

Update `Sidebar` to surface these as a new collapsible group **"Billing & Time"** above "Insights". Default-expanded for accounting/law workspaces.

---

## 14. Mobile considerations

- Timer widget collapses to an icon in the mobile topbar; tap → bottom-sheet popover.
- Add expense supports `<input capture="environment">` to invoke camera for receipt photos.
- Timesheet week grid degrades on small screens to a per-day stacked list ("Monday — 3 tasks — 8.5h"), tap to expand.
- All forms touch-friendly (44px targets).

---

## 15. Accessibility

- Timer announces start/stop with `aria-live="polite"`.
- Grid cells in the timesheet support arrow-key navigation; Enter to edit; Esc to cancel.
- Currency inputs are properly labeled; screen reader reads "Amount, in US dollars, three hundred forty-two".
- Receipts always have alt text "Receipt for <vendor> on <date>".

---

## 16. Success criteria

- Starting a timer from any task in any project produces a TimeEntry on stop, with the resolved rate snapshotted and a visible source label.
- A user can navigate around (including across projects and the timesheet page) while a timer is running; reload of the tab restores the running state with a banner.
- The weekly timesheet aggregates entries correctly, computes utilization, and lets me submit/approve/reject with reasons.
- Adding an expense with a photo receipt works on desktop and mobile; markup vs pass-through behaves correctly; reimbursable expenses appear in the My Reports tab.
- I can generate a polished invoice from a matter's approved-but-unbilled time + expenses, void it, and see the underlying entries return to `approved`.
- WIP, Realization, Utilization, Effective Rate, AR Aging, and Trust Balances charts all render in dashboards and respect filters.
- The Sterling & Brooks CPA and Hartwell & Cross law evaluation tenants (from step 30) render like real firm operations — populated with rates, clients, matters, time, expenses, timesheets, and invoices — making them suitable for Sales demonstrations and Support reproductions.
- Block-task-completion-without-time-entries rule fires for B/C templates.
- `Design.md` updated with row 28b, the PSA model section (rate cascade + status lifecycle), and a list of new routes/components.

Do not break previous steps. Keep one feature per file. Add docstrings explaining the cascade rule and the WIP formula in `useRateResolver.ts` and `selectors.ts`.
