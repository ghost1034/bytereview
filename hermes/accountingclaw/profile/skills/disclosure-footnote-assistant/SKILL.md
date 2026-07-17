---
name: disclosure-footnote-assistant
description: Draft GAAP and SEC footnotes (debt, leases, income tax, segments) with cross-footing checks
version: 0.1.0
metadata:
  hermes:
    tags: [accounting, disclosure, reporting]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Disclosure / Footnote Drafting Assistant

Convert structured financial data (debt schedules, lease schedules, income tax provision, segment data, AR, share-based compensation) into draft GAAP-compliant footnote tables and narrative text — with cross-footing checks, prior-period consistency comparison, and required-disclosure checklist validation per the applicable ASC.

---

## Overview

| | |
|---|---|
| **Target user** | Financial Reporting Manager, Controller, SEC Reporting team |
| **Maturity** | Production (mechanical tables, cross-footing, checklist coverage); judgment-supported (narrative phrasing, prior-period mapping, materiality assessment) |
| **What it does** | For each supported footnote type (debt, lease, income tax, AR, share-based comp), takes structured input → produces an XLSX with the disclosure tables + a DOCX with narrative; cross-foots every total to the primary financial statements; checks required disclosures per the relevant ASC checklist |
| **What it does NOT do** | Replace the company's disclosure controls; perform legal review; XBRL tagging; classify a SAB 99 qualitative materiality call |

## When to use

- Quarterly / annual financial reporting cycles
- Year-end audit deliverable drafting (footnote MD)
- "Tickmark" tie-out between footnotes and the face of the financials
- New ASC adoption (e.g., a new disclosure requirement) — checklist validates coverage

## When NOT to use

- Private-company variations from US GAAP (PCC alternatives) — separate path
- IFRS-reporting entities — needs IAS/IFRS checklists (out of scope here)
- Segment reporting under ASC 280 — needs CODM identification (judgment); skill can build tables but not classify segments

## Authoritative sources

- **ASC 470 / 480 / 815** — Debt and equity-linked instruments
- **ASC 842** — Lease disclosures
- **ASC 740** — Income tax disclosures (rate rec, DTA/DTL by type, NOL carryforwards, UTPs)
- **ASC 326** — Allowance for credit losses (AR)
- **ASC 718** — Stock-based compensation
- **ASC 280** — Segment reporting
- **ASC 275** — Risks and uncertainties
- **Regulation S-X Rule 5-02 / 5-03** — Form and content of B/S and IS captions
- **Regulation S-K Item 303** — MD&A

## Inputs

### 1. Footnote type — `--footnote <type>` (required)

One of: `debt`, `lease`, `income_tax`, `ar_allowance`, `stock_comp`, `segment`.

### 2. Current period data — `--data <path>` (required)

CSV/XLSX with footnote-type-specific schema. Schemas:

**Debt** (`debt_schedule.csv`)
| Column | Type |
|---|---|
| `instrument` | string |
| `lender` | string |
| `original_principal` | float |
| `principal_outstanding` | float |
| `interest_rate` | float (e.g., 0.06) |
| `rate_type` | string (`fixed` / `variable`) |
| `maturity_date` | date |
| `secured` | bool |
| `covenant_compliance` | bool |

**Lease** — see [lease-842-assistant](../lease-842-assistant/SKILL.md) outputs.

**Income tax** (`provision_summary.yaml`) — see [tax-provision-calculator](../tax-provision-calculator/SKILL.md).

**AR allowance** — output of [reserves-estimator](../reserves-estimator/SKILL.md).

**Stock comp** — RSU/option grant register with vesting schedules.

**Segment** — reportable-segment P&L extracts.

### 3. Prior period footnote — `--prior <path>` (optional)

XLSX from the prior period's run. Used for consistency check (e.g., did we drop a required-disclosure item that was present last year?).

### 4. Parameters

| Flag | Default | Description |
|---|---|---|
| `--period-end` | required | YYYY-MM-DD |
| `--entity` | "" | Reporting entity label |
| `--output-xlsx` | required | Tables workbook |
| `--output-docx` | required | Narrative DOCX (Times New Roman 12pt) |
| `--tie-to-statement` | None | Optional path to a CSV with face-of-financials totals for cross-foot |

## Workflow

```
1. LOAD & VALIDATE schema for the chosen footnote type
2. COMPUTE STANDARD TABLES
   - Debt: principal outstanding by instrument; maturity schedule (year 1–5 + thereafter);
            weighted-average interest rate; fixed vs. variable mix; secured vs. unsecured
   - Lease: ROU + Liability by class (operating / finance); maturity (year 1–5 + thereafter);
            weighted-average discount rate; weighted-average remaining term; lease cost components
   - Income tax: ETR reconciliation; current vs. deferred breakdown; DTA/DTL detail; NOL carryforwards
   - AR allowance: aging matrix; roll-forward (Beg + Provision − Write-offs + Recoveries = End)
   - Stock comp: option / RSU rollforward; vested vs. unvested; expected forfeitures; weighted-avg
3. CROSS-FOOTING CHECKS
   - Debt principal outstanding == Balance Sheet debt balance (from --tie-to-statement)
   - Lease liability == B/S lease liability
   - Income tax provision (total) == I/S "Provision for income taxes" line
   - AR allowance ending balance == B/S allowance balance
4. REQUIRED DISCLOSURE CHECKLIST (per ASC)
   - Mark each required disclosure as `present` / `missing`
5. PRIOR-PERIOD CONSISTENCY
   - For each row in prior, attempt match in current; flag dropped lines for explicit review
6. ARTIFACT GENERATION
   - XLSX: Summary / Tables / Checklist / CrossFoot / PriorConsistency / AuditTrail / SignOff
   - DOCX: Times New Roman 12pt narrative; tables embedded; placeholder cross-references
```

## Edge cases

| Scenario | Handling |
|---|---|
| **New debt instrument added mid-period** | Maturity table groups it correctly by maturity year; weighted-average rate uses time-weighted balance |
| **Variable-rate debt with rate cap** | Rate disclosed as base + spread + cap; if cap is in the money at period end, disclose disclosed-rate vs. cap |
| **Foreign-currency-denominated debt** | Disclose original currency + USD equivalent at period-end FX |
| **Lease modification** | Reflect in maturity table at modified payments; pre-modification term length disclosed separately |
| **DTA valuation allowance change** | Show as a discrete line in ETR rec |
| **Stock comp forfeiture true-up** | Roll-forward separates true-up from current-period grants |
| **Empty footnote** (e.g., no debt) | Skill still produces "Not applicable" placeholder so the checklist confirms coverage |
| **Materiality** | Skill defers to the user on materiality; flags amounts < 5% of disclosure total as "consider grouping" |

## Anti-patterns (DO NOT)

- **DO NOT** disclose only the largest 80% of debt — every material instrument must be disclosed
- **DO NOT** combine fixed and variable into a single rate disclosure
- **DO NOT** drop a prior-period required disclosure without explicit rationale (compare-and-explain)
- **DO NOT** quote raw GL totals — every table number should be traceable to a supporting schedule
- **DO NOT** describe a tax position in detail without first confirming it's not subject to ASC 740-10-25 (UTP)

## Outputs

### Tables XLSX (per footnote)

For **Debt**:

| Sheet | Contents |
|---|---|
| `Summary` | Total principal, weighted-avg rate, weighted-avg maturity, fixed/variable mix |
| `Schedule` | Instrument-by-instrument with rate, maturity, secured flag |
| `Maturity` | Year 1, 2, 3, 4, 5, Thereafter principal due |
| `Checklist` | Required disclosures per ASC 470 with present/missing |
| `CrossFoot` | Disclosure total vs. B/S balance |
| `AuditTrail` | Inputs, parameters, timestamp |
| `SignOff` | Preparer / Reviewer |

### Narrative DOCX

Times New Roman 12pt. Standard structure:

```
NOTE X — DEBT

The Company's long-term debt consists of the following at [Period End]:

[Table: Schedule]

Maturities of long-term debt outstanding at [Period End] are as follows:

[Table: Maturity]

The weighted-average interest rate on outstanding debt at [Period End] was
[X.X]% (Y.Y% in the prior period). At [Period End], [%] of the Company's
debt bore variable interest rates, primarily indexed to SOFR.

The Company was in compliance with all financial covenants at [Period End].
```

## Quality gates

1. [ ] Every dollar amount in the footnote ties to the source schedule
2. [ ] Every required disclosure for the ASC subtopic is checked as present
3. [ ] Prior-period disclosures dropped have a written rationale
4. [ ] Total in the footnote table equals the B/S or I/S line item
5. [ ] Narrative dates are updated (no stale "as of December 31, 2023" text)
6. [ ] Reviewer and Approver are different from Preparer

## Worked example

```bash
python scripts/footnote_drafter.py \
  --footnote debt \
  --data examples/debt_schedule.csv \
  --period-end 2024-06-30 \
  --entity "Sample Co, Inc." \
  --tie-to-statement examples/bs_debt_balance.csv \
  --output-xlsx /tmp/debt_footnote_q2.xlsx \
  --output-docx /tmp/debt_footnote_q2.docx
```

Produces a Q2 debt footnote with maturity schedule, weighted-average rate, and a checklist.

## References

- FASB — [ASC 470 (Debt)](https://asc.fasb.org)
- SEC — [Regulation S-X Article 5](https://www.ecfr.gov/current/title-17/chapter-II/part-210)
- AICPA — [Audit Considerations Specific to Disclosures](https://us.aicpa.org)
- KPMG — [Handbook: Long-term debt and financing arrangements](https://kpmg.com)
