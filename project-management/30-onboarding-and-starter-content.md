# 30 — Onboarding & Starter Content

**Goal:** Ship a polished, production-grade **first-run experience** for new tenants of Tasklytic. New customers land in an account that already feels alive — a starter workspace pre-populated with curated industry content, a product tour, and a clean path to invite teammates and start real work. Includes a **Trial mode** ("Try Tasklytic without signing up") that lets prospects evaluate the full product on a private, browser-local workspace before creating an account, plus separately, an internal **Evaluation tenant** suite (seven verticals) that powers sales walkthroughs, support reproductions, and customer success enablement.

The onboarding pipeline described here is the real first-run experience every customer goes through. The Evaluation tenant set is a real internal product surface used by Sales, CS, and Support, scoped behind an internal-only feature flag in production.

---

## Prompt (paste into Google AI Studio Build)

Add Tasklytic's onboarding experience and starter-content provisioning system. New code in `src/features/onboarding/`. Do not break prior steps.

### Architectural framing

There are three distinct flows that share the same underlying provisioning engine:

| Flow | When triggered | What it provisions |
|---|---|---|
| **New tenant onboarding** | First sign-up → after creating the workspace | A starter workspace with one curated starter project (chosen during onboarding), starter teams, and an Inbox welcome message |
| **Trial mode** | User clicks "Try without signing up" on the marketing site | A private, browser-local workspace identical to a real one, with the option to convert to a real account anytime (state is migrated) |
| **Evaluation tenants** | Internal flag `INTERNAL_EVAL=true` (set per environment) | Seven richly populated tenant fixtures used by Sales/CS/Support. Not exposed to real customers. |

All three flows route through one engine: `src/features/onboarding/provisioner.ts`. That engine accepts a `ProvisioningPlan` and instantiates workspaces, teams, projects (via `useTemplateInstantiate` from step 27), members, goals, dashboards, forms, and rules. The same engine powers a customer-facing **"Create from template" wizard** in production (Settings → Onboarding → New starter project).

---

## 1. New tenant onboarding (the real customer path)

When a user signs up (step 03), after the workspace is created they enter a 5-step onboarding wizard. Each step is skippable (with a clear "I'll do this later" link).

### Step 1 — Welcome
- Editorial serif headline: *"Welcome to Tasklytic."*
- 2-sentence positioning: *"A modern home for projects, goals, and the people who deliver them."*
- "Get started" primary button.

### Step 2 — Tell us about your team
- Form: company name (pre-filled from sign-up if available), team size (1, 2-10, 11-50, 51-200, 201+), primary use case (free-text or pick a chip).
- Industry chip picker (single select): General business, Agency, Engineering, Accounting / CPA, Law firm, Finance, Procurement, HR / People, Corporate Development, Other.
- Submit persists to `Workspace.profile` (extend `Workspace` non-breakingly with `profile: { teamSize, industry, primaryUseCase, signedUpAt }`).

### Step 3 — Pick a starter project (recommendation)
Based on the industry choice in step 2, surface **3 recommended starter templates** plus a "Start blank" card. Templates come from the libraries in 27/27b/27c. Examples:
- Industry = Accounting / CPA → recommend B1 Month-End Close, B3 Individual Tax Return, B4 Financial Statement Audit.
- Industry = Law firm → recommend C1 New Matter Intake, C2 Litigation Case Management, C3 Contract Review.
- Industry = Corporate Development → recommend G1 Strategic Acquisition, G2 Spin-off / Divestiture, A4 Annual Strategic Planning.
- Industry = General business → A1 QBR, A2 B2B Customer Onboarding, A4 Annual Strategic Planning.

User can also browse the full library by clicking "See all templates" (opens the template gallery from step 27). Selecting one previews its sections and a subset of its starter tasks, then "Use this template" provisions the project into the new workspace.

### Step 4 — Invite teammates
- Email-chip input (paste comma-separated or one per line), role picker (Member by default), optional personal note.
- "Send invites" issues real invitations via the email-delivery adapter (see step 17 + step 03 — production binds this to SES/SendGrid/Postmark via Settings → Integrations → Email; the V1 client-side adapter persists pending invites locally and shows them in Settings → Members).
- "Skip — I'll invite later" link.

### Step 5 — Connect your tools (optional)
- A row of branded integration cards: Google Drive, Microsoft OneDrive, Dropbox, Slack, GitHub, Gmail Calendar, Microsoft Outlook.
- Each card shows a "Connect" button that opens the OAuth handshake when an integration adapter is configured for the environment; otherwise it surfaces an "Available in your plan — admin setup required" state with a learn-more link.
- "Skip for now" link.

After step 5, route to the new workspace's Home page with a green welcome toast: *"You're all set. Welcome to Tasklytic."*

### Persistence of onboarding state
- `User.onboarding: { completedSteps: string[], completedAt?: ISODateTime, skippedAt?: ISODateTime }` (extend `User` non-breakingly).
- Once `completedAt` or `skippedAt` is set, the wizard does not auto-open again. A user can replay it from `/me` → "Restart onboarding".

### What lands in the new tenant
- 1 Workspace named from the company-name input.
- 4 default Teams (industry-aware): for CPA → Tax / Audit / Advisory / Operations; for Law → Litigation / Corporate / Transactional / Operations; for General → Design / Engineering / Marketing / Operations; etc. The user can rename or delete.
- 1 starter Project provisioned from the chosen template (or no project if "Start blank").
- 1 welcome Inbox notification: *"Welcome to Tasklytic — here's what to try next."* with three CTAs (Open your starter project, Invite teammates, Take the product tour).
- The current user as workspace Owner.
- Default custom-field library (Priority, Status) provisioned globally — see step 14.
- Default rate card and activity codes if `psaMode` is set by the chosen industry (Accounting → `psaMode='accounting'` with UTBMS A-series activity codes from step 28b; Law → `psaMode='legal'` with L-series and C-series).

---

## 2. Trial mode ("Try Tasklytic without signing up")

A standing "Try Tasklytic" link on the marketing site (steps 01b) routes here.

- Creates an anonymous local tenant in the browser's `localStorage` partition (separate namespace `tasklytic:trial:v1:*` to avoid collision with real accounts).
- Provisions a richly populated starter workspace from the user's chosen industry (same step-3 chooser as above, but defaults the industry from the marketing referrer if known — e.g., visiting `/solutions/accounting-firms` then clicking "Try" pre-selects Accounting).
- A persistent banner at the top of the app says: *"You're trialling Tasklytic. Your work is saved locally on this browser."* with a "Create your account" primary button.
- Clicking "Create your account" opens the sign-up dialog inline. On successful account creation, the trial tenant's content is migrated into the new real account (workspace, projects, tasks, comments, custom fields all preserved). A success toast: *"Your trial workspace was added to your account."*
- Trial expiry: after 14 days, the banner shifts tone: *"Your trial ends in N days. Create an account to keep your work."* After expiry, the workspace becomes read-only with a single conversion CTA. No silent data loss — content is retained until the user explicitly clears storage.

This is a real production feature that drives PLG (product-led growth) conversion. Track conversion events via the analytics adapter (`src/lib/analytics.ts` — the V1 implementation logs to console; production swaps to Segment / Mixpanel / Amplitude / PostHog via env-configured adapter).

---

## 3. Evaluation tenant suite (internal-only)

Behind the env flag `VITE_INTERNAL_EVAL=true`, surface an internal admin route `/internal/eval` that lists seven curated evaluation tenants. Each tenant represents a vertical and is provisioned through the same engine. **In production, this flag defaults to `false` and the route is not registered.**

These tenants exist to:
- Let Sales walk prospects through a realistic, vertical-specific environment without exposing real customer data.
- Let Customer Success reproduce reported issues against a known dataset.
- Let Support and Engineering test releases against industry-relevant data shapes (UTBMS codes for legal, SOX controls for finance, etc.).

Each tenant is generated deterministically from a seed value so re-provisioning yields identical data — important for support reproductions.

### Tenant 1 — "Atlas Studio" (digital product agency, A-series content)
- Teams: Design, Engineering, Marketing, Operations. ~15 members.
- 5 projects: Acme Mobile App Redesign (custom Engineering Sprint structure, ~40 tasks, Timeline default, dependencies, at-risk status); Q3 2026 QBR (from **A1 QBR**); Beacon Customer Onboarding (from **A2 B2B Customer Onboarding**); Atlas Sales Pipeline (from **A3 Sales Pipeline**, 8 active deals); Atlas 2026 Strategic Plan (from **A4 Annual Strategic Planning**).
- 1 portfolio: "Client Work Q3". 3 goals. 2 forms. 5 rules. 4 dashboards.

### Tenant 2 — "Sterling & Brooks CPA" (mid-sized accounting firm, B-series content)
- Teams: Tax, Audit, Advisory, Bookkeeping, Administration. ~18 members.
- 6 projects: Acme Inc. — Month-End Close (October 2026) [**B1**, recurring monthly]; Beacon Logistics — Year-End Close & Audit 2026 [**B2**]; Lin Family — 1040 Tax Year 2025 [**B3**, 3 starter clients across stages]; Crestwood Health — FY2025 Audit [**B4**]; Riverstone Manufacturing — New Engagement [**B5**]; Tax Season 2026 Master (Board view of 20 starter clients across stages).
- 1 portfolio: "Tax Season 2026". 2 goals (Realization ≥ 95%; Days-to-file < 12). 2 forms (1040 questionnaire, PBC request). 6 rules. 3 dashboards (Returns by complexity & status; Open PBC items; Realization & utilization).
- `psaMode='accounting'`. 10 Client records, "Standard 2026" rate card (Partner $550, Senior Manager $400, Manager $275, Senior $200, Staff $150), ~120 time entries over the last 4 weeks (mix of submitted/approved/billed/written-off), 6 timesheets (one pending approval, one rejected with reason "Please split Crestwood entries by service line"), 8 expenses, 4 invoices (2 paid / 1 overdue / 1 draft), 1 reimbursement batch. The "CPA Firm Operations" dashboard renders populated.

### Tenant 3 — "Hartwell & Cross LLP" (boutique law firm, C-series content)
- Teams: Litigation, Corporate, M&A, Employment. ~12 members.
- 5 projects: Doe v. Acme Manufacturing [**C2**, *Discovery* stage with realistic depositions and motion deadlines]; Smith Industries — Acquisition of Beacon Logistics [**C4**, *Due diligence*]; Hartwell — New Matter Intake (Q4) [**C1**, 5 starter matters]; Hartwell — Active Contract Reviews [**C3**, 6 active contracts]; Hartwell — Knowledge & Templates (internal project, List view).
- 1 portfolio: "Active Matters Q4 2026". 2 goals (Conflict checks completed in <24h; Billable utilization ≥ 65%). 1 form (New matter intake — public). 5 rules. 2 dashboards (Open motions by case; Contract value by counterparty type).
- `psaMode='legal'`. 8 Client records with retainer balances, 6 Matter records, "Hartwell — Standard 2026" rate card, ~80 time entries with UTBMS codes (L100–L500), 5 pass-through expenses (filing fees, deposition transcripts, expert fees) + 3 reimbursable travel expenses, 3 timesheets, 2 invoices (1 paid via `trust_application`, 1 sent). One pro-bono matter shows non-billable tracking. The "Law Firm Operations" dashboard renders populated.

### Tenant 4 — "Crestwood Holdings — Finance" (mid-cap public-company finance, D-series content)
- Teams: FP&A, Accounting, Treasury, Tax, Investor Relations. ~14 members.
- 5 projects: Monthly Close & Reporting (October 2026) [**D2**]; FY2027 Annual Budget [**D1**]; SOX 404 Q4 Testing Cycle [**D3**]; Q3 2026 10-Q Filing [**D4**, *Auditor sign-off*]; Treasury Operations (recurring daily/weekly tasks).
- 1 portfolio: "Crestwood Finance Q4". 3 goals (Days-to-close, % SOX controls effective, Forecast accuracy). 5 rules. 4 dashboards (Variance by department; Open controls by area; Days-to-close trend; 10-Q tie-out status).

### Tenant 5 — "Northwind Industrial — Procurement" (industrial procurement, E-series content)
- Teams: Strategic Sourcing, Vendor Management, Contracts. ~10 members.
- 4 projects: ERP Replacement RFP [**E1**, *Vendor responses* with 5 vendors]; Vendor Onboarding Queue [**E2**, 8 vendors across stages]; Contract Renewal Tracker FY2027 [**E3**, 15 contracts across the 30/60/90/120/180-day columns]; Category Strategy (internal planning).
- 1 portfolio: "Top 25 Vendors". 2 goals (Savings target $4.2M; 100% critical vendor SOC 2 refresh on-time). 4 rules. 3 dashboards (Renewals next 12 months; Open RFPs by category; Vendor risk distribution).

### Tenant 6 — "Lighthouse People Co." (mid-sized SaaS HR team, F-series content)
- Teams: Talent Acquisition, People Operations, Total Rewards, L&D. ~9 members.
- 5 projects: Q4 2026 Hiring [**F1**, 6 candidates across stages]; New Hire Onboarding (Active Cohort) [**F2**, 3 active hires]; H2 2026 Performance Review Cycle [**F3**, *Calibration*]; 2027 Open Enrollment [**F4**, *Communications planning*]; People Ops Backlog (List view).
- 1 portfolio: "People Programs 2026". 3 goals (Time-to-fill ≤ 35 days; 90-day retention ≥ 95%; OE participation ≥ 92%). 2 forms (New role request + Benefits questions intake). 5 rules. 3 dashboards (Open reqs by department; Days in stage; Comp budget vs spend).

### Tenant 7 — "Meridian Capital Partners" (corporate dev / M&A office, G-series content)
- Teams: Corp Dev, Integration Office, Tax, Legal. ~11 members.
- 4 projects: Project Falcon — Acquisition of Beacon Logistics [**G1**, *Confirmatory Due Diligence* with ~60 of 95 tasks active and parallel workstream activity]; Project Falcon — Risk Register (auto-spawned sibling); Project Helix — Spin-off of Crestwood Industrial [**G2**, *Stand-alone Capability Build*, `Separation type` = Tax-free Spin-off (§355)]; Project Helix — Risk Register (auto-spawned sibling).
- 1 portfolio: "Active Transactions 2026". 2 goals (Close Project Falcon by Q1 2027; Spin Project Helix tax-free by Q3 2027). 4 rules (LOI exclusivity countdown, Critical-path slip escalation, §355 anti-Morris-Trust watch, TSA T-30 alert). 4 dashboards (Diligence burnup; Synergy run-rate vs plan; Day-1 readiness by workstream; TSA services by status).
- `psaMode='advisory'`. Time tracking enabled (non-billable internal cost allocation) across Project Falcon and Project Helix.
- Exercises parent → child project linkage and risk-register sibling projects (critical regression coverage for the 27c flows).

### Internal admin UI

`/internal/eval` (only registered if `VITE_INTERNAL_EVAL=true`):
- A table of the seven evaluation tenants with: name, vertical, last provisioned at, content stats (workspaces, projects, tasks).
- Per-row actions: "Reset & re-provision" (idempotent, deterministic), "Switch into tenant", "Export snapshot (.json)", "Import snapshot".
- Top-right action: "Provision all" — runs every tenant fresh.
- Confirmation modals on destructive actions (typed phrase "reset Sterling & Brooks" before wiping).

---

## 4. The provisioning engine

`src/features/onboarding/provisioner.ts` exports:

```ts
type ProvisioningPlan = {
  workspace: {
    name: string;
    profile?: WorkspaceProfile;
    psaMode?: PsaMode;
    defaultCurrency?: CurrencyCode;
  };
  teams?: Array<{ name: string; visibility?: TeamVisibility }>;
  members?: Array<{ name: string; email: string; role: WorkspaceRole; teamNames?: string[] }>;
  projects?: Array<{
    templateId?: ID;           // from step 27/27b/27c library
    customStructure?: { name: string; sections: Section[]; tasks: TaskSpec[] };
    overrides?: { name?: string; defaultView?: ViewKind; status?: ProjectStatus; stage?: string };
    contentDecorations?: ContentDecorationPlan; // comments, attachments, status updates, notifications
  }>;
  portfolios?: PortfolioSpec[];
  goals?: GoalSpec[];
  forms?: FormSpec[];
  rules?: RuleSpec[];
  dashboards?: DashboardSpec[];
  psaData?: PsaProvisioningPlan; // clients, matters, rate cards, time entries, expenses, timesheets, invoices
  inboxWelcome?: { title: string; body: string; ctas: Array<{ label: string; route: string }> };
};

async function provision(plan: ProvisioningPlan, opts: {
  seedRng?: number;           // deterministic content generation (evaluation tenants use fixed seeds)
  emitProgress?: (step: ProvisioningStep) => void;
}): Promise<{ workspaceId: ID }>;
```

The engine is environment-agnostic — it calls the configured `repositoryAdapter` (see step 02), so the same engine runs against the V1 client-side adapter or a future backend adapter.

### Content decoration

`ContentDecorationPlan` controls realistic populating:
- Comments per task: range (e.g., `[0, 6]` with weighted distribution), `commentsCorpus.ts` by industry.
- Attachments: probability per task + an inline-SVG `attachmentLibrary.ts` of branded swatches.
- Status updates: count per project, distribution across status pillars.
- Activity events: backfilled to make recent-activity feeds populated.
- Notifications: industry-flavored Inbox items (e.g., Sterling & Brooks: *"Manager review needed: Lin Family 1040"*; Hartwell: *"Statute of limitations approaching — Doe v. Acme"*).

### Content libraries (per industry)
- `src/features/onboarding/content/taskCorpus.ts` — neutral task verbs + industry-tagged variants.
- `src/features/onboarding/content/commentsCorpus.ts` — neutral collaboration phrases + industry-tagged variants.
- `src/features/onboarding/content/people.ts` — realistic name + initials pool, distinct from any real customer or employee.
- `src/features/onboarding/content/attachmentLibrary.ts` — inline SVG swatches (no external assets).

All people, company, and matter names used in tenant content are clearly fictional (Sterling & Brooks, Hartwell & Cross, Beacon Logistics, Atlas Studio, Crestwood, Northwind, Lighthouse, Meridian, etc.). Add a `FICTIONAL_NAMES.md` file alongside this content listing every fictional brand used and asserting that any resemblance to real entities is coincidental — protects the company from confusion if customers see this content in marketing materials.

---

## 5. Product tour (real onboarding aid)

A 6-step in-app tour overlay (anchored tooltips with `Next / Skip` buttons). This runs once per real user after first sign-up and can be replayed from `/me` → Help → "Replay product tour".

1. Sidebar — *"Switch workspaces, jump to your favorites, and find anything fast."*
2. My Tasks — *"Your day starts here. Today, Upcoming, and Later sections keep you focused."*
3. A project's view tabs — *"Five ways to see your work — pick whichever fits the moment."*
4. Task detail pane — *"Everything about a task in one place: assignees, dates, dependencies, time, expenses."*
5. AI sparkles button — *"Tasklytic AI drafts updates, suggests subtasks, and writes status posts for you."*
6. Reporting — *"Build dashboards from anywhere in the platform."*

Tour state stored on `User.onboarding.tourCompletedAt`.

---

## 6. Components & files

```
src/features/onboarding/
  provisioner.ts                           // ProvisioningPlan engine
  applyProvisioningPlan.ts
  resetWorkspace.ts                        // destructive, owner-only, typed-confirmation
  WelcomeWizard.tsx                        // 5-step new-tenant flow
  StepWelcome.tsx
  StepTellUsAboutYourTeam.tsx
  StepPickStarterProject.tsx
  StepInviteTeammates.tsx
  StepConnectTools.tsx
  WelcomeInboxItem.tsx
  trial/
    TrialModeProvider.tsx
    TrialBanner.tsx
    convertTrialToAccount.ts
  internal/
    EvalTenantsPage.tsx
    EvalTenantRow.tsx
    plans/
      atlasStudio.plan.ts
      sterlingBrooks.plan.ts
      hartwellCross.plan.ts
      crestwoodFinance.plan.ts
      northwindProcurement.plan.ts
      lighthousePeople.plan.ts
      meridianCapital.plan.ts
  content/
    taskCorpus.ts
    commentsCorpus.ts
    people.ts
    attachmentLibrary.ts
    industryRecommendations.ts             // industry → recommended template IDs
  tour/
    ProductTour.tsx
    useProductTour.ts
    tourSteps.ts

FICTIONAL_NAMES.md                         // root-level — declares all invented brand names
```

---

## 7. Admin workspace controls

Beyond the wizard, the same provisioner powers two admin actions in every workspace:

- **Settings → Onboarding → "Add a starter project from a template"** — opens the template gallery (from step 27) and provisions the selected template into the current workspace. This is how an existing customer adds a new starter structure (e.g., a CPA firm starting their first audit engagement after using Tasklytic for tax for six months).
- **Settings → Workspace → "Reset workspace"** — destructive owner-only action with typed-confirmation that wipes the workspace's projects/tasks/etc. and provisions a fresh starter project of the owner's choice. The workspace itself, members, billing, and integrations are preserved. Used by customers who want to restart with a clean slate. A success toast confirms: *"Workspace reset. Your starter project is ready."*

Trial-mode users get a different reset CTA: *"Clear trial workspace"* which wipes the local trial tenant entirely.

---

## 8. Telemetry hooks (production)

Every onboarding step emits an analytics event via `src/lib/analytics.ts`:

```ts
analytics.track('onboarding.step_viewed', { step: 'pick_starter_project', industry: 'accounting' });
analytics.track('onboarding.template_selected', { templateId: 'B1', industry: 'accounting' });
analytics.track('onboarding.completed', { totalElapsedMs, skippedSteps: ['connect_tools'] });
analytics.track('trial.converted_to_account', { trialAgeDays });
```

The analytics module ships with a console-logging adapter in V1 and is swap-pointed to Segment / Mixpanel / Amplitude / PostHog via environment configuration (`VITE_ANALYTICS_ADAPTER=segment` plus `VITE_SEGMENT_WRITE_KEY`). This pattern is identical to the repository, auth, email, file-storage, and AI adapters established in earlier steps — every external dependency is an adapter with a V1 in-app implementation and a clear backend swap-out point.

---

## 9. Success criteria

- A new sign-up completes onboarding in under 90 seconds and lands in a workspace containing one curated starter project, four sensible default teams, one welcome Inbox item, and a populated My Tasks list ready to work in.
- The Trial mode flow lets a marketing-site visitor reach a fully usable, pre-populated workspace in one click without creating an account, and a one-click conversion preserves all of their work into a real account.
- The internal `/internal/eval` page exists only when `VITE_INTERNAL_EVAL=true`, exposes the seven curated tenant fixtures, and re-provisions any of them deterministically in under 5 seconds against the V1 client-side adapter.
- Switching between evaluation tenants noticeably changes the platform's character — the accounting tenant feels like a CPA firm, the law tenant feels like a litigation practice, the M&A tenant exercises parent/child project relationships from step 27c, and every tenant exercises the PSA layer where applicable.
- The product tour runs once per new user, persists completion to `User.onboarding`, and is replayable from `/me` → Help.
- `FICTIONAL_NAMES.md` lists every invented brand used in onboarding and evaluation content.
- The Settings → Onboarding and Settings → Workspace → Reset surfaces let any owner provision additional starter projects or reset their workspace cleanly.
- The analytics adapter records every onboarding event and is configured to no-op silently when no provider is bound.
- `Design.md` gets a new row: `30 | src/features/onboarding | New-tenant onboarding, trial mode, internal evaluation tenants, provisioning engine | <today>` and a new **Onboarding & first-run experience** section summarizing the three flows.

This step closes out the platform's core build. With it in place, Tasklytic is a complete, launch-ready product: a real customer can sign up, get value in 90 seconds, invite teammates, and grow into the full surface area built in steps 01 through 29. Sales has a real evaluation environment to walk prospects through. Support has deterministic fixtures to reproduce against. After this step, `Design.md` is a complete map of the platform — ready for engineering handoff, security review, or launch.
