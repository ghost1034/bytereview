# Inkwise Patent Features

This document defines the target Inkwise feature set needed to achieve functional parity with the patent, excluding the detailed UI specification that will live in `docs/INKWISE_PATENT_UI.md`.

It assumes the PageIndex removal and Gemini Embedding 2 migration described in `docs/INKWISE_GEMINI_EMBEDDING_2.md`.

## Scope

This feature doc covers the remaining patent-driven gaps called out for Inkwise:

- multimodal references
- predictive writing based on both draft context and references
- clickable citation bubbles with evidence viewing
- retry functionality for AI output
- document version control similar to Google Docs

It does not define the final page layouts, menus, or interaction polish for those features.

## Product Goals

- Make references first-class inputs to drafting, not just background context for chat.
- Preserve evidence traceability from retrieval through generated output.
- Let users safely iterate on AI output without losing work.
- Give users document history and recovery, not just optimistic write protection.
- Support a broader reference set than PDFs so Inkwise matches the patented workflow more closely.

## Non-Goals

- This doc does not redesign the full editor shell or templates navigation.
- This doc does not require real-time collaborative multiplayer editing.
- This doc does not require external source syncing beyond what is needed to ingest references.

## Current Gaps

Based on the current Inkwise implementation:

- source ingestion is still effectively PDF-first, with DOCX normalization support present in backend services but not yet surfaced as a complete product feature
- inline predictions are ungrounded and only use document text + prompt
- citations exist, but only as lightweight chips rather than evidence-first citation bubbles
- AI output has no explicit retry/regenerate workflow
- documents have optimistic `version` conflict protection, but no user-visible version history or restore flow

## Target Feature Set

## 1. Multimodal References

### Goal

Users can attach and ground against references beyond plain PDFs, including DOCX and webpages in the first product pass, with the architecture ready for images, audio, and video.

### Supported modalities

Phase 1 target:

- PDF
- DOCX
- webpage snapshot

Phase 2-ready architecture:

- image
- audio
- video

### Functional behavior

- A reference is uploaded or captured into Inkwise.
- Inkwise normalizes it into canonical assets and retrieval segments.
- Gemini Embedding 2 embeddings are generated for those segments.
- The reference can then be bound to a document and used by retrieval, chat, writing tools, and grounded prediction.

### Modality requirements

#### PDF

- upload original PDF
- store canonical PDF asset
- generate retrieval segments and evidence previews

#### DOCX

- upload original DOCX
- convert to canonical PDF
- preserve extracted text for evidence excerpts
- expose the source to retrieval just like a PDF-backed reference

#### Webpage

- capture an immutable snapshot of the page
- store the source URL and capture timestamp
- retain both cleaned text and rendered visual representation where needed
- retrieve against the snapshot, not the live page

### Data requirements

Each source should retain:

- original asset metadata
- canonical normalized asset metadata
- modality
- ingestion metadata
- segment locators
- preview assets for evidence display

### Acceptance criteria

- a user can upload a PDF and use it for grounding
- a user can upload a DOCX and use it for grounding
- a user can add a webpage snapshot and use it for grounding
- all three source types can return evidence objects with stable locators and previews

## 2. Grounded Predictive Writing

### Goal

Predictive writing should use both the draft context and the bound references, not only the preceding draft text.

### Current behavior

Current predictions use:

- preceding text
- following text
- current block text
- document language
- initial document prompt

They do not use retrieval or bound sources.

### Target behavior

When the user pauses in the editor with a collapsed caret, Inkwise should:

1. collect draft context
2. build a retrieval query from the draft context and document prompt
3. retrieve evidence from bound references
4. generate the prediction with both the draft context and evidence pack
5. return both the suggestion text and evidence metadata

### Retrieval inputs for prediction

- preceding text
- current block text
- optional following text
- document `init_prompt`
- document language
- bound source IDs

### Output requirements

Prediction responses should include:

- `suggestion_text`
- `grounded`
- `retrieval_run_id` when grounded
- evidence metadata for later citation and inspection

### Fallback behavior

- If there are no ready bound sources, predictions may fall back to ungrounded mode.
- If retrieval returns no useful evidence, Inkwise may either:
  - return ungrounded prediction text with `grounded=false`, or
  - suppress the prediction entirely if confidence is too low.

### Acceptance criteria

- grounded prediction is available when a document has ready bound sources
- grounded predictions cite evidence segments internally even if the inline ghost text is visually minimal
- prediction can safely fall back when references are unavailable

## 3. Citation Bubbles And Evidence Viewer

### Goal

Generated output should expose evidence as clickable citation bubbles that open the supporting material from the reference.

### Scope

This applies to:

- grounded chat responses
- grounded writing tool outputs
- grounded predictive writing once accepted into the document

### Core behavior

- Every grounded generation flow stores citation references back to retrieval evidence.
- The frontend renders compact citation bubbles tied to those evidence IDs.
- Clicking a citation bubble opens an evidence viewer anchored to the retrieved reference location.

### Evidence viewer requirements

The evidence viewer should support:

- source title
- locator display
- excerpt text
- preview asset when available
- navigation among all evidence items attached to the same generation result

### Locator behavior by modality

#### PDF / DOCX-as-PDF

- open the preview at the relevant page range
- highlight or frame the excerpt region if available later

#### Webpage

- show the captured snapshot and anchor to the relevant section

#### Image

- show the referenced image preview

#### Audio / Video

- open the preview at the relevant time range

### Persistence requirements

Citation records should point to:

- retrieval run
- evidence ID
- segment ID
- locator metadata
- preview metadata

### Acceptance criteria

- grounded chat answers show clickable citation bubbles
- grounded writing tool outputs show clickable citation bubbles
- clicking a bubble opens evidence tied to the correct source and locator

## 4. Retry / Regenerate Functionality

### Goal

Users must be able to ask Inkwise to retry AI output without manually reconstructing the request.

### Supported retry targets

- chat assistant response
- writing tool result
- predictive writing suggestion

### Core behavior

Retry should reuse the same underlying request context with a new generation attempt:

- same document context
- same selected text or user question
- same scoped sources
- same retrieval mode
- same evidence pack by default, unless a fresh retrieval is requested

### Retry modes

#### Regenerate from same evidence

- run generation again using the existing retrieval run and evidence pack
- useful when the evidence is good but the prose is weak

#### Retry with fresh retrieval

- rerun retrieval and then regenerate
- useful when the user wants a new grounding attempt

### Data model additions

Add a generation-attempt concept for AI outputs, such as:

- generation group ID
- attempt number
- parent attempt ID optional
- retrieval run ID
- provider/model metadata
- final accepted flag

### Product behavior

- retries should not overwrite the original result silently
- users should be able to compare or replace the prior output
- accepted output should become the visible canonical result for that interaction

### Acceptance criteria

- chat supports retrying the last assistant response
- writing tools support retrying the most recent result for the same selected text and instruction
- prediction supports regenerating the suggestion before acceptance

## 5. Document Version Control

### Goal

Inkwise documents should have user-visible version history and restore behavior similar in spirit to Google Docs.

### Current behavior

Documents only store a single current draft plus an optimistic `version` counter for conflict detection.

### Target behavior

Inkwise should create durable document revisions that users can inspect and restore.

### Revision model

Introduce revision records such as `inkwise_document_revisions` with:

- revision ID
- document ID
- sequential revision number
- snapshot of `content_json`
- snapshot of `content_html`
- title and `init_prompt`
- creator / actor metadata
- change source metadata
- created timestamp

### Revision creation triggers

Create a revision when:

- the user explicitly saves meaningful changes
- a writing tool applies an AI rewrite to the document
- a user accepts grounded predictive text, if revision frequency policy allows
- a restore operation occurs

### Revision strategy

Recommended initial strategy:

- full snapshots first
- optional diff compression later if storage becomes a concern

This keeps the first implementation simpler and safer.

### Restore behavior

- users can open a revision timeline
- users can preview older revisions
- users can restore an older revision into the live document
- restore creates a new revision rather than deleting history

### Acceptance criteria

- documents expose a revision history API
- users can restore an older revision
- restoring a revision preserves a full audit trail

## Cross-Feature Requirements

## Evidence As A Shared Primitive

All patented features depend on evidence being a first-class object.

Inkwise should standardize on evidence objects with:

- retrieval run ID
- evidence ID
- source ID
- segment ID
- locator metadata
- preview metadata
- excerpt text

This lets chat, writing tools, prediction, citations, and retries all speak the same language.

## Generation Attempts As A Shared Primitive

Retry, citation display, and future auditability are easier if generation attempts are stored explicitly.

At minimum, attempts should preserve:

- request inputs
- retrieval linkage
- output text
- citations
- provider metadata
- accepted / superseded state

## Document-Safe Operations

AI features should not mutate the document silently.

- predictions remain provisional until accepted
- writing tool retries should not overwrite prior output automatically
- restores create new revisions

## Recommended Implementation Order

After the Gemini migration, the recommended feature order is:

1. multimodal references
2. citation bubbles and evidence viewer
3. retry/regenerate flows
4. document version control
5. grounded predictive writing

Rationale:

- multimodal ingestion and evidence locators are foundational
- citation bubbles depend on evidence previews
- retry depends on generation attempt tracking
- grounded prediction benefits from both retrieval maturity and evidence primitives

## Suggested Backend Additions

- `inkwise_document_revisions`
- `inkwise_generation_attempts` or feature-specific attempt tables
- source capture support for webpage snapshots
- richer evidence preview endpoints if signed URLs alone are not sufficient

## Suggested API Additions

### References

- `POST /api/inkwise/sources/webpage:capture`
- expanded upload/init flow for DOCX support

### Prediction

- extend `POST /api/inkwise/documents/{document_id}/predictions`
  - include grounding metadata
  - support retry/regenerate

### Chat

- add retry endpoint or retry action on thread messages

### Writing tools

- add retry action keyed by prior tool attempt

### Documents

- `GET /api/inkwise/documents/{document_id}/revisions`
- `GET /api/inkwise/documents/{document_id}/revisions/{revision_id}`
- `POST /api/inkwise/documents/{document_id}/revisions/{revision_id}:restore`

## Suggested Acceptance Test Matrix

### Multimodal references

- PDF upload -> ingest -> bind -> grounded chat
- DOCX upload -> normalize -> ingest -> bind -> grounded chat
- webpage capture -> ingest -> bind -> grounded chat

### Citation bubbles

- grounded answer returns citations
- clicking a citation opens the right evidence

### Retry

- retry chat from same evidence
- retry writing tool with fresh retrieval
- retry prediction before acceptance

### Version control

- save document creates revision
- restore old revision creates new head revision

### Grounded prediction

- same cursor position with sources bound returns grounded suggestion
- no sources bound falls back safely

## Definition Of Done

Inkwise achieves patent feature parity for this scope when:

- users can ground documents against multimodal references
- predictive writing can use both draft context and references
- grounded outputs expose clickable citation bubbles with evidence viewing
- users can retry AI outputs without rebuilding context manually
- documents have visible version history with restore support
