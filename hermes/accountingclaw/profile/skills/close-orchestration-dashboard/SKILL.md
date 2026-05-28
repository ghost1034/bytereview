---
name: close-orchestration-dashboard
description: Track a dependency-aware month-end close with critical-path analysis and burn-down reporting
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, close, project-management]
    category: accounting
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: premium skill access
---

# Close Orchestration Dashboard

Mission-control view of the month-end close: task status, dependency blocking, overdue items, entity-level progress, and the critical path to reporting readiness.

---

## Overview

| | |
|---|---|
| **Target user** | Assistant Controller, Close Manager, Consolidation Lead |
| **Maturity** | Production for checklist ingestion, dependency graph, and critical-path analysis; human-in-the-loop for task completion attestation |
| **What it does** | Tracks close tasks with dependencies, flags overdue and blocked items, computes percent complete by entity, and outputs a multi-sheet XLSX dashboard |
| **What it does NOT do** | Post journal entries, auto-complete tasks, or integrate live with FloQast/BlackLine APIs |

## When to use

- Daily stand-ups during the close (Day 1–Day 10)
- Controller briefing on blockers before consolidation
- Post-close retrospective on critical-path delays
- Multi-entity close coordination (US + EMEA + consolidation)

## When NOT to use

- Substantive reconciliation work (use balance-sheet-reconciler)
- Audit PBC tracking (use audit-pbc-coordinator)
- One-off JE drafting (use journal-entry-assistant)

## Authoritative sources

- **COSO ICFR** — close process controls and segregation of duties
- **PCAOB AS 2201** — audit evidence on close procedures
- **AICPA Close Management best practices**

## Inputs

### Close checklist — `--checklist <path>` (required)

| Column | Type | Required | Notes |
|---|---|---|---|
| `task_id` | string | Y | Unique identifier |
| `task_name` | string | Y | |
| `owner` | string | Y | Responsible person/team |
| `due_date` | date | Y | YYYY-MM-DD |
| `status` | string | Y | `Complete`, `In Progress`, `Not Started` |
| `dependencies` | string | N | Comma-separated task_ids that must complete first |
| `entity` | string | N | US, EMEA, Consolidation, etc. |
| `day_target` | int | N | Close calendar day (used for critical-path weighting) |

### Parameters

| Flag | Default | Description |
|---|---|---|
| `--as-of` | required | Status evaluation date (YYYY-MM-DD) |
| `--output` | required | XLSX dashboard path |

## Workflow

```
1. LOAD checklist; validate required columns
2. NORMALIZE status (Complete/Done/Closed = complete)
3. OVERDUE = incomplete AND due_date < as_of
4. BLOCKED = incomplete AND any dependency not complete
5. CRITICAL PATH = longest path through dependency DAG (by day_target weight)
6. ENTITY SUMMARY = percent complete by entity
7. OUTPUT multi-sheet XLSX dashboard
8. EXIT 2 if overdue tasks exist (data-driven FAIL for automation)
```

## Edge cases

| Scenario | Handling |
|---|---|
| Circular dependencies | Topological sort may not reach all nodes; critical path uses reachable subgraph |
| Missing dependency task_id | Ignored (orphan reference logged in AuditTrail) |
| Task complete but downstream blocked on another branch | Only direct unmet dependencies block |
| Same owner on critical path | Flag in Bottleneck sheet for capacity review |

## Anti-patterns (DO NOT)

- **DO NOT** mark tasks Complete without substantive work performed
- **DO NOT** omit dependencies on consolidation tasks
- **DO NOT** use percent complete alone — review overdue AND blocked
- **DO NOT** treat "In Progress" as Complete for dependency resolution

## Outputs

| Sheet | Contents |
|---|---|
| `Summary` | Progress %, overdue, blocked, critical path string |
| `Tasks` | Full checklist with conditional formatting |
| `Overdue` | Incomplete past due |
| `Blocked` | Blocked by unmet dependencies |
| `EntitySummary` | Progress by entity |
| `CriticalPath` | Ordered task sequence |
| `AuditTrail` | Timestamp, as-of date |
| `SignOff` | Close Manager / Controller / CFO |

## Quality gates

1. [ ] All material close tasks included with owners and due dates
2. [ ] Dependencies reflect true process order (AP before IC elim, etc.)
3. [ ] Overdue items have escalation notes
4. [ ] Critical path reviewed with consolidation lead
5. [ ] Entity summary ties to reporting calendar

## Worked example

```bash
python scripts/close_tracker.py \
  --checklist examples/close_checklist.csv \
  --as-of 2024-05-04 \
  --output /tmp/close_dashboard.xlsx
```

On the bundled example, Fixed Asset Dep is overdue; Intercompany Elim is blocked pending tasks 3 and 4; critical path runs through AP → Bank → FA → Revenue → IC → Consolidation → Tax.

## References

- AICPA — [Close Management](https://us.aicpa.org)
- FloQast / BlackLine — close checklist best practices
