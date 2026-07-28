# Tasklytic — Design Log

Production-grade, multi-tenant work-management module built incrementally from build-plan docs `00`–`30`, integrated into the ByteReview Next.js app. Mounts at `/dashboard/tasklytic`, bridges ByteReview Firebase auth, and persists through a swappable repository adapter.

> Integration note: the build-plan docs target Vite + React Router. This module adapts every step to **Next.js App Router** + ByteReview's **shadcn/ui** while preserving the locked data model and adapter architecture. The standalone public marketing site from `01b §7` is intentionally **out of scope** (it conflicts with ByteReview's own marketing site/routing); all in-app aesthetics from `01b` are implemented.

## Tech stack

- Next.js App Router (client components), React + TypeScript (strict, no `any`)
- shadcn/ui primitives (`@/components/ui/*`), Tailwind CSS
- Zustand stores (one per entity domain), `@dnd-kit` for drag-and-drop, recharts via `@/components/ui/chart`
- Persistence via `RepositoryAdapter` (V1 = localStorage; production = REST/GraphQL)
- Warm, editorial Anthropic-inspired theme scoped under `.tasklytic-root` (`styles/tasklytic.css`)

## Design tokens (01 / 01b)

Warm cream backgrounds, terracotta primary, sage/amber/rust/dusty-blue semantics, Fraunces serif headings + Inter body + JetBrains Mono numerics. Full glow system (paper/glow shadows, aurora utilities, status-dot glows, focus ring). Warm dark mode (never pure black). All values in `styles/tasklytic.css`; `prefers-reduced-motion` honored via `hooks/useReducedMotion.ts`.

## Data model summary (02 — LOCKED, additive only)

Core: `User`, `Workspace`, `Team`, `Project`, `Section`, `Task` (multi-home, subtasks, dependencies, custom-field values), `CustomField` (8 types) + `CustomFieldValue`, `Comment`, `ActivityEvent`, `Attachment`, `Tag`, `Form`/`FormField`/`FormSubmission`, `Rule`/`RuleTrigger`/`RuleAction`, `Goal`, `Portfolio`, `StatusUpdate`, `Notification`, `SavedView`, `Chart`/`Dashboard`, `TaskTemplate`/`ProjectTemplate`.
Additive extensions added during rebuild: workspace invitations/plans, billing inquiries, team join requests, project messages, PSA entities (Client, Matter, BillingRate, RateCard, Timesheet, ExpenseReport, Payment, TrustTransaction), task effort, user capacity/time-off, my-tasks layout.

## Adapter seams (production swap-out points)

- **RepositoryAdapter** (`lib/repository`) — V1 localStorage (partitioned for eval tenants); production REST/GraphQL.
- **Authentication & user profiles** — delegated entirely to the host ByteReview platform (Firebase `useAuth`). Tasklytic owns no sign-in/up, password, OAuth, or profile-editing screens; the dashboard gates access and `TasklyticProvider` bridges the Firebase session into a linked Tasklytic `User`. Sign-out routes through ByteReview's `useAuth().signOut()`.
- **EmailAdapter** (`lib/email`) — V1 queues `PendingEmail`; production SES/SendGrid/Postmark/Resend.
- **RepositoryAdapter** (`lib/repository`) — selected by `NEXT_PUBLIC_TASKLYTIC_BACKEND=1`. Default: localStorage; backend mode persists all 37 entity kinds to Postgres (`tasklytic_entity_records`) via `/api/tasklytic/{entity}` REST routes with Firebase auth.
- **FileStorageAdapter** (`lib/fileStorage`) — selected by `NEXT_PUBLIC_FILE_STORAGE_ADAPTER=gcs`. Signed-URL uploads (100 MB cap) to the shared private GCS bucket via `/api/tasklytic/files:*`; metadata tracked in `tasklytic_file_uploads` for workspace-scoped access.
- **CloudDriveAdapter** (`lib/cloudDrive`) — V1 connect stub; production Drive/OneDrive/Dropbox OAuth.
- **AIAdapter** (`lib/ai`) — V1 in-browser Gemini key + deterministic local fallback; production server proxy.
- **AnalyticsAdapter** (`lib/analytics`) — V1 console; production Segment/Mixpanel/Amplitude/PostHog.
- **PaymentAdapter** (`lib/billing`, `lib/payment`) — V1 manual/inquiry; production Stripe/Adyen.
- **AccountingAdapter** (`lib/accounting`) — V1 JSON export; production QuickBooks/Xero/NetSuite.
- **OcrAdapter** (`lib/ocr`) — V1 manual entry; production Veryfi/Mindee/Textract.
- **SearchAdapter** — V1 in-memory inverted index (`lib/search`); production Elasticsearch/Typesense/Meilisearch.

## Feature log

| Step | Paths | Feature | Date |
|------|-------|---------|------|
| 01/01b/02 | `styles`, `types`, `lib/repository`, `stores`, `lib` | Foundation, warm design system, locked data model + repository + stores | 2026-06-27 |
| 03 | `TasklyticProvider.tsx`, `hooks/useCurrentUser.ts`, `hooks/usePresence.ts`, `hooks/useActivityHeartbeat.ts`, `features/profile/{AccountMenu,UserAvatar}` | Identity bridged from ByteReview Firebase; presence + activity heartbeat; account menu. (Tasklytic-owned auth pages, password rules, OAuth, trial mode, and profile editor removed — platform handles auth/profiles.) | 2026-06-27 |
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
| 29 | `features/ui`, `hooks/useReducedMotion`, `styles/tasklytic.css` | Polish, mobile, accessibility + shell integration wiring | 2026-06-27 |
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

One **provisioning engine** (`lib/provisioning/provision.ts` → `provisionPlan`) powers three flows: new-tenant onboarding (5-step wizard), browser-local Trial mode, and the 7-vertical internal Evaluation suite (`/dashboard/tasklytic/internal/eval`, gated by `NEXT_PUBLIC_INTERNAL_EVAL=true`). Analytics events fire on onboarding/trial/provisioning milestones.

## Verification

- `npx tsc --noEmit` — clean across the module after every wave.
- `npm run build` — production build compiles successfully; all 45+ Tasklytic routes emit.
