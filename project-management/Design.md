# Tasklytic — Design Log

Production-grade, multi-tenant work-management module built incrementally from build-plan docs `00`–`30`, integrated into the CPAAutomation Next.js app. `Tasklytic` remains the internal code name; the customer-facing name is **Tasklytic**. It mounts at the canonical authenticated route `/dashboard/project-management`, bridges CPAAutomation Firebase auth, and persists through FastAPI/PostgreSQL. See `plans/TASKLYTIC-TRACEABILITY.md` for accepted and superseded requirements.

> Integration note: the build-plan docs target Vite + React Router. This module adapts every step to **Next.js App Router** + CPAAutomation's **shadcn/ui** while preserving the locked data model and adapter architecture. The standalone public marketing site from `01b §7` is intentionally **out of scope** because CPAAutomation owns marketing and routing. Where older Tasklytic build-plan aesthetics conflict with the host application, the CPAAutomation design system is authoritative.

## Tech stack

- Next.js App Router (client components), React + TypeScript (strict, no `any`)
- shadcn/ui primitives (`@/components/ui/*`), Tailwind CSS
- Zustand stores (one per entity domain), `@dnd-kit` for drag-and-drop, recharts via `@/components/ui/chart`
- Feature code persists only through `RepositoryAdapter`; authenticated customer use requires FastAPI/PostgreSQL. localStorage is limited to tests and explicitly gated internal evaluation tooling, and legacy browser keys are left untouched.
- CPAAutomation dashboard shell, IBM Plex typography, semantic host tokens, and shared `components/ui` primitives

## Design system authority

Authenticated Tasklytic surfaces inherit CPAAutomation's dashboard shell, IBM Plex typography, semantic color tokens, focus treatment, elevation, and shared UI primitives. Tasklytic owns only compact productivity density and domain-specific interactions such as its workspace navigator, boards, timelines, task details, and PSA tables. It does not own an independent theme, logo, account shell, portal surface, or typography system. Future host theme support propagates automatically through shared tokens.

The client-facing public intake route is intentionally isolated under `.tasklytic-public-root` in `styles/tasklytic-public.css`; its identity must not leak into authenticated routes. Reduced-motion behavior uses the host stylesheet plus `hooks/useReducedMotion.ts` for the existing manual accessibility preference.

## Data model summary (02 — LOCKED, additive only)

Core: `User`, `Workspace`, `Team`, `Project`, `Section`, `Task` (multi-home, subtasks, dependencies, custom-field values), `CustomField` (8 types) + `CustomFieldValue`, `Comment`, `ActivityEvent`, `Attachment`, `Tag`, `Form`/`FormField`/`FormSubmission`, `Rule`/`RuleTrigger`/`RuleAction`, `Goal`, `Portfolio`, `StatusUpdate`, `Notification`, `SavedView`, `Chart`/`Dashboard`, `TaskTemplate`/`ProjectTemplate`.
Additive extensions added during rebuild: workspace invitations/plans, billing inquiries, team join requests, project messages, PSA entities (Client, Matter, BillingRate, RateCard, Timesheet, ExpenseReport, Payment, TrustTransaction), task effort, user capacity/time-off, my-tasks layout.

## Adapter seams (production swap-out points)

- **RepositoryAdapter** (`lib/repository`) — customer use always selects the REST adapter, which hydrates from `/api/tasklytic/bootstrap` and persists JSON payloads behind authoritative PostgreSQL tenancy and membership columns. The local adapter is test/evaluation-only; existing browser records are neither imported nor erased.
- **Authentication & user profiles** — delegated entirely to the host CPAAutomation platform (Firebase `useAuth`). Tasklytic owns no sign-in/up, password, OAuth, profile-editing, guest-continuation, or trial screens; the dashboard gates access and `TasklyticProvider` bridges the Firebase session into a linked user.
- **EmailAdapter** (`lib/email`) — customer mode delivers through the authenticated Gmail-backed API; local queuing is test/evaluation-only.
- **FileStorageAdapter** (`lib/fileStorage`) — customer mode uses signed direct uploads through the configured local/GCS object store; inline data URLs are test/evaluation-only.
- **FileStorageAdapter** (`lib/fileStorage`) — customer mode uses signed-URL uploads (100 MB cap) to the configured private local/GCS object store via `/api/tasklytic/files:*`; metadata is tracked in `tasklytic_file_uploads` for workspace-scoped access.
- **CloudDriveAdapter** (`lib/cloudDrive`) — unsupported providers are hidden; Google Drive may be exposed only after the Phase 10 adapter reports it available.
- **AIAdapter** (`lib/ai`) — backend mode sends only prompt/history/model/scope IDs; FastAPI reconstructs authorized PostgreSQL context and calls Vertex AI. In-browser Gemini and the deterministic adapter remain fallback implementations.
- **AnalyticsAdapter** (`lib/analytics`) — noop outside local debugging; first-party usage/audit events replace advertised third-party choices in Phase 10.
- **PaymentAdapter** (`lib/billing`, `lib/payment`) — V1 manual/inquiry; production Stripe/Adyen.
- Invoice JSON export is the supported accounting handoff. QuickBooks Online,
  Xero, NetSuite, and other accounting sync providers are intentionally hidden.
- **OcrAdapter** (`lib/ocr`) — V1 manual entry; production Veryfi/Mindee/Textract.
- **SearchAdapter** — V1 in-memory inverted index (`lib/search`); production Elasticsearch/Typesense/Meilisearch.

## Feature log

| Step | Paths | Feature | Date |
|------|-------|---------|------|
| 01/01b/02 | `styles`, `types`, `lib/repository`, `stores`, `lib` | Foundation, warm design system, locked data model + repository + stores | 2026-06-27 |
| 03 | `TasklyticProvider.tsx`, `hooks/useCurrentUser.ts`, `hooks/usePresence.ts`, `hooks/useActivityHeartbeat.ts`, `features/profile/{AccountMenu,UserAvatar}` | Identity bridged from CPAAutomation Firebase; presence + activity heartbeat; account menu. (Module-owned auth pages, password rules, OAuth, customer trial mode, and profile editor are superseded by platform auth.) | 2026-06-27 |
| 04 | `features/shell`, `TasklyticChrome.tsx`, `hooks` | App shell: sidebar, topbar, command-K, hotkeys, mobile drawer | 2026-06-27 |
| 05 | `features/workspaces`, `features/teams`, `features/members`, `lib/email`, `lib/payment` | Workspaces, teams, members, invitations, billing | 2026-06-27 |
| 06 | `features/projects`, `lib/projectActions.ts` | Project CRUD, Overview, settings, templates | 2026-06-27 |
| 07 | `features/tasks`, `lib/taskActions.ts` | Task core + full detail pane | 2026-06-27 |
| 08 | `features/views/list` | List view (columns, multi-select, inline create, DnD) | 2026-06-27 |
| 09 | `features/views/board` | Board kanban (DnD, WIP, swimlanes, density) | 2026-06-27 |
| 10 | `features/views/calendar` | Calendar (month/week, drag reschedule, unscheduled) | 2026-06-27 |
| 11 | `features/views/timeline`, `features/views/gantt`, `lib/dependencies.ts` | Timeline/Gantt + dependencies + critical path | 2026-06-27 |
| 12 | `features/tasks`, `lib/subtasks.ts` | Subtasks & hierarchy (5 levels, reparent) | 2026-06-27 |
| 13 | `stores/viewQuery.ts`, `lib/query`, `features/query` | Sections, grouping, sorting, filtering | 2026-06-27 |
| 14 | `features/custom-fields`, `lib/customFields` | Custom fields (8 types, library, formula) | 2026-06-27 |
| 15 | `lib/search`, `features/search`, `features/query/SavedViewsMenu` | Global search + saved views | 2026-06-27 |
| 16 | `features/my-tasks` | My Tasks (Today/Upcoming/Later, List/Board/Calendar) | 2026-06-27 |
| 17 | `features/inbox`, `lib/notifications.ts` | Inbox & notifications (archive/snooze/filter) | 2026-06-27 |
| 18 | `features/tasks/comments`, `lib/comments.ts`, `lib/activity.ts`, `lib/sanitizeHtml.ts` | Comments, @mentions, reactions, activity feed | 2026-06-27 |
| 19 | `features/attachments`, `features/richtext`, `lib/fileStorage`, `lib/cloudDrive` | Attachments + rich text + file storage adapter | 2026-06-27 |
| 20 | `features/forms`, `lib/forms` | Forms intake + public submission URL | 2026-06-27 |
| 21 | `features/rules`, `lib/rulesEngine.ts` | Rules & automations engine | 2026-06-27 |
| 22 | `features/status`, `features/messages`, `lib/statusUpdateActions.ts`, `lib/projectMessages.ts` | Status updates + project messages | 2026-06-27 |
| 23 | `features/goals`, `lib/goals` | Goals & OKRs with rollup | 2026-06-27 |
| 24 | `features/portfolios`, `lib/portfolios` | Portfolios with health rollup | 2026-06-27 |
| 25 | `features/workload`, `lib/workload` | Workload management + capacity | 2026-06-27 |
| 26 | `features/reporting`, `lib/reporting` | Reporting dashboards + chart builder | 2026-06-27 |
| 27/27b/27c | `features/templates`, `lib/templates` | Templates engine + 34 industry/transactions templates | 2026-06-27 |
| 28 | `features/ai`, `lib/ai` | Gemini AI assistant (proposal-based) | 2026-06-27 |
| 28b | `features/psa`, `lib/billing`, `lib/psa`, `lib/accounting`, `lib/ocr` | Full PSA layer (time/expenses/billing/invoicing/trust/reporting) | 2026-06-27 |
| 29 | `features/ui`, `hooks/useReducedMotion`, host semantic styles | Polish, mobile, accessibility + shell integration wiring | 2026-06-27 |
| 30 | `features/onboarding`, `lib/provisioning`, `lib/analytics`, `lib/evaluation` | Onboarding wizard, provisioning engine, analytics, evaluation tenants | 2026-06-27 |

## Permissions matrix (05)

| Action | Workspace admin | Member | Guest | Team admin | Team member |
|--------|-----------------|--------|-------|------------|-------------|
| Edit/delete workspace, manage members & roles | Yes | No | No | — | — |
| View billing / submit inquiries | Yes | View | View | — | — |
| Create team | Yes | Yes | Per membership | — | — |
| Edit team settings / manage team members | Yes | — | — | Yes | No |
| See secret team | Members only | If member | If member | If member | If member |
| Approve/reject private join requests | — | — | — | Team admin | No |

## Onboarding & first-run (30)

One **provisioning engine** (`lib/provisioning/provision.ts` → `provisionPlan`) powers authenticated new-tenant onboarding and the 7-vertical internal Evaluation suite (`/dashboard/project-management/w/{workspaceId}/internal/eval`, registered only when `NEXT_PUBLIC_INTERNAL_EVAL=true`). Customer trial behavior and trial analytics are removed; legacy browser keys are not deleted.

## Verification

- `npx tsc --noEmit` — clean across the module after every wave.
- `npm run lint:tasklytic` — the flat ESLint configuration checks the module and canonical routes.
- `npm run test:tasklytic` — Tasklytic frontend units pass.
- `npm run test:tasklytic:backend` — Tasklytic backend regression suite passes.
- `npm run check:openapi` — generated contracts are current.
- `npm run build` — production build compiles with TypeScript errors enforced.
