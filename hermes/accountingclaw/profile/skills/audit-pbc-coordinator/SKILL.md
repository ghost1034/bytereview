---
name: audit-pbc-coordinator
description: Track PBC requests with dependency-aware status reporting and burn-down
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

# Audit Prepared-by-Client (PBC) Coordinator

Ingest an audit-request tracker, normalize delivery statuses against an “provided/completed/delivered” vocabulary, quantify completeness, surface pending and overdue items against an `--as-of` cut-off, aggregate backlog by owning preparer, and publish an XLSX status dashboard suited to audit coordination stand-ups.

---

## Overview

| | |
|---|---|
| **Target user** | Internal Audit Liaison, Controller’s office, External audit PBC coordinator |
| **Maturity** | Production for operational tracking via `./scripts/pbc_tracker.py`; legal sufficiency / audit assertions remain with owners |
| **What it does** | Validates required columns; computes `% complete`, overdue sets, aging by owner averages, writes multi-tab workbook |
| **What it does NOT do** | Host evidence securely; certify audit readiness; automate confirmation letters; substitute for auditor’s PBC portals |

## When to use

- Weekly steering calls with external auditors through busy season
- Cross-functional visibility when dozens of numbered requests flood email
- SLA tracking by functional owner (“AP”, “Treasury”) with escalation messaging
- Go / no-go check before commencing fieldwork tranche

## When NOT to use

- Substantive testing or sampling design
- Sensitive evidence distribution (move to guarded sharepoint workflows)
- Real-time syncing with ticketing tools without export discipline

## Authoritative sources

- **PCAOB AS 2110**, **AS 2301** — nature and timing of audit evidence expectations
- **PCAOB AS 2201** — audit documentation completeness themes
- **COSO IC** — reliance on completeness and timeliness monitoring controls

## Inputs

### PBC tracker CSV/XLSX — `--tracker <path>` (required)

Columns lowercased on read.

| Column | Type | Required | Notes |
|---|---|---|---|
| `request_id` | string | Y | Stable ID from auditor numbering |
| `description` | string | Y | Work request description |
| `owner` | string | Y | Responsible internal party |
| `due_date` | date | Y | Parsed by pandas (`YYYY-MM-DD` recommended) |
| `status` | string | Y | Matching to provided set is **case-insensitive** after trim |
| `priority` | string | N | Default `Normal` if absent |

Provided / complete statuses counted as fulfilled: **`provided`**, **`complete`**, **`delivered`** (`status_norm ∈ PROVIDED_STATUSES`).

### Parameters

| Flag | Required | Description |
|---|---|---|
| `--tracker` | Y | Source listing |
| `--as-of` | Y | Evaluation date `YYYY-MM-DD` |
| `--output` | Y | Destination XLSX |
| `--quiet` | N | Reduce logging chatter |

Pending = rows whose normalized status ∉ provided set.

Overdue = pending rows with `due_date < as-of` (exclusive of same-day completeness logic — confirm policy if borderline).

Exit codes: `0` clean (no overdue); `2` if any overdue rows exist; `1` ingestion failure.

## Workflow

```
1. IMPORT auditor PBC list + internal supplements into tracker template.
2. NORMALIZE statuses to consistent vocabulary (“In Progress”, “Provided”, etc.).
3. RUN coordinator with weekly as-of cadence snapshot.
4. REVIEW Pending & OwnerSummary tabs → assign escalation owners.
5. CLEAR Overdue BEFORE next auditor touchpoint OR document blocker narrative.
```

## Edge cases

| Scenario | Handling |
|---|---|
| Malformed dates | Parsed to NaT → may distort overdue logic; fix upstream rows |
| Status synonyms like “Uploaded” | Not counted as provided unless renamed or mapping extended in code |
| Past-due completed item | Moves out of overdue because status now in PROVIDED_STATUSES |
| Owner churn | Consolidate owner strings before rollup to prevent split metrics |

## Anti-patterns (DO NOT)

- **DO NOT** mark “Provided” before files exist in auditor workspace
- **DO NOT** ignore exit code `2`; treat overdue as escalation signal automatically
- **DO NOT** delete historical rows unless auditor agrees PBC versioning scheme
- **DO NOT** use dashboard alone as SOC / SOX evidence without backing logs

## Outputs

| Sheet | Contents |
|---|---|
| `Summary` | Counts & percent complete vs total |
| `Pending` | Open items with engineered `days_overdue` scalar |
| `Overdue` | Strict subset overdue vs as-of snapshot |
| `OwnerSummary` | Pending counts + average overdue days grouped by owner |
| `AuditTrail` | Timestamp |
| `SignOff` | Audit Coordinator / Controller / External Auditor scaffolding |

## Quality gates

1. [ ] Tracker row count matches auditor master list version ID
2. [ ] Every pending item has target delivery date and named backup
3. [ ] Overdue lines include documented mitigation (data dependency, system outage, etc.)
4. [ ] Sign-off occurs only after evidence drop confirmation for material items
5. [ ] Archival copy of weekly dashboard stored in audit evidence tree

## Worked example

From `audit-pbc-coordinator/`:

```bash
python scripts/pbc_tracker.py \
  --tracker examples/pbc_tracker.csv \
  --as-of 2024-05-15 \
  --output /tmp/pbc_status.xlsx
```

If any pending request predates `2024-05-15`, expect `exit 2` to trip automation alerts.

## References

- AICPA — Audit documentation & PBC best practice updates
- Big 4 — Audit delivery center toolkits (align naming with vendor portal exports)
