---
name: partnership-tax-researcher
description: Research Subchapter K issues (§704(b)/(c), §752 liabilities, §754/§743/§734 basis, tax-basis capital) into an IRAC dossier
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [tax, partnership, research]
    category: tax
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Partnership Tax Researcher (Subchapter K)

Orchestrate a **partnership / LLC tax** research workbook and IRAC DOCX covering allocations, disguised payments, disguised sale risk, shifting liabilities, §704(b) vs. §704(c), capital account layering, LTIP / carried interest overlays, §751 hot asset triggers, §707 payments, distributions, disguised-sales tests, remedial allocations (high-level scaffolding). Executes `./scripts/research_orchestrator.py --domain partnership`.

---

## Overview

| | |
|---|---|
| **Target user** | Investment management tax SME, PAS partner, transactional M&A integrations |
| **Maturity** | Production for documentation skeleton + query scaffolding; nuanced partnership agreement parsing remains bespoke |
| **What it does** | Iterates investigative prompts; cites Subchapter K anchor list in DOCX Rule section scaffolding |
| **What it does NOT do** | Compute §704(b) layering spreadsheets; certify anti-abuse regimes without facts matrix |

## When to use

- Draft admission / liquidation waterfall stress tests before treaty counsel review
- Restructuring blocker analysis for targeted capital account “book / tax” misalignments
- Due diligence on historic non-pro rata allocations after operator turnover
- Anticipatory §743(b) adjustment policy evaluation narratively

## When NOT to use

- Publicly traded partnerships specialized regimes without expanding YAML question set
- International partnership withholding / FIRPTA cross issues unless manually layered
- Investor-only FATCA classifications where scope diverges materially

## Authoritative sources

- **IRC Subchapter K** — Partnership tax framework
- **IRC §704** — Special allocations fundamentals
- **IRC §707** — Disguised sales & transactions between partnership and partners
- **IRC §751** — Hot asset recharacterizations on disposition / redemption
- **IRC §743 / §734** — Basis adjustments (external modeling expected)

(Search prefix seeded as **`partnership tax IRC subchapter K`**. Orchestrator cites these strings in workbook plan rows.)

## Inputs

### YAML schema (`--query`)

| Token | Intended use |
|---|---|
| `matter_id` | e.g., `PSHIP-ADM-OPS-ROLL-2025` |
| `issue`/`question` | Partnership formation / mod / liquidation fact pattern teaser |
| `research_questions` | Fine-grained K questions list |
| `preliminary_conclusion` | Controlled statement pending agreement parse |

### CLI Invocation

Mandatory flags: `--query`, `--domain partnership`, mirrored DOCX + XLSX outputs.

Exit semantics: ingestion errors `1`; else `0`. Optional Tavily search identical to sibling modules.

## Workflow

```
1. INVENTORY operative agreement excerpts (distribution tiers, IRR hurdles, clawbacks ).
2. MAP economic vs tax allocations across layers (§704(b) GAAP-ish vs §704(c) ).
3. LIST discrete research_questions keyed to statutory provisions + anti-abuse awareness.
4. RUN orchestrator; embed partnership counsel markup after privilege review gates.
5. RECONCILE preliminary conclusion vs. modeled capital account waterfalls (external XLSX).
```

## Edge cases

| Scenario | Handling directive |
|---|---|
| **Series LLC / blocker tiers** | Decompose factual layers before question burst |
| **Publicly traded partnership** | Add explicit IRC references manually—base pack generic |
| **§1061 recharacterization / holding periods** | External specialist overlay |
| **Optionality / profits interests** | Ensure separate investigative branch question lines |

## Anti-patterns (DO NOT)

- **DO NOT** assert economic substance of allocations without referencing agreement waterfalls
- **DO NOT** treat §704(c) negligible when built-in shifts exist—even small dollars can distort exits
- **DO NOT** ignore disguised-sale tests when leveraged distribution recycles occur contiguous to contributions
- **DO NOT** publish draft memo externally without sanitizing LP identities

## Outputs

DOCX title: **Partnership Tax Research Memo** (TN 12 pt). XLSX: `Summary`, `ResearchPlan`, `AuditTrail`. ResearchPlan `Sources` column concatenates scripted primary bullet string for traceability—not a cite list replacement.

Recommended attachments: annotated partnership agreement excerpts (privileged), capital account spreadsheets, hypo liquidation schedules.

### Optional downstream exhibits (manual)

| Exhibit | Typical content |
|---|---|
| A | Organizational chart / entity classification snapshot |
| B | Contribution & distribution chronological ledger |
| C | Allocation waterfall schematic (economics vs. tax layers) |
| D | Hypothetical liquidation balance proof vs. regs ordering rules |
| E | COD / disguised-sale facts matrix keyed to enumerated safe harbors |

Number exhibits consistently with auditor request indexes when recycling memo sections across fiscal years.

## Documentation retention

Store DOCX/XLSX plus underlying YAML revision hash in immutable evidence storage; partnership controversies stretch multi-year cycles where provenance sequencing matters materially.

## Quality gates

1. [ ] Operating agreement cites match clause numbering in diligence binder
2. [ ] Modeling tie-out after §704(b) & §704(c) layering adjustments reviewed by PAS SME
3. [ ] Anti-abuse (substantial valuation misstatement pathways) escalation matrix completed for aggressive structuring
4. [ ] Disclosure / PFIC / FIRPTA cross-walk flagged if inbound investors heterogeneous
5. [ ] Memo version hashing matched to finalized distribution policy board resolution date

## Worked example

From `partnership-tax-researcher/examples/part_query.yaml`:

```bash
python scripts/research_orchestrator.py \
  --query examples/part_query.yaml \
  --domain partnership \
  --output-docx /tmp/pship_memo.docx \
  --output-xlsx /tmp/pship_plan.xlsx
```

Augment YAML with clause-specific footnotes correlating statutory tests (disguised sale safe harbors, substantiality, etc.) before LP communication.

## References

- IRS — Partnership audit regime (BBA) interplay checklists *(verify current procedural layers)*
- ABA — Partnership tax portfolios & treatises modules
- WG&L / Checkpoint — Subchapter K navigators used as citator accelerators—not sole authority
