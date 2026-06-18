---
title: "Ask & Journal"
description: "Ask natural-language questions about your time with cited answers, and keep a daily journal you can draft automatically with Gemini."
order: 6
---

Chrona can answer questions about your day and help you reflect on it. This page (for **staff**) covers the **Ask** chat — a grounded assistant that cites your own timeline — and the **Journal**, including the **Draft with Gemini** feature.

## Ask Chrona

Open **Ask** from the top toolbar to chat with an assistant that answers using your timeline.

### Ask a question

When the chat is empty, Chrona offers suggestion chips to get you started, such as:

- "What did I work on today?"
- "How much time was Work vs Distraction?"
- "What were my longest uninterrupted focus blocks?"
- "Summarize this day in 5 bullets."

Type your own question in the **Ask about your time…** box and send it with the **Ask** button or **Cmd/Ctrl + Enter**. After a reply, Chrona suggests follow-up questions you can click.

### Sources and follow-ups

Every grounded answer includes a **Sources** row with chips like `2:15-2:48 · Drafting client memo`. Click a source to jump straight to that card in the Timeline, so you can verify exactly what an answer is based on.

### Control what Ask considers

The **Ask settings** panel on the right scopes the conversation:

- **Scope** — which days Ask looks at: **Selected day**, **Today**, **Yesterday**, **Last 7 days**, or **Last 30 days**.
- **Use observations** — include the moment-by-moment observations within cards for more detail.
- **Include review ratings** — let Ask use your Focus / Neutral / Distracted ratings.
- **Clear chat** — start over.

> **Note:** Ask works from your timeline's text, not your screenshots — images are never used to answer.

## Journal

Open **Journal** from the top toolbar to keep a structured daily entry. The header shows the day you're writing for, noting the day runs **4 AM to 4 AM**.

### Write your entry

Each day's entry has four sections, each a free-text box:

| Section | Prompt |
| --- | --- |
| **Intentions** | What do you want to accomplish? |
| **Notes** | Key events, decisions, or context. |
| **Reflections** | What went well? What was hard? One improvement for next time. |
| **Summary** | A short recap of the day. |

Your writing **autosaves** as you type — the header shows "Saving…" and then "Saved" with a timestamp. Set the entry's **Status** to **Draft** or **Complete**, and use **Delete** to remove the day's entry.

### Draft with Gemini

Chrona can write a first draft of your journal grounded in your actual timeline. In the **Journal tools** panel on the right:

1. Optionally toggle **Use observations** and **Include review ratings** to give the draft more to work with.
2. Choose an **Apply mode**:
   - **Fill empty fields** — only fills sections you've left blank.
   - **Append to existing** — adds the draft to what you've already written.
   - **Replace existing** — overwrites your text.
3. Click **Draft with Gemini**. A preview appears with suggested **Intentions**, **Notes**, **Reflections**, and **Summary**.
4. Review the preview, then click **Apply draft** to bring it into your entry using the apply mode you chose.

> **Note:** Drafting requires a configured Gemini key. If it's missing, the panel shows "Key: missing" and the button is disabled — add one in [Settings → AI](/docs/chrona/tracking-your-time).

### Export your journal

The **Export range** controls in the Journal tools panel let you save entries across a **Start**–**End** date range, and **Copy day** copies the current day's entry to your clipboard.

Once you're getting value from your own timeline, connect Chrona to your firm so your hours roll up into reporting — see [Connecting Chrona to your firm](/docs/chrona/pairing-and-sync).
