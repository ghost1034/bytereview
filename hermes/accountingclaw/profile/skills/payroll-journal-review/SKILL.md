---
name: payroll-journal-review
description: Review payroll journal entries and payroll liability balances
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, payroll, journal-entry]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Payroll Journal Review

## When to Use

Use this skill when reviewing payroll journal entries, payroll clearing accounts, wage expense, employer taxes, benefits, or payroll liabilities.

## Inputs

- Payroll register, payroll journal report, cash withdrawals, liability payments, and general ledger detail.
- Pay period dates, check dates, and accounting period.

## Procedure

1. Confirm whether payroll is recorded by pay date, pay period, or accrual basis.
2. Tie gross wages, employee taxes, employer taxes, benefits, deductions, net pay, and fees to payroll provider reports.
3. Compare cash withdrawals to net pay, tax payments, benefit payments, and payroll fees.
4. Identify uncleared payroll liabilities, duplicate payroll entries, missing employer tax expense, misclassified wages, and timing differences.
5. Draft proposed reclasses or accruals only when source support is present.
6. List open questions for payroll provider, client, or CPA review.

## Output

Produce a payroll JE review summary with source ties, exceptions, and proposed follow-up.

## Verification

Confirm that payroll clearing and payroll liability accounts are explainable as of period end.
