# Complete AI Project Management / Tasklytic

## Summary

Finish Tasklytic to full documented feature parity, including visible placeholders, unreachable or inert features, production-readiness gaps, and stale documentation. Keep `/dashboard/project-management` as the canonical route and “AI Project Management” as the user-facing name; retain “Tasklytic” only as the internal/legacy module name.

Use Firebase authentication and the existing CPAAutomation infrastructure. Remove the abandoned trial model, while preserving internal evaluation workspaces. Unsupported integrations will be hidden instead of presented as unfinished options.

## Implementation Changes

### 1. Platform correctness and production infrastructure

- Make the backend authoritative for authenticated use. Restrict the local repository to tests and internal evaluation; authenticated production must show a recoverable service error rather than silently falling back to browser storage.
- Add optimistic concurrency to entity writes using record revisions and `If-Match`; return `409` conflicts with the current record. Add workspace event streaming with an SSE cursor, retaining focus refresh as fallback.
- Move cross-record operations into transactional domain commands instead of chained client writes: approvals, invoice generation, billing locks, payment application, rule execution, and scheduled reporting.
- Extend the existing maintenance entrypoint into an idempotent job/outbox runner for scheduled rules, due-date notifications, dashboard digests, AI teammates, abandoned uploads, and integration retries.
- Centralize authorization for view, edit, submit, approve, bill, record-payment, trust-account, rate-management, and workspace-administration actions. Enforce it in both APIs and UI.
- Add complete loading, empty, forbidden, not-found, conflict, and retry states where pages currently render blank or depend on console errors.

### 2. Finish the core project-management experience

- Complete navigation and creation surfaces: Teams and My Searches sidebar groups; Form and Dashboard create actions; working breadcrumbs; Integrations, Feedback, Templates, Bundles, and AI Teammates settings.
- Complete projects:
  - Add distinct Timeline and Gantt renderers, plus Files and Dashboard tabs.
  - Wire the existing files grid with search, filtering, sorting, grid/list modes, bulk download, and authorized deletion.
  - Add members, description, custom fields, notifications, and view defaults to project settings.
  - Support real attachment-image board covers and connect task/project template actions, including editable template icons.
- Replace the unfinished timer behavior with one user-scoped running timer, a global banner, quick-start control, accurate elapsed-time capture, and Save/Discard/Cancel when switching tasks. Preserve `T` for theme and use `Shift+T` for timer control.
- Implement recursive AND/OR query groups, migrating existing flat filters to a top-level AND group. Complete global search with Tasks, Projects, Goals, and People scopes; list/board/chart results; personal and workspace saved searches; pinned sidebar entries; and live counts.
- Finish goals with weighted key-result/supporting-goal rollups. Complete workload grouping by person, team, and project; effort-field selection; capacity permissions; task context actions; and people drill-down.
- Finish template bundles, application previews, placeholder-role resolution, and task-template entry points. Validate all curated templates during provisioning.
- Keep the existing forms implementation, but harden public submission, attachment, idempotency, spam, validation, and permission paths with end-to-end coverage.
- Remove obsolete placeholder pages, orphaned module shells, dead controls, stale “coming soon” text, and unused duplicate components after their functionality is connected or superseded.

### 3. Complete automation, reporting, and AI

- Move rules from page-triggered client evaluation to the backend job/event pipeline. Add exactly-once run records, retries, failure history, scheduled triggers, due-date events, and all documented PSA triggers/actions.
- Complete dashboards and reporting:
  - Fix chart-builder field corruption and add PSA sources for time, expenses, invoices, payments, and WIP.
  - Enforce dashboard visibility/editor permissions and accessible drill-downs.
  - Generate actual dashboard snapshots for email digests, display next-run status, and prevent client/server duplicate scheduling.
- Persist AI threads and settings per authenticated user/workspace instead of local storage. Migrate existing local threads once after a successful server write.
- Expand the proposal registry to include task creation, subtasks, description updates, status drafts, custom fields, rules, dashboard charts, summaries, and assignee suggestions. Every mutation remains previewable, editable, permission-checked, and explicitly accepted.
- Implement Tria, Summarie, and Statura as configurable AI teammates executed by the job runner, with scoped context, schedules, audit trails, rate limits, usage metering, and failure notifications.
- Centralize supported Vertex models and structured-output schemas; keep API credentials and prompt context server-side.

### 4. Complete PSA and integrations

- Add unified Approvals and Billing Settings, conditional Matters/Engagements terminology, and detail routes for clients, matters, expense reports, and invoices.
- Complete time and expense workflows: edit, duplicate, submit, approve/reject, partial approval where allowed, write-off, lock states, filters, receipt extraction, reimbursement administration, and immutable billed records.
- Complete billing: rate cards, activity codes, approval routing, budgets, invoice narrative/discount/write-off editing, PDF generation, Gmail delivery/resend, aging, voiding, payments, trust/retainer application, and audit history.
- Aggregate money by currency unless an explicit FX quote exists. Add a server FX service using cached ECB daily rates with workspace manual overrides for unsupported currencies.
- Replace adapter stubs with:
  - Existing Google OAuth/Drive for file selection and authorized import; hide OneDrive and Dropbox.
  - Vertex structured extraction for receipt OCR, with explicit manual fallback on extraction failure.
  - Existing Gmail and GCS paths for messages, invoices, exports, and attachments.
  - Existing Stripe billing for the workspace plan, plus separately scoped Stripe Connect payment links and webhook reconciliation for client invoices; retain manual payments.
  - QuickBooks Online OAuth and idempotent customer, invoice, and payment synchronization using the existing encrypted connector infrastructure.
  - First-party backend usage/audit events instead of advertising unsupported third-party analytics providers.
- Handle revoked credentials, duplicate webhooks, partial syncs, retry exhaustion, and external-ID conflicts without losing local accounting records.

## Interfaces, Routes, and Migration

- Replace flat `FilterClause[]` storage with a recursive `FilterExpression` containing clauses and `and`/`or` groups; lazily migrate existing filters as AND groups.
- Remove `trial` from repository partitions, roles, claims, analytics events, onboarding copy, and documentation. Do not destructively delete legacy browser keys; leave them unread.
- Add revisions and event cursors to bootstrap data; require conditional updates for existing records and expose workspace SSE events.
- Add explicit lifecycle/action APIs for submissions, approvals, invoices, payments, rules, scheduled work, receipt extraction, and connector synchronization.
- Add typed integration capability/status, external-reference, approval-policy, FX-quote, AI-thread, AI-teammate, and automation-run records.
- Add routes for Integrations, Feedback, Templates/Bundles, AI Teammates, PSA Approvals/Billing Settings, entity detail pages, and the Engagements alias. Add `gantt`, `files`, and `dashboard` project view values without breaking existing project URLs.
- Apply additive database migrations first, deploy backward-compatible backend responses second, then enable the new frontend by workspace capability. Remove compatibility code only after telemetry shows no legacy clients.

## Test and Acceptance Plan

- Restore linting with an ESLint flat configuration and add Tasklytic-specific lint, type-check, frontend unit, backend, and browser-test CI jobs; production builds must no longer skip type or lint validation.
- Add unit tests for recursive filters, date/time handling, timers, template resolution, reporting queries, permissions, monetary aggregation, and every PSA lifecycle state machine.
- Add backend tests for tenant isolation, action-level authorization, revision conflicts, atomic multi-record commands, scheduler idempotency, webhook replay, integration retries, AI scoping, and file authorization.
- Add end-to-end flows for navigation, projects and every view, search/saved searches, templates, rules, forms, goals, workload, dashboards, AI proposals/teammates, and the complete time-to-invoice/payment workflow.
- Test admin, member, approver, billing-admin, trust-admin, guest, and external-form-user access in desktop and mobile layouts. Run keyboard and automated accessibility checks on all primary workflows.
- Split the catch-all page into feature-level lazy chunks and virtualize large lists. Require the reported initial Tasklytic JavaScript load to fall below 350 kB, with no eager loading of PSA, reporting, AI, and settings screens.
- Maintain a documented traceability matrix against every Tasklytic design requirement. Completion requires every entry to be implemented and tested or explicitly marked superseded by the assumptions below, with no visible placeholders, dead controls, false integration links, or unexplained orphan components.

## Assumptions and Superseded Requirements

- Firebase-authenticated access replaces all Tasklytic trial flows; the host application continues to own sign-in and profile management.
- Google Drive, Gmail, GCS, Vertex AI, Stripe, QuickBooks Online, and ECB/manual FX are the supported production integrations. Other advertised providers are removed until implemented.
- `/dashboard/project-management` supersedes stale `/dashboard/tasklytic` documentation.
- Evaluation-only repository partitions remain available for internal demos and tests, but are never exposed as a customer trial.
- Existing local data is migrated non-destructively where practical; successful server persistence is required before local copies are retired.
