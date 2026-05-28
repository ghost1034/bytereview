---
name: flux-variance-analyst
description: Run period-over-period flux analysis with top-driver extraction and controller-ready commentary
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, variance, analytics]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Flux Variance Analyst

Compare current- and prior-period balances by account, classify material movements using dual absolute and percentage thresholds (with a “new account” path), rank top drivers, and publish a reviewer-friendly XLSX pack with highlighted material rows and sign-off lines.

---

## Overview

| | |
|---|---|
| **Target user** | Accounting Manager, FP&A partner, Controller reviewer |
| **Maturity** | Production for mechanical TB-to-TB comparison via `./scripts/flux_analyst.py`; narrative explanations remain human-authored |
| **What it does** | Merges normalized trial balances on `account_code` + `account_name`, computes delta and % change, flags materiality, highlights top ten drivers on a dedicated sheet |
| **What it does NOT do** | Explain root cause; incorporate sub-ledger detail; roll forward daily balances; replace management discussion in MD&A or board packages |

## When to use

- Month/quarter flux review before management sign-off
- Roll-forward of prior close package to current GL after mapping refresh
- Automated gate in CI pipelines that should fail when material unexplained variances exist (`exit 2` path)
- Board or audit committee appendix prep when starting from two TB extracts

## When NOT to use

- Single period analytics without a prior comparable
- Mixing different COA versions without remapping keys
- Detailed revenue or COS sub-ledger waterfalls (use dedicated rev or COGS tools)

## Authoritative sources

- **PCAOB AS 2110** — Identifying and assessing risks of material misstatement (trend / fluctuation procedures)
- **PCAOB AS 2305** — Substantive analytical procedures
- **COSO ICFR** — monitoring activities and variance investigation for control environments

## Inputs

### Trial balance — `--cp` and `--pp` (both required)

Accepted as `.csv` or Excel. Column names are normalized to **lowercase**.

| Column | Type | Required | Notes |
|---|---|---|---|
| `account_code` | string | Y | Coalesces as string in script |
| `account_name` | string | Y | Must match between periods for meaningful join |
| `balance` | number | Y | Coerced numeric; NaN → 0 |

### Parameters

| Flag | Default | Description |
|---|---|---|
| `--cp` | — | Current period TB path |
| `--pp` | — | Prior period TB path |
| `--output` | required | XLSX flux report |
| `--pct-threshold` | `0.10` | Material if abs % change ≥ threshold when prior ≠ 0 |
| `--abs-threshold` | `5000.0` | Material if abs dollar delta ≥ threshold AND (% rule or prior = 0 branch) |
| `--quiet` | off | WARNING-level logging only |

Materiality rule in code: `(abs(delta) ≥ abs_thresh) AND ((abs(pct) ≥ pct_thresh) OR (abs(prior balance) == 0))`.

Exit codes: `0` — no material rows; `2` — ≥1 material variance; `1` — schema/read failure.

## Workflow

```
1. EXTRACT TB for current and prior comparable periods with consistent mapping.
2. RUN flux_analyst.py with dual thresholds aligned to company materiality policy.
3. IF exit code 2 → triage material tab (red fill) and assign owners.
4. PREPARE narratives for TopDrivers list (script supplies template text only).
5. CONTROLLER certifies after investigation or documents expected variances.
```

## Edge cases

| Scenario | Handling |
|---|---|
| **New account with prior 0** | % change forced to 100% if nonzero current — almost always material if above abs threshold |
| **Account only in one period** | Outer merge brings NaN balance side to 0 |
| **Duplicates on key** | pandas merge can duplicate rows — dedupe TB upstream |
| **Quiet mode** | Stdout summary still prints; logging muted except warnings |

## Anti-patterns (DO NOT)

- **DO NOT** lower thresholds in production just to force green exit codes
- **DO NOT** treat “immaterial by script” as immaterial for fraud or related-party angles
- **DO NOT** omit TopDrivers review when count is small but amounts are judgmental
- **DO NOT** reuse prior-period TB that was not fully closed

## Outputs

| Sheet | Contents |
|---|---|
| `Summary` | Thresholds, counts, total absolute flux headline |
| `Detail` | Full merged population; material rows highlighted red |
| `TopDrivers` | Top 10 material rows by absolute delta with suggested review boilerplate |
| `AuditTrail` | Timestamp |
| `SignOff` | Preparer / Reviewer / Controller blanks |

## Quality gates

1. [ ] Both TBs tie to GL system of record for their respective period ends
2. [ ] Account mapping consistent (no duplicate `account_code` collisions)
3. [ ] Each material line has preparer comment or pointer to supporting schedule
4. [ ] Dual threshold settings documented in close memo or control description
5. [ ] Sign-off completed before financial statement issuance

## Worked example

From `flux-variance-analyst/`:

```bash
python scripts/flux_analyst.py \
  --cp examples/tb_current.csv \
  --pp examples/tb_prior.csv \
  --output /tmp/flux_analysis.xlsx \
  --pct-threshold 0.10 \
  --abs-threshold 5000
```

Expect non-zero material count on samples where balances shift beyond thresholds; pipeline should surface `exit 2` for escalation.

## References

- AICPA — Conducting analytical procedures as substantive tests
- Deloitte / PwC / EY / KPMG — audit analytics practice aids on fluctuation analysis
