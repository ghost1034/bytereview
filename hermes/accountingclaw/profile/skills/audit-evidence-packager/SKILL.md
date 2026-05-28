---
name: audit-evidence-packager
description: Map PBC requests to evidence, validate completeness, tie schedules to GL, and produce auditor-ready packages
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, audit, pbc]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Audit Evidence Packager

Map auditor PBC (Provided-by-Client) requests to internal evidence files, validate each file (presence, freshness, naming, tie-out to GL totals), and produce a structured, indexed audit-ready package along with a readiness report.

---

## Overview

| | |
|---|---|
| **Target user** | Senior Accountant, Internal Audit, Audit Coordinator |
| **Maturity** | Production (file matching, validation, indexing); judgment-supported (substance review of evidence content) |
| **What it does** | Reads the auditor PBC list; scans the evidence repository for matching files; validates filename, freshness, file-type; ties schedule totals to GL where applicable; produces a readiness report XLSX and an indexed evidence package directory |
| **What it does NOT do** | OCR or substance-check the contents of bank statements / contracts (just confirms a file exists); redact PII (call out the requirement, but redaction is a separate step); send the package to the auditor portal |

## When to use

- Annual financial statement audit kickoff (Q1 mostly)
- Quarterly interim review readiness
- Bank / lender due-diligence requests
- SOX 404 evidence collection cycle
- Pre-audit dry-run before external auditor arrives

## When NOT to use

- Single-request lookups (just use the evidence repo directly)
- Confidential one-off requests that should not be in the same package as routine PBC (separate workflow)
- Investigations with chain-of-custody requirements (forensic protocols apply)

## Authoritative sources

- **PCAOB AS 1105** — Audit Evidence (definition of sufficient and appropriate evidence)
- **PCAOB AS 1215** — Audit Documentation (retention requirements)
- **AICPA AU-C §500** — Audit Evidence
- **AICPA AU-C §230** — Audit Documentation
- **SEC Rule 17a-5** — Broker-dealer record retention (where applicable)

## Inputs

### 1. PBC list — `--pbc <path>` (required)

CSV/XLSX. Required columns:

| Column | Type | Notes |
|---|---|---|
| `request_id` | string | PBC-### |
| `description` | string | What the auditor wants |
| `category` | string | Cash / AR / AP / FA / Debt / Revenue / Tax / HR / Other |
| `period_end` | date | Period being audited |
| `expected_filename` | string | Naming convention the auditor expects (or a pattern) |
| `expected_format` | string | pdf / xlsx / csv / docx / image |
| `gl_account` | string | (optional) account whose balance the evidence should tie to |
| `gl_balance` | float | (optional) expected GL balance for tie-out |
| `owner` | string | Internal owner |
| `due_date` | date | Internal due date |

### 2. Evidence repository — `--evidence-dir <path>` (required)

A directory containing one or more files (subdirectories OK). The script walks this tree recursively.

### 3. Tie-out helper — `--tie-source <path>` (optional)

CSV/XLSX with `gl_account, total` columns to validate `gl_balance` claims in the PBC.

### 4. Parameters

| Flag | Default | Description |
|---|---|---|
| `--package-dir` | required | Output directory; script creates a structured tree under it |
| `--output` | required | XLSX readiness report |
| `--similarity-threshold` | `80` | RapidFuzz score for fuzzy filename matching |
| `--freshness-days` | `45` | Warn if matched file mtime is older than this from `--period-end` |
| `--copy` | False | If set, copies files into the package directory; otherwise just indexes them |

## Workflow

```
1. LOAD
   - Parse PBC list and validate required columns
   - Walk evidence-dir to build file index (path, size, mtime, extension)
2. MATCH (per PBC request)
   IF expected_filename includes wildcards (*, ?), match via glob
   ELSE attempt exact stem match; fall back to fuzzy match (rapidfuzz.token_set_ratio)
   IF format mismatch (e.g., expected pdf but found xlsx) → WARN
   IF multiple candidates → use highest similarity; flag for manual review
3. VALIDATE (per matched file)
   - File size > 0 (not empty)
   - Extension matches expected_format
   - mtime within freshness window from period_end
   - For evidence tagged with gl_account + gl_balance:
       attempt to tie if --tie-source supplied (verify gl_balance matches authoritative GL)
4. STATUS DETERMINATION (per request)
   - Provided: file matched + all validations PASS
   - Provided with Issues: file matched but ≥1 WARN
   - Not Found: no match
   - Format Mismatch: matched a file but with wrong extension
5. PACKAGING
   IF --copy: copy each Provided file into package-dir/<category>/<request_id>_<expected_filename>
   ALWAYS: write an index.csv mapping request_id → path
6. ARTIFACT
   - XLSX: Summary / Status / Validation / TieOut / Missing / Audit Trail / SignOff
   - <package-dir>/index.csv
   - <package-dir>/<category>/... (if --copy)
```

## Edge cases

| Scenario | Handling |
|---|---|
| **Two files match a single request** (e.g., draft and final) | Pick file with most recent mtime; flag the other as "candidate alternative" |
| **Expected filename contains period embedded** (e.g., "bank_recon_dec.pdf") | Filename match is exact; freshness check still applies |
| **PII risk** (e.g., CEO expense report containing personal addresses) | Flag the request with `requires_redaction = True`; do NOT copy until redacted |
| **Sub-ledger total ≠ GL** | Surface in `TieOut` sheet as FAIL; recommend pre-audit reconciliation |
| **File too large to email** (>25 MB) | Note for auditor portal upload instead |
| **Folder reorganization mid-audit** | Index references stored paths at run time; re-running re-binds |
| **Encrypted file** (e.g., PDF with password) | Detect and warn |
| **Cross-period request** (e.g., 13-month trial balance) | Freshness check uses the LATER period_end |

## Anti-patterns (DO NOT)

- **DO NOT** auto-redact PII — that requires document-level review
- **DO NOT** silently substitute a similar file with a different name without flagging
- **DO NOT** mark "Provided" if the file is empty (0 bytes) or smaller than 1 KB (likely corrupted)
- **DO NOT** ship the package without the `index.csv` — auditors rely on it for traceability
- **DO NOT** include any file outside the requested scope (data-minimization principle)

## Outputs

### Readiness report XLSX

| Sheet | Contents |
|---|---|
| `Summary` | Total requests, # Provided, # Provided-with-Issues, # Not Found, % Complete |
| `Status` | One row per PBC: matched file, similarity, mtime, size, status |
| `Validation` | Each WARN/FAIL with reason (empty file / stale / wrong format / multiple candidates) |
| `TieOut` | Requests with `gl_account`/`gl_balance` — schedule total vs. GL with variance |
| `Missing` | Requests with no match — listed for AP/Accounting to chase |
| `AuditTrail` | Parameters, evidence directory, file counts, timestamp |
| `SignOff` | Preparer / Reviewer |

### Package directory

```
package-dir/
  index.csv         (request_id, expected_filename, matched_path, status)
  Cash/             (if --copy)
    PBC-101_bank_recon_dec.pdf
  AR/
    PBC-102_ar_aging_dec.xlsx
  ...
```

## Quality gates

1. [ ] Every Provided request has a non-empty file in the package
2. [ ] Every TieOut request reconciles to within $0.01 of GL
3. [ ] All Missing items have an owner and committed delivery date
4. [ ] PII-flagged items have been redacted before transmission
5. [ ] index.csv is included
6. [ ] Reviewer signs off on completeness before package goes to auditor

## Worked example

`examples/pbc_list.csv` lists 8 requests. The evidence directory `examples/evidence/` contains 6 files (one missing, one with wrong extension). Running:

```bash
python scripts/pbc_validator.py \
  --pbc examples/pbc_list.csv \
  --evidence-dir examples/evidence/ \
  --period-end 2024-12-31 \
  --tie-source examples/gl_balances.csv \
  --package-dir /tmp/audit_package_2024 \
  --output /tmp/pbc_readiness_2024.xlsx
```

Produces a 75% readiness report: 6 Provided, 1 Format Mismatch, 1 Not Found.

## References

- PCAOB — [AS 1215: Audit Documentation](https://pcaobus.org/oversight/standards/auditing-standards/details/AS1215)
- AICPA — [AU-C 500: Audit Evidence](https://us.aicpa.org)
- IIA — [Standards for the Professional Practice of Internal Auditing](https://www.theiia.org)
