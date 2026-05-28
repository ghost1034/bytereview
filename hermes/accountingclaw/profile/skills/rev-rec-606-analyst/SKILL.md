---
name: rev-rec-606-analyst
description: Run the five-step ASC 606 engine — PO identification, constraint, SSP allocation, monthly waterfall, and modifications
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, revenue, asc606]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# ASC 606 Revenue Recognition Analyst

Operate the full ASC 606 5-step model: identify the contract and performance obligations, determine and allocate the transaction price (with variable consideration constraint and SSP allocation methods), and recognize revenue on the appropriate pattern (point-in-time vs. over-time) — producing a contract-by-contract monthly revenue waterfall, deferred-revenue roll-forward, and modification accounting where applicable.

---

## Overview

| | |
|---|---|
| **Target user** | Revenue Accountant, Technical Accounting Manager, Controller |
| **Maturity** | Production for the mechanical recognition; judgment-supported for distinct-good identification, variable-consideration estimation, and SSP determination |
| **What it does** | Reads a contract register (transaction price, PO list, SSPs, recognition pattern, start/end dates, modifications) and produces a monthly revenue waterfall, deferred-revenue roll-forward, and a per-contract recognition schedule following ASC 606 |
| **What it does NOT do** | Identify whether a contract exists (legal judgment); determine which PO is distinct (technical accounting judgment per ASC 606-10-25-19); estimate variable consideration without an SSP / probability input |

## When to use

- Monthly revenue close — produce the journal entries and deferred-revenue roll-forward
- Contract acceptance — validate the PO breakdown and SSP allocation
- ASC 606 audit support — show the 5-step working papers
- Contract modifications — apply prospective vs. cumulative-catch-up treatment
- New product launch — establish baseline SSPs

## When NOT to use

- ASC 842 lease revenue (rentals) — separate guidance applies
- Insurance contracts (ASC 944) — different model
- Financial-instrument contracts (ASC 815, ASC 825)
- Contracts in scope of ASC 944, ASC 808 collaborative arrangements

## Authoritative sources

- **ASC 606-10** — Revenue from Contracts with Customers
- **ASC 606-10-25-14 to 25-22** — Identifying performance obligations
- **ASC 606-10-32** — Transaction price (variable consideration, constraint, significant financing)
- **ASC 606-10-32-31 to 32-41** — SSP allocation methods
- **ASC 606-10-25-10 to 25-13** — Contract modifications
- **ASC 340-40** — Other assets and deferred costs — contract costs (capitalized commissions)
- **SEC SAB 104** — Revenue recognition (historical guidance; mostly superseded but informs SEC views)

## Inputs

### 1. Contract register — `--contracts <path>` (required)

CSV/XLSX. One row per performance obligation (NOT per contract — a 3-PO contract is 3 rows).

| Column | Type | Notes |
|---|---|---|
| `contract_id` | string | Customer contract identifier |
| `po_id` | string | Performance obligation identifier within contract |
| `po_description` | string | Distinct good/service |
| `customer` | string | |
| `contract_start_date` | date | Original signed date |
| `service_start_date` | date | When the PO becomes recognizable |
| `service_end_date` | date | When recognition completes |
| `transaction_price` | float | Net of expected variable consideration after constraint |
| `ssp` | float | Standalone selling price for THIS PO |
| `recognition_pattern` | string | `point_in_time` / `ratable` / `usage_based` |
| `is_distinct` | bool | Standard determination (judgmental) |

Optional: `variable_consideration_gross`, `constraint_pct`, `modification_effective_date`, `modification_type` (`prospective` / `catch_up`), `commission_paid` (drives §340-40 capitalization).

### 2. Parameters

| Flag | Default | Description |
|---|---|---|
| `--period-end` | required | YYYY-MM-DD — closing month-end |
| `--ssp-method` | `adjusted_market` | `observable` / `adjusted_market` / `expected_cost_plus_margin` / `residual` — used when SSP missing |
| `--billings` | none | Optional CSV of billings (`contract_id, billing_date, amount`) to compute deferred revenue |
| `--output` | required | XLSX workpaper |

## Workflow

```
1. LOAD & VALIDATE
   - Coerce dates, amounts; reject contracts with missing required fields
2. STEP 1 (CONTRACT IDENTIFICATION)
   - Each unique contract_id is treated as a contract
   - Flag contracts missing customer (data integrity)
3. STEP 2 (PERFORMANCE OBLIGATIONS)
   - Each row = a candidate PO
   - If `is_distinct == False`, the row is grouped with the next distinct PO and the SSP combined
4. STEP 3 (TRANSACTION PRICE)
   - transaction_price already reflects the constraint (input by user)
   - If variable_consideration_gross set, validate: transaction_price ≈ gross * (1 - constraint_pct)
     (within 0.5%); else FLAG
5. STEP 4 (ALLOCATION)
   - For each contract:
       allocated_price[po] = transaction_price_contract * ssp[po] / sum(ssp_contract)
   - If any SSP missing:
       - apply --ssp-method:
           observable           → use latest_observed_price for that PO from history (out of scope; user supplies)
           adjusted_market      → use market_price * (1 - market_discount); needs --market-discount param
           expected_cost_plus_margin → cost + margin% (user supplies)
           residual             → (only for distinct goods where price is highly variable)
                                    residual_price = total - sum(observable_SSPs)
   - If allocation diverges from line transaction_price by > 1%, prefer allocated_price
6. STEP 5 (RECOGNITION)
   - point_in_time:
       recognize full allocated_price on service_start_date
   - ratable:
       daily rate = allocated_price / (service_end_date - service_start_date + 1).days
       recognized through period_end = daily rate * days elapsed (clamped to allocated_price)
   - usage_based:
       requires --usage CSV (not implemented in v1; user supplies usage on the row)
7. MODIFICATIONS
   - For each row with modification_effective_date <= period_end:
       prospective:    new TP applied to remaining service
       catch_up:       reallocate cumulative-to-date based on revised TP × % complete; book true-up
8. CONTRACT COSTS (§340-40)
   - If commission_paid > 0 and amortization_life >= service_length:
       amortize commission ratably over service_length
9. DEFERRED REVENUE (if --billings provided)
   - For each contract: deferred = billings_to_date - recognized_to_date (floored at 0)
10. ARTIFACTS
    - XLSX: Summary / FiveStepWorkpaper / Waterfall / DeferredRollForward / Modifications /
            ContractCosts / Allocation / AuditTrail / SignOff
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Implementation services + 12-month SaaS** | Two POs (implementation is sometimes not distinct from SaaS — judgment); if `is_distinct=False` for implementation, combine and recognize ratably over SaaS term |
| **Free trial period** | Service_start_date = first paid day; implicit-financing not assumed |
| **Multi-year contract, annual billings** | Billings input lets the script compute deferred at any month-end |
| **Refund right** | The user must reduce transaction_price by the constrained expected refund; variable_consideration_gross field documents the original number |
| **Modification mid-month** | Daily rates from before and after the modification are applied to the respective day ranges |
| **PO with no SSP and no observable history** | Skill falls back to `--ssp-method` (default `adjusted_market`); flags for technical review |
| **Backdated start** | If `service_start_date` < contract_start_date, recognition starts at the *later* of the two |
| **Negative residual** (sum of observable SSPs > total TP) | Skill FAILs allocation and flags for SSP method change |
| **Contract sum allocation diverges from row total > 1%** | Use allocated_price (per the standard) and log a `realloc_delta` audit note |

## Anti-patterns (DO NOT)

- **DO NOT** straight-line revenue for usage-based contracts — usage drives recognition
- **DO NOT** apply the residual method to non-distinct or non-variable-priced POs (ASC 606-10-32-34(c) restricts its use)
- **DO NOT** book the gross transaction price without applying the constraint
- **DO NOT** assume implementation services are always distinct (judgment per ASC 606-10-55-141 to 145)
- **DO NOT** capitalize commissions if the contract length < the amortization period (apply practical expedient ASC 340-40-25-4)

## Outputs

### XLSX workpaper

| Sheet | Contents |
|---|---|
| `Summary` | Total contracts, total transaction price, recognized to date, deferred, period revenue |
| `FiveStepWorkpaper` | Per PO: contract, PO, customer, dates, TP, SSP, allocated price, pattern, recognition basis, distinct flag |
| `Allocation` | Per contract: SSP sum, TP, allocation factors, allocated price per PO |
| `Waterfall` | Monthly recognized revenue per PO from earliest start to latest end |
| `DeferredRollForward` | Per contract: Beg Deferred + Billings - Recognized = End Deferred (if billings supplied) |
| `Modifications` | Per modified PO: original TP, modified TP, treatment, catch-up amount |
| `ContractCosts` | §340-40 commissions amortization schedule |
| `AuditTrail` | Parameters, SSP method, count of judgment flags, timestamp |
| `SignOff` | Preparer (Revenue) / Reviewer (Tech Accounting) / Approver (Controller) |

## Quality gates

1. [ ] Every PO has a `recognition_pattern` and dates that make sense
2. [ ] Every contract's allocated prices sum to its transaction price (within $0.01)
3. [ ] SSPs follow a documented methodology consistent with ASC 606-10-32-33
4. [ ] Variable-consideration constraint is documented (basis for constrained amount)
5. [ ] Modifications follow the appropriate treatment (prospective vs. catch-up vs. separate contract)
6. [ ] Deferred revenue ties to the B/S deferred revenue account

## Worked example

`examples/contracts.csv` has 3 contracts:
- C-101: 12-month SaaS @ $12,000 / year — ratable
- C-102: 12-month SaaS @ $24,000 starting April — ratable
- C-103: Implementation services $6,000 + SaaS $12,000 (implementation distinct) — point-in-time + ratable

Running:

```bash
python scripts/rev_rec_waterfall.py \
  --contracts examples/contracts.csv \
  --period-end 2024-05-31 \
  --output /tmp/rev_rec_may.xlsx
```

Produces the full 5-step workpaper, monthly waterfall through May, allocation schedule, and a Summary showing May recognized revenue.

## References

- FASB — [ASC 606 Codification](https://asc.fasb.org)
- Deloitte — [Roadmap: ASC 606 — A Roadmap to Applying the New Revenue Recognition Standard](https://www2.deloitte.com)
- EY — [Financial reporting developments: Revenue from contracts with customers (ASC 606)](https://www.ey.com)
- PwC — [Revenue from contracts with customers — global edition](https://www.pwc.com)
