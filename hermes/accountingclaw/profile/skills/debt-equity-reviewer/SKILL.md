---
name: debt-equity-reviewer
description: Classify preferred stock, warrants, SAFEs, and convertible debt via the ASC 480 and 815-40 decision tree
version: 0.1.0
metadata:
  hermes:
    tags: [accounting, debt-equity, asc480]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Debt vs. Equity Classification Reviewer (ASC 480 / 815 / 470)

Apply the full GAAP classification waterfall to financial instruments — mandatorily redeemable shares, puttable common, warrants, convertible debt, redeemable preferred, etc. — and produce a defensible classification (Liability / Mezzanine / Equity) with the reasoning trail and the journal-entry shell.

---

## Overview

| | |
|---|---|
| **Target user** | Senior Accountant, Technical Accounting Manager, Controller |
| **Maturity** | Production for the structured decision tree; judgment-supported (substance over form, embedded-derivative bifurcation, contingent settlement) |
| **What it does** | Reads a YAML instrument summary; runs the ASC 480 → SEC 5-T → ASC 815 → ASC 470-20 (convertible) waterfall; outputs an XLSX/DOCX memo with full decision trail |
| **What it does NOT do** | Pricing the instrument (no Black-Scholes / binomial valuation); detailed beneficial-conversion calculation (ASU 2020-06 simplification means most BCF analysis is now obsolete, but mention it) |

## When to use

- New equity-like instrument issued (Series B preferred, warrant, convertible note)
- Modification of an existing instrument that changes redemption/settlement
- Re-evaluation when an SEC registration is contemplated (S-1 / S-4 disclosures)
- Year-end refresh on instruments with contingent triggers
- IPO conversion of redeemable preferred to common (mandatorily/contingently redeemable analysis)

## When NOT to use

- Plain-vanilla term loans (use `journal-entry-assistant` + amortization schedule)
- Operating leases (use `lease-842-assistant`)
- Stock-based compensation (ASC 718 — separate skill not in this suite)
- Variable-interest-entity consolidation (ASC 810)

## Authoritative sources

- **ASC 480** — Distinguishing Liabilities from Equity (mandatorily redeemable; obligation to issue variable number of shares for fixed monetary amount; written put)
- **ASC 815-10 / 815-15** — Derivatives and embedded-derivative bifurcation
- **ASC 815-40** — Contracts in Entity's Own Equity — "indexed to" + "settled in" two-step
- **ASC 470-20** — Debt with Conversion and Other Options (ASU 2020-06 simplified)
- **SEC 5-T (ASR 268) / ASC 480-10-S99** — Mezzanine (temporary equity) for redeemable preferred stock
- **ASC 825** — Fair Value Option election (some entities elect this for hybrid instruments)

## Inputs

### Instrument summary YAML — `--instrument <path>` (required)

```yaml
instrument_id: SERIES-B-PREF
description: Series B Convertible Preferred Stock
issuer: ABC Corp
issue_date: 2024-03-15
par_value: 0.0001
shares_issued: 1000000
proceeds: 10000000

# Redemption
mandatorily_redeemable: false          # ASC 480-10-25-4
redeemable_at_holder_option: true       # mezzanine flag (SEC 5-T)
redeemable_on_contingency: false        # contingent redemption
redemption_date: 2031-03-15
redemption_price: 10.00
holder_redemption_outside_issuer_control: true   # critical for mezzanine

# Conversion
convertible: true
conversion_ratio: 1.0                    # shares of common per share preferred
conversion_price: 10.00
beneficial_conversion: false             # ASU 2020-06 mostly eliminated BCF
contingent_conversion_trigger: null

# Settlement
settlement_form: shares                  # cash | shares | choice_of_either
fixed_for_fixed: true                    # ASC 815-40 indexed-to-own-equity test
variable_share_count_for_fixed_monetary_amount: false  # ASC 480-10-25-14

# Embedded features
embedded_features:
  - type: conversion_option
    strike: 10.00
    clearly_and_closely_related: false   # ASC 815-15 bifurcation test
  - type: put_at_holder_option
    strike: 10.00

# Dividends
dividend_rate_pct: 0.08
dividends_cumulative: true
dividend_payable_in_kind: false

# Other
written_put_or_forward_purchase_on_own_shares: false
freestanding_or_embedded: embedded       # important for ASC 815-40 scope
```

### Optional parameters

| Flag | Default | Description |
|---|---|---|
| `--output-xlsx` | required | XLSX workpaper |
| `--output-docx` | optional | DOCX memo (IRAC format) |
| `--issuer-is-sec-registrant` | `false` | If true → ASC 480-10-S99 (mezzanine) is in scope |

## Workflow — Decision Waterfall

```
INSTRUMENT
   │
   ▼
[1] ASC 480 — mandatorily redeemable share?
        - Unconditional obligation to redeem at a specified or determinable date
          (e.g., fixed maturity)?
        - Issuer cannot avoid?
   YES → LIABILITY (ASC 480)   stop.
   NO  → continue
   │
   ▼
[2] ASC 480 — obligation to issue variable number of shares for fixed monetary value?
        - "$1M of common stock" → liability
   YES → LIABILITY (ASC 480-10-25-14)   stop.
   NO  → continue
   │
   ▼
[3] ASC 480 — written put or forward purchase on entity's own shares?
   YES → LIABILITY (ASC 480-10-25-8)    stop.
   NO  → continue
   │
   ▼
[4] EMBEDDED DERIVATIVE — does the host have embedded features that
       are not "clearly and closely related" to the host?
   - If conversion option in debt host: hybrid — ASC 815-15
   - If freestanding warrant: ASC 815-40
   ▼
[5] ASC 815-40 — "Indexed to own equity" + "settled in own equity"
       Two-step test:
       a) Indexed: settlement amount equals fixed amount or variable based
          only on inputs to a fixed-for-fixed forward/option pricing
       b) Equity-settled: net share settlement / physical settlement;
          no cash settlement under any circumstances issuer can't control
   FAILS either step → LIABILITY (mark to FV through P&L)
   PASSES → CONSIDER MEZZANINE step
   │
   ▼
[6] SEC ASC 480-10-S99 — Redemption outside issuer's control?
   (Applies ONLY to SEC registrants)
       - Redeemable at holder option, OR
       - Redeemable on event NOT solely in issuer's control (e.g., IPO,
         change of control, regulatory)
   YES → MEZZANINE (temporary equity)
        accrete to redemption value over period to redemption
   NO  → continue
   │
   ▼
[7] PERMANENT EQUITY
   - Stock dividends / accretion through equity (not P&L)
   - Convertible features under ASU 2020-06: usually a single instrument unless
     substantial premium gives separate BCF (rare post-ASU 2020-06)
```

## Edge cases

| Scenario | Handling |
|---|---|
| **SAFE / Y-Combinator instrument** | Often a forward on own shares → ASC 480 liability OR ASC 815-40 freestanding analysis; document election |
| **Conversion price reset (down-round protection)** | ASU 2017-11 made some "indexed" — still requires the 815-40 two-step |
| **PIK dividend (in-kind)** | Doesn't trigger liability classification alone; classify the host first |
| **Contingent redemption on IPO** | IPO is outside issuer's control → mezzanine on issuance |
| **Dual-class voting share** | Voting rights don't affect classification (substance over voting) |
| **Convertible debt — ASU 2020-06** | Cash conversion accounting eliminated; usually one unit of account; document |
| **Net-share settlement option that allows cash on bankruptcy** | Cash settlement on bankruptcy alone is OK (815-40-25-7) |

## Anti-patterns (DO NOT)

- **DO NOT** stop at "labeled preferred" without running the waterfall — substance over form
- **DO NOT** classify holder-puttable shares as permanent equity for an SEC registrant
- **DO NOT** ignore embedded derivatives in convertible debt — they may need bifurcation
- **DO NOT** apply BCF guidance (most was retired in ASU 2020-06)
- **DO NOT** auto-convert mezzanine to permanent at IPO — re-examine settlement form

## Outputs

### XLSX workpaper

| Sheet | Contents |
|---|---|
| `Summary` | Instrument ID, classification, proceeds, key terms |
| `DecisionTree` | Step-by-step result for each gate (#1-#7) with Y/N + rationale |
| `EmbeddedFeatures` | Per feature: type, C&CR? clearly-and-closely-related, bifurcation conclusion |
| `JEShell` | Initial recognition JE (Cash / DR or CR depending on classification) |
| `Mezzanine_Accretion` | If applicable — accretion schedule from carrying value to redemption value |
| `References` | ASC paragraph cites |
| `AuditTrail` | Inputs, parameters, timestamp |
| `SignOff` | Preparer / Reviewer / Controller |

### DOCX memo (IRAC)

- **Issue** — should `<instrument>` be classified as Liability, Mezzanine, or Permanent Equity?
- **Rule** — relevant ASC citations
- **Analysis** — application of the waterfall step-by-step
- **Conclusion** — classification + JE
- Times New Roman 12pt

## Quality gates

1. [ ] Every Y/N branch in the decision tree has a documented basis in the instrument terms
2. [ ] If mezzanine: accretion schedule populated and ties to memo
3. [ ] Embedded-derivative bifurcation analysis completed for hybrid instruments
4. [ ] Cross-check against issuance documents (subscription agreement, COD)
5. [ ] Tech-accounting reviewer signs off before posting

## Worked example

`examples/series_b_preferred.yaml`:

- Series B redeemable preferred at holder option (after 5 years)
- Convertible into common 1-for-1
- Issuer is a private company expecting IPO
- 8% cumulative dividend

Running:

```bash
python scripts/classification_logic.py \
  --instrument examples/series_b_preferred.yaml \
  --output-xlsx /tmp/series_b.xlsx \
  --output-docx /tmp/series_b_memo.docx \
  --issuer-is-sec-registrant true
```

Expected: Step 1-4 fail (not mandatorily redeemable, fixed monetary not variable), Step 5 passes (fixed-for-fixed), Step 6 triggers (redeemable at holder option, outside issuer control) → **Mezzanine (Temporary Equity)** with accretion from issuance to redemption.

## References

- FASB — [ASC 480 Codification](https://asc.fasb.org)
- AICPA — [Liabilities and Equity audit interpretive guide](https://us.aicpa.org)
- KPMG — [Distinguishing Liabilities from Equity handbook](https://kpmg.com)
- Deloitte — [Roadmap: Distinguishing Liabilities from Equity](https://www.iasplus.com)
