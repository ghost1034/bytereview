---
name: tech-accounting-memo
description: Draft an IRAC technical accounting memo (DOCX, Times New Roman 12pt) with ASC and IFRS citation scaffolding
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, memo, technical]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Technical Accounting Memo Drafter

Transform structured transaction facts YAML into an **IRAC** (Issue / Rule / Analysis / Conclusion) technical memo as a **DOCX with Times New Roman 12 pt Normal style**, supplemented by an optional XLSX metadata summary sheet for versioning and audit trail references.

---

## Overview

| | |
|---|---|
| **Target user** | Technical Accounting Manager, Controller, External reviewer |
| **Maturity** | Production scaffold via `./scripts/memo_drafter.py`; substantive positions require human authoring and corroborating citations beyond embedded ASC snippets |
| **What it does** | Applies global font normalization; echoes facts & issues bullets; attaches canned interpretive anchors for selectable ASC shorthand keys |
| **What it does NOT do** | Produce SEC filing wording; cite every relevant subtopic; quantify lease remeasurements or valuations inside the drafting engine |

## When to use

- Controlled documentation package at transaction announcement (ASC 842/606/805/480/815 pattern library)
- Consistent typography for internal policy committee submissions
- Baseline DOCX skeleton before partner redlines
- Archival artifact alongside signed PDF after review routing

## When NOT to use

- IFRS conversions without rewriting Rule section
- Public registration statements relying solely on scripted boilerplate
- Situations banning machine-generated filings without watermark + approval matrix

## Authoritative sources

- **ASC 606** — Revenue from Contracts with Customers
- **ASC 842** — Leases (additional embedded paragraph stub on modifications)
- **ASC 805** — Business Combinations
- **ASC 480** — Distinguishing Liabilities from Equity
- **ASC 815** — Derivatives scope / embedded derivatives (high-level only)

(Script keys: `ASC 606`, `ASC 842`, `ASC 805`, `ASC 480`, `ASC 815`, else fallback string.)

## Inputs

### Facts YAML — `--facts <path>` (required)

| Field | Type | Required | Purpose |
|---|---|---|---|
| `transaction_id` | string | N | Memo header lineage |
| `title` | string | N | H1 fallback “Technical Accounting Memo” |
| `standard` | string | N | Drives canned Rule excerpt selection |
| `issuer` | string | N | Party context paragraph |
| `issues` | list | N | Bulleted Issues section; else generic prompt |
| `facts` | list | N | Bulleted enumerated facts feeding Analysis prelude |
| `conclusion_requested` | text | N | Conclusion § draft language |

Optional `--output-xlsx` writes ancillary summary (`Summary`, `AuditTrail`).

### Flags

| Flag | Required | Description |
|---|---|---|
| `--facts` | Y | YAML path |
| `--output-docx` | Y | Target memo path |
| `--output-xlsx` | N | Optional secondary artifact |
| `--quiet` | N | Logging verbosity |

Exit: `0`; invalid YAML/OS errors → `1`.

## Workflow

```
1. CAPTURE transaction facts faithfully (dates, counterparties, unit of account hypotheses).
2. SELECT appropriate `standard` key or plan manual Rule overrides post-generation.
3. RUN memo_drafter to instantiate IRAC scaffolding.
4. REPLACE bracketed illustrative journal lines with finalized amounts once measured.
5. LEGAL / SEC reviewer layers incremental citations & risk factors not auto-generated.
6. ROUTE for sign-off storing DOCX SHA + reviewer initials in ECM.
```

## Edge cases

| Scenario | Handling |
|---|---|
| Standard not in citation map | Generic Rule paragraph substituted |
| Empty issues list | Boilerplate interrogative referencing standard |
| Additional standards implicated | Document cross-reference manually (script single-topic) |
| Illustrative JE lines present | Explicitly flagged “not for posting” |

## Anti-patterns (DO NOT)

- **DO NOT** present generated memo as finalized without watermark removal ritual and signature
- **DO NOT** remove human Rule expansion when stakes are qualitative (earn-outs, repos)
- **DO NOT** confuse stub ASC 842 remeasure paragraph with full quantitative model output
- **DO NOT** skip optional XLSX if governance requires linkage from evidence index IDs

## Outputs

### DOCX

Sections: Heading (title level 1); metadata paragraphs; Issue; Rule + ethics reminder; Analysis (Facts bullets + scripted interpretive scaffolding); Conclusion incl. illustrative `[amount TBD]` journal lines.

Formatting: `_apply_font` sets Normal style to Times New Roman 12 pt (**requirement mandated by `./ARCHITECTURE.md`**).

### Optional XLSX

| Sheet | Purpose |
|---|---|
| `Summary` | Transaction linkage & counts snapshot |
| `AuditTrail` | Generation metadata keys |

*(Sheets minimalist — expand downstream if syncing with workbook governance.)*

## Quality gates

1. [ ] Every fact bullet cites supporting agreement / calculation pointer
2. [ ] Appropriate ASC paragraph-level cite added manually where script only names topic
3. [ ] JE amounts reconciled with parallel model workbook
4. [ ] Disclosure team looped if conclusion affects MD&A KPI metrics
5. [ ] Controlled copy naming convention (`TECH-MEMO-{ID}-r{REV}.docx`)

## Worked example

From `tech-accounting-memo/`:

```bash
python scripts/memo_drafter.py \
  --facts examples/lease_modification.yaml \
  --output-docx /tmp/lease_mod_memo.docx \
  --output-xlsx /tmp/lease_mod_memo_index.xlsx
```

Bundled YAML models an ASC 842 modification fact pattern triggering additional embedded paragraph referencing ASC 842-10-25-8.

## References

- FASB Codification Portal — authoritative ASC text lookups
- AICPA — Technical inquiry documentation standards
- Big 4 — Technical accounting bulletin comparables (post hoc benchmarking)
