---
name: tax-provision-calculator
description: Build an ASC 740 income tax provision with current and deferred layering, DTA/DTL roll-forward, ETR reconciliation, and FIN 48 flags
version: 0.1.0
metadata:
  hermes:
    tags: [tax, provision, asc740]
    category: tax
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Tax Provision Calculator (ASC 740)

Build a workbook-level income tax provision from book income and book–tax differences, including current versus deferred layering, blended rate mechanics, illustrative ETR reconciliation, DTA/DTL mapping, valuation allowance haircut, UTP reminders, and a draft journal-entry skeleton for controller review.

---

## Overview

| | |
|---|---|
| **Target user** | Corporate Tax Accountant, Technical Accounting Manager, Controller |
| **Maturity** | Production for illustrative provision math tied to `./scripts/provision_calculator.py`; not a substitute for full tax-return tie-out or FIN 48 / FIN 48 (ASC 740-10-25) technical models |
| **What it does** | Ingests a YAML facts pack; computes taxable income approximation, current and deferred expense, blended federal/state effective rate scaffold, deferred roll-forward skeleton, and XLSX workpaper tabs |
| **What it does NOT do** | File returns; reconcile to federal/state returns; automate ASC 740-30 foreign tax; evaluate uncertain tax positions on a FIN 48 basis; perform rate reconciliation to actual filed jurisdictions beyond the scripted simplifications |

## When to use

- Quarterly or annual ASC 740 draft roll-forward ahead of consolidated close
- Sensitivity preview when permanent and temporary differences are known in workbook form
- Training or prototyping ETR reconciliation line structure before plugging into ERP tax modules
- Documenting tentative DTA vs. DTL classification by temporary-difference bucket

## When NOT to use

- Multi-entity consolidated provision with intra-period tax allocation among continuing ops / discontinued ops (beyond this script's scope)
- Business combinations and purchase accounting deferred tax measurement (ASC 805-740)
- Interim period expectations when forecasting annual ETR requires discrete events outside YAML inputs
- Any situation requiring reliance without Tax / Controller review and tie to legal entity returns

## Authoritative sources

- **ASC 740** — Income Taxes (overall recognition, measurement, interim reporting, intra-period allocation)
- **ASC 740-10** — Uncertain income tax positions (FIN 48) — qualitative flag list only here; substantive analysis human-owned
- **ASC 740-20** — Intraperiod tax allocation *(not modeled in script — disclose gap in review)*

## Inputs

### Provision inputs YAML — `--inputs <path>` (required)

Scalar fields consumed by `provision_calculator.py`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `pre_tax_income` | number | Implicit (defaults 0) | Book income before income taxes |
| `statutory_rate` or `federal_rate` | number | Recommended | Federal statutory rate (e.g., 0.21) |
| `state_rate` | number | N | Standalone state rate before apportionment |
| `state_apportionment_pct` | number | N | Fraction of state regime applied after federal (default 1.0) |
| `valuation_allowance_pct` | number | N | Percent of gross DTA for illustrative VA carve |
| `permanent_differences` | list | N | YAML list of `{Description: amount}` maps or descriptive strings → script normalizes via `_normalize_diffs` |
| `temporary_differences` | list | N | Same schema as permanents |
| `uncertain_tax_positions` | list of strings | N | Echoed on `UTP_Flags`; no FIN 48 measurement |

### Parameters

| Flag | Required | Description |
|---|---|---|
| `--inputs` | Y | Path to YAML per above |
| `--period-end` | Y | Period label (e.g., `2024-12-31`), stamped on Summary |
| `--output` | Y | Destination `.xlsx` workpaper |
| `--quiet` | N | Raises log level to WARNING |

Exit codes: `0` success; `1` validation/YAML failures.

## Workflow

```
1. PREPARE book pre-tax income and enumerate book–tax differences (perm vs temp) in YAML.
2. RUN calculator with period-end label and choose output path.
3. VALIDATE blended rate aligns with jurisdictional expectation (manual).
4. RECONCILE Summary total tax expense to ETR tab and DraftJE skeleton.
5. REVIEW VA and UTP flags — script is illustrative only.
6. CONTROLLER ties results to forecasting model / return before any disclosure or JE posting.
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Zero book income** | ETR denominator zero in script logic — surface as manual override in review |
| **State nets with federal deductibility** | Script applies simplified `(1 − federal)` on state bracket in ETR lines — reconcile to true net state benefit in review |
| **Temporary difference direction** | Deferred sign flips via `-temp × blended`; confirm DTA vs. DTL labels match facts |
| **String-only differences** | Contribute $0 amounts but preserve documentation row |
| **UTP list populated** | No recognition threshold test — escalate to FIN 48 workstream |

## Anti-patterns (DO NOT)

- **DO NOT** treat `DraftJE` as book-ready without account mapping and intercompany elimination
- **DO NOT** use default rates for legal accruals without corroborating with filed positions
- **DO NOT** ignore roll-forward omissions (equity/other comprehensive, fx, acquisitions) inherent in the simplified workbook
- **DO NOT** skip SignOff because the workbook “balanced” mechanically

## Outputs

| Sheet | Contents |
|---|---|
| `Summary` | Headline headline metrics: pre-tax, blended rate, current vs deferred vs total expense, ETR, VA and net DTA teaser |
| `ETR_Reconciliation` | Scripted rate-impact lines incl. statutory and simplified state scaffolding |
| `DTA_DTL` | Temporary difference-by-line deferred tax classification |
| `DeferredRollForward` | Opening assumed zero movement schedule + VA line |
| `DraftJE` | Illustrative JE to Income Tax Expense, Payables, DTA/DTL |
| `UTP_Flags` | Text list requiring human FIN 48 follow-up |
| `AuditTrail` | Generation timestamp metadata |
| `SignOff` | Preparer / Reviewer / Approver scaffolding |

*(Sheet names mirror `openpyxl` titles in script — match casing when referencing.)*

## Quality gates

1. [ ] Book pre-tax income ties to consolidated trial balance
2. [ ] Each YAML difference traced to authoritative workpaper or memo
3. [ ] Deferred tax classifications agree with expectation (asset vs liability) for each temporaries bucket
4. [ ] Draft JE aligns to entity COA numbering convention after mapping
5. [ ] FIN 48 / PA states consulted when `uncertain_tax_positions` non-empty
6. [ ] Disclosure team informed if ETR drivers deviate materially from prior forecasts

## Worked example

From the skill directory (`tax-provision-calculator/`):

```bash
python scripts/provision_calculator.py \
  --inputs examples/provision_inputs.yaml \
  --period-end 2024-12-31 \
  --output /tmp/tax_provision_2024-Q4.xlsx
```

Bundled YAML supplies pre-tax `$1M`, Meals & Entertainment and stock-comp permanent items, depreciation and reserves temporaries, 10% VA overlay, and a sample UTP string for manual follow-up.

## References

- FASB — [ASC 740 Income Taxes](https://asc.fasb.org)
- AICPA — Audit guidance on income taxes and uncertain tax positions
- Big 4 — ASC 740 technical guides (current vs deferred, VA, interim reporting)
