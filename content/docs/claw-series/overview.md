---
title: "Overview"
description: "What the Claw Series is, how AccountingClaw and LegalClaw are activated and deployed, and how to get your first digital worker running."
order: 1
---

The Claw Series is a family of **AI digital workers** — autonomous agents you deploy, not tools you operate. Each Claw runs hundreds of pre-built skills end-to-end, with guardrails designed for regulated accounting, finance, and legal work. You point a Claw at your data, tell it what you need in plain language, and it prepares review-ready deliverables for you to check and sign off.

Two digital workers are available for self-service today: **AccountingClaw** and **LegalClaw**. FinanceClaw is offered through white-glove setup — [contact us](/contact) and we'll deploy and tune it for your firm.

## What AccountingClaw does

AccountingClaw helps accountants **prepare, review, reconcile, and document** accounting workpapers. It ships with two dozen accounting skills covering reconciliation and month-end close, journal entries and provisions, financial reporting and technical accounting, fixed assets and policy compliance, audit and controls, and tax research. You chat with it the way you'd brief a staff accountant; it runs the right skill and hands back an Excel or Word workpaper with preparer, reviewer, and approver sign-off lines.

It is built to assist a CPA, not replace one. AccountingClaw never invents balances or tax rates, drafts journal entries but never posts them, and escalates material judgment back to you. Final CPA sign-off, management approval, and required tax review always stay with the human professional.

## What LegalClaw does

LegalClaw helps legal professionals **analyze, draft, review, and document** legal work product. It ships with **1,251 legal skills across 24 practice areas** — from Corporate M&A, Capital Markets, and Funds to IP, Employment, Real Estate, Tax, Immigration, and Litigation. Each skill encodes how to work a class of legal matter: the legal frameworks that apply, the failure modes to avoid, the shape of the deliverable, and a self-audit before it hands anything back. You brief it like a junior associate; it produces memo- and markup-style work product with open items flagged in bracketed comments for attorney review.

It is built to assist an attorney, not replace one. LegalClaw never invents statutes, citations, or contract terms, does not provide legal advice, and escalates judgment-heavy questions of law and strategy back to you. Attorney review and partner sign-off always stay with the human professional. See the full [LegalClaw skills catalog](/docs/claw-series/legalclaw-skills-catalog).

## Two ways to deploy

Every Claw runs the same skills whether you deploy it in the cloud or on your own machine. Both unlock with your personal activation key — and **one key unlocks both products**.

| | Cloud digital worker | Desktop digital worker |
| --- | --- | --- |
| **Runs as** | A Docker container on any server, VM, or cloud (AWS, GCP, Azure, or your own VPC) | The native Hermes Desktop app for macOS, Windows, or Linux |
| **Best for** | Always-on workers, shared servers, teams | Individuals running everything locally on one machine |
| **You provide** | Activation key + an OpenRouter API key | Activation key; your AI model is connected in the app |
| **Set up in** | [Deploy in the cloud (Docker)](/docs/claw-series/deploy-cloud) | [Deploy on your desktop](/docs/claw-series/deploy-desktop) |

## What activation is

Before you can run a Claw, you activate once. You redeem a six-digit code (we provide it) for a **personal activation key** that looks like `cpaa_live_…`. That key unlocks the encrypted skills of both AccountingClaw and LegalClaw on first start, whether you deploy in the cloud or on the desktop. The key is shown to you exactly once, so you save it and reuse it for every install. See [Activating your Claw](/docs/claw-series/activation).

## Where to find it

- **Learn about the Claw Series** on the product page at `/claw` — installation options, demo videos, and personalized-setup choices.
- **Activate** from the CPAAutomation sidebar under **Claw Activation** (`/dashboard/activation`).
- **Browse the product** in the sidebar under **Claw Series**.

## Get started in four steps

1. [Activate](/docs/claw-series/activation) — redeem your six-digit code and save the personal key.
2. Deploy AccountingClaw or LegalClaw [in the cloud with Docker](/docs/claw-series/deploy-cloud) **or** [on your desktop](/docs/claw-series/deploy-desktop).
3. Brief your worker in chat — see [Working with AccountingClaw](/docs/claw-series/using-accountingclaw) or [Working with LegalClaw](/docs/claw-series/using-legalclaw).
4. Explore everything they can do in the [AccountingClaw skills catalog](/docs/claw-series/skills-catalog) and the [LegalClaw skills catalog](/docs/claw-series/legalclaw-skills-catalog).
