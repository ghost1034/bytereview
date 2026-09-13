# E-Signature single-request placement

The `single-request-v1` pipeline authors empty interactive fields with **at most one outbound Gemini inference attempt per run**, across all selected documents. Local PDF extraction, OCR, contour detection, geometry checks, reference resolution, and application do not call a hosted model. Sender review is required before applying suggestions.

## Data flow

1. Snapshot selected original PDF hashes, participants, existing fields, model settings, sender instructions, and pipeline version.
2. Extract physical PDF widgets/lines/outlines and nearby labels. On scanned pages, OCR an upright derivative of the original displayed raster and map the words back to display coordinates. Do not deskew or replace the source document. Detect hollow raster controls and blank rectangles locally. Native square/circle/widget types constrain compatible controls; writing areas do not force a semantic field type.
3. Build one indexed multi-image request with the layout catalog and compact page text. The response classifies catalog candidates and supplies complete assignments for supplemental visual targets, page inspection acknowledgments, choice groups, and properties. The provider schema uses a validated `properties_json` string to avoid expanding twenty property contracts into an excessively complex decoding schema.
4. Resolve unique visual/native matches, validate geometry and ownership, suppress compatible existing fields, and report conflicts and missing classifications. Validate all twenty editor types with the existing property/field-graph validators. Derived group IDs and field IDs are server-owned. Supplemental discovery and page acknowledgments are evidence of inspection, not proof of complete coverage.
5. Stage valid connected components. Reject a bad group/dependency component without discarding unrelated valid fields. Apply accepted groups and dependencies transactionally, allocating final IDs and remapping formula/conditional references before validation.

The former anchor helpers and multi-call analysis module remain available for historical regression tests and explicit baseline evaluation. The live worker cannot route new runs through them.

## Request durability and failure behavior

Migration `082_esign_single_request` adds `inference_attempted_at`, `model_response`, `processing_token`, `processing_deadline`, and `processing_attempts`.

- Claim a queued run under a row lock and assign a worker token and 30-minute lease.
- Before network I/O, persist the inference-attempt marker and request hash in a separate transaction. Never clear that marker.
- Use one SDK attempt, no automatic tools, and a ten-minute provider timeout. No model retries, repairs, verification calls, fallback models, or continuation calls are allowed.
- Persist the response before materialization. A local transient failure can resume that exact response, provided the newly prepared request hash matches. Local processing is limited to three durable attempts.
- Provider failures, unknown outcomes after a reserved attempt, malformed/truncated responses, validation failures, and unrecoverable worker crashes fail the run. Starting again requires a new sender-created run.
- Maintenance expires abandoned worker leases, retries saved-response processing, and re-offers queued saved responses after enqueue failures. Worker tokens prevent late responses/completions from overwriting terminal results. Duplicate deliveries cannot reserve another inference attempt.
- Charge only when the completed result is committed, using the existing unique usage-event key. Applying/discarding/replaying does not trigger inference or a second charge.

Private diagnostics retain the snapshot, prompt/schema, image/request hashes, provider version/usage, attempted-call count, output, adjustments, exclusions, and issues. These are deliberately omitted from public run responses.

## Limits and deployment

The shared editor contract supports all 20 field types. Advanced configuration must be evidenced by the document or sender: dropdown options, auto-fill source, formula expressions, and conditional parents. Empty control labels can supply radio option values. Unknown or unsupported configuration goes to review; no answers are invented.

Local request admission allows at most 500 pages and 500 total candidates/proposals, 16 million pixels per rendered page, 7 MB per inline image, a 19 MB base64 image/request budget, and 500 KB of prompt text. Requests exceeding these conservative limits fail with guidance to select fewer documents. Never silently truncate pages, split a run, or send a count-tokens model RPC. The adapter permits 65,536 output tokens and requires a `STOP` finish reason.

Deploy API, extract worker, and maintenance worker from the same revision after applying migration 082. The extract image already includes Tesseract; Pillow is supplied by the existing OCR dependency. Existing saved results remain readable and applicable.

`single-request-v1` is the only pipeline; every new analysis uses it and there is no rollout flag or requester allowlist. Per-firm access is still governed by the existing `ai_field_placement` entitlement. `ESIGN_AI_FIELD_PLACEMENT_MODEL` and `ESIGN_AI_FIELD_PLACEMENT_LOCATION` remain as model/location overrides, snapshotted at creation.

Before deploying, allow old queued/processing work to drain on the old worker. Verify the active-run count is zero before replacing workers; old-version queued runs encountered by the new worker fail with instructions to start a new run.

Rollback now means deploying the previous revision — there is no environment switch that pauses new runs, and no in-flight request is replayed with an older model pipeline. Do not downgrade migration 082 while new workers or saved-response work remain active.

## Evaluation and acceptance

The opt-in evaluator never creates production run rows, usage events, or document edits. Keep its outputs in a private, untracked directory because they contain document text and model responses.

```sh
PYTHONPATH=backend backend/.venv/bin/python backend/scripts/evaluate_esign_placement.py \
  --suite all --iterations 10 --workers 4 --project YOUR_PROJECT --gcloud-auth \
  --output /tmp/esign-placement-evaluation
```

The suite includes the original consent form (empty and with existing fields), all 20 editor types, single/multiple-choice groups, independent checkboxes, scanned and rotated forms, repeated labels assigned to two parties, an unlabeled area, and multiple documents. The authored expected rectangles are independent of detector output. Assertions cover geometry, types, owners, options, cardinality, multiline behavior, and formula evaluation. Unit tests additionally cover crop boxes, native widget options/values, malformed responses, omissions, existing-field conflicts, dependency closure, exact replay, and preflight limits.

Use `--baseline` explicitly to compare the old multi-call pipeline; it is allowed to make multiple calls only in this standalone evaluator. `--replay PATH` replays recorded single-request evidence offline with zero model calls. Evaluation results include calls, tokens, latency, recall, and false placements. Release only after every curated case passes all ten runs and broader-corpus comparison shows acceptable quality. A failed evaluation blocks the release even if software tests pass.

Run the focused suite against a disposable local PostgreSQL database:

```sh
ESIGN_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/DATABASE PYTHONPATH=backend \
  backend/.venv/bin/python -m pytest backend/tests/test_esign_single_request.py \
  backend/tests/test_esign_placement_lifecycle.py -q
npm run test:unit -- components/esign
npm run type-check
npm run check:openapi
```
