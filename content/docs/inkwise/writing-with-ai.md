---
title: "Writing with AI"
description: "Bind references to your document, accept inline predictions, rewrite text with writing tools, chat with your sources, and add citations."
order: 4
---

Inkwise's AI lives inside the editor and is grounded in the references you bind to the current document. Open the right sidebar (the panel toggle in the editor) to find three tabs — **AI Chat**, **References**, and **Review**. This page covers the AI features; the Review tab is covered in [Reviewing Your Document](/docs/inkwise/reviewing).

## Bind references to your document

Before the AI can ground its suggestions, bind the sources you want it to use. In the editor's right sidebar, open the **References** tab:

- **Add and bind references** — import new sources right here without leaving the editor. Anything you import is bound to this document automatically.
- **Bound to this document** — the sources already attached. Each shows **Ready for grounding** or **Not ready yet** (with the reason). Click **Unbind** to detach one.
- **Available library sources** — sources in your [library](/docs/inkwise/references) that aren't bound yet. Click **Bind** to attach one. Use the **Search references** box to find a source quickly.

> **Note:** Only sources that are **Ready for grounding** can be used by predictions, writing tools, and chat. If a source isn't ready yet, finish processing it on the [References](/docs/inkwise/references) page first.

## Inline predictions

As you write, Inkwise drafts a suggestion for what comes next and shows it inline in gray. The status bar beneath the editor tells you what's happening:

- *Inkwise is drafting the next suggestion…* while it works.
- *Press Tab to accept the grounded inline prediction. Using N evidence segments.* when the suggestion is backed by your sources.
- *Press Tab to accept inline predictions when they appear.* otherwise.

Press **Tab** to accept a suggestion, or just keep typing to ignore it. When a prediction is grounded, a **Prediction Evidence** box appears with citation bubbles you can click to see the supporting source.

## Inline writing tools

To rewrite or generate text, select some text (or place your cursor where you want new text) to open the **Write with AI** panel. Choose a tool:

| Tool | What it does |
| --- | --- |
| **Coherent** | Improves flow, transitions, and structure while preserving meaning. |
| **Concise** | Tightens the text while keeping the key meaning and important details. |
| **Detailed** | Expands with more relevant detail and context, without filler. |
| **Humanize** | Makes the text sound more natural while preserving meaning. |
| **Custom** | Runs your own instruction (for example, *"rewrite in a persuasive tone"*). |

Each tool fills in an instruction you can edit before sending. Expand the **sources** control in the panel to choose which bound sources to ground with (use **All** / **None**, or search). Send the instruction, and Inkwise streams a result that tells you whether it's grounded:

- *Grounded to N evidence segments* — the rewrite is backed by your sources.
- *No matching evidence found in the selected sources* — nothing relevant was found, so it wrote without grounding.
- *Grounding fell back to an ungrounded rewrite* — retrieval couldn't run, so it wrote without grounding.

Then place the result:

- With text selected: **Replace selection** or **Insert after**.
- With just a cursor: **Insert**.
- Or use **Copy** to copy it, and **Retry** to generate a fresh attempt.

Grounded results bring their citations with them when inserted.

## AI Chat

Open the **AI Chat** tab to ask questions about your draft and sources. Answers are grounded in the references you select.

**Choose your sources.** Open the source control at the bottom of the panel (**Chat references**) and tick the ready sources you want the chat to use. You must select at least one ready source before you can send — the panel hints *Bind & prepare a source to chat* or *Select a source* if you can't yet.

**Ask a question.** Type in the composer (*Ask a grounded question…*) and press **Enter** or click the send button. If you've selected text in the editor, it's attached to your question as context (shown as a **Selection attached** chip). When the chat box is empty, suggested prompts give you a starting point, such as *"Summarize the key terms in my sources."*

**Use an answer.** Hover an assistant reply for actions:

- **Copy** the text.
- **Insert at cursor** (when your cursor is in the editor) or **Append to end** of the document; if you have text selected, **Replace selection** is also offered.
- **Retry** the most recent answer to regenerate it with fresh retrieval.

**Manage threads.** Use the thread dropdown at the top to switch between conversations, **New thread** to start a fresh one, and the trash button to **Delete** the current thread.

## Citations in your document

When you insert a grounded prediction, writing-tool result, or chat answer, Inkwise attaches citations to the source evidence. They're formatted according to the **Citation style** set in [Document Settings](/docs/inkwise/writing-documents#document-settings-and-guidance) — APA, MLA, Chicago, Bluebook, or the default. Keeping your references' [citation metadata](/docs/inkwise/references#edit-citation-metadata) accurate makes these citations more precise.
