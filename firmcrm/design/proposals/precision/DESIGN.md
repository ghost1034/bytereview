# FirmCRM — Design Direction C: "Precision"

High-contrast developer-tool precision for a professional-services CRM. Dark graphite chrome (sidebar + top bar) framing a light content canvas. Geist Sans for UI, Geist Mono for every number, ID and date. One accent (blue) used only for focus, selection and links. Primary actions are ink black, not accent. Hairline borders, no decorative shadows, three radii, tabular numerals everywhere.

This document is the implementation spec. Every value an engineer needs is here; nothing is left to taste.

---

## 0. Decision: dark chrome + light canvas (not fully dark)

Partners and BD staff use this next to Word, Outlook, Excel and a PDF of an engagement letter; a light canvas matches the documents they read all day and prints cleanly. The dark chrome does the job Vercel's black header and Raycast's dark palette do: it frames the work surface, makes the navigation recede, and gives the product a recognizable silhouette at a glance. A full dark theme is specified as a token set (section 2.4) but is **not** required for v1.

---

## 1. References and what was borrowed

| Product | Pattern borrowed | Where it lands in FirmCRM |
|---|---|---|
| **Vercel** (dashboard, project tables, deployment detail) | Black primary button on white; `#eaeaea`-class hairline borders; gray scale with no blue tint; 13px UI text; tables with 40px rows, uppercase 11px column headers, right-aligned mono numbers; stat tiles that are just label + big number + hairline, no icon; tab bar with a 2px ink underline; "Activity" list as left-bordered timeline | Buttons, borders, neutral scale, data table, KPI tiles, tabs, activity timeline |
| **Raycast** (command palette, Store, extension lists) | ⌘K palette geometry (640px wide, 14px input, grouped results with 11px section labels, right-aligned `kbd` hints); `kbd` chip style (mono, 1px border, 4px radius); dense 28px list rows with 16px icons; the dark surface `#0a0a0a → #111 → #1a1a1a` stack | Command palette, shortcut hints, sidebar row density, dark chrome token stack |
| **Arc** (sidebar) | Section labels in small caps above groups (Pinned / Workspace / Records); sidebar rows with no left indicator bar — selection is a translucent filled pill; count badges right-aligned in the row; compact profile switcher pinned at the bottom | Sidebar sections, nav active state, count badges, bottom user block |
| **Resend** (emails table, API keys, logs) | Status as a 6px dot + text rather than a coloured pill; mono for IDs/timestamps in tables; monochrome bar charts (light gray series + ink series) on 1px dotted gridlines | Status cells, Kanban footer meta, pipeline chart palette |
| **Linear** (board only) | Kanban columns as bordered-on-one-side lanes rather than floating gray boxes; column header with count in mono and a sum; card hover lifts border colour only, never shadow | Board lanes, card hover |

Things deliberately **not** borrowed: Vercel's gradient hero treatments, Raycast's glass blur, Arc's colour-tinted spaces. None belong in a conflicts-and-fees tool.

---

## 2. Tokens (Tailwind v4 `@theme`)

Drop this block into `index.css` replacing the current `@theme`. All colours are hex; no alpha except where noted for overlays and dark-chrome hover states.

```css
@import "@fontsource-variable/geist";
@import "@fontsource-variable/geist-mono";
@import "tailwindcss";

@theme {
  /* ---------- Typography ---------- */
  --font-sans: "Geist Variable", Geist, Inter, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "Geist Mono Variable", "Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* ---------- Neutral scale (pure gray, no tint) ---------- */
  --color-gray-0:    #ffffff;
  --color-gray-50:   #fafafa;   /* canvas */
  --color-gray-100:  #f5f5f5;   /* table header, kbd bg, hover row */
  --color-gray-200:  #ebebeb;   /* hairline border (primary) */
  --color-gray-300:  #e0e0e0;   /* hairline border (strong), chart series A */
  --color-gray-400:  #c2c2c2;   /* disabled text, placeholder */
  --color-gray-500:  #8f8f8f;   /* tertiary text, icons */
  --color-gray-600:  #6e6e6e;   /* secondary text */
  --color-gray-700:  #525252;
  --color-gray-800:  #3d3d3d;
  --color-gray-900:  #262626;
  --color-gray-950:  #171717;   /* ink: headings, primary button, chart series B */
  --color-gray-1000: #0a0a0a;   /* chrome bg */

  /* ---------- Accent (focus, selection, links) ---------- */
  --color-accent-50:  #eef4ff;
  --color-accent-100: #dbe7ff;
  --color-accent-200: #b8cfff;
  --color-accent-300: #8aaeff;
  --color-accent-400: #5b86f7;
  --color-accent-500: #3b6cf6;
  --color-accent-600: #2f5ae0;   /* link, focus ring, active sidebar icon */
  --color-accent-700: #2547b8;
  --color-accent-800: #1e3a8f;
  --color-accent-900: #172c6b;

  /* ---------- Semantic ---------- */
  --color-success-500: #17a34a;  --color-success-600: #15803d;  --color-success-50: #f0fdf4;  --color-success-200: #bbf7d0;
  --color-warn-500:    #e5a10f;  --color-warn-600:    #b45309;  --color-warn-50:    #fffbeb;  --color-warn-200:    #fde68a;
  --color-danger-500:  #e5484d;  --color-danger-600:  #c52a30;  --color-danger-50:  #fef2f2;  --color-danger-200:  #fecaca;
  --color-info-500:    #3b6cf6;  --color-info-600:    #2f5ae0;  --color-info-50:    #eef4ff;  --color-info-200:    #b8cfff;

  /* ---------- Dark chrome (sidebar + top bar) ---------- */
  --color-chrome-bg:        #0a0a0a;
  --color-chrome-raised:    #111111;   /* top bar, search field */
  --color-chrome-border:    #1f1f1f;
  --color-chrome-hover:     rgba(255,255,255,0.06);
  --color-chrome-active:    rgba(255,255,255,0.10);
  --color-chrome-text:      #ededed;
  --color-chrome-text-2:    #a1a1a1;
  --color-chrome-text-3:    #6e6e6e;

  /* ---------- Radii (exactly three + pill) ---------- */
  --radius-sm:   4px;    /* inputs, buttons, kbd, badges, table header pills */
  --radius-md:   6px;    /* cards, kanban cards, popovers */
  --radius-lg:   8px;    /* modal, drawer, command palette */
  --radius-pill: 9999px; /* avatars, dot badges only */

  /* ---------- Border ---------- */
  --border-hair: 1px;    /* the only border width used on surfaces */

  /* ---------- Shadow (overlays only) ---------- */
  --shadow-overlay: 0 0 0 1px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.12);
  --shadow-palette: 0 0 0 1px rgba(0,0,0,0.08), 0 16px 48px rgba(0,0,0,0.24);

  /* ---------- Spacing (4px base) ---------- */
  --spacing-0_5: 2px;  --spacing-1: 4px;  --spacing-1_5: 6px;  --spacing-2: 8px;
  --spacing-2_5: 10px; --spacing-3: 12px; --spacing-4: 16px;   --spacing-5: 20px;
  --spacing-6: 24px;   --spacing-8: 32px; --spacing-10: 40px;  --spacing-12: 48px;

  /* ---------- Z-index ---------- */
  --z-sticky:   10;   /* sticky table header, column header */
  --z-dropdown: 20;
  --z-drawer:   30;
  --z-modal:    40;
  --z-palette:  50;
  --z-toast:    60;
}
```

### 2.1 Surface roles (light canvas)

| Role | Token | Notes |
|---|---|---|
| Canvas | `gray-50` `#fafafa` | `<main>` background |
| Card / panel / table | `gray-0` `#ffffff` | 1px `gray-200` border, `radius-md` |
| Table header, inset areas | `gray-100` | |
| Primary border | `gray-200` | Everywhere unless stated |
| Strong border | `gray-300` | Inputs at rest, hover on cards |
| Heading / primary text | `gray-950` | |
| Body text | `gray-900` | |
| Secondary text | `gray-600` | |
| Tertiary / meta | `gray-500` | |
| Disabled / placeholder | `gray-400` | |

### 2.2 Text colour rules
- Never use pure `#000` for text; `gray-950` is the darkest.
- Accent text only for links and active tab labels; never for body copy or numbers.
- Semantic colours are used for the status **dot**, the stale **bar**, and inline alerts — not for whole tiles or large areas.

### 2.3 Contrast floor
All text meets WCAG AA: `gray-600` on `gray-0` = 5.7:1; `gray-500` on `gray-0` = 3.9:1 and is therefore restricted to ≥12px meta text and icons; `chrome-text-2` on `chrome-bg` = 7.6:1.

### 2.4 Optional full-dark theme (not v1)
Map: canvas → `#0a0a0a`, card → `#111111`, border → `#262626`, strong border → `#333333`, ink → `#ededed`, body → `#d4d4d4`, secondary → `#a1a1a1`, tertiary → `#6e6e6e`. Chrome tokens stay as defined. Accent stays `accent-500` for focus (`#3b6cf6` has 5.1:1 on `#0a0a0a`).

---

## 3. Typography

**Family:** Geist Sans (UI) + Geist Mono (numbers, IDs, dates, shortcut hints). Self-host via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`. Fallback stack is Inter → system.

**Global:** `html { font-size: 13px; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-feature-settings: "cv11", "ss01"; }` body colour `gray-900` on `gray-50`.

| Style | Size / line | Weight | Tracking | Font | Use |
|---|---|---|---|---|---|
| display | 28 / 32 | 600 | -0.025em | Sans | Login, empty-state hero only |
| h1 | 20 / 28 | 600 | -0.02em | Sans | Page title |
| h2 | 14 / 20 | 600 | -0.01em | Sans | Card title, modal title |
| h3 | 13 / 20 | 600 | -0.005em | Sans | Kanban card title, table primary cell |
| body | 13 / 20 | 400 | 0 | Sans | Default |
| body-strong | 13 / 20 | 500 | 0 | Sans | Names, row primary |
| caption | 12 / 16 | 400 | 0 | Sans | Secondary lines, sub-labels |
| micro | 11 / 16 | 400 | 0 | Sans | Timestamps in timeline |
| label | 11 / 16 | 500 | +0.06em, uppercase | Sans | Table headers, section labels, KPI labels, sidebar groups |
| mono | 13 / 20 | 400 | 0 | Mono | Table numerics, fees on cards, dates in tables |
| mono-sm | 12 / 16 | 400 | 0 | Mono | Card meta, badges with numbers, column counts |
| mono-kpi | 24 / 28 | 500 | -0.01em | Mono | KPI tile value |
| mono-kpi-lg | 32 / 36 | 500 | -0.02em | Mono | Detail-page hero amount |
| kbd | 11 / 16 | 500 | 0 | Mono | Shortcut chips |

**Tabular numerals rule:** every element rendering a number, date, percentage, currency or ID uses `font-family: var(--font-mono); font-variant-numeric: tabular-nums;`. Apply via a `.num` utility and `[data-numeric]`. Geist Mono is already monospaced; the `tabular-nums` flag is belt-and-braces for fallback fonts. Sans text never renders money.

**Currency formatting:** `$425,000` in tables and cards; `$4.65M` / `$521K` in KPI tiles, column headers and chart axes. Negative values use a true minus `−` (U+2212), never a hyphen. Percentages use `%` with no space: `60%`.

**Dates:** `Oct 30, 2026` in body; `10/30` never; relative time (`3d ago`) only in timeline and stale meta.

---

## 4. Layout

### 4.1 App shell geometry

```
┌ sidebar 240 ┬─────────────── top bar 48 ───────────────┐
│ chrome-bg   │ chrome-raised                             │
│             ├───────────────────────────────────────────┤
│             │ canvas gray-50, padding 24                │
│             │ content max-width: none (tables, board)   │
│             │ dashboard grid max-width: 1440 centered   │
└─────────────┴───────────────────────────────────────────┘
```

| Element | Value |
|---|---|
| Sidebar width | 240px (expanded), 56px (rail) |
| Sidebar padding | 12px horizontal, 8px top |
| Sidebar row | height 28px, padding 0 8px, gap 10px, radius-sm |
| Sidebar section gap | 20px between groups; label 11/16 uppercase `chrome-text-3`, padding 0 8px 6px |
| Top bar | height 48px, `chrome-raised` bg, bottom border `chrome-border` |
| Canvas padding | 24px all sides |
| Page header → content gap | 20px |
| Card gap in grids | 16px |
| Section gap (vertical stack) | 20px |
| Dashboard max-width | 1440px centered; tables and board full bleed |

The sidebar and top bar are **both** dark; the canvas starts immediately under the top bar. The top bar is part of the chrome, not the page (it holds breadcrumb/context, ⌘K search, and the user's quick actions; page titles live in the page header on the canvas).

### 4.2 Responsive rules

| Viewport | Behaviour |
|---|---|
| ≥1440 | As drawn. Dashboard KPI row is 6 columns. Board: rail sidebar, five lanes fill the width. |
| 1280–1439 | KPI row 3×2. Board lanes at their 224px minimum, horizontal scroll if needed. |
| 1024–1279 | Sidebar collapses to 56px icon rail (labels on hover tooltip). KPI 3×2. Detail pages 2-col → 1-col sidebar stacks below. |
| <1024 | Sidebar becomes an overlay drawer (toggle in top bar). Tables gain horizontal scroll with first column sticky. Board switches to table view by default. |

No layout changes between 1440 and 1920; content does not stretch beyond 1440 on the dashboard, and tables use the full width.

---

## 5. Components

All values are CSS; Tailwind classes follow from the tokens above.

### 5.1 Sidebar

- Container: `width 240px; background chrome-bg; border-right 1px chrome-border; display flex; flex-direction column`.
- **Brand block** (top, 48px tall to align with top bar): 20×20 black-on-white square glyph with letter `F` (radius-sm, `gray-0` bg, `gray-1000` text, Geist 12/600), firm name `Hargrove & Whitlock LLP` 13/500 `chrome-text`, chevron-up-down icon 14px `chrome-text-3` at right (workspace switcher affordance, Vercel team switcher). Hover: bg `chrome-hover`.
- **Section labels:** `PINNED`, `PIPELINE`, `RECORDS`, `ADMIN` — 11/500 uppercase tracking +0.06em `chrome-text-3`.
- **Nav row:** 28px high, radius-sm, 16px lucide icon (`stroke-width 1.75`), label 13/400.
  - Default: text `chrome-text-2`, icon `chrome-text-3`.
  - Hover: bg `chrome-hover`, text `chrome-text`.
  - Active: bg `chrome-active`, text `chrome-text` 500 weight, icon `chrome-text`. **No left accent bar.**
  - Focus-visible: `box-shadow: 0 0 0 2px accent-500` inside the dark chrome.
  - Trailing count: mono-sm `chrome-text-3`; when the count is an exception (pending clearances, overdue tasks) it renders `warn-500` text. Right-aligned, 8px from edge.
- **Bottom block:** 1px top border `chrome-border`, 56px tall, 24px avatar (initials, `gray-800` bg, `chrome-text` 11/500), name 13/500, role caption 11 `chrome-text-3`, settings and sign-out icons 16px `chrome-text-3` with hover to `chrome-text`.
- **Rail mode (56px):** rows become 40×32 icon squares centered in the rail, labels removed, section labels replaced by a 1px `chrome-border` hairline with 12px padding, active state is the same filled square, tooltip on hover at 8px offset. Exception counts collapse to a 6px `warn-500` dot at the row's top-right. Brand block shows the glyph only; user block shows the avatar only.
- **Toggle:** `⌘\` (Arc's sidebar shortcut) and a chevron button at the far left of the top bar. State is persisted per user. **The Opportunities board opens with the rail by default** so five lanes plus the Won/Lost zones fit at 1440 without horizontal scroll; every other route opens expanded. Navigating away from the board restores the user's last explicit choice.

### 5.2 Top bar and ⌘K search

- Bar: 48px, `chrome-raised`, `border-bottom 1px chrome-border`, padding 0 16px, grid `auto 1fr auto`.
- **Left:** breadcrumb/context in 13px `chrome-text-2` (`Opportunities / Atlas Freight Systems`), separators `/` in `chrome-text-3`.
- **Center:** search trigger, not an input. 360px wide, 32px tall, bg `#161616`, border 1px `#262626`, radius-sm, 14px search icon `chrome-text-3`, placeholder `Search accounts, contacts, opportunities…` 13px `chrome-text-3`, right-aligned `kbd` `⌘K`. Hover: border `#333`. Clicking or pressing ⌘K opens the palette.
- **Right:** `New` split button (ghost, chrome variant, `kbd N`), notifications icon, date `Sat, Aug 22` mono-sm `chrome-text-3`.
- **Command palette (Raycast geometry):** fixed, top 12vh, centered, width 640px, `gray-0` bg, radius-lg, `shadow-palette`, border 1px `gray-200`. Input row 52px: 16px search icon, 14px Sans input, right `kbd Esc`. Results: section labels 11 uppercase `gray-500` at padding 12px 12px 4px; rows 36px, 16px icon `gray-500`, primary 13/500 `gray-950`, secondary 12 `gray-500` inline after a `·`, right-aligned hint (`Account`, `Jump to`, `↵`). Selected row: bg `gray-100`, no accent. Footer 32px, `gray-50` bg, top border, hints `↑↓ navigate  ↵ open  ⌘↵ new tab`. Backdrop `rgba(0,0,0,0.4)`. Actions group (`Create opportunity N`, `Run conflict check`, `Go to board G B`) always listed under a `COMMANDS` label when the query is empty.

### 5.3 Page header

- Row 1: title h1 20/600 `gray-950`; inline status badges after the title with 8px gap; actions right-aligned, 8px gap.
- Row 2 (optional): 13px `gray-600` subtitle; links in subtitle are `gray-900` underline-on-hover, not accent.
- Bottom margin 20px. No divider line under the header; the first card provides the edge.
- Breadcrumb lives in the top bar, not above the title (avoids the double-title look).

### 5.4 KPI stat tile

```
┌──────────────────────────────┐  height 88px, padding 14px 16px
│ OPEN PIPELINE                │  label 11/500 uppercase gray-500
│ $4.65M                       │  mono-kpi 24/500 gray-950, margin-top 6px
│ 12 opportunities      ▲ 8.2% │  caption 12 gray-500 · delta mono-sm
└──────────────────────────────┘
```
- Card: `gray-0`, 1px `gray-200`, radius-md. No icon, no coloured background, no sparkline by default.
- Delta (optional): mono-sm; `success-600` for favourable, `danger-600` for unfavourable, `gray-500` for neutral; arrow glyph `▲`/`▼` as text.
- Exception tiles (stale, pending clearances): the **value** stays `gray-950`; a 6px `warn-500` dot precedes the caption text. The tile itself is never tinted.
- Hover (when clickable): border → `gray-300`. Cursor pointer.

### 5.5 Data table

| Property | Value |
|---|---|
| Container | card (`gray-0`, 1px `gray-200`, radius-md, overflow clip) |
| Header row | height 36px, bg `gray-100`, bottom border 1px `gray-200`, `position: sticky; top: 0; z-index: var(--z-sticky)` |
| Header cell | label style 11/500 uppercase +0.06em `gray-500`, padding 0 12px, `white-space: nowrap`; sortable shows 12px chevron on hover, `gray-950` + solid chevron when sorted |
| Body row | height 40px (dense variant 32px), bottom border 1px `gray-200`; last row no border |
| Body cell | padding 0 12px, 13/400 `gray-900`, `vertical-align: middle`; primary cell 13/500 `gray-950` |
| Numeric cell | `text-align: right; font-family: mono; font-variant-numeric: tabular-nums`; header also right-aligned |
| Hover | bg `gray-50` |
| Selected | bg `accent-50`, left inner 2px `accent-500` via `box-shadow: inset 2px 0 0 accent-500` |
| Focused row (keyboard) | `box-shadow: inset 0 0 0 1px accent-500` |
| Row click | whole row is a link; cursor pointer |
| Empty | see 5.14 |
| Footer / pagination | height 44px, top border, mono-sm `1–50 of 212`, ghost icon buttons, page-size select |
| Sticky first column (<1024) | `position: sticky; left: 0; background inherit; box-shadow: 1px 0 0 gray-200` |

Status cells use the **dot + text** pattern (5.7), not pills, so a table of 50 rows has no coloured rectangles.

### 5.6 Kanban board

**Lane**
- Width: `flex: 1 1 224px; min-width: 224px; max-width: 272px` so five lanes fill the canvas exactly at 1440 with the rail sidebar (5 × ~224 + 212 for zones = 1336 canvas) and grow to 272 on wider screens. More than five open stages, or an expanded sidebar, yields horizontal scroll with the lane headers sticky. Gap between lanes 0; each lane has `border-right 1px gray-200` (last lane none). Lane background = canvas (`gray-50`), no fill.
- Header: height 44px, sticky within the scroll container, bg `gray-50`, padding 0 12px, bottom border 1px `gray-200`. Contents: stage name 13/500 `gray-950`; count in mono-sm `gray-500` inside a 18px-tall `gray-100` chip with radius-sm; right side: sum mono-sm `gray-600` (`$885K`) and probability mono-sm `gray-400` (`25%`).
- Body: padding 8px, gap 8px, overflow-y auto.
- Drag-over: header bottom border → `accent-500` 2px and lane bg `accent-50`. Nothing else changes.

**Card** (`gray-0`, 1px `gray-200`, radius-md, padding 10px 12px)
```
┌───────────────────────────────────────┐
│ Breach of supply agreement v.      🛡 │  title h3 13/600 gray-950, 2-line clamp; shield 14px top-right
│ Brightline Freight                    │
│ Atlas Freight Systems                 │  caption 12 gray-600
│                                       │
│ $425,000                 Oct 30       │  mono 13/500 gray-950 · mono-sm gray-500
│ Litigation · DO          ● 12d        │  caption 12 gray-500 · avatar 18px · days-in-stage mono-sm
└───────────────────────────────────────┘
```
- Hover: border → `gray-400`. Active/dragging: border `accent-500`, `opacity .9`, `transform: rotate(0)` (no tilt).
- Selected (keyboard): `box-shadow: 0 0 0 2px accent-500`.
- **Clearance shield** (top-right, 14px lucide):
  - Cleared / waived: `shield-check`, `success-600`.
  - Pending review / not run where required: `shield`, `warn-600`, with a 5px `warn-500` dot overlapping the shield's top-right corner.
  - Conflict found: `shield-alert`, `danger-600`.
  - Not required: no icon (the space is empty; title uses full width).
  - Tooltip on hover: `Conflict check · pending review · 2 potential matches`.
- **Stale indicator:** 2px `warn-500` bar on the card's left edge (`box-shadow: inset 2px 0 0 warn-500`) **and** the days-in-stage meta turns `warn-600` with the text `24d · stale`. Nothing else on the card is tinted. Threshold: ≥21 days, from the API flag.
- **Gate blocked hint** (Negotiation lane only): if engagement letter ≠ signed, meta row shows `EL drafted` in `gray-500`; the Won zone shows why on drag-over (see below).

**Won / Lost drop zones** (right of the last lane, 200px wide column, 12px gap, two zones stacked with 8px gap)
- Rest: 1px dashed `gray-300`, radius-md, text 12/500 `gray-500` centered: `Drop to mark Won` / `Drop to mark Lost`, with a `kbd` beneath (`⇧W` / `⇧L`) for keyboard move of the selected card.
- Drag-over Won: border solid `success-500`, bg `success-50`, text `success-600`. If the card fails the gate, the zone instead reads `Blocked · clearance pending` with `danger-600` text and a solid `danger-500` border — the drop is refused.
- Drag-over Lost: border solid `danger-500`, bg `danger-50`, text `danger-600`. Drop opens the Mark-lost modal.

**Board footer hint:** 11px `gray-500`: `Drag cards between stages · ↑↓←→ select · ⇧W won · ⇧L lost · Won requires clearance and a signed engagement letter.`

### 5.7 Status: dot + text (tables, meta) and badge (headers, chips)

**Dot + text** (default in tables and card meta): 6px circle, 6px gap, text 13 `gray-900`. Dot colours:

| State family | Dot | Examples |
|---|---|---|
| positive | `success-500` | Won, Client, Clear, Signed, Active, Qualified, Completed |
| negative | `danger-500` | Lost, Conflict, Adverse party, Terminated, High risk |
| attention | `warn-500` | Pending, Sent, On hold, Medium, Drafted, Stale |
| informational | `accent-500` | Prospect, New, Open, Registered |
| neutral | `gray-400` | Not started, Archived, Unknown |
| special | `gray-800` | Waived, Referral source, Converted |

**Badge** (page header, card chips, counts): height 20px, padding 0 6px, radius-sm, 11/500, 1px border. Neutral: bg `gray-100`, border `gray-200`, text `gray-700`. Tinted variants use the `-50` bg, `-200` border, `-600` text of the semantic family. Badges never contain icons except the 10px lock in `Restricted`. Practice-area chips on cards are neutral badges.

### 5.8 Buttons

| Variant | Bg | Text | Border | Hover | Active |
|---|---|---|---|---|---|
| primary | `gray-950` | `gray-0` | `gray-950` | bg `gray-800` | bg `gray-900` |
| secondary | `gray-0` | `gray-900` | `gray-300` | bg `gray-50`, border `gray-400` | bg `gray-100` |
| ghost | transparent | `gray-700` | transparent | bg `gray-100`, text `gray-950` | bg `gray-200` |
| danger | `gray-0` | `danger-600` | `danger-200` | bg `danger-50`, border `danger-500` | bg `danger-50` |
| danger-solid (confirm only) | `danger-600` | `gray-0` | `danger-600` | bg `danger-500` | |
| chrome (top bar) | transparent | `chrome-text-2` | `#262626` | bg `chrome-hover`, text `chrome-text` | |

- Sizes: `sm` 28px / padding 0 10px / 12px text; `md` 32px / padding 0 12px / 13px text; `lg` 36px / padding 0 14px / 13px text. Icon-only: square of the same height.
- Radius-sm. Weight 500. Icon 14px (sm: 12px) with 6px gap.
- **Shortcut hint:** trailing `kbd` inside the button (`New opportunity  N`), 6px left margin, only on `md`/`lg` primary and secondary; inverted palette inside primary (`kbd` bg `rgba(255,255,255,.12)`, border `rgba(255,255,255,.2)`, text `gray-0`).
- Focus-visible: `box-shadow: 0 0 0 2px gray-0, 0 0 0 4px accent-500`.
- Disabled: `opacity .45; cursor: not-allowed`; tooltip explains the gate (`Clearance check required`).
- Loading: label stays, 12px spinner replaces the icon; width locked to prevent shift.

### 5.9 Inputs, select, textarea, checkbox

- Height 32px (`sm` 28px). Bg `gray-0`, 1px `gray-300`, radius-sm, padding 0 10px, 13px `gray-950`, placeholder `gray-400`.
- Hover: border `gray-400`. Focus: border `accent-500`, `box-shadow: 0 0 0 3px accent-100`. Error: border `danger-500`, ring `danger-50`, helper text 12 `danger-600` below.
- Disabled: bg `gray-50`, text `gray-500`, border `gray-200`.
- Field label: label style 11/500 uppercase `gray-600`, 6px below; required marker is a trailing ` *` in `gray-500`, not red.
- Select: native `<select>` styled as above with a 14px chevron-down at right 8px (background-image SVG). No custom dropdown in v1.
- Textarea: min-height 80px, padding 8px 10px, `resize: vertical`. The party-list textarea in Run-check uses mono 12.
- Checkbox: 14px, radius 3px, border `gray-400`; checked bg `gray-950`, check glyph `gray-0`. Focus same ring as inputs.
- Numeric input (probability): mono, right-aligned.
- Search/filter inputs in the filter bar: 32px, with 14px leading icon `gray-500`, width per content (220/120/180/200 as today).

### 5.10 Modal and drawer

- **Modal:** width 520px (`lg` 720px), `gray-0`, radius-lg, 1px `gray-200`, `shadow-overlay`, top 10vh centered. Header 52px: h2 14/600, close icon button 28px ghost at right. Body padding 20px; form fields stacked with 16px gap, two-column grid for `span: 1` fields at 16px gap. Footer 56px, top border `gray-200`, bg `gray-50`, buttons right-aligned (`Cancel` secondary, confirm primary or danger-solid), optional left-aligned `kbd ⌘↵` hint. Backdrop `rgba(0,0,0,0.4)`. Esc closes; focus trapped.
- **Drawer** (record quick-view from board/table): right-anchored, 480px, full height, `gray-0`, left border 1px `gray-200`, `shadow-overlay`. Header 48px with title and `Open full record ↗` ghost button. No radius.

### 5.11 Tabs

- Container: `border-bottom 1px gray-200`. Tab: height 36px, padding 0 12px, 13/500 `gray-600`; hover text `gray-950`; active text `gray-950` with `box-shadow: inset 0 -2px 0 gray-950` (ink underline, not accent). Count: mono-sm in a 18px `gray-100` chip, 6px gap. Gap between tabs 4px. Focus-visible ring as buttons.

### 5.12 Toast

- Bottom-right, 16px inset, stacked 8px, width 360px. `gray-950` bg, `gray-0` text 13/500, radius-md, padding 10px 12px, 14px status icon (`check` `success-500`, `alert-circle` `danger-500`, `info` `gray-400`), optional action link `gray-0` underline, close icon. Auto-dismiss 4s (errors persist). Enters from 8px below with opacity, 160ms.

### 5.13 Empty state

- Inside card: padding 40px 24px centered. 20px lucide icon `gray-400` (outline, 1.5 stroke), title 13/500 `gray-900`, hint 12 `gray-500`, optional secondary button with `kbd`. No illustration, no gradient blob.

### 5.14 Stage stepper (pursuit pipeline)

Replaces the filled-block stepper with a **segmented rail**:

```
 ● Identified ── ● Qualified ── ● Clearance ── ○ Proposal ── ○ Negotiation ──▶ Closed
   10%             25%            40%            60%            80%
```
- Container card, height 60px, padding 0 16px, `display:flex; align-items:center`.
- Each step: 10px node + name 13/500 + probability mono-sm `gray-500` underneath; connector 1px line, `flex:1`, 12px margins.
- Past: node filled `gray-950`, connector `gray-950`, label `gray-600`.
- Current: node filled `gray-950` with `box-shadow: 0 0 0 3px gray-200`, label `gray-950` 600.
- Future: node `gray-0` with 1px `gray-400` border, connector `gray-300`, label `gray-500`.
- Gate steps (Clearance) show a 12px shield after the label in the status colour; blocked steps show a 12px `lock` `gray-400`.
- Terminal cell (right, 140px): `Closed Won` badge success / `Lost · price` badge danger / `Close` ghost text `gray-400`.
- Steps are buttons (`Move to Proposal` tooltip); moving backwards is allowed, moving to Won goes through the gate check.

### 5.15 Activity timeline

- Left rail: 1px `gray-200` line at x=8px; each entry has a 16px icon in a 20px `gray-0` circle with 1px `gray-200` border sitting on the line (icon per type: `phone`, `mail`, `calendar`, `file-text`, `arrow-right` for stage moves, `shield` for checks).
- Entry: padding-left 32px, 14px vertical gap. Row 1: 13/500 `gray-950` actor + 13 `gray-900` verb/summary (`Dana Okafor logged a call with Maria Chen`). Row 2: 12 `gray-600` body, 3-line clamp with `Show more`. Row 3: micro 11 mono `gray-500` timestamp `Aug 21, 2026 · 14:32` + `·` + linked entity.
- Day dividers: label 11 uppercase `gray-500` with hairline each side, 24px above/below.
- Composer at top: 32px input `Log an activity… (A)`, expands to textarea + type select + date on focus.

### 5.16 Charts (recharts)

- **Palette:** series A `gray-300` `#e0e0e0` (Amount), series B `gray-950` `#171717` (Weighted). Stale markers `warn-500`. Won/lost donut: won `gray-950`, lost `gray-300`. Never more than two fills per chart; a third dimension becomes a second chart.
- **Bars:** `radius={[2,2,0,0]}`, `barGap 2`, `barCategoryGap 28%`, `maxBarSize 40`. No gradients.
- **Grid:** `CartesianGrid vertical={false} stroke="#ebebeb" strokeDasharray="2 4"`.
- **Axes:** `axisLine={false} tickLine={false}`, tick `{ fontSize: 11, fill: "#8f8f8f", fontFamily: var(--font-mono) }`; Y axis width 48, tick formatter `$521K`; X axis labels Sans 11 `gray-600`, no rotation (abbreviate stage names if needed).
- **Tooltip:** `cursor={{ fill: "#f5f5f5" }}`, content style `{ background:#171717, border:none, borderRadius:6, padding:"8px 10px", color:"#ededed", fontSize:12 }`, label 11 uppercase `#a1a1a1`, values mono. Item order: Weighted first.
- **Legend:** none inside the chart; legend is text in the card header (`■ Amount  ■ Weighted`, 11px, 8px squares).
- **Hover on bar:** fill shifts to `accent-500` for that bar only (`activeBar`).
- **Height:** 240px dashboard; 180px in detail cards. Chart is followed by the stage table in the same card, separated by a hairline.
- **No animation on load** (`isAnimationActive={false}`) — tables and charts should appear at once.

---

## 6. Motion

| Thing | Duration | Easing | Notes |
|---|---|---|---|
| Hover colour/border changes | 100ms | `cubic-bezier(.2,0,0,1)` | `transition: background-color, border-color, color` |
| Focus ring | 0ms | — | Instant; never animate focus |
| Command palette open | 120ms | same | opacity 0→1 + `translateY(-4px)`→0; close 80ms |
| Modal open | 140ms | same | opacity + `scale(.98)`→1; backdrop opacity 140ms |
| Drawer | 180ms | `cubic-bezier(.32,.72,0,1)` | `translateX(8px)`→0 with opacity; not a full-width slide |
| Toast | 160ms in / 120ms out | same as palette | |
| Kanban drag | 0ms | — | Native drag image; lane highlight instant |
| Kanban card reorder | 0ms | — | No layout animation in v1 |
| Tabs underline | 0ms | — | Jumps; no sliding indicator |
| Charts | 0ms | — | `isAnimationActive={false}` |
| Numbers / KPI | 0ms | — | Never count up |
| Skeletons | 1.2s loop | linear | `gray-100`→`gray-200` pulse, only for ≥300ms loads |

`prefers-reduced-motion: reduce` sets every duration to 0.

---

## 7. Anti-patterns (the "AI look") — do not ship any of these

1. Gradient backgrounds, gradient text, glowing borders, "glassmorphism" blur panels.
2. Coloured KPI tiles or tiles with a big pastel icon in a rounded square at the left.
3. Rounded-everything: radii above 8px on any surface; pill-shaped buttons.
4. Drop shadows on cards, tables, buttons or inputs. Shadows exist only on overlays.
5. Five-colour status pills in tables; emoji in UI copy; sparkles icon anywhere.
6. Accent colour used as decoration (coloured headings, tinted section backgrounds, accent-filled active nav).
7. Sidebar with a coloured left indicator bar *and* a filled background *and* a coloured icon.
8. Chart rainbows, gradient bar fills, 3D, rounded-top bars above 2px, animated load-in, legends inside the plot.
9. Hero greeting as the page title (`Good morning, Ray 👋`). The dashboard title is `Dashboard`; the greeting, if kept, is a 13px subtitle.
10. Centered content with 40px+ padding and wide gaps; this is a dense tool, not a marketing page.
11. Proportional numerals in tables; money in the UI font.
12. Inconsistent icon sizes/stroke widths (lock to 16px/1.75 in chrome, 14px/1.75 in content, 12px in badges).
13. Title-casing every label (`Expected Close Date`) — use sentence case except uppercase label style.
14. Placeholder illustrations in empty states.
15. Toasts in the top-right with coloured backgrounds per severity.
16. Letter-spaced lowercase body text; light-weight (300) text anywhere.

---

## 8. Implementation notes for the current codebase

- `index.css`: replace the `@theme`, `body`, `.tbl`, `.field`, `.card`, `.label` rules with the token and component rules above; add `.num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }`, `.kbd`, `.dot`, `.lane`, `.kcard`.
- `components/ui/index.tsx`: `Button` gains `size="lg"`, `shortcut?: string`, and the `chrome` variant; `Badge` gains a `Dot` sibling for tables; `Stat` drops `tone` colouring of the value and takes `delta?: { value: string; dir: "up"|"down"|"flat"; good?: boolean }` and `flag?: boolean` (warn dot); `Tabs` uses ink underline; `Modal` uses the footer bar; add `Kbd`, `Palette`.
- `layout/Shell.tsx`: sidebar 240px with `chrome-*` classes and grouped nav (PINNED: Dashboard, My Tasks / PIPELINE: Leads, Opportunities, Clearance, Engagements / RECORDS: Accounts, Contacts, Campaigns, Reports / ADMIN: Data, Admin); top bar becomes breadcrumb + palette trigger + actions; `GlobalSearch` becomes the palette, bound to ⌘K.
- `DashboardPage.tsx`: title `Dashboard`; KPI tiles per 5.4; chart per 5.16 with `isAnimationActive={false}`; stale table with dot status.
- `OpportunitiesPage.tsx`: lanes/cards per 5.6; drop zones per 5.6; keyboard selection and `⇧W/⇧L` are v1.1 (document the hints now).
- `OpportunityDetailPage.tsx`: stepper per 5.14; hero amount in `mono-kpi-lg`; clearance gate card keeps the inline alert pattern with `success-50`/`warn-50` bg and `-200` border.
- Fonts: `npm i @fontsource-variable/geist @fontsource-variable/geist-mono`; remove `@fontsource-variable/inter`.
- Icons stay lucide-react; set `strokeWidth={1.75}` globally via a wrapper.

Open item for the founder: whether to keep the first-name greeting as the dashboard subtitle or drop it entirely. The mock keeps it as a subtitle.
