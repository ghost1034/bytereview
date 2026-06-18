---
title: "IRS & GAAP Researchers"
description: "Ask the IRS and GAAP research bots tax and accounting questions, attach documents, choose an output style, and get cited, web-grounded answers and memos."
order: 8
---

The suite includes two AI research assistants that answer technical questions with citations and live web grounding:

- **IRS Researcher** (`/dashboard/analytics/research/irs`) — *"AI-powered tax research assistant for IRS regulations and the tax code"* (the IRC, Treasury regulations, revenue rulings and procedures, publications, and cases).
- **GAAP Researcher** (`/dashboard/analytics/research/gaap`) — *"AI-powered accounting standards research assistant for ASC and FASB guidance"* (ASC topics such as 606, 842, 740, 805, 350, and 718).

Both work the same way; only the subject matter differs.

## Choose a client (or General)

When you open a researcher, pick the **client** the research relates to, or **General** for research that isn't tied to a client. Sessions are filed under whatever you choose.

## The landing page

Use **New research session** to start, and the **General research** / client button to switch context. Three tabs organize your work:

| Tab | What it shows |
| --- | --- |
| **Overview** | Stat cards (**Total Sessions**, **Docs Analyzed**, **Memos Generated**) plus your **Recent Sessions** and **Saved Memos**. |
| **Session History** | Every session, with its title, date, and message count — click to reopen. |
| **Document Library** | Every document you've attached, by session, with the option to remove one. |

## Asking a question

Inside a session, type your question in the box at the bottom and press **Send** (Shift+Enter adds a new line). The answer streams in, and the assistant cites its sources; when it draws on the web, the relevant **web sources** are shown so you can verify the authorities. Use the **Citations** button to export the sources from a session.

### Output styles

Before you send, pick an **output style** — the current choice is shown as *"Output style: …"*:

| Style | What you get |
| --- | --- |
| **Q&A** | A concise, direct answer with citations. |
| **Summary** | Findings, flags, and recommended actions. |
| **Memo** | A full memorandum — a **Tax Research Memo** in the IRS Researcher, or a **Technical Accounting Memo** in the GAAP Researcher. |

Sessions that produce a memo are surfaced under **Saved Memos** and **Memos Generated** on the landing page.

## Working with documents

You can ground a session in your own files. Click **Upload** or drag files into the chat (*"Drag & drop documents here"*). Each document is summarized into an **AI Extraction Summary** and kept in the session's context, so follow-up questions can reference it. Documents persist with the session; remove them from the chat or from the **Document Library** tab.

## Managing sessions

Sessions are saved automatically. Reopen them from **Session History** or **Recent Sessions**, and rename or delete them as your research evolves. Because each researcher keeps its own history per client, you can build a durable, searchable record of the positions you've taken.

> **Tip:** For quick, in-context help while you're working inside a module, the floating [AI Assistant](/docs/ai-analytics-suite/ai-assistant) is often faster than opening a full research session.
