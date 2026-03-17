# Inkwise Gemini Embedding 2 Implementation Plan

This plan turns `docs/INKWISE_GEMINI_EMBEDDING_2.md` into an execution sequence. It is organized to reduce migration risk, preserve a working Inkwise product during development, and make rollback possible until the new retrieval path is proven.

## Goals

- Remove PageIndex from Inkwise.
- Ship Gemini Embedding 2-based vector retrieval.
- Preserve grounded chat and inline writing tools during migration.
- Prepare the backend for later patented features and UI work.

## Guiding Principles

- Build the new retrieval path beside the old one before cutting over.
- Keep ingestion and retrieval idempotent.
- Prefer additive schema changes first, destructive cleanup last.
- Gate rollout behind feature flags.
- Validate quality with side-by-side retrieval comparisons before switching production traffic.

## Phase 0: Readiness And Decisions

### Objectives

- Lock the implementation shape before code changes spread across backend and frontend.
- Confirm environment and infrastructure prerequisites.

### Tasks

- Finalize production embedding dimension (`1536` unless evaluation disproves it).
- Finalize initial supported source types for v1 migration:
  - PDF
  - DOCX via canonical PDF conversion
  - webpage snapshots if we want them in the first cut, otherwise defer to phase 6+
- Confirm Postgres will support `pgvector` in all environments.
- Decide whether lexical fusion ships in the first production cut or stays behind a feature flag.
- Define initial task-instruction strings for query and document embeddings.
- Define top-k defaults for vector recall and reranking.

### Deliverables

- Finalized config defaults
- Confirmed DB extension strategy
- Confirmed rollout flags

### Exit Criteria

- No unresolved architecture blockers remain for the first implementation pass.

## Phase 1: Schema Foundations

### Objectives

- Add the new vector-RAG schema without breaking the current PageIndex-based flow.

### Tasks

- Add an Alembic migration to enable `pgvector`.
- Add new tables:
  - `inkwise_source_segments`
  - `inkwise_source_segment_embeddings`
- Add indexes for:
  - `source_id`
  - `user_id`
  - `ingestion_id`
  - `segment_type`
  - active vector search index on embeddings
- Extend `InkwiseSourceIngestion` with new normalization / embedding metadata as needed.
- Extend retrieval-evidence storage to support `segment_id`, `locator_json`, and preview metadata.
- Keep old PageIndex tables intact for now.

### Likely files

- `backend/alembic/versions/...`
- `backend/models/inkwise_models.py`

### Deliverables

- Migrations apply cleanly
- ORM models compile and run
- Existing Inkwise routes still work unchanged

### Exit Criteria

- Database supports storing active segment embeddings and segment locators.

## Phase 2: Embedding And Normalization Service Layer

### Objectives

- Introduce the new backend service primitives required for vector ingestion and retrieval.

### Tasks

- Add `backend/inkwise/services/embeddings.py`
  - Gemini Embedding 2 wrapper
  - support configurable dimension and location
  - support task instructions
- Add `backend/inkwise/services/source_normalizer.py`
  - canonical handling for PDF
  - DOCX -> PDF path reuse or extension
  - webpage snapshot interfaces if included in v1
- Add `backend/inkwise/services/segmentation_service.py`
  - build `pdf_window` segments
  - build `text_chunk` segments
  - produce locators and preview metadata
- Add shared helpers for:
  - token/char budgeting
  - batching embedding requests
  - deterministic segment ordering

### Likely files

- `backend/inkwise/services/embeddings.py` (new)
- `backend/inkwise/services/source_normalizer.py` (new)
- `backend/inkwise/services/segmentation_service.py` (new)
- `backend/inkwise/settings.py`

### Deliverables

- New services can be unit-tested independently of API routes.

### Exit Criteria

- A local worker can normalize a source and produce in-memory segments plus embeddings.

## Phase 3: New Ingestion Pipeline

### Objectives

- Store normalized segments and Gemini embeddings for sources while keeping the current ingestion path available.

### Tasks

- Refactor `backend/inkwise/services/ingestion_service.py` to support a new `normalize_embed` pipeline.
- Make ingestion write:
  - normalized source artifacts
  - `inkwise_source_segments`
  - `inkwise_source_segment_embeddings`
- Preserve ingestion status semantics and task retry behavior.
- Add ingestion version metadata so we can reindex later.
- Update source readiness logic in `backend/inkwise/services/document_sources.py` to understand the new criteria.
- Add feature flag support so environments can run:
  - PageIndex only
  - dual write
  - Gemini only

### Likely files

- `backend/inkwise/services/ingestion_service.py`
- `backend/inkwise/services/document_sources.py`
- `backend/inkwise/routes/sources.py`
- `backend/inkwise/routes/internal_tasks.py`
- `backend/inkwise/services/task_service.py`

### Deliverables

- A source can be uploaded and ingested into segment + embedding records.
- Readiness checks can be driven by new embeddings.

### Exit Criteria

- Dual-ingested sources exist in staging and can be queried by the new retrieval code.

## Phase 4: Vector Retrieval Path

### Objectives

- Build the new retrieval engine without yet switching all product surfaces to it.

### Tasks

- Add `backend/inkwise/services/vector_retrieval_service.py`.
- Implement query embedding generation.
- Implement pgvector top-k search scoped by:
  - user
  - active embeddings
  - bound source IDs
- Add optional lexical fusion using `text_tsv` on `inkwise_source_segments`.
- Add reranking on the retrieved candidate set.
- Refactor `backend/inkwise/services/retrieval_service.py` to become an orchestrator over the new vector path.
- Persist retrieval runs and evidence using segment-based evidence objects.

### Likely files

- `backend/inkwise/services/vector_retrieval_service.py` (new)
- `backend/inkwise/services/retrieval_service.py`
- `backend/inkwise/services/json_utils.py`
- `backend/inkwise/settings.py`

### Deliverables

- A retrieval run can return segment-based evidence from embedded sources.
- Retrieval metadata records strategy, candidate counts, and rerank info.

### Exit Criteria

- New retrieval path returns usable evidence for representative test documents.

## Phase 5: Product Surface Cutover

### Objectives

- Move existing Inkwise product features from PageIndex-shaped retrieval to Gemini vector retrieval.

### Tasks

- Update grounded chat to use segment-based evidence.
- Update inline writing tools to use the new retrieval engine.
- Keep autocomplete ungrounded for now unless grounded prediction is pulled into the same release.
- Update evidence payloads and frontend rendering to consume:
  - `segment_id`
  - `locator`
  - preview metadata
- Update any UI copy that still references PageIndex tree nodes.

### Likely files

- `backend/inkwise/routes/chat.py`
- `backend/inkwise/routes/writing_tools.py`
- `backend/inkwise/routes/retrieval.py`
- `app/dashboard/inkwise/references/page.tsx`
- `app/dashboard/inkwise/write/[id]/page.tsx`
- `components/inkwise/inline-writing-tools.tsx`
- `lib/api.ts`

### Deliverables

- Chat and inline tools work end-to-end on the new retrieval path.
- Frontend no longer assumes PageIndex node-based evidence.

### Exit Criteria

- Users can upload a source, bind it, retrieve evidence, chat, and run writing tools using only the new path.

## Phase 6: Backfill And Dual-Run Evaluation

### Objectives

- Validate quality, cost, and stability before deleting the old system.

### Tasks

- Add a backfill script or admin task to re-ingest existing Inkwise sources into the new format.
- Create a retrieval comparison harness for a representative source set.
- Compare current vs new retrieval on:
  - evidence relevance
  - citation usefulness
  - latency
  - failure rate
  - cost
- Tune:
  - segment sizing
  - overlap
  - embedding dimension
  - vector top-k
  - rerank top-k
  - lexical fusion weight or on/off status

### Deliverables

- A scored comparison of old and new retrieval behavior
- Tuned default settings for production rollout

### Exit Criteria

- Team has confidence that the Gemini path is production-acceptable.

## Phase 7: Production Cutover

### Objectives

- Switch runtime retrieval to Gemini Embedding 2 by default.

### Tasks

- Flip feature flags so the new ingestion/retrieval path is the default.
- Keep rollback flags in place for at least one release window.
- Monitor:
  - ingestion success rate
  - embedding quota errors
  - retrieval latency
  - chat/tool failure rates
  - evidence-empty rates
- Patch operational issues quickly while the old path still exists behind flags.

### Deliverables

- Production reads and writes use the Gemini path by default.

### Exit Criteria

- Stable operation for an agreed observation period.

## Phase 8: Remove PageIndex

### Objectives

- Fully eliminate PageIndex from Inkwise after successful cutover.

### Tasks

- Delete `backend/inkwise/services/pageindex_oss_treegen.py`.
- Remove vendored runtime dependency on `vendor/pageindex` from Docker/build assumptions.
- Remove PageIndex-specific code paths from ingestion.
- Remove PageIndex-specific schema pieces:
  - `inkwise_source_tree_nodes`
  - `pageindex_doc_id`
  - old tree cache metadata if no longer needed
- Update docs and help text.

### Deliverables

- Inkwise no longer contains or references PageIndex.

### Exit Criteria

- Code search shows no live PageIndex dependency in Inkwise runtime paths.

## Phase 9: Post-Migration Enhancements

These are not required for the initial migration, but the new architecture should make them easier:

- grounded predictive writing using preceding text + references
- citation bubbles with previewable evidence
- multimodal source previews in the editor/chat UX
- webpage ingestion
- richer ingestion observability and admin tooling
- improved retry UX for generation outputs

## Cross-Cutting Workstreams

### Testing

- Unit tests for:
  - segmentation
  - embedding service wrapper
  - vector retrieval ranking
  - readiness logic
- Integration tests for:
  - upload -> ingest -> bind -> retrieval
  - upload -> ingest -> chat
  - upload -> ingest -> writing tools
- Migration tests for:
  - Alembic upgrade/downgrade where practical
  - backfill idempotency

### Feature Flags

Suggested flags:

- `INKWISE_USE_GEMINI_EMBEDDINGS`
- `INKWISE_DUAL_WRITE_INGESTION`
- `INKWISE_USE_VECTOR_RETRIEVAL`
- `INKWISE_USE_LEXICAL_FUSION`
- `INKWISE_USE_VECTOR_RERANK`

### Observability

Track at minimum:

- ingestion duration
- segment count per source
- embedding requests per source
- retrieval empty-result rate
- rerank latency
- per-route provider errors
- quota-related 429s

## Risks And Mitigations

### Risk: Gemini Embedding 2 preview instability

Mitigation:

- isolate model calls behind one service
- keep config fully runtime-tunable
- record embedding metadata for reindexing

### Risk: pgvector operational friction

Mitigation:

- enable it in staging first
- verify managed Postgres compatibility before migration work depends on it

### Risk: retrieval quality regressions

Mitigation:

- dual-run evaluation before cutover
- keep lexical fusion available
- keep rollback flags until confidence is high

### Risk: PDF 6-page embedding limit

Mitigation:

- use deterministic PDF windows <= 6 pages
- store multiple overlapping windows per source
- pair them with finer-grained text chunks

## Recommended Execution Order

If we want the fastest low-risk path, implement in this order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 6 on a staging corpus
7. Phase 5
8. Phase 7
9. Phase 8

This intentionally delays destructive cleanup until after evaluation and cutover.

## Definition Of Done For The Migration

The Gemini Embedding 2 migration is done when all of the following are true:

- new sources ingest into segment + embedding records successfully
- grounded chat uses vector retrieval in production
- inline writing tools use vector retrieval in production
- existing bound-source workflows still work
- PageIndex is removed from runtime code paths
- old PageIndex schema artifacts are removed or formally deprecated
- operational dashboards show stable ingestion and retrieval behavior
