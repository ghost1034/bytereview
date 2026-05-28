---
name: transfer-pricing-analyst
description: Perform FAR analysis, best-method selection, and benchmarking memo drafting under IRC §482 and OECD guidelines
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [tax, transfer-pricing, oecd]
    category: tax
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Transfer Pricing Analyst (Arm’s-Length & Contemporaneous Documentation)

Operationalize OECD-aligned **transfer pricing memo drafting** paired with structured research checkpoints across DEMPE, benchmarking study scope, method selection, CAP adjustments, APAs, and comparability pitfalls. Executes `./scripts/research_orchestrator.py --domain transfer-pricing` producing IRAC DOCX + plan grid.

---

## Overview

| | |
|---|---|
| **Target user** | International Tax Director, Economist / TP specialist, CFO governance |
| **Maturity** | Production for documentation spine + query orchestration — **econometric benchmarking** and legal opinions remain bespoke |
| **What it does** | Serializes investigative steps; injects scripted primary sources roster; merges optional Tavily-assisted snippets (`TAVILY_API_KEY`) |
| **What it does NOT do** | Run profit-level indicator regressions; file MAP / competent authority submissions; automate BEPS pillar modeling |

## When to use

- Yearly local file refresh before statutory TP disclosure deadlines
- Intercompany royalty / service recharge redesign after business model shift
- Defensive dossier drafting prior to OECD peer review questionnaires
- Scoping APA pre-filing brainstorming memos with counsel

## When NOT to use

- Pure customs valuation overlaps without dual-hypothesis structuring
- Domestic-only related-party dealings with no CTB risk (narrower tooling may suffice)

## Authoritative sources

- **IRC §482** — Allowable allocations to prevent avoidance / clearly reflect income
- **Treas. Reg. §1.482** — Best method rule & comparability hierarchies *(verify current CFR revision)*
- **OECD Transfer Pricing Guidelines** — DEMPE intangibles, risk control framework, APA guidance
- **US / treaty MAP articles** — when dispute resolution contemplated (human layer)

(Script lists: IRC §482, OECD Guidelines, §1.482.)

Domain search prefix baseline: **`transfer pricing arm's length OECD`**.

## Inputs

### Query YAML (`--query`)

| Field | Type | Purpose |
|---|---|---|
| `matter_id` | string | Memo header |
| `issue`/`question` | text | Seeds Issue § |
| `research_questions` | string list | Planned analytical checkpoints |
| `preliminary_conclusion` | text | Draft conclusion disclaimers |

### CLI

Requires `--domain transfer-pricing` plus paired `--output-docx` and `--output-xlsx`.

Exit semantics shared with sibling tax researcher skills (`1` ingestion, else `0`).

## Workflow — documentation decision tree

```
START
 │
 ├─ Is transaction pricing already covered by APA / rollback?
 │     YES → reference agreement scope; limit memorandum to factual change detection.
 │     NO  → continue
 │
 ├─ Identify controlled transaction category (tangibles, services, intangible, FIN).
 │
 ├─ Choose best-method hierarchy hypothesis (CUT, RPM, CPM, TNMM, APA-specific).
 │
 ├─ Define tested party functions/assets/risks profile (FAR qualitative matrix).
 │
 ├─ Draft comparability adjustments narrative (working capital, country risk, lifecycle).
 │
 ├─ Encode YAML research_questions per open method/topic thread.
 │
 ├─ RUN research_orchestrator.py --domain transfer-pricing (DOCX + XLSX).
 │
 └─ APPEND benchmarking tables & sensitivity charts before management sign circular.
```

## Workflow (operational)

```
1. MAP facts to DEMPE narrative (development, enhancement, maintenance, protection, exploitation).
2. SELECT tested party & profit level indicator hypotheses.
3. ENCODE interrogatories in YAML (compset filters, berry ratio vs. ROS vs. ROC tests).
4. RUN orchestrator; append economist charts manually after numeric study.
5. INTEGRATE local-file exhibits (master file / local benchmarks) referencing memo sections.
```

## Edge cases

| Scenario | Handling |
|---|---|
| Pillar Two / Amount B impacts | Extend questions manually — orchestrator cites classic OECD corpus only unless you edit |
| US vs. OECD divergence | Annotate divergence explicitly in conclusions |
| No live search snippets | Mandatory manual insertion of benchmarking summary tables externally |
| APA vs. transactional net margin | Separate questions to avoid methodological conflation |

## Anti-patterns (DO NOT)

- **DO NOT** assert arm’s-length outcome without benchmarking study linkage
- **DO NOT** omit loss-making comparables rationale if excluded—document rationale file
- **DO NOT** copy OECD plain-language paraphrases without verifying edition year citations
- **DO NOT** repurpose DOCX skeleton as audited local file appendix without Exhibit crosswalk

## Outputs

DOCX titled **Transfer Pricing Research Memo** (TN 12 pt). XLSX tabs: `Summary`, `ResearchPlan`, `AuditTrail` mirroring sibling skills.

### ResearchPlan Columns

Step / Question / Search Query / Canonical Source String / Findings excerpt or manual placeholder directive.

## Quality gates

1. [ ] Economist sign-off after PLI computations if quantitative claims asserted
2. [ ] Counsel review when §6662 documentation penalty defenses implicated
3. [ ] Version control on OECD paragraph citations (annual updates)
4. [ ] Tie-out tested party audited financial segmentation used in study
5. [ ] APA / rollback positions flagged if contemplated

## Worked example

From `transfer-pricing-analyst/`:

```bash
python scripts/research_orchestrator.py \
  --query examples/tp_query.yaml \
  --domain transfer-pricing \
  --output-docx /tmp/tp_memo.docx \
  --output-xlsx /tmp/tp_plan.xlsx
```

Replace findings cells with compset spreadsheets + penalty documentation cross-index before submission.

## References

- OECD — Transfer Pricing Guidelines (latest consolidated version + release notes)
- IRS — APA program guidance & MAP competent authority handbook
- UN — Practical Manual on Transfer Pricing (emerging markets comparables supplemental views)
