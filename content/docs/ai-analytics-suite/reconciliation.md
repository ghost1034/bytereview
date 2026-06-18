---
title: "Reconciliation"
description: "Match transactions between two sources using AI-generated rules, then approve, reject, investigate exceptions, and export."
order: 5
---

**Reconciliation** *("Match transactions between two sources using AI-generated rules, then approve, reject, and export.")* compares two transaction lists — for example, a bank statement against the general ledger — and uses AI to propose how they should match. Open it at `/dashboard/analytics/reconciliation`.

## Create a reconciliation

From the list page, click **New reconciliation** and fill in the dialog:

- **Name** — for example, *"Bank to GL — April."*
- **Client** — choose a client, or leave it as **No client**.

The list shows each reconciliation with its client, source sizes, match-group count, status, and last-updated date. Use the client filter to narrow it, or open **Reports** for a status rollup.

## The editor: three steps

Opening a reconciliation walks you through three steps: **Upload sources → Matching rules → Review results**.

### Step 1 — Upload sources

Provide two files (CSV or Excel) and assign each a role: **Source A** and **Source B**. Each source needs a **Transaction Date**, a **Description**, and an **Amount**; the app auto-maps these from your column headers. As always, **Use Demo Data** loads a ready-made example.

### Step 2 — Matching rules

This is where the AI does the heavy lifting. Click **Generate** and it proposes a set of **passes** — ordered rules describing how transactions should be matched. Each pass can target one or more **match types**:

| Match type | Meaning |
| --- | --- |
| **1:1** | One transaction in A matches one in B. |
| **1:Many** | One in A matches several in B. |
| **Many:1** | Several in A match one in B. |
| **Many:Many** | A group in A matches a group in B. |

You can fine-tune the proposed passes, or **Add pass** to describe a new one in plain language — for example, *"Match Many:Many on description containing invoice numbers."* When you're happy with the rules, click **Run AI Match** to apply them. Prefer a quick, rules-free pass instead? Click **Basic match** for straightforward matching without AI rules.

### Step 3 — Review results

Results are organized into five tabs:

| Tab | What you see |
| --- | --- |
| **Summary** | Match counts and totals across both sources. |
| **Matched** | Every match group, with the A and B transactions side by side. |
| **Unmatched** | Transactions in each source that didn't match. |
| **Exceptions** | Unmatched items the AI categorized (timing, bank fee, amount mismatch, missing, and other variances). |
| **Reports** | Consolidated exports. |

On the **Matched** tab, **approve** or **reject** each group. On **Unmatched**, you can create a match group manually when you spot a pair the rules missed. On **Exceptions**, track each item's status (open, investigating, resolved, or waived) and **add investigation notes** to document your reasoning.

## Exporting

Every results tab has an **Export** button, and the **Reports** tab can export the full reconciliation, just the matched groups, just the unmatched items, the exceptions, or a summary — in **CSV**, **Excel**, or **PDF**.

> **Tip:** The [AI Assistant](/docs/ai-analytics-suite/ai-assistant) is reconciliation-aware. When you ask it about your unmatched items, it can suggest an additional matching pass and offer to add it for you.
