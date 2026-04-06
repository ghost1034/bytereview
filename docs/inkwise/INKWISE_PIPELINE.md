# Inkwise Pipeline

This document describes the current Inkwise retrieval-augmented generation (RAG) implementation in the codebase today. It reflects the live runtime in `backend/inkwise`, not the older PageIndex design documents.

## Scope

Inkwise currently provides a grounded reference pipeline for:

- source upload and capture
- source ingestion and embedding
- document-to-source binding
- retrieval runs and evidence persistence
- grounded chat
- grounded inline writing tools
- grounded predictive writing
- citation bubbles and evidence preview

The current implementation is vector-first, uses Gemini Embedding 2 through Vertex AI, stores embeddings in PostgreSQL with `pgvector`, and uses Google Cloud Storage for source and derived assets.

## Current Runtime At A Glance

- Backend mount: `/api/inkwise`
- Main router: `backend/inkwise/router.py`
- Primary frontend surfaces:
  - `app/dashboard/inkwise/references/page.tsx`
  - `app/dashboard/inkwise/write/[id]/page.tsx`
  - `components/inkwise/inline-writing-tools.tsx`
  - `components/inkwise/citation-bubbles.tsx`
- Core backend services:
  - ingestion: `backend/inkwise/services/ingestion_service.py`
  - segmentation: `backend/inkwise/services/segmentation_service.py`
  - embeddings: `backend/inkwise/services/embeddings.py`
  - retrieval: `backend/inkwise/services/vector_retrieval_service.py`
  - retrieval persistence: `backend/inkwise/services/retrieval_service.py`
  - chat prompting: `backend/inkwise/services/chat_service.py`
  - writing/prediction prompting: `backend/inkwise/services/writing_tools_service.py`

## End-To-End Flow

```mermaid
flowchart LR
  A[Upload PDF or DOCX\nCapture webpage] --> B[Create InkwiseSource]
  B --> C[Queue ingestion]
  C --> D[Normalize source]
  D --> E[Build retrieval segments]
  E --> F[Generate Gemini Embeddings]
  F --> G[Store segments + vectors in Postgres]
  G --> H[Bind ready sources to document]
  H --> I[Run retrieval]
  I --> J[Build evidence pack]
  J --> K[Chat / Writing Tool / Prediction]
  K --> L[Citations + preview UX]
```

## 1. Source Intake

### Supported source types

The runtime currently accepts:

- PDF upload
- DOCX upload
- webpage snapshot capture

These flows are exposed in `backend/inkwise/routes/sources.py` and surfaced in `app/dashboard/inkwise/references/page.tsx`.

### Upload flow

For file uploads, the client:

1. calls `POST /api/inkwise/sources/upload:init`
2. uploads bytes directly to GCS using the signed `PUT` URL
3. calls `POST /api/inkwise/sources/{source_id}/upload:complete`
4. calls `POST /api/inkwise/sources/{source_id}/ingest`

The source record lives in `inkwise_sources` and tracks storage location, content type, status, checksum, and failures.

### Webpage capture flow

For webpages, the backend:

- fetches the URL with `requests`
- stores the fetched HTML snapshot in GCS
- creates an `InkwiseSource` with `type="webpage"`
- queues the same ingestion pipeline used by uploaded files

Important detail: retrieval runs on the captured snapshot, not on the live URL.

## 2. Ingestion Pipeline

The ingestion pipeline is implemented in `backend/inkwise/services/ingestion_service.py`.

### Queueing and execution

- `POST /api/inkwise/sources/{source_id}/ingest` creates an `InkwiseSourceIngestion` row with `pipeline="normalize_embed"`
- Inkwise then tries to enqueue a Cloud Task through `backend/inkwise/services/task_service.py`
- the task target is `POST /api/inkwise/internal/tasks/source-ingestion`
- if Cloud Tasks is not configured and inline fallback is enabled, ingestion runs inline in the API process

### Source validation

Before processing, ingestion checks:

- source exists and is not deleted
- content type is supported
- source storage bucket/object exists
- Vertex AI is configured
- embedding dimension is exactly `1536`

That last constraint is important: the schema currently hardcodes `vector(1536)` for stored embeddings.

### Normalization

Normalization is implemented in `backend/inkwise/services/source_normalizer.py`.

Current behavior by source type:

- `pdf`
  - canonical asset is the original PDF
  - text is extracted page by page with PyMuPDF helpers in `backend/inkwise/services/pdf_extract.py`
- `docx`
  - DOCX is converted to PDF through the shared document conversion service
  - the ingestion runtime must have LibreOffice (`soffice`) installed because Inkwise calls the shared converter directly
  - text is then extracted from the generated PDF
  - retrieval treats the converted PDF as the canonical asset
- `webpage`
  - canonical asset is the stored HTML snapshot
  - paragraph-like text blocks are extracted with simple HTML cleaning and splitting heuristics

Normalization output is a `NormalizedSource` with:

- canonical local path
- canonical MIME type
- text blocks
- asset metadata
- page count and normalization metadata

### Derived asset persistence

Ingestion persists a canonical/derived asset set in GCS:

- original uploads stay under `inkwise/uploads/...`
- derived segment assets and manifests are stored under `inkwise/derived/{user_id}/{source_id}/...`

For PDF-backed segments, ingestion writes page-window PDFs that can later be attached to Gemini generation calls and previewed in the UI.

## 3. Segmentation

Segmentation is implemented in `backend/inkwise/services/segmentation_service.py`.

### Segment families

Current segment types are:

- `pdf_window`
  - modality: `pdf`
  - overlapping page windows over canonical PDFs
  - intended for multimodal semantic recall
- `text_chunk`
  - modality: `text`
  - paragraph-grouped text chunks from PDF/DOCX extracted text
  - intended for precise evidence excerpts and lexical search
- `web_block`
  - modality: `web`
  - grouped blocks from a captured webpage snapshot

### Segmentation settings

Configured in `backend/inkwise/settings.py`:

- `INKWISE_SEGMENT_PDF_WINDOW_PAGES` default `4`
- `INKWISE_SEGMENT_PDF_WINDOW_OVERLAP_PAGES` default `1`
- `INKWISE_SEGMENT_TEXT_CHUNK_CHARS` default `3000`

### Stored segment metadata

Each `InkwiseSourceSegment` stores:

- `segment_type`, `modality`, and `order_index`
- `text_content`, `char_count`, and estimated `token_count`
- page range or time range fields
- `locator_json`
- `asset_bucket` / `asset_object`
- `preview_bucket` / `preview_object`
- `meta_json`

`locator_json` is important because it becomes the stable locator passed through retrieval, citations, and preview UX.

## 4. Embeddings

Embeddings are handled by `backend/inkwise/services/embeddings.py`.

### Model and transport

- model: `gemini-embedding-2-preview`
- transport: direct Vertex AI REST call to `:embedContent`
- default location: `us-central1`
- production dimension in this repo: `1536`

### Query vs document embeddings

The service uses separate task types from settings:

- query task type default: `RETRIEVAL_QUERY`
- document task type default: `RETRIEVAL_DOCUMENT`

### What gets embedded

- `pdf_window` segments are embedded as PDF files from GCS using `embed_pdf_gcs_sync`
- `text_chunk` and `web_block` segments are embedded from `text_content`
- user retrieval queries are embedded from query text

### Persistence

Embeddings are stored in `inkwise_source_segment_embeddings` with:

- segment ID
- source ID
- user ID
- model name
- embedding dimension
- task instruction
- `is_active`
- vector payload in `embedding`

The schema migration in `backend/alembic/versions/011_inkwise_vector_rag_phase1.py` adds the `pgvector` extension and an HNSW cosine index.

## 5. Readiness And Binding

Before a source can participate in grounded generation, it must be bound to a document and be retrieval-ready.

### Binding

Bindings are managed through:

- `GET /api/inkwise/documents/{document_id}/sources`
- `POST /api/inkwise/documents/{document_id}/sources:bind`
- `POST /api/inkwise/documents/{document_id}/sources:unbind`

The join table is `inkwise_document_source_bindings`.

### Ready-state check

`backend/inkwise/services/document_sources.py` considers a bound source ready only if the latest ingestion:

- exists
- has `status="completed"`
- has at least one segment
- has at least one active embedding for that ingestion

Frontend surfaces use this status to decide which sources can be selected for grounding.

## 6. Retrieval Pipeline

The retrieval stack is split between:

- orchestration/persistence: `backend/inkwise/services/retrieval_service.py`
- search and ranking: `backend/inkwise/services/vector_retrieval_service.py`

### Retrieval run lifecycle

Every retrieval call creates an `InkwiseRetrievalRun` row up front with:

- document ID
- optional thread ID
- original query
- bound source IDs
- strategy version
- metadata blob

Evidence is then persisted to `inkwise_retrieval_evidence`.

### Query rewrite

If enabled, retrieval first calls `backend/inkwise/services/query_rewrite.py`.

The rewrite step can produce:

- a standalone question
- an FTS-oriented query
- multiple short subqueries
- keyword fallbacks

Current behavior:

- rewrite is optional and model-backed
- it uses recent chat history, source titles, document language/purpose, and draft context
- retrieval stops at the first rewritten attempt that returns any candidates

### Vector search

Vector search:

- embeds the query with Gemini Embedding 2
- searches `inkwise_source_segment_embeddings`
- joins back to `inkwise_source_segments` and `inkwise_sources`
- uses cosine distance through `pgvector`
- is scoped to the selected bound source IDs

### Lexical fusion

If enabled, retrieval also runs PostgreSQL full-text search over `inkwise_source_segments.text_tsv` using:

- `websearch_to_tsquery('english', :query)`
- `ts_rank`
- `ts_headline` for excerpts

This is English FTS only.

### Rank fusion

Vector and lexical candidates are merged with reciprocal rank fusion (RRF).

Each candidate carries:

- vector score and rank
- lexical score and rank
- fused score
- source/segment/locator/preview metadata
- an excerpt

### LLM rerank

If enabled, the top fused candidates are reranked by a Gemini text generation call.

The reranker prompt asks the model to select the most useful evidence IDs for the query, preferring direct evidence over broad context.

### Evidence shaping

Final output is converted to `EvidenceItem` objects with stable `E01`, `E02`, ... IDs. Each evidence item includes:

- source title
- page number
- segment ID and segment title
- excerpt
- locator JSON
- preview bucket/object
- score

`build_evidence_pack()` then renders those items into the text block consumed by grounded prompts.

## 7. Grounded Generation Consumers

The same retrieval substrate feeds three different generation flows.

### Grounded chat

Main route: `POST /api/inkwise/chat/threads/{thread_id}/messages:stream`

Implementation path:

1. validate the thread and document
2. resolve ready bound sources, optionally narrowed by `source_ids`
3. store the user message
4. gather recent history for query rewrite and prompt continuity
5. run retrieval or reuse an old retrieval run on retry
6. build the evidence pack
7. build the grounded chat prompt
8. optionally attach up to 3 PDF evidence files as multimodal Gemini inputs
9. stream the assistant response over SSE
10. extract citations from `[E##]` markers and persist the assistant message

Prompt construction lives in `backend/inkwise/services/chat_service.py`.

Important chat guardrails:

- answer using only provided evidence blocks
- if evidence is insufficient, say what is missing
- cite only allowed evidence IDs
- do not cite draft context or thread history
- strip stale evidence markers from historical assistant turns before reuse

Retries are supported through `POST /api/inkwise/chat/threads/{thread_id}/messages/{message_id}:retry` with either reused or fresh retrieval.

### Grounded writing tools

Main route: `POST /api/inkwise/writing-tools:stream`

Behavior:

- if a document and ready sources are present, the tool runs retrieval using the instruction, selection text, and surrounding text
- if evidence is found, it switches to a grounded prompt
- if retrieval fails or returns nothing, it falls back to an ungrounded writing prompt
- output is streamed over SSE
- evidence metadata is still returned to the client when grounding succeeds

Unlike chat, writing tool output is instructed to return only the requested text with no citation markers.

Retries are supported through `POST /api/inkwise/writing-tools/{attempt_id}:retry`.

### Grounded prediction

Main route: `POST /api/inkwise/documents/{document_id}/predictions`

Behavior:

- predictions always start from a short autocomplete prompt
- if ready bound sources exist, Inkwise runs retrieval with current block text plus nearby draft context
- if evidence is found, the prediction prompt becomes grounded
- up to 3 PDF evidence files may be attached multimodally
- the raw result is normalized down to a short insertion string

Prediction responses return:

- suggestion text
- grounded boolean
- retrieval run ID
- attempt ID
- evidence payload

## 8. Multimodal Evidence Attachment

`backend/inkwise/services/multimodal_evidence.py` adds PDF evidence files directly to Gemini generation calls.

Current behavior:

- only PDF preview assets are attached
- at most 100 files are attached
- duplicate assets are skipped
- the prompt is augmented with the evidence IDs corresponding to attached files

This means the current pipeline is not purely text-in/text-out. For PDF-backed evidence, generation can inspect the actual page-window PDF assets.

## 9. Citations And Evidence UX

### Citation extraction

Chat citations are extracted after generation by scanning for `[E##]` markers. The extracted citation payload stores:

- evidence ID
- source and segment identifiers
- page/locator metadata
- preview asset references
- excerpt

### Preview UX

The evidence viewer in `components/inkwise/citation-bubbles.tsx`:

- fetches a signed preview URL for the cited asset
- falls back to the source preview when no segment preview exists
- displays the excerpt and locator information
- renders the preview in an iframe when available

For PDF-backed evidence, this usually points to a derived page-window PDF stored in GCS.

## 10. Persistence Model

The main runtime tables are defined in `backend/models/inkwise_models.py`.

### Core source-side tables

- `inkwise_sources`
- `inkwise_source_ingestions`
- `inkwise_source_segments`
- `inkwise_source_segment_embeddings`
- `inkwise_document_source_bindings`

### Retrieval and generation tables

- `inkwise_retrieval_runs`
- `inkwise_retrieval_evidence`
- `inkwise_chat_threads`
- `inkwise_chat_messages`
- `inkwise_generation_attempts`

### Document workflow tables

- `inkwise_documents`
- `inkwise_document_revisions`

`inkwise_generation_attempts` is especially important for productionization because it records chat/tool/prediction attempts, retries, linked retrieval runs, and completion/failure status.

## 11. Configuration Surface

Runtime settings live in `backend/inkwise/settings.py`.

The most important knobs are:

- embedding model, region, and dimension
- vector top-k, lexical top-k, and rerank top-k
- lexical fusion on/off
- LLM rerank on/off
- query rewrite on/off
- grounded chat history budgets
- segmentation sizes
- upload size limits
- Cloud Tasks queue settings
- inline ingestion fallback

## 12. What Has Replaced PageIndex

The current runtime is no longer PageIndex-based.

Evidence from the codebase:

- retrieval now operates on `inkwise_source_segments` and `inkwise_source_segment_embeddings`
- migration `011_inkwise_vector_rag_phase1` adds vector schema and HNSW indexing
- migration `012_remove_pageindex_runtime_schema` removes old PageIndex runtime tables and columns
- current chat and writing routes depend on retrieval runs and evidence rows, not tree nodes

Conceptually, the live pipeline is:

`normalize -> segment -> embed -> vector retrieve -> lexical fuse -> rerank -> evidence pack -> generation`

## 13. Current Constraints And Notable Gaps

These are current implementation facts, not necessarily bugs:

- runtime ingestion supports PDF, DOCX, and webpage snapshots only
- stored vector schema requires `1536` dimensions today
- lexical search uses English `tsvector`/`tsquery`
- webpage normalization is heuristic HTML cleanup, not a browser-rendered readability pipeline
- PDF multimodal attachment is implemented; image/audio/video retrieval is not yet wired into the runtime
- chat requires explicit citation markers in model output; writing tools and prediction do not return citation markers
- retrieval currently stops after the first query-rewrite attempt that yields any candidate set
- there is very little automated test coverage today; only chat-history prompt handling has targeted backend tests in `backend/tests/test_inkwise_chat_history.py`

## 14. Key Files To Read First

- `backend/inkwise/services/ingestion_service.py`
- `backend/inkwise/services/source_normalizer.py`
- `backend/inkwise/services/segmentation_service.py`
- `backend/inkwise/services/embeddings.py`
- `backend/inkwise/services/vector_retrieval_service.py`
- `backend/inkwise/services/retrieval_service.py`
- `backend/inkwise/services/chat_service.py`
- `backend/inkwise/routes/chat.py`
- `backend/inkwise/services/writing_tools_service.py`
- `backend/inkwise/routes/writing_tools.py`
- `backend/models/inkwise_models.py`
- `app/dashboard/inkwise/write/[id]/page.tsx`
- `app/dashboard/inkwise/references/page.tsx`

## 15. Short Call Graphs

### Source ingestion

`references page -> sources route -> source service -> ingest route -> Cloud Task/internal task -> ingestion service -> source normalizer -> segmentation service -> embedding service -> Postgres + GCS`

### Grounded chat

`write page -> chat route -> document source readiness -> retrieval service -> vector retrieval service -> evidence pack -> grounded chat prompt -> Gemini -> citation extraction -> chat message persistence`

### Grounded prediction

`editor cursor context -> prediction route -> retrieval service -> evidence pack -> grounded prediction prompt -> Gemini -> normalized insertion text`
