---
name: client-onboarding
description: Prepare an accounting client onboarding checklist and kickoff plan
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, onboarding, client-setup]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Client Onboarding

## When to Use

Use this skill when onboarding a new bookkeeping, accounting, tax prep, or advisory client.

## Inputs

- Client legal name, DBA, and entity type.
- Accounting basis and fiscal year-end.
- Source systems such as QuickBooks Online, Xero, payroll, POS, bill pay, banking, and tax portals.
- Required service scope and deadlines.

## Procedure

1. Confirm entity details, owners, responsible contacts, and communication cadence.
2. Identify required system access and permissions.
3. Request prior-year tax returns, trial balances, bank statements, payroll reports, fixed asset schedules, debt agreements, and open AR/AP reports as applicable.
4. Map recurring deliverables, deadlines, and responsible parties.
5. Create an onboarding checklist grouped by access, documents, cleanup tasks, recurring workflows, and open questions.
6. Flag missing critical information that blocks work.

## Output

Produce a kickoff-ready onboarding checklist and a short client-facing request list.

## Verification

Confirm that every requested access item has an owner, purpose, and priority.
