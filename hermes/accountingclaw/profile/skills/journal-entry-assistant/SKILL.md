---
name: journal-entry-assistant
description: Draft and balance multi-line journal entries with COA-driven Dr/Cr logic and ERP-ready upload templates
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, journal-entry, erp]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Journal Entry Assistant

Convert structured source data (or a description of intended postings) into balanced, ERP-ready journal entries using a Chart-of-Accounts-driven Dr/Cr engine with fuzzy account matching, multi-line balancing, period and account-active validation, and ERP-specific upload templates.

---

## Overview

| | |
|---|---|
| **Target user** | Staff / Senior Accountant drafting recurring and one-off JEs |
| **Maturity** | Production for the mechanical part (mapping, balancing, formatting); judgment-supported for natural-language interpretation |
| **What it does** | Maps source rows to GL accounts via the Chart of Accounts; applies type-correct Dr/Cr signs; balances multi-line entries; validates against period-open and account-active rules; emits an ERP upload CSV and an XLSX preparer workpaper |
| **What it does NOT do** | Post to the GL (drafts only); replace tax-effected provision entries (see [tax-provision-calculator](../tax-provision-calculator/SKILL.md)); generate complex consolidation eliminations (see [intercompany-elimination-bot](../intercompany-elimination-bot/SKILL.md)) |

## When to use

- Drafting recurring accrual entries (rent, utilities, payroll accrual, prepaid amortization)
- Converting a manager's request ("accrue $500 legal fees from Smith & Co for May") into a balanced entry
- Bulk-creating reclass entries from a spreadsheet of corrections
- Building upload files for NetSuite / Workday / Sage Intacct / Oracle Fusion

## When NOT to use

- Routine system-generated entries (AP, AR, payroll provider) — those are sub-ledger to GL, use the dedicated reconciler skill instead
- Fair-value remeasurement, hedge accounting, lease ROU postings — those require specialist judgment outside this skill's COA matcher
- Tax provision JEs — use [tax-provision-calculator](../tax-provision-calculator/SKILL.md) which knows about DTAs/DTLs

## Authoritative sources

- **ASC 105** — General principles
- **ASC 250** — Accounting changes and error corrections (relevant for prior-period adjustments)
- **AICPA Code of Conduct §1.300** — Documentation requirements for accounting estimates
- **SOX 404** — Adequate documentation and approval of JEs is a Key Control

## Inputs

### 1. Source transactions — `--source <path>` (required)

CSV or XLSX. Required columns (case-insensitive):

| Column | Type | Notes |
|---|---|---|
| `date` | date | Effective date of the entry |
| `description` | string | Natural-language description (used for fuzzy COA matching if `account` is blank) |
| `amount` | float | Signed gross amount. Sign convention: positive = increase the natural account-type direction (debit Asset/Expense, credit Liability/Equity/Revenue). |

Optional: `account` (account_code OR name; if blank, the script fuzzy-matches `description` against the COA), `memo`, `entity`, `department`, `class`, `project`, `dr_cr` (explicit override).

### 2. Chart of Accounts — `--coa <path>` (required)

CSV/XLSX. Required columns:

| Column | Type | Notes |
|---|---|---|
| `account_code` | string | Unique code (e.g., `1000`, `6500-100`) |
| `account_name` | string | Human-readable name |
| `type` | string | One of: `Asset`, `Liability`, `Equity`, `Revenue`, `Expense`, `Other` |

Optional: `is_active` (bool, default True), `period_open_through` (date — entries dated after this fail validation), `requires_class` (bool).

### 3. Parameters

| Flag | Default | Description |
|---|---|---|
| `--je-date` | required | Effective period date (YYYY-MM-DD) |
| `--memo` | "" | JE-level memo / batch label |
| `--erp` | `generic` | Output flavor: `generic` / `netsuite` / `workday` / `sage_intacct` |
| `--cash-account` | `1000` | Offset account for entries supplied as one-sided lines |
| `--suspense-account` | `9999` | Where un-balanceable plug lines go (FAIL status) |
| `--similarity-threshold` | `70` | RapidFuzz score (0-100) required for description-only COA matching |
| `--output-csv` | required | ERP upload CSV path |
| `--output-xlsx` | required | Preparer workpaper XLSX path |
| `--strict` | False | Treat any validation warning as a FAIL |

## Workflow

```
1. LOAD & VALIDATE
   - Parse Source and COA
   - Coerce types; reject NaN amounts; standardize account_code casing
2. ACCOUNT RESOLUTION (per source row)
   IF row.account is provided:
       resolve by code → then by exact name → then fuzzy name
   ELSE:
       fuzzy-match row.description against COA.account_name (token_set_ratio)
       require similarity >= threshold; else mark line for Suspense
3. DR/CR ASSIGNMENT
   IF row.dr_cr explicitly set: use it
   ELSE based on COA.type:
       Asset / Expense:                  amount > 0 → Debit;  amount < 0 → Credit
       Liability / Equity / Revenue:     amount > 0 → Credit; amount < 0 → Debit
       Other:                            sign-of-amount → side
4. BALANCING
   total_debit = sum(Debit)
   total_credit = sum(Credit)
   IF |total_debit - total_credit| <= 0.01: balanced
   ELSE:
       IF a cash/offset account is implied (e.g., single-sided source) → auto-generate offset to --cash-account
       ELSE add a balancing line to --suspense-account and flag FAIL
5. VALIDATION
   - account.is_active == True
   - row.date <= account.period_open_through (where set)
   - if account.requires_class then row.class is not blank
   - amount != 0 (zero-value lines rejected)
6. ERP FORMATTING
   Apply the upload template for --erp:
     netsuite:    columns = ExternalId, TranDate, Account, Memo, Debit, Credit, Department, Class, Location
     workday:     columns = JE_Number, Line_No, Date, Ledger_Account, Cost_Center, Debit, Credit, Memo
     sage_intacct:columns = BATCH_NO, RECORDNO, ENTRY_DATE, ACCOUNTNO, MEMO, DEBIT, CREDIT, DEPARTMENTID, CLASSID
     generic:     columns = Date, Account, Description, Debit, Credit, Memo, Class, Department
7. ARTIFACTS
   - CSV upload file (--output-csv)
   - XLSX preparer workpaper (--output-xlsx) with sheets:
       Summary | Lines | Validation | BSImpact | PLImpact | AuditTrail | SignOff
```

## Edge cases

| Scenario | Handling |
|---|---|
| **One-sided source** (e.g., a list of expenses, no offsetting cash line) | If `--cash-account` is set, auto-generate the offset against the cash account. JE balances; flagged as `auto-offset` in audit trail. |
| **Amount sign opposite of natural** (e.g., negative expense for a refund) | Honored: negative expense → credit (reverses the normal expense increase) |
| **Account match ambiguous** | If top two fuzzy matches differ by ≤2 points, mark line as `ambiguous`, route to Suspense, FAIL. Preparer must specify. |
| **Closed period** | If `row.date > account.period_open_through`, validation FAIL; line still drafted but flagged in `Validation` sheet. |
| **Inactive account** | Drop line, route to Suspense with `account inactive` warning. |
| **Zero-amount lines** | Rejected; reported in `Validation`. |
| **Multi-entity / department dimensions** | Pass-through to ERP columns; missing required dimension → FAIL per `requires_class`. |

## Anti-patterns (DO NOT)

- **DO NOT** post the JE — this script writes a draft for human review only
- **DO NOT** silently absorb an imbalance into Suspense and call it a PASS — Suspense lines always FAIL
- **DO NOT** override Dr/Cr based on the description text (e.g., guessing "expense" from words) — let the COA `type` drive the sign
- **DO NOT** match accounts by partial string contains (e.g., `Sales` would match `Sales Tax Payable` and `Sales Revenue`) — always use token-set fuzzy ratio with a similarity floor
- **DO NOT** assume the cash side; require `--cash-account` explicitly when consuming a one-sided source

## Outputs

### 1. ERP upload CSV — `<output-csv>`

ERP-specific column order. Each line is a single Dr or Cr; the file is balanced (total Dr = total Cr).

### 2. Preparer workpaper XLSX — `<output-xlsx>`

| Sheet | Contents |
|---|---|
| `Summary` | JE label, date, memo, total Dr / Cr / status, line count, total impact on BS / PL |
| `Lines` | Each Dr/Cr line with account code, name, memo, dimensions, source row reference |
| `Validation` | Any line that failed a validation rule (closed period, inactive account, ambiguous match, suspense routing) |
| `BSImpact` | Net effect on each balance-sheet account |
| `PLImpact` | Net effect on each P&L account |
| `AuditTrail` | Parameters, similarity threshold, source / COA row counts, match counts, timestamp |
| `SignOff` | Preparer / Reviewer / Approver lines |

## Quality gates (human review checklist)

1. [ ] JE is balanced (total Dr = total Cr) **and** no line is in Suspense
2. [ ] Every account exists, is active, and the period is open
3. [ ] Required dimensions (entity, dept, class) are populated for every line where the account requires them
4. [ ] Description and memo on each line are sufficient for an auditor to understand the rationale
5. [ ] Reviewer is not the Preparer (segregation of duties / SOX)
6. [ ] If any line was routed via fuzzy matching with similarity < 90, Preparer has explicitly confirmed the account
7. [ ] BS/PL impact totals match the Preparer's expectation

## Worked example

Input — `examples/source_transactions.csv` contains 4 rows: $150 office supplies / $-150 cash; $45.50 client lunch / $-45.50 cash.

Running the script:

```bash
python scripts/je_draft.py \
  --source examples/source_transactions.csv \
  --coa    examples/coa.csv \
  --je-date 2024-05-31 \
  --memo "May AP reclass batch" \
  --erp generic \
  --output-csv  /tmp/je_may2024.csv \
  --output-xlsx /tmp/je_may2024_workpaper.xlsx
```

Produces:

- 4 lines, balanced: $195.50 total Dr (Office Expense + Meals & Entertainment) = $195.50 total Cr (Cash twice)
- Status: PASS
- BS impact: Cash −$195.50
- PL impact: Office Expense +$150.00; Meals & Entertainment +$45.50

## References

- AICPA — [Audit Considerations for Journal Entries](https://us.aicpa.org)
- PCAOB AS 2401 — [Consideration of Fraud in a Financial Statement Audit](https://pcaobus.org/oversight/standards/auditing-standards/details/AS2401) (JEs are the #1 fraud vector)
- NetSuite — [Journal Entries CSV Import](https://docs.oracle.com/en/cloud/saas/netsuite/)
- Workday — [Journal Entry Web Service](https://doc.workday.com)
