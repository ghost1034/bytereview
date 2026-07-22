---
name: integration-document-analysis
description: Import documents from any CPAAutomation connected integration, run Universal Document Analysis, and export the structured results to a connected integration from one natural-language request
version: 0.1.0
metadata:
  hermes:
    tags: [legal, integrations, document-analysis, automation]
    category: legal
    managed_by: cpaautomation
required_environment_variables:
  - name: CPAA_ACTIVATION_KEY
    prompt: CPAAutomation.ai activation key
    required_for: CPAAutomation platform and integration access
---

# Integration Document Analysis

Use this skill whenever the user asks to get one or more documents from a connected app, analyze or extract data from them with CPAAutomation Universal Document Analysis, and optionally send the results to a connected app. The user can describe the outcome in one prompt; they do not need to name MCP tools or describe the transfer steps.

Examples that activate this skill:

- “Get this month's invoices from Dropbox, extract vendor, invoice number, date, and total, and put the CSV in Google Drive.”
- “Analyze the contracts in the Box Acme folder with our lease template and upload the results to SharePoint.”
- “Pull the PDF attached to the latest Gmail message from the controller, extract the requested fields, and add the rows to Airtable.”

## Interpret the request

Build an internal workflow spec before calling tools:

1. `source`: integration, connection label if supplied, and the file/folder/message/filter identifying the documents.
2. `analysis`: named template or ad hoc fields, processing mode, and optional description.
3. `destination`: integration, target folder/table/record, output format, and naming.
4. `authorization`: whether the prompt explicitly asks to run analysis and whether it asks to export.

The initial prompt is explicit approval for metered analysis when it clearly says to analyze, extract, process, or run Universal Document Analysis. It is explicit approval for the external write when it clearly says to upload, export, save, append, create, or send the result. Keep those approvals through the workflow. After showing the configuration summary, proceed with `confirmed_by_user=true` without asking the user to repeat approval. Ask one concise follow-up only if a required source, extraction target, or destination cannot be inferred safely.

Use reasonable defaults instead of asking about optional details:

- Search all connected accounts unless a connection label was named.
- If exactly one relevant template matches, use it. Otherwise infer ad hoc fields from the user's requested output.
- Query `get_document_analysis_options` and use returned data type IDs; do not invent data types.
- Default processing mode to `individual`. Use `combined` only when the request treats several files as one logical record.
- Default tabular exports to CSV and nested or non-tabular exports to JSON.
- Use a descriptive, collision-resistant result name containing the analysis name and current date.

## Execute end to end

Maintain `job_id`, `run_id`, source file IDs, result cursors, and destination identifiers as workflow state. Do not stop after merely finding files or starting the analysis.

### 1. Import from the connected integration

1. Call `list_apps` with `connected_only=true` and resolve the source provider. If it is not connected, give the Integrations dashboard link from the MCP error and stop without creating an analysis.
2. Use `search_actions` to find the provider's list/search/get/download actions. Call `get_action_guide` before each action whose input or output is not already known.
3. Use `execute_action` to locate exactly the documents in scope and download their bytes into a dedicated local workspace directory. Follow pagination until the source filter is exhausted, while respecting any user-specified limit.
4. Resolve provider-returned authenticated download URLs or file payloads locally. Never give an arbitrary external URL to a document-analysis tool. If the provider cannot supply downloadable bytes, explain the integration limitation and stop.
5. Validate every local file: non-empty, 50 MB or smaller, and PDF, DOCX, PPTX, XLSX, CSV, or ZIP. Record filename, relative path, byte size, and MIME type. Exclude unrelated files and report unsupported files.

Do not log document bytes, access tokens, signed URLs, or sensitive contents. Do not place document bytes in MCP JSON arguments.

### 2. Create, upload, and configure

1. Call `get_document_analysis_options` and `list_document_analysis_templates` as needed.
2. Call `create_document_analysis` only after at least one local file has passed validation.
3. Call `prepare_document_uploads` with the exact local metadata.
4. For every returned upload, stream that file's raw bytes with HTTP `PUT` to its signed `upload_url`, using the exact returned `required_headers.Content-Type`. Treat any non-2xx response as a failed upload. Never substitute base64 or JSON.
5. Call `complete_document_uploads` with all returned `source_file_id` values.
6. Poll `get_document_analysis_status` when ZIP expansion or page counting is not ready. Use bounded backoff. Do not configure until `files_ready=true`.
7. Call `configure_document_analysis` with exactly one of `template_id` or `fields`, plus the chosen processing mode.

Present a compact summary of file count, page total, field names, processing mode, and destination. If the initial request already authorized analysis, continue in the same run. Otherwise pause for approval.

### 3. Analyze and collect every result

1. Call `start_document_analysis` with the same `job_id`, `run_id`, and `confirmed_by_user=true` only when approval exists.
2. Poll `get_document_analysis_status` with bounded backoff until the run is completed or failed. Continue through temporary in-progress states. Surface task failures and the dashboard URL on failure.
3. Call `get_document_analysis_results`. Follow every `next_cursor` until `has_more=false`; do not silently export only the first 200 rows.
4. Preserve the returned field names and source metadata. Write the complete result locally as CSV or JSON using UTF-8. For CSV, use one header row and safely quote delimiters, quotes, and newlines.

### 4. Export and verify

1. If the user requested export, resolve the connected destination with `list_apps`, then discover the appropriate upload/create/append action with `search_actions` and `get_action_guide`.
2. Use `execute_action` with the exact destination requested. Prefer a single file upload for Drive/Dropbox/Box/SharePoint-like destinations and row append/create actions for table/database destinations.
3. Do not overwrite an existing external file unless the user explicitly requested replacement. Use a unique name or provider-supported conflict behavior by default.
4. Verify success from the action response. Capture the external file/record ID and link when returned. If export fails, keep the local result and the completed analysis; report a retryable export error without rerunning analysis.

## Completion response

Return one concise completion report containing:

- imported document count and source integration;
- analysis name, row count, and CPAAutomation dashboard URL;
- destination integration plus exported object ID/link, or the exact export failure;
- excluded/unsupported files and partial task failures, if any.

Never claim completion until the destination action confirms success. Never rerun a completed analysis merely to retry export.
