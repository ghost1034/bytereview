# 27c — Corporate Transactions Templates (Acquire & Spin-off)

**Goal:** Add two end-to-end, cross-functional corporate-transaction templates to Tasklytic's industry library. These are the projects an internal **Corporate Development / M&A / Strategy** team runs from mandate through value capture — far broader than the legal-only closing checklist already in template **C4**.

**Drop after:** `27b-industry-templates-library.md`. Extends the same engine.

---

## Prompt (paste into Google AI Studio Build)

Add a new template category **"Corporate Development & Transactions"** (Category **G**) to Tasklytic's curated template library. Two templates: **G1 — Strategic Acquisition (Buy-Side, End-to-End)** and **G2 — Company Spin-off / Divestiture / Carve-out**. Both are large, multi-phase, multi-workstream projects with their own custom fields, rules, forms, and dashboards.

**Critical rules**:
1. Do not modify the design system, data model, or any prior step.
2. Place in `src/features/templates/curated/transactions.ts` and re-export from the curated index.
3. Add a new category badge **"Corporate Dev"** (color: `indigo`) to the template gallery filter.
4. Both templates default to **Gantt** view because they are date-driven and dependency-heavy. Enable List, Board, Timeline, Calendar, Gantt.
5. Both templates ship with a populated **Risk register** sub-project pattern: when instantiated, also create a sibling project named `<Project name> — Risk Register` with a small list of starter risks.
6. G1 is designed to chain into PMI: upon reaching the Closing milestone, the engine should offer (via toast) to spawn a child project called `<Target> — Post-Merger Integration` from a Day-1-to-Day-100 sub-template (defined inline below).
7. G2 is designed to chain into TSA: upon reaching Day-1, offer to spawn a child project `<SpinCo> — Transition Services Agreement (TSA)` from the TSA sub-template (defined inline below).
8. Cross-link with existing templates where applicable (C4 Closing Checklist, C3 Contract Review, E2 Vendor Onboarding, F2 Onboarding) — UI link from the template preview, no automated coupling.
9. Append a row to `Design.md`: `27c | src/features/templates/curated/transactions.ts | Corporate transactions templates (Acquire & Spin-off) | <today>`.

---

## G1 — Strategic Acquisition (Buy-Side, End-to-End)

**Icon:** 🎯 | **Color:** indigo | **Default view:** Gantt | **Enabled views:** All | **Suggested bundles:** "Status", "Priority"

**When to use:** Running a buy-side M&A project from "we should buy something" through Day-1, the first 100 days of integration, and Year-1 value capture. Tracks every workstream (Strategy, Legal, Tax, Finance, HR, IT, Commercial, Real Estate, IP, Regulatory, Communications, Integration, Cultural).

### Sections (14 — the deal lifecycle)
1. Strategic Rationale & Mandate
2. Target Identification & Screening
3. Initial Outreach & NDA
4. Preliminary Diligence & Valuation
5. Letter of Intent (LOI)
6. Confirmatory Due Diligence
7. Definitive Agreement & Negotiation
8. Financing & Regulatory
9. Pre-Closing
10. Closing
11. Day 1 Readiness
12. Post-Merger Integration (Day 1 → Day 100)
13. Value Capture & Synergy Tracking
14. Post-Close (Year 1+)

### Custom fields (project-local)

| Field | Type | Options / notes |
|---|---|---|
| `Target company` | text | |
| `Deal codename` | text | Used in confidential docs |
| `Deal type` | dropdown | Asset purchase, Stock purchase, Forward triangular merger, Reverse triangular merger, Tender offer, Recap, Asset deal w/ §338(h)(10), Asset deal w/ §336(e) |
| `Deal status` | dropdown | Identified (gray), NDA Signed (blue), Preliminary DD (blue), LOI (amber), Confirmatory DD (amber), Definitive Agreement (purple), Signed (purple), Closed (green), Integrated (green), Dropped (red) |
| `Workstream` | dropdown | Strategy, Legal, Tax, Finance, HR/Org, IT, Commercial, Real Estate, IP, Regulatory, Environmental, Risk/Insurance, Communications, Integration, Cultural |
| `Enterprise value` | number (currency) | |
| `Equity check` | number (currency) | |
| `Debt financing` | number (currency) | |
| `Synergy target — annual` | number (currency) | Run-rate, year 2 |
| `Synergy type` | dropdown | Cost, Revenue, Capex, Tax, NWC |
| `Diligence severity` | dropdown | Clean, Minor, Material, Deal-killer |
| `Critical path?` | checkbox | Drives critical-path highlight in Gantt |
| `Owner` | people | |
| `Status` | global | |
| `Priority` | global | |

### Starter tasks (~95 — abbreviated; expand into subtasks where noted)

#### 1. Strategic Rationale & Mandate
- Investment thesis memo (build/buy/partner)
- Strategic fit analysis vs corporate strategy
- Capital allocation framework refresh
- **Board approval to pursue M&A in this category** (M)
- Define deal screening criteria (size, geo, financial profile, strategic fit)
- Confirm financing envelope (cash on hand, debt capacity, equity issuance willingness)
- Assemble deal team
  - subtask: Internal team (Corp Dev lead, CFO, GC, CHRO, CIO, BU lead, IR)
  - subtask: External advisors (investment banker, M&A counsel, tax counsel, FDD provider, IT diligence, commercial diligence, HR/benefits)
- Set up secure deal data room (Stay-Co internal)
- Codename selection & confidentiality protocol
- Insider list & blackout window administration (if public)

#### 2. Target Identification & Screening
- Build long-list (target universe)
- Apply screens (financial, strategic, cultural, jurisdictional)
- Short-list of 3–5
- Banker engagement letter (if intermediated)
- Outreach strategy per target
- Preliminary valuation framework (DCF, trading comps, precedent transactions, LBO floor)
- Synergy framework — hypothesis tree (cost & revenue)
- Investment committee pre-read (target portrait)
- IC approval to approach (M)

#### 3. Initial Outreach & NDA
- Initial outreach (warm intro or banker-mediated)
- Mutual NDA executed (M)
- Process letter received (if auction)
- Initial information request list
- Indication of interest (IOI) drafted & submitted
- Auction milestone tracking (rounds, dates)

#### 4. Preliminary Diligence & Valuation
- Review CIM / management presentation
- Management meeting #1
- Preliminary financial analysis (revenue, EBITDA bridge, normalization, WC)
- Preliminary QoE flags
- Customer / market diligence (high-level, public sources + banker calls)
- Competitive positioning
- Synergy hypothesis sizing (range)
- Standalone valuation range
- Synergy-inclusive valuation range
- Sensitivity & scenarios (Base, Upside, Downside)
- Capital structure modeling
- Returns analysis (IRR, MOIC, NPV, accretion/dilution if public)
- **Investment Committee Round 2 pre-read** (M)
- Authorization to submit LOI (M)

#### 5. Letter of Intent (LOI)
- Draft LOI (price, structure, exclusivity period, key conditions, fee splits, walk rights)
- Internal approvals (IC / Board sub-committee)
- Submit LOI
- LOI negotiation rounds
- **LOI executed (M)** — *triggers exclusivity countdown rule*

#### 6. Confirmatory Due Diligence (parallel workstreams)
- Open virtual data room (VDR) access
- Diligence request list issued (master list)
- Diligence Q&A queue established
- **Legal DD memo** — corporate, contracts, litigation, regulatory, employment, real estate
- **Tax DD memo** — income tax exposure, state & local, indirect (sales/use/VAT), payroll, transfer pricing, NOLs / §382 limitation, tax credits, R&D, R&W tax provisions
- **Financial DD (Quality of Earnings)** — proof of revenue, normalized EBITDA bridge, working capital methodology, capex (maintenance vs growth), debt-like items, off-balance sheet
- **HR DD memo** — org structure, comp/benefits, key employee dependence, change-of-control triggers, severance liabilities, pension/OPEB, immigration, ER/EEO history, labor relations
- **IT & Cyber DD memo** — architecture, applications, infrastructure, security posture, prior incidents, technical debt, build vs buy
- **Commercial DD** — customer concentration, win/loss, churn, NRR/GRR, pricing power, competitive moat, top-20 customer interviews
- **Operational DD** — supply chain, facilities, manufacturing, capacity
- **IP DD** — patents, trademarks, copyrights, trade secrets, open source compliance, IP-related litigation
- **Real Estate DD** — leases (term, escalators, options), owned properties, environmental
- **Environmental DD** — Phase I ESA, Phase II if triggered
- **Insurance DD** — existing policies, loss runs, R&W insurance feasibility & quote
- **Sanctions / OFAC / FCPA / AML review**
- **Pension & retirement liabilities** (qualified, non-qualified, multi-employer)
- **Antitrust / regulatory feasibility memo** (HSR, EC, UK CMA, China SAMR, sector regulators)
- **CFIUS analysis** (if cross-border or sensitive sector)
- Diligence findings consolidation memo
- Material issues escalation log
- Revised valuation post-DD
- **IC final approval to proceed** (M)

#### 7. Definitive Agreement & Negotiation
- Definitive agreement structure decision (SPA / APA / Merger Agreement)
- Reps & warranties negotiation (fundamental vs general)
- Indemnification — caps, baskets, deductibles, survival periods, special indemnities
- Disclosure schedules review
- Earn-out / contingent consideration structure (if any)
- Working capital target & adjustment mechanism (Peg, target, true-up window)
- Escrow arrangements (indemnity escrow, adjustment escrow)
- R&W insurance — bind policy (M)
- Employment agreements — key employees (CEO, CFO, key sales)
- Non-compete / non-solicit (Seller; key employees)
- Transition Services Agreement (TSA) — scope & pricing
- IP cross-license / IP assignment
- Supply Agreement / Reverse Supply Agreement
- Closing payments schedule (funds flow)
- Solvency opinion (if debt-financed at high leverage)

#### 8. Financing & Regulatory
- Debt commitment letters (if debt-financed)
- Bank syndication kickoff
- Lender DD support
- Final debt documentation
- Equity financing — Board authorization, S-3 if registered offering
- **HSR filing** (if applicable; 30-day waiting period)
- **EU / UK / China SAMR / other antitrust filings** (jurisdiction matrix)
- **CFIUS notification** (if applicable)
- Industry-specific regulator approvals (FCC, FDA, OCC, FERC, NRC, FAA, etc.)
- Pre-merger integration planning permission tracking (gun-jumping awareness)
- Antitrust expert engaged; "clean team" protocols in place
- Solvency opinion (if leveraged buyout / dividend recap)

#### 9. Pre-Closing
- Closing conditions checklist tracking
- Officers' certificates
- Secretary's certificates
- Good standing certificates (all relevant jurisdictions)
- Lien searches & UCC-3 releases
- Third-party consents (landlords, top customers, lenders, change-of-control terms)
- Regulatory closing conditions confirmed
- Bring-down certificates
- Final disclosure schedules update
- Funds availability confirmation
- Press release & 8-K (if public) — drafted, ready to release
- **Communications plan — Day-0 / Day-1** (employee, customer, vendor, press, social)

#### 10. Closing
- Final purchase price calculation (NWC, debt, cash, transaction expenses)
- **Funds flow execution** (M)
- **Execute closing documents** (M)
- Wire confirmations received
- Closing book assembled & distributed
- Press release issued (M)
- Employee announcement
- Public filings (8-K if applicable)

#### 11. Day 1 Readiness
- Day-1 checklist executed (per workstream)
- CEO / Sponsor welcome message
- Employee town hall — combined
- Customer communication — top 50
- Vendor communication — material vendors
- IT account provisioning kickoff
- Payroll continuity confirmed
- Benefits transition strategy executed (or COBRA bridge)
- Banking / treasury account access
- Insurance policies updated (tail policies for Seller; runoff D&O)
- Brand / signage / domains transition started
- Workplace access (badges, VPN, remote work)
- Day-1 IR / external messaging (if public)

#### 12. Post-Merger Integration — Day 1 → Day 100
*(Tasks below should be **created as a child project** "<Target> — Post-Merger Integration" when this section is reached; see the **PMI Sub-template** at end of this file.)*
- Stand up Integration Management Office (IMO)
- Steering committee cadence (weekly)
- Workstream charters (one per workstream — see PMI sub-template)
- Day-1 → Day-100 milestone plan
- Cultural integration plan & survey baseline
- Talent retention plan execution
- Org design (target operating model) finalized
- Risk register live
- Issue escalation tracker
- Synergy initiative chartering

#### 13. Value Capture & Synergy Tracking
- Synergy tracking dashboard live
- Run-rate vs in-year synergies tracked monthly
- Cost synergy initiatives — execution & milestones
- Revenue synergy initiatives — execution & milestones
- Variance analysis (actual vs plan) — monthly
- Synergy reporting to Board / IC — quarterly
- Synergy initiative "stage gates": Identified → Scoped → Approved → In flight → Realized
- Reinvestment decisions (deploying synergies)

#### 14. Post-Close (Year 1+)
- Working capital true-up (typically 60–120 days post-close) (M)
- Indemnification claim management
- Earn-out tracking & payments
- R&W insurance claims management
- Tax matters — final tax return for short period, §338(h)(10) election if applicable
- Goodwill impairment assessment (annual, ASC 350)
- Post-mortem / lessons learned playbook update (M)
- One-year retention check on key employees
- Year-1 synergy realization report
- Audit committee briefing on M&A program

### Rules

1. **Exclusivity countdown** — When task "LOI executed" is marked complete, start a timer field on the project (`exclusivityEndsAt`) and surface in topbar tabs.
2. **Material diligence finding escalation** — When `Diligence severity` = *Material* or *Deal-killer*, auto-add Deal Lead, CFO, and GC as collaborators and create a notification.
3. **Auto-spawn PMI project** — When milestone "Execute closing documents" is marked complete, show a confirm-toast: "Create the PMI project for `<Target>`?" → if yes, instantiate the PMI sub-template as a child project with start date = Closing date.
4. **Critical-path slip** — When a task with `Critical path?` = true is delayed beyond its due date by ≥ 1 day, escalate to Deal Lead.
5. **Antitrust clean-team enforcement** — When `Workstream` = *Commercial* and project status is between LOI and Closing, restrict comments visibility to a configured "Clean team" (use task collaborators); show a banner in the task header "🛡️ Clean-team only — gun-jumping aware".
6. **Synergy stage-gate notifications** — Whenever a task tagged with `Synergy initiative` advances stage, notify the synergy owner + IMO lead.
7. **30/60/90/100-day milestone reviews** — Auto-generate review tasks at Closing date + 30/60/90/100 days for the PMI sub-project.

### Forms

- **"Diligence question to Seller"** — Captures questions during DD. Fields: Workstream (dropdown), Question (long text), Priority (Low/Med/High), Material? (checkbox), Files (attachments). On submit, creates a Task in `Confirmatory Due Diligence` section assigned to the relevant workstream lead.
- **"Synergy initiative proposal"** — Workstream owners submit synergy ideas. Fields: Initiative name, Workstream, Type (Cost/Revenue/Capex/Tax/NWC), Annual run-rate ($), One-time cost ($), Confidence (H/M/L), Owner, Brief description, Attach business case. On submit, creates a task in `Value Capture & Synergy Tracking` with `Synergy type` set.

### Suggested dashboards

- **Burnup**: Diligence requests open vs closed (line series: total scope vs closed; ideal line).
- **Gantt**: Built-in view of the project (no separate chart).
- **Number**: Days to Close (target vs actual).
- **Bar**: Diligence findings by `Workstream`, stacked by `Diligence severity`.
- **Line**: Synergy run-rate vs plan (monthly).
- **Donut**: Day-1 readiness by `Workstream` (Complete / In-progress / Blocked / Not started).
- **Lollipop**: Top synergy initiatives by run-rate $.

### Starter risk register (sibling project auto-created)

5 starter risks pre-populated in the Risk Register:
1. Material adverse change in Target's customer base pre-close (likelihood: Low, impact: High)
2. Antitrust filing delay (likelihood: Medium, impact: Medium)
3. Key employee departure post-LOI (likelihood: Medium, impact: High)
4. Integration cost overrun >15% (likelihood: Medium, impact: Medium)
5. Synergy realization shortfall vs plan (likelihood: High, impact: Medium)

Each risk task has fields: `Likelihood`, `Impact`, `Mitigation`, `Owner`, `Status`.

---

## G2 — Company Spin-off / Divestiture / Carve-out

**Icon:** ✂️ | **Color:** primary | **Default view:** Gantt | **Enabled views:** All | **Suggested bundles:** "Status", "Priority"

**When to use:** You are the **seller / parent** separating a business — whether as a tax-free §355 spin to existing shareholders, a sale to a strategic, a sale to a PE sponsor, an IPO carve-out, or a Reverse Morris Trust. Covers separation planning, carve-out financials, stand-alone capability build, marketing/distribution, definitive agreement, Day-1, TSA, and full TSA exit.

### Sections (15 — separation lifecycle)
1. Strategic Decision & Mandate
2. Separation Planning
3. Carve-out Financials & Tax Structure
4. Operational Separation Design
5. Stand-alone Capability Build
6. Buyer Marketing / Spin Distribution Plan
7. Diligence Support
8. Definitive Agreement / Separation & Distribution Agreement
9. Regulatory & Financing
10. Pre-Closing / Pre-Distribution
11. Closing / Distribution Date
12. Day-1 Stand-alone Operations
13. Transition Services Agreement (TSA) Execution
14. TSA Exit & Wind-down
15. Post-Separation

### Custom fields (project-local)

| Field | Type | Options / notes |
|---|---|---|
| `Business unit / SpinCo name` | text | |
| `Project codename` | text | |
| `Separation type` | dropdown | Tax-free Spin-off (§355), Split-off, Sale to Strategic, Sale to PE/Sponsor, IPO Carve-out, Reverse Morris Trust, Joint Venture |
| `Status` | dropdown | Mandate, Planning, Pre-Launch, Active, Definitive Agreement, Closed, Stand-alone, TSA in flight, TSA Exited |
| `Workstream` | dropdown | Strategy/M&A, Legal, Tax, Finance/Accounting, HR/Org, IT, Commercial, Real Estate, IP, Regulatory, Communications, TSA, Carve-out Financials, Treasury, Brand, IR (if public) |
| `Target close date` | date | |
| `Estimated proceeds` | number (currency) | |
| `One-time separation costs` | number (currency) | |
| `Run-rate stranded costs` | number (currency) | |
| `TSA scope` | dropdown | None, Light (≤ 3 services), Medium (4–10), Heavy (>10) |
| `Allocation status` | dropdown | Not started, Drafting, In review, Finalized |
| `Critical path?` | checkbox | |
| `Owner` | people | |

### Starter tasks (~95 — abbreviated)

#### 1. Strategic Decision & Mandate
- Portfolio review — strategic fit of business unit
- Business case: separate vs hold (financial & strategic)
- Decision tree: spin / split-off / sell-to-strategic / sell-to-PE / IPO carve-out / RMT
- Capital structure implications analysis
- **Board approval to proceed** (M)
- Engage advisors (banker, M&A counsel, tax counsel, accounting, separation consultant, IR/PR)
- Project codename & insider list
- Confidentiality / "Need to know" protocol (clean team / dirty team)
- Internal "Need-to-know" stand-up
- Form Stay-Co and Spin-Co leadership teams (or sale-side team)

#### 2. Separation Planning
- **Perimeter definition** — what's in / what's out (business lines, products, geographies)
- Asset & liability allocation memo
- Employee allocation (Stay-Co vs Spin-Co); manager-by-manager review
- Contract allocation (assignment vs reverse-license vs duplication)
- IP allocation — patents, trademarks, copyrights, trade secrets, know-how
- Real Estate allocation — leases (assign / sublease / new lease), owned properties
- Customer relationship allocation
- Vendor relationship allocation
- **Legal entity structure** — establish Spin-Co holdco + subs; cross-jurisdictional steps
- Capitalization of Spin-Co (debt issuance, equity, intercompany payables/receivables)
- Pre-separation reorganization plan
- **Step plan** — sequenced legal + tax + accounting steps to effect the separation (often a 60+ step document)

#### 3. Carve-out Financials & Tax Structure
- Historical carve-out financial statements — 3 yrs P&L, BS, Cash Flow
- **Audit of carve-out financials** (PCAOB if SEC-registered Form 10) (M)
- Pro forma adjustments (for Form 10 / CIM)
- Allocation methodologies — corporate costs, shared services, taxes, debt, interest
- **Stand-alone cost analysis** — delta from carve-out (cost loaded into BU) to true stand-alone
- **Stranded cost analysis** — costs that remain at Stay-Co with no business to absorb
- Working capital determination at separation
- Net debt allocation
- Cash mgmt at closing
- **Tax-free qualification analysis** (for §355): active trade or business, business purpose, continuity of interest, device test, plan of distribution, 5-year history
- **Private Letter Ruling (PLR) from IRS** (if pursued)
- **Tax opinion** — Section 355 qualification (delivered by counsel and/or accountants) (M)
- Cross-border tax structuring (foreign subs)
- **Tax Sharing Agreement** drafted
- **Tax Matters Agreement** drafted
- E&P allocation (for spin)
- §382 NOL implications
- State tax considerations

#### 4. Operational Separation Design
- Target Operating Model (TOM) — Spin-Co
- TOM — Stay-Co (post-separation)
- Org design — Spin-Co (executive, leadership, IC roles)
- Org design — Stay-Co (post-separation roles, eliminations)
- Job leveling & comp benchmarking — Spin-Co
- Retention plans — key employees (both sides) — bonuses, equity refresh
- Workforce transition plan — involuntary terms, severance, **WARN Act compliance** (60-day notice)
- IT systems inventory (every app, every infrastructure component)
- IT systems allocation — clone, transfer-of-ownership, build new, retire
- IT separation roadmap (Day-1 minimum, TSA targets, exit dates)
- ERP carve-out plan (e.g., SAP / Oracle / NetSuite split)
- HRIS carve-out (Workday / SAP SuccessFactors / etc.)
- Email / collaboration tools separation (Microsoft tenant split or new tenant)
- Identity & access management separation
- Network & data center separation
- Cybersecurity separation (SOC, IR, tooling)
- Application portfolio rationalization
- Data separation & privacy (GDPR, CCPA, LGPD, etc.)
- Customer data segregation / migration
- Backups & archives — chain of custody

#### 5. Stand-alone Capability Build (Spin-Co)
- Spin-Co leadership team named (CEO, CFO, GC, CHRO, CIO, etc.)
- Spin-Co Board of Directors composition
- Stand-alone **Finance function** (FP&A, Accounting, Treasury, Tax, IR)
- Stand-alone **HR function** (Talent, Total Rewards, People Ops, ER)
- Stand-alone **Legal function**
- Stand-alone **IT function**
- Stand-alone **Procurement function**
- Stand-alone **Real Estate / Workplace** function
- Banking relationships — new operating accounts, new credit facilities, ratings agency relationships
- Audit firm engagement — Spin-Co's own auditor
- Insurance — own policies (D&O, GL, Cyber, Employment Practices, etc.)
- Treasury — cash mgmt, FX hedging, intercompany loan unwinds
- **Brand & identity** — name, logo, website, domain, social handles, trademark filings
- ERP go-live (if standing up)
- HRIS go-live
- CRM go-live
- **Public-company readiness (if IPO/spin)** — SEC reporting (10-K/10-Q/8-K), SOX 404 compliance, audit committee, disclosure controls, NYSE/Nasdaq listing

#### 6. Buyer Marketing / Spin Distribution Plan

**For Sale (skip if Spin):**
- Build CIM (Confidential Information Memorandum)
- Build management presentation
- Tease the market (anonymous teaser)
- Sign NDAs with interested parties
- Distribute CIM
- Process letter — Round 1
- Manage data room access
- Round 1 indications of interest (IOIs) — analyze, down-select
- Round 2 — management meetings, site visits, deeper data room
- Final bids (mark-up of SPA + price + financing certainty)
- Select winning bidder; confirm sponsor / strategic

**For Spin (skip if Sale):**
- **Form 10 (SEC registration statement)** drafting (M)
- Form 10 SEC review & comment cycles
- Information statement to shareholders
- Record date / Distribution date set
- **NYSE/Nasdaq listing application** (M)
- "When-issued" trading
- Roadshow (investor relations introduction)
- Day-1 IR materials (investor deck, fact sheet, KPIs)
- Stand-alone financial guidance (next-12-month outlook)
- Analyst day (post-spin)

#### 7. Diligence Support (for Sale)
- Diligence response coordination
- **Vendor diligence reports** prepared (sell-side QoE, sell-side legal, sell-side tax, sell-side IT, sell-side commercial)
- Customer / vendor reference support
- Management presentations to bidders
- Diligence Q&A management

#### 8. Definitive Agreement / Separation & Distribution Agreement
- **For Sale**: SPA / Merger Agreement / APA negotiation
- **For Spin**: Separation & Distribution Agreement (SDA)
- **TSA** — negotiation (service catalog, pricing, term, exit ramps)
- **IP cross-licenses** (Stay-Co to Spin-Co and vice versa, including residual rights)
- Supply / Reverse Supply Agreements (if applicable)
- **Employee Matters Agreement** (allocation, benefits, equity treatment, retention)
- **Tax Matters Agreement** (allocation of pre-/post-separation taxes, audit cooperation)
- Real Estate sub-leases / assignment agreements
- Shared facilities agreements (cafeteria, security, parking)
- Disclosure schedules (Sale)

#### 9. Regulatory & Financing

**For Sale:**
- HSR filing (US)
- EU / UK / China / sector-specific antitrust
- Other regulatory approvals
- Confirm buyer financing certainty
- Solvency reps (if applicable)

**For Spin:**
- IRS PLR (if pursued) — response review
- Tax opinion (Sec 355 qualification) finalized (M)
- **SEC effectiveness of Form 10** (M)
- Stock exchange approval — listing effective
- Shareholder approval (if required by exchange rules)
- Lender consents on existing debt (if affected by spin)
- New debt at Spin-Co (financing for the cash dividend back to Parent, if applicable)

#### 10. Pre-Closing / Pre-Distribution
- **Third-party consents** — landlords, customers (change-of-control clauses), lenders, key vendors
- Contract assignment letters distributed
- Notice to vendors of separation
- **Notice to employees** — 60-day WARN if applicable
- Pre-clear closing/distribution checklist
- Stand up **Spin-Co Board of Directors**
- Spin-Co officer appointments
- Spin-Co bylaws, certificate of incorporation, shareholder rights
- Working group all-hands call (T-7 days)
- Funds movement plan (intercompany settlements, debt drawdown, dividend to parent)

#### 11. Closing / Distribution Date
- **For Sale**: Execute closing docs, wire transfers, funds flow (M)
- **For Spin**: **Effective distribution — stock distributed to Parent shareholders** (M)
- Press release issued
- **8-K filings** — Stay-Co and Spin-Co (if public) (M)
- Employee announcement (combined and separate)
- Day-0 town halls (Stay-Co and Spin-Co)
- Customer & vendor notification waves

#### 12. Day-1 Stand-alone Operations
- **Day-1 readiness checklist** executed (per workstream)
- Customer communications — top 50 accounts
- Vendor communications — all material vendors
- Banking & treasury operational
- Payroll continuity confirmed (no missed cycle)
- Benefits enrollment / continuity (new BIN, new plans, or carve-out portion)
- IT access — Day-1 functional for every employee
- Brand transition — signage, comms, packaging, email signatures
- **IR functions live (Spin-Co)** — investor.spinco.com, IR calendar, analyst coverage
- First earnings reporting cycle prep (for Spin-Co post-spin)

#### 13. Transition Services Agreement (TSA) Execution
*(Tasks below should be **created as a child project** "<SpinCo> — TSA" when Day-1 is reached; see the **TSA Sub-template** at end of this file.)*
- TSA governance (steering committee, service managers per service)
- **Service catalog** finalized — every service: scope, pricing, term, exit ramp
- Service-level metrics & monthly reporting
- Monthly TSA invoicing & settlement
- Issue / escalation log
- Quarterly service review
- Service-level credits / disputes

#### 14. TSA Exit & Wind-down
- Per-service exit plan (target exit date, migration approach)
- Migration of each service — to Spin-Co internal team, to a third party, or retired
- Final TSA service month per service
- Knowledge transfer (runbooks, credentials, contracts)
- Final TSA termination & true-up (M)
- Stranded cost true-up at Stay-Co

#### 15. Post-Separation
- **Working capital true-up** (Sale) (M)
- Indemnification claims (Sale)
- **Tax allocations & shared filings** (Stay-Co + Spin-Co) for transition period (Tax Matters Agreement)
- Audit support for transition periods
- §355 monitoring — anti-Morris-Trust restrictions on Spin-Co (no acquisitions > 50% for 2 years)
- Cost True-up of carve-out / one-time costs vs budget
- **Post-mortem / lessons learned** (M) — playbook update for future separations
- One-year retention check on key employees (both sides)

### Rules

1. **Type-driven required tasks** — When `Separation type` = *Tax-free Spin-off (§355)* → automatically mark these tasks Required: Section 355 qualification analysis, Tax opinion, Form 10, Tax Matters Agreement, Anti-Morris-Trust monitoring.
2. **Type-driven exclusion** — When `Separation type` = *Sale to Strategic* or *Sale to PE/Sponsor* → hide spin-only tasks (Form 10, PLR, Tax opinion §355) and show Sale-only tasks (CIM, vendor diligence reports).
3. **Auto-spawn TSA project** — When milestone "Day-1 stand-alone operations" tasks are 90% complete, prompt: "Create the TSA Execution project for `<SpinCo>`?" → instantiate TSA sub-template.
4. **TSA service exit alert** — In TSA child project, when a service's scheduled exit date is within 30 days, notify both service managers and the IMO.
5. **Stranded cost watch** — When `Run-rate stranded costs` is set, render a "Stranded Cost Reduction" chart on the project dashboard.
6. **§355 anti-Morris-Trust** — For 24 months post-spin, any task with type "Acquisition by SpinCo" auto-creates a notification to Tax Counsel for §355 compliance review.
7. **Communications gating** — Until "Definitive Agreement signed" milestone, restrict external communications tasks to deal team only (clean-team behavior).
8. **WARN compliance** — When workforce transition plan includes ≥ 50 affected employees, auto-create a task "Issue WARN notices (≥60 days)" with the federal WARN Act 60-day notice period applied as a due-date offset from the close date (the 60-day offset is the statutory minimum; the workspace owner can override per state requirements via Settings → Compliance → Notice Periods).

### Forms

- **"TSA service request from Spin-Co"** — Fields: Service name (text), Service category (dropdown: IT, Finance, HR, Legal, Real Estate, Procurement, Other), Required Day-1? (checkbox), Estimated duration (months), Description (long text), Estimated cost ($), Attachments. Creates a task in `Transition Services Agreement (TSA) Execution` section.
- **"Stranded cost mitigation idea"** — Fields: Function, Idea, Estimated annual savings ($), Effort (Low/Med/High), Confidence (H/M/L), Owner. Creates a task in the Risk Register sibling project tagged "Stranded cost".
- **"Cross-functional risk escalation"** — Fields: Workstream, Risk, Likelihood, Impact, Proposed mitigation, Owner.

### Suggested dashboards

- **Burnup**: Day-1 readiness by `Workstream` over time.
- **Donut**: TSA services by status (Active / Planning Exit / Exited).
- **Number**: One-time separation costs (actual vs budget).
- **Bar**: Stand-alone capability gaps by function.
- **Line**: Stranded cost reduction over time (months 0–24 post-close).
- **Lollipop**: Top 10 TSA services by monthly cost.
- **Gantt**: Built-in.

### Starter risk register (sibling project auto-created)

5 starter risks pre-populated in the Risk Register:
1. §355 qualification challenge by IRS (likelihood: Low, impact: Critical) — *only if §355 spin*
2. Customer attrition during separation (likelihood: Medium, impact: High)
3. Key employee departure pre-separation (likelihood: High, impact: High)
4. TSA dependency overrun (services not exited on time) (likelihood: High, impact: Medium)
5. Stranded cost shortfall — Stay-Co cannot remove enough cost (likelihood: Medium, impact: High)

---

## PMI Sub-template (instantiated as child project from G1 Closing)

**Name:** `<Target> — Post-Merger Integration (Day 1 → Day 100)`
**Default view:** Gantt
**Sections (Day-N milestones):**
1. Day-1 Readiness
2. Day-30 Milestones
3. Day-60 Milestones
4. Day-90 Milestones
5. Day-100 Review & Replan
6. Year-1 Synergy Realization

**Custom fields:** `Workstream`, `Synergy target`, `Synergy type`, `Owner`, `Status`, `Stage gate` (dropdown: Identified, Scoped, Approved, In-flight, Realized, Cancelled).

**Starter tasks per workstream (one of each at Day-1, expand later):**
- **Strategy/Integration:** IMO stood up | Steering committee cadence | Charter every workstream | Synergy taxonomy | Cultural integration plan
- **Legal:** Combine entity governance | Update certificates / SOX | Litigation hold review
- **Tax:** Open tax returns coordinate | §338(h)(10) election (if applicable) | NOL §382 study | Transfer pricing alignment
- **Finance:** Chart of accounts harmonization | Combined budget & forecast | Combined reporting pack | Treasury merge | Banking consolidation
- **HR/Org:** Org design rollout | Comp harmonization | Benefits harmonization | Retention plan execution | Performance cycle alignment | Cultural survey baseline
- **IT:** Identity & access merge | Email tenant merge | Network connectivity | ERP integration plan | CRM consolidation | Security tool consolidation
- **Commercial:** Pricing & packaging alignment | Sales territory rationalization | Customer cross-sell mapping | Brand integration | Marketing combine
- **Real Estate:** Office consolidation review | Lease decisions
- **Procurement:** Vendor rationalization | Spend cube refresh | Strategic contract renegotiations
- **Risk:** Risk register live | Insurance combine | Compliance program merge
- **Communications:** Combined intranet | All-hands cadence | Customer comms plan | Brand transition

**Stage gates / milestones:**
- Day-1 ✅
- Day-30 review (M)
- Day-60 review (M)
- Day-90 review (M)
- **Day-100 milestone & replan (M)** — major executive review
- Quarterly synergy reports (M, M, M)

**Rules:**
- Every synergy task's `Stage gate` change posts to the Synergy dashboard.
- Tasks slipping past Day-N milestone with `Critical path?` = true → escalate to Integration Lead.

---

## TSA Sub-template (instantiated as child project from G2 Day-1)

**Name:** `<SpinCo> — Transition Services Agreement (TSA)`
**Default view:** List (Board grouped by Service status also useful)
**Sections (TSA lifecycle per service):**
1. Active services
2. Planning exit
3. In migration
4. Exited
5. Disputed

**Custom fields per service:**
- `Service name` — text
- `Service category` — dropdown: IT, Finance, HR, Legal, Real Estate, Procurement, Customer Support, Engineering, Other
- `Provider` — dropdown: Stay-Co provides, Spin-Co provides (reverse TSA)
- `Service manager (provider)` — people
- `Service manager (recipient)` — people
- `Start date` — date
- `Scheduled exit date` — date
- `Actual exit date` — date
- `Monthly cost` — number (currency)
- `Service-level target` — text (e.g., "99.9% uptime", "5 business day response")
- `SLA performance MTD` — number (percent)
- `Health` — dropdown: Green / Yellow / Red
- `Migration approach` — dropdown: Internalize, Third party, Retire/decommission

**Starter tasks (one per typical service, ~25):**
- IT — Email & calendaring
- IT — Identity & SSO
- IT — Endpoint management (MDM)
- IT — Network / VPN
- IT — Cybersecurity SOC
- IT — Helpdesk & IT support
- IT — ERP (financials)
- IT — HRIS / Payroll system
- IT — CRM
- IT — Data warehouse / analytics
- IT — Application hosting (cloud)
- IT — Disaster recovery / backups
- Finance — Accounting close support
- Finance — Treasury services
- Finance — Tax compliance support
- Finance — Procure-to-pay processing
- HR — Benefits administration
- HR — Payroll processing
- HR — Recruiting / ATS
- HR — Learning management
- Legal — Contract management system
- Real Estate — Facilities management
- Real Estate — Office services
- Procurement — Indirect procurement support
- Customer Support — Tier-1 ticketing infra

**Rules:**
- When `Scheduled exit date` − today < 30 days → notify both service managers; tag "T-30".
- When `Scheduled exit date` − today < 14 days and `Migration approach` not set → escalate to IMO.
- When `SLA performance MTD` < `Service-level target` for 2 consecutive months → set `Health` to Red and notify both sides.
- When `Actual exit date` set → calculate post-exit savings and add to "Stranded Cost Reduction" chart.

**Dashboards:**
- Donut: Services by section (Active / Planning Exit / In Migration / Exited / Disputed)
- Number: Services exited / Total services
- Line: Cumulative monthly TSA cost over time (should bend downward)
- Bar: Services by `Service category` with avg health

---

## Implementation requirements

1. Both G1 and G2 export from `src/features/templates/curated/transactions.ts`. The PMI and TSA sub-templates also export from this file. Add them to the curated index.
2. The "auto-spawn child project" behavior (Rules 3 in both templates) requires extending `useTemplateInstantiate` to accept a `parentProjectId` so the child project is linked. Persist the link as a new optional field on `Project`: `parentProjectId?: ID` (extend non-breakingly).
3. Render parent → child project linkage as a small breadcrumb at the top of a child project: `Parent: <Acme Acquisition> ↳ <Acme — PMI>`. Clicking goes to the parent.
4. Add a **"Spawn child project"** menu item to the project "..." menu so users can also manually spawn the PMI / TSA child from any project.
5. The risk-register sibling project is auto-created when G1 or G2 is instantiated and named `<Project name> — Risk Register`. Link via the same `parentProjectId`.
6. Both G1 and G2 should be tagged in the template gallery as **"Heavy"** (estimated >50 tasks). Add a small "Heavy template — recommended for executive deal teams" caption.
7. Append a row to `Design.md`: `27c | src/features/templates/curated/transactions.ts | Corporate transactions templates (Acquire & Spin-off) | <today>` and add a short subsection **"Transactions templates overview"** with the lifecycle diagrams for G1 and G2 (text-only, no images: 14 sections for G1, 15 for G2).

### Success criteria
- The Create Project gallery shows a new category "Corporate Dev" with G1 and G2.
- Instantiating G1 creates a Gantt project with ~95 tasks, ~14 sections, ~12 custom fields, ~7 rules, 2 forms, 6+ dashboard chart specs, and a sibling risk register.
- Instantiating G2 creates a Gantt project with ~95 tasks, ~15 sections, ~13 custom fields, ~8 rules (with type-driven inclusion/exclusion), 3 forms, 7+ dashboard chart specs, and a sibling risk register.
- Reaching the Closing milestone in G1 offers to spawn the PMI child project; reaching Day-1 in G2 offers to spawn the TSA child project.
- Parent → child project linkage works visually and via the "..." menu.
- `Design.md` updated.

Do not break previous steps. Keep one template per category file, ≤ 200 lines per component. Add docstrings explaining when to use each.
