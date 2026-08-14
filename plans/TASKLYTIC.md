# Tasklytic Design Unification Plan

## Summary

Redesign every authenticated Tasklytic workflow to use CPAAutomation’s shared dashboard shell, IBM Plex typography, semantic color tokens, and UI primitives. Preserve Tasklytic’s compact work-management density and specialized workspace navigation. Public intake forms remain client-focused and visually isolated from the authenticated redesign.

No backend, database, or OpenAPI changes are required.

## Implementation Changes

### 1. Establish the shared design foundation

- Replace Tasklytic’s cream/terracotta/Fraunces theme with CPAAutomation tokens such as `background`, `surface`, `card`, `foreground`, `primary`, `border`, and semantic status colors.
- Remove authenticated uses of private theme state, `tasklytic:theme`, auroras, glows, paper shadows, and inline legacy color variables.
- Preserve dense dimensions: 36px rows and primary actions, 32–36px compact controls, and space-efficient boards, tables, timelines, and toolbars.
- Add Tasklytic to the semantic-color ESLint scope and introduce a static check preventing new legacy tokens, raw palette classes, or Tasklytic portal-surface workarounds.
- Move the existing public-form visual tokens into a separately scoped `.tasklytic-public-root` stylesheet so public forms do not block authenticated cleanup.

### 2. Integrate Tasklytic with the CPAAutomation shell

- Remove the project-management immersive-shell exception in `components/layout/dashboard-shell.tsx`; retain the global CPAAutomation sidebar, top bar, account menu, and support entry.
- Treat Tasklytic as an edge-to-edge wide route: the dashboard shell supplies no content padding, and the module owns its compact inner spacing without creating nested viewport scrolling.
- Refactor `project-management/TasklyticChrome.tsx` into a workspace shell containing only:
  - The resizable/collapsible Tasklytic workspace and project navigator.
  - A mobile-only module bar and secondary-navigation drawer.
  - Tasklytic dialogs, timer banner, AI panel, shortcuts, and creation flows.
- Remove Tasklytic’s duplicate top bar, logo, account/sign-out controls, and independent theme toggle.
- Keep the local navigator at 240px by default, collapsible to 56px on desktop, and drawer-based below the existing `lg` breakpoint.

### 3. Add a reusable module-chrome interface

Introduce a dashboard module registration hook with this internal contract:

```ts
type DashboardModuleChrome = {
  breadcrumbs?: Array<{ label: string; href?: string }>
  openCommandPalette?: () => void
  actions?: React.ReactNode
}
```

- Tasklytic registers its store-backed breadcrumbs and command palette while mounted and cleans them up when leaving the route.
- The shared top-bar search and `⌘K` open Tasklytic’s richer workspace search on Tasklytic routes and the existing global palette elsewhere.
- The Tasklytic palette retains project, task, goal, people, page, and creation results; remove duplicate theme and sign-out actions and add a compact CPAAutomation destinations group.
- Render Tasklytic’s Create, running-timer, and inbox controls in the shared top-bar action slot. Move tour/setup/shortcut utilities to the Tasklytic sidebar footer.
- On mobile, keep the global sidebar trigger in the shared top bar and provide a clearly labeled Tasklytic-navigation trigger in the module bar.

### 4. Convert authenticated surfaces in gated waves

Each wave converts complete feature families so no individual workflow is half-restyled:

1. **Shell and primitives:** navigation, module chrome, buttons, inputs, menus, dialogs, popovers, tabs, badges, cards, empty/error/loading states, page headers, toolbars, and task-detail surfaces.
2. **Core work management:** home, projects, tasks, list/board/calendar/timeline/Gantt views, files, inbox, search, comments, and attachments.
3. **Planning and administration:** portfolios, goals, workload, reporting, rules, templates, authenticated form builder/submissions, teams, members, settings, onboarding, and AI.
4. **Professional services:** time tracking, timesheets, expenses, clients, matters/engagements, invoicing, trust accounting, and reports.
5. **Cleanup:** delete unused Tasklytic theme, logo, top-bar, portal-wrapper, and legacy style code; update `project-management/Design.md` to designate the CPAAutomation design system as authoritative.

Use shared CPAAutomation primitives directly where possible. Keep thin Tasklytic wrappers only for compact density or domain-specific behavior, not for independent colors, typography, or portal styling.

## Test Plan

- Add unit coverage for module-chrome registration and cleanup, dynamic breadcrumbs, route-aware `⌘K`, action-slot behavior, sidebar persistence, and public/authenticated style isolation.
- Update browser tests for global plus local navigation, workspace switching, Create actions, timer recovery, inbox, command search, dialogs, and task-detail panes.
- Test representative screens at 1440×900, 1024×768, and 390×844, including populated, empty, loading, forbidden, error, and overflow states.
- Add visual baselines for home, project list/board/timeline, task detail, inbox, reporting, settings, and PSA tables; compare them with shared CPAAutomation shell and component references.
- Run Axe with color contrast enabled and verify keyboard navigation, focus visibility, reduced motion, landmark order, drawer focus trapping, and touch-target labeling.
- For every wave run `npm run lint:tasklytic`, `npm run test:tasklytic`, `npm run test:tasklytic:browser`, TypeScript checks, `npm run build`, and `npm run check:tasklytic-bundle`.
- Final acceptance requires zero authenticated references to Fraunces, `tasklytic:theme`, private warm-theme variables, aurora/glow helpers, or `tl-*-surface` portal classes.

## Assumptions and Acceptance Criteria

- Business logic, route contracts, permissions, persistence, and backend behavior remain unchanged.
- Public intake forms retain their current client-facing identity and submission behavior.
- Tasklytic follows the host theme rather than owning a separate theme preference; the current dashboard remains light, and future host dark-mode support will propagate through shared tokens.
- Releases occur in the gated waves above using compatibility adapters until the final cleanup. A feature family is releasable only when its full workflow and responsive states are converted.
- The redesign is complete when Tasklytic visibly belongs to CPAAutomation, presents only one global account/search/theme shell, retains its dense productivity workflows, and passes all existing functional, accessibility, bundle, and build gates.
