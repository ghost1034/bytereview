---
title: "Working with LegalClaw"
description: "How to brief LegalClaw in chat, what documents to give it, the work product it returns, and the guardrails that keep an attorney in control."
order: 7
---

Once LegalClaw is deployed, you work with it the way you'd work with a junior associate: you brief it in plain language, hand it the matter documents, and it produces review-ready work product. This page explains how to drive it day to day.

## Open a chat session

How you reach the agent depends on how you deployed it:

- **Desktop:** open the chat UI in Hermes Desktop.
- **Cloud (Docker):** start an interactive session from your terminal.

```bash
docker exec -it legalclaw hermes chat
```

(If you added the host alias from the [cloud setup](/docs/claw-series/deploy-cloud), just type `hermes chat`.)

## Brief the worker

LegalClaw does its best work when you give it the matter context up front. Before it starts, tell it:

- **Client or matter** — who you're acting for and on what.
- **Jurisdiction** — the governing law and forum that apply.
- **Practice area** — for example M&A, funds, employment, or data privacy (it can usually infer this, but saying it removes ambiguity).
- **Source documents** — the agreements, filings, correspondence, or diligence materials it should work from.

Then describe the task in your own words — *"review this credit agreement markup and flag off-market changes"* or *"draft a merger agreement from this term sheet and diligence file."* LegalClaw picks the matching skill from its 1,251-skill library, asks for any documents it needs, and runs it. To see everything it can do, ask it directly or run `hermes skills list`; for the library grouped by practice area, see the [LegalClaw skills catalog](/docs/claw-series/legalclaw-skills-catalog).

## What a skill gives it

Every LegalClaw skill encodes how to work one class of legal matter:

- **The failure modes it corrects** — the mistakes a generic draft or review typically makes on that task.
- **The legal frameworks and market conventions that apply** — the doctrines, statutes, and drafting norms the work must track.
- **The shape of the deliverable** — what a partner expects the memo, markup, or analysis to contain.
- **A self-audit** — checks it runs on its own output before handing it back.

## What you get back

LegalClaw produces **attorney-reviewable work product**, not just chat replies — issue lists, clause-by-clause markups, drafts, comparison tables, and memos, with open items flagged in **bracketed comments** for your review. Each deliverable follows a consistent structure:

1. **Matter, documents, and jurisdiction** reviewed.
2. **Legal frameworks and conventions** applied.
3. **Key findings and identified issues.**
4. **Open items and risks** requiring attorney follow-up.
5. **Recommended next actions.**

## Guardrails: an attorney stays in control

LegalClaw is built to assist a legal professional, not to replace one. By design it:

- **Never invents** statutes, case citations, regulatory provisions, filing deadlines, contract terms, or facts not present in the source documents — if support is missing, it says so.
- **Separates** observed facts, assumptions, identified issues, and open items, so you always know what's grounded and what's judgment.
- **Escalates** material uncertainty, missing documents, unusual terms, and judgment-heavy questions of law or strategy back to you.
- **Treats everything as privileged and confidential** — contracts, filings, correspondence, diligence materials, and client documents.

LegalClaw does **not** provide legal advice, does **not** create an attorney-client relationship, and does **not** replace attorney review, partner sign-off, or required filings review. Use it to do the heavy lifting; keep the professional judgment and final sign-off with the human.

Next, browse everything LegalClaw can do in the [LegalClaw skills catalog](/docs/claw-series/legalclaw-skills-catalog).
