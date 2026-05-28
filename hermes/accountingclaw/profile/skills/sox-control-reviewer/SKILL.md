---
name: sox-control-reviewer
description: Walkthrough review of SOX control narratives against evidence with IPE/IUC validation
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, sox, controls, audit]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# SOX Control Reviewer

Compare SOX control narratives against execution evidence — identifying design-effectiveness gaps (does the narrative meet the control objective?), operating-effectiveness gaps (does the evidence prove the control was performed as described?), and IPE/IUC reliability gaps in a structured, audit-ready workpaper.

---

## Overview

| | |
|---|---|
| **Target user** | Internal Audit, SOX Compliance team, Process Owner |
| **Maturity** | Production for attribute extraction and gap mechanics; judgment-supported for risk significance and root-cause |
| **What it does** | Parses control narratives into the 5-W structure (Who / What / When / Where / How); validates evidence against required attributes (preparer / reviewer / date / source system / completeness); produces a design + operating effectiveness assessment with a gap log |
| **What it does NOT do** | Determine whether a deficiency is a Significant Deficiency or Material Weakness — that's an audit-judgment escalation; replace TOD/TOE testing methodology; remediate the control |

## When to use

- SOX 404 walkthroughs (annual)
- TOE (Test of Operating Effectiveness) sampling reviews
- Pre-audit readiness — surfacing gaps before external auditors
- Onboarding a new control — designing the narrative against an evidence template

## When NOT to use

- ITGCs requiring SQL-level evidence pulls (those need a different testing approach)
- Entity-level controls (ELCs) measured by COSO surveys — qualitative
- Controls reliant on third-party SOC reports (read the SOC 1 instead)

## Authoritative sources

- **SOX §404** — Management's assessment of internal control over financial reporting (ICFR)
- **PCAOB AS 2201** — Audit of internal control over financial reporting that is integrated with an audit of financial statements
- **PCAOB AS 1105** — Audit Evidence
- **COSO Internal Control – Integrated Framework (2013)** — 17 principles and the Five Components
- **AICPA AU-C §940** — Auditor's communications related to ICFR

## Inputs

### 1. Control under review — `--control <path>` (required)

A TXT/MD/YAML file with at minimum:

```yaml
control_id: ACC-01
control_owner: AP Manager
frequency: weekly  # daily / weekly / monthly / quarterly / annual / event-driven
type: preventive  # preventive / detective
automation: manual  # manual / IT-dependent manual / automated
risk_addressed: |
  Risk that vendor payments are released without independent review.
control_objective: |
  Each weekly payment proposal is reviewed and approved by an authorized AP Manager
  before the payment file is transmitted to the bank.
narrative: |
  The AP Clerk prepares a weekly payment proposal in NetSuite. The AP Manager
  reviews the proposal for accuracy (vendor name, amount, GL coding) and approves
  it in the NetSuite approval workflow on Friday. Approval is evidenced by the
  system audit log showing approver user_id and timestamp.
required_attributes:
  - preparer_id
  - approver_id
  - prepared_date
  - approved_date
  - source_system
  - sample_period_coverage
ipe:
  - report_name: NetSuite Payment Proposal
    source: NetSuite ERP
    completeness_evidence: report header showing date range and record count
    accuracy_evidence: tie to AP sub-ledger total
```

### 2. Evidence sample(s) — `--evidence <path>` (required, can be repeated)

One or more files (TXT / CSV / YAML / image-metadata-as-text) representing the actual evidence. Each evidence file should provide:

```yaml
evidence_id: EV-2024-05-W3
control_id: ACC-01
sample_date: 2024-05-17
source_system: NetSuite
proposal_id: PAY-2024-022
attributes:
  preparer_id: clerk_jones
  approver_id: mgr_smith
  prepared_date: 2024-05-15
  approved_date: 2024-05-17
  amount_total: 142500.00
  record_count: 47
ipe_validation:
  report_complete: true
  ties_to_sub_ledger: true
  variance_to_sub_ledger: 0.00
notes: ""
```

### 3. Parameters

| Flag | Default | Description |
|---|---|---|
| `--sample-population` | `52` | Population size (e.g., 52 weeks for a weekly control) — informs expected sample size |
| `--required-sample-size` | `auto` | Override expected n; `auto` uses AICPA Audit Guide table (weekly→5, monthly→2 etc.) |
| `--output` | required | XLSX workpaper |

## Workflow

```
1. PARSE CONTROL
   - Extract 5-W: WHO (owner) / WHAT (narrative) / WHEN (frequency) / WHERE (system) / HOW (steps)
   - Extract required attributes and IPE expectations
2. PARSE EVIDENCE
   - Load each evidence file
   - Cross-reference each required_attribute → present? non-blank? date logic correct?
3. DESIGN EFFECTIVENESS ASSESSMENT
   - Narrative includes: control objective? frequency? preparer/reviewer roles? evidence type?
   - Risk addressed? Type (preventive/detective) declared?
   - Score: 0-5 per criterion; aggregate to "Effective" / "Deficient"
4. OPERATING EFFECTIVENESS ASSESSMENT (per evidence sample)
   - Approver != Preparer (segregation of duties)
   - approved_date >= prepared_date (logical sequence)
   - approved_date - prepared_date <= reasonable lag (e.g., 5 business days for weekly)
   - All required attributes populated
   - IPE: report_complete=True AND ties_to_sub_ledger=True
   - Aggregate per sample: PASS / WARN / FAIL
5. SAMPLE SIZE CHECK
   - Expected sample size by frequency (AICPA guide):
       Daily ≥ 25 / Weekly ≥ 5 / Monthly ≥ 2 / Quarterly ≥ 1 / Annual ≥ 1
   - WARN if evidence count < expected
6. GAP LOG
   - For each FAIL/WARN, write a row with (gap_type, evidence_id, attribute, expected, observed, severity)
7. ARTIFACT
   - XLSX: Summary / DesignAssessment / OperatingResults / GapLog / IPEValidation / AuditTrail / SignOff
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Same person prepares and approves** | Hard FAIL on segregation-of-duties |
| **Backdated approval** (approved_date < prepared_date) | Hard FAIL — date integrity violation |
| **Approval > 30 days after preparation** for a weekly control | WARN — process timeliness issue, not necessarily a control failure |
| **Missing IPE evidence on a report-based control** | FAIL — auditor cannot rely on the underlying data |
| **Sample count below expected** | WARN at the sample-size level, not an automatic FAIL of the control |
| **Compensating control referenced in narrative** | The skill won't evaluate the comp control transitively; it flags the reference for the reviewer to test separately |
| **Control performed but evidence not retained** | Hard FAIL — "if it wasn't documented, it didn't happen" |

## Anti-patterns (DO NOT)

- **DO NOT** conclude on Significant Deficiency / Material Weakness in this skill — that's a financial-magnitude and likelihood judgment (escalate per AS 2201 §61)
- **DO NOT** rely on narrative-only matches — every operating-effectiveness conclusion needs explicit evidence
- **DO NOT** combine TOD (design) with TOE (operating) into one binary verdict — they're separate per AS 2201
- **DO NOT** PASS a control where only the preparer's name is on the evidence — approval evidence is mandatory
- **DO NOT** assume "system controls" require less evidence — they require key-report evidence and IT general controls reliance documentation

## Outputs

### XLSX workpaper

| Sheet | Contents |
|---|---|
| `Summary` | Control ID, frequency, design verdict, operating verdict, sample count vs. expected, total gaps |
| `DesignAssessment` | Each design criterion (objective, frequency, roles, evidence type, IPE expectations) with PASS/FAIL and notes |
| `OperatingResults` | One row per evidence sample with each attribute check + the per-sample verdict |
| `GapLog` | All gaps with `gap_type`, severity, recommendation |
| `IPEValidation` | Per-IPE/IUC: report name, source, completeness/accuracy check results |
| `AuditTrail` | Parameters, control text hash, evidence files processed, timestamp |
| `SignOff` | Preparer (SOX analyst) / Reviewer (SOX manager) / Approver (Control Owner) |

## Quality gates

1. [ ] Narrative addresses the control objective and risk in plain language
2. [ ] Every required attribute has an explicit evidence field
3. [ ] At least the AICPA-table sample size has been tested
4. [ ] No sample exhibits a same-person preparer/approver (SoD)
5. [ ] IPE/IUC reports tie to authoritative sub-ledger totals
6. [ ] Gaps have a remediation owner and target date attached

## Worked example

`examples/control_acc01.yaml` documents the weekly AP payment approval control. `examples/evidence/` contains 5 weekly samples for May–June 2024. Running:

```bash
python scripts/sox_checker.py \
  --control examples/control_acc01.yaml \
  --evidence examples/evidence/ev_2024_05_W2.yaml \
              examples/evidence/ev_2024_05_W3.yaml \
              examples/evidence/ev_2024_05_W4.yaml \
              examples/evidence/ev_2024_06_W1.yaml \
              examples/evidence/ev_2024_06_W2.yaml \
  --output /tmp/sox_acc01.xlsx
```

Verdicts: Design = PASS; Operating = PASS for 4 samples, FAIL for 1 (SoD violation on the W4 sample where `preparer_id == approver_id`).

## References

- PCAOB — [AS 2201: An Audit of Internal Control Over Financial Reporting](https://pcaobus.org/oversight/standards/auditing-standards/details/AS2201)
- COSO — [Internal Control Integrated Framework (2013)](https://www.coso.org)
- AICPA — [Audit Guide: Audit Sampling](https://us.aicpa.org)
- Protiviti — [SOX Compliance: Sample Sizes Guidance](https://www.protiviti.com)
