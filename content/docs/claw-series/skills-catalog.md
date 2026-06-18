---
title: "Skills catalog"
description: "The accounting skills AccountingClaw ships with, grouped by area, plus a deep-dive on how any one of them works end-to-end."
order: 6
---

AccountingClaw ships with two dozen accounting skills out of the box. You don't invoke them by name — you describe what you need in [chat](/docs/claw-series/using-accountingclaw) and AccountingClaw runs the right one. This page lists what's available so you know what to ask for, and ends with a deep-dive on one skill to show the pattern they all follow. To see the installed skills at any time, run `hermes skills list`.

## Reconciliation & close

| Skill | What it does |
| --- | --- |
| **balance-sheet-reconciler** | Reconciles a GL account to its supporting documentation with roll-forward, aging, and fuzzy matching. |
| **payroll-gl-reconciler** | Ties the payroll register to the GL by component and analyzes provider-versus-GL variance. |
| **intercompany-elimination-bot** | Matches cross-entity intercompany balances, isolates FX differences, and generates elimination JEs. |
| **close-orchestration-dashboard** | Tracks a dependency-aware month-end close with critical-path analysis and burn-down reporting. |

## Income statement & revenue

| Skill | What it does |
| --- | --- |
| **flux-variance-analyst** | Runs period-over-period flux analysis with top-driver extraction and controller-ready commentary. |
| **rev-rec-606-analyst** | Runs the five-step ASC 606 engine — performance-obligation identification, constraint, SSP allocation, monthly waterfall, and modifications. |

## Journal entries, provisions & estimates

| Skill | What it does |
| --- | --- |
| **journal-entry-assistant** | Drafts and balances multi-line journal entries with chart-of-accounts-driven Dr/Cr logic and ERP-ready upload templates. |
| **tax-provision-calculator** | Builds an ASC 740 income tax provision with current and deferred layering, DTA/DTL roll-forward, ETR reconciliation, and FIN 48 flags. |
| **reserves-estimator** | Estimates the CECL (ASC 326) allowance via aging-based loss rates with qualitative overlays and sensitivity analysis. |

## Financial reporting & technical accounting

| Skill | What it does |
| --- | --- |
| **debt-equity-reviewer** | Classifies preferred stock, warrants, SAFEs, and convertible debt via the ASC 480 and 815-40 decision tree. |
| **disclosure-footnote-assistant** | Drafts GAAP and SEC footnotes (debt, leases, income tax, segments) with cross-footing checks. |
| **lease-842-assistant** | Applies the ASC 842 lessee model — classification, present value, ROU asset and liability, amortization, modifications, and JE generation. |
| **tech-accounting-memo** | Drafts an IRAC technical accounting memo (Word) with ASC and IFRS citation scaffolding. |

## Fixed assets & policy compliance

| Skill | What it does |
| --- | --- |
| **fixed-asset-lifecycle-manager** | Handles capitalization, depreciation (straight-line, DDB, MACRS), impairment, disposal, and GL roll-forward for a fixed-asset register. |
| **expense-policy-reviewer** | Audits T&E reports against policy with category limits, missing-receipt and duplicate detection, and risk scoring. |
| **ap-exception-reviewer** | Detects duplicate invoices, coding inconsistencies, three-way-match exceptions, and approval-limit breaches. |

## Audit & controls

| Skill | What it does |
| --- | --- |
| **audit-pbc-coordinator** | Tracks PBC (prepared-by-client) requests with dependency-aware status reporting and burn-down. |
| **audit-evidence-packager** | Maps PBC requests to evidence, validates completeness, ties schedules to the GL, and produces auditor-ready packages. |
| **sox-control-reviewer** | Performs a walkthrough review of SOX control narratives against evidence with IPE/IUC validation. |

## Tax research

| Skill | What it does |
| --- | --- |
| **corporate-tax-researcher** | Researches Form 1120 issues (M-1/M-3, §382 NOLs, §163(j), R&D, GILTI/FDII) into an IRAC dossier. |
| **individual-tax-researcher** | Researches Form 1040 issues (QBI §199A, passive activity losses §469, basis, residency, wash sales) into an IRAC dossier. |
| **partnership-tax-researcher** | Researches Subchapter K issues (§704(b)/(c), §752 liabilities, §754/§743/§734 basis, tax-basis capital) into an IRAC dossier. |
| **sales-tax-researcher** | Monitors SALT nexus (economic and physical), product taxability, and exemption-certificate management. |
| **transfer-pricing-analyst** | Performs FAR analysis, best-method selection, and benchmarking memo drafting under IRC §482 and OECD guidelines. |

## Deep-dive: how a skill works

Every skill follows the same **prepare → review → sign-off** shape. The balance-sheet reconciler is a good example.

**What you give it:**

- A **GL export** for the account — a CSV or Excel file with `date`, `description`, and `amount` columns.
- A **support schedule** — the authoritative source you're reconciling against (a bank statement, sub-ledger detail, or amortization schedule), in the same format.
- *(Optional)* the **prior period's reconciliation**, so it can roll forward last period's open items and confirm they cleared.

**What you can tune:** the reconciliation **as-of date**, a **materiality** threshold (default $5,000) below which small unmatched items are aggregated, and the tolerances used for matching — amount, date, and description similarity. AccountingClaw applies sensible defaults if you don't specify them.

**What it does:** it validates both files, compares the GL balance to the support balance, matches transactions exactly and then by fuzzy match (within your tolerances), ages whatever is left over into 0–30 / 31–60 / 61–90 / >90-day buckets, rolls forward prior open items, and assigns a **PASS** or **FAIL** status.

**What you get back** — a multi-sheet Excel workpaper:

| Sheet | Contents |
| --- | --- |
| **Summary** | Account, as-of date, GL vs. support balance, variance, PASS/FAIL status, and unmatched counts. |
| **Detail** | Every GL and support row side-by-side with its match status. |
| **Unmatched** | Items in the GL but not the support (and vice versa), with age and aging bucket. |
| **Aging** | Aging-bucket totals by side. |
| **RollForward** | Prior open / cleared / still-open / newly-open items (when a prior period is supplied). |
| **AuditTrail** | The run parameters, input row counts, thresholds, and timestamp. |
| **SignOff** | Preparer / Reviewer / Approver lines for your sign-off. |

**Your review checklist:** confirm the GL balance ties to the trial balance, that the support is the authoritative source, that every unmatched item has a written explanation, that nothing aged over 90 days is left without approval, and that the sign-off is completed by two different people. AccountingClaw prepares the workpaper; **you review and sign it.**

Every other skill works the same way — give it your data, optionally tune the thresholds, and get back a structured deliverable ready for human review. To start, see [Working with AccountingClaw](/docs/claw-series/using-accountingclaw).
