# FirmCRM — Direction B: "Finance-grade editorial"

A CRM for law, accounting and professional-services firms should feel like a financial instrument the partners can trust: warm paper-toned neutrals, a confident type hierarchy with true tabular numerals, dense but precise tables, and color that is spent only on meaning (money, status, risk). Nothing glows, nothing floats, nothing is decorative.

This document is the complete spec. An engineer should be able to implement it against the existing React 18 + Tailwind v4 (`@theme`) + lucide-react + recharts stack without asking questions. Everything in §3 is a drop-in replacement for `frontend/src/index.css`'s `@theme` block.

---

## 1. References and what was borrowed

| Product | Pattern borrowed | Where it lands in FirmCRM |
|---|---|---|
| **Stripe Dashboard** — Customer / Payment detail | Summary header (title + status pill + meta line) → **key-facts grid** (label-over-value, 4–6 columns, hairline dividers, no boxes) → tabbed body. Top-right action cluster with one primary + secondaries. Right-aligned tabular money everywhere. Normal-case small gray column headers (no all-caps shouting). | Opportunity and Account detail pages (§6.4, §6.14), table headers (§6.6) |
| **Stripe** — Reports KPI row | KPI tile with label → big numeral → **delta line** (`+12.4%` colored, "vs. prior quarter" gray) and a **hairline sparkline** at the right edge. No icons in KPI tiles. | Dashboard KPI tiles (§6.5) |
| **Mercury** — Accounts list & transaction table | Warm off-white canvas with white cards, 1px borders and **no shadows** on anything that is not an overlay; tables with 40px rows, horizontal rules only, hover = faint warm tint, money in tabular figures at 13px/500. Account cards with a small muted mono sub-label (account number). | Canvas/surface tokens (§3.1), data table (§6.6), Kanban card ref line (§6.7) |
| **Mercury** — Sidebar | Sidebar sits **on the canvas**, not in a white panel; active item is a soft filled pill in the canvas-darker tone with a primary-text label, not an accent-colored block. Icons 16px, stroke 1.5. Organization switcher at top, user at bottom. | App shell (§5, §6.1) |
| **Ramp** — Stage/approval stepper | Horizontal **dot-and-rail stepper** (filled dot + connecting hairline) with the current step labeled in primary text and a probability shown in mono beneath; completed steps in accent, future steps in tertiary. Not chunky full-width colored blocks. | Pursuit stage stepper (§6.13) |
| **Brex** — Status semantics | Statuses are a **dot + label**, not a filled pill, in tables; filled pills reserved for the header or when the status is the point of the cell. Semantic colors at ~600 for text on ~50 backgrounds. | Badge/status pill (§6.8) |
| **Linear** (small borrowing) | 150 ms ease-out on hover, **zero** entrance animations on page load; skeletons not spinners. | Motion (§7) |

---

## 2. Principles (use these to settle anything not covered below)

1. **Paper, not glass.** Canvas is warm off-white (`#F7F5F1`), surfaces are white, separation is 1px hairlines. Shadows exist only on overlays (menus, modals, drawers, toasts).
2. **Numbers are the product.** All numerals render with `font-variant-numeric: tabular-nums`. Money is right-aligned, same weight as its column header or heavier, never lighter.
3. **Color is a signal, not a theme.** The accent (indigo ink) is used for primary action, focus, links and the "current" state. Green means money-positive / cleared / won; amber means pending / stale / needs attention; red means conflict / lost / destructive; blue means informational / open. Nothing else is colored.
4. **Hierarchy by weight and tone, not by size.** Four text tones (primary, secondary, tertiary, disabled) and three weights (400/500/600) do most of the work. Size steps are few.
5. **Dense, aligned, calm.** 4px base grid, 8px rhythm inside components, 24px between sections. Nothing animates on load.

---

## 3. Tokens (Tailwind v4 `@theme`)

Replace the `@theme` block in `frontend/src/index.css` with the following. Token names are chosen so existing `bg-accent-600`, `rounded-md`, etc. keep working; the neutrals are introduced as `sand-*` so the migration from `slate-*` is a search-and-replace.

```css
@import "@fontsource-variable/geist";        /* pnpm add @fontsource-variable/geist */
@import "@fontsource-variable/geist-mono";   /* pnpm add @fontsource-variable/geist-mono */
@import "tailwindcss";

@theme {
  /* ---------- Typography ---------- */
  --font-sans: "Geist Variable", "Inter", -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* ---------- Neutral scale (warm, light mode) ---------- */
  --color-sand-0:   #FFFFFF;   /* surface (cards, inputs, table body) */
  --color-sand-25:  #FBFAF8;   /* hover row, sticky table header, kanban column bg */
  --color-sand-50:  #F7F5F1;   /* canvas (page + sidebar background) */
  --color-sand-100: #EFEDE8;   /* table row rule, subtle divider, active nav pill */
  --color-sand-150: #E7E4DE;   /* default border */
  --color-sand-200: #DCD8D0;   /* strong border (inputs), disabled fill */
  --color-sand-300: #C4BFB5;   /* disabled text, placeholder glyphs */
  --color-sand-400: #A39E94;   /* placeholder text, chart axis ticks */
  --color-sand-500: #7D786F;   /* tertiary text (timestamps, meta) */
  --color-sand-600: #5F5B53;   /* secondary text (labels, column headers) */
  --color-sand-700: #44413B;   /* icon default */
  --color-sand-800: #2B2925;   /* heading on tinted surfaces */
  --color-sand-900: #1A1916;   /* primary text */

  /* ---------- Accent: indigo ink ---------- */
  --color-accent-50:  #EEF0FB;
  --color-accent-100: #DDE1F7;
  --color-accent-200: #BEC5EF;
  --color-accent-300: #97A2E4;
  --color-accent-400: #7080D8;
  --color-accent-500: #5563CC;
  --color-accent-600: #4B55C8;   /* primary button, links, focus ring, "current" */
  --color-accent-700: #3C44A6;   /* primary hover */
  --color-accent-800: #2F3684;   /* primary active */
  --color-accent-900: #252A62;

  /* ---------- Semantic ---------- */
  --color-success-50:  #E8F5EC;  --color-success-200: #B9E3C6;  --color-success-600: #1E7B4F;  --color-success-700: #176440;
  --color-warn-50:     #FBF1E2;  --color-warn-200:    #F3D9A6;  --color-warn-600:    #B4600F;  --color-warn-700:    #8F4C0B;
  --color-danger-50:   #FBE9E7;  --color-danger-200:  #F3C1BC;  --color-danger-600:  #C2392B;  --color-danger-700:  #A02E22;
  --color-info-50:     #E7EFFA;  --color-info-200:    #BDD3F1;  --color-info-600:    #2C63B8;  --color-info-700:    #234F94;

  /* ---------- Radii ---------- */
  --radius-xs: 3px;   /* checkbox, status dot container, tiny chips */
  --radius-sm: 4px;   /* badges, kbd */
  --radius-md: 6px;   /* buttons, inputs, nav pills, menu items */
  --radius-lg: 8px;   /* cards, kanban cards, tiles */
  --radius-xl: 12px;  /* modals, drawers, toasts */
  --radius-full: 9999px;

  /* ---------- Borders ---------- */
  --border-hair: 1px solid var(--color-sand-150);
  --border-strong: 1px solid var(--color-sand-200);
  --border-row: 1px solid var(--color-sand-100);

  /* ---------- Shadows (OVERLAYS ONLY) ---------- */
  --shadow-menu:  0 1px 2px rgba(26,25,22,.06), 0 8px 24px -8px rgba(26,25,22,.16);
  --shadow-modal: 0 1px 2px rgba(26,25,22,.08), 0 24px 64px -16px rgba(26,25,22,.28);
  --shadow-toast: 0 1px 2px rgba(26,25,22,.08), 0 12px 32px -12px rgba(26,25,22,.24);
  --shadow-drag:  0 2px 6px rgba(26,25,22,.10), 0 12px 32px -12px rgba(26,25,22,.20); /* card while dragging */

  /* ---------- Spacing (4px base) ---------- */
  --spacing: 4px;   /* Tailwind v4 multiplier: p-1 = 4px … p-6 = 24px, p-8 = 32px */

  /* ---------- Z-index ---------- */
  --z-sticky: 10;     /* sticky table header */
  --z-topbar: 20;
  --z-sidebar: 30;
  --z-dropdown: 40;   /* menus, search results, selects */
  --z-drawer: 50;
  --z-modal: 60;
  --z-toast: 70;
}
```

Base styles (also in `index.css`):

```css
html, body, #root { height: 100%; }
body {
  background: var(--color-sand-50);
  color: var(--color-sand-900);
  font-family: var(--font-sans);
  font-size: 13px; line-height: 20px;
  font-feature-settings: "tnum" 1, "cv11" 1;     /* tabular nums globally; cv11 = single-storey a (Geist) */
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
::selection { background: var(--color-accent-100); }
a { color: var(--color-accent-600); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 2px; }
```

---

## 4. Typography

**Font:** Geist Sans (variable) for all UI, Geist Mono for identifiers, references, probabilities in steppers, and keyboard hints. Both self-hostable via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`. Geist supports `tnum`, has a neutral grotesque voice close to Söhne, and its numerals are wide and legible at 12–13px, which matters more here than display charm. Fallback to Inter keeps metrics close.

**Tabular numerals rule:** `font-feature-settings: "tnum"` is set on `body`; nothing opts out. Any element that renders a number (money, counts, dates, percentages, durations) additionally gets `.num` for `font-variant-numeric: tabular-nums lining-nums` so it survives font fallback.

| Token | Size / line-height | Weight | Letter-spacing | Use |
|---|---|---|---|---|
| `display` | 28px / 34px | 600 | -0.02em | Dashboard greeting, login |
| `h1` | 20px / 28px | 600 | -0.015em | Page title, detail record name |
| `h2` | 15px / 22px | 600 | -0.01em | Card title, modal title |
| `h3` | 13px / 20px | 600 | 0 | Kanban column name, sub-section |
| `body` | 13px / 20px | 400 | 0 | Default text, table cells |
| `body-md` | 13px / 20px | 500 | 0 | Record names in tables/cards, money in cells |
| `small` | 12px / 16px | 400 | 0 | Meta lines, helper text, tab labels |
| `label` | 12px / 16px | 500 | 0 | Form labels, KPI labels, table column headers. **Normal case.** |
| `caption` | 11px / 14px | 500 | 0.01em | Badge text, kbd, chart axis ticks |
| `kpi` | 24px / 28px | 600 | -0.02em | KPI tile value, detail fact-tile value |
| `kpi-sm` | 18px / 24px | 600 | -0.015em | Inline stat (win rate, won/lost counts) |
| `mono` | 12px / 16px | 400 (Geist Mono) | 0 | IDs (`OPP-0412`), refs, probabilities in stepper, kbd |

Text tones: primary `sand-900`, secondary `sand-600`, tertiary `sand-500`, disabled `sand-300`, inverse `#FFFFFF`.

**Do not** use uppercase + wide tracking for labels anywhere. The current `.label` class (11.5px uppercase tracking-wide) is replaced with 12px/500 normal-case `sand-600`.

---

## 5. Layout

| Element | Value |
|---|---|
| Sidebar width | 232px fixed; collapses to 56px icon rail below 1180px viewport |
| Top bar height | 52px, transparent over canvas, no bottom border; sticky |
| Content area | `flex-1 min-w-0 overflow-auto` |
| Page padding | 24px top, 32px left/right, 40px bottom. **Board view:** 20px top, 24px left/right, 24px bottom (the board needs the width) |
| Content max-width | 1344px (1280 + padding) for Dashboard, detail pages, forms, left-aligned. **No max-width** for Opportunities board and full-width tables (Accounts, Contacts, Leads, Engagements, Clearance) |
| Section gap | 24px between page header → KPI row → cards; 16px between cards in a grid |
| Grid | 12-col, 16px gutter. Dashboard: KPI row `grid-cols-6` (≥1280) / `grid-cols-3` (≥960) / `grid-cols-2`. Main row `8 / 4` split. |
| Detail page | Header full width → facts grid full width → body `8 / 4` (main / rail) |

**Responsive rules:** ≥1440 is the design target. 1180–1439: sidebar stays, KPI row 3×2, board columns hit `min-width 220px` and the board scrolls horizontally. <1180: sidebar becomes icon rail (56px), search shrinks to an icon button opening a command palette. <900: not a supported layout; show the table view instead of the board and stack the detail rail under the main column.

---

## 6. Component specs

All values are CSS; Tailwind equivalents are obvious from the tokens. "Hairline" = `1px solid sand-150`.

### 6.1 Sidebar

- Container: `width 232px; background sand-50; padding 12px 12px 12px 16px; display flex; flex-direction column;` **no right border** (the canvas is continuous; the white cards define the content area). Add `border-right: 1px solid sand-100` only when content scrolls horizontally (board view) so the rail reads as fixed.
- Org block (top): height 40px, `padding 0 8px`, mark 24×24 `radius-md` `background sand-900` with a white 12px/700 "F"; firm name 13px/600 `sand-900`; caret icon 14px `sand-500` at right. Clickable (org switcher / settings menu).
- Section gap under org block: 20px.
- Nav item: `height 32px; padding 0 8px 0 10px; gap 10px; border-radius md; font 13px/500; color sand-700;` icon 16px stroke 1.5 `sand-500`.
  - hover: `background sand-100; color sand-900`.
  - **active:** `background sand-100; color sand-900; font-weight 600;` icon `sand-900`. **No accent color on nav.**
  - focus-visible: `outline 2px solid accent-600; outline-offset -2px`.
  - Count (Tasks, Clearance pending): right-aligned 11px/500 `sand-500` tabular; if the count is attention-worthy (pending clearances) use `warn-600`.
- Group label ("Workspace", "Admin"): 11px/500 `sand-500` normal case, `padding 16px 10px 6px`.
- User block (bottom): `border-top hairline; padding 12px 8px 4px;` avatar 24px circle `sand-200` with initials 10px/600 `sand-700`; name 12px/500 `sand-900`; role 11px `sand-500`; kebab 16px `sand-500` on hover.

### 6.2 Top bar + global search

- Container: `height 52px; padding 0 32px; display flex; align-items center; justify-content space-between; background sand-50;` sticky top, `z-topbar`. No border.
- Breadcrumb (left): 12px `sand-500`; current segment `sand-900` 500; separator "/" `sand-300` with 8px side margins. Replaces the per-page breadcrumb div.
- Search (center-right): `width 320px; height 32px; border 1px solid sand-200; border-radius md; background sand-0; padding 0 10px 0 32px;` icon 14px `sand-400` at left 10px; placeholder "Search…" `sand-400`; right-aligned `kbd` "⌘K" (11px mono, `sand-500`, `border hairline`, `radius-sm`, `padding 0 4px`, `background sand-25`).
  - focus: `border-color accent-600; box-shadow 0 0 0 3px accent-100`.
  - Results popover: `margin-top 6px; width 100% (min 480px); background sand-0; border hairline; border-radius lg; shadow-menu; max-height 420px;` group label 11px/500 `sand-500` `padding 10px 12px 4px`; item `height 36px; padding 0 12px;` primary 13px `sand-900`, meta 12px `sand-500` right; hover/keyboard-active `background sand-50`.
- Right cluster: date 12px `sand-500`; notification bell 16px `sand-600` ghost button 28×28; 12px gap.

### 6.3 Page header

- `display flex; align-items flex-start; justify-content space-between; gap 16px; margin-bottom 24px;`
- Title `h1`; optional status pill (§6.8) inline, vertically centered, 8px gap.
- Subtitle/meta line 12px `sand-500` `margin-top 4px`; separators are `·` with 6px margins; entity links in `sand-700` underline on hover only.
- Action cluster: right, `gap 8px`; exactly one primary button; secondary buttons to its left; destructive/ghost actions in an overflow `⋯` menu rather than inline when more than three actions.

### 6.4 Key-facts grid (detail pages, replaces the 4 mini-cards)

Borrowed from Stripe's payment detail. One white card, `padding 0; border hairline; radius lg;` containing a `grid-template-columns: repeat(4..6, 1fr)`; each cell `padding 14px 20px; border-right: 1px solid sand-100` (last none).

- Label: `label` token `sand-600`.
- Value: `kpi` (24/28/600) for money, `h1`-sized for dates/text, `margin-top 4px`.
- Sub line: 12px `sand-500` `margin-top 2px`.
- Editable facts (probability, engagement letter) render the value as a borderless inline control that shows its border only on hover/focus (`border 1px solid transparent` → `sand-200`).

### 6.5 KPI stat tile (Dashboard)

- Tile: `background sand-0; border hairline; border-radius lg; padding 16px 20px 14px; min-height 128px; display flex; flex-direction column;` (grid `align-items stretch` keeps all six the same height).
- Label: `label` token `sand-600`. **No icon.**
- Value: `kpi` token, `sand-900`, `margin-top 8px`. Compact money (`$4.2M`) on tiles; full money in tables.
- Delta row: `margin-top 6px; display flex; align-items center; flex-wrap wrap; gap 0 6px; font 12px/16px 500;` — the context phrase is `white-space: nowrap` and wraps to its own line when the tile is narrow.
  - delta: arrow glyph (lucide `ArrowUpRight`/`ArrowDownRight` 12px) + `+12.4%`; color `success-600` when good, `danger-600` when bad, `sand-500` when neutral/0. **Text color only, no pill background.** "Good" is direction-aware: stale count going down is green.
  - context: "vs. prior quarter" 12px `sand-500`.
- Sparkline (Stripe Reports pattern): a **full-width baseline strip at the bottom of the tile**, `height 24px; margin-top auto; padding-top 10px;` inline SVG with `preserveAspectRatio="none"` and `vector-effect: non-scaling-stroke` so the 1.5px stroke stays crisp when stretched. `stroke accent-600 1.5px; stroke-linejoin round`, area fill `accent-600` at 8% opacity, last point a 5px round-capped dot. For warn tiles (stale, pending clearance) the sparkline uses `warn-600`. No axes, no tooltip. Six tiles across 1144px leaves ~137px of content width per tile, which is why the sparkline is not placed beside the label or the value.
- Tone variants: `warn` tile gets value color `warn-700` only when the count is > 0; never tint the background.

### 6.6 Data table

Applies to `DataTable`, `table.tbl`, and the stage table under the chart.

| Part | Spec |
|---|---|
| Wrapper | Card (`sand-0`, hairline border, `radius lg`, `overflow hidden`). Table `width 100%; border-collapse separate; border-spacing 0`. |
| Header cell | `height 36px; padding 0 16px; background sand-25; border-bottom 1px solid sand-150; font 12px/16px 500; color sand-600; text-align left; white-space nowrap;` **normal case**. Sticky: `position sticky; top 0; z-sticky`. Sortable: on hover `color sand-900`; active sort shows 12px chevron `sand-900` 4px after the label. |
| Row | `height 40px` (dense variant 36px for the stage table). `td { padding 0 16px; border-bottom 1px solid sand-100; vertical-align middle }`; last row no border. |
| Cell text | 13px/400 `sand-900`. Record-name cell 13px/500. Secondary line inside a cell 12px `sand-500` (row grows to 52px). |
| Numeric cell | `text-align right; font-variant-numeric tabular-nums; font-weight 500` for money, 400 for counts/days. Header of numeric columns right-aligned too. Zero/empty renders `—` in `sand-300`. |
| Hover (clickable rows) | `background sand-25; cursor pointer`. 120ms. |
| Selected | `background accent-50; box-shadow inset 2px 0 0 accent-600`. |
| Focus (keyboard) | `outline 2px solid accent-600; outline-offset -2px` on the row. |
| Row actions | Appear on hover at right: ghost 28×28 icon buttons; column reserved 48px so content never shifts. |
| Footer / pagination | `height 44px; padding 0 16px; border-top hairline; background sand-0;` "1–50 of 312" 12px `sand-500` tabular left; page-size select + prev/next ghost buttons right. |
| Totals row (optional) | `background sand-25; border-top 1px solid sand-150; font-weight 600`. Used on the stage table. |
| Loading | 6 skeleton rows: `height 12px; border-radius xs; background sand-100` bars at 60/40/30% widths; opacity pulse 1.4s. No spinner. |

Column widths: name columns `min-width 240px`, money `width 128px`, date `width 120px`, stage/status `width 140px`, owner `width 160px`.

### 6.7 Kanban — column and card

Board region: `display flex; gap 16px; align-items stretch; padding-bottom 16px; flex 1`. Columns **flex to fill** the viewport (`flex 1 1 0; min-width 220px`); at 1440px with five open stages that yields 222px columns with no horizontal scroll. Only if `stages × 220 + gaps` exceeds the available width does the region become `overflow-x auto`. Geometry check: 1440 − 232 sidebar − 48 padding = 1160; (1160 − 4×16) / 5 = 222.4px.

**Column**
- `width 280px; flex 0 0 auto; display flex; flex-direction column; background transparent;` (no box — Mercury/Linear-style open columns; the cards are the boxes).
- Header: `height 36px; display flex; align-items baseline; gap 8px; padding 0 4px 0 6px; border-bottom 1px solid sand-150; margin-bottom 12px;`
  - name `h3` `sand-900`; count `mono 12px sand-500`; right-aligned sum `12px/500 sand-600 tabular` and probability `mono 11px sand-400` ("40%").
  - Clearance column name carries a 14px `ShieldCheck` icon in `sand-500` before the name.
- Body: `display flex; flex-direction column; gap 8px; flex 1; min-height 120px; padding 2px;` (2px so focus rings are not clipped).
- Drop target state (drag over): column body gets `background accent-50; border-radius lg; box-shadow inset 0 0 0 1px accent-300`.
- Empty column: dashed `1px sand-200` placeholder `height 72px; radius lg;` 12px `sand-400` "No opportunities".

**Card**
- `background sand-0; border 1px solid sand-150; border-radius lg; padding 12px 12px 10px; position relative; cursor grab;`
- hover: `border-color sand-300`. Dragging: `shadow-drag; transform rotate(0.5deg) scale(1.01); border-color accent-300`.
- Row 1: opportunity name `13px/500 sand-900`, 2-line clamp, `padding-right 24px` to clear the shield. The name is the matter/engagement description only ("Breach of supply agreement v. Brightline Freight"); the account renders on its own line so names stay short.
- **Clearance shield** (top-right, 14px, `position absolute; top 12px; right 12px`): `ShieldCheck` in `success-600` (clear/waived); `ShieldAlert` in `warn-600` (pending / not run); `ShieldX` in `danger-600` (conflict). Tooltip on hover: "Conflict check: pending". Cards without a clearance type render nothing.
- Row 2: account name `12px sand-500 margin-top 2px`.
- Row 3 (`margin-top 10px`): money `13px/600 sand-900 tabular` left; expected close `12px sand-500 tabular` right. If close date is in the past: `danger-600` with 12px `CalendarClock` icon.
- Row 4 (`margin-top 8px; display flex; align-items center; flex-wrap wrap; gap 6px`): practice-area chip (§6.8 neutral chip), optional state chips (clearance pending, engagement-letter status, recurring), owner avatar 18px circle `sand-200` initials 9px/600 with `margin-left auto`. Chips wrap to a second line rather than truncating; the avatar follows the last chip.
- **Stale indicator:** a 2px `warn-600` bar on the card's left edge (`box-shadow inset 2px 0 0 warn-600`) plus an amber dot+text chip in row 4 ("23d · stale", `warn-700` text, `warn-50` bg). Stale = no activity ≥ 21 days. Never change the card's whole border to amber (that is what reads as "AI generated").
- Restricted (ethical wall): 12px `Lock` icon `sand-500` before the account name.

**Won / Lost drop zones** (only in "Open" board view): a **docked strip under the columns**, not a sixth column (a right-hand column steals ~200px from the stages at 1440). `display grid; grid-template-columns 1fr 1fr; gap 12px; height 56px;` each zone `border 1px dashed sand-300; border-radius lg; display flex; align-items center; justify-content center; gap 8px; color sand-500; font 12px/500;` icon 16px (`Trophy` / `XCircle`) before the label, and a `sand-400` 400-weight hint after it ("· requires cleared check and signed engagement letter" / "· you will be asked for a reason"). Drag-over: Won → `border-style solid; border-color success-600; background success-50; color success-700`; Lost → `border-style solid; border-color danger-600; background danger-50; color danger-700`. The strip is always visible in Open view so the gate rule is discoverable; it does not appear in Won/Lost/All views.

### 6.8 Badge / status pill semantics

Two forms:

**Status dot + label (default in tables and meta lines):** `display inline-flex; align-items center; gap 6px; font 12px/16px 500; color sand-900;` dot `6px circle`. Dot color by state. Borrowed from Brex.

**Filled pill (header, kanban chip, when the status is the cell's whole content):** `height 20px; padding 0 8px; border-radius full; font 11px/14px 500; border 1px solid <tone-200>; background <tone-50>; color <tone-700>`. Neutral chip: `background sand-100; border-color sand-150; color sand-700`.

| State | Tone | Examples |
|---|---|---|
| success | `success` | won, client, clear, waived*, signed, active, completed, attended |
| warn | `warn` | pending, sent, drafted, on_hold, stale, contacted, medium risk |
| danger | `danger` | lost, conflict, adverse_party, unqualified, terminated, high risk, archived |
| info | `info` | open stages, prospect, new, registered, qualified |
| neutral | `sand` | practice areas, tags, fee type, referral_source, everything else |

\* waived shows `success` tone but with a `ShieldOff` 12px icon so it is never confused with "clear".

### 6.9 Buttons

Common: `display inline-flex; align-items center; gap 6px; font-weight 500; border-radius md; white-space nowrap; transition background-color 120ms, border-color 120ms, color 120ms; font-feature-settings inherit;` icon 14px (sm: 12px). Disabled: `opacity .5; cursor not-allowed`. Focus-visible: `outline 2px solid accent-600; outline-offset 2px`.

| Size | Height | Padding | Font |
|---|---|---|---|
| `sm` | 28px | 0 10px | 12px/16px |
| `md` (default) | 32px | 0 12px | 13px/20px |
| `lg` (login, empty-state CTA) | 36px | 0 14px | 13px/20px |
| `icon` | 28×28 / 32×32 | 0 | — |

| Variant | Rest | Hover | Active |
|---|---|---|---|
| primary | `bg accent-600; color #fff; border 1px solid accent-600` | `bg accent-700; border accent-700` | `bg accent-800` |
| secondary | `bg sand-0; color sand-900; border 1px solid sand-200` | `bg sand-25; border sand-300` | `bg sand-50` |
| ghost | `bg transparent; color sand-700; border 1px solid transparent` | `bg sand-100; color sand-900` | `bg sand-150` |
| danger | `bg sand-0; color danger-600; border 1px solid sand-200` | `bg danger-50; border danger-200` | `bg danger-50; color danger-700` |
| danger-solid (confirm in modal only) | `bg danger-600; color #fff` | `bg danger-700` | — |

No gradients, no inner shadow, no 1px bottom highlight.

### 6.10 Inputs / select / textarea

- Field: `height 32px; padding 0 10px; background sand-0; border 1px solid sand-200; border-radius md; font 13px/20px; color sand-900;` placeholder `sand-400`.
- hover: `border-color sand-300`. focus: `border-color accent-600; box-shadow 0 0 0 3px accent-100; outline none`.
- invalid: `border-color danger-600; box-shadow 0 0 0 3px danger-50`; error text 12px `danger-600` `margin-top 4px`.
- disabled: `background sand-50; color sand-500; border-color sand-150`.
- Select: same box; chevron 14px `sand-500` right 10px (`appearance none; padding-right 30px`).
- Textarea: `min-height 84px; padding 8px 10px; resize vertical`.
- Number/money inputs: `text-align right; tabular-nums`; money gets a `$` prefix adornment 13px `sand-500` inside the left padding.
- Label: `label` token, `margin-bottom 6px`; required mark `danger-600` "*" 4px after; hint 12px `sand-500` `margin-top 4px`.
- Checkbox: 16px `radius-xs` `border 1px solid sand-300`; checked `bg accent-600 border accent-600` with white 10px check; focus ring as inputs.
- Form grid (FormModal): `grid-template-columns 1fr 1fr; gap 16px 16px`; `span 2` fields full width.
- Tag input: chips are neutral pills (§6.8) with a 12px `X`; input inline.

### 6.11 Modal / drawer

- Scrim: `rgba(26,25,22,.32)`; `backdrop-filter none`.
- Modal: `width 560px (max-w-lg) / 720px (wide); background sand-0; border 1px solid sand-150; border-radius xl; shadow-modal; margin-top 8vh;`
  - header `padding 16px 20px; border-bottom hairline;` title `h2`; close ghost icon button 28px right.
  - body `padding 20px`; footer `padding 12px 20px; border-top hairline; display flex; justify-content flex-end; gap 8px; background sand-25; border-radius 0 0 xl xl`.
- Drawer (for Run check, Mark lost, quick edit when the record should stay visible): right-anchored `width 480px; height 100%; background sand-0; border-left hairline; shadow-modal;` same header/footer as modal; slides in 200ms.
- Destructive confirm: title in `sand-900`, one sentence body, `danger-solid` confirm + secondary cancel. No red header bars.

### 6.12 Tabs

- Rail: `display flex; gap 20px; border-bottom 1px solid sand-150; margin-bottom 20px;`
- Tab: `height 36px; padding 0 2px; font 13px/500; color sand-600; border-bottom 2px solid transparent; margin-bottom -1px;`
  - hover `color sand-900`. active `color sand-900; border-bottom-color sand-900` (**not accent** — content tabs are navigation, not action).
  - count: 11px mono `sand-500` `margin-left 6px`; no pill background.

### 6.13 Stage stepper (pursuit pipeline)

Replaces the block stepper on OpportunityDetailPage. Borrowed from Ramp's approval rail.

- Container: white card, `padding 16px 20px 14px; display grid; grid-template-columns repeat(N, 1fr);` plus a terminal "Close" cell `width 148px` at the right separated by a hairline.
- Each step: a 12px dot centered on a 1px horizontal rail that runs the full width (`background sand-150`); label beneath, `margin-top 10px`, 12px/500; probability beneath the label in `mono 11px sand-400`.
  - completed: dot `bg accent-600` with a 7px white check; rail segment to the left `accent-600`; label `sand-700`.
  - **current:** dot 14px `bg accent-600; box-shadow 0 0 0 4px accent-100`; label `sand-900` 600; "Day 23 in stage" 11px `sand-500` under probability.
  - future: dot `bg sand-0; border 1px solid sand-300`; label `sand-500`.
  - clickable (open opps, manager): hover raises label to `sand-900`; the step cell is a button with `radius md` and `bg sand-25` on hover.
- Gate indicator: if a step has an unmet gate (Clearance pending; engagement letter unsigned before Won), show a 12px `Lock` in `warn-600` after its label; tooltip explains the gate.
- Terminal cell: "Closed Won" `success-700` with `Trophy` 14px when won; "Lost · Price" `danger-700` when lost; otherwise "Close" `sand-400`.

### 6.14 Activity timeline

- List with a 1px vertical rail at `left 11px` (`background sand-150`).
- Item: `display grid; grid-template-columns 24px 1fr auto; gap 12px; padding 10px 0;` no borders between items.
- Icon disc: 24px circle `bg sand-0; border 1px solid sand-150;` lucide 12px `sand-600` (`Phone`, `Mail`, `Calendar`, `FileText`, `ArrowRightLeft` for stage change, `ShieldCheck` for clearance, `StickyNote` for note). Stage change and clearance discs use `accent-50`/`accent-600` and `success-50`/`success-600` respectively.
- Title 13px `sand-900` with actor in 500; body 12px `sand-600` 2-line clamp; timestamp right 12px `sand-500` tabular ("Aug 19 · 2:14 PM").
- Day groups: 11px/500 `sand-500` day header with `margin 8px 0 2px 36px`.
- Composer (top): 32px input styled as §6.10 with "Log a call, note, or meeting…" placeholder and a `sm` primary "Log" button.

### 6.15 Toast

- `position fixed; bottom 24px; right 24px; z-toast; width 360px; background sand-900; color #fff; border-radius xl; padding 12px 14px; shadow-toast; display flex; gap 10px; align-items flex-start;`
- icon 16px: success `success-200`, error `danger-200`, info `accent-200`. Title 13px/500; body 12px `sand-300`. Optional action link 12px/500 `accent-200`.
- Enter: `translateY(8px)→0 + opacity` 160ms ease-out; exit 120ms. Auto-dismiss 4s (errors 8s).

### 6.16 Empty state

- `padding 48px 24px; text-align center; max-width 360px; margin 0 auto;`
- 32px icon disc (`bg sand-100`, lucide 16px `sand-500`); title 13px/500 `sand-900` `margin-top 12px`; hint 12px `sand-500` `margin-top 4px`; optional `secondary` `sm` button `margin-top 16px`.
- No illustrations.

### 6.17 Charts (recharts)

Palette (categorical, in order): `#4B55C8` accent-600, `#9AA3DE` accent-300, `#1E7B4F` success-600, `#B4600F` warn-600, `#5F5B53` sand-600, `#C4BFB5` sand-300. Pipeline-by-stage uses accent-600 (amount) and accent-300 (weighted) — never green/teal for the same metric pair.

| Element | Spec |
|---|---|
| Grid | horizontal only; `stroke sand-100; strokeDasharray none` |
| Axes | `axisLine false; tickLine false;` tick font 11px `sand-500`; Y ticks compact money (`$1.2M`); `width 48`; X tick margin 8 |
| Bars | `radius [2,2,0,0]`, `barCategoryGap 28%`, `maxBarSize 40` |
| Lines / areas | stroke 1.5px; area fill 8% opacity; dots only on hover (`activeDot r=3`) |
| Tooltip | `contentStyle: { background:#1A1916, border:none, borderRadius:8, padding:'8px 10px', boxShadow:'var(--shadow-menu)' }`; `labelStyle` 11px `sand-300`; `itemStyle` 12px #fff tabular; `cursor: { fill: 'rgba(26,25,22,.04)' }`. Number formatting via `money()`. |
| Legend | Custom, rendered above the chart at right as 12px `sand-600` with 8px swatch squares (`radius 2`). Not recharts' default legend. |
| Height | 232px in a dashboard card; 160px in a rail card |
| Win/loss | A single horizontal stacked bar (won `success-600`, lost `danger-200`) 8px tall `radius full`, with the three numbers above it. Not a pie/donut. |

---

## 7. Motion

| Interaction | Duration / easing |
|---|---|
| Hover color/background/border changes | 120ms `cubic-bezier(.2,0,0,1)` |
| Focus ring | instant |
| Menu/search popover open | 120ms opacity + `translateY(-4px)→0`; close 80ms |
| Modal | scrim 160ms opacity; panel 180ms `opacity + scale(.98)→1` ease-out; close 120ms |
| Drawer | 200ms `translateX(16px)→0` ease-out |
| Toast | see §6.15 |
| Kanban card pickup | 120ms shadow + scale; drop settles 160ms `cubic-bezier(.2,0,0,1)` |
| Tab underline | 150ms `left/width` |
| Skeleton pulse | 1.4s ease-in-out infinite, opacity .6↔1 |

**Never animates:** page/route entry, KPI numbers (no count-up), charts (recharts `isAnimationActive={false}`), table rows, sidebar items, sparklines. `prefers-reduced-motion: reduce` disables everything except the focus ring.

---

## 8. Anti-patterns — the "AI look" to avoid

1. Uppercase, letter-spaced micro-labels on every card and column header.
2. Full-width colored blocks for steppers; accent-filled active nav items.
3. Gradients, glassmorphism, `backdrop-filter`, glow shadows, "soft UI" drop shadows on cards.
4. Cool slate gray + teal/emerald accent (the default Tailwind CRM palette).
5. Icons inside KPI tiles; circular icon badges in pastel squares.
6. Every badge as a filled pill; rainbow statuses where the same tone means different things.
7. Pie and donut charts; default recharts legend; default white tooltip with a gray border.
8. Cards nested inside cards; cards with both a border and a shadow.
9. Centered hero-style empty states with illustrations.
10. Count-up number animations, fade-in-on-load sections, staggered card entrances.
11. Emoji in the UI. Exclamation marks in copy. "Welcome back! 👋".
12. Rounded-2xl everything; 12px+ radii on buttons and inputs.
13. Changing a whole card border to amber/red to signal state — use an edge bar, dot, or icon.
14. Spinners for table loads (use skeletons).
15. Inconsistent numeral alignment — any money column not right-aligned tabular is a bug.

---

## 9. Migration notes for the engineer

- `slate-*` → `sand-*` (same step numbers where they exist; `slate-50`→`sand-50`, `slate-100`→`sand-100`, `slate-200`→`sand-150`, `slate-300`→`sand-200`, `slate-400`→`sand-400`, `slate-500`→`sand-500`, `slate-600`→`sand-600`, `slate-700`→`sand-700`, `slate-800`→`sand-800`, `slate-900`→`sand-900`).
- `emerald-*`→`success-*`, `amber-*`→`warn-*`, `red-*`→`danger-*`, `sky-*`→`info-*`, `violet-*`→ neutral chip with icon.
- `.label`: drop `uppercase tracking-wide`, set 12px/500.
- `Stat` → `KpiTile` with `delta`, `deltaGood`, `context`, `spark: number[]` props (sparkline as inline SVG, §6.5).
- The four mini-cards on detail pages → one `FactsGrid` card (§6.4).
- The block stepper → `StageRail` (§6.13).
- `Badge` gains `variant="dot" | "pill"`; `statusTone` maps to `success | warn | danger | info | neutral`.
- recharts: set `isAnimationActive={false}`, custom `Legend content`, tooltip styles from §6.17.
- Do not add a `dark:` layer in this pass; tokens are light-only by design.
