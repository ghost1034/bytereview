---
name: month-end-close
description: Plan and review an accounting month-end close workflow
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, close, workpapers]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Month-End Close

## When to Use

Use this skill when preparing, reviewing, or documenting a monthly close package.

## Inputs

- Client entity and close period.
- Trial balance, general ledger, bank statements, credit card statements, loan statements, payroll reports, AR/AP aging, and prior close checklist.
- Materiality or review threshold if available.

## Procedure

1. Confirm the period, accounting basis, and close deadline.
2. Build a close checklist covering cash, credit cards, AR, AP, revenue, payroll, accruals, prepaids, fixed assets, debt, equity, and financial statements.
3. Identify accounts requiring reconciliation or flux review.
4. List missing support and aging items requiring follow-up.
5. Draft proposed journal entries only when supporting facts are present.
6. Summarize review points for CPA or controller sign-off.

## Output

Produce a close status summary with completed items, open items, proposed entries, and review notes.

## Verification

Confirm that cash and credit card balances tie to statements and that unresolved exceptions are listed separately.
