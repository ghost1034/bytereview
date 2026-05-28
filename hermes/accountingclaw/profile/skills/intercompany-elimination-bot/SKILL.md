---
name: intercompany-elimination-bot
description: Match cross-entity intercompany balances, isolate FX differences, and generate elimination JEs
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, intercompany, consolidation]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Intercompany Elimination Bot

Cross-foot due-from / due-to styled intercompany pairs between two entity trial balances after optional FX translation to a common reporting unit, apply a configurable **FX tolerance** band for residual differences, score account-name similarity, emit elimination JE suggestions for passing pairs, and summarize FAIL lines for consolidation follow-up.

---

## Overview

| | |
|---|---|
| **Target user** | Consolidation Accountant, Group Reporting Manager |
| **Maturity** | Production for paired-account arithmetic via `./scripts/ic_matcher.py`; elimination entries are **draft** pending policy and local GAAP review |
| **What it does** | Reads two TBs, converts local balances to `balance_usd` using `fx_rate`, matches explicit account pairs, compares “Due from + Due to” convention, flags within-tolerance vs breach |
| **What it does NOT do** | Auto-post eliminations; evaluate transfer pricing; replace legal-entity statutory close; handle multi-pair netting beyond specified `--pair` inputs |

## When to use

- Month-end IC proof between two legal entities before consolidation package
- Rapid diagnostic when translation rates differ slightly and a tolerance is policy-governed
- Training scenario with bundled `entity_a_tb.csv` / `entity_b_tb.csv`
- Bot-assisted first pass before detailed intercompany subledger matching

## When NOT to use

- Multi-currency deals requiring hedge accounting
- Complex triangular balances without explicit pairing strategy
- Situations where zero tolerance is audit-mandated without disclosure

## Authoritative sources

- **ASC 830** — Foreign Currency Matters (remeasurement / translation context for rate usage — human confirms policy)
- **ASC 810** — Consolidation (elimination of intercompany balances and transactions)
- **IFRS users** — IAS 21 (The Effects of Changes in Foreign Exchange Rates) when IFRS reporting applies

## Inputs

### Entity trial balance — `--entity-a` and `--entity-b` (required)

`.csv` or Excel; headers lowercased.

| Column | Type | Required | Notes |
|---|---|---|---|
| `account_code` | string | Y | Join key for `--pair` |
| `account_name` | string | Y | Used in fuzzy name scoring |
| `balance` | number | Y | Local functional amount |
| `currency` | string | N | Default `USD` |
| `fx_rate` | number | N | Default `1.0`; multiply to derive `balance_usd` |

### Pairing and tolerance

| Flag | Default | Description |
|---|---|---|
| `--pair ACCT_A ACCT_B` | `[["1200-IC","2200-IC"]]` if omitted | Repeatable; each tuple tested across A vs B TBs |
| `--fx-tolerance` | `100.0` | PASS if absolute post-conversion mismatch ≤ tolerance |
| `--output` | required | Destination XLSX |
| `--quiet` | off | Logging reducer |

Variance logic: sums `balance_usd` for each side where accounts exist; computes `variance = val_a + val_b` reflecting typical due-from (+) vs due-to (−) offset expectation.

Exit codes: `0` — all PASS; `2` — any FAIL pair; `1` — ingestion errors.

## Workflow

```
1. EXPORT latest TB per entity WITH rates consistent with consolidation policy.
2. DEFINE elimination pairings (mirror legal agreements / COA handbook).
3. RUN ic_matcher with tolerance consistent with materially policy (document basis).
4. REVIEW Detail tab — PASS may still exhibit small residuals inside tolerance band.
5. UPDATE EliminationJE sheet drafts into consolidation system after independent review.
6. SIGN consolidation control certifying unresolved FAIL items.
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Missing account rows** | Treated as 0 contribution for that side |
| **Multiple rows same code** | Summed (`groupby`-like via filter sum) |
| **Name similarity low** | Informational fuzzy score only — not a PASS gate |
| **PASS with residual** | JE tab emits split entries when PASS and abs(variance) > 0.01 |
| **`rapidfuzz` dependency** | Required package for token set ratio calculation |

## Anti-patterns (DO NOT)

- **DO NOT** widen tolerance solely to PASS without escalation to FX policy owner
- **DO NOT** post EliminationJE without verifying transactional eliminations (revenue/cogs) separately
- **DO NOT** assume default pair `[1200-IC,2200-IC]` matches your COA
- **DO NOT** ignore FAIL rows because “they always fail” — refresh root cause narratives

## Outputs

| Sheet | Contents |
|---|---|
| `Summary` | Entity stems, PASS/FAIL counts, aggregate absolute variance |
| `Detail` | Per pair: USD balances, variance, fx difference metric, fuzzy name similarity, PASS/FAIL (FAIL rows highlighted) |
| `EliminationJE` | Draft netting entries for PASS pairs needing adjustment |
| `AuditTrail` | Timestamp |
| `SignOff` | Preparer / Consolidation Lead / Controller |

## Quality gates

1. [ ] FX rates tie to treasury / consolidation rate feed for the booking date
2. [ ] Each tested pair enumerated in consolidation policy appendix
3. [ ] Variance inside tolerance aligns with rationale (timing, rounding policy)
4. [ ] JE drafts reviewed against functional currency and local statutory ledgers
5. [ ] All FAIL statuses resolved or escalated prior to issuance

## Worked example

From `intercompany-elimination-bot/`:

```bash
python scripts/ic_matcher.py \
  --entity-a examples/entity_a_tb.csv \
  --entity-b examples/entity_b_tb.csv \
  --pair 1200-IC 2200-IC \
  --fx-tolerance 100 \
  --output /tmp/ic_recon.xlsx
```

Bundled extracts include an IC Due-from / Due-to style pairing; widen or tighten `--fx-tolerance` to emulate policy sensitivities before sign-off meetings.

## References

- Deloitte — Memo series on multicurrency consolidation
- Grant Thornton / EY guides — Practical guidance on downstream FX differences in intercompany accounts
