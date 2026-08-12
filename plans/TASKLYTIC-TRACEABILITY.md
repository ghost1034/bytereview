# AI Project Management requirement traceability

This matrix is the authoritative reconciliation of the historical numbered
Tasklytic specifications with the phased completion plan. The implementation
keeps `Tasklytic` as an internal code name; the customer-facing name is **AI
Project Management** and the canonical authenticated route is
`/dashboard/project-management`.

Disposition meanings:

- **Retain** — accepted behavior that remains in the final product.
- **Complete in Phase N** — partially implemented behavior whose remaining
  acceptance criteria close in the named phase.
- **Superseded** — an original requirement intentionally replaced by an
  integration or product boundary recorded below.

| Spec | Requirement area | Current implementation baseline | Target phase | Final disposition |
|---|---|---|---:|---|
| 00 | Product/build-plan overview | Historical Vite-first plan; implementation is embedded in the CPAAutomation Next.js/FastAPI product. | 1 | Superseded by this matrix and `plans/TASKLYTIC.md`; numbered feature intent remains traceable. |
| 01 | Foundation and design system | Scoped Tasklytic theme, tokens, primitives, and strict TypeScript exist. | 10 | Retain; complete accessibility and dead-UI polish in Phase 10. |
| 01b | Editorial visual system and marketing/auth surfaces | In-app visual language exists; standalone marketing and Tasklytic-owned auth conflict with the host product. | 1 | Superseded for marketing/auth; retain the in-app design language. |
| 02 | Data model, stores, and repository | Typed Zustand stores and repository seam exist; authenticated persistence uses FastAPI/PostgreSQL. | 1, 2, 3 | Phase 1 backend boundary retained; add revisions/events/transactional commands in Phases 2–3. |
| 03 | Authentication and user profiles | Firebase and the dashboard `AuthGuard` own identity; Tasklytic bridges the authenticated user. | 1 | Superseded: no Tasklytic credentials, guest continuation, OAuth buttons, claims, or trial identity. |
| 04 | App shell and navigation | Responsive shell, workspace switcher, sidebar, top bar, command palette, and hotkeys exist. | 4 | Complete missing destinations and navigation behavior in Phase 4. |
| 05 | Workspaces, teams, members, invitations | Backend tenancy/membership, workspace/team UI, invitations, and guest visibility exist. | 2, 4 | Retain; centralize capabilities in Phase 2 and complete navigation/settings in Phase 4. |
| 06 | Project CRUD and overview | Project CRUD, overview, settings dialog, and view routing exist. | 4 | Complete project settings, members, tabs, covers, and template entry points in Phase 4. |
| 07 | Task core and detail pane | Task CRUD/detail, assignments, dates, tags, and multi-project fields exist. | 2, 4 | Retain; capability enforcement in Phase 2 and project-flow completion in Phase 4. |
| 08 | List view | Columns, grouping, bulk actions, inline creation, and drag/drop exist. | 4, 5 | Retain; finish project-view integration in Phase 4 and recursive filtering in Phase 5. |
| 09 | Board view | Kanban columns, task cards, and drag/drop exist. | 4 | Retain and cover through Phase 4 project-view tests. |
| 10 | Calendar view | Month/week scheduling and unscheduled tasks exist. | 4 | Retain and cover through Phase 4 project-view tests. |
| 11 | Timeline, Gantt, and dependencies | Timeline/dependency engine exists; Gantt is not yet a fully distinct product view. | 4 | Complete distinct Timeline/Gantt routes and behavior in Phase 4. |
| 12 | Subtasks and hierarchy | Nested task relationships and supporting utilities exist. | 4 | Retain and verify with the core task/project flows in Phase 4. |
| 13 | Sections, grouping, sorting, filtering | Sections and flat query filters exist; recursive AND/OR groups do not. | 5 | Complete recursive filter model and lazy migration in Phase 5. |
| 14 | Custom fields | Field library, editors, recommended fields, and formulas exist. | 4, 5 | Retain; complete project integration in Phase 4 and query/search use in Phase 5. |
| 15 | Search and saved views | In-memory search and saved-view foundations exist; ownership, counts, modes, and pinned searches are incomplete. | 5 | Complete in Phase 5. |
| 16 | My Tasks | My Tasks list/board/calendar layouts exist. | 4 | Retain and include in Phase 4 navigation/browser coverage. |
| 17 | Inbox and notifications | Inbox, notification records, archive/snooze, and delivery action exist. | 3, 4 | Move scheduled/digest delivery to jobs in Phase 3; retain inbox UX in Phase 4. |
| 18 | Comments, mentions, activity | Comments, reactions, draft persistence, sanitized rich text, and activity records exist. | 4 | Retain; browser-local comment drafts remain UI-only, not authoritative records. |
| 19 | Attachments and rich text | Backend signed uploads and project/task attachment UI exist; unsupported cloud providers are hidden. | 4, 10 | Complete files UX in Phase 4 and supported Drive integration/failure handling in Phase 10. |
| 20 | Forms intake | Authenticated form management and sanitized public backend submission exist. | 5 | Complete validation, attachments, idempotency, spam, and permission coverage in Phase 5. |
| 21 | Rules and automations | Builder and client evaluation exist; durable background execution does not. | 3, 6 | Add job foundation in Phase 3; complete event-driven automation in Phase 6. |
| 22 | Status updates and project messages | Composer, history, messages, comments, and permalinks exist. | 4 | Retain and verify with core project navigation in Phase 4. |
| 23 | Goals and OKRs | Goal pages and basic rollups exist. | 5 | Complete weighted/supporting-goal rollups in Phase 5. |
| 24 | Portfolios | Portfolio pages, projects, workload, and status updates exist. | 4 | Retain and verify as part of authenticated navigation in Phase 4. |
| 25 | Workload | Capacity and utilization utilities plus workspace/portfolio views exist. | 5 | Complete grouping, effort, permissions, actions, and drill-downs in Phase 5. |
| 26 | Reporting dashboards | Dashboard/chart builder, exports, schedules, and reporting home exist. | 6 | Complete source registry, permissions, snapshots, and digest scheduling in Phase 6. |
| 27 | Templates and bundles | Curated/saved template engine and project instantiation exist. | 5 | Complete previews, placeholder roles, bundles, icons, and validation in Phase 5. |
| 27b | Industry template library | General, business, accounting, law, finance, procurement, and HR templates exist. | 5 | Retain and validate curated content in Phase 5. |
| 27c | Transaction templates | Corporate-development and transaction templates exist. | 5 | Retain and validate curated content in Phase 5. |
| 28 | AI assistant | Server-scoped Vertex assistant and proposal UI exist; local fallback is evaluation/test-only. | 7 | Complete persistence, supported models, proposals, metering, and audit in Phase 7. |
| 28b | PSA time, expense, clients, matters, billing, trust, reports | Broad UI/entities exist but lifecycle, authorization, currencies, and transactional controls are incomplete. | 8, 9 | Complete operations/approvals in Phase 8 and billing/financial controls in Phase 9. |
| 29 | Mobile, accessibility, and polish | Responsive shell, shared states, focus/reduced-motion foundations exist; full audit and performance work remain. | 10 | Complete in Phase 10. |
| 30 | Onboarding, starter content, trial, evaluation, analytics | Authenticated onboarding and explicitly gated local evaluation fixtures exist. Customer trial code paths are removed; legacy browser keys are left untouched. | 1, 5, 10 | Retain authenticated onboarding/evaluation; supersede customer trial and advertised third-party analytics; validate templates in Phase 5 and finish first-party events in Phase 10. |

## Phase 1 boundary disposition

- Authenticated routes inherit Firebase enforcement from `/dashboard` and use
  the backend repository. A bootstrap failure renders a retryable service state
  and never hydrates customer records from browser storage.
- Browser repository persistence is allowed only under `NODE_ENV=test` or the
  explicit `NEXT_PUBLIC_INTERNAL_EVAL=true` evaluation gate. Existing
  `tasklytic:trial:v1:*` browser keys are not read, migrated, or deleted.
- The internal evaluation route is unregistered by policy unless its explicit
  gate is enabled. Customer trial/guest/sign-up route segments resolve to the
  module's unavailable-route state.
- Google Drive, OneDrive, and Dropbox remain hidden until an adapter reports
  them available.
