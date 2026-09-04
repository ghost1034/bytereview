# FirmCRM — Design Direction A: "Modern Workspace"

Lineage: Linear, Attio, Notion, Height. Near-monochrome, one accent, 13px dense UI, hairline borders, flat surfaces, keyboard-first. This document is the implementation contract: every value an engineer needs is here. Where the current codebase already does something right (Inter Variable via `@fontsource-variable/inter`, 13px base, borders-over-shadows, tabular numerals), this direction keeps it and tightens it.

Companion mock: `mock.html` (Dashboard + Opportunities board at 1440px).

---

## 1. References and what was borrowed

| Product | Pattern borrowed | Where it lands in FirmCRM |
|---|---|---|
| **Linear** | Sidebar: 240px, no logo bar — workspace switcher row at top, nav items 28px tall with 6px radius, active state = `gray-100` fill + `gray-900` text (no accent fill, no left bar). Collapsible section headers ("Workspace", "Your teams") in 11.5px `gray-500`. | App shell sidebar, section grouping (Workspace / Pipeline / Firm). |
| **Linear** | Issue list rows: 36px, property chips rendered as *icon + text* not colored pills; status as a 14px ring/icon; priority as a tiny glyph. Hover = `gray-50` full-row fill, no border change. | Data table rows, Kanban card property row, stale/clearance glyphs. |
| **Linear** | Command palette (`Cmd+K`): centered 640px panel, 48px input, grouped results with 11.5px group labels, `kbd` hints right-aligned in mono. Top-bar search is a *button that looks like an input* and opens the palette. | Global search in top bar. |
| **Linear** | Board columns: transparent column background (page color), column header = name + count in `gray-500`, cards are white with 1px `gray-200` border and **no** shadow at rest; drag = 1px `gray-300` border + `shadow-overlay`. | Opportunities Kanban. |
| **Attio** | Record page: left 320px "attributes" panel (label left in `gray-500`, value right in `gray-900`, 32px rows, inline-editable on hover showing a `gray-100` input chrome), right column for timeline. Tables with 11.5px sentence-case headers, `gray-50` sticky header, right-aligned tabular currency, row height 36px. | Opportunity/Account detail pages, all data tables. |
| **Attio** | Stat tiles: label above, 22px number, delta line under in semantic color with ▲/▼ glyph — tiles divided by 1px rules inside a single card rather than six separate cards. | Dashboard KPI strip. |
| **Notion** | Empty states: small 20px icon in `gray-300`, one sentence of copy, one ghost-button action, never an illustration. Hover-reveal affordances (`+` appears only on hover). | Empty states, "add row" affordances. |
| **Height** | Stage stepper: segmented bar where each segment is a 4px-tall pill; completed = accent, current = accent with a pulse-free ring, future = `gray-200`; stage name under each segment at 11.5px. Won/Lost as a full-width dashed drop strip under the board (not a sixth column) that turns semantic on drag-over only. | Pursuit stage stepper; Won/Lost drop strip. |

Nothing from any reference is reproduced verbatim; geometry and state logic are re-specified below.

---

## 2. Tokens (Tailwind v4 `@theme`)

Drop into `frontend/src/index.css` replacing the current `@theme` block. Light mode only in scope; the scale is named so a dark theme can be layered later by remapping the same names.

```css
@import "@fontsource-variable/inter";
@import "@fontsource-variable/jetbrains-mono";
@import "tailwindcss";

@theme {
  /* ---- Fonts ---- */
  --font-sans: "Inter Variable", Inter, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* ---- Neutral scale (very slight cool cast; never blue-slate) ---- */
  --color-gray-0:   #FFFFFF;
  --color-gray-25:  #FCFCFD;   /* page background */
  --color-gray-50:  #F8F8FA;   /* hover fill, table header, inset wells */
  --color-gray-100: #F2F2F5;   /* active nav, kbd, secondary button hover */
  --color-gray-150: #EBEBEF;   /* hairline on gray-50 surfaces */
  --color-gray-200: #E3E3E8;   /* default border */
  --color-gray-300: #D0D1D8;   /* strong border, disabled text on white */
  --color-gray-400: #A6A7B3;   /* placeholder, tertiary icon */
  --color-gray-500: #7B7C8A;   /* secondary text, labels */
  --color-gray-600: #5A5B69;   /* secondary icon default */
  --color-gray-700: #3E3F4B;   /* body text on tinted bg */
  --color-gray-800: #27282F;   /* headings */
  --color-gray-900: #15161B;   /* primary text */

  /* ---- Accent: ink indigo (one accent; nothing else is allowed to be blue/violet) ---- */
  --color-accent-50:  #EEF0FB;
  --color-accent-100: #DDE1F8;
  --color-accent-200: #BCC4F1;
  --color-accent-300: #95A1E8;
  --color-accent-400: #6D7CDD;
  --color-accent-500: #5263D3;   /* focus ring, links, selected */
  --color-accent-600: #4250C2;   /* primary button */
  --color-accent-700: #3541A1;   /* primary button hover */
  --color-accent-800: #2A337D;

  /* ---- Semantic (each has fg / bg / border; never use Tailwind's raw emerald/red/amber) ---- */
  --color-success-fg: #1E7F54;  --color-success-bg: #E9F6EF;  --color-success-border: #BFE3CF;
  --color-warn-fg:    #A35E00;  --color-warn-bg:    #FCF3E3;  --color-warn-border:    #F0D8A8;
  --color-danger-fg:  #BE3630;  --color-danger-bg:  #FCECEB;  --color-danger-border:  #F2C4C1;
  --color-info-fg:    #2757B8;  --color-info-bg:    #EAF0FB;  --color-info-border:    #C3D4F2;

  /* ---- Radii ---- */
  --radius-xs: 3px;   /* kbd, checkbox, tiny chips */
  --radius-sm: 4px;   /* badges, inputs inside tables */
  --radius-md: 6px;   /* buttons, inputs, nav items, cards-within-cards */
  --radius-lg: 8px;   /* cards, Kanban cards, column wells */
  --radius-xl: 10px;  /* modals, command palette */
  --radius-full: 9999px;

  /* ---- Borders ---- */
  --border-hairline: 1px solid var(--color-gray-200);
  --border-hairline-soft: 1px solid var(--color-gray-150);
  --border-strong: 1px solid var(--color-gray-300);

  /* ---- Shadows: overlays ONLY. Cards, tiles, tables, buttons never carry a shadow. ---- */
  --shadow-overlay: 0 0 0 1px rgb(21 22 27 / 0.06), 0 8px 24px -8px rgb(21 22 27 / 0.18), 0 2px 6px -2px rgb(21 22 27 / 0.10);
  --shadow-popover: 0 0 0 1px rgb(21 22 27 / 0.06), 0 4px 12px -4px rgb(21 22 27 / 0.14);
  --shadow-drag:    0 0 0 1px rgb(21 22 27 / 0.08), 0 12px 28px -10px rgb(21 22 27 / 0.22);
  --shadow-focus:   0 0 0 2px var(--color-gray-0), 0 0 0 4px var(--color-accent-500);

  /* ---- Spacing: 4px base, 8px grid for layout ---- */
  --spacing-0-5: 2px;  --spacing-1: 4px;   --spacing-1-5: 6px;  --spacing-2: 8px;
  --spacing-2-5: 10px; --spacing-3: 12px;  --spacing-4: 16px;   --spacing-5: 20px;
  --spacing-6: 24px;   --spacing-8: 32px;  --spacing-10: 40px;  --spacing-12: 48px;

  /* ---- Z-index ---- */
  --z-sticky: 10;     /* table headers, page header */
  --z-sidebar: 20;
  --z-dropdown: 30;
  --z-drawer: 40;
  --z-modal: 50;
  --z-palette: 60;
  --z-toast: 70;
}

html, body, #root { height: 100%; }
body {
  background: var(--color-gray-25);
  color: var(--color-gray-900);
  font-family: var(--font-sans);
  font-size: 13px; line-height: 20px;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "cv11", "ss03";        /* Inter: single-storey a off, open digits */
  text-rendering: optimizeLegibility;
}
.num, [data-numeric], td.num, .kpi-value { font-variant-numeric: tabular-nums lining-nums; }
```

Color usage rules:
- Accent is allowed on: primary button, links, focus ring, selected row/card outline, active stepper segments, "Weighted" chart series. Nowhere else. Nav active state does **not** use accent.
- Semantic colors are allowed only when they encode meaning (clearance state, stale, won/lost, task overdue). Never decorate with them.
- No gradients anywhere. No pure black text (`gray-900` is the darkest).

---

## 3. Typography

Font: **Inter Variable** (self-hosted, already a dependency). Numeric/monospace: **JetBrains Mono Variable** (`@fontsource-variable/jetbrains-mono`) used only for `kbd`, record IDs, and optional mono-numeric tables.

| Role | Size / line-height | Weight | Letter-spacing | Color | Use |
|---|---|---|---|---|---|
| display | 24px / 30px | 600 | -0.02em | gray-900 | Login, empty-workspace hero only |
| h1 (page title) | 18px / 24px | 600 | -0.015em | gray-900 | Page header title |
| h2 (section) | 13px / 20px | 600 | -0.005em | gray-900 | Card titles, panel titles |
| label | 11.5px / 16px | 500 | 0 | gray-500 | Field labels, table headers, KPI labels, column headers. **Sentence case; never uppercase.** |
| body | 13px / 20px | 400 | 0 | gray-900 | Default text |
| body-strong | 13px / 20px | 500 | 0 | gray-900 | Record names in lists, link text |
| secondary | 13px / 20px | 400 | 0 | gray-500 | Secondary cell text, subtitles |
| caption | 12px / 16px | 400 | 0 | gray-500 | Timestamps, helper text, sub-lines in tiles |
| micro | 11px / 14px | 500 | 0.01em | gray-500 | Counts in tabs, badge text |
| kpi-value | 22px / 28px | 600 | -0.02em | gray-900 | Stat tile number, tabular |
| num (table) | 13px / 20px | 400 (500 when emphasized) | 0 | gray-900 | Currency, counts — always `tabular-nums`, right-aligned |
| mono | 12px / 16px | 450 | 0 | gray-600 | `kbd`, IDs like `OPP-0412` |

Rules:
- Tabular numerals on every number that can appear in a column or be compared (`.num`). Proportional numerals are only for prose.
- Currency format: `$425,000` in tables; `$1.62M` / `$640K` in tiles and chart axes (one decimal for M, none for K).
- Weight 700 is not used. Hierarchy comes from size, color, and 500/600 weights.
- Maximum two text colors in a single row: gray-900 and gray-500. Semantic colors are for glyphs/badges, not long text.

---

## 4. Layout

| Element | Value |
|---|---|
| Sidebar expanded | 240px; `gray-25` background, 1px `gray-200` right border |
| Sidebar collapsed | 56px icon rail; tooltips on hover (160ms delay) |
| Collapse toggle | `Cmd+\` (shown in tooltip); button at bottom of sidebar |
| Top bar | 44px; `gray-0` background, 1px `gray-200` bottom border; contains breadcrumb (left), search button (center, 400px), actions (right) |
| Content padding | 24px horizontal, 20px top, 32px bottom |
| Content max-width | 1280px for Dashboard and detail pages (centered); full-bleed for Board, tables, Reports |
| Grid gutter | 16px between cards; 12px between Kanban columns |
| Page header | 56px block: title row (24px) + subtitle (20px) + 12px gap to content |
| Base unit | 4px; layout dimensions snap to 8px |

Responsive:
- ≥1440: as above.
- 1024–1439: sidebar collapses to rail automatically; KPI strip goes 3×2; dashboard right column drops under main column.
- <1024: sidebar becomes an overlay drawer; Kanban columns 248px with horizontal scroll and snap; tables hide columns marked `priority: low` (Practice area, Weighted, Days in stage) behind a "+N" column disclosure.
- Minimum supported: 960px. Below that, show the table view instead of the board.

---

## 5. Components

All values are CSS; Tailwind classes in the codebase should map 1:1 to these.

### 5.1 Sidebar and nav item

```
aside            width 240px; bg gray-25; border-right hairline; padding 8px; display flex column
workspace row    height 40px; padding 0 8px; flex; gap 8px; align center; margin-bottom 8px
  mark           20×20; radius 5px; bg gray-900; color gray-0; 11px/600 letter "F"
  name           13px/500 gray-900 "FirmCRM"; chevron-down 14px gray-500 to the right (workspace menu)
section label    11.5px/500 gray-500; padding 12px 8px 4px; first section has no label
nav item         height 28px; padding 0 8px; radius 6px; gap 8px; 13px/500 gray-700; icon 15px gray-500
  hover          bg gray-100; transition background 120ms ease-out
  active         bg gray-100; color gray-900; icon gray-900; font-weight 500 (unchanged). No left bar. No accent.
  count (right)  11px/500 gray-500; tabular; only for My Tasks (open count) and Clearance (pending count)
  shortcut hint  none inline; shown in tooltip: "Opportunities · G then O"
footer           border-top hairline; padding 8px; user row 36px: avatar 24px circle gray-200 w/ 10.5px/600 initials, name 13px/500, role 11.5px gray-500
collapse button  28×28 ghost icon button at bottom; icon panel-left 15px
```

Section grouping: **(no label)** Dashboard · My Tasks — **Pipeline** Leads · Opportunities · Clearance · Engagements — **Firm** Accounts · Contacts · Campaigns · Reports — **Admin** (manager+) Data · Admin.

### 5.2 Top bar and global search (command-palette look)

```
header          height 44px; bg gray-0; border-bottom hairline; padding 0 16px; grid 1fr auto 1fr
breadcrumb      13px gray-500 › separators 12px gray-400; last crumb gray-900/500; each crumb is a ghost button 24px tall radius 4px
search button   width 400px; height 28px; radius 6px; bg gray-50; border hairline; padding 0 8px; flex; gap 8px
  icon          search 14px gray-400
  text          13px gray-400 "Search or jump to…"
  kbd (right)   auto margin-left; two keys "⌘" "K" each: mono 11px gray-500, padding 0 5px, height 18px, bg gray-0, border 1px gray-200, radius 3px
  hover         bg gray-100; border gray-300; 120ms
right cluster   ghost icon buttons 28×28 (bell, help); today's date 12px gray-500 caption
```

Command palette (opens on click or `Cmd+K`):
```
overlay         fixed inset 0; bg rgb(21 22 27 / 0.32); z palette; fade 120ms
panel           width 640px; top 15vh; radius 10px; bg gray-0; shadow-overlay; overflow hidden; enter: opacity 0→1 + translateY(-4px→0) 160ms ease-out
input row       height 48px; padding 0 16px; border-bottom hairline; 14px/400 gray-900; placeholder gray-400; no visible focus ring (panel is the ring)
group label     11.5px/500 gray-500; padding 10px 12px 4px
result row      height 32px; padding 0 12px; radius 6px; margin 0 4px; flex; gap 10px
  icon          15px gray-500 (entity type glyph)
  label         13px gray-900; secondary 12px gray-500 after "·"
  kbd hint      right; "↵" for selected
  selected      bg gray-100 (arrow keys); hover identical
footer          height 32px; border-top hairline; padding 0 12px; kbd legend 11px gray-500: ↑↓ navigate · ↵ open · esc close
```
Results grouped: Opportunities, Accounts, Contacts, then "Actions" (New opportunity, Run conflict check, Go to Clearance…). Min 2 characters before query; actions show immediately on empty query.

### 5.3 Page header

```
wrapper         margin-bottom 16px; flex; align flex-start; justify space-between; gap 16px
title           h1 18px/24px 600 -0.015em gray-900; inline badges after title sit on a 4px gap, vertically centered
subtitle        13px/20px gray-500; margin-top 2px; facts separated by " · "; numbers tabular
actions         flex; gap 8px; right-aligned; primary button last
view switcher   segmented: height 28px; bg gray-100; radius 6px; padding 2px; each segment 24px tall radius 4px, icon 14px; active segment bg gray-0 + shadow-popover-less (0 0 0 1px gray-200); 120ms
```

### 5.4 KPI stat tile (Dashboard strip)

One card, six cells, separated by vertical 1px `gray-200` rules (not six floating cards).

```
strip           card (bg gray-0; border hairline; radius 8px); grid 6 cols; height 84px
cell            padding 14px 16px; border-left hairline (except first)
label           11.5px/16px 500 gray-500; flex with optional 13px icon gray-400 right-aligned
value           22px/28px 600 -0.02em gray-900 tabular; margin-top 4px
sub             12px/16px gray-500; margin-top 2px
delta (opt.)    12px/16px 500; ▲ success-fg / ▼ danger-fg; precedes sub text; glyph is a 6px triangle not an emoji
tone=warn       value stays gray-900; a 6px warn-fg dot precedes the label (meaning lives in the dot, not the number)
tone=good       same pattern with success-fg dot
hover           none (tiles are not buttons). If clickable, entire cell gets bg gray-50 on hover and cursor pointer.
```

### 5.5 Data table

```
wrapper         card; overflow clip; radius 8px
thead th        position sticky; top 0; z sticky; height 32px; bg gray-50; border-bottom hairline;
                11.5px/500 gray-500; sentence case; padding 0 12px; text-align left; white-space nowrap
  numeric th    text-align right
  sortable      hover color gray-700; sort glyph 12px gray-400 appears only when sorted (↑/↓), 4px after label
tbody td        height 36px; padding 0 12px; border-bottom 1px gray-150; vertical-align middle; 13px gray-900
  first col     13px/500 gray-900 (record name); may carry inline 14px glyphs after name with 6px gap
  secondary     13px gray-500 (account name, owner)
  numeric td    text-align right; tabular; font-variant lining
  last row      no bottom border
row hover       bg gray-50 (entire row); cursor pointer when clickable; 120ms background
row selected    bg accent-50; 1px inset left rule 2px accent-500 (box-shadow inset 2px 0 0 accent-500)
zebra           NO. Never.
density toggle  compact = 32px rows; default 36px; comfortable 40px. Stored per view.
footer          height 40px; border-top hairline; 12px gray-500; pagination as ghost icon buttons 24px + "1–50 of 212"
loading         5 skeleton rows: 12px tall gray-100 bars (no shimmer), 60/40/30/20% widths
inline edit     on hover a cell shows bg gray-100 radius 4px inset 2px; on click becomes input (see 5.9) with no border, bg gray-0, shadow-focus
```

Column alignment rules: text left; currency/number/percent/days right; dates left; badges/glyphs left; action menu right (28×28 ghost `⋯` button, visible on row hover only).

### 5.6 Kanban column and card

```
board           flex; gap 12px; overflow-x auto; padding-bottom 8px; align stretch; scroll-snap-type x proximity
column          flex 1 1 0; min-width 220px; max-width 272px (five open stages fit 1440 without horizontal scroll: (1152 − 4×12)/5 = 220px); display flex column; bg transparent (page gray-25); radius 8px
  header        height 36px; padding 0 4px; flex; align center; gap 6px
    name        13px/500 gray-900
    count       12px gray-500 tabular
    sum         margin-left auto; 12px gray-500 tabular "$1.62M"
    prob        11px gray-400 tabular "25%"  (hidden <1280)
    ⋯ button    24×24 ghost; visible on column hover
  well          flex 1; padding 0; gap 8px; display flex column; overflow-y auto; min-height 120px
  drag-over     well gets bg gray-100 radius 8px, 1px dashed gray-300; 120ms
card            bg gray-0; border hairline; radius 8px; padding 10px 12px; cursor grab; display flex column; gap 6px
  hover         border gray-300; 120ms (no lift, no shadow)
  dragging      shadow-drag; border gray-300; rotate 0; opacity 1 (ghost source at 0.4)
  selected      box-shadow 0 0 0 2px accent-500 outside border
  row 1         id 11px mono gray-400 "OPP-0412" (left) · owner avatar 18px circle gray-200 initials 9px/600 (right)
  title         13px/500 gray-900; 2-line clamp; line-height 18px
  account       12px gray-500; 1 line truncate
  row props     margin-top 2px; flex; gap 10px; align center; 12px gray-500
    amount      13px/500 gray-900 tabular
    close       calendar 12px glyph + "Oct 14"
    practice    12px gray-500 plain text (not a pill), truncate; icon scale 12px
  footer        flex; align center; gap 6px; margin-top 2px
    clearance   shield glyph 14px: clear/waived success-fg · pending warn-fg · conflict danger-fg · not run gray-400 · none → hidden.
                Always paired with a 11px/500 state word only: "Clear", "Waived", "Pending", "Conflict", "Not run" (fits 220px columns).
                The check type lives in the title attr: "Independence check: pending". Never render "Conflict check pending" inline on a card.
    stale       right-aligned chip: 11px/500 warn-fg on warn-bg, radius 4px, padding 0 5px, height 18px, text "21d stale" (days since last activity). Card border stays gray-200 — staleness is the chip, not the card.
    EL signed   if engagement letter signed: 12px file-check glyph success-fg after clearance
won/lost strip  full board width; margin-top 12px; flex; gap 12px; two zones each flex 1, height 56px; radius 8px; border 1px dashed gray-300;
                13px/500 gray-500 centered with 16px glyph (trophy / x-circle) and an 11px gray-400 hint ("· requires cleared check and signed engagement letter")
  drag-over won border success-fg; bg success-bg; text success-fg
  drag-over lost border danger-fg; bg danger-bg; text danger-fg
  at rest       never colored; the strip is only visible while Status = Open
  blocked       if card's gate unmet (clearance not clear/waived, or EL unsigned), Won zone shows lock glyph + "Clearance required" in warn-fg and rejects drop (card snaps back, 160ms)
```

### 5.7 Badge / status pill

```
badge           inline-flex; height 20px; padding 0 6px; radius 4px; 11px/500; gap 4px; border 1px
  neutral       bg gray-100; border gray-150; color gray-700
  success       bg success-bg; border success-border; color success-fg      won · client · clear · signed · active · completed
  warn          bg warn-bg; border warn-border; color warn-fg               pending · sent · on hold · medium · drafted · stale
  danger        bg danger-bg; border danger-border; color danger-fg         lost · conflict · adverse party · terminated · high · overdue
  info          bg info-bg; border info-border; color info-fg               prospect · new · open stage names on dashboard table
  accent        bg accent-50; border accent-100; color accent-700           reserved: "You" / current user markers only
dot variant     6px filled circle before 12px gray-700 text, no background. Preferred inside dense tables where pills get noisy (e.g., Stage column on Dashboard stale table uses dot variant).
```
Text in badges is sentence case ("Conflict check pending"), never uppercase.

### 5.8 Buttons

```
common          inline-flex; align center; gap 6px; radius 6px; font 13px/500; white-space nowrap; transition background 120ms, border-color 120ms; outline none
sizes           sm: height 24px; padding 0 8px; 12px text; icon 13px
                md: height 28px; padding 0 10px; 13px text; icon 14px   (default)
                lg: height 32px; padding 0 12px; 13px text; icon 15px   (modal footers only)
primary         bg accent-600; color gray-0; border 1px accent-600;  hover bg accent-700 border accent-700;  active bg accent-800
secondary       bg gray-0; color gray-900; border 1px gray-200;      hover bg gray-50 border gray-300;        active bg gray-100
ghost           bg transparent; color gray-700; border 1px transparent; hover bg gray-100 color gray-900;    active bg gray-150
danger          bg gray-0; color danger-fg; border 1px gray-200;     hover bg danger-bg border danger-border; (solid danger only in confirm-modal footers: bg danger-fg, text gray-0)
icon-only       square (24/28/32); no text; aria-label required
disabled        opacity 0.45; cursor not-allowed; no hover change
focus-visible   box-shadow shadow-focus
loading         label replaced by 14px spinner (1.5px stroke gray-0 or gray-500) keeping width fixed
```

### 5.9 Inputs / select / textarea

```
field           height 28px; padding 0 8px; radius 6px; bg gray-0; border 1px gray-200; 13px gray-900; placeholder gray-400
hover           border gray-300
focus           border accent-500; box-shadow 0 0 0 3px accent-100; transition 120ms
invalid         border danger-fg; box-shadow 0 0 0 3px danger-bg; helper text 12px danger-fg below
disabled        bg gray-50; color gray-500; border gray-150
textarea        min-height 72px; padding 6px 8px; line-height 20px; resize vertical
select          native select restyled: same chrome; chevron-down 14px gray-500 absolutely positioned right 8px; padding-right 28px
label           11.5px/500 gray-500; margin-bottom 4px; sentence case; required marker: " ·" no — use text "(required)" only in error, otherwise nothing
hint            12px gray-500; margin-top 4px
field group     vertical gap 12px; two-column form grid gap 12px × 16px
checkbox        16×16; radius 3px; border 1px gray-300; checked bg accent-600 border accent-600, check glyph gray-0 stroke 2px
tags input      chips 20px tall gray-100 with × ghost 14px; input inline
```

### 5.10 Modal and drawer

```
scrim           fixed inset 0; bg rgb(21 22 27 / 0.32); fade 120ms
modal           width 520px (sm) / 640px (md) / 800px (lg); max-height 85vh; top 10vh; radius 10px; bg gray-0; shadow-overlay
  enter         opacity 0→1, translateY(-6px→0), 160ms ease-out; exit 120ms
  header        height 48px; padding 0 20px; border-bottom hairline; title 14px/600 gray-900; close = ghost icon 28px top-right
  body          padding 20px; overflow-y auto
  footer        height 56px; padding 0 20px; border-top hairline; bg gray-25; flex; justify end; gap 8px; buttons size lg; primary last; secondary "Cancel" first. Left slot for destructive tertiary.
drawer          right-anchored; width 480px; full height; bg gray-0; border-left hairline; shadow-overlay; slide-in translateX(16px→0) + fade 160ms
  use           record quick-view from tables/board (Shift+click or "Peek"), filters panel
```

### 5.11 Tabs

```
tablist         border-bottom hairline; height 36px; gap 4px; flex
tab             height 36px; padding 0 10px; 13px/500 gray-500; position relative; border none
  hover         color gray-900
  active        color gray-900; underline = 2px gray-900 at bottom (not accent); transition none on underline
  count         11px/500 gray-500 tabular; margin-left 6px; no pill background
```

### 5.12 Toast

```
container       fixed bottom 16px right 16px; z toast; stack gap 8px
toast           min-width 280px; max-width 400px; padding 10px 12px; radius 8px; bg gray-900; color gray-0; 13px; shadow-overlay; flex; gap 10px
  icon          14px: success success-fg(lighter on dark: #4FC58E) · error #F08A85 · info gray-400
  action        ghost link 13px/500 gray-0 underline-offset 2px ("Undo")
  enter         translateY(8px→0) + fade 160ms; exit fade 120ms; auto-dismiss 4s (errors 8s)
```

### 5.13 Empty state

```
wrapper         padding 40px 0; text-align center; max-width 320px centered
icon            20px gray-300 (lucide, 1.5px stroke)
title           13px/500 gray-700; margin-top 8px
copy            12px gray-500; margin-top 2px; one sentence
action          secondary button sm; margin-top 12px; optional
```
No illustrations, no emoji, no "Nothing to see here" humor.

### 5.14 Stage stepper (pursuit pipeline)

```
wrapper         card; padding 12px 16px; display grid; grid-template-columns repeat(n, 1fr); gap 6px
segment         height 4px; radius 2px; bg gray-200
  completed     bg accent-500
  current       bg accent-500; plus 1px ring: box-shadow 0 0 0 2px gray-0, 0 0 0 3px accent-200
  future        bg gray-200
  won           all segments success-fg
  lost          segments up to exit stage gray-400; label of exit stage danger-fg "Lost · Price"
label row       margin-top 6px; 11.5px/500; completed & current gray-900; future gray-500; current also shows "· 12d" in gray-500 tabular
gate marker     Clearance segment shows a 12px shield glyph above label in the clearance state color; Proposal/Negotiation cannot be clicked past Clearance while gate is unmet (cursor not-allowed, tooltip "Conflict check pending")
interaction     clicking a future segment advances (confirm only for Won/Lost); hover on segment: bg gray-300 for future, no change otherwise; 120ms
```

### 5.15 Activity timeline

```
composer        card-inset: bg gray-50; border hairline-soft; radius 8px; padding 10px
  kind tabs     segmented 24px (see view switcher), icons 13px: call · email · meeting · note · task
  subject       field; body textarea min 44px; submit primary sm right; `Cmd+Enter` hint kbd in placeholder row
list            position relative; padding-left 28px; list rail = 1px gray-200 at left 9px
item            padding 8px 0; position relative
  node          18px circle at left -28px; bg gray-0; border 1px gray-300; glyph 11px gray-600; completed task → border success-border bg success-bg glyph success-fg
  subject       13px/500 gray-900; task done → gray-400 line-through
  body          13px gray-700; margin-top 2px; whitespace pre-wrap; clamp 4 lines with "Show more" ghost link
  meta          12px gray-500; margin-top 2px: "Margaret Okafor · Aug 19, 2:40 PM · 3d ago · Atlas Freight Systems"
  badges        task due/overdue as badge (5.7); overdue danger
  actions       right; hidden until row hover; ghost sm buttons (Done / ⋯)
day dividers    11.5px/500 gray-500 "Today", "Yesterday", "Aug 12" with hairline-soft rule, margin 12px 0 4px
```

### 5.16 Charts (recharts)

```
series palette  primary (Amount)   gray-300 #D0D1D8
                emphasis (Weighted) accent-500 #5263D3
                won                success-fg #1E7F54
                lost               gray-400 #A6A7B3
                (max 4 series; categorical beyond that uses gray-500, accent-300)
bars            radius [3,3,0,0]; barCategoryGap 28%; barGap 4; no stroke; isAnimationActive=false
grid            CartesianGrid vertical={false} stroke gray-150 strokeDasharray none
axes            axisLine false; tickLine false; tick fontSize 11 fill gray-500; YAxis width 48; tickFormatter money(v, true); XAxis tickMargin 8
tooltip         cursor fill gray-100 opacity 0.6; contentStyle: bg gray-900, color gray-0, border none, radius 6px, padding 6px 10px, fontSize 12, shadow none; labelStyle color gray-400; itemStyle color gray-0; formatter money()
legend          custom: 12px gray-500, 8×8 squares radius 2px, placed top-right of the card header (not under the chart)
donut (win/loss) strokeWidth 14 of r 44; won success-fg, lost gray-300; center label 22px/600 tabular; no labels on arcs
sparklines      1.5px stroke gray-500, no fill, no dots, 80×24 in table cells
```

Chart text and table numbers must agree exactly; the stage table under the chart is the source of truth and sits 12px below the chart with no extra card border.

---

## 6. Motion

| Token | Value | Applies to |
|---|---|---|
| `--dur-fast` | 120ms | color/background/border hover, focus ring, toggle switches, drag-over highlights |
| `--dur-base` | 160ms | overlays entering (modal, palette, popover, toast, drawer), row expand/collapse |
| `--dur-slow` | 200ms | sidebar collapse/expand width, drawer only |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | everything entering/hovering |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | everything exiting (always shorter: 120ms) |

Animate: opacity, transform (translate ≤ 8px), background-color, border-color, box-shadow (focus only), width (sidebar).

Never animate: page route transitions; card/tile lift on hover; chart series (recharts `isAnimationActive={false}`); skeleton shimmer (static bars); number count-ups; anything with bounce/spring/overshoot; layout height of tables; color of text on hover inside tables (instant). `prefers-reduced-motion: reduce` → all durations 0.

Drag-and-drop: source card opacity 0.4 instantly; drag preview carries `shadow-drag`; drop snaps without animation; rejected drop translates back over 160ms.

---

## 7. Anti-patterns (the "AI look") — prohibited

1. Uppercase letter-spaced labels everywhere (`text-[11px] uppercase tracking-wide`). Use sentence case 11.5px/500 gray-500.
2. Six separate floating stat cards. Use one divided strip (5.4).
3. Colored pills for every categorical value (practice area, owner, type). Pills only for state; categories are plain text or icon+text.
4. Teal/emerald/violet/sky Tailwind defaults mixed together. One accent, four semantics, nothing else.
5. Drop shadows on cards, tables, tiles, or buttons. Shadows are for overlays only.
6. Accent-tinted active nav item with accent text. Active nav is gray-100 / gray-900.
7. Left accent bar on cards/columns to show state; card border colour changing for "stale". Use the chip (5.6).
8. Gradients, glassmorphism, blurred blobs, hero illustrations, emoji in UI text.
9. Hover lift (`translateY(-2px)` + shadow) on cards; bouncy/spring easing; long 300ms+ transitions.
10. `Good morning, Ray` greeting as the page H1. Title is "Dashboard"; greeting (if kept) is the 13px gray-500 subtitle.
11. Zebra striping; double borders (card border + inner table border of the same weight).
12. Centered text in tables; proportional digits in numeric columns; currency without thousands separators.
13. Legend under the chart in recharts default style; recharts default tooltip (white box with border).
14. Generic `Inbox` icon + "Nothing here yet" empty state copy. Say what would appear and how to create it.
15. Rounded-full buttons; 20px+ radii; oversized 40px buttons in a 13px UI.
16. Title-cased labels ("Expected Close Date"). Sentence case throughout ("Expected close").
17. Dividing every region into a card. Related controls (filters) sit directly on the page background.
18. Decorative icons next to every heading. Icons appear where they carry meaning (entity type, state, action).

---

## 8. Implementation notes for the codebase

- `index.css`: replace `@theme`; remove `.label` uppercase; `table.tbl thead th` → 32px, 11.5px/500, sentence case, bg gray-50; `tbody td` → 36px height, border gray-150.
- `ui/index.tsx`: `Badge` → TONES keyed by semantic (`neutral|success|warn|danger|info|accent`) with borders from tokens; `Stat` → becomes a `StatStrip` container + `StatCell`; `Tabs` underline gray-900; `Button` heights fixed (24/28/32) instead of padding-driven; `Empty` accepts `icon`, `action`.
- `Shell.tsx`: sidebar 240px with section groups; `GlobalSearch` becomes a button that opens a `CommandPalette` (new component, `Cmd+K`), existing queries move into it.
- `DashboardPage.tsx`: H1 "Dashboard"; KPI strip; recharts props per 5.16; stale table Stage column uses dot-variant badge.
- `OpportunitiesPage.tsx`: column 272px, transparent well, card per 5.6, stale chip replaces amber border; Won zone gate message when blocked.
- `OpportunityDetailPage.tsx`: stepper per 5.14; two-column record layout (attributes 320px left, timeline right) per Attio reference.
- Add `@fontsource-variable/jetbrains-mono` dependency.
- Add a `Kbd` component (mono 11px, 18px tall, gray-0 on gray-200 border, radius 3px).

Quality gate before merge: every color in the diff resolves to a token name; no `shadow-*` class on a non-overlay; no `uppercase` class; no Tailwind palette color literal (`emerald-`, `sky-`, `violet-`, `teal-`).
