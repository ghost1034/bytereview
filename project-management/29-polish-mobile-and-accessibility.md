# 29 — Polish, Mobile & Accessibility

**Goal:** Make Tasklytic feel like a real, shippable product on every screen size, with smooth motion, polished empty states, full keyboard navigation, and WCAG AA color contrast.

---

## Prompt (paste into Google AI Studio Build)

Do a thorough polish pass on Tasklytic. No new features. Improve visual fidelity, motion, mobile layouts, empty states, loading states, and accessibility. Do not break prior functionality.

### Motion & micro-interactions

- All transitions use `transform` and `opacity` only (no layout thrash).
- Card hover lift: `translateY(-1px) shadow-md` 150ms.
- Modal/popover entrance: 120ms fade + 4px translate.
- Toasts: slide-in from bottom-right, 4s auto-dismiss, max stack of 3, swipe-to-dismiss on touch.
- Optimistic UI for store mutations — render the change immediately; if persist fails, revert and show an error toast.
- Drag preview shadow (soft, slightly tilted ghost).
- Section collapse: 200ms eased height animation.
- Loading skeletons everywhere (List rows, Board cards, Charts) — never bare spinners except on data fetches that take > 300ms.

### Empty states

For every primary view, design a thoughtful empty state with:
- A simple SVG illustration (inline; no external assets).
- A friendly headline.
- A subhead explaining the next step.
- A primary CTA.
- Optional secondary "Learn more" link to the relevant docs section in the marketing site (`/docs/<feature-slug>` — the docs index page lives in step 01b's marketing site; individual articles can be filled in over time).

Specifically design empty states for: Home, Sidebar (no projects yet), My Tasks, Inbox, Project (no tasks, no sections), List view, Board view, Calendar view, Timeline view, Goals, Portfolios, Reporting, Files tab, Search results, Forms list, Rules list, Templates, AI panel.

### Loading states

- Sidebar loading: skeleton rows.
- List view loading: 8 skeleton rows.
- Board view loading: 3 skeleton columns each with 3 skeleton cards.
- Calendar loading: gray grid with subtle shimmer.
- Charts loading: pulsing skeleton shapes per chart type.
- Task detail pane loading: skeleton title + 5 field rows + skeleton description block.

### Error states

- Inline form errors with field-level red borders + below-field helper text.
- Page-level errors: a friendly error card with a "Try again" button.
- Network/API errors (AI panel): a small banner with "Retry" inside the chat.
- Global error boundary in `src/app/ErrorBoundary.tsx`. On crash, render a recovery card with a "Reload" button and a small "Copy diagnostics" button (copies JSON of last 50 store mutations).

### Mobile (≤ 1024px)

- Sidebar becomes a slide-in drawer (already in step 04 — polish it).
- Topbar collapses to: hamburger, title (truncated), search icon, avatar.
- Task detail pane goes full-screen on mobile with a sticky top bar (back arrow + title) and bottom sheet for field editing.
- Lists/boards become single-column friendly:
  - List view rows reduce to: name, assignee avatar, due pill.
  - Board view becomes a horizontal carousel of columns with snap.
  - Calendar Month becomes a weekly-summary list view; Week falls back to a single-day view with prev/next nav.
  - Timeline/Gantt: gracefully degrade to a "View on desktop for best experience" banner + a flat list of tasks with bar visualization on a horizontal scroll.
- Touch targets minimum 44×44px.
- Sticky bottom action bar in the task detail pane: Complete / Comment / More.

### Accessibility (WCAG AA)

- All interactive elements have visible focus rings using a 2px primary outline + 2px offset.
- Color contrast ≥ 4.5:1 for body text; ≥ 3:1 for large text. Add a small accessibility audit comment in `Design.md` listing any known exceptions.
- All icons have `aria-label` when meaningful, `aria-hidden="true"` when decorative.
- All form fields have associated labels (visible or `aria-label`).
- All modals/popovers trap focus and return focus on close.
- All drag-and-drop has keyboard alternatives (already required in earlier steps — confirm working everywhere).
- ARIA roles set correctly on tabs, dialogs, menus, tooltips, listboxes.
- Provide a "Reduce motion" preference: respect `prefers-reduced-motion` and add a manual toggle in `/me` settings → Appearance. When on, disable non-essential animations.

### Dark mode

- Audit every component for proper dark-mode contrast. Special attention to: chart axes/gridlines, calendar weekend shading, drag-ghost shadows, task detail pane backdrop blur.
- Inverted backgrounds for code blocks. Mention pills retain their user color in both modes.

### Print stylesheets

- A `@media print` block in `globals.css` that:
  - Hides sidebar, topbar, side panels.
  - Forces single-column layout.
  - Renders task lists with crisp borders, no shadows.
  - Renders charts as PNG-style flat shapes.

### Performance polish

- Lazy-route every page via `React.lazy + Suspense` with a route-level loading skeleton.
- Memoize heavy selectors (already required earlier — verify).
- Defer non-critical store hydrations (e.g., attachments dataUrl content) until first use.
- Add a simple bundle-size sanity check comment in `Design.md` listing top heavy modules.

### Polish for the onboarding flow (the full flow lives in step 30)

- If a user lands on Home with no projects and no starter project from onboarding, render a 3-step inline checklist:
  1. "Create your first project" → opens `CreateProjectDialog`.
  2. "Add a task" → opens Quick Add prefilled in that project.
  3. "Invite a teammate" → opens the invite dialog.
- Each step dismissible. Completion state persists on `User.onboarding` (the same field introduced in step 30).
- This complements — does not duplicate — the 5-step onboarding wizard from step 30. The wizard runs once on first sign-up; this inline checklist appears any time later when a workspace is empty.

### Branding sweep

- Logo refined: a rounded-square `primary` tile + a small white check mark on top of a small dot ("T" style). Ensure it scales from 16px to 32px.
- Favicon updated to match.
- Empty illustrations use the brand color subtly (≤ 20% of pixels).

### Components to add/touch
- `EmptyState.tsx` (shared, parameterized)
- `Skeleton.tsx` (already exists; add `<SkeletonRow/>`, `<SkeletonCard/>`, `<SkeletonChart/>` presets)
- `Toast.tsx`/`ToastProvider.tsx`
- `ErrorBoundary.tsx`
- `useReducedMotion.ts`
- `useOnboarding.ts`
- `MobileChrome.tsx`
- All views' mobile breakpoints.

### Success criteria
- App passes a manual a11y review for keyboard-only navigation.
- App is usable on a 375×667 viewport for the primary flows (Home, My Tasks, Inbox, Task detail, List view, Board view).
- All empty states present and on-brand.
- Reduced motion is respected.
- `Design.md` row: `29 | (cross-cutting) | Polish, mobile & accessibility | <today>` plus a section **"Accessibility audit"** with anything still pending.
