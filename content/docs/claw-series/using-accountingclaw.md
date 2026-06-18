---
title: "Working with AccountingClaw"
description: "How to brief AccountingClaw in chat, what data to give it, the workpapers it returns, and the guardrails that keep a human in control."
order: 5
---

Once AccountingClaw is deployed, you work with it the way you'd work with a staff accountant: you brief it in plain language, hand it the source data, and it produces a review-ready workpaper. This page explains how to drive it day to day.

## Open a chat session

How you reach the agent depends on how you deployed it:

- **Desktop:** open the chat UI in Hermes Desktop.
- **Cloud (Docker):** start an interactive session from your terminal.

```bash
docker exec -it accountingclaw hermes chat
```

(If you added the host alias from the [cloud setup](/docs/claw-series/deploy-cloud), just type `hermes chat`.)

## Brief the worker

AccountingClaw does its best work when you give it the engagement context up front. Before it starts a workflow, tell it:

- **Client entity** — whose books you're working on.
- **Accounting period** — the month, quarter, or year under review.
- **Accounting basis** — for example GAAP, tax, or cash.
- **Source system** — where the data came from (your ERP, GL, payroll provider, and so on).

Then describe the task in your own words — *"reconcile the operating cash account for December"* or *"run a flux analysis on the income statement versus last quarter."* AccountingClaw picks the matching skill, asks for any files it needs, and runs it. To see everything it can do, ask it directly or run `hermes skills list`; for the full list with descriptions, see the [Skills catalog](/docs/claw-series/skills-catalog).

## Give it your data

Most skills take ordinary exports from your accounting systems:

- **Inputs** are typically **CSV or Excel (XLSX)** files — trial balances, GL exports, sub-ledger detail, support schedules, registers, and the like. Each skill documents the columns it expects (for a concrete example, see the [Skills catalog deep-dive](/docs/claw-series/skills-catalog)).

## What you get back

AccountingClaw produces **workpaper-quality deliverables**, not just chat replies:

- **Excel (XLSX) workbooks** with clearly named sheets — usually a **Summary**, a **Detail** sheet, and a **SignOff** block with Preparer / Reviewer / Approver lines, plus skill-specific sheets (aging, roll-forward, audit trail, and so on).
- **Word (DOCX) memos** for skills like the technical accounting memo.

Each deliverable follows a consistent structure so it's easy to review:

1. **Scope and period** reviewed.
2. **Source documents or systems** used.
3. **Key findings.**
4. **Exceptions** requiring follow-up.
5. **Recommended next actions.**

## Guardrails: a human stays in control

AccountingClaw is built to assist a CPA, not to replace one. By design it:

- **Never invents** balances, transactions, journal entries, tax rates, or filing deadlines — if support is missing, it says so.
- **Drafts journal entries but never posts them.** Every reconciling item and proposed entry is left for you to book, age, or investigate.
- **Separates** observed facts, assumptions, proposed adjustments, and unresolved exceptions, so you always know what's grounded and what's judgment.
- **Escalates** material uncertainty, missing support, unusual transactions, and judgment-heavy treatment back to you.
- **Treats everything as confidential** — financial statements, ledgers, tax and payroll records, and client documents.

AccountingClaw does **not** provide legal or investment advice, and it does **not** replace CPA sign-off, management approval, or required tax review. Use it to do the heavy lifting; keep the professional judgment and final sign-off with the human.

Next, browse everything AccountingClaw can do in the [Skills catalog](/docs/claw-series/skills-catalog).
