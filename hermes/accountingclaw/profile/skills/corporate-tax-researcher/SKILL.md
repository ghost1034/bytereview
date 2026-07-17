---
name: corporate-tax-researcher
description: Research Form 1120 issues (M-1/M-3, §382 NOLs, §163(j), R&D, GILTI/FDII) into an IRAC dossier
version: 0.1.0
metadata:
  hermes:
    tags: [tax, corporate, research]
    category: tax
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Corporate Income Tax Researcher

Produce a cohesive **corporate federal income tax** research dossier marrying ASC 740 book concepts with IRC substantive questions (rates, NOLs, FTC, dividends-received deduction, §382 overlays, etc.). Entry point `./scripts/research_orchestrator.py --domain corporate`.

---

## Overview

| | |
|---|---|
| **Target user** | Corporate Tax Director, Provision lead, Technical tax counsel |
| **Maturity** | Production scaffolding; quantitative models (382 study, FTC limitation) imported externally |
| **What it does** | Threads Issue / Rule / Analysis / Conclusion with enumerated search stems + optional automated snippet harvest |
| **What it does NOT do** | Run return compliance software integrations; reconcile book-to-return mapping sheets automatically |

## When to use

- Post-deal integration structuring (earn-out vs. §338 election implications narrative)
- ETR anomaly root-cause brainstorming ahead of auditor challenge sessions
- NOL / FTC interaction conceptual framing after law changes or APAs
- Policy alignment before ASC 740 true-up disclosures referencing statutory drivers

## When NOT to use

- Solely partnership flow-through planning (see partnership skill)
- Local / state corporate nuances without parallel SALT scaffold
- Global minimum tax regime modeling specifics beyond scripted Rule cues

## Scope boundary vs. provisioning

This skill emits **research** layering; tying conclusions to deferred tax rolls belongs to `tax-provision-calculator` or enterprise provision systems. Treat cross-links explicitly: cite IRC drivers in DOCX narrative, then reconcile book entries under ASC 740 in a paired workpaper—not inside this orchestrator pipeline.

## Authoritative sources

- **IRC §11** — Corporate tax rates & brackets scaffolding
- **IRC §243** — Dividends received deduction regimes (subject to patchwork ownership tests)
- **IRC §382** — Loss limitation concepts after ownership shifts *(quantitative NOL schedule external)*
- **ASC 740** — Book recognition / disclosure interplay when bridging legal vs GAAP narratives

(Search prefix concatenation baseline: **`corporate income tax IRC`**.)

## Inputs

### Query YAML — column discipline

Maintain **one substantive question per `research_questions` row** wherever possible—overly bundled prompts reduce traceability during IRS exam IDR responses. Prefer ordering questions as: characterization → timing → sourcing → procedural elections → disclosures.

### Query YAML fields

| Field | Description |
|---|---|
| `matter_id` | E.g., `CORP-EARNOUT-STRUCT-2025` |
| `issue` / `question` | Single narrative seed |
| `research_questions` | Branching IRC topics list |
| `preliminary_conclusion` | Controlled draft statement pending deeper modeling |

Facts arrays optional depending on drafting discipline.

### CLI Contract

Mandatory trio: `--query`, `--domain corporate`, DOCX+XLSX output paths identical pattern to sibling skills.

Failures: malformed YAML/OS → `1`. Success → `0`. Optional Tavily augmentation identical mechanics.

## Workflow

```
1. FRAME transactional tax issue vs. systemic policy question (classification matters).
2. TAG relevant IRC pillars (basis, DRD, FTC, capitalization, COD, reorganizations ).
3. ENCODE sequentially dependent questions (ordering reflects logical dependency ).
4. RUN orchestrator; attach law firm memo PDFs externally if privileged.
5. RECONCILE tentative conclusion vs. ASC 740 measurement assumptions if book impact present.
```

## Edge cases

| Scenario | Guidance |
|---|---|
| **Consolidated return interplay** | Add explicit prompts — orchestrator snippets default to single entity lens |
| **Dual consolidated / fiscal year mismatch** | Document outside automated findings |
| **CAMT / book minimum tax** | Expand YAML manually to avoid oversimplified Rule text |
| **Cross-border hybrids** | Not default domain pack — escalate specialist memo |

## Anti-patterns (DO NOT)

- **DO NOT** treat ASC 740 mention inside Rule boilerplate as complete FIN 48 / interim guidance
- **DO NOT** assert §382 usability without capitalization table & NOL rollforward schedule
- **DO NOT** generalize consolidated vs separate company treatment without factual chart
- **DO NOT** ignore Sarbanes documentation when conclusion likely affects disclosures

## Outputs

DOCX heading: **Corporate Income Tax Research Memo** (TN 12 pt). Supporting XLSX: `Summary`, `ResearchPlan` (five-column grid capturing sources string & findings), `AuditTrail`.

Recommended manual annex: hyperlink matrix from each ResearchPlan row → PDF exhibit.

## Quality gates

1. [ ] IRC / reg cites verified post-Tax Alerts subscription cut-off date
2. [ ] Modeling spreadsheet version frozen & SHA logged opposite memo version
3. [ ] Litigation / APA risk tier assigned for aggressive positions list
4. [ ] Provision team confirms FRD / Cash tax alignment storyline
5. [ ] Disclosure committee briefed when ETR footnote sensitivities flagged

## Worked example

From `corp_query.yaml` sibling path (`corporate-tax-researcher/examples/corp_query.yaml`):

```bash
python scripts/research_orchestrator.py \
  --query examples/corp_query.yaml \
  --domain corporate \
  --output-docx /tmp/corp_memo.docx \
  --output-xlsx /tmp/corp_plan.xlsx
```

Substitute enumerated findings snippets with IRC quotes + treasury explanation references before audit committee briefing.

## References

- IRC & USC hosted archives (verify latest amendments)
- JCT Bluebook explanations for enacted legislation contextual color
- Big 4 year-end enterprise tax summaries (benchmarking—not primary law)
