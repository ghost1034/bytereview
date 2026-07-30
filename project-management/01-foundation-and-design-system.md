# 01 — Foundation & Design System

**Goal:** Scaffold the app, lock in the tech stack, and establish a design system that every later prompt will reuse.

---

## Prompt (paste into Google AI Studio Build)

Build the foundation of a work-management web app called **Tasklytic** — an Asana-style platform that I will extend feature by feature in subsequent prompts. This first prompt only sets up scaffolding, the design system, and an empty app shell. No business logic yet.

### Tech stack (use exactly these)
- **React + TypeScript + Vite**
- **Tailwind CSS** for styling (use design tokens via `tailwind.config` extensions, NOT inline hex codes)
- **lucide-react** for icons
- **react-router-dom** v6 for routing
- **zustand** for global state (keep it light and modular — one store per domain in later steps)
- **date-fns** for date math
- **clsx** + **tailwind-merge** (`cn()` helper) for className composition

### Folder structure (create empty files where useful so the layout is locked in)
```
src/
  app/
    AppShell.tsx         (skeleton layout: sidebar + topbar + outlet — slots populated by feature steps)
    routes.tsx           (router config)
  components/
    ui/                  (Button, Input, Avatar, Badge, Tooltip, DropdownMenu, Dialog, Tabs, Popover, Skeleton)
  features/              (each later phase creates its own subfolder here)
  lib/
    cn.ts                (className helper)
    date.ts              (date helpers)
  hooks/
  stores/                (zustand stores — populated by feature steps starting with step 02)
  types/                 (shared TS types — populated by step 02)
  styles/
    globals.css          (tailwind base + small global tweaks)
  main.tsx
  App.tsx
Design.md                (project root — see below)
```

### Design system (LOCK these — do not change in any future prompt unless I explicitly ask)

**Brand**
- App name: **Tasklytic**
- Logomark: a stylized "T" with a checkmark, rendered as a small rounded-square in primary color.

**Color palette** (define as Tailwind theme tokens):
- `primary` (CTA + brand): `#796EFF` (with `primary-hover: #6A5FE6`, `primary-soft: #EEEBFF`)
- `accent` (success/positive): `#14C38E`
- `warning`: `#FFB547`
- `danger`: `#F4364C`
- `info`: `#3DBCFF`
- Grayscale: `gray-50: #FAFAFB`, `gray-100: #F4F4F6`, `gray-200: #E6E6EB`, `gray-300: #D2D2DA`, `gray-400: #A0A0AB`, `gray-500: #6E6E78`, `gray-600: #4A4A52`, `gray-700: #2E2E35`, `gray-800: #1B1B20`, `gray-900: #0E0E12`
- Sidebar background: `#F7F7F9` in light mode, `#15151A` in dark mode

**Typography**
- Font: **Inter** (load via Google Fonts), fallback `system-ui, sans-serif`
- Scale: `text-xs 12px / text-sm 13px / text-base 14px / text-lg 16px / text-xl 18px / text-2xl 22px / text-3xl 28px`
- Headings use `font-semibold` (600); body uses 400; UI labels use 500.

**Spacing & radius**
- Base unit: 4px (Tailwind default).
- Default border radius: `rounded-md` (6px). Cards/panels use `rounded-xl` (12px). Pills use `rounded-full`.
- Default shadow: `shadow-sm` for interactive elements, `shadow-md` for floating panels, `shadow-lg` for modals.

**Density**
- This app is dense like Asana. Rows are 36px tall. Inputs are 32px tall. Buttons are 32px tall (small), 36px (default), 40px (large).

**Iconography**
- All icons from `lucide-react`, sized 16px by default in dense UI, 20px in nav/headers.

**Dark mode**
- Implement Tailwind's `dark:` variant from day one. Toggle via a button in the topbar. Default to system preference. Persist in `localStorage` under key `tasklytic:theme`.

**Motion**
- Subtle 150ms ease-out transitions on hover/focus.
- Modal/popover entrance: 120ms fade + 4px translate.
- Drag-and-drop (later): use `transform` with `transition-transform`.

### App shell scaffold (feature steps will populate these zones)
- **Left sidebar** (240px, collapsible to 56px, persistent on desktop): top has workspace switcher slot, middle has nav slot, bottom has user-avatar slot. All slots are render-prop boundaries that later steps populate.
- **Top bar** (52px): left has page-title slot, center has global-search slot (input with placeholder text "Search… (⌘K)"), right has create-button slot + notifications slot + theme toggle + avatar slot.
- **Main area**: `<Outlet />` with default route showing a centered welcome card: "Welcome to Tasklytic — pick a workspace to begin."

### UI primitives to implement now (in `src/components/ui/`)
Build minimal but well-styled versions of: `Button` (variants: primary, secondary, ghost, danger; sizes sm/md/lg), `Input`, `Textarea`, `Avatar` (with initials fallback and deterministic color), `Badge`, `Tooltip`, `DropdownMenu`, `Dialog`/`Modal`, `Tabs`, `Popover`, `Skeleton`, `Separator`, `IconButton`. All keyboard accessible. No external UI library — write them with Tailwind + small primitives.

### `Design.md` (root file the AI must maintain)
Create `Design.md` at the repository root and populate it with three sections:
1. **Tech stack** — list everything from above.
2. **Design tokens** — full color/typography/spacing reference.
3. **Feature log** — a chronological table with columns `Step | File | Feature added | Date`. Add one row for this step: `01 | (multiple) | Foundation & design system | <today>`.

**At the end of every future prompt, append a new row to the Feature log.**

### Coding guidelines (enforce for all future steps)
- One feature per file. Components ≤ 200 lines — split when larger.
- Add a top-of-file comment for every feature file: what the feature is, its core use cases, and which files it touches.
- All functions get JSDoc with `@param` and `@returns`.
- Strict TypeScript. No `any`. Prefer `type` over `interface` for data shapes.
- No business logic in components — keep it in `stores/` or `lib/`.

### Success criteria for this step
- App boots with `npm run dev` showing an empty shell in the colors and typography defined above.
- Dark mode toggle works and persists.
- Tailwind config has all custom tokens.
- `Design.md` exists with the feature log row.
- No domain content exists yet — entities and stores arrive in step 02; first-run content provisioning arrives in step 30.

**Build this exactly. Do not add features I haven't asked for. Do not skip the design tokens or `Design.md`.**
