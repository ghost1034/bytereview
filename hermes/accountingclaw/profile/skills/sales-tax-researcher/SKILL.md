---
name: sales-tax-researcher
description: Monitor SALT nexus (economic and physical), product taxability, and exemption-certificate management
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [tax, sales-tax, nexus]
    category: tax
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Sales Tax Researcher (SALT Nexus & Taxability)

Drive a repeatable **research plan**—Issue / Rule / Analysis / Conclusion—in Times New Roman 12 pt DOCX, backed by an XLSX workpaper of planned queries, synthesized “findings” slots, and audit trail timestamps. Domain specialization: economic nexus, marketplace facilitator rules, product tax classification, filing cadence reminders. Primary runtime: `./scripts/research_orchestrator.py --domain sales-tax`.

---

## Overview

| | |
|---|---|
| **Target user** | Indirect Tax Manager, Billing Ops counsel, SaaS CFO advisor |
| **Maturity** | Production scaffolding; optional supplemental web snippets when `TAVILY_API_KEY` present—**manual primary-source corroboration is mandatory** |
| **What it does** | Expands YAML matter facts into enumerated research prompts; merges domain citations; writes DOCX + XLSX |
| **What it does NOT do** | Register taxpayer IDs; automate filing calendars; certify nexus thresholds without verifying current statutes/rules |

## When to use

- Multi-state rollout / remote worker footprint reviews
- New product SKU taxability questionnaires
- Renewal of reseller exemption certificate programs with risk scoring
- Pre-acquisition diligence on billed vs. collected exposures

## When NOT to use

- Income/franchise tax nexus debates without indirect tax lens
- International VAT design (distinct regulatory stack)
- Live rate engine configuration for invoicing ERPs

## Authoritative sources

- **Supreme Court — South Dakota v. Wayfair, Inc.** — economic remote seller nexus framework (interpret with current state statutes)
- **Multistate Tax Commission / Streamlined Sales Tax** — uniformity references (still verify each state SOS/DOR bulletin)
- **State Department of Revenue** — statutes, regulations, rulings (primary)
- **SSUTA**, **digital goods definitions** — as applicable once verified for each jurisdiction

(Script metadata lists: “State DOR statutes”, “Wayfair economic nexus”, “Streamlined Sales Tax”.)

## Inputs

### Query YAML — `--query <path>`

| Field | Type | Required | Purpose |
|---|---|---|---|
| `matter_id` | string | Recommended | Tracks memo lineage |
| `issue` or `question` | text | Implicit | Seeds Issue § |
| `facts` | list | N | Optional narrative bullets echoed if you extend downstream |
| `research_questions` | list | N | Each becomes a numbered analytical step |
| *(single fallback)* `question` | text | Alternate | Used if questions list omitted |
| `preliminary_conclusion` | text | N | Seeds Conclusion § |

Domain search prefix stitched automatically: **`state sales tax nexus taxability`**.

### CLI

| Flag | Required | Notes |
|---|---|---|
| `--query` | Y | YAML as above |
| `--domain sales-tax` | Y | Exactly this token |
| `--output-docx` | Y | IRAC DOCX artifact |
| `--output-xlsx` | Y | Research plan workbook |
| `--quiet` | N | Logging verbosity |

Failure to parse YAML ⇒ exit `1`. Successful runs ⇒ `0`. Live search silently skipped without API credential.

## Workflow

```
1. DEFINE factual matrix (employees, payroll, inventory, TTM sales state-by-state).
2. BUILD YAML with prioritized research_questions referencing unknown statutory tests.
3. RUN orchestrator capturing preliminary_conclusion disclaimers (“subject to…”).
4. SUBSTITUTE “Manual research required…” placeholders using official DOR sites.
5. PEER review by SALT SME + Legal before operational changes (rates, exemptions).
```

## Edge cases

| Scenario | Handling |
|---|---|
| **No API key** | Findings column defaults to guidance to perform manual sourcing |
| **Search exception** | Logged warning — still produces memo skeleton |
| **Nuanced SaaS vs. infra** | May need question split per state taxonomy — YAML supports many steps |
| **Marketplace facilitation** | Add explicit prompt — template does not infer platform status |

## Anti-patterns (DO NOT)

- **DO NOT** ship customer-facing billing changes from preliminary conclusion text alone
- **DO NOT** treat web snippets as substantive legal authority without citation upgrade
- **DO NOT** collapse multi-state nuances into single generic question when thresholds differ materially
- **DO NOT** forget home-rule locality overlays (note gap if not researched)

## Outputs

### DOCX (`DOMAIN_CONFIG["sales-tax"]`)

Title: **State and Local Tax (SALT) Research Memo** — Times NR 12 pt body; enumerated analysis per question referencing search stem + findings excerpt.

### XLSX

| Sheet | Purpose |
|---|---|
| `Summary` | Matter linkage + step tally |
| `ResearchPlan` | Columns Step / Question / Search Query / Sources / Findings |
| `AuditTrail` | Timestamp metadata |

## Quality gates

1. [ ] Official statute/reg links captured or printed & attached
2. [ ] Economic nexus threshold table updated to current thresholds & measurement periods
3. [ ] Remote worker / solicitation factors evaluated under each relevant state doctrinal overlay
4. [ ] Billing system owner acknowledges timing for rate/map changes post-conclusion

## Worked example

From `sales-tax-researcher/`:

```bash
python scripts/research_orchestrator.py \
  --query examples/nexus_query.yaml \
  --domain sales-tax \
  --output-docx /tmp/salt_memo.docx \
  --output-xlsx /tmp/salt_plan.xlsx
```

Bundled example (`SALT-NEXUS-TX-2024`) drills Texas remote SaaS posture with enumerated research_questions awaiting manual authority paste-in.

## References

- SST — streamlined registration reference materials
- AICPA / TEI — SALT committees & technical alerts
- State DOR portals (bookmark primary URLs per engagement)
