# Inkwise V2 (No PageIndex API): Tree Generation OSS + In-House Retrieval + Gemini Output

Last updated: 2026-02-25

This document replaces the PageIndex-API-dependent portions of `INKWISE_V2_DOCS.md`.

New direction:

- We do **not** call the hosted **PageIndex API** (no Chat API, no Retrieval API, no OCR API).
- We do use the **open-source PageIndex tree generation** (PDF -> hierarchical tree).
- We implement **retrieval ourselves** (vectorless; no embeddings required for the core path).
- We use **Gemini (Vertex AI)** for **final answer generation** (and optionally for tree-search / reranking).

Inputs/related docs:

- Current product behavior: `OLD_FEATURE_DOCS.md`
- Current implementation notes: `OLD_TECHNICAL_DOCS.md`
- V2 requirements/improvements: `INKWISE_V2_IMPROVEMENTS.md`
- V2 baseline architecture (before this decision): `INKWISE_V2_DOCS.md`
- PageIndex docs bundle (reference for concepts/prompting patterns): `pageindex/`

Explicit scope decision carried forward:

- The V1 `/hl` Hurrylegal module is **not** part of Inkwise V2.

---

## Goals and Non-Goals

Goals:

- Preserve V1 functional parity (documents + autosave, sources library + bindings, templates, export, AI writing tools, grounded chat with citations + history, auth/RBAC, quotas + Stripe, background processing).
- Keep the primary RAG path **vectorless** and **auditable**.
- Make grounded chat reliable without depending on a third-party PageIndex SaaS.

Non-goals (initially):

- Reproducing PageIndex's proprietary retrieval heuristics (e.g., value-function MCTS mentioned in `pageindex/tutorials/tree-search/README.md`). We will implement a pragmatic, measurable retrieval stack.
- Building a general "search across all sources" experience on day 1; default scope remains "sources bound to the document."

---

## High-Level Architecture (GCP)

Same as `INKWISE_V2_DOCS.md` except:

- Replace "PageIndex API" with an internal **Tree Generation + OCR/Extraction + Retrieval** subsystem.

Request/data path:

```
Browser
  -> HTTPS Load Balancer
       /api/*  -> Cloud Run: inkwise-api (FastAPI)
       /*      -> Cloud Run: inkwise-web (Next.js)
  -> Cloud SQL (Postgres)
  -> Cloud Storage (GCS)
  -> Cloud Tasks -> Cloud Run Jobs:
       - ingest (convert + extract/OCR + treegen)
       - export (optional async)
  -> Vertex AI Gemini:
       - grounded chat output
       - writing tools
       - optional LLM-assisted tree search / rerank
```

Key design choice:

- **Same-origin** web + API (path routing) for simpler cookies and more reliable SSE.

### Recommended Code Organization (V2 Monorepo)

Keep provider and RAG logic isolated so swapping retrieval strategies or Gemini models doesn't leak into route handlers.

Example (aligned with `INKWISE_V2_DOCS.md` suggested layout):

```
apps/api/
  src/
    routes/
      chat.py                 # stream endpoint
      sources.py              # bind/ingest/preview
    rag/
      retrieval.py            # orchestrates retrieval steps
      evidence.py             # snippet extraction + budgeting
      prompts/
        grounded_answer_v1.txt
        tree_search_v1.txt
    providers/
      gemini.py               # Vertex AI client wrapper
    db/
      models.py               # sources, pages, nodes, chat, ledger

jobs/ingest/
  main.py                     # Cloud Run Job entrypoint
  treegen/
    pageindex_oss.py           # wrapper around vendored PageIndex treegen
  extract/
    pdf_text.py                # PyMuPDF/pdfium extraction
    ocr_documentai.py          # Document AI OCR integration (optional)
```

Versioning:

- Keep `rag.strategy_version` and `source_ingestions.treegen_version` in sync with code/prompt changes.

---

## Data Model Additions (RAG Without PageIndex API)

Inkwise V2 still centers on `documents`, `sources`, `source_ingestions`, and `document_source_bindings` as described in `INKWISE_V2_DOCS.md`.

To support in-house retrieval we add page- and node-level persistence.

### Extending `source_ingestions`

In `INKWISE_V2_DOCS.md`, `source_ingestions` is the immutable "attempt record." For this architecture, add a few fields to make ingestion reproducible and debuggable:

- `pipeline` text: recommend `treegen|fallback` (instead of `pageindex|fallback`)
- `treegen_engine` text: `pageindex_oss` (future-proof; could add `custom`)
- `treegen_version` text: semantic version or git SHA of the vendored treegen code
- `canonical_pdf_gcs_object` text null: points to the PDF used for extraction/treegen
- `tree_json_gcs_object` text null: raw tree JSON in GCS (preferred over storing large JSON in Postgres)
- `extraction_engine` text: `pymupdf|pdfium|documentai|tesseract|gemini_vision`
- `page_count` int null
- `doc_description` text null
- `error_code` text null (machine category)
- `error_detail` text null (user-safe)

Selecting the "active" ingestion for retrieval:

- Allow multiple `source_ingestions` per `source_id` (reruns, new versions).
- Retrieval should use the most recent `status='completed'` ingestion for each source.
- For speed and clarity, it's reasonable to also store `sources.active_ingestion_id` (nullable) and update it on successful completion.

### New Tables (Suggested)

`source_pages` (page-level extracted text/markdown):

- `id` uuid pk
- `source_id` uuid fk
- `page_number` int not null (1-based)
- `text` text not null (plain text or markdown; pick one and be consistent)
- `text_tsv` tsvector (generated column or maintained in code)
- `is_ocr` boolean not null default false
- `char_count` int not null
- `created_at` timestamptz
- Unique: `(source_id, page_number)`
- Indexes:
  - `GIN(text_tsv)` for full-text search
  - `(source_id, page_number)` btree

`source_tree_nodes` (tree nodes produced by PageIndex OSS tree generation):

- `id` uuid pk
- `source_id` uuid fk
- `node_id` text not null (stable ID from treegen, e.g. `"0006"`)
- `parent_node_id` text null
- `depth` int not null
- `title` text not null
- `page_start` int not null (1-based)
- `page_end` int not null (inclusive; computed after treegen)
- `node_summary` text null (if treegen provides it; otherwise generate later)
- `path_titles` text[] not null (materialized: `["Section", "Subsection", ...]`)
- `node_text_tsv` tsvector (title + summary; optional)
- `created_at` timestamptz
- Unique: `(source_id, node_id)`
- Indexes:
  - `GIN(node_text_tsv)`
  - `(source_id, page_start)` for range lookups

`retrieval_runs` (debuggable/auditable retrieval record; optional but strongly recommended):

- `id` uuid pk
- `user_id` uuid fk
- `document_id` uuid fk
- `thread_id` uuid fk null
- `query` text not null
- `bound_source_ids` uuid[] not null
- `strategy_version` text not null (e.g. `"fts+tree+llm-v1"`)
- `meta` jsonb not null (scores, selected nodes, timing)
- `created_at` timestamptz

`retrieval_evidence` (what we actually gave the model):

- `id` uuid pk
- `retrieval_run_id` uuid fk
- `evidence_id` text not null (short stable label like `"E03"`)
- `source_id` uuid fk
- `page_number` int not null
- `node_id` text null
- `node_title` text null
- `excerpt` text not null
- `score` numeric null
- Unique: `(retrieval_run_id, evidence_id)`

Why evidence IDs matter:

- We can force Gemini to cite only evidence we provided (prevents "hallucinated citations").

---

## Ingestion Pipeline (Convert -> Extract/OCR -> Tree Generation)

V2 ingestion uses Cloud Tasks + Cloud Run Jobs (as in `INKWISE_V2_DOCS.md`). The RAG-specific changes are:

- We generate and store:
  - `source_pages` (page texts)
  - `source_tree_nodes` (tree)
- We do **not** obtain a PageIndex `doc_id` from an external service.

### 1) Upload + Source Creation

- Upload bytes to GCS (direct-to-GCS recommended).
- Create `sources` row (`status='queued'`).
- Create `source_ingestions` row (`pipeline='treegen'`, `status='queued'`, `treegen_engine='pageindex_oss'`).
- Enqueue Cloud Task to start ingestion job.

### 2) Conversion to PDF (If Needed)

Tree generation is PDF-first (per PageIndex docs: `pageindex/sdk/tree_generation.md`).

If source is not already PDF:

- Convert Office docs to PDF (LibreOffice in a dedicated job image).
- Convert websites to PDF (Playwright/Chromium print-to-PDF) with a consistent print CSS.
- Convert images to PDF (wrap in a single-page PDF) or build a multi-image PDF for sets.

Store derived PDF in GCS:

- `derived/{user_id}/{source_id}/pdf/converted.pdf`

Update `sources` to reference the derived PDF as the "retrieval canonical." 

### 3) Text Extraction / OCR to Populate `source_pages`

We need page-level text to quote/cite.

Recommended extraction strategy:

1) Try "born-digital" PDF text extraction (fast, cheap):
   - `pymupdf` or `pdfium` to extract text per page.
2) If a page has insufficient extracted text (heuristic: low char count, high image density, or extraction fails), OCR it.

OCR options on GCP (pick one; keep the interface stable):

- Option A (managed, highest quality): Google Document AI (OCR processor).
- Option B (self-contained): Tesseract via `ocrmypdf`/Tesseract.
- Option C (LLM vision OCR): Gemini on page images (most flexible, likely most expensive).

Store per-page `text` and set `is_ocr` appropriately. Keep raw OCR artifacts out of the DB unless needed for debugging; if stored, cap size and store in GCS.

Normalization rule:

- Use one canonical representation for retrieval and citations (recommend: plain text). If you also want markdown for preview, store it separately or derive it on demand.

### 4) Tree Generation (PageIndex Open-Source)

We run PageIndex's open-source tree generation locally (no SaaS calls).

Treegen configuration:

- Expect the OSS treegen to require an LLM call. Standardize on Gemini for this (same provider as output), but isolate it behind a `TreeGenClient` interface so we can swap models without rewriting ingestion.
- Version prompts and treegen parameters; store the version in `source_ingestions.treegen_version` so retrieval/debugging can compare outputs across versions.

Conceptual interface (we will wrap whatever the OSS library exposes):

```python
tree = pageindex_treegen.generate_tree(
  pdf_path="/tmp/canonical.pdf",
  node_summary=True,
  # plus any model/provider configuration required by the OSS project
)
```

Expected output shape (per `pageindex/sdk/tree_generation.md`):

- A nested list of nodes with fields like:
  - `title`
  - `node_id`
  - `page_index` (start page)
  - optional `text` (node summary)
  - optional `nodes` (children)

We then:

- Normalize the nested tree into rows in `source_tree_nodes`.
- Compute `page_end` for each node by looking at the next node's `page_start` in reading order.
  - Materialize `path_titles` and `depth`.
- Optionally store the raw tree JSON:
  - in `source_ingestions.raw_result_json` (size-capped) OR
  - in GCS (recommended for large trees) with only a pointer stored in `source_ingestions`.

Computing `page_end` (deterministic rule):

- Flatten nodes in pre-order (document reading order).
- For each node `i` with `page_start[i]`:
  - Let `next_start` be the next node's `page_start` in the flattened list.
  - Set `page_end[i] = min(max(page_start[i], next_start - 1), page_count)`.
  - For the last node, set `page_end = page_count`.
- If a child node has a `page_start` equal to its parent, keep both; the child will naturally shorten the parent's range once flattened.
- If any node has an invalid/missing page index, fail ingestion with a clear `error_code` and store the raw tree JSON for debugging.

Pseudo-code sketch:

```python
flat = flatten_preorder(tree)
for idx, node in enumerate(flat):
  start = node.page_start
  next_start = flat[idx + 1].page_start if idx + 1 < len(flat) else (page_count + 1)
  node.page_end = max(start, min(page_count, next_start - 1))
```

### 5) Post-Ingestion Derived Fields

Doc description (for future multi-doc selection) from `pageindex/tutorials/doc-search/description.md`:

- Use Gemini to generate a one-sentence `doc_description` from the tree (titles + summaries).
- Store in `source_ingestions.doc_description`.

---

## Retrieval (In-House, Vectorless)

Retrieval must answer:

1) Which bound sources are relevant?
2) Which parts of each source should be used as evidence?
3) What excerpts (with page citations) should be shown to Gemini?

We implement retrieval as a hybrid of:

- Fast **lexical** search (Postgres full-text search) over:
  - node titles/summaries (`source_tree_nodes`)
  - page texts (`source_pages`)
- Optional **LLM-assisted tree search** (Gemini) using the prompt pattern in `pageindex/tutorials/tree-search/README.md`.

### Postgres Full-Text Search (Concrete Implementation)

Use Postgres FTS (English config by default; consider per-document language later).

Example DDL sketch (illustrative):

```sql
-- Page text index
ALTER TABLE source_pages
  ADD COLUMN text_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;

CREATE INDEX source_pages_text_tsv_gin
  ON source_pages USING GIN (text_tsv);

-- Node text index (title + summary)
ALTER TABLE source_tree_nodes
  ADD COLUMN node_text_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(node_summary, ''))
  ) STORED;

CREATE INDEX source_tree_nodes_text_tsv_gin
  ON source_tree_nodes USING GIN (node_text_tsv);
```

Example query patterns:

```sql
-- Top nodes for a source
SELECT node_id, title, page_start, page_end,
       ts_rank(node_text_tsv, websearch_to_tsquery('english', :q)) AS score
FROM source_tree_nodes
WHERE source_id = :source_id
  AND node_text_tsv @@ websearch_to_tsquery('english', :q)
ORDER BY score DESC
LIMIT 15;

-- Top pages within a node range
SELECT page_number,
       ts_rank(text_tsv, websearch_to_tsquery('english', :q)) AS score,
       ts_headline('english', text, websearch_to_tsquery('english', :q),
                   'MaxWords=60, MinWords=15, ShortWord=3, HighlightAll=FALSE') AS excerpt
FROM source_pages
WHERE source_id = :source_id
  AND page_number BETWEEN :page_start AND :page_end
  AND text_tsv @@ websearch_to_tsquery('english', :q)
ORDER BY score DESC
LIMIT 5;
```

### Retrieval Input/Output Contract

Input:

- `document_id`
- `query`
- `bound_source_ids` (default: active bindings)
- Optional: `source_ids` override (advanced UI)
- Constraints:
  - max sources
  - max nodes per source
  - max excerpts total
  - max characters/tokens context budget

Output:

- `retrieval_run_id`
- `evidence[]`: list of excerpts with stable `evidence_id`, each carrying:
  - `source_id`, `source_title`
  - `page_number`
  - optional `node_id`, `node_title`, `path_titles`
  - `excerpt` (verbatim)
   - `score`

Persistence rule:

- `retrieval_evidence.excerpt` is the exact text shown in "Explain citation" and is what Gemini is expected to ground on.
- `chat_messages.citations_json` should reference the `evidence_id`s, and can also inline the resolved `(source_id, page_number, node_id, excerpt)` for denormalized reads.

### Step 1: Source Prefilter (Optional)

Default for grounded chat is "use all bound sources." If a document has many bound sources (e.g., > 10), prefilter:

1) If `doc_description` exists for each source, use a cheap LLM selection step:

   - Prompt Gemini with `(source_id, title, doc_description)` and ask for a shortlist.
2) Otherwise, run FTS on `source_tree_nodes.node_text_tsv` across all bound sources and keep the top sources by aggregate node score.

This keeps downstream context small and stable.

### Step 2: Candidate Node Selection (Per Source)

Two complementary paths; we can run both and union results.

Lexical node scoring:

- Query `source_tree_nodes` for a given `source_id` using FTS on `title + node_summary`.
- Keep top `N_nodes` (e.g., 15).
- Add ancestors for each node (to keep context coherent).

Optional Gemini tree search:

- Provide a compressed tree representation:
  - node_id, title, page_start, depth, path_titles
  - (optionally) one-line node_summary
- Ask Gemini to return JSON with `node_list`.

Prompt skeleton (adapted from `pageindex/tutorials/tree-search/README.md`):

```text
You are given a user query and a document tree.
Select node_ids that are most likely to contain the answer.

Query: {query}

Tree (JSON): {compressed_tree_json}

Return only JSON:
{
  "thinking": "...",
  "node_list": ["0006", "0012"]
}
```

### Step 3: Page-Level Evidence Extraction

For each selected node, determine page ranges and extract snippets:

- Pages to consider: `[page_start..page_end]` capped (e.g., max 8 pages per node).
- Run FTS within `source_pages` restricted to those pages.
- Choose top `k` pages and generate excerpts:
  - For FTS: use `ts_headline` (server-side) or implement a deterministic snippet extractor.
  - Keep excerpts short (e.g., 400-900 chars) to manage model context.

We store the final excerpts as `retrieval_evidence` with `evidence_id` like `E01`, `E02`, ...

### Step 4: Evidence Packing (Context Budgeting)

We build a context pack for Gemini:

- Sort evidence by (source priority, score).
- Enforce hard caps:
  - total evidence items (e.g., 12)
  - total characters (e.g., 12k-20k) or token estimate
- Include minimal but sufficient provenance headers.

Example evidence block:

```text
[E03] source_id=... title="Lease Agreement" page=12 node_id=0008 node_title="Termination"
"...verbatim excerpt..."
```

---

## Gemini Output (Grounded Chat)

We use Gemini for the final answer, grounded on the evidence pack.

### Model Choice

Use Vertex AI Gemini models appropriate for:

- Fast streaming: a "flash" model for interactive chat.
- Higher accuracy: a "pro" model for longer, citation-heavy answers.

The code should support switching by configuration and per-plan policy.

### Grounded Answer Prompting

Hard requirement:

- The model must only rely on the provided evidence.
- The model must cite evidence IDs, not invent citations.

Recommended approach: force JSON output (then render to UI).

Prompt skeleton:

```text
You are Inkwise, a writing assistant.

Answer the user using ONLY the evidence blocks provided.
If the evidence is insufficient, say what is missing and ask a clarifying question.

Citation rules:
- Whenever you state a factual claim grounded in the document, attach citations as evidence IDs.
- Only cite from: {evidence_ids}
- Never cite an ID that is not in the evidence.

Return ONLY valid JSON:
{
  "answer_markdown": "...",
  "citations": [
    {"evidence_id": "E03"},
    {"evidence_id": "E07"}
  ]
}

User question: {query}

Evidence:
{evidence_blocks}
```

We then map `evidence_id` to `(source_id, page_number, node)` and persist structured citations in `chat_messages.citations_json`.

### Citation UX (Frontend)

Because citations refer to evidence IDs (not inline PageIndex `<doc=...;page=...>` tags), the frontend behavior should be:

- Render citations as `(source title, page)` derived from the server-provided `citations_json`.
- Clicking a citation opens the source preview (PDF viewer) and navigates to `page_number`.
- "Explain citation" shows the exact stored `retrieval_evidence.excerpt` (the user sees the same text the model saw).

### Streaming (SSE)

Even if Gemini's streaming uses provider-specific chunk formats, the API serves a stable SSE envelope.

Proposed events:

- `event: token` incremental text (for UI rendering)
- `event: meta` periodic updates (optional: retrieval status, selected sources)
- `event: done` final payload including:
  - `message_id`
  - `citations_json`
  - `retrieval_run_id`

Example:

```
event: token
data: {"text":"Drafting answer..."}

event: done
data: {"message_id":"...","retrieval_run_id":"...","citations":[...]} 
```

Disconnect handling:

- On client disconnect, cancel the Gemini request and stop streaming.
- Persist the assistant message only on successful completion (default). Optionally persist partials as `status='partial'` if product needs it.

---

## API Surface (V2)

Keep the `/api/v2` surface described in `INKWISE_V2_DOCS.md` with two key changes:

1) "Grounded chat" no longer proxies PageIndex Chat. It calls our retrieval + Gemini.
2) Ingestion no longer stores `pageindex_doc_id`; it stores `treegen_version`, and persists pages/tree.

### Key Endpoints (Illustrative)

Sources:

- `POST /api/v2/sources/upload:init`
- `POST /api/v2/sources/{source_id}/upload:complete`
- `POST /api/v2/sources/{source_id}/ingest` (enqueue)
- `GET /api/v2/source-ingestions/{ingestion_id}` (status)

Bindings:

- `GET /api/v2/documents/{document_id}/sources`
- `POST /api/v2/documents/{document_id}/sources:bind`
- `POST /api/v2/documents/{document_id}/sources:unbind`

Grounded chat (Gemini + in-house retrieval):

- `POST /api/v2/chat/threads/{thread_id}/messages:stream`
  - Server flow:
    1) load bound sources
    2) run retrieval (write `retrieval_runs`, `retrieval_evidence`)
    3) call Gemini with evidence pack
    4) stream SSE + persist final `chat_messages`

Writing tools (Gemini, ungrounded):

- `POST /api/v2/writing-tools:stream`

---

## Background Jobs (GCP-Native)

We continue the Cloud Tasks + Cloud Run Jobs pattern from `INKWISE_V2_DOCS.md`.

### Ingestion Job Responsibilities

- Input: `source_ingestion_id`
- Steps:
  - validate source exists and is ingestible
  - (optional) convert to PDF
  - extract per-page text and persist `source_pages`
  - run PageIndex OSS tree generation and persist `source_tree_nodes`
  - update `source_ingestions.status` and `sources.status`

Idempotency:

- If the job is retried, it should:
  - reuse existing derived PDF if present and checksum matches
  - upsert `source_pages` by `(source_id, page_number)`
  - replace `source_tree_nodes` for the source in a transaction (delete-then-insert) keyed by `source_ingestions.id`

---

## Observability and Auditability

Carry forward V2 requirements:

- Structured JSON logs with correlation IDs.
- OpenTelemetry traces spanning:
  - API request -> retrieval -> Gemini call
  - ingestion job -> conversion -> extraction/OCR -> treegen

RAG-specific observability:

- Persist `retrieval_runs.meta` with:
  - per-step timing (prefilter, node selection, snippet extraction)
  - counts (sources considered, nodes chosen, evidence items)
  - truncation decisions (what got dropped due to budgets)
- Persist provider usage:
  - Gemini model name
  - token usage and latency (when available)
- Add "citation validity" checks:
  - every `evidence_id` cited must exist in `retrieval_evidence`

---

## Quotas and Cost Controls

Use the `quota_ledger` approach from `INKWISE_V2_DOCS.md` / `INKWISE_V2_IMPROVEMENTS.md`.

Key billable events for this architecture:

- `source_ingest` (units: pages processed; includes OCR + treegen)
- `grounded_chat` (units: messages and/or tokens)
- `writing_tool` (units: tokens)

Hard guardrails:

- Max pages per source for ingestion (plan-tiered)
- Max bound sources per document (default cap)
- Max evidence items and max context size
- Max stream duration

---

## Security and Privacy

Carry forward the non-negotiables from `INKWISE_V2_DOCS.md`:

- All secrets in Secret Manager.
- No TLS verification bypass.
- Cookie-auth done securely (HttpOnly + Secure) with CSRF protections.

RAG-specific privacy notes:

- Source content is user data. Avoid storing redundant raw artifacts unless needed.
- If using Document AI OCR, treat it as a data processor; document retention and access.
- If using Gemini for tree search/rerank, only send minimal tree metadata unless full text is necessary.

---

## Migration From the PageIndex-API Plan

What changes vs the baseline V2 plan (`INKWISE_V2_DOCS.md`):

- Remove `pageindex_doc_id` from `source_ingestions` (or keep nullable for historical experiments).
- Replace "PageIndex Chat proxy" with "Retrieval + Gemini".
- Add `source_pages` and `source_tree_nodes` persistence.
- Update UI citations parsing:
  - citations are derived from `evidence_id` -> `(source, page)` mapping, not PageIndex inline `<doc=...;page=...>`.

Incremental rollout strategy:

- Phase 1: run ingestion + retrieval for newly uploaded sources.
- Phase 2: backfill existing migrated sources (generate pages/tree in background).
- Phase 3: enable grounded chat once a document has at least one "ready" bound source.

---

## Recommended Implementation Order

1) Implement ingestion job output tables: `source_pages`, `source_tree_nodes`.
2) Implement basic lexical retrieval (FTS) + excerpt extraction.
3) Implement grounded chat endpoint (SSE) using retrieval + Gemini with evidence-id citations.
4) Add optional Gemini tree search (node selection) when lexical retrieval underperforms.
5) Add doc descriptions and (optional) multi-source prefilter.
6) Add evaluation hooks and admin "rerun ingestion" tooling.
