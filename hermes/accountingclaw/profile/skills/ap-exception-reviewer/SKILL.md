---
name: ap-exception-reviewer
description: Detect duplicate invoices, coding inconsistencies, three-way-match exceptions, and approval-limit breaches
version: 0.1.0
metadata:
  hermes:
    tags: [accounting, ap, controls]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# AP Exception Reviewer

Scan an accounts-payable ledger for control exceptions: duplicate invoices, coding inconsistencies, three-way-match failures, approval-limit breaches, terms anomalies, and vendor-master red flags. Produces a risk-scored exception report ready for AP Manager review.

---

## Overview

| | |
|---|---|
| **Target user** | AP Manager, Internal Audit, Controller |
| **Maturity** | Production (rule-based detection); detection findings still require human disposition |
| **What it does** | Loads an AP ledger (and optional PO + vendor master + payment-terms files); flags duplicates (exact / near-duplicate / split-invoice patterns), coding inconsistencies, three-way-match exceptions, approval-limit breaches, weekend payments, round-dollar invoices, and vendor-master integrity issues |
| **What it does NOT do** | Block payments (read-only review); replace OCR for invoice extraction (consumes already-parsed CSV); detect collusive fraud requiring forensic analysis |

## When to use

- Weekly review of the payment run before approval / release
- Month-end "duplicate sweep" before close
- Pre-audit AP testing (auditors will use Benford-style and duplicate analytics)
- Onboarding a new vendor batch — sanity-check coding before recurring postings begin

## When NOT to use

- Routine invoice approval workflow (use the AP module of the ERP)
- Three-way match where PO data is unstructured / not provided (this script requires PO CSV input)
- Fraud investigation requiring forensic accounting (escalate)

## Authoritative sources

- **COSO ICFR** — Segregation-of-duties and approval-authority controls
- **SOX 404** — AP cycle controls (vendor master, payment release, three-way match)
- **PCAOB AS 2401** — Fraud risk in AP cycle (duplicate / split / shell-vendor patterns)
- **AICPA Audit Sampling Guide** — Detection threshold tuning
- **IRS Form 1099-NEC instructions** — Vendor master TIN validation

## Inputs

### 1. AP ledger — `--ledger <path>` (required)

CSV/XLSX. Required columns:

| Column | Type | Notes |
|---|---|---|
| `invoice_no` | string | Vendor invoice number (used for duplicate detection) |
| `vendor` | string | Normalized vendor name |
| `amount` | float | Invoice amount in functional currency |
| `date` | date | Invoice date |
| `account` | string | GL coding |

Optional: `vendor_id`, `po_number`, `terms`, `due_date`, `pay_date`, `approver`, `currency`, `category`, `payment_method`.

### 2. PO file — `--pos <path>` (optional, enables 3-way match)

| Column | Type |
|---|---|
| `po_number` | string |
| `vendor` | string |
| `po_amount` | float |
| `po_date` | date |
| `received` | bool |

### 3. Vendor master — `--vendors <path>` (optional)

| Column | Type | Notes |
|---|---|---|
| `vendor` | string | |
| `vendor_id` | string | |
| `tin` | string | TIN/EIN (validated format only) |
| `address` | string | |
| `bank_account` | string | Used to flag shared bank account with other vendors (shell vendor red flag) |
| `is_active` | bool | |
| `is_1099` | bool | |

### 4. Parameters

| Flag | Default | Description |
|---|---|---|
| `--duplicate-window-days` | `45` | Look-back window for near-duplicate detection |
| `--amount-tolerance-pct` | `0.005` | Allowable %-difference for "near-duplicate" |
| `--split-threshold-usd` | `10000` | Below this is a candidate for split-invoice avoidance of an approval limit |
| `--approval-limit-usd` | `10000` | If `approver` is blank and amount > this → flag |
| `--three-way-tolerance-pct` | `0.05` | PO-vs-invoice amount tolerance |
| `--weekend-payment-flag` | True | Flag payments dated on Sat/Sun (weak control) |
| `--round-dollar-threshold` | `1000` | Flag round-dollar amounts >= this with no decimals (fraud heuristic) |
| `--output` | required | XLSX exception report |

## Workflow

```
1. LOAD & VALIDATE
2. NORMALIZE
   - vendor: trim, casefold, strip ",.- ", optional rapidfuzz cluster
   - invoice_no: strip leading zeros, trim, casefold
3. EXACT-DUPLICATE DETECTION
   - groupby (vendor_norm, invoice_no_norm, amount_round)
   - any group size > 1 → flag all rows in group
4. NEAR-DUPLICATE DETECTION
   - For each (vendor_norm, amount-tolerance, ±duplicate-window-days), find pairs with:
       - same vendor, amount within tolerance, date within window
       - different invoice_no (otherwise it's exact-dup)
5. SPLIT-INVOICE DETECTION (approval avoidance)
   - For each vendor, find clusters of invoices each < split-threshold dated within 14 days
     whose sum > 2*split-threshold → flag
6. CODING INCONSISTENCY
   - per vendor (vendor_norm): if # distinct accounts > 1, flag with the account list
7. THREE-WAY MATCH (if PO file provided)
   - for each invoice with po_number: PO must exist, vendor must match, received=True,
     |amount - po_amount| <= tolerance
8. APPROVAL-LIMIT BREACH
   - amount > approval-limit AND approver blank → flag
9. WEEKEND PAYMENT (if pay_date present)
10. ROUND-DOLLAR HEURISTIC
    - amount mod 1.00 == 0 AND amount >= round-dollar-threshold → low-severity flag
11. TERMS ANOMALIES (if terms / due_date present)
    - terms says "Net 30" but due_date < invoice_date + 25 days → mis-typed terms
12. VENDOR MASTER INTEGRITY (if vendor master provided)
    - active=False vendors with new invoices → flag
    - shared bank_account across vendors → flag (shell-vendor red flag)
    - missing TIN for 1099 vendors → flag (1099 reporting risk)
13. RISK SCORING
    - per-exception severity weights: duplicate=10 / split=8 / 3-way fail=7 / coding=5 /
      no approver=8 / weekend=2 / round-dollar=3 / vendor integrity=9
    - per-invoice score = sum of triggered severities; bucket: low / medium / high / critical
14. ARTIFACT
    - XLSX: Summary / Exceptions / Duplicates / Splits / ThreeWayFail / VendorIntegrity /
            CodingConsistency / AuditTrail / SignOff
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Same invoice number reused across years** | Date is part of the duplicate key, so re-using "INV-001" in 2024 vs 2025 won't false-positive |
| **Credit memos** | Treated as negative invoices; duplicate detection compares absolute value, but flags the credit memo column so reviewer sees they net |
| **Vendor name variations** ("ACME Corp" vs "Acme Corporation") | RapidFuzz clustering by `token_set_ratio >= 90` merges them into a single canonical vendor for detection (preserves original name in output) |
| **Foreign currency** | If `currency` column present, exceptions are limited to within-currency comparisons (don't compare USD vs EUR) |
| **Recurring identical invoices** (e.g., monthly rent) | Same amount + same vendor every month is legitimate. Mitigation: only flag near-duplicates within 45 days; for recurring postings, the reviewer can add a `recurring=True` annotation column in the source data |
| **Pre-payment / deposit invoices** | If a vendor has a `Deposit` line and a `Final Invoice` line, the amounts may overlap. Add `category` filtering so the reviewer disambiguates |

## Anti-patterns (DO NOT)

- **DO NOT** block payments programmatically — this is a review tool
- **DO NOT** auto-resolve a "near-duplicate" — even if probability is 99%, a human must dispose
- **DO NOT** flatten the risk score into a binary pass/fail — surface all triggered rules so the reviewer can see *why*
- **DO NOT** require fields that the ERP doesn't export (PO, approver, etc.) — gracefully degrade with `--pos` / `--vendors` optional
- **DO NOT** false-positive on amount-only matches without considering date proximity

## Outputs

### Exception report XLSX

| Sheet | Contents |
|---|---|
| `Summary` | Counts by severity bucket, top-10 highest-risk invoices, total dollars exposed |
| `Exceptions` | Every flagged invoice with all triggered rules in a `triggers` column and a numeric `risk_score` |
| `Duplicates` | Pairs/groups of duplicate or near-duplicate invoices |
| `Splits` | Vendor + date-cluster details for split-invoice detection |
| `ThreeWayFail` | Each invoice failing PO/vendor/received/amount checks |
| `VendorIntegrity` | Inactive-vendor activity / shared bank accounts / missing TINs |
| `CodingConsistency` | Vendors coded to multiple accounts with the account distribution |
| `AuditTrail` | Parameters, row counts by check, timestamp |
| `SignOff` | Preparer / Reviewer lines |

## Quality gates (human review checklist)

1. [ ] Every Critical-bucket exception has a written disposition before payment release
2. [ ] Three-way-match failures are reconciled to the PO before approval
3. [ ] Vendor master red flags are escalated to the Treasury / Compliance team
4. [ ] Round-dollar invoices over $50K have a documented business reason
5. [ ] Split-invoice clusters are reviewed with the requesting business owner
6. [ ] Coding inconsistencies are either explained (legitimate multi-account vendor) or corrected via reclass JE

## Worked example

The bundled `examples/ap_ledger.csv` contains 7 rows including:

- 2 invoices from `ACME Corp` for `$500` dated 4 days apart → near-duplicate flagged
- `Stellar Services` $1,200 coded to BOTH `Consulting` and `Travel` → coding inconsistency
- `Global Tech` $300 with same invoice number 25 days apart but different invoice_no values

Running:

```bash
python scripts/ap_review.py \
  --ledger examples/ap_ledger.csv \
  --output /tmp/ap_exceptions_may2024.xlsx
```

Produces a risk-scored exception report. Status: **FAIL** (because high-severity duplicates exist).

## References

- ACFE — [Occupational Fraud and Abuse Classification System (Disbursement schemes)](https://www.acfe.com)
- PCAOB AS 2401 — [Consideration of Fraud](https://pcaobus.org/oversight/standards/auditing-standards/details/AS2401)
- AICPA — [SAS 145: Identifying and Assessing the Risks of Material Misstatement](https://us.aicpa.org)
- IRS — [Form 1099-NEC TIN matching program](https://www.irs.gov/tax-professionals/taxpayer-identification-number-tin-matching)
