---
name: expense-policy-reviewer
description: Audit T&E reports against policy with category limits, missing-receipt and duplicate detection, and risk scoring
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, expense, controls]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Expense Policy Reviewer

Audit employee Travel & Entertainment (T&E) expense reports against corporate policy using a configurable rule engine — per-category limits, missing-receipt detection, duplicate detection across employees and reports, prohibited categories, weekend/personal-use heuristics, and a per-report risk score with audit-ready exception output.

---

## Overview

| | |
|---|---|
| **Target user** | AP Manager, Internal Audit, Finance Business Partner |
| **Maturity** | Production (rule engine + duplicate detection); judgment-supported (rationale for "vague business purpose" or "personal vs. business" calls) |
| **What it does** | Loads expense lines + corporate policy → evaluates each line against per-category rules → detects duplicates within a report and across employees → produces a risk-scored exception XLSX with reviewer-ready commentary |
| **What it does NOT do** | Replace the corporate card / expense system workflow; pull receipt OCR (consume the data the expense tool already parsed); enforce personal-tax classification (e.g., taxable fringe benefit determinations) |

## When to use

- Weekly / monthly review of submitted expense reports before approval
- Sample-based testing for SOX 404 (T&E is often an in-scope cycle)
- Quarterly internal-audit review of T&E spend
- Onboarding a new corporate policy — sanity-check applied to existing data
- Identifying outlier employees or vendors for deeper investigation

## When NOT to use

- Procurement card (P-Card) reviews where there's no employee submitter (use AP exception reviewer)
- Vendor invoice reviews (use AP exception reviewer)
- Salary / payroll-related "expenses" (different control)
- One-off CEO travel waivers (handle as a separate exception process)

## Authoritative sources

- **IRC §62 / §162** — Accountable plan rules / ordinary and necessary business expense
- **IRS Pub 463** — Travel, gift, and car expenses (substantiation requirements)
- **SOX 404** — T&E is part of expense-cycle controls
- **ACFE** — Expense reimbursement schemes (asset-misappropriation taxonomy)
- **Internal Corporate T&E Policy** — Primary authority for limits

## Inputs

### 1. Expense data — `--expenses <path>` (required)

CSV/XLSX. Required columns:

| Column | Type | Notes |
|---|---|---|
| `report_id` | string | Submission ID |
| `employee_id` | string | |
| `employee_name` | string | |
| `expense_date` | date | |
| `category` | string | Meal / Lodging / Airfare / Ground / Entertainment / Office Supplies / Other |
| `amount` | float | |
| `currency` | string | (default USD) |
| `vendor` | string | Where it was incurred |
| `description` | string | Business purpose |
| `has_receipt` | bool | |
| `attendees` | string | Optional, semicolon-separated names for meals/entertainment |

### 2. Policy — `--policy <path>` (required)

YAML/JSON describing per-category rules. Example:

```yaml
receipt_required_above: 25.00          # USD
prohibited_categories: [Alcohol, Personal]
require_attendees_for: [Meal, Entertainment]
require_business_purpose_min_chars: 12
weekend_review: warn                    # warn / fail / off
duplicate_window_days: 14
limits:
  Meal:          { daily_per_attendee: 75.00,  warn_above: 50.00 }
  Lodging:       { per_night: 350.00 }
  Airfare:       { round_trip_domestic: 800.00,  international: 5000.00 }
  Entertainment: { per_event_per_attendee: 100.00 }
  Ground:        { per_day: 100.00 }
```

### 3. Parameters

| Flag | Default | Description |
|---|---|---|
| `--period-end` | required | YYYY-MM-DD |
| `--output` | required | XLSX |
| `--cross-employee-duplicates` | True | Detect duplicate receipts submitted across employees |

## Workflow

```
1. LOAD & VALIDATE
2. RULE EVALUATION (per expense line)
   - Receipt required: amount > receipt_required_above AND has_receipt = False → FAIL
   - Prohibited category → FAIL
   - Attendees missing for Meal/Entertainment → WARN
   - Business purpose < min_chars → WARN
   - Weekend date → WARN (configurable to FAIL)
   - Category limit:
       - Meal daily_per_attendee × attendee_count: if amount per attendee > daily_per_attendee → FAIL
       - Lodging per_night: amount > limit → FAIL
       - Airfare: amount > round_trip_domestic or international → WARN
       - Entertainment per_event_per_attendee: amount per attendee > limit → FAIL
3. DUPLICATE DETECTION
   - Within report: same date+category+amount±0.01 within report_id → FAIL
   - Across reports same employee: same date+category+amount within duplicate_window_days → WARN
   - Across employees: same date+category+amount+vendor within window → FAIL (same receipt submitted twice)
4. RISK SCORING (per report)
   - severity weights: FAIL=10 / WARN=3
   - report_score = sum of triggered line severities
   - bucket: Critical (≥30) / High (15–29) / Medium (5–14) / Low (<5)
5. ARTIFACT
   - XLSX: Summary / Reports / ExceptionLines / Duplicates / EmployeeRisk / AuditTrail / SignOff
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Team dinner with 8 attendees, $750 total** | $750/8 = $93.75 per attendee → over $75 limit → FAIL (unless policy override) |
| **Recurring monthly subscription on a personal card** | Usually `Other` category; policy may allow with documented business case — flag as WARN |
| **Foreign currency** | Convert to USD at expense_date FX rate (if FX file supplied) before applying limits; default conversion 1:1 if missing → WARN |
| **Receipt for $25.01** (just above threshold) | Threshold is inclusive; $25.01 requires receipt |
| **Weekend conference** | Justified business purpose; weekend rule is `warn` not `fail` so reviewer can dispose |
| **Tip-included meals** | The submitted amount is whatever the employee submits; limits compare against gross amount; if employee splits tip across two lines, near-duplicate detector catches it |
| **Manager-approved exception** | If column `policy_exception_approval` is populated, downgrade severity from FAIL to WARN |

## Anti-patterns (DO NOT)

- **DO NOT** silently approve sub-limit charges — log the full evaluation
- **DO NOT** use "category contains" string matching — use exact case-insensitive match (and let the user normalize their data)
- **DO NOT** auto-deny reports — the script flags; the AP Manager approves/denies
- **DO NOT** alert on a single weekend transaction without context — pattern of weekend spend is more meaningful
- **DO NOT** include personal-card transactions if they're not the company's responsibility (data minimization)

## Outputs

### XLSX

| Sheet | Contents |
|---|---|
| `Summary` | Report count, exception line count by severity, total dollars under review, total dollars flagged |
| `Reports` | One row per `report_id` with risk score, bucket, line count, flagged-line count |
| `ExceptionLines` | Each violating line with triggered rule(s), severity, USD amount |
| `Duplicates` | Pairs of suspected duplicates (cross-report and cross-employee) |
| `EmployeeRisk` | Top employees by aggregate risk score (helps identify pattern abusers) |
| `AuditTrail` | Policy file hash, expense file path, parameters, timestamp |
| `SignOff` | Preparer (AP) / Reviewer (Controller / Internal Audit) |

## Quality gates

1. [ ] Every FAIL line has a written disposition (approved exception / rejected / reclassified) before payment release
2. [ ] Duplicate pairs are dispositioned (one approved, one rejected)
3. [ ] Reports with Critical / High risk score have manager + finance approval
4. [ ] Employees with repeated violations are escalated to HR or Internal Audit
5. [ ] Policy file is the current version, with version hash logged in AuditTrail

## Worked example

`examples/expenses.csv` contains 8 expense lines across 3 employees, including a $150 entertainment line (over $100/attendee), a missing-receipt $85 line, a duplicate submission, and a weekend transaction. `examples/policy.yaml` is the corporate policy.

```bash
python scripts/expense_auditor.py \
  --expenses examples/expenses.csv \
  --policy examples/policy.yaml \
  --period-end 2024-05-31 \
  --output /tmp/expense_review_may.xlsx
```

Produces a risk-scored report with 4 exception lines and 1 duplicate.

## References

- IRS — [Publication 463: Travel, Gift, and Car Expenses](https://www.irs.gov/forms-pubs/about-publication-463)
- ACFE — [Occupational Fraud and Abuse Classification (Expense Reimbursement Schemes)](https://www.acfe.com)
- SHRM — [T&E Policy Best Practices](https://www.shrm.org)
