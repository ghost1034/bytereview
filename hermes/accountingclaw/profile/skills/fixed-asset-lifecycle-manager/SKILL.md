---
name: fixed-asset-lifecycle-manager
description: Capitalization, depreciation (SL, DDB, MACRS), impairment, disposal, and GL roll-forward for a fixed-asset register
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, fixed-assets, depreciation]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Fixed Asset Lifecycle Manager

Manage the full lifecycle of capital assets — capitalization eligibility, depreciation (Straight-Line / Declining-Balance / MACRS half-year convention), impairment trigger checks, disposals with gain/loss, and a GAAP-tying roll-forward to the GL.

---

## Overview

| | |
|---|---|
| **Target user** | Fixed Asset Accountant, Controller |
| **Maturity** | Production (Book SL, DDB, MACRS half-year, disposal mechanics); judgment-supported (impairment trigger identification, useful-life estimates) |
| **What it does** | Reads the Fixed Asset Register (FAR); calculates per-asset monthly depreciation under multiple methods (Book vs. Tax); identifies disposals and computes gain/loss; emits depreciation JE, BS roll-forward, additions log, and an Asset Status workpaper |
| **What it does NOT do** | Section 179 / §168(k) bonus depreciation elections (call out the eligibility flag but the election itself is a tax-planning judgment); replace a Fixed Asset sub-ledger system; perform a full Step-1/Step-2 impairment test (only flags triggers per ASC 360-10-35-21) |

## When to use

- Month-end depreciation run for Book reporting
- Quarter-end roll-forward tie-out (Beg + Additions − Disposals − Depreciation = End)
- Year-end CapEx planning / tax-provision input (book-tax depreciation differences)
- Pre-audit lead sheet for the Fixed Assets cycle
- After a CapEx wave to validate capitalization eligibility before booking

## When NOT to use

- ROU / lease assets — see [lease-842-assistant](../lease-842-assistant/SKILL.md)
- Internal-use software with capitalized internal labor (ASC 350-40) — needs project-stage analysis outside scope
- Asset retirement obligations (AROs, ASC 410-20) — distinct measurement model
- Investment property under IAS 40 — different framework

## Authoritative sources

- **ASC 360-10** — Property, Plant, and Equipment
- **ASC 360-10-35-21** — Recoverability test ("triggering events")
- **ASC 350-30** — Intangible assets useful-life determination (for amortization parallels)
- **ASC 410-20** — Asset Retirement Obligations (out of scope but cross-referenced)
- **IRS Pub 946** — MACRS depreciation, useful-life class life tables
- **IRC §168** — MACRS / bonus depreciation
- **IRC §179** — Election to expense

## Inputs

### 1. Fixed Asset Register — `--far <path>` (required)

CSV/XLSX. Required columns:

| Column | Type | Notes |
|---|---|---|
| `asset_id` | string | Unique identifier (e.g., FA-001) |
| `description` | string | Asset description |
| `acquisition_date` | date | Date placed in service |
| `cost` | float | Capitalized cost basis |
| `useful_life_years` | int | Book useful life |
| `asset_class` | string | E.g., Computer Equipment, Furniture, Vehicles, Building Improvements |

Optional: `salvage_value` (default 0), `method` (`SL` / `DDB` / `MACRS-5` / `MACRS-7` etc., default `SL`), `convention` (`half-year` / `mid-quarter` / `mid-month`, default `half-year` for tangible), `disposal_date`, `disposal_proceeds`, `is_disposed` (bool), `entity`, `cost_center`, `tax_method`, `tax_life_years`, `bonus_eligible`.

### 2. Capitalization policy — `--cap-policy <path>` (optional)

CSV with thresholds by class (`asset_class`, `threshold_usd`). Default: $5,000 across the board (corporate standard).

### 3. Parameters

| Flag | Default | Description |
|---|---|---|
| `--report-date` | required | Period-end date (YYYY-MM-DD); depreciation is calculated through this date |
| `--prior-far` | none | Prior-period FAR (XLSX/CSV) — enables roll-forward |
| `--depreciation-account` | `7100` | GL account for depreciation expense |
| `--accumulated-account` | `1599` | Contra-asset GL account for accumulated depreciation |
| `--disposal-account` | `8200` | Gain/loss on disposal P&L account |
| `--method-default` | `SL` | Default if asset row has none |
| `--output` | required | XLSX output path |

## Workflow

```
1. LOAD & VALIDATE
   - Read FAR; coerce dtypes; validate required columns; reject zero-cost rows
   - Apply method-default to rows without method
2. CAPITALIZATION CHECK (informational)
   - For each asset, check cost >= threshold by class (from --cap-policy or default)
   - Flag below-threshold assets (should they have been expensed?)
3. PER-ASSET DEPRECIATION (through --report-date)
   For each asset NOT disposed:
       method = asset.method
       useful_life = asset.useful_life_years
       basis = asset.cost - asset.salvage_value
       elapsed_months = months between (acquisition_date with convention) and report_date
       capped_months = min(elapsed_months, useful_life * 12)
       IF SL:
           per_month = basis / (useful_life * 12)
           accumulated = per_month * capped_months
           current_month_expense = per_month if capped_months > 0 else 0
       IF DDB (200%-DB switching to SL):
           rate = 2 / useful_life
           run year-by-year applying max(DDB, SL-remaining) until capped
       IF MACRS-N (3/5/7/10/15/20):
           half-year convention → first-year is 50% of normal
           apply IRS MACRS percentage table for the asset's class life
           track Book vs. Tax accumulated separately
4. DISPOSALS
   - For each asset with disposal_date <= report_date:
       net_book_value = cost - accumulated_through_disposal_date
       gain_loss = disposal_proceeds - net_book_value
       Generate disposal JE:
           DR Cash (disposal_proceeds) / Accumulated Depreciation
           CR Asset Cost
           DR/CR Gain or Loss on Disposal
5. IMPAIRMENT TRIGGER FLAGS (ASC 360-10-35-21)
   - For each asset with `trigger_*` indicators (significant decrease in market price,
     significant change in use, adverse legal/regulatory, cost overruns, current-period loss
     combined with projected loss, more-likely-than-not disposal before end of useful life)
     → flag for Step 1 recoverability test (out of scope; just surface the flag)
6. ROLL-FORWARD (if --prior-far provided)
   - Beginning Cost + Additions - Disposals = Ending Cost
   - Beginning AccumDep + Current Depreciation - Disposed AccumDep = Ending AccumDep
   - Tie to GL accounts
7. ARTIFACT
   - XLSX: Summary / DepreciationDetail / DepreciationJE / AdditionsLog / Disposals /
            RollForward / ImpairmentFlags / CapitalizationCheck / BookTax / AuditTrail / SignOff
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Fully depreciated assets still in service** | NBV = salvage_value; period depreciation = 0; flagged in `DepreciationDetail` |
| **Asset placed in service mid-month** | Per convention: `half-year` (full half-year of depreciation in year 1); `mid-month` (real estate per §168(d)(2)) |
| **Trade-in / partial proceeds** | If disposal_proceeds > 0 but < NBV, loss is recognized; flag for review |
| **Partial-year acquisition** | Months elapsed honors the convention; `half-year` gives 6 months in year of acquisition regardless of actual placed-in-service date |
| **Salvage value > NBV calculation** | Depreciation stops when NBV reaches salvage value |
| **Below-threshold capitalization** | Flagged as `should_have_expensed`; entry still calculated for cleanup-JE purposes |
| **Negative useful life or cost** | Hard rejection at validation |
| **Disposal-date after report-date** | Treated as still-in-service for this period |

## Anti-patterns (DO NOT)

- **DO NOT** straight-line a MACRS asset for Book reporting (mixes Book and Tax — produces wrong DTA/DTL signals)
- **DO NOT** ignore salvage value (even if zero, store the assumption explicitly)
- **DO NOT** auto-flip a triggering event to an impairment loss — the standard requires undiscounted cash flow analysis (out of scope here)
- **DO NOT** compute book depreciation past the useful life (cap at useful_life * 12 months)
- **DO NOT** depreciate land (asset_class containing "Land" → period_expense = 0)

## Outputs

### XLSX workbook

| Sheet | Contents |
|---|---|
| `Summary` | Asset count, total cost, total accumulated, total NBV, period depreciation, gain/loss this period |
| `DepreciationDetail` | Per-asset row: cost, life, method, accumulated, period expense, NBV, days-in-service, fully-depreciated flag |
| `DepreciationJE` | Single consolidated JE: DR Depreciation Expense, CR Accumulated Depreciation (total) |
| `Disposals` | Per-disposal row: cost, accum, NBV, proceeds, gain/loss, disposal JE preview |
| `AdditionsLog` | Assets with acquisition_date in current period |
| `RollForward` | Beg + Additions − Disposals = End for both Cost and AccumDep |
| `ImpairmentFlags` | Assets with triggering events |
| `CapitalizationCheck` | Asset cost vs. policy threshold |
| `BookTax` | Per-asset Book accumulated vs. Tax (MACRS) accumulated; difference drives the deferred tax temporary |
| `AuditTrail` | Run parameters, input row counts, methods used, timestamp |
| `SignOff` | Preparer / Reviewer / Controller |

## Quality gates

1. [ ] FAR ties to GL Fixed Asset accounts (cost + accumulated)
2. [ ] Additions log matches CapEx JEs posted in period
3. [ ] Each disposal has supporting documentation (sale agreement, scrap memo)
4. [ ] Below-threshold capitalizations have a written exception or are reclassified to expense
5. [ ] MACRS tax-method accumulated differs from Book — verify the difference reconciles to the deferred-tax provision
6. [ ] No impairment trigger is left without a Step-1 recoverability analysis attached
7. [ ] All assets with `useful_life_years <= 0` or `cost <= 0` removed from FAR

## Worked example

`examples/fixed_asset_register.csv` has 5 assets (computer, desk, server, vehicle, building improvement). Running:

```bash
python scripts/depreciation.py \
  --far examples/fixed_asset_register.csv \
  --cap-policy examples/cap_policy.csv \
  --report-date 2024-05-31 \
  --output /tmp/fa_may2024.xlsx
```

Computes:

- MacBook Pro (FA-001) — $2,400, 3-yr SL, in service since 2023-01-01: accumulated ~$1,133.33, May expense $66.67, NBV $1,266.67
- Vehicle (FA-004) — $35,000, 5-yr DDB switching to SL: substantial first-year acceleration
- Building Improvement (FA-005) — $80,000, 15-yr SL: $4,000 accumulated, monthly $444.44
- Server (FA-003) — partial-year acquisition (Jan 2024) under half-year convention

## References

- FASB — [ASC 360 (Property, Plant, and Equipment)](https://asc.fasb.org)
- IRS — [Pub 946: How to Depreciate Property](https://www.irs.gov/forms-pubs/about-publication-946)
- IRS — [MACRS Percentage Tables (Pub 946 Appendix A)](https://www.irs.gov/publications/p946)
- KPMG IFRG — [Handbook: PP&E Accounting and Disclosure](https://kpmg.com)
