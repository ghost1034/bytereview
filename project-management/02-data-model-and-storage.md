# 02 — Data Model & Storage Layer

**Goal:** Define every entity type the app will ever need and implement a unified persistence layer. This file's shapes are the contract for every later step.

---

## Prompt (paste into Google AI Studio Build)

Extend Tasklytic with the complete data model and a persistence layer. **All entity shapes defined here are FINAL** — future prompts may add fields additively, but never rename or remove. Do not break anything from step 01; the design system stays exactly as it is.

### Where things go
- All shared types → `src/types/index.ts` (re-export per domain from `src/types/<domain>.ts`).
- The persistence layer → `src/lib/storage.ts`.
- A root `useHydrate()` hook + Zustand stores → `src/stores/` (one store file per domain, e.g. `workspaces.ts`, `projects.ts`, `tasks.ts`, `users.ts`).
- Do not wire any UI to the data yet — just plumbing.

### Entities (TypeScript)

```ts
// Generic
export type ID = string;            // generate with crypto.randomUUID()
export type ISODate = string;       // 'YYYY-MM-DD'
export type ISODateTime = string;   // ISO 8601

// User
export type User = {
  id: ID;
  name: string;
  email: string;
  avatarColor: string;              // deterministic from id
  role: 'admin' | 'member' | 'guest';
  jobTitle?: string;
  timezone?: string;
  createdAt: ISODateTime;
};

// Workspace + Team
export type Workspace = {
  id: ID;
  name: string;
  domain?: string;
  iconEmoji?: string;
  memberIds: ID[];
  adminIds: ID[];
  createdAt: ISODateTime;
};

export type Team = {
  id: ID;
  workspaceId: ID;
  name: string;
  description?: string;
  iconEmoji?: string;
  memberIds: ID[];
  privacy: 'public' | 'private' | 'secret';
};

// Project
export type ProjectView = 'list' | 'board' | 'calendar' | 'timeline' | 'gantt';
export type ProjectStatus = 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'complete' | null;

export type Project = {
  id: ID;
  workspaceId: ID;
  teamId: ID;
  name: string;
  description?: string;            // rich HTML
  iconEmoji?: string;
  color: string;                   // one of the brand palette tokens
  privacy: 'public_to_team' | 'private_to_members' | 'public_to_workspace';
  memberIds: ID[];
  ownerId: ID;
  defaultView: ProjectView;
  enabledViews: ProjectView[];
  status: ProjectStatus;
  startOn?: ISODate;
  dueOn?: ISODate;
  archived: boolean;
  isTemplate: boolean;
  customFieldIds: ID[];            // CustomField ids enabled on this project
  sectionIds: ID[];                // ordered
  createdAt: ISODateTime;
  modifiedAt: ISODateTime;
};

export type Section = {
  id: ID;
  projectId: ID;
  name: string;
  order: number;
  collapsed: boolean;
};

// Task — the heart of the app
export type TaskSubtype = 'default_task' | 'milestone' | 'approval';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

export type Task = {
  id: ID;
  workspaceId: ID;
  name: string;
  notes?: string;                  // rich HTML
  resourceSubtype: TaskSubtype;
  completed: boolean;
  completedAt?: ISODateTime;
  completedById?: ID;
  approvalStatus?: ApprovalStatus;
  assigneeId?: ID;
  collaboratorIds: ID[];           // a.k.a. followers
  startOn?: ISODate;
  dueOn?: ISODate;
  dueAt?: ISODateTime;             // optional time component
  parentId?: ID;                   // subtask parent (a Task)
  projectIds: ID[];                // multi-homing — a task can be in 0..N projects
  sectionIdByProject: Record<ID, ID | undefined>;  // map projectId -> sectionId
  tagIds: ID[];
  customFieldValues: Record<ID, CustomFieldValue>; // keyed by customFieldId
  dependencyIds: ID[];             // tasks this depends on (blocked by)
  dependentIds: ID[];              // tasks that depend on this
  attachmentIds: ID[];
  likedByIds: ID[];
  createdAt: ISODateTime;
  modifiedAt: ISODateTime;
};

// Custom fields
export type CustomFieldType =
  | 'text' | 'number' | 'date' | 'people'
  | 'dropdown' | 'multi_select'
  | 'formula' | 'checkbox';

export type EnumOption = { id: ID; label: string; color: string };

export type CustomField = {
  id: ID;
  workspaceId: ID;
  name: string;
  type: CustomFieldType;
  description?: string;
  isGlobal: boolean;               // true => library; false => local to one project
  options?: EnumOption[];          // for dropdown/multi_select
  numberFormat?: 'plain' | 'percent' | 'currency';
  currencySymbol?: string;
  notify: boolean;                 // notify task collaborators on change (dropdowns only)
  createdBy: ID;
  createdAt: ISODateTime;
};

export type CustomFieldValue =
  | { type: 'text'; value: string }
  | { type: 'number'; value: number | null }
  | { type: 'date'; value: ISODate | null }
  | { type: 'people'; value: ID[] }
  | { type: 'dropdown'; value: ID | null }
  | { type: 'multi_select'; value: ID[] }
  | { type: 'formula'; value: number | string | null }
  | { type: 'checkbox'; value: boolean };

// Comments / activity
export type Comment = {
  id: ID;
  taskId: ID;
  authorId: ID;
  bodyHtml: string;
  mentionedUserIds: ID[];
  attachmentIds: ID[];
  reactions: Record<string, ID[]>; // emoji -> user ids
  isPinned: boolean;
  createdAt: ISODateTime;
  editedAt?: ISODateTime;
};

export type ActivityEvent = {
  id: ID;
  taskId?: ID;
  projectId?: ID;
  actorId: ID;
  type:
    | 'task_created' | 'task_completed' | 'task_assigned' | 'task_unassigned'
    | 'due_date_changed' | 'project_added' | 'project_removed'
    | 'subtask_added' | 'dependency_added' | 'comment_added'
    | 'custom_field_changed' | 'attachment_added' | 'status_update_posted';
  details: Record<string, unknown>;
  createdAt: ISODateTime;
};

// Attachments + Tags
export type Attachment = {
  id: ID;
  name: string;
  size: number;
  mime: string;
  dataUrl?: string;                // V1 client-side storage: inline data URL (capped at 5 MB)
  storageRef?: string;             // production: signed-URL reference into S3/GCS/Azure Blob via FileStorageAdapter
  storage: 'local' | 'object_store' | 'cloud_drive'; // routing key for the FileStorageAdapter
  uploadedBy: ID;
  taskId?: ID;
  commentId?: ID;
  createdAt: ISODateTime;
};

export type Tag = {
  id: ID;
  workspaceId: ID;
  name: string;
  color: string;
};

// Forms
export type FormField =
  | { id: ID; type: 'short_text'; label: string; required: boolean; placeholder?: string }
  | { id: ID; type: 'long_text'; label: string; required: boolean; placeholder?: string }
  | { id: ID; type: 'number'; label: string; required: boolean }
  | { id: ID; type: 'date'; label: string; required: boolean }
  | { id: ID; type: 'dropdown'; label: string; required: boolean; options: EnumOption[] }
  | { id: ID; type: 'multi_select'; label: string; required: boolean; options: EnumOption[] }
  | { id: ID; type: 'attachment'; label: string; required: boolean };

export type Form = {
  id: ID;
  projectId: ID;
  name: string;
  description?: string;
  fields: FormField[];
  defaultAssigneeId?: ID;
  defaultSectionId?: ID;
  taskTitleFieldId?: ID;            // map a form field as the task title
  copyAnswersToDescription: boolean;
  isPublic: boolean;
  publicSlug?: string;              // /forms/<slug>
  confirmationMessage: string;
  branding?: { coverImageDataUrl?: string; logoDataUrl?: string };
  createdAt: ISODateTime;
};

export type FormSubmission = {
  id: ID;
  formId: ID;
  answers: Record<ID, unknown>;
  submittedBy?: ID;
  taskId?: ID;
  createdAt: ISODateTime;
};

// Rules / automations
export type RuleTrigger =
  | { type: 'task_added_to_project' }
  | { type: 'task_moved_to_section'; sectionId: ID }
  | { type: 'task_completed' }
  | { type: 'task_due_in_days'; days: number }
  | { type: 'custom_field_changed'; customFieldId: ID; toValue?: unknown }
  | { type: 'form_submitted'; formId: ID };

export type RuleAction =
  | { type: 'assign_to'; userId: ID }
  | { type: 'set_due_in_days'; days: number }
  | { type: 'move_to_section'; sectionId: ID }
  | { type: 'add_to_project'; projectId: ID }
  | { type: 'set_custom_field'; customFieldId: ID; value: unknown }
  | { type: 'add_collaborator'; userId: ID }
  | { type: 'send_notification'; userId: ID; message: string }
  | { type: 'create_subtask'; templateName: string };

export type Rule = {
  id: ID;
  projectId: ID;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  conditions: Array<{ field: string; op: 'eq' | 'neq' | 'gt' | 'lt' | 'in'; value: unknown }>;
  actions: RuleAction[];
  runCount: number;
  lastRunAt?: ISODateTime;
  createdBy: ID;
  createdAt: ISODateTime;
};

// Goals, Portfolios, Status Updates
export type Goal = {
  id: ID;
  workspaceId: ID;
  name: string;
  description?: string;
  ownerId: ID;
  parentGoalId?: ID;
  timeFrame: { start: ISODate; end: ISODate };
  metric:
    | { type: 'percent'; current: number; target: 100 }
    | { type: 'numeric'; current: number; target: number; unit?: string }
    | { type: 'currency'; current: number; target: number; symbol: string }
    | { type: 'manual'; status: 'on_track' | 'at_risk' | 'off_track' };
  status: 'on_track' | 'at_risk' | 'off_track' | 'achieved' | 'missed' | 'dropped';
  supportingProjectIds: ID[];
  supportingGoalIds: ID[];
  privacy: 'public' | 'members_only';
  createdAt: ISODateTime;
};

export type Portfolio = {
  id: ID;
  workspaceId: ID;
  name: string;
  description?: string;
  ownerId: ID;
  projectIds: ID[];
  goalIds: ID[];
  customFieldIds: ID[];
  status: ProjectStatus;
  createdAt: ISODateTime;
};

export type StatusUpdate = {
  id: ID;
  scope: { type: 'project' | 'portfolio' | 'goal'; id: ID };
  authorId: ID;
  status: 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'complete';
  title: string;
  summaryHtml: string;
  highlightsHtml?: string;
  blockersHtml?: string;
  nextStepsHtml?: string;
  createdAt: ISODateTime;
};

// Notifications / Inbox
export type Notification = {
  id: ID;
  userId: ID;                       // recipient
  actorId?: ID;
  type:
    | 'mention' | 'assigned' | 'due_soon' | 'comment_on_task'
    | 'status_update' | 'rule_action' | 'form_submission' | 'approval_request';
  scope: { type: 'task' | 'project' | 'portfolio' | 'goal' | 'form'; id: ID };
  message: string;
  unread: boolean;
  archived: boolean;
  snoozedUntil?: ISODateTime;
  createdAt: ISODateTime;
};

// Saved view
export type SavedView = {
  id: ID;
  ownerScope: { type: 'project' | 'portfolio'; id: ID };
  name: string;
  viewType: ProjectView;
  filters: Array<{ field: string; op: string; value: unknown }>;
  groupBy?: string;
  sortBy?: { field: string; direction: 'asc' | 'desc' };
  hiddenFields: string[];
  createdBy: ID;
};

// Dashboard / chart
export type ChartType = 'bar' | 'column' | 'line' | 'donut' | 'lollipop' | 'number' | 'burnup';

export type Chart = {
  id: ID;
  title: string;
  type: ChartType;
  source: 'tasks' | 'projects' | 'portfolios' | 'goals';
  filters: SavedView['filters'];
  xAxis?: string;
  yAxis?: string;
  measure: 'count' | 'sum' | 'avg';
  measureField?: string;
};

export type Dashboard = {
  id: ID;
  workspaceId: ID;
  name: string;
  ownerId: ID;
  charts: Chart[];
  layout: Array<{ chartId: ID; x: number; y: number; w: number; h: number }>;
  sharedWith: ID[];
  createdAt: ISODateTime;
};

// Templates
export type TaskTemplate = {
  id: ID;
  name: string;
  defaults: Partial<Task>;
  subtaskTemplates: TaskTemplate[];
};
export type ProjectTemplate = {
  id: ID;
  name: string;
  description?: string;
  defaults: Partial<Project>;
  sectionNames: string[];
  taskTemplates: TaskTemplate[];
  customFieldIds: ID[];
};
```

### Repository adapter pattern (`src/lib/repository/`)

All persistence in Tasklytic goes through a single **`RepositoryAdapter`** interface. This is the most important architectural seam in the platform. Application code never reads or writes storage directly — it talks to the adapter. The V1 adapter is backed by `localStorage`; production binds the same interface to a real backend (REST / GraphQL / tRPC over Postgres) without changing any feature code.

```ts
// src/lib/repository/types.ts
export type EntityKind =
  | 'workspaces' | 'teams' | 'users' | 'projects' | 'sections' | 'tasks'
  | 'customFields' | 'comments' | 'activity' | 'attachments' | 'tags'
  | 'forms' | 'formSubmissions' | 'rules' | 'goals' | 'portfolios'
  | 'statusUpdates' | 'notifications' | 'savedViews' | 'dashboards' | 'templates';

export interface RepositoryAdapter {
  loadAll<T>(entity: EntityKind): Promise<T[]>;
  saveAll<T>(entity: EntityKind, items: T[]): Promise<void>;
  upsertOne<T>(entity: EntityKind, item: T): Promise<void>;
  removeOne(entity: EntityKind, id: ID): Promise<void>;
  clearAll(): Promise<void>;
  subscribe(entity: EntityKind, cb: (items: unknown[]) => void): () => void;
  readonly schemaVersion: number;
  migrateIfNeeded(): Promise<void>;
}
```

Implement the V1 adapter in `src/lib/repository/localAdapter.ts`:
- Persists each entity collection under `localStorage` namespace `tasklytic:v1:<entity>`.
- Serializes with `JSON.stringify` / `JSON.parse`.
- Holds a `SCHEMA_VERSION = 1` constant. On version mismatch, runs migrations (initially a clean wipe; later versions add proper migration functions).
- Implements `subscribe` via a simple event emitter so Zustand stores can react to cross-tab writes.
- Exposes `provision(plan)` as a no-op hook here — the onboarding pipeline in step 30 calls it through the adapter so the same provisioning engine works against any future backend adapter.

Export a single `getRepository(): RepositoryAdapter` accessor from `src/lib/repository/index.ts` that returns the configured adapter (V1 returns the local adapter; production reads `VITE_REPOSITORY_ADAPTER=backend` and returns the REST/GraphQL adapter).

**Production swap-out:** add `src/lib/repository/backendAdapter.ts` that implements the same interface against a real API (`/api/v1/{entity}` REST endpoints, JWT-authenticated, optimistic mutations, WebSocket subscription for `subscribe`). No feature code changes.

### Zustand stores (`src/stores/`)

Create one store per top-level entity collection:
- `useWorkspacesStore`, `useTeamsStore`, `useUsersStore`, `useProjectsStore`, `useSectionsStore`, `useTasksStore`, `useCustomFieldsStore`, `useCommentsStore`, `useActivityStore`, `useAttachmentsStore`, `useTagsStore`, `useFormsStore`, `useFormSubmissionsStore`, `useRulesStore`, `useGoalsStore`, `usePortfoliosStore`, `useStatusUpdatesStore`, `useNotificationsStore`, `useSavedViewsStore`, `useDashboardsStore`, `useTemplatesStore`.

Each store exposes:
- `items: Record<ID, Entity>`
- `add(item)`, `update(id, patch)`, `remove(id)`, `bulkSet(items)`, `getById(id)`
- All mutations route through `getRepository()` so persistence is adapter-agnostic.

Add a single `useHydrate()` hook (in `src/stores/hydrate.ts`) that loads every collection from the repository adapter on app boot and is called once in `main.tsx`.

### Cross-cutting helpers (`src/lib/`)
- `ids.ts` — `newId()` using `crypto.randomUUID()`.
- `time.ts` — `now()`, `formatRelative(date)`, `formatDate(date)`, `daysBetween(a,b)`.
- `colors.ts` — `colorForUser(id)` deterministic from id (use a small palette of 10 pleasant colors).
- `permissions.ts` — `canEdit(user, resource)` initial implementation returns true for workspace members; refined per-feature in later steps (step 05 adds role-based checks, step 06 adds project-level privacy, etc.).

### Success criteria
- App still boots cleanly.
- The repository is empty for a fresh tenant until the onboarding pipeline (step 30) provisions content or the user creates their first workspace.
- The `RepositoryAdapter` interface is the only path through which any feature code reads or writes persisted data — no direct `localStorage` reads anywhere outside `src/lib/repository/`.
- `Design.md` gets a new feature-log row: `02 | src/types, src/stores, src/lib/repository | Data model & repository adapter | <today>`.
- In `Design.md` also append two sections: **"Data model summary"** listing each entity with a one-line description, and **"Adapter seams"** noting the `RepositoryAdapter` interface and the production swap-out plan.

Do not implement any UI flows yet. Do not break step 01. Build only what is described.
