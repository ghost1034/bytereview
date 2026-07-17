---
name: payroll-gl-reconciler
description: Tie payroll register to GL by component and analyze provider-versus-GL variance
version: 0.1.0
metadata:
  hermes:
    tags: [accounting, payroll, reconciliation]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Payroll GL Reconciler

Tie the payroll provider's register (ADP / Gusto / Workday / Rippling) to General Ledger postings by component — gross pay, ER taxes, EE taxes, benefits (medical / dental / 401(k) / HSA), and net pay — and produce a department-level allocation and variance workpaper.

---

## Overview

| | |
|---|---|
| **Target user** | Payroll Accountant, Senior Accountant during close, Controller |
| **Maturity** | Production (mechanical tie-out + allocation); judgment-supported (root-cause for variances, manual gross-up entries) |
| **What it does** | Aggregates payroll register by component; tags GL postings to the corresponding component via a configurable mapping; computes variance per component per cost-center; produces an XLSX workpaper and a draft consolidated payroll JE |
| **What it does NOT do** | Replace the payroll provider's tax filings; perform §3401/§3102 employer-tax recalculations (consume provider's amounts); reclassify between W-2 and 1099 (a tax determination outside scope) |

## When to use

- Each payroll cycle (semi-monthly / biweekly) before close
- Month-end payroll close — tie register sum to GL accounts 6100, 6110, 2200, 2210, etc.
- Pre-audit lead sheet for payroll
- Investigating why a manager-reported headcount cost differs from the GL by department
- Switching payroll providers — backstop the data migration with this reconciler

## When NOT to use

- Stock-based compensation entries (ASC 718) — separate skill / specialist judgment
- Stock-option exercise tax withholding journal entries
- Fringe-benefit grossing up for tax (consult payroll tax specialist)
- Severance accruals (ASC 712-10 / ASC 420) requiring separate measurement

## Authoritative sources

- **IRC §3401 / §3402** — Federal income tax withholding obligation
- **IRC §3101 / §3111** — FICA (Social Security + Medicare) employee and employer portions
- **IRC §3301** — FUTA
- **State payroll codes** — SUTA, SDI, state income tax (per state)
- **ASC 710-10** — Compensated absences (vacation/PTO accrual)
- **ASC 715-30** — Pension and other postretirement (out of scope but cross-referenced)
- **SOX 404** — Payroll process controls

## Inputs

### 1. Payroll register — `--register <path>` (required)

CSV/XLSX, one row per employee per pay period. Required columns:

| Column | Type | Notes |
|---|---|---|
| `employee_id` | string | |
| `name` | string | |
| `pay_period_end` | date | |
| `gross_pay` | float | Total earnings before deductions |
| `er_taxes` | float | Total employer-paid taxes (FICA-ER + FUTA + SUTA) |
| `ee_fica` | float | Employee FICA withheld |
| `ee_fit` | float | Employee federal income tax withheld |
| `ee_sit` | float | Employee state income tax withheld (or 0) |
| `ee_other_taxes` | float | Other employee taxes (Medicare addl, state SDI, etc.) |
| `benefits_pretax` | float | Pre-tax deductions (medical, dental, 401(k) traditional, HSA) |
| `benefits_posttax` | float | Post-tax deductions (Roth, garnishments) |
| `net_pay` | float | Net pay deposited to employee |
| `department` | string | Cost center for allocation |

Optional: `class`, `entity`, `pay_period_begin`, `regular_hours`, `ot_hours`, `bonus`, `commission`, `er_401k_match`, `er_health_contribution`.

**Tie-out invariant**: For each row, `gross_pay - ee_fica - ee_fit - ee_sit - ee_other_taxes - benefits_pretax - benefits_posttax = net_pay` (validated by the script).

### 2. GL postings — `--gl <path>` (required)

CSV/XLSX with the payroll-related GL activity for the period.

| Column | Type | Notes |
|---|---|---|
| `date` | date | |
| `account` | string | GL account code |
| `description` | string | |
| `amount` | float | Signed; positive = debit |
| `department` | string | (optional but recommended for allocation) |

### 3. GL mapping — `--mapping <path>` (required)

CSV. Maps register components to GL accounts.

| Column | Type | Notes |
|---|---|---|
| `component` | string | One of: `gross_pay`, `er_taxes`, `er_401k_match`, `er_health_contribution`, `benefits_pretax`, `benefits_posttax`, `ee_withholdings`, `net_pay` |
| `account` | string | GL account code |
| `dr_cr` | string | `Dr` or `Cr` |

### 4. Parameters

| Flag | Default | Description |
|---|---|---|
| `--period-end` | required | YYYY-MM-DD |
| `--tie-out-tolerance` | `1.00` | USD tolerance per component for PASS |
| `--output` | required | XLSX workpaper |

## Workflow

```
1. LOAD & VALIDATE
   - Read register, GL, mapping
   - Validate register row-level identity (gross - withholdings - benefits = net)
   - Mapping: every component used should have at least one account row
2. AGGREGATE REGISTER (by component)
   - reg_gross         = sum(gross_pay)
   - reg_er_taxes      = sum(er_taxes)
   - reg_ee_withhold   = sum(ee_fica + ee_fit + ee_sit + ee_other_taxes)
   - reg_benefits_pre  = sum(benefits_pretax)
   - reg_benefits_post = sum(benefits_posttax)
   - reg_net           = sum(net_pay)
3. AGGREGATE GL (by mapping)
   - For each component, sum GL.amount for the mapped accounts
   - Respect Dr/Cr sign per mapping row
4. TIE-OUT (per component)
   - variance = register_sum - gl_sum
   - status_per_component = PASS if |variance| <= tolerance else FAIL
5. DEPARTMENTAL ALLOCATION
   - Allocate gross_pay and er_taxes by department from register
   - Compare to GL department-level sums (where GL has department dimension)
6. BUILD DRAFT PAYROLL JE
   - DR  Salaries Expense (gross_pay) — by department
   - DR  ER Tax Expense (er_taxes) — by department
   - DR  ER Benefits Expense (er_401k_match + er_health_contribution) — by department
   - CR  EE Tax Withholding Liability (ee_withholdings)
   - CR  Benefits Liability (benefits_pretax + benefits_posttax)
   - CR  Cash (net_pay + ee_withholdings + er_taxes + benefits)  [or split into multiple cash lines]
   - Validate Dr == Cr; flag if not
7. ARTIFACT
   - XLSX: Summary / ComponentTieOut / DepartmentAllocation / DraftJE /
            RegisterValidation / GLDetail / AuditTrail / SignOff
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Off-cycle / manual checks** | Treated as separate register row; tie-out should still hold per row |
| **PTO accrual posting** | If `--mapping` includes a `pto_accrual` component, included; otherwise out of scope and flagged as "unmapped activity" if found in GL |
| **Imputed income (e.g., GTL > $50K)** | Increases gross pay AND a corresponding adjustment line; the register identity still holds |
| **Negative net pay** (rare; high garnishment) | Allowed; flagged in `RegisterValidation` for manual review |
| **Department reallocation** | If the same employee is split across departments in register but GL has only summary postings → flagged as "allocation requires reclass JE" |
| **Multi-state employees** | Sum ee_sit across states; provider register should already net this; tie-out unaffected |
| **401(k) match true-up** | If the period includes a year-end true-up, it inflates ER contributions; surface in `DraftJE` as a separate line |

## Anti-patterns (DO NOT)

- **DO NOT** recalculate the FICA / FIT / SIT withholdings — trust the provider; this script only ties them to GL
- **DO NOT** allocate ER taxes by a flat % — use department-level register sums
- **DO NOT** swallow a $-1.00 rounding variance silently into a balancing line; require tolerance to be explicit
- **DO NOT** post the draft JE — it's for review only
- **DO NOT** mix Dr/Cr signs in the GL aggregation — honor the mapping

## Outputs

### Workpaper XLSX

| Sheet | Contents |
|---|---|
| `Summary` | Component-by-component PASS/FAIL grid; total register vs. total GL |
| `ComponentTieOut` | Register sum / GL sum / variance / status per component |
| `DepartmentAllocation` | Gross pay + ER taxes by department per register, compared to GL departmental sums |
| `DraftJE` | Multi-line payroll JE ready for review |
| `RegisterValidation` | Any employee row where `gross − withholdings − benefits ≠ net`; or negative net |
| `GLDetail` | Period GL activity grouped by account with running totals |
| `AuditTrail` | Inputs, mapping, parameters, timestamp |
| `SignOff` | Preparer / Reviewer |

## Quality gates

1. [ ] Every component is PASS within tolerance
2. [ ] Department allocation reconciles to within $1 (rounding) for every department
3. [ ] Register row-level identity holds for 100% of rows
4. [ ] Draft JE balances (Dr = Cr)
5. [ ] Unmapped GL activity has been investigated (e.g., a stray legal-settlement posting in a payroll account)
6. [ ] Cash outflow matches the payroll provider's bank withdrawal (net pay + EE taxes + ER taxes + benefits)

## Worked example

`examples/payroll_register.csv` has 5 employees totaling ~$22,000 gross. `examples/gl_payroll_entry.csv` shows the consolidated GL postings. Running:

```bash
python scripts/payroll_reconciler.py \
  --register examples/payroll_register.csv \
  --gl       examples/gl_payroll_entry.csv \
  --mapping  examples/gl_mapping.csv \
  --period-end 2024-05-31 \
  --output /tmp/payroll_may.xlsx
```

Expected: Gross Pay tie-out PASS; ER Tax tie-out PASS; if any component fails, the script exits 2 and the workpaper shows the variance line-by-line.

## References

- IRS — [Publication 15 (Circular E) Employer's Tax Guide](https://www.irs.gov/forms-pubs/about-publication-15)
- ADP — [Payroll Reporting Best Practices](https://www.adp.com)
- ASC 710-10 — Compensated Absences
- AICPA — [Audit Considerations for Payroll Process](https://us.aicpa.org)
