---
name: reserves-estimator
description: Estimate the CECL (ASC 326) allowance via aging-based loss rates with qualitative overlays and sensitivity analysis
version: 0.1.0
metadata:
  hermes:
    tags: [accounting, cecl, asc326]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Reserves & Allowance Estimator (CECL — ASC 326)

Calculate the Allowance for Credit Losses (ACL) on trade receivables using a CECL-compliant pooled-aging methodology with historical loss rates, qualitative adjustments (Q-factors), and reasonable-and-supportable forecast overlays, plus sensitivity testing. Produces an XLSX workpaper traceable to the journal entry.

---

## Overview

| | |
|---|---|
| **Target user** | Senior Accountant (AR / Treasury), Controller |
| **Maturity** | Production (loss-rate math + Q-factor application); judgment-supported (Q-factor calibration, R&S forecast magnitude, reversion period) |
| **What it does** | Pools receivables by aging bucket; applies historical loss rates; layers Q-factors (current conditions adjustment) and R&S forecast overlays; produces ACL by pool, sensitivity table, and a draft JE |
| **What it does NOT do** | Discounted cash-flow modeling for loans (commercial loans are out of scope); macro-econ data sourcing; ASC 326 transition adjustment |

## When to use

- Each reporting period for trade receivables under ASC 326 (CECL)
- Pre-audit lead sheet for the AR allowance balance
- Sensitivity testing to disclose ranges (per SAB 99 / Reg S-K Item 303)
- Onboarding a new business line that materially changes the loss profile

## When NOT to use

- Loans where DCF or fair-value methodology is more appropriate (ASC 326-20-30-4)
- Receivables under ASC 944 (insurance), ASC 942 (banking)
- Customer-specific impairment that is no longer a homogeneous pool (carve out the customer to a "Watch List" pool and apply 100% reserve where appropriate)
- Available-for-sale debt securities (ASC 326-30, different model)

## Authoritative sources

- **ASC 326-20** — Financial instruments — credit losses: trade receivables and other financial assets
- **ASC 326-20-30-1 to 30-9** — Pooled approach, loss-rate method, considerations
- **ASC 326-20-55-1 to 55-16** — Examples (incl. trade receivables)
- **SEC SAB 119** — Estimating credit losses on receivables in the application of the loss-rate method
- **Reg S-K Item 303** — Critical accounting estimates

## Inputs

### 1. AR aging — `--aging <path>` (required)

CSV/XLSX. One row per customer or per invoice.

| Column | Type | Notes |
|---|---|---|
| `customer` | string | |
| `Current` | float | Amount in 0–30 (or "Current") bucket |
| `31-60` | float | |
| `61-90` | float | |
| `Over 90` | float | |

Optional: `91-180`, `Over 180` (deeper aging detail), `segment` (B2B / B2C / Government), `risk_grade` (A / B / C), `customer_specific_reserve` (override; e.g., known bankruptcy).

### 2. Historical loss-rates — `--loss-rates <path>` (required)

CSV mapping each aging bucket to a historical loss rate (% as decimal). Example:

```
bucket,rate
Current,0.005
31-60,0.02
61-90,0.10
Over 90,0.50
```

### 3. Q-factors — `--q-factors <path>` (optional)

CSV with qualitative adjustments per pool/bucket. Example:

```
bucket,q_factor_pct
Current,0.001
31-60,0.005
61-90,0.02
Over 90,0.05
```

Q-factors are added to the historical rate to reflect current conditions (e.g., concentration risk, customer mix change, regulatory).

### 4. R&S forecast — `--forecast <path>` (optional)

CSV with macro-economic overlay multipliers per bucket (e.g., recession scenario).

| bucket | multiplier |
|---|---|
| Current | 1.1 |
| 31-60 | 1.2 |

### 5. Prior allowance — `--prior-acl` (optional) — for the roll-forward

| Flag | Default | Description |
|---|---|---|
| `--prior-acl-balance` | none | Prior period ending ACL |
| `--writeoffs` | none | Current-period write-offs (USD) |
| `--recoveries` | none | Current-period recoveries (USD) |

### 6. Parameters

| Flag | Default | Description |
|---|---|---|
| `--period-end` | required | YYYY-MM-DD |
| `--output` | required | XLSX |
| `--scenarios` | `"base,stress_up_25,stress_down_25"` | Comma-separated scenarios; multipliers applied to base rate |

## Workflow

```
1. LOAD AGING & VALIDATE bucket columns
2. APPLY LOSS RATES
   For each bucket b: pool_amount[b] = sum(aging[b])
   base_rate[b] = historical_loss_rate[b] + q_factor[b] (if present)
   forecasted_rate[b] = base_rate[b] * forecast_multiplier[b] (if present)
3. ACL CALCULATION
   ACL[b] = pool_amount[b] * forecasted_rate[b]
   ACL_total = sum(ACL[b]) + sum(customer_specific_reserve)
4. ROLL-FORWARD (if prior provided)
   ACL_end = ACL_begin + Provision (computed)
             - Write-offs + Recoveries
   Provision = ACL_total - ACL_begin + Write-offs - Recoveries
5. SCENARIO ANALYSIS
   For each scenario:
       rate' = base_rate * scenario_multiplier
       compute ACL'
6. JE PREVIEW
   DR Provision for Credit Losses (P&L, Expense)
   CR Allowance for Credit Losses (B/S, Contra-Asset)
7. ARTIFACT
   - XLSX: Summary / AgingPools / LossRateBuild / Scenarios / RollForward / DraftJE /
            CustomerSpecific / AuditTrail / SignOff
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Customer-specific reserve (e.g., known bankruptcy)** | Added to the ACL on top of the pooled reserve; customer's pool amount remains in the aging buckets |
| **Negative aging (credit balance)** | Excluded from ACL (it's a payable, not a receivable) |
| **New segment with no historical data** | Use the highest-risk peer pool until 12 months of data exist; flag in `LossRateBuild` |
| **R&S forecast > 24 months out** | Per ASC 326, revert to historical loss rate after the R&S period; apply a reversion factor (linear) |
| **Off-balance-sheet commitments** | Not in this skill's scope — handle in a separate reserve calc |
| **Sales taxes embedded in AR** | Strip sales tax from gross AR before applying loss rate (reduces overestimation) |

## Anti-patterns (DO NOT)

- **DO NOT** use a single weighted loss rate across all buckets — that defeats the pooled approach
- **DO NOT** apply a Q-factor to one pool without documenting the rationale
- **DO NOT** ignore recoveries in the roll-forward (they're netted against write-offs)
- **DO NOT** set reserve at zero on Current bucket without empirical support
- **DO NOT** confuse ACL with Bad Debt Expense — ACL is the B/S, expense is the period change

## Outputs

### XLSX

| Sheet | Contents |
|---|---|
| `Summary` | Total AR, total ACL, ACL/AR %, period provision, write-offs, recoveries |
| `AgingPools` | Per bucket: pool amount, historical rate, Q-factor, forecast multiplier, final rate, ACL |
| `LossRateBuild` | Side-by-side build: historical → +Q → ×forecast = final rate |
| `Scenarios` | Per scenario: ACL by bucket and total |
| `RollForward` | Beg + Provision - WOs + Recoveries = End |
| `DraftJE` | DR Bad Debt Expense / CR ACL with provision amount |
| `CustomerSpecific` | Per customer specific reserve (if any) |
| `AuditTrail` | Inputs, parameters, scenario multipliers, timestamp |
| `SignOff` | Preparer / Reviewer / Controller |

## Quality gates

1. [ ] Pool aging totals tie to the AR sub-ledger
2. [ ] Historical loss rates are based on ≥ 24 months of data (ideally 3-5 yr cycle)
3. [ ] Q-factors and forecast overlay are documented in memo
4. [ ] Roll-forward ties to GL ACL ending balance
5. [ ] Sensitivity range is disclosed if material
6. [ ] Reviewer is independent from Preparer

## Worked example

`examples/ar_aging.csv` shows 4 customers across 4 buckets. `examples/loss_rates.csv` provides historical rates. Running:

```bash
python scripts/ar_reserve.py \
  --aging examples/ar_aging.csv \
  --loss-rates examples/loss_rates.csv \
  --q-factors examples/q_factors.csv \
  --forecast examples/forecast.csv \
  --prior-acl-balance 1200 \
  --writeoffs 350 \
  --recoveries 100 \
  --period-end 2024-05-31 \
  --output /tmp/acl_may.xlsx
```

Produces ACL by pool, base & sensitivity (±25%), roll-forward, and a draft JE.

## References

- FASB — [ASC 326 Codification](https://asc.fasb.org)
- SEC — [SAB 119: Estimating Credit Losses on Receivables](https://www.sec.gov)
- AICPA — [Allowance for Credit Losses Audit Practice Aid](https://us.aicpa.org)
- KPMG — [Credit losses (ASC 326) handbook](https://kpmg.com)
