# 05 — Workspaces & Teams

**Goal:** Multi-tenant workspaces + teams. Real CRUD, real switching, member directory, and an invitation flow built on the `EmailAdapter` interface (V1 surfaces pending invites in-app; production sends real email via SES / SendGrid / Postmark / Resend).

---

## Prompt (paste into Google AI Studio Build)

Implement the full Workspaces and Teams experience for Tasklytic. Build on top of steps 01–04 without breaking anything. All new files go under `src/features/workspaces/` and `src/features/teams/`.

### Workspaces

**Create / edit / delete** flows
- "+ Create workspace" from the sidebar workspace switcher opens a multi-step dialog:
  1. Workspace name, optional domain (e.g. "acme.com" — informational only), icon (emoji picker — a small built-in palette of 32 common emojis, plus a search box).
  2. Optional: invite teammates by email — each email creates a `WorkspaceInvitation` record (extend types non-breakingly: `WorkspaceInvitation = { id, workspaceId, email, role, invitedById, status: 'pending' | 'accepted' | 'expired' | 'revoked', token, expiresAt, createdAt }`) and dispatches the invite through the `EmailAdapter` (defined here). The V1 email adapter implementation queues the email into a `pendingEmails` list visible at Settings → Pending Emails (so the entire flow is testable without an email server); production binds `VITE_EMAIL_ADAPTER=ses` (or `sendgrid` / `postmark` / `resend`) and delivers real email. Until an invite is accepted, the recipient appears in the Members tab as a "Pending" row.
- "Workspace settings" route at `/w/:workspaceId/settings/workspace` with tabs:
  - **General**: name, icon, domain, delete-workspace danger button (with confirm dialog typing the workspace name).
  - **Members**: searchable, filterable table — columns: Avatar+Name, Email, Role (Admin/Member/Guest as a select), Joined date, Actions (Remove). "Invite people" primary button at top opens a dialog.
  - **Billing**: shows the workspace's current plan and seat usage. The plan defaults to the Free tier (drawn from `Workspace.plan`, extend non-breakingly with `plan: { tier: 'free' | 'business' | 'enterprise', seatLimit: number, renewsAt?: ISODate }`). The page surfaces "Upgrade plan" and "Manage payment method" CTAs that route through the `PaymentAdapter` interface (V1: opens a contact-sales modal that creates a `BillingInquiry` record visible at Settings → Billing Inquiries; production: binds to Stripe / Adyen and renders the Stripe Checkout / Billing Portal links).

**Workspace switcher** in the sidebar (built in step 04) becomes a proper component:
- Lists each workspace the current user belongs to, current one checkmarked.
- Shows the active user's count of projects per workspace as a small pill.
- "Create workspace" at the bottom.

### Teams

**Team model**: per the type defined in step 02 — workspace-scoped, has its own member list and projects.

**Create / edit / delete**
- From the sidebar "Teams" section, a "+ New team" button opens a dialog (name, description, icon emoji, privacy).
- Privacy:
  - `public` — visible to all workspace members; anyone can join.
  - `private` — visible to all workspace members; must request to join (request creates a `TeamJoinRequest` notification for every team admin; approval/rejection is a real action with audit trail. Workspaces can opt into auto-approval via a workspace setting "Auto-approve private team join requests").
  - `secret` — invisible to non-members.
- Team page at `/w/:workspaceId/teams/:teamId` with tabs:
  - **Overview**: team description, member avatars stack with "+ Invite" button, a list of pinned projects (drag-and-drop reorder; persist in a `pinnedProjectIds: ID[]` field added non-breakingly to `Team`), and a recent activity feed (driven by `useActivityStore`; the store is populated as features generate events from step 06 onward).
  - **Projects**: a grid of project cards (`features/projects/ProjectCard.tsx`); render a minimal card variant here and replace with the full design when step 06 lands.
  - **Messages**: scaffolded route; full implementation in step 22.
  - **Calendar**: scaffolded route; full implementation in step 10.
  - **Settings**: name, description, icon, privacy, member management (add/remove, change role of "Team admin" / "Member" / "Guest").

### Member management UI (shared between Workspace settings and Team settings)

Component: `src/features/members/MemberTable.tsx`.
- Search input.
- Filter dropdowns: Role, Date joined.
- Bulk select with checkboxes; bulk actions (Remove, Change role).
- Empty state with an illustration (use an SVG you generate inline) and "Invite teammates" CTA.
- "Invite people" dialog accepts multiple emails (comma- or newline-separated), validates each, lets you pick a role, optionally a starting team, and a personal note. Submitting creates `WorkspaceInvitation` records for each address and dispatches them through the `EmailAdapter`. The dialog shows a per-recipient success/failure summary after submit.

### Routing additions
```
/w/:workspaceId/settings/workspace
/w/:workspaceId/teams                  (lists all teams; populates the scaffold from step 04)
/w/:workspaceId/teams/new              (modal-route to create)
/w/:workspaceId/teams/:teamId          (tabs as above)
/w/:workspaceId/teams/:teamId/settings
```

### State and storage
- Add helper hooks: `useWorkspace(workspaceId)`, `useTeam(teamId)`, `useCurrentWorkspace()` (uses URL param).
- All mutations go through the zustand stores from step 02, which route persistence through the `RepositoryAdapter`.

### Permissions (lightweight)
- Workspace admins can edit/delete workspace and manage all members.
- Team admins can edit team and manage team members.
- Non-admins see read-only versions (buttons disabled with tooltip "Only admins can edit").
- Guests can only see what they're explicitly a member of.
Refine `src/lib/permissions.ts` with `isWorkspaceAdmin(user, ws)`, `isTeamAdmin(user, team)`, `canManageMembers(user, scope)`.

### Visual details
- Workspace icon: 24px rounded-md tile with the chosen emoji, colored background derived from workspace name hash (use a 6-color palette).
- Team icon: same but 20px.
- Member avatar groups: max 4 visible avatars + "+N more" pill. Use the Avatar primitive from step 03.

### Success criteria
- A user can create a workspace, switch into it, create a team, invite members (with the invitation flowing through the `EmailAdapter`), change their roles, and remove them.
- Privacy levels behave: secret teams don't appear in the sidebar for non-members; private team join requests create real notifications for team admins.
- The `EmailAdapter` interface is exported from `src/lib/email/types.ts`; the V1 adapter (`localAdapter.ts`) queues pending emails into a workspace-scoped `pendingEmails` list visible at Settings → Pending Emails; the `getEmailAdapter()` accessor pattern matches the repository and auth adapters.
- The Billing tab renders the workspace's plan, surfaces upgrade CTAs through the `PaymentAdapter`, and captures `BillingInquiry` records in the V1 path.
- All persistence flows through the `RepositoryAdapter` from step 02.
- `Design.md` gains row `05 | src/features/workspaces, src/features/teams, src/features/members, src/lib/email | Workspaces, teams, member directory, email adapter | <today>` and a section **"Permissions matrix"** listing who can do what.

Do not implement projects beyond stubs — projects come fully in step 06. Keep one feature per file, ≤ 200 lines each, add docstrings.
