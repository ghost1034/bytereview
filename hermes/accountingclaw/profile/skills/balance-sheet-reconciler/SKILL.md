---
name: balance-sheet-reconciler
description: Reconcile a GL account to supporting documentation with roll-forward, aging, and fuzzy matching
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, reconciliation, close]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Balance Sheet Reconciliation Reviewer

Automate the periodic reconciliation of a general ledger (GL) account to its supporting documentation, producing a workpaper-quality reconciliation with roll-forward, aging, fuzzy unmatched-item matching, and a Pass/Fail status.

---

## Overview

| | |
|---|---|
| **Target user** | Senior Accountant preparing month-end recs; Controller / Audit reviewer |
| **Maturity** | Production (mechanical part); judgment-supported (root-cause explanation) |
| **What it does** | Compares GL ending balance to support (bank statement, sub-ledger, schedule); identifies and ages reconciling items; produces XLSX workpaper |
| **What it does NOT do** | Post adjusting JEs (drafts only); replace bank-statement OCR (consumes already-parsed CSV); reconcile non-cash items requiring SME judgment (e.g., legal accruals) |

## When to use

- Month-end / quarter-end / year-end close of any balance sheet account with external support (Cash, AR, AP, Prepaid, Accrued Liabilities, Deferred Revenue)
- Pre-audit "lead sheet" preparation
- Investigating a suspected misposting where the GL balance disagrees with the operational system

## When NOT to use

- Income statement accounts (use [flux-variance-analyst](../flux-variance-analyst/SKILL.md))
- Intercompany account pairs (use [intercompany-elimination-bot](../intercompany-elimination-bot/SKILL.md))
- Fixed asset accounts (use [fixed-asset-lifecycle-manager](../fixed-asset-lifecycle-manager/SKILL.md))
- Investment portfolio mark-to-market (requires fair-value methodology outside scope)

## Authoritative sources

- **PCAOB AS 2305** — Substantive analytical procedures (this is the auditor's view of what a "good" rec looks like)
- **AICPA AU-C §330** — Audit evidence and tests of details
- **COSO ICFR Framework** — Reconciliations are a key preventive/detective control
- **SEC Staff Accounting Bulletin No. 99 (SAB 99)** — Materiality — qualitative factors matter, not just dollars

## Inputs

### 1. GL export — `--gl <path>` (required)

CSV or XLSX. Required columns (case-insensitive):

| Column | Type | Notes |
|---|---|---|
| `date` | date (YYYY-MM-DD) | Transaction posting date |
| `description` | string | GL line description |
| `amount` | float | Signed; positive = debit, negative = credit |

Optional: `je_id`, `source_system`, `reference`.

### 2. Support schedule — `--support <path>` (required)

Same schema as GL. Examples: bank statement converted to CSV, AR sub-ledger detail, prepaid amortization schedule.

### 3. Prior period reconciliation — `--prior <path>` (optional)

XLSX from a prior run of this script. Used to track roll-forward items (items that were reconciling last period and should have cleared this period).

### 4. Parameters

| Flag | Default | Description |
|---|---|---|
| `--materiality` | `5000` | Absolute USD threshold below which un-matched items are aggregated |
| `--match-tolerance-usd` | `0.01` | Amount tolerance for fuzzy matching |
| `--match-tolerance-days` | `3` | Date tolerance for fuzzy matching |
| `--description-similarity` | `0.80` | RapidFuzz token_sort_ratio threshold (0.0–1.0) |
| `--as-of` | required | Reconciliation date (YYYY-MM-DD) for aging buckets |
| `--account` | "" | Account label printed on the workpaper |
| `--output` | required | XLSX output path |

## Workflow

```
1. LOAD & VALIDATE
   - Read GL and Support; coerce dtypes; validate required columns
   - Reject rows with NaN in `amount` or invalid dates
2. BALANCE COMPARISON
   - gl_total = sum(GL.amount)
   - support_total = sum(Support.amount)
   - variance = gl_total - support_total
3. EXACT MATCH PASS
   - Inner-merge GL ⨝ Support on (rounded amount, exact date)
   - Mark matched rows on both sides
4. FUZZY MATCH PASS (on remaining unmatched rows)
   - For each unmatched GL row:
       - Find candidate Support rows where:
           |gl.amount - sup.amount| <= match-tolerance-usd
           |gl.date - sup.date|     <= match-tolerance-days
       - Among candidates, pick highest description-similarity (rapidfuzz.token_sort_ratio)
       - If similarity >= description-similarity threshold → match
5. AGING (on remaining unmatched)
   - For each unmatched item, age = as_of - item.date
   - Bucket: 0-30 / 31-60 / 61-90 / >90
6. ROLL-FORWARD (if prior provided)
   - Diff prior open items vs. current open items
   - Identify "cleared", "still-open", "newly-open"
7. STATUS DETERMINATION
   - PASS if |variance| <= materiality AND no unmatched item > materiality AND no item aged >90
   - FAIL otherwise
8. WORKPAPER GENERATION
   - Write multi-sheet XLSX (Summary / Detail / Unmatched / Aging / RollForward / AuditTrail / SignOff)
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Timing differences** (e.g., deposit in transit) | Caught by fuzzy match within tolerance; if outside tolerance but description matches a known pattern (`/deposit in transit|outstanding check/i`), flag as "Reconciling - Timing" rather than "Exception" |
| **One-to-many split** (one bank credit funds several GL postings) | Aggregate same-date GL postings by description and amount-sum before matching |
| **Reversed sign convention** | If support is a bank statement, credits to the bank = debits to GL Cash. Skill auto-detects via majority-sign heuristic and applies a `--flip-support` flag |
| **Stale opening balance** | If GL opening != Support opening, surface as a `RollForward` exception — never silently absorb into the variance |
| **Duplicate detection** | If two GL rows have identical date+amount+description, flag both (the rec passes but the underlying GL may be wrong) |

## Anti-patterns (DO NOT)

- **DO NOT** auto-post adjusting entries — every reconciling item is human-reviewed and either booked or aged
- **DO NOT** absorb unexplained variance into a "plug" line — that defeats the control
- **DO NOT** mark a rec PASS if any item is aged >90 days, even if the net variance is zero (per SAB 99 qualitative factor)
- **DO NOT** rely on the description-similarity match if the amount differs by more than the tolerance — same description but different amounts is almost always a different transaction

## Outputs

### Workpaper XLSX — `<output>.xlsx`

| Sheet | Contents |
|---|---|
| `Summary` | Account label, as-of date, GL balance, Support balance, Variance, Status (PASS/FAIL), Materiality, count of unmatched items by bucket |
| `Detail` | All GL and Support rows side-by-side with `match_status` column (matched-exact / matched-fuzzy / unmatched) |
| `Unmatched` | Two sections: "In GL not in Support" and "In Support not in GL", with amount, date, age (days), aging bucket |
| `Aging` | Aging bucket totals (0-30 / 31-60 / 61-90 / >90) with sub-totals by source side |
| `RollForward` | Prior open / Cleared / Still open / Newly open (if `--prior` supplied) |
| `AuditTrail` | Run parameters, input file paths, input row counts, match counts, materiality, status thresholds, timestamp |
| `SignOff` | Preparer / Reviewer / Approver lines (3 rows, 4 columns: Name / Title / Date / Notes) |

Conditional formatting: amount columns use accounting style `'#,##0.00;(#,##0.00)'`; the Variance cell on `Summary` turns red if outside materiality; aging bucket >90 highlights red.

## Quality gates (human review checklist)

Reviewer must verify before signing off:

1. [ ] GL balance ties to Trial Balance for the period
2. [ ] Support is the *authoritative* source (e.g., actual bank statement, not a manager's email)
3. [ ] All unmatched items have a written explanation in the `Notes` column
4. [ ] No item aged >90 days without explicit Controller approval
5. [ ] Items > materiality have a clear next action (book / write off / investigate)
6. [ ] Sign-off block is completed by Preparer and Reviewer (different people)

## Worked example

GL has 3 rows totalling $1,300; Support has the same 3 rows. The reconciler reports:

- GL Balance: $1,300.00
- Support Balance: $1,300.00
- Variance: $0.00
- Exact Matches: 3 / 3 GL rows
- Status: **PASS**

Now suppose we corrupt the support so the "Vendor Payment" is dated `2024-05-23` instead of `2024-05-20`. Even though the date differs, fuzzy match catches it (3-day tolerance, exact amount, exact description) and the rec still passes.

Now suppose the Vendor Payment in support is `$200` but in the GL it is `$250`. The amount tolerance ($0.01) is exceeded, so it shows up in the `Unmatched` sheet. If the $50 difference exceeds materiality, the rec is **FAIL**.

## References

- AICPA — [Reconciliation as a Control Activity (Practice Aid)](https://us.aicpa.org/interestareas/forensicandvaluation)
- PCAOB — [AS 2305: Substantive Analytical Procedures](https://pcaobus.org/oversight/standards/auditing-standards/details/AS2305)
- SEC — [SAB 99 — Materiality](https://www.sec.gov/interps/account/sab99.htm)
- BlackLine — [Reconciliation maturity model](https://www.blackline.com/) (industry benchmark for control standards)
