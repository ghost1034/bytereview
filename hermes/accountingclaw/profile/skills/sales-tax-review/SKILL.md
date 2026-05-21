---
name: sales-tax-review
description: Prepare a sales tax review checklist and exception summary
version: 0.1.0
platforms: [linux]
metadata:
  hermes:
    tags: [accounting, sales-tax, compliance]
    category: accounting
required_environment_variables:
  - name: CPAA_BUNDLE_SECRET
    prompt: CPAAutomation.ai bundle decryption secret
    required_for: premium skill access
---

# Sales Tax Review

## When to Use

Use this skill when preparing or reviewing sales tax support before filing or client review.

## Inputs

- Filing period, jurisdictions, and filing frequency.
- Sales by jurisdiction, exempt sales, taxable sales, collected tax, refunds, and prior filings.
- POS, e-commerce, invoicing, and accounting system reports.

## Procedure

1. Confirm jurisdictions, filing period, due date, and source reports.
2. Reconcile gross sales, exempt sales, taxable sales, and tax collected across systems.
3. Identify unusual rates, missing jurisdiction mapping, negative sales, refunds, marketplace facilitator sales, and exempt sales lacking certificates.
4. Compare current-period figures to prior periods for unusual fluctuations.
5. Prepare a filing support summary and exception list.
6. Escalate nexus, registration, or legal interpretation questions to the responsible tax professional.

## Output

Produce a sales tax review checklist and exception summary.

## Verification

Confirm source totals tie to the filing support and that unresolved taxability questions are not treated as final conclusions.
