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
- renders the fetched page into a PDF snapshot and stores that PDF in GCS
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
  - text is extracted page by page with PyMuPDF helpers in `backend/inkwise/services/pdf_extract.py`
  - if the extracted text looks sparse or unusable, ingestion runs `OCRmyPDF` with Tesseract and re-extracts text from the OCR output
  - the canonical preview asset is the original PDF unless OCR produced an OCR-enhanced replacement PDF
- `docx`
  - DOCX is converted to PDF through the shared document conversion service
  - the ingestion runtime must have LibreOffice (`soffice`) installed because Inkwise calls the shared converter directly
  - the generated PDF then goes through the same PyMuPDF plus optional OCRmyPDF/Tesseract flow used for native PDFs
  - retrieval is text-first and uses the final extracted/OCR text, while preview continues to use the canonical PDF asset
- `webpage`
  - the current source-capture path stores a rendered PDF snapshot, not raw HTML
  - ingestion treats the captured webpage like a PDF-backed source and extracts text from the rendered snapshot

### Reference metadata autofill

After normalization and before ingestion is marked completed, Inkwise now runs a best-effort Gemini metadata extraction step for PDF, DOCX, and webpage sources.

- the extractor reads normalized text plus source context like filename and URL
- it suggests a source title and bibliographic metadata used by Inkwise citation formatting
- autofill uses a fill-blanks-only merge policy and does not overwrite existing source metadata
- extraction failures are logged but do not fail ingestion
- when metadata changes, linked document citations are refreshed through the existing citation refresh path

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

For PDF and DOCX sources, ingestion now persists page text in `inkwise_source_pages`, keeps a canonical PDF preview asset, and also writes preview-only per-segment page-window PDFs for document evidence viewing.

## 3. Segmentation

Segmentation is implemented in `backend/inkwise/services/segmentation_service.py`.

### Segment families

Current segment types are:

- `text_chunk`
  - modality: `text`
  - paragraph-grouped text chunks from PDF/DOCX extracted or OCR text
  - intended for precise evidence excerpts and lexical search
- `web_block`
  - modality: `web`
  - grouped blocks from a captured webpage snapshot

### Segmentation settings

Configured in `backend/inkwise/settings.py`:

- `INKWISE_SEGMENT_TEXT_CHUNK_CHARS` default `3000`

OCR settings used during document normalization:

- `INKWISE_OCR_ENABLED` default `true`
- `INKWISE_OCR_LANGUAGES` default `eng`
- `INKWISE_OCR_TIMEOUT_SECONDS` default `900`
- `INKWISE_OCR_FORCE` default `false`

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

- `text_chunk` and `web_block` segments are embedded from `text_content`
- user retrieval queries are embedded from query text

For PDF and DOCX sources, document retrieval is now text-only: OCR/extracted text is chunked and embedded, and the runtime no longer generates PDF file embeddings for those sources.

Preview nuance: Inkwise still creates derived PDF window files for document `text_chunk` segments, but those assets are used only for evidence preview in the UI, not for embeddings or Gemini answer generation.

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

If enabled, retrieval may call `backend/inkwise/services/query_rewrite.py`.

The rewrite step can produce:

- a standalone question
- an FTS-oriented query

Current behavior:

- rewrite is optional and model-backed
- rewrite only runs when recent chat history exists
- it uses recent chat history, source titles, document language/purpose, and draft context
- its main job is to resolve history-dependent references into a standalone retrieval query
- retrieval uses a single planned query path; there is no second fallback pass back to the original query

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

Current behavior:

- lexical fusion is independent from whether query rewrite runs
- when rewrite provides an `fts_query`, lexical search uses it
- otherwise lexical search uses the selected vector query directly
- if lexical fusion is disabled, retrieval stays vector-only

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
8. optionally attach up to 100 evidence files as multimodal Gemini inputs
9. stream the assistant response from Vertex AI over SSE as model chunks arrive
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
- output is streamed from Vertex AI over SSE as model chunks arrive
- evidence metadata is still returned to the client when grounding succeeds

Unlike chat, writing tool output is instructed to return only the requested text with no citation markers.

Retries are supported through `POST /api/inkwise/writing-tools/{attempt_id}:retry`.

### Grounded prediction

Main route: `POST /api/inkwise/documents/{document_id}/predictions`

Behavior:

- predictions always start from a short autocomplete prompt
- if ready bound sources exist, Inkwise runs retrieval with current block text plus nearby draft context
- if evidence is found, the prediction prompt becomes grounded
- up to 100 evidence files may be attached multimodally
- the raw result is normalized down to a short insertion string

Prediction responses return:

- suggestion text
- grounded boolean
- retrieval run ID
- attempt ID
- evidence payload

## 8. Multimodal Evidence Attachment

`backend/inkwise/services/multimodal_evidence.py` adds non-document media evidence files directly to Gemini generation calls.

Current behavior:

- only image, audio, and video preview assets are attached
- at most 100 files are attached
- duplicate assets are skipped
- the prompt is augmented with the evidence IDs corresponding to attached files

This means the current pipeline is text-first for document sources and multimodal only for non-document media.

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

For PDF-backed evidence, Inkwise prefers a derived preview-only page-window PDF so the citation viewer opens directly to the relevant section. Older ingestions or fallback cases may still use the canonical source PDF, in which case the frontend applies a page fragment to jump to the cited page.

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

`normalize -> segment -> embed -> plan query -> vector retrieve -> optional lexical fuse -> rerank -> evidence pack -> generation`

## 13. Current Constraints And Notable Gaps

These are current implementation facts, not necessarily bugs:

- runtime ingestion supports PDF, DOCX, and webpage snapshots only
- stored vector schema requires `1536` dimensions today
- lexical search uses English `tsvector`/`tsquery`
- webpage normalization is heuristic HTML cleanup, not a browser-rendered readability pipeline
- OCR currently uses OCRmyPDF + Tesseract with English configured by default
- document retrieval is text-only; multimodal attachments are reserved for image/audio/video evidence
- chat requires explicit citation markers in model output; writing tools and prediction do not return citation markers
- retrieval uses one explicit query plan and one search pass per request
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
