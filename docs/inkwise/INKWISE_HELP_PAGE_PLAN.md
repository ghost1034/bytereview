# Inkwise Help Page — Implementation Plan

## Goal

Replace the minimal `app/dashboard/inkwise/help/page.tsx` (50 lines, 2 cards) with a comprehensive, navigable in-product help page that documents every user-facing feature of Inkwise. The page should be the place a user lands first when they click **Help** in the Inkwise module nav, and should answer "what is X", "how do I X", and "why didn't X work" without leaving the app.

## Scope

In scope: the four nav sections (**Write**, **References**, **Templates**, **Help**), the editor's grounded AI tools, citations/evidence, version history, focus mode, exports, plus an FAQ/troubleshooting section.

Out of scope: backend architecture explanations, marketing copy, pricing/Pro plan details beyond noting which file types are Pro-only, and anything not currently shipped.

---

## Page structure

Single route, single file: `app/dashboard/inkwise/help/page.tsx`. Server component (no client interactivity required for v1 — the existing page is also a server component and matches the rest of `/dashboard`).

Layout: a left **table-of-contents rail** (sticky on `lg:`) and a right **content column** with sections separated by anchors. This mirrors typical docs-site UX and stays inside the existing module shell (which already supplies the page header and module nav).

```
┌──────────────────── Inkwise module header (existing layout) ─────────────────┐
│                                                                              │
│ ┌──────────────┐ ┌──────────────────────────────────────────────────────┐    │
│ │  TOC         │ │  #overview                                           │    │
│ │  Overview    │ │  #key-concepts                                       │    │
│ │  Concepts    │ │  #write                                              │    │
│ │  Write       │ │  #editor                                             │    │
│ │  Editor      │ │  #ai-tools (chat / inline / prediction)              │    │
│ │  AI tools    │ │  #citations                                          │    │
│ │  Citations   │ │  #version-history                                    │    │
│ │  Versions    │ │  #references                                         │    │
│ │  References  │ │  #templates                                          │    │
│ │  Templates   │ │  #export                                             │    │
│ │  Export      │ │  #shortcuts                                          │    │
│ │  Shortcuts   │ │  #faq                                                │    │
│ │  FAQ         │ │  #limits                                             │    │
│ │  Limits      │ │  #contact                                            │    │
│ └──────────────┘ └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Use existing primitives only: `Card`, `CardHeader`, `CardTitle`, `CardContent` (already imported), plus the `Accordion` from `components/ui/accordion.tsx` for the FAQ. No new components, no new dependencies.

Use the existing color/typography vocabulary: `text-slate-900` headings, `text-slate-600` body, `bg-emerald-100/text-emerald-700` for the numbered-step pill (already used on the current page) and an `Inkwise Workspace` aesthetic consistent with the layout.

Each section is a `<section id="...">` so the TOC links jump cleanly. Use `scroll-mt-24` on each section to clear the sticky module header.

---

## Section-by-section content plan

### 1. `#overview` — What Inkwise is

One short paragraph, then a 5-step "how it fits together" list (keep the existing numbered-pill visual, but rewrite copy):

1. Upload sources in **References** (PDF, DOCX, webpage snapshots; Pro plan: images, audio, video).
2. Wait for ingestion — sources need status **Ready** before they can ground AI output.
3. Open or create a document in **Write**, then **bind** the references you want this document grounded against.
4. Draft with the editor's **AI Chat**, **inline writing tools**, and **grounded prediction**. Every AI output cites the evidence it used.
5. Review **Version History**, set per-document guidance in **Document Settings**, or start from a **Template**.

### 2. `#key-concepts` — Vocabulary

A small `<dl>` glossary. Keep entries one sentence each:

- **Reference / Source** — an uploaded file or captured webpage that has been ingested into segments and embeddings.
- **Document** — a draft you write in the editor; documents are not visible to AI unless they're the document you have open.
- **Template** — a reusable starter (personal or system-provided) that prefills a new document.
- **Binding** — the per-document selection of which Ready sources are eligible for grounding.
- **Grounding** — when an AI output is informed by retrieved passages from bound sources; the output can cite specific evidence.
- **Evidence** — the retrieved passages a grounded AI call used; shown as numbered citation bubbles below the output.
- **Folder** — optional grouping for documents in Write. Documents without a folder are listed under **Unfiled**.
- **Revision** — a snapshot of document content saved on manual save, AI tool application, accepted prediction, or restore.

### 3. `#write` — Document list and folders

Two-column subsection: left = numbered walkthrough, right = "Tips" callout. Cover:

- Creating a document (`+ New document`).
- Searching and sorting (Updated / Title A–Z / Z–A / Newest / Oldest).
- Folder operations: create, rename, delete (deleting a folder moves its documents to **Unfiled**, it does not delete them).
- Drag/drop documents between folders.
- Right-click menu actions per document.

### 4. `#editor` — The writing canvas

Use a 2×N grid of small cards, one per editor capability, each with a heading and 1–2 sentences. Capabilities to cover:

- **Formatting toolbar** — bold, italic, headings, lists, blockquote, table insert, page break, horizontal rule, undo/redo.
- **Comments** — inline discussion threads attached to selected text.
- **Manual reference notes** — footnote-style notes you author yourself (separate from AI citations).
- **Track Changes** — toggle to mark insertions/deletions for later accept/reject; accept all / reject all available.
- **Document Settings** — edit title, **init prompt** (per-document guidance the AI sees), and document language.
- **Focus Mode** — distraction-free view with optional white-noise background; muteable.
- **Save state** — cloud icon shows live save status; documents auto-save.

### 5. `#ai-tools` — Three flavors of AI assistance

This is the most important section. Subdivide into three subsections under one `<section>`:

#### 5a. AI Chat (right sidebar → Chat tab)
- Multiple **threads** per document; threads auto-name themselves after the first response.
- Composer at bottom; markdown rendered in messages.
- Citation bubbles appear inline in assistant messages.
- **Retry** rerunns generation with the same evidence; **Fresh evidence** re-runs retrieval first.
- Chat sees: your message, the thread history, your bound Ready sources, the document's init prompt and language.

#### 5b. Inline writing tools (text selection)
- Select text → small action icon appears → choose preset or custom instruction:
  - **Coherent** — improve flow & transitions.
  - **Concise** — shorten while preserving meaning.
  - **Detailed** — expand with more specificity.
  - **Humanize** — make more natural-sounding.
  - **Custom** — your own instruction.
- Pick which bound sources to ground against (default: all Ready sources).
- Output streams in; **Insert / Replace / Append** buttons apply it; **Retry** and **Fresh evidence** behave as in chat.
- Falls back to ungrounded if retrieval returns nothing.

#### 5c. Grounded prediction (ghost text)
- Pause typing → ghost text appears suggesting the next phrase.
- A small badge tells you whether the suggestion is **grounded** (drawn from your references) or ungrounded.
- **Tab** to accept, **Esc** to dismiss.
- Predictions need a collapsed cursor (no active selection) and use up to ~4000 characters of preceding text as context.

### 6. `#citations` — Evidence and the citation viewer
- Citation bubbles (`E1`, `E2`, …) appear under any grounded output.
- Click a bubble to open the **Evidence Viewer** side sheet, which shows the source title, modality (e.g., PDF page N, webpage section), the excerpt, and a preview of the source asset (PDF window, webpage snapshot, image).
- Use the arrows in the sheet to step through sibling evidence items.
- **Why citations might fail to preview**: the source was deleted, or the source was unbound after the message was generated. The citation reference remains, but the asset can't be shown.

### 7. `#version-history` — Restore and audit
- Open from the editor toolbar.
- Each revision lists revision number, timestamp, and the action that created it (Created / Saved / AI tool / Prediction accepted / Restored).
- Preview a revision in the sheet, then **Restore** to make it the new head. Restore is non-destructive — it creates a new revision rather than deleting history.

### 8. `#references` — Importing and managing sources

Cover, in order:

- **Supported file types**: PDF, DOCX, ZIP archives (each contained file must be supported), captured webpage snapshots. **Pro plan**: MP3, WAV, MP4, JPG, PNG, GIF, WebP, HEIC.
- **Three ways to import**: local file picker, webpage URL capture, Google Drive folder/file picker.
- **Ingestion lifecycle**: Pending → Ingesting → **Ready** (or Error). Only Ready sources can be bound and used for grounding.
- **Source actions**: Preview, Re-ingest (rebuild segments/embeddings, useful after metadata edits), Edit Metadata, Delete.
- **Metadata**: title, authors, publication date, URL — used in citations. Auto-filled after ingestion when possible; you can edit it.
- **Binding** is per-document, not global — bind from the editor's **References** tab.

### 9. `#templates` — Personal and system starters
- **My Templates** tab to create from scratch or import a DOCX.
- **System category tabs** for built-in starters (read-only).
- Editing a template uses the same toolbar as the document editor.
- **Use Template** creates a new document prefilled with that template's content.

### 10. `#export` — Getting work out
- **Download as PDF** and **Download as DOCX** from the editor's export menu.
- **Export to Google Drive** with folder picker; requires Drive OAuth.
- DOCX is the most lossless option for formatting fidelity.

### 11. `#shortcuts` — Keyboard reference

A small two-column table:

| Action | Shortcut |
|---|---|
| Accept prediction | Tab |
| Dismiss prediction | Esc |
| Bold / Italic | ⌘B / ⌘I |
| Undo / Redo | ⌘Z / ⌘⇧Z |

(Confirm exact mappings against `inkwise-editor.tsx` and `editor-toolbar.tsx` while implementing — only list shortcuts the editor actually wires up.)

### 12. `#faq` — Troubleshooting (Accordion)

Use the existing `Accordion` component. Each item is one question + a short answer. Draft items:

- **My source is stuck on "Ingesting…"** — Ingestion is async. Refresh the page or come back in a minute. If it stays stuck, click **Re-ingest** on the source.
- **The AI ignored my reference** — Confirm the source status is **Ready**, that you bound it from the editor's References tab, and that the inline tool's source filter isn't excluding it.
- **The AI cited the wrong section** — Use **Fresh evidence** to re-run retrieval. If it persists, edit the source metadata and Re-ingest.
- **Why is the citation preview blank?** — The source was deleted or unbound after the message was generated. The citation text remains, but the asset is no longer available.
- **DOCX upload failed** — DOCX ingestion requires LibreOffice on the server. If it fails repeatedly, contact us.
- **Scanned PDFs aren't searchable** — Inkwise OCRs scanned PDFs automatically (English). Non-English OCR isn't supported yet.
- **Why can't I upload audio/video/images?** — These require a Pro plan.
- **Predictions stopped appearing** — Predictions need a collapsed cursor (no active selection) and at least a moment of idle typing. Check that the document has bound, Ready sources if you want grounded predictions.
- **Can I undo a Restore?** — Yes — Restore creates a new revision rather than deleting history. Open Version History again and restore an earlier revision.
- **Where did my document go?** — If you deleted its folder, it moved to **Unfiled**, not the trash.

### 13. `#limits` — Known constraints
- Lexical full-text search is English only; vector search works across languages.
- OCR for scanned PDFs is English only.
- Prediction context is capped at ~4000 characters of preceding text.
- Source library lists paginate at 50 per page.
- Audio / video / image references require Pro.

### 14. `#contact` — Getting help
- One short paragraph linking to the Contact page (`/contact`) for anything not answered here. Mention what to include: document name, source name(s), approximate timestamp, and what you expected vs. what happened.

---

## Implementation steps

1. **Rewrite `app/dashboard/inkwise/help/page.tsx`** as a server component with:
   - A `sections` data array (`{ id, title, render }`) so the TOC and content stay in sync.
   - The TOC rail using anchor links and `aria-label="On this page"`.
   - Sections rendered as `<section id={id} className="scroll-mt-24 ...">` with `Card` containers where appropriate.
   - The FAQ rendered with `Accordion type="single" collapsible` from `components/ui/accordion.tsx`.
   - Glossary as a `<dl>`.
   - Shortcuts as a small `<table>` styled with Tailwind.

2. **Confirm copy against the code** before shipping each section — for any claim about UI labels, button names, or shortcut keys, open the referenced component and verify. Specifically:
   - Inline tool preset names: `components/inkwise/inline-writing-tools.tsx`.
   - Editor toolbar labels and shortcuts: `components/inkwise/editor-toolbar.tsx`, `components/inkwise/inkwise-editor.tsx`.
   - Prediction shortcut and behavior: `components/inkwise/editor-prediction.ts`.
   - Source upload accepted types and Pro gating: `components/inkwise/source-import-panel.tsx`.
   - Folder behavior on delete: `components/inkwise/write/folder-dialogs.tsx`.

3. **No new files.** Everything goes into the single `help/page.tsx`. Targets ~350–500 lines.

4. **Accessibility pass**:
   - Headings descend cleanly: page `<h1>` lives in the layout, sections start at `<h2>`, sub-sections at `<h3>`.
   - TOC `<nav aria-label="On this page">`.
   - Accordion already handles ARIA via Radix.
   - Each section anchor is keyboard-focusable (links in the TOC are sufficient; no need for tabindex).

5. **Visual review**:
   - On `< lg`, TOC collapses (hide via `hidden lg:block`) so the content takes full width on mobile.
   - Sections separated by `space-y-10` or similar; cards keep the rounded-3xl/xl vibe of the rest of the module.
   - Code-like terms (`Ready`, `Unfiled`, `Tab`) wrapped in `<kbd>` or styled `<span>` for visual emphasis.

6. **Don't ship yet-to-exist features.** The agent inventory flagged a few items as "schema-ready but not productionized" (multimodal evidence preview details, query rewrite UI). Leave those out — this is a help page for what the user can do today.

---

## Files that will change

- `app/dashboard/inkwise/help/page.tsx` — full rewrite.

## Files to read before/while implementing

- `app/dashboard/inkwise/help/page.tsx` (current state, design-language baseline)
- `app/dashboard/inkwise/layout.tsx` (page header is here, don't duplicate)
- `components/inkwise/inkwise-module-nav.tsx` (nav labels — keep terminology consistent)
- `components/inkwise/inline-writing-tools.tsx` (inline preset names + behavior)
- `components/inkwise/inkwise-editor.tsx` + `editor-toolbar.tsx` + `editor-prediction.ts` (toolbar features, shortcuts)
- `components/inkwise/source-import-panel.tsx` (file types, Pro gating, import paths)
- `components/inkwise/citation-bubbles.tsx` (evidence viewer behavior)
- `components/inkwise/write/folder-dialogs.tsx`, `document-grid.tsx`, `folder-sidebar.tsx`
- `docs/inkwise/INKWISE_PATENT_FEATURES.md`, `INKWISE_PIPELINE.md`, `INKWISE_PATENT_UI.md` (cross-check the user-facing claims)
- `components/ui/accordion.tsx` (FAQ component)

## Open questions for you before implementing

1. **Screenshots / inline images?** The current help page is text-only. Adding annotated screenshots (stored under `public/inkwise/help/`) would help, but they'd need maintenance. Default plan above is text-only; say the word and I'll add an "illustrations" pass.
2. **Search inside help?** Out of scope for v1 — anchored TOC is enough. Flag if you want a client-side filter.
3. **Per-section "Was this helpful?" feedback?** Out of scope for v1.
4. **Should the help page be reachable from the editor too** (e.g., a `?` icon in the toolbar that deep-links to `#ai-tools`)? Easy add later if useful.
5. **Anything that's about to ship** that I should pre-document (e.g., the Gemini migration changes from your recent commits)? I deliberately scoped to current behavior.
