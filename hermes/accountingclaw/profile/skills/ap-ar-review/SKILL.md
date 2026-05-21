---
name: ap-ar-review
description: Review accounts payable and accounts receivable aging for cleanup items
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, ar, ap, aging]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# AP and AR Review

## When to Use

Use this skill when reviewing AR or AP aging reports for cleanup, close, or advisory work.

## Inputs

- AR aging and AP aging as of the review date.
- Customer/vendor detail for old or unusual balances.
- Subsequent receipts, payments, credit memos, and write-off policy if available.

## Procedure

1. Confirm the aging date, accounting period, and materiality threshold.
2. Group balances by age bucket, customer/vendor, and amount.
3. Identify stale credits, unapplied payments, duplicate bills or invoices, negative balances, related-party balances, and balances with no recent activity.
4. Separate likely timing items from items needing client confirmation.
5. Draft cleanup recommendations such as apply credit, request support, investigate duplicate, collect, pay, or propose write-off.
6. Highlight items requiring CPA, controller, or client approval.

## Output

Produce an AP/AR cleanup schedule with item, amount, age, issue, recommended action, owner, and priority.

## Verification

Tie total reviewed AR/AP to the aging report total and identify any excluded balances.
