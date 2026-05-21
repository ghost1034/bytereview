---
name: qbo-reconciliation
description: Reconcile QuickBooks Online accounts and prepare exception reports
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, qbo, reconciliation]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
  - name: QBO_CLIENT_ID
    prompt: QuickBooks client ID
    required_for: QuickBooks API access when API integration is enabled
---

# QBO Reconciliation

## When to Use

Use this skill when asked to reconcile QuickBooks Online bank, credit card, loan, clearing, or balance sheet accounts.

## Inputs

- Client entity and accounting period.
- QBO account name and account type.
- Statement ending date and ending balance.
- Transaction detail, reconciliation report, and bank feed status when available.

## Procedure

1. Confirm the account, period, statement date, and statement ending balance.
2. Compare book activity to statement activity for the period.
3. Identify unmatched, duplicate, stale, or suspicious transactions.
4. Flag uncleared checks, deposits in transit, bank feed duplicates, transfers posted to the wrong account, and balance sheet clearing items.
5. Prepare a reconciliation summary with beginning balance, cleared activity, ending balance, unreconciled difference, and exceptions.
6. Recommend follow-up steps without posting changes unless explicitly authorized.

## Output

Produce a reconciliation exception report and a concise workpaper summary.

## Verification

Confirm beginning balance, statement ending balance, cleared balance, unreconciled difference, and unresolved exceptions.
