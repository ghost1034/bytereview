---
name: lease-842-assistant
description: Apply the ASC 842 lessee model — classification, PV, ROU and liability, amortization, modifications, and JE generation
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, leases, asc842]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# ASC 842 Lease Assistant

Apply the ASC 842 lessee model end-to-end: classify each lease (operating vs. finance), compute the lease liability as the PV of remaining payments at the IBR, measure the ROU asset (liability + prepaid + IDC − incentives), produce monthly amortization schedules (operating single-cost vs. finance two-cost), generate the period JE, and handle modifications via remeasurement.

---

## Overview

| | |
|---|---|
| **Target user** | Lease Accountant, Technical Accounting Manager, Controller |
| **Maturity** | Production (classification, PV, schedules, JE); judgment-supported (IBR determination, reasonable certainty of options) |
| **What it does** | Reads a lease inventory; classifies under the 5-criterion test; computes PV with the supplied IBR; produces month-by-month amortization including ROU and liability balances; supports modification remeasurement; outputs an XLSX workpaper |
| **What it does NOT do** | Determine the IBR (judgment — based on collateralized-borrowing rate of the lessee for similar term); identify embedded leases in non-lease contracts (ASC 842-10-15 separate analysis); short-term lease election (ASC 842-20-25-2; declared at the policy level, not script-decided) |

## When to use

- Adopting ASC 842 (transition) — initial measurement workpaper
- Each new lease commencement — record initial ROU/liability
- Monthly close — operating lease single-cost recognition + interest accretion + JE
- Lease modification — remeasure with new IBR
- Termination — derecognize ROU/liability and book gain/loss
- IBR sensitivity testing — re-run with different rates to support disclosure

## When NOT to use

- Lessor accounting (different model under ASC 842-30)
- Subleases — additional layered model
- Variable lease payments tied to an index/rate that aren't included in initial measurement (recognize as period expense)
- Sale-leaseback transactions (ASC 842-40)

## Authoritative sources

- **ASC 842-10** — Overall Lease Accounting Guidance
- **ASC 842-20** — Lessee accounting (recognition, measurement, modification, remeasurement)
- **ASC 842-10-25-2** — Classification criteria (5 tests)
- **ASC 842-20-25-3 to 25-5** — Initial measurement of ROU and liability
- **ASC 842-20-30-1** — Discount rate determination (IBR if rate implicit unknown)
- **ASC 842-10-25-8 to 25-15** — Modifications and remeasurement
- **SEC IBR Disclosure** — Topic 1 SAB / S-K disclosure on key estimates

## Inputs

### 1. Lease inventory — `--leases <path>` (required)

CSV/XLSX. Required columns:

| Column | Type | Notes |
|---|---|---|
| `lease_id` | string | |
| `description` | string | Asset/property description |
| `commencement_date` | date | Date control transferred to lessee |
| `term_months` | int | Lease term (including renewal options reasonably certain) |
| `monthly_payment` | float | Fixed payment in functional currency |
| `ibr_annual` | float | Incremental borrowing rate (decimal, e.g. 0.06) |
| `payment_timing` | string | `advance` (BOM) / `arrears` (EOM) |
| `prepaid_rent` | float | At commencement (default 0) |
| `idc` | float | Initial direct costs (default 0) |
| `incentives` | float | Lease incentives received (default 0) |
| `economic_life_months` | int | Estimated useful life of underlying asset |
| `fair_value` | float | FV of underlying asset at commencement |
| `purchase_option_exercise_price` | float | 0 if none |
| `reasonably_certain_purchase` | bool | Whether the purchase option is reasonably certain |
| `specialized_nature` | bool | Whether the asset is so specialized that only the lessee can use it |
| `transfer_ownership` | bool | Title transfer at lease end |

Optional: `modification_effective_date`, `modification_new_term_months`, `modification_new_payment`, `modification_new_ibr`.

### 2. Parameters

| Flag | Default | Description |
|---|---|---|
| `--report-date` | required | Period-end YYYY-MM-DD |
| `--output` | required | XLSX path |
| `--ownership-criteria-threshold` | `0.75` | Term/economic life threshold for finance classification (criterion 4) |
| `--fair-value-criteria-threshold` | `0.90` | PV-of-payments / FV threshold (criterion 5) |

## Workflow

```
1. LOAD & VALIDATE
2. CLASSIFICATION (per lease, per ASC 842-10-25-2)
   Tests (any one → finance lease):
     C1. Transfer of ownership at end of term
     C2. Lessee has a reasonably-certain purchase option
     C3. Lease term covers a major part (default 75%+) of economic life
     C4. PV of lease payments (plus residual) covers substantially all (default 90%+) of FV
     C5. Asset is so specialized only lessee can use it
   If none → operating lease
3. INITIAL MEASUREMENT
   PV of lease payments at IBR:
     advance:  PV = pmt + pmt * (1 - (1+r)^-(n-1)) / r
     arrears:  PV = pmt * (1 - (1+r)^-n) / r
   r = ibr_annual / 12
   Liability_0 = PV
   ROU_0 = Liability + prepaid_rent + idc - incentives
4. MONTHLY SCHEDULE
   For each month from commencement to commencement + term_months:
     interest = liability_beg * r
     principal = payment - interest
     liability_end = liability_beg - principal
   For OPERATING lease:
     total_lease_cost = sum(payments) - incentives + idc + prepaid_rent
     straight_line_cost_per_month = total_lease_cost / term_months
     ROU amort = straight_line_cost - interest (i.e., ROU declines just enough to offset interest accretion → single-cost recognition)
   For FINANCE lease:
     ROU amort = (ROU_0) / economic life or lease term (lesser) on straight-line basis
     interest expense = interest above (separate line)
5. MODIFICATION (if modification_effective_date present and <= report_date)
   - Re-measure liability at new IBR using remaining lease term and new payment
   - Adjust ROU asset by the same amount (no separate gain/loss for an adjustment-type mod)
   - Reclassification test re-applied
6. PERIOD JE (consolidated through report_date)
   For each lease:
     operating:  DR Lease Cost (single line)            / CR Cash (or AP)
                  DR ROU Amortization Contra (technical)/ CR ROU Asset
                  DR Lease Liability (principal)        / CR ROU effect (handled in net presentation)
     finance:    DR Interest Expense                    / CR Lease Liability accreted-out
                  DR ROU Amortization Expense           / CR ROU Asset
                  DR Lease Liability (principal payment)/ CR Cash
7. ARTIFACTS
   - XLSX: Summary / Classification / Schedules (one sheet per lease or combined) /
            Modifications / JE / IBR_Sensitivity / AuditTrail / SignOff
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Mid-month commencement** | Day-prorate first month |
| **Renewal option reasonably certain** | Include in term_months (user decision; not auto-detected) |
| **Variable payments based on CPI** | Initial measurement uses payments at commencement; remeasure on contractual reset (modification flow) |
| **Lease incentive received after commencement** | Reduce ROU at receipt (treated as a separate event) |
| **Purchase option exercise** | If reasonably_certain_purchase, useful_life = economic_life; finance treatment |
| **Modification narrowing scope** (e.g., return floor space) | Treated as partial termination; gain/loss recognized |
| **Term ends mid-period of report_date** | Schedule clamps at term end |
| **Rate changes mid-term** (without modification) | Not a remeasurement event; original IBR locked |

## Anti-patterns (DO NOT)

- **DO NOT** treat ASC 842 amortization as a loan amortization (it is, mathematically, but the *presentation* differs; operating leases show a single rent line, not separate interest and amort)
- **DO NOT** include variable payments not based on an index/rate in the initial PV (per ASC 842-20-30-5)
- **DO NOT** discount at the prime rate or risk-free rate by default; the IBR is the *lessee-specific* collateralized borrowing rate
- **DO NOT** ignore IDC / prepaid rent / incentives in the ROU measurement
- **DO NOT** continue running the original schedule after a modification — remeasure

## Outputs

### XLSX

| Sheet | Contents |
|---|---|
| `Summary` | Total ROU, total liability, monthly lease cost (operating vs. finance), lease count by classification |
| `Classification` | Per lease: each of 5 tests with result and final classification |
| `Schedule_<lease_id>` | Month-by-month schedule (payment, interest, principal, liability, ROU, current-month expense) |
| `Modifications` | Original vs. modified key terms; remeasurement delta |
| `JE` | Period-end consolidated JE (Dr Lease Cost / Interest / ROU Amort, Cr Cash / Liability / ROU contra) |
| `IBR_Sensitivity` | Liability at base IBR vs. IBR ± 50 / ± 100 / ± 200 bps |
| `AuditTrail` | Inputs, parameters, classification thresholds, timestamp |
| `SignOff` | Preparer / Reviewer / Approver |

## Quality gates

1. [ ] Every lease has an IBR rationale documented
2. [ ] Classification reflects current contractual reality (not stale at modification)
3. [ ] ROU = Liability + prepaid + IDC − incentives at commencement
4. [ ] Total operating lease cost per month is constant within ±$0.01 (straight-line)
5. [ ] Finance lease interest declines monthly (amortization curve)
6. [ ] Modifications have a documented re-classification test result

## Worked example

`examples/lease_inputs.csv` has 3 leases (HQ Office, Warehouse, Vehicle Fleet). Running:

```bash
python scripts/lease_amortization.py \
  --leases examples/lease_inputs.csv \
  --report-date 2024-05-31 \
  --output /tmp/lease_may.xlsx
```

For HQ Office ($9,800/month, 60 months, 6% IBR, arrears):
- PV of payments = $507,231.62
- Term/economic-life check + FV check determine classification
- Monthly schedule shows liability accreting interest then declining as principal pays down

## References

- FASB — [ASC 842 Codification](https://asc.fasb.org)
- Deloitte — [Roadmap: Leases](https://www2.deloitte.com)
- EY — [Financial reporting developments: Lease accounting (ASC 842)](https://www.ey.com)
- KPMG — [Handbook: Leases](https://kpmg.com)
