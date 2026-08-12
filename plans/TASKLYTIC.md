# Tasklytic Phase-by-Phase Completion Plan

## Summary

Implement each phase from the result of its predecessor. Every phase must pass its exit gate before the next begins, but production deployment is allowed only at the milestone gates after Phases 3, 7, and 10. Production deployment should be done only by the human developer.

Preserve these decisions throughout: `/dashboard/project-management` is canonical, “AI Project Management” is customer-facing, Firebase owns authentication, PostgreSQL is authoritative for authenticated users, internal evaluation workspaces remain supported, and customer trial behavior is removed.

## Implementation Phases

### Phase 1 — Baseline, boundaries, and quality gates

- Create a requirement traceability matrix covering the numbered Tasklytic specifications, current implementation, target phase, and final disposition.
- Remove trial roles, partitions, claims, onboarding copy, and analytics events without deleting legacy browser keys. Preserve explicitly gated evaluation tenants.
- Require the backend repository for authenticated use. Limit local persistence to tests and evaluation tooling; show a recoverable service-unavailable state when production persistence cannot load.
- Hide unsupported integration choices and remove stale route/name documentation.
- Make the existing ESLint flat configuration and TypeScript checks enforceable in CI. Fix blocking violations, remove Next.js build bypasses, and add Tasklytic lint, type-check, frontend-unit, and backend-test jobs.

Exit gate: canonical routes and access boundaries are tested; no customer trial path is reachable; explicit lint, type-check, unit, backend, OpenAPI, and production-build checks pass.

### Phase 2 — Concurrency, authorization, and live data contracts

- Standardize revisions on mutable records and expose them in bootstrap and collection responses.
- Require `If-Match` on updates and deletes. Return `409` with the current record when revisions conflict, and add reusable conflict/reload UI.
- Add workspace event persistence and an authenticated SSE endpoint supporting `Last-Event-ID` or an explicit cursor. Retain refresh-on-focus as fallback.
- Centralize action-level authorization for view, edit, submit, approve, bill, payment, trust, rate, and workspace-administration operations; enforce the same capabilities in APIs and UI.
- Introduce shared loading, empty, forbidden, not-found, conflict, retry, and service-error components.

Exit gate: tenant isolation, conditional writes, conflict recovery, SSE reconnect/cursor behavior, and every authorization capability have backend and frontend regression tests.

### Phase 3 — Transactional commands and background execution

- Add an idempotent outbox/job model with leases, retry policy, run history, failure details, and deduplication keys.
- Extend Tasklytic maintenance into the runner for scheduled rules, due-date notifications, dashboard digests, AI teammates, abandoned uploads, and integration retries.
- Move existing multi-record mutations into transactional domain commands. Require future approvals, invoices, payments, locks, and rule executions to use the same command boundary.
- Expose command status and retry diagnostics for authorized administrators.

Exit gate: atomic rollback, duplicate dispatch, concurrent workers, retry exhaustion, and scheduled-job idempotency tests pass.

Milestone A: the platform foundation may be deployed after backward-compatibility verification.

### Phase 4 — Core projects, navigation, files, and timers

- Complete Teams and My Searches navigation, breadcrumbs, Form and Dashboard creation actions, and all currently visible settings destinations. Keep later-phase destinations hidden until functional.
- Add distinct Timeline and Gantt views plus project Files and Dashboard tabs without breaking existing project URLs.
- Complete project settings, members, descriptions, custom fields, notifications, view defaults, attachment-image covers, and project/task template entry points.
- Finish the files grid: search, filter, sort, grid/list layouts, bulk download, and authorized deletion.
- Implement one user-scoped running timer, global banner, quick start, accurate elapsed capture, and Save/Discard/Cancel when switching tasks. Preserve `T` for theme and use `Shift+T` for timer control.

Exit gate: desktop/mobile browser tests cover navigation, project CRUD/settings, every project view, files, permissions, covers, and timer switching/recovery.

### Phase 5 — Advanced work management

- Replace flat filters with recursive AND/OR groups and lazily migrate existing filters into a top-level AND group.
- Complete global search across Tasks, Projects, Goals, and People, including list/board/chart results, live counts, personal/workspace saved searches, and pinned sidebar entries.
- Finish weighted goal and supporting-goal rollups.
- Complete workload grouping, effort selection, capacity permissions, context actions, and people drill-down.
- Finish template bundles, previews, placeholder-role resolution, editable icons, task-template entry points, and curated-template validation.
- Harden public forms for validation, attachments, idempotency, spam controls, and permissions.

Exit gate: recursive-query migration, saved-search ownership, goal rollups, workload permissions, template resolution, and authenticated/public form flows are covered by unit, backend, and browser tests.

### Phase 6 — Automation and reporting

- Move rule evaluation from page-triggered client execution to the event/job pipeline.
- Add documented triggers/actions, scheduled and due-date events, exactly-once run records, retries, and visible failure history.
- Repair chart field handling and establish an extensible reporting-source registry; register project/task sources now and PSA sources as Phases 8–9 add them.
- Enforce dashboard viewer/editor permissions and accessible drill-downs.
- Generate real dashboard snapshots for email digests, expose next-run status, and eliminate client/server duplicate scheduling.

Exit gate: event-triggered and scheduled rules, replay protection, chart persistence, dashboard permissions, drill-downs, snapshots, and digest scheduling pass automated tests.

### Phase 7 — Persistent AI and AI teammates

- Persist AI threads and user/workspace settings on the backend. Migrate local threads once only after successful server persistence.
- Centralize supported Vertex models and structured-output schemas; keep credentials and prompt context server-side.
- Support previewable, editable, permission-checked proposals for task creation, subtasks, descriptions, status drafts, custom fields, rules, dashboard charts, summaries, and assignee suggestions.
- Implement Tria, Summarie, and Statura as configurable scheduled jobs with scoped context, audit trails, rate limits, metering, and failure notifications.

Exit gate: AI scope isolation, proposal validation/acceptance, one-time migration, teammate scheduling, rate limits, usage events, and failure handling pass backend and browser tests.

Milestone B: the completed work-management, automation, reporting, and AI feature set may enter authenticated internal beta.

### Phase 8 — PSA operations and approvals

- Add unified Approvals settings, conditional Matters/Engagements terminology, and detail routes for clients, matters/engagements, and expense reports.
- Complete time and expense edit, duplicate, submit, approve/reject, partial approval, write-off, lock, filter, receipt, and reimbursement workflows.
- Enforce immutable billed records and capability-based approval actions.
- Register time, expense, utilization, and WIP reporting sources.
- Provide manual receipt entry as the reliable fallback until Vertex extraction is enabled in Phase 10.

Exit gate: every time, timesheet, expense, and expense-report lifecycle transition is tested across member, approver, billing-admin, and unauthorized roles.

### Phase 9 — Billing, payments, trust, and financial controls

- Complete Billing Settings, rate cards, activity codes, approval routing, and budgets.
- Add invoice detail routes and complete narrative, discount, write-off, PDF, delivery/resend, aging, void, payment, trust/retainer, and audit-history workflows.
- Add transactional invoice generation, billing locks, payment application, and reversal behavior.
- Aggregate money by currency unless an explicit FX quote exists. Add cached ECB daily rates with workspace overrides for unsupported currencies.
- Register invoice, payment, realization, effective-rate, and AR-aging reporting sources.

Exit gate: rate resolution, currency separation, FX overrides, invoice/payment/trust state machines, immutable billing records, PDF output, and authorization pass unit, backend, and end-to-end tests.

### Phase 10 — Production integrations and launch hardening

- Implement Google Drive selection/import, Vertex receipt extraction with manual fallback, Gmail/GCS delivery and storage, and Stripe Connect payment links/webhook reconciliation.
- Keep workspace-plan Stripe billing separately scoped from client invoice payments.
- Replace advertised analytics adapters with first-party usage/audit events. Keep QuickBooks Online, OneDrive, Dropbox, Xero, NetSuite, and other unsupported providers hidden.
- Handle revoked credentials, replayed webhooks, partial synchronization, retry exhaustion, and external-ID conflicts without losing local records.
- Split the catch-all UI into feature-level lazy chunks, virtualize large lists, and keep the reported initial Tasklytic JavaScript load below 350 kB without eager PSA, reporting, AI, or settings code.
- Complete mobile, keyboard, and accessibility verification; remove obsolete placeholders, dead controls, duplicate components, and stale “coming soon” content.
- Close the traceability matrix only when every requirement is implemented and tested or explicitly superseded.

Exit gate: supported integrations pass sandbox tests; failure/replay scenarios preserve accounting records; accessibility and performance budgets pass; no visible placeholder or false integration remains; full CI and representative end-to-end suites are green.

Milestone C: production launch after migration rehearsal, capability enablement, monitoring verification, and rollback validation.

## Public Interfaces and Migrations

- Responses expose integer `revision` values and matching ETags. Existing-record `PUT` and `DELETE` requests require `If-Match`; conflicts return `409` with `detail.code = "revision_conflict"` and the current record.
- Add authenticated workspace SSE events with durable event IDs/cursors.
- Introduce recursive `FilterExpression` clause/group types and migrate legacy `FilterClause[]` values lazily as AND groups.
- Add typed approval-policy, external-reference, FX-quote, AI-thread, AI-teammate, automation-run, job/outbox, and integration-capability records.
- Use resource-scoped lifecycle actions for submit, approve, reject, generate, send, void, pay, retry, and synchronize operations rather than generic collection replacement.
- Add project view values `gantt`, `files`, and `dashboard`; add the Engagements alias and required settings/entity-detail routes.
- Use additive Alembic migrations, backward-compatible backend responses, regenerated `lib/api-types.ts`, and capability-gated frontend activation. Remove compatibility code only after the final rollout gate.

## Verification Rules

- Every phase begins from the predecessor and is delivered as a separately reviewable change set.
- Every phase runs targeted tests first, followed by Tasklytic lint, TypeScript, frontend unit tests, `backend/tests/test_tasklytic_service.py`, relevant new backend tests, and OpenAPI freshness checks.
- Create a git commit after each phase, but do not push.
