# Tasklytic — Production Build Plan

A complete, ordered set of prompts to build **Tasklytic** — a production-grade, multi-tenant work management platform that competes head-to-head with Asana, Monday, ClickUp, and the like — in Google AI Studio's **Build mode**. Each `.md` file is a self-contained prompt — open `aistudio.google.com → Build`, paste the contents of the next file into the chat box, hit Enter, wait for the live preview to refresh, then move on to the next.

This directory preserves the original numbered build specifications. The authoritative implementation and supersession status is maintained in `plans/TASKLYTIC-TRACEABILITY.md`; CPAAutomation authentication, backend persistence, canonical routes, and supported-integration boundaries take precedence over historical standalone/Vite assumptions.

---

## How to use this kit

1. Go to https://aistudio.google.com and click **Build** in the left sidebar.
2. Click **"Create new app"** (or just paste into a blank chat — Build mode treats your first prompt as the scaffolding instruction).
3. **Drop files in order, one at a time.** Wait for the Antigravity agent to finish generating before sending the next file.
4. After each file, glance at the right-hand live preview to make sure nothing regressed. If a prompt produces something off, send a short follow-up like *"keep file split as instructed and re-do step X"* before moving on.
5. Periodically **download the project as ZIP** (top-right) so you have rollback checkpoints — Build mode does not auto-version.

> Tip: Files 01, 01b, and 02 are the most important. They lock in the design system, the visual identity, and the data model. If they look right, everything that follows compounds well.

---

## Build order (drop these in sequence)

### Phase 1 — Foundation
| # | File | What it builds |
|---|------|----------------|
| 01 | `01-foundation-and-design-system.md` | Tech stack, design tokens, color palette, typography, folder layout, `Design.md` |
| 01b | `01b-aesthetics-anthropic-design.md` | **Aesthetic upgrade** — replaces the generic SaaS look with an Anthropic-inspired warm/editorial design (cream backgrounds, terracotta accents, Fraunces serif headlines), adds a glow effect system, refines motion, **and builds a full public marketing site** (Home, Features, Solutions, Pricing, Customers, About, Changelog, Blog, Security, Legal). Drop right after 01 for cleanest result, or any time later for a full re-skin pass. |
| 02 | `02-data-model-and-storage.md` | All TypeScript entity types, repository adapter pattern, V1 client-side persistence layer with clear backend swap-out points |
| 03 | `03-authentication-and-user-profiles.md` | Sign-in / sign-up / profile, auth adapter pattern (V1 client-side, swappable to OAuth / SSO / passwordless) |
| 04 | `04-app-shell-sidebar-navigation.md` | Main two-column app shell, collapsible sidebar, top bar, command-K |
| 05 | `05-workspaces-and-teams.md` | Workspace switcher, teams, member directory, invitation flow (email-delivery adapter) |

### Phase 2 — Projects & Tasks (the core)
| # | File | What it builds |
|---|------|----------------|
| 06 | `06-projects-crud-and-overview.md` | Create/edit/archive projects, project Overview tab, project icons/colors |
| 07 | `07-tasks-core-and-detail-pane.md` | Task object + full right-side detail pane with all fields |
| 08 | `08-list-view.md` | The default List view (spreadsheet-style grid) |
| 09 | `09-board-kanban-view.md` | Kanban board with drag-and-drop columns |
| 10 | `10-calendar-view.md` | Month/week calendar view |
| 11 | `11-timeline-gantt-view-and-dependencies.md` | Timeline/Gantt with drag-to-resize and dependency arrows |
| 12 | `12-subtasks-and-task-hierarchy.md` | Multi-level subtasks (up to 5 levels) |
| 13 | `13-sections-grouping-sorting-filtering.md` | Sections + group/sort/filter on every view |
| 14 | `14-custom-fields.md` | Local + global custom fields (text, number, date, dropdown, multi-select, people, formula) |
| 15 | `15-search-and-saved-views.md` | Global search, Quick find, saved/multiple views per project |

### Phase 3 — Personal Workflow
| # | File | What it builds |
|---|------|----------------|
| 16 | `16-my-tasks.md` | Personal "My Tasks" hub with Today / Upcoming / Later sections |
| 17 | `17-inbox-and-notifications.md` | Notification inbox with archive/snooze/filter |
| 18 | `18-comments-mentions-and-activity-feed.md` | Threaded comments, @mentions, activity timeline |
| 19 | `19-attachments-and-rich-text-descriptions.md` | Attachments (file-storage adapter — V1 local data URLs, swappable to S3/GCS/Azure Blob), rich text editor for task notes, integration surfaces for Drive / OneDrive / Dropbox |

### Phase 4 — Workflow Automation
| # | File | What it builds |
|---|------|----------------|
| 20 | `20-forms-intake.md` | Form builder + public submission URL → auto-create tasks |
| 21 | `21-rules-and-automations.md` | Visual rule builder (triggers + conditions + actions); email-delivery adapter wires here |
| 22 | `22-status-updates-and-project-messages.md` | Weekly project status updates, project messages tab |

### Phase 5 — Strategy & Reporting
| # | File | What it builds |
|---|------|----------------|
| 23 | `23-goals-and-okrs.md` | Company → team → individual Goals with progress rollup |
| 24 | `24-portfolios.md` | Portfolio of projects with health indicators |
| 25 | `25-workload-management.md` | Workload view showing per-person capacity across projects |
| 26 | `26-reporting-dashboards.md` | Universal Reporting with chart builder (bar, line, donut, number, lollipop), scheduled digest delivery |

### Phase 6 — Productivity Boosters
| # | File | What it builds |
|---|------|----------------|
| 27 | `27-templates-and-bundles.md` | Project templates **engine**, task templates, bundles |
| 27b | `27b-industry-templates-library.md` | 25 detailed industry templates (Business, Accounting/CPA, Law, Finance, Procurement, HR) — drops in right after 27 |
| 27c | `27c-transactions-templates.md` | 2 heavy corporate-transactions templates (Buy-side Acquisition end-to-end with PMI child, and Spin-off/Divestiture/Carve-out with TSA child) |
| 28 | `28-ai-assistant-gemini.md` | "Smart" sidebar powered by Gemini for summaries, status drafts, smart fields; AI adapter pattern |
| 28b | `28b-time-tracking-and-expenses.md` | Full PSA layer: time tracking (timer + manual), expense tracking (with receipts, pass-through, mileage), billing rates with cascade resolution, clients, matters, timesheets, expense reports, approvals, invoicing + payments + trust accounting, plus WIP / Realization / Utilization / Effective Rate / AR Aging reporting. Retrofits the CPA & law templates from 27b. Integration surfaces for QuickBooks / Xero / NetSuite. |

### Phase 7 — Launch Polish & Onboarding
| # | File | What it builds |
|---|------|----------------|
| 29 | `29-polish-mobile-and-accessibility.md` | Empty states, loading states, animations, mobile responsive, WCAG AA accessibility |
| 30 | `30-onboarding-and-starter-content.md` | Authenticated new-tenant onboarding, internal Evaluation tenant suite (7 verticals), provisioning engine, analytics adapter, product tour. Customer trial mode is superseded. |

---

## Production architecture — adapter seams

Every external integration in Tasklytic is structured as a **swappable adapter** with a V1 in-app implementation suitable for the local build, and a clearly marked production swap-out point. The V1 adapters let the Antigravity agent ship the full surface area of the platform inside a browser-only Build mode environment; production binds the same interfaces to real backend services. **No business logic depends on any V1 adapter** — the application code only talks to the interfaces.

| Concern | V1 adapter (this kit) | Production swap-out |
|---|---|---|
| Persistence | `localStorage`-backed repository (step 02) | REST / GraphQL / tRPC backend with Postgres, Redis cache; same `RepositoryAdapter` interface |
| Auth | Client-side credential store with deterministic password hashing (step 03) | OAuth2 (Google, Microsoft, Okta), SAML SSO, passwordless magic links via Auth0 / Clerk / WorkOS / your own service |
| Email delivery (invites, digests, notifications, password recovery) | Pending-invite queue surfaced in the UI (steps 05, 17, 21) | SES / SendGrid / Postmark / Resend bound through the `EmailAdapter` interface |
| File storage (attachments, receipts) | Data URLs capped at 5 MB (step 19, 28b) | S3 / GCS / Azure Blob with signed upload URLs through the `FileStorageAdapter` interface |
| Cloud-drive integrations (Drive, OneDrive, Dropbox) | OAuth surface ready (step 19) | Real OAuth handshake + provider SDK adapters |
| AI | Gemini in-browser key (step 28) | Server-side Gemini / Claude / OpenAI / Bedrock proxy with key rotation and rate limits |
| Analytics | Console-logging adapter (step 30) | Segment / Mixpanel / Amplitude / PostHog through the `AnalyticsAdapter` interface |
| Real-time collaboration | Local Zustand store with optimistic mutations | WebSocket / Liveblocks / Yjs / Replicache on top of the same store |
| Accounting integrations (QuickBooks, Xero, NetSuite) | Invoice JSON export (step 28b) | Provider SDKs through the `AccountingAdapter` interface |
| OCR (receipt scanning) | Manual entry surface (step 28b) | Veryfi / Mindee / Textract through the `OcrAdapter` interface |
| Payments | Manual payment recording (step 28b) | Stripe / Adyen for invoice payment links through the `PaymentAdapter` interface |
| Search | In-memory inverted index (step 15) | Elasticsearch / Typesense / Meilisearch through the `SearchAdapter` interface |

Each step that introduces an adapter documents the V1 behavior, the interface, and the swap-out instructions inside the relevant `.md` file. Together they describe a coherent, production-grade architecture — not a one-off browser app.

---

## Conventions every prompt enforces

- **File splitting:** one feature per file/component, never a monolith.
- **TypeScript-first:** React + TypeScript + Tailwind by default (AI Studio's strongest path).
- **Design system stays locked:** colors, spacing, radius, fonts defined in files 01 + 01b and never re-themed.
- **Data model stays locked:** entity shapes defined in file 02 and only **additively** extended.
- **Adapters, not hardcoded integrations:** every external dependency goes through the adapter interfaces table above.
- **`Design.md` at repo root:** the AI updates it after each new feature so you can audit progress.
- **No regressions:** every prompt ends with "do not break anything from previous steps."

---

## If something goes sideways

| Symptom | Fix prompt |
|---------|-----------|
| AI rewrote the design system | "Revert all design-token changes. The palette and typography from `01-foundation-and-design-system.md` and `01b-aesthetics-anthropic-design.md` are final." |
| Lost a previous feature | "Re-read `Design.md`. The X feature from step Y is missing — restore it without touching unrelated files." |
| Files got merged into one | "Split [Feature] into its own file/component as originally instructed. Do not inline." |
| Visual regression | "The [view] looked correct two prompts ago. Roll its styling back to match the design system." |
| Adapter got bypassed | "Code is reading/writing storage / files / analytics directly. Route it through the adapter interface defined in step 02 / 19 / 30." |

---

## What you'll have at the end

A launch-ready, multi-tenant work management platform with an editorial Anthropic-inspired aesthetic and a complete public marketing site, featuring:

- Multi-workspace tenancy with teams, members, invitations, and role-based access
- Projects, tasks, subtasks (5 levels deep), dependencies, custom fields (text, number, date, dropdown, multi-select, people, formula)
- 5 project views (List, Board, Calendar, Timeline, Gantt) with shared filter/sort/group and saved views
- My Tasks, Inbox, threaded Comments, @mentions, attachments, rich-text descriptions
- Forms with public intake URLs, visual Rules engine for automations, weekly project status updates, project messages
- Goals (company → team → individual OKRs), Portfolios with rollups, Workload management, Universal Reporting dashboards
- Templates engine + a **27-template industry library** spanning General Business, Accounting/CPA, Law, Finance, Procurement, HR, and **Corporate Transactions** (M&A buy-side end-to-end + Spin-off / Divestiture with TSA child project)
- **Full PSA layer**: time tracking (timer + manual + UTBMS activity codes), expense tracking (receipts, pass-through, mileage, reimbursements), billing rates with cascade resolution, clients, matters, timesheets, approvals, invoicing, payments, trust accounting, and PSA reporting (WIP, Realization, Utilization, Effective Rate, AR Aging)
- Gemini-powered AI assistant with proposal-based actions
- Production new-tenant onboarding (5-step wizard and industry-aware template recommendations) plus a separately gated internal Evaluation tenant suite (7 verticals) for Sales / CS / Support. Customer trial behavior is intentionally removed.
- Full public marketing site (Home, Features, Solutions, Pricing, Customers, About, Changelog, Blog, Security, Legal) with SEO-ready editorial layouts
- Mobile-responsive, WCAG AA accessible, dark mode (warm)
- Every external dependency structured as a swappable adapter with a clear production swap-out point

Built incrementally, one drop at a time. Launch when ready.
