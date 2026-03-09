# Inkwise V2 RAG Pipeline (Vectorless, PageIndex OSS + Postgres FTS + Gemini)

This document describes the end-to-end Retrieval-Augmented Generation (RAG) pipeline implemented in Inkwise V2.

Current architectural stance:

- We do **not** call the hosted PageIndex SaaS API.
- We do use **vendored PageIndex OSS** for **PDF tree generation**.
- We persist **page text** + **tree nodes** in Postgres.
- We perform **vectorless retrieval** using Postgres full-text search (FTS), with optional **Gemini-assisted tree search** as a fallback.
- We generate the final grounded answer using **Gemini**, constrained to cite only evidence blocks we provide.

Related docs:

- `INKWISE_V2_NO_PAGEINDEX_API.md` (architecture decision and data model)
- `INKWISE_V2_DOCS.md` (broader V2 architecture; parts are outdated re: PageIndex SaaS)
- PageIndex reference docs: `vendor/pageindex/docs/`

---

## Big Picture

```
Browser (Next.js)
  -> FastAPI (/api/v2)
      -> Postgres (Cloud SQL)
      -> GCS (uploads/derived)
      -> Cloud Tasks -> Cloud Run Jobs (ingestion)
      -> Gemini (treegen, retrieval assist, grounded answer)
```

Key idea: for grounded chat, the model never sees a raw PDF. It sees short, page-cited text excerpts ("evidence") extracted and selected by the retrieval pipeline.

Separate from grounded chat, the editor also has a draft-only autocomplete path:

- The browser can request a short inline continuation from `POST /api/v2/documents/{document_id}/predictions`.
- That path does **not** run retrieval, does **not** use bound sources, and does **not** persist chat/history rows.
- It is optimized for low-latency paused-typing suggestions that the user can accept with `Tab`.

---

## Data Products (What We Persist)

Ingestion produces two primary retrieval indices per source:

1) Page text (per-page extracted text)

- Table: `source_pages` (ORM: `app.models.rag.SourcePage`)
- Key fields: `source_id`, `page_number`, `text`, `text_tsv` (generated tsvector), `is_ocr`, `char_count`

2) Document tree (hierarchical sections)

- Table: `source_tree_nodes` (ORM: `app.models.rag.SourceTreeNode`)
- Key fields: `source_id`, `node_id`, `parent_node_id`, `depth`, `title`, `page_start`, `page_end`, `node_summary`, `path_titles`, `node_text_tsv` (generated tsvector)

Retrieval is auditable:

- Table: `retrieval_runs` (ORM: `app.models.rag.RetrievalRun`)
  - Stores query, bound sources, `strategy_version`, and `meta` (debug payload)
- Table: `retrieval_evidence` (ORM: `app.models.rag.RetrievalEvidence`)
  - Stores the exact evidence blocks provided to Gemini (source/page/node + excerpt)

Schema/indices are created in `apps/api/alembic/versions/0003_treegen_rag_tables.py`.

---

## Ingestion Pipeline (PDF -> Pages + Tree)

Primary entrypoint (one-shot ingestion in the current implementation):

- `apps/api/app/services/ingestion.py:process_source_ingestion_once`

### 0) Preconditions / Eligibility

- Current supported type for grounded RAG ingestion: **PDF only**.
- If a source is not PDF, ingestion fails with `unsupported_type`.

### 1) Download the canonical PDF

- Inputs: `sources.storage_bucket`, `sources.storage_object`
- Downloads the PDF to a temp directory.

### 2) Extract page text

- Uses `apps/api/app/services/pdf_extract.py` (currently PyMuPDF-based; called as `extract_pdf_pages_text`).
- Produces a list of per-page text blobs.
- Persists:
  - Delete-and-replace existing `source_pages` for the source.
  - Insert new `SourcePage` rows with `page_number`, `text`, `char_count`, `is_ocr`.

Note: OCR is not implemented in the one-shot ingestion path yet; `is_ocr` is currently `False`.

### 3) Generate a hierarchical tree (PageIndex OSS, Gemini-powered)

- Wrapper: `apps/api/app/services/pageindex_oss_treegen.py:generate_tree`
- Uses the vendored PageIndex OSS implementation, but monkeypatches its OpenAI hooks to call Gemini instead.
- Treegen output is a dict with at least `structure`:
  - Each node includes `title`, `node_id`, and `start_index` (page start).
  - We request node summaries (`summary`) when available.

### 4) Normalize tree -> `source_tree_nodes`

- Walk the nested `structure` and flatten it in pre-order (reading order).
- Materialize:
  - `node_id`, `parent_node_id`, `depth`, `title`
  - `page_start` from `start_index`
  - `path_titles` (breadcrumb list of titles)
- Compute `page_end` deterministically based on the next node's `page_start` and total `page_count`:
  - For node i: `page_end = max(page_start, min(page_count, next_page_start - 1))`
  - Last node ends at `page_count`

### 5) Cache raw tree JSON (GCS)

- If `GCS_DERIVED_BUCKET` is configured, upload tree JSON to:
  - `treegen/pageindex_oss/{user_id}/{source_id}/{ingestion_id}/tree.json`
- Store the GCS pointer in `source_ingestions.tree_gcs_bucket` / `tree_gcs_object`.

### 6) Mark ingestion complete

- Update `source_ingestions`:
  - `status=completed`, timestamps, `page_count`, engine/version fields
- Update `sources.status=completed`

Failure behavior:

- On any failure, ingestion attempts to mark both `source_ingestions` and `sources` as `failed` with a user-safe message in `error_json` / `failure_detail`.

---

## Runtime Query Path (Grounded Chat)

Grounded chat is implemented as a streaming SSE endpoint:

- `POST /api/v2/chat/threads/{thread_id}/messages:stream`
- Handler: `apps/api/app/api/routes/chat.py:stream_message`

At a high level:

0) Apply the user's per-message scope options (selected sources; optional draft selection text).
1) Identify which bound sources are "ready" to participate (completed ingestion + pages + nodes).
2) Run retrieval to produce evidence blocks from the scoped sources.
3) Ask Gemini to answer using only those evidence blocks (draft selection is context-only).
4) Stream tokens/events back to the browser.
5) Persist the final assistant message + citations metadata.

### 0) Per-message scope options

The chat request supports two optional scope controls:

- `source_ids`: optional allow-list of bound sources to include for this message.
  - Default behavior (if omitted): use all grounded-chat-ready sources bound to the document.
  - Validation rule: if provided, every `source_id` must be both (a) bound to the document and (b) grounded-chat-ready.
  - Empty list is rejected.
- `draft_selection_text`: optional text the user selected from the document they are writing.
  - This is treated as *additional context*, not evidence.
  - The model is explicitly instructed not to cite it; citations must reference evidence IDs only.

SSE metadata:

- The first `event: meta` includes the resolved `sources` list actually used (scoped) and whether a draft selection was attached.

### 1) Determine ready, bound sources

Bound sources are taken from `document_source_bindings` where `is_active=true`.

Readiness checks (per bound source) in `apps/api/app/api/routes/chat.py:_ready_bound_sources`:

- Must have a completed `source_ingestions` row for `pipeline='treegen'`.
- Must have at least one `source_pages` row.
- Must have at least one `source_tree_nodes` row.

The chat request is rejected if there are no ready bound sources.

If `source_ids` is provided, the server narrows the ready set to that explicit allow-list (after validation).

### 2) Retrieval (Evidence selection)

Entry point:

- `apps/api/app/rag/retrieval.py:run_hybrid_retrieval`

Inputs:

- `query` (user question)
- `bound_sources` = list of `(source_id, source_title)` (already scoped per message if `source_ids` was provided)
- Optional context (used by query rewrite when enabled): recent thread history + document hints (language/purpose) + optional draft selection text
- Optional configs:
  - `SourcePrefilterConfig` (when there are many sources)
  - `QueryRewriteConfig` (Gemini query rewrite when lexical retrieval yields no evidence)
  - `TreeSearchConfig` (Gemini-assisted node selection fallback)

Outputs:

- A `retrieval_run_id`
- An ordered list of `EvidenceItem` blocks with IDs like `E01`, `E02`, ...

Retrieval is explicitly auditable:

- `retrieval_runs` is created at the start.
- `retrieval_evidence` is populated with the final evidence blocks.
- `retrieval_runs.meta` records which strategies ran and what they selected.

Note on naming: although the field is called `bound_source_ids`, `retrieval_runs.bound_source_ids` reflects the *scoped* sources used for that retrieval run (i.e., the sources considered for that message).

#### 2.1 Source prefilter (when there are many sources)

Goal: reduce per-source work by selecting only the most likely sources.

Trigger (defaults):

- Enabled by `RETRIEVAL_SOURCE_PREFILTER_ENABLED` (default true).
- Runs only when `len(bound_sources) > RETRIEVAL_SOURCE_PREFILTER_TRIGGER_COUNT` (default 20).
- Keeps at most `RETRIEVAL_SOURCE_PREFILTER_TOP_K` sources (default 10).

Ranking stages:

- Stage A: rank sources by matches in node titles/summaries:
  - Query `source_tree_nodes.node_text_tsv` and aggregate per `source_id`.
- Stage B (optional): if Stage A returns fewer than K, rank remaining sources by page text:
  - Query `source_pages.text_tsv` and aggregate per `source_id`.
- Fill remaining slots by the existing bound-source order (recency).

Safety net:

- If prefilter ran and the selected sources yield **zero evidence**, retrieval automatically widens to the full bound source set and tries again.

Metadata:

- Recorded under `retrieval_runs.meta.source_prefilter`.

#### 2.2 Pass 1: Lexical retrieval (Postgres FTS)

For each selected source:

1) Find best-matching nodes in `source_tree_nodes`:

- Match: `node_text_tsv @@ websearch_to_tsquery('english', :q)`
- Rank: `ts_rank(node_text_tsv, tsq)`
- Take top N nodes (default 12)

2) For each matched node, find best-matching pages within that node's page range:

- Match: `text_tsv @@ websearch_to_tsquery('english', :q)` within `page_number BETWEEN page_start AND page_end`
- Rank: `ts_rank(text_tsv, tsq)`
- Extract excerpts using `ts_headline(...)` (produces short, highlight-style fragments)

3) If no nodes match for a source, fall back to matching pages across the full source:

- Same FTS + `ts_headline(...)`, but no node range filter.

Evidence budgeting:

- Caps total evidence count and total chars.
- De-dupes pages so the same page is not included twice.

#### 2.3 Pass 1b (optional): Gemini query rewrite (retrieval query builder)

Purpose: improve recall for complex / multi-part / follow-up questions that often produce zero FTS matches.

When it runs:

- Enabled by `GEMINI_QUERY_REWRITE_ENABLED=true`.
- Only runs when Pass 1 (and any prefilter widen-to-full safety net) yields **zero evidence**.

What Gemini does:

- Consumes the current user question plus recent thread history.
- Produces a JSON object with:
  - `standalone_question`: resolves pronouns and follow-ups into a standalone question.
  - `fts_query`: a short query string tailored for `websearch_to_tsquery('english', q)`.
  - `subqueries`: a small list of shorter decomposed queries for multi-part questions.
- The backend lightly cleans these fields (whitespace collapse, evidence-marker stripping, length caps).

How it is used:

- The retriever retries lexical FTS using `fts_query` first, then `subqueries` (up to `GEMINI_QUERY_REWRITE_MAX_QUERIES`).
- If `standalone_question` is present, it is used as the input query for the tree-search fallback (Pass 2) to keep follow-ups coherent.
- If Gemini errors or returns no usable `fts_query` / `subqueries` / `standalone_question`, the retriever falls back to deterministic keyword extraction from the user question.

Metadata:

- Recorded under `retrieval_runs.meta.query_rewrite` including model, attempts, and per-attempt evidence added.

#### 2.4 Pass 2 (optional): Gemini-assisted tree search fallback

Purpose: recover relevant nodes for sources where lexical retrieval found nothing.

When it runs:

- Enabled by `GEMINI_TREE_SEARCH_ENABLED=true`.
- Only considered when total evidence after lexical retrieval (including optional query rewrite retries) is below `GEMINI_TREE_SEARCH_MIN_EVIDENCE` (default 4).
- Only targets sources that have contributed **zero** evidence so far.
- Limited to at most `GEMINI_TREE_SEARCH_MAX_SOURCES` sources (default 3).

What Gemini does (node selection, not answering):

- For a given source, we load its `source_tree_nodes` and build a parent/child adjacency map.
- We run an iterative drill-down over the tree:
  - Start frontier = root nodes.
  - Each round:
    - Cap frontier to `GEMINI_TREE_SEARCH_MAX_FRONTIER` nodes (default 40).
    - Ask Gemini to return JSON: `{ "node_list": ["0006", ...] }` containing only node_ids from the frontier.
    - Validate strictly: drop unknown ids, dedupe, cap to `GEMINI_TREE_SEARCH_MAX_PICK` (default 8).
    - Expand frontier to children of the picked nodes.
  - Stop after `GEMINI_TREE_SEARCH_MAX_ROUNDS` (default 3) or when there is nothing to expand.
- Final selection keeps only the deepest picked nodes (drops ancestors of other picked nodes).

Turning selections into evidence:

- For each picked node, we run the same page-level FTS query as Pass 1, restricted to that node's page range, and extract excerpts.

Failure behavior:

- If Gemini errors, returns invalid JSON, or returns no usable node_ids, tree search yields no extra evidence and the pipeline continues.

Metadata:

- Recorded under `retrieval_runs.meta.tree_search` including rounds, picked node_ids, and any error.

#### 2.5 Evidence format (what the model sees)

Evidence blocks look like:

```
[E01] source="Some PDF" page=12 node="Termination"
<excerpt text>
```

The evidence ID set becomes an allow-list for citations.

### 3) Grounded answer generation (Gemini)

After retrieval, the chat endpoint builds a prompt containing:

- Document hints (optional): language, purpose/init_prompt
- Optional draft selection (if provided): included as context-only and explicitly marked as non-citable
- Strict instructions:
  - Answer using ONLY the evidence blocks.
  - If evidence is insufficient, say what's missing and ask a clarifying question.
  - Citation rules:
    - cite with `[E01]` style markers
    - only cite from the provided evidence IDs
- The user question
- The evidence pack

Gemini call:

- Uses `apps/api/app/services/gemini.py:generate_text`
- Streams output to the browser via SSE.

### 4) Citation enforcement

The application enforces citation integrity at two levels:

1) Prompt-level: Gemini is told it may cite only the provided evidence IDs.
2) Server-level: the stream handler parses citation markers like `[E01]` and can validate they are in the allow-list (evidence IDs sent in meta).

Draft selection safety:

- The prompt also states that `draft_selection_text` must not be cited.
- The server still only recognizes and stores citations that map to known evidence IDs.

### 5) Persistence + observability

Persisted for every grounded chat request:

- User message is inserted before streaming.
- `retrieval_runs` + `retrieval_evidence` are written during retrieval.
- Assistant message is persisted at the end of the stream (with provider metadata), including the `retrieval_run_id` linkage.

Per-message scope persistence:

- `chat_messages.provider_meta.scoped_source_ids`: the source IDs actually used for the request.
- `chat_messages.provider_meta.draft_selection_text`: the attached draft selection text (truncated; context-only).
- `chat_messages.provider_meta.draft_selection_truncated`: whether truncation occurred.

Operators can debug a response by inspecting:

- `retrieval_runs.strategy_version` (e.g., `fts+sp+qr+tree-v1`)
- `retrieval_runs.meta` (source prefilter decisions + query rewrite attempts + tree search decisions)
- `retrieval_evidence` (the exact excerpt text that Gemini saw)

---

## Runtime Query Path (Draft Prediction / Autocomplete)

Inline draft prediction is implemented as a normal JSON endpoint:

- `POST /api/v2/documents/{document_id}/predictions`
- Handler: `apps/api/app/api/routes/writing_tools.py:create_prediction`

At a high level:

0) The editor waits for a short idle pause while the cursor is collapsed and focused.
1) The browser sends local draft context around the cursor.
2) The backend builds a short autocomplete prompt from document metadata + local draft text.
3) Gemini returns either a short continuation or `NO_PREDICTION`.
4) The frontend renders the returned text as ghost text and lets the user accept it with `Tab`.

### 0) Frontend trigger and acceptance rules

Current editor behavior in `apps/web/app/(app)/write/[id]/page.tsx` and `apps/web/app/_components/editorPrediction.ts`:

- Prediction is requested only after an idle debounce (~800ms).
- The editor must be focused, the selection must be collapsed, and the caret must be at the end of the current text block.
- The request is canceled when the user keeps typing, changes selection, blurs the editor, or the document enters conflict state.
- If a suggestion is visible:
  - `Tab` accepts it and inserts the text into the editor.
  - `Esc` dismisses it.
  - typing/navigation keys also dismiss it.

### 1) Request contract

The browser sends a draft-only payload:

- `before_text`: text before the cursor (trimmed server-side to a bounded context window)
- `after_text`: text after the cursor
- `current_block_text`: the text block containing the cursor

Important constraints:

- This payload is derived from the **unsaved local editor state**, not the last persisted document version.
- No bound-source IDs are included.
- No retrieval config is involved.

### 2) Prompt construction

The backend prompt builder lives in `apps/api/app/api/routes/writing_tools.py:_build_prediction_prompt`.

Prompt goals:

- continue naturally from the cursor position
- match the document language, title, and `init_prompt` guidance when present
- keep the completion short and tabbable
- include necessary leading whitespace / punctuation
- return `NO_PREDICTION` if the continuation is weak

This is intentionally a **draft-only** completion path, not a grounded answer path.

### 3) Model call and normalization

Gemini call details:

- Uses `apps/api/app/services/gemini.py:generate_text`
- Uses `GEMINI_MODEL`
- Response is normalized by `apps/api/app/api/routes/writing_tools.py:_normalize_prediction_text`

Normalization rules:

- map `NO_PREDICTION` to an empty suggestion
- drop code fences / extra newlines
- keep only the first non-empty line
- cap the returned suggestion length
- suppress obvious echo/repetition of the surrounding draft text

### 4) Persistence, quota, and observability

Current implementation intentionally keeps prediction lightweight:

- No `chat_messages` row is written.
- No `retrieval_runs` / `retrieval_evidence` rows are written.
- No grounded citations are produced.
- No quota ledger write is performed today.

This keeps paused-typing autocomplete cheap enough to cancel frequently without polluting chat history or retrieval audit tables.

---

## Configuration (Env Vars)

Gemini:

- `GEMINI_API_KEY` (required)
- `GEMINI_MODEL` (writing tools + inline draft prediction)
- `GEMINI_GROUNDED_MODEL` (grounded chat output)
- `GEMINI_TREEGEN_MODEL` (tree generation)

Gemini query rewrite (retrieval query builder; optional):

- `GEMINI_QUERY_REWRITE_ENABLED` (default true)
- `GEMINI_QUERY_REWRITE_MODEL`
- `GEMINI_QUERY_REWRITE_MAX_HISTORY_MESSAGES` (default 12; set to 0 to avoid loading thread history)
- `GEMINI_QUERY_REWRITE_MAX_QUERIES` (default 4)
- `GEMINI_QUERY_REWRITE_MAX_QUERY_CHARS` (default 180)
- `GEMINI_QUERY_REWRITE_TIMEOUT_SECONDS` (default 15)

Source prefilter:

- `RETRIEVAL_SOURCE_PREFILTER_ENABLED` (default true)
- `RETRIEVAL_SOURCE_PREFILTER_TRIGGER_COUNT` (default 20)
- `RETRIEVAL_SOURCE_PREFILTER_TOP_K` (default 10)
- `RETRIEVAL_SOURCE_PREFILTER_STAGE_B_ENABLED` (default true)

Gemini tree search fallback:

- `GEMINI_TREE_SEARCH_ENABLED` (default true)
- `GEMINI_TREE_SEARCH_MODEL`
- `GEMINI_TREE_SEARCH_MIN_EVIDENCE` (default 4)
- `GEMINI_TREE_SEARCH_MAX_SOURCES` (default 3)
- `GEMINI_TREE_SEARCH_MAX_ROUNDS` (default 3)
- `GEMINI_TREE_SEARCH_MAX_FRONTIER` (default 40)
- `GEMINI_TREE_SEARCH_MAX_PICK` (default 8)

GCS:

- `GCS_UPLOADS_BUCKET` (source uploads)
- `GCS_DERIVED_BUCKET` (derived artifacts; tree JSON cache)

---

## Known Limitations / Next Steps

- Non-PDF sources: currently fail ingestion. Planned: conversion-to-PDF pipeline before extraction/treegen.
- OCR: `source_pages.is_ocr` is present but the OCR fallback path is not implemented in the one-shot ingestor.
- Language-specific FTS: FTS currently uses the Postgres `english` configuration.
- Query rewrite: adds an extra Gemini call on `no_evidence` paths.
- Readiness checks: `_ready_bound_sources` is currently N+1 per source; can be optimized with set-based queries if needed.
- Inline prediction is currently draft-only; it does not use bound grounded sources.
- Inline prediction only runs when the caret is at the end of the current text block; mid-paragraph/mid-sentence insertion prediction is not implemented yet.
