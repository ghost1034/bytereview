---
name: individual-tax-researcher
description: Research Form 1040 issues (QBI §199A, PAL §469, basis, residency, wash sales) into an IRAC dossier
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [tax, individual, research]
    category: tax
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Individual Income Tax Researcher

Generate a structured IRC-focused **individual tax research dossier**: IRAC DOCX memo (Times NR 12 pt) capturing issue framing, enumerated research checkpoints, synthesized findings stubs, plus an XLSX plan grid aligned to `./scripts/research_orchestrator.py --domain individual`.

---

## Overview

| | |
|---|---|
| **Target user** | Family office tax advisor, Wealth planning counsel, PCA preparer escalation desk |
| **Maturity** | Production scaffolding; authoritative answers require primary IRC / Publications / notices review |
| **What it does** | Expands YAML into multi-step research choreography; cites Subtitle A + regs pattern list in Rule section shells |
| **What it does NOT do** | Calculate actual Form 1040 outputs; automate AMT interplay; ingest state conformity matrices unless you extend YAML narrative |

## When to use

- Executive relocation / residency transition planning memos (domicile considerations narrative)
- Stock option / RSU withholding vs. supplementary rate guidance requests
- QBI aggregation & SSTB classification brainstorming
- Charitable deduction substantiation thresholds after law changes

## When NOT to use

- Payroll employment tax withholding calcs for large populations (use payroll engines)
- International individual cross-border treaties without OECD residency tie-break analysis layers
- Tax court litigation strategy dossiers (bring counsel workflow)

## Authoritative sources

- **IRC Subtitle A** — Income taxes ( operative sections depending on facts)
- **Treas. Reg. §1** series — Ordinary income characterization and timing
- **IRS Publications / Chief Counsel Guidance** — practical interpretation (secondary but useful)
- **TCJA / IRC §§199A**, **§461(l)** hotspots — annotate when materially relevant *(verify current statutes)*

(Script metadata search prefix string: **`individual income tax IRC`**.)

## Inputs

### Query YAML (`--query`)

Same structural contract as sibling orchestrators:

| Field | Role |
|---|---|
| `matter_id` | Traceability tag |
| `issue`/`question` | Issue paragraph |
| `research_questions` | Step explosions (order matters) |
| `preliminary_conclusion` | Placeholder verdict language |

Facts lists optional for your internal discipline even if DOCX templating currently emphasizes Issue text.

### CLI

| Requirement | Detail |
|---|---|
| `--domain individual` | Must match enumerated choice |
| `--output-docx` / `--output-xlsx` | Both mandatory per argparse |

Malformed YAML ⇒ `1`. Operational success ⇒ `0`. Tavily augmentation optional (`TAVILY_API_KEY`) with graceful degrade.

## Workflow

```
1. COLLECT taxpayer profile facts ( filing status hypotheses, PY AGI benchmarks ).
2. CAPTURE ambiguity drivers (timing, character, sourcing, deductions vs credits ).
3. ENCODE prioritized research_questions ( narrow enough to cite discrete IRC subsections ).
4. RUN orchestrator + replace machine placeholders with cites (IRC § / Prop Reg / Notice ).
5. ALIGN conclusion with Circular 230 cover letter / disclaimer norms if advising clients.
```

## Edge cases

| Scenario | Guidance |
|---|---|
| AMT interplay | Separate question — simplistic memo won’t quantify dual-base |
| State piggybacking | Explicitly disclaim unless added questions |
| Net investment income tax | Mention Code path manually if thresholds borderline |
| Kid tax / kiddie rules | Specialized IRC blocks—don’t overload single generalized question |

## Anti-patterns (DO NOT)

- **DO NOT** treat Publication paraphrases as operative law when conflict exists with statute/reg
- **DO NOT** deliver planning conclusions omitting materially certain facts placeholders
- **DO NOT** mix corporate concepts (§245A, etc.) into individual skill path without refactoring YAML context
- **DO NOT** ignore penalty & accuracy-related exposure footnotes after aggressive positions

## Outputs

DOCX title: **Individual Income Tax Research Memo**. XLSX standard pack:

| Sheet | Role |
|---|---|
| `Summary` | Matter linkage / step tally |
| `ResearchPlan` | Structured grid for sign-off initials per step |
| `AuditTrail` | Generation timestamp footprint |

Formatting: DOCX TN 12 via script style mutation.

## Quality gates

1. [ ] IRC / reg citations current through engagement research cut-off date
2. [ ] Conflicts resolved between IRS FAQ vs regs (elevate hierarchical authority)
3. [ ] Sensitive PII sanitized from memo appendices circulated broadly
4. [ ] Practitioner licensing / Circular 230 statement attached if externally sent
5. [ ] Supporting Forms / worksheets referenced but not embedded if draft numbers fluctuate

## Worked example

From `individual-tax-researcher/`:

```bash
python scripts/research_orchestrator.py \
  --query examples/ind_query.yaml \
  --domain individual \
  --output-docx /tmp/ind_memo.docx \
  --output-xlsx /tmp/ind_plan.xlsx
```

Iterate `research_questions` until each maps to discrete authority blocks before client delivery.

## References

- IRS — IRC & regulations portal; Interactive Tax Assistant (sense-check only)
- US Congress — enacted text for post-reform deltas
- CCH / Checkpoint / WG&L annotated services (commercial citators — verify cites)
