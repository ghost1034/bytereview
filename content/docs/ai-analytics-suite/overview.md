---
title: "Overview"
description: "What the AI Analytics Suite is, how its modules fit together, where to find them, and how to run your first analysis."
order: 1
---

The AI Analytics Suite is an AI-assisted workspace for accounting and month-end close. It brings variance and flux analysis, transaction reconciliation, fixed-asset and lease schedules, and revenue/expense waterfalls into one place — alongside two research bots for tax and accounting questions and a floating AI assistant that follows you across every screen. Everything is organized by **firm** and by **client**, so your whole team works from the same data.

## What you can do

- **Explain variances** — upload general-ledger data, flag material movements against a threshold, and generate an AI-assisted flux memo.
- **Reconcile transactions** — match two sources (for example, bank vs. GL) using AI-generated rules, then approve, reject, and export.
- **Build fixed-asset and lease schedules** — manage assets, leases, loans, intangibles, and software with GAAP **and** tax depreciation, plus auto-generated journal entries.
- **Schedule deferrals and revenue** — build deferred-revenue, prepaid, accrual, and deferred-commission waterfalls with monthly journals.
- **Research tax and GAAP** — ask the IRS and GAAP researchers questions and get cited, web-grounded answers and memos.
- **Get help in context** — open the AI assistant on any screen for guidance tailored to what you're looking at.

## How the pieces fit together

Everything lives in the left sidebar under **Analytics**:

| Module | What it does |
| --- | --- |
| **Clients** | The client records every analysis is organized around. |
| **Dashboard** | An at-a-glance view of your variance and reconciliation projects. |
| **Variance** | Variance & Flux Analysis — upload, flag, explain, and memo. |
| **Reconciliation** | Match transactions between two sources with AI rules. |
| **Fixed Assets** | Depreciation, amortization, and lease (ASC 842) schedules. |
| **Waterfall** | Revenue-recognition and deferral schedules with journals. |
| **IRS Researcher** | AI tax research over the IRC, regulations, and rulings. |
| **GAAP Researcher** | AI accounting research over ASC topics and FASB guidance. |
| **Settings** | Firm membership, compliance controls, and the audit log. |
| **AI Assistant** | A floating, context-aware chat available on every screen. |

A typical path: you add a **client**, run a **variance** or **reconciliation** for that client, lean on the **AI assistant** or a **researcher** when you hit a judgment call, then review status on the **dashboard**.

## Before you start: set up your firm

The Analytics modules are gated behind a one-time firm setup. The first time you open any Analytics page you'll see **Welcome to CPA Analytics**, where you either **create a new firm** or **join an existing firm** with an invitation code. See [Firm & team](/docs/ai-analytics-suite/firm-and-team) for the full walkthrough and how roles work.

## Where to find it

| Module | Location |
| --- | --- |
| Clients | `/dashboard/analytics/clients` |
| Dashboard | `/dashboard/analytics` |
| Variance | `/dashboard/analytics/variance` |
| Reconciliation | `/dashboard/analytics/reconciliation` |
| Fixed Assets | `/dashboard/analytics/amortization` |
| Waterfall | `/dashboard/analytics/waterfall` |
| IRS Researcher | `/dashboard/analytics/research/irs` |
| GAAP Researcher | `/dashboard/analytics/research/gaap` |
| Settings | `/dashboard/analytics/settings` |

## Your dashboard

The **Dashboard** (`/dashboard/analytics`) is your home base — *"an at-a-glance view of variance and reconciliation projects across your firm."* It shows summary cards by status (such as **In Prep**, **Pending Review**, **Approved**, and **Finalized**) and a single **All Projects** table that combines your variance and reconciliation work. Click any row to open that project; select rows to delete them in bulk.

## Importing your data

Variance, Reconciliation, Fixed Assets, and Waterfall all use the same upload flow. You drag in a file (or click **Browse Files**), and the app auto-detects and maps your columns. Want to try a module without your own data first? Click **Use Demo Data** to load a realistic sample, or **Download Template** to get a correctly formatted starter file.

| | Accepted formats | Size & row limits |
| --- | --- | --- |
| **Variance** | CSV, Excel (`.xlsx`, `.xls`) | 50 MB/file, up to 50,000 rows |
| **Reconciliation** | CSV, Excel (`.xlsx`, `.xls`) | 50 MB/file, up to 100,000 rows |
| **Fixed Assets / Waterfall (bulk)** | CSV, Excel (`.xlsx`) | 50 MB/file, up to 5,000 rows |

> **Note:** Fixed Assets and Waterfall can also create a single record by **extracting** it from a document (a contract or invoice) with AI — see those pages for details.

## Plans and usage

AI features (threshold suggestions, variance explanations, memos, reconciliation matching, document extraction, and the researchers) draw on your plan's monthly **page** allowance. If you hit your limit, the app will prompt you to upgrade. Check your billing settings for your current plan and remaining allowance.

## Your first analysis in four steps

1. **Set up your firm** — create one or join with an invite code. See [Firm & team](/docs/ai-analytics-suite/firm-and-team).
2. **Add a client** — so your work is organized. See [Clients](/docs/ai-analytics-suite/clients).
3. **Pick a module** — for example, [Variance & Flux](/docs/ai-analytics-suite/variance) or [Reconciliation](/docs/ai-analytics-suite/reconciliation).
4. **Upload, run, and review** — let the AI flag, match, and explain, then export your results.
