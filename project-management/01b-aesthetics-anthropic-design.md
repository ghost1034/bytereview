# 01b — Aesthetic Upgrade: Anthropic-Inspired Design + Glow Effects

**Goal:** Replace the generic SaaS look established in step 01 with a refined, editorial, **Anthropic-inspired** aesthetic. Warm cream backgrounds, terracotta accents, editorial serif headlines paired with a refined sans body, deliberate motion, generous whitespace, and tastefully applied **glow effects** (ambient auroras, focus halos, status pulses, hover blooms). Plus a beautiful public **marketing site** (signed-out landing pages) that mirrors anthropic.com.

**When to drop:**
- **Best case:** Right after `01-foundation-and-design-system.md` (clean slate).
- **Also works:** Anywhere later in the build — it's a full re-skin pass and will instruct the AI to touch every component, page, chart, and empty state.

---

## Prompt (paste into Google AI Studio Build)

Replace the existing Tasklytic design system with the refined, editorial aesthetic specified below — inspired by **anthropic.com**. Add a **glow effect system** for ambient warmth and emphasis. Build a public-facing **marketing site** for signed-out visitors. **Do not change any business logic, data model, or feature behavior** — this is exclusively a visual + motion overhaul. After this step, every screen in the app must look intentional, refined, and warm.

### Critical rules
1. The token **names** from step 01 stay the same (`primary`, `accent`, `bg-base`, `ink-primary`, etc.). Only the **values** change. This means every file that already references "primary" or "accent" will inherit the new aesthetic automatically.
2. New tokens get added — never replace.
3. Touch every component built in prior steps so the new aesthetic propagates. List components touched in `Design.md`.
4. Glow effects are subtle by default. Never neon, never garish. Use them for: hero ambience, focus states, status indicators, button CTAs, and hover blooms on cards.
5. Preserve WCAG AA contrast (4.5:1 body text, 3:1 large text). Verify in both light and dark modes.
6. Append `Design.md` row: `01b | src/styles, src/components/ui, src/features/marketing | Anthropic-inspired aesthetic & glow system | <today>` and add a **"Visual identity"** section to `Design.md` summarizing the palette, typography, and glow system.

---

## 1. Color palette (warm, editorial, terracotta-accented)

### Light mode (default)

```css
/* Backgrounds — warm cream paper-like */
--bg-base:        #FAF9F5;   /* cream — main app background */
--bg-elevated:    #FFFFFF;   /* pure white — cards, modals */
--bg-sunken:      #F0EBE0;   /* slightly darker cream — sidebars, code blocks */
--bg-muted:       #F5F2EB;   /* between base and sunken — section dividers */
--bg-overlay:     rgba(245, 242, 235, 0.85);  /* modal backdrops with backdrop-blur */

/* Ink — warm near-blacks (NEVER pure #000) */
--ink-primary:    #1A1A19;   /* body & headings */
--ink-secondary:  #3C3A35;   /* secondary text */
--ink-muted:      #6B675E;   /* tertiary, captions */
--ink-faint:      #A39E92;   /* placeholders, disabled */
--ink-inverse:    #FAF9F5;   /* text on dark surfaces */

/* Borders — hairline warm grays */
--border-subtle:  #E8E2D4;
--border-default: #D9D2BF;
--border-strong:  #B8B0A0;

/* Brand — terracotta (Anthropic's signature warm accent) */
--primary:        #CC785C;   /* terracotta — primary CTAs, brand */
--primary-hover:  #B05D40;   /* darker on hover */
--primary-soft:   #F5E5DE;   /* tinted background for soft buttons / chips */
--primary-glow:   rgba(204, 120, 92, 0.35);  /* used in box-shadow glows */

/* Semantic — muted, never electric */
--accent:         #6B8E5A;   /* sage green for positive/success */
--accent-soft:    #E5EBDD;
--warning:        #C99846;   /* warm amber */
--warning-soft:   #F5EBD5;
--danger:         #BC4A3F;   /* rust red */
--danger-soft:    #F2DAD7;
--info:           #5C7A8C;   /* dusty blue-gray */
--info-soft:      #DCE3E9;

/* Grayscale (legacy token names from step 01 — remap to warm scale) */
--gray-50:  #FAF9F5;
--gray-100: #F0EBE0;
--gray-200: #E8E2D4;
--gray-300: #D9D2BF;
--gray-400: #B8B0A0;
--gray-500: #837F75;
--gray-600: #58544A;
--gray-700: #3C3A35;
--gray-800: #242421;
--gray-900: #1A1A19;
```

### Dark mode (warm dark — NOT pure black)

```css
--bg-base:        #1A1A19;   /* warm near-black */
--bg-elevated:    #242421;   /* slightly lifted */
--bg-sunken:      #131211;   /* deepest */
--bg-muted:       #1F1E1C;
--bg-overlay:     rgba(20, 19, 17, 0.85);

--ink-primary:    #F5F2EB;
--ink-secondary:  #C9C3B5;
--ink-muted:      #837F75;
--ink-faint:      #58544A;
--ink-inverse:    #1A1A19;

--border-subtle:  #2E2C28;
--border-default: #3C3A35;
--border-strong:  #58544A;

--primary:        #E08A6F;   /* lighter terracotta for contrast on dark */
--primary-hover:  #EFA188;
--primary-soft:   #3A2520;
--primary-glow:   rgba(224, 138, 111, 0.45);

--accent:         #8FB07A;
--accent-soft:    #283021;
--warning:        #E0B167;
--warning-soft:   #3D311F;
--danger:         #D26B5F;
--danger-soft:    #3A211E;
--info:           #8FA9BC;
--info-soft:      #1F2A33;
```

### Tailwind configuration

Update `tailwind.config.ts` to expose all of the above via `theme.extend.colors`. **Remap legacy names**: `primary` → `var(--primary)`; `accent` → `var(--accent)`; etc. Add semantic aliases (`bg-base`, `bg-elevated`, `ink-primary`, `border-subtle`, …) so component code reads naturally:

```html
<div class="bg-base text-ink-primary border border-subtle">
```

Define both palettes via CSS variables on `:root` and `html.dark`.

---

## 2. Typography — editorial serif + refined sans

### Font loading

Add to `index.html` (or use `<link>` in `index.css`):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Font stacks (`tailwind.config.ts`)

```js
fontFamily: {
  serif: ['Fraunces', 'Georgia', 'serif'],          // editorial headings
  sans:  ['Inter', 'system-ui', 'sans-serif'],      // body & UI
  mono:  ['JetBrains Mono', 'ui-monospace', 'monospace'],
}
```

### Usage rules (enforce across all components)

- **Headlines** (`h1`, `h2`, hero text, page titles, marketing site): **Fraunces**. Use the variable axis: weight 400–500 for body headlines, 300 for very large display, with `opsz` set proportionally (Fraunces variable font auto-handles optical size via `font-optical-sizing: auto`).
- **Subheadings & section titles**: **Fraunces** medium 500 OR **Inter** semibold 600 — pick one per context and stay consistent.
- **Body, UI labels, buttons, table headers**: **Inter**.
- **Code, numeric tables (timesheet hours, monetary amounts in tables, invoice lines)**: **JetBrains Mono**.
- **Marketing hero**: Fraunces light (300) at very large sizes (text-7xl / text-8xl) with `letter-spacing: -0.02em`.

### Type scale (update from step 01)

```js
fontSize: {
  // Display (marketing hero)
  'display-2xl': ['clamp(3rem, 8vw, 6rem)',  { lineHeight: '1.0',  letterSpacing: '-0.03em', fontWeight: '300' }],
  'display-xl':  ['clamp(2.5rem, 6vw, 4.5rem)', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '300' }],
  'display-lg':  ['clamp(2rem, 4.5vw, 3.5rem)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '400' }],

  // Editorial headings
  'h1': ['2.5rem',   { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '400' }],
  'h2': ['2rem',     { lineHeight: '1.2',  letterSpacing: '-0.015em', fontWeight: '400' }],
  'h3': ['1.5rem',   { lineHeight: '1.3',  letterSpacing: '-0.01em', fontWeight: '500' }],
  'h4': ['1.25rem',  { lineHeight: '1.4',  letterSpacing: '-0.005em', fontWeight: '500' }],

  // Body
  'body-lg': ['1.125rem', { lineHeight: '1.65' }],
  'body':    ['1rem',     { lineHeight: '1.6' }],
  'body-sm': ['0.9375rem',{ lineHeight: '1.55' }],

  // UI
  'ui-lg':   ['0.9375rem', { lineHeight: '1.4', fontWeight: '500' }],
  'ui':      ['0.875rem',  { lineHeight: '1.4', fontWeight: '500' }],
  'ui-sm':   ['0.8125rem', { lineHeight: '1.35', fontWeight: '500' }],
  'caption': ['0.75rem',   { lineHeight: '1.4', fontWeight: '500', letterSpacing: '0.01em' }],
  'overline':['0.6875rem', { lineHeight: '1.4', fontWeight: '600', letterSpacing: '0.12em', textTransform: 'uppercase' }],
}
```

### Editorial typography rules

- Use **balanced line breaks** for headlines (`text-wrap: balance`).
- Use **pretty wrapping** for body text (`text-wrap: pretty`).
- Headings get slightly tightened letter-spacing.
- Body text uses generous line-height (1.6).
- Marketing page paragraphs are **max-w-prose** (~65ch).
- Numerals in tables use `font-variant-numeric: tabular-nums`.
- Lists in marketing pages use proper bullets/markers and reasonable margins.

---

## 3. Glow effect system (subtle, never neon)

Add to `tailwind.config.ts` under `theme.extend`:

```js
boxShadow: {
  // Soft, neutral elevations (warm-tinted)
  'paper-sm': '0 1px 2px rgba(26, 26, 25, 0.04), 0 0 0 1px rgba(26, 26, 25, 0.04)',
  'paper':    '0 2px 8px -2px rgba(26, 26, 25, 0.08), 0 0 0 1px rgba(26, 26, 25, 0.05)',
  'paper-md': '0 6px 20px -4px rgba(26, 26, 25, 0.12), 0 0 0 1px rgba(26, 26, 25, 0.06)',
  'paper-lg': '0 16px 48px -8px rgba(26, 26, 25, 0.18), 0 0 0 1px rgba(26, 26, 25, 0.08)',

  // Glow shadows — terracotta tint with multiple radii (mimics ambient halo)
  'glow-sm': '0 0 0 1px var(--primary-glow), 0 2px 8px var(--primary-glow)',
  'glow':    '0 0 0 1px var(--primary-glow), 0 4px 16px var(--primary-glow), 0 8px 32px rgba(204, 120, 92, 0.18)',
  'glow-lg': '0 0 0 1px var(--primary-glow), 0 8px 32px var(--primary-glow), 0 16px 64px rgba(204, 120, 92, 0.25), 0 32px 96px rgba(204, 120, 92, 0.15)',

  // Status dot glow (used on online indicator, "live" badges, etc.)
  'glow-dot':     '0 0 0 4px rgba(107, 142, 90, 0.18), 0 0 8px rgba(107, 142, 90, 0.45)',
  'glow-dot-warn':'0 0 0 4px rgba(201, 152, 70, 0.20), 0 0 8px rgba(201, 152, 70, 0.50)',
  'glow-dot-err': '0 0 0 4px rgba(188, 74, 63, 0.22), 0 0 10px rgba(188, 74, 63, 0.55)',

  // Inner glow — for cards that "light up" on hover
  'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 0 24px rgba(204, 120, 92, 0.08)',

  // Focus ring (replaces default outline globally)
  'focus':      '0 0 0 2px var(--bg-base), 0 0 0 4px var(--primary), 0 0 12px var(--primary-glow)',
  'focus-soft': '0 0 0 2px var(--bg-base), 0 0 0 4px var(--primary-glow)',
}
```

### Aurora gradient utilities (radial ambience for heroes & empty states)

Add to `globals.css`:

```css
@layer utilities {
  /* Soft warm aurora — for hero backgrounds */
  .bg-aurora {
    background:
      radial-gradient(ellipse 60% 50% at 20% 30%, rgba(204, 120, 92, 0.18), transparent 60%),
      radial-gradient(ellipse 50% 40% at 80% 20%, rgba(201, 152, 70, 0.12), transparent 60%),
      radial-gradient(ellipse 70% 60% at 50% 100%, rgba(107, 142, 90, 0.10), transparent 70%),
      var(--bg-base);
  }
  .dark .bg-aurora {
    background:
      radial-gradient(ellipse 60% 50% at 20% 30%, rgba(224, 138, 111, 0.22), transparent 60%),
      radial-gradient(ellipse 50% 40% at 80% 20%, rgba(224, 177, 103, 0.14), transparent 60%),
      radial-gradient(ellipse 70% 60% at 50% 100%, rgba(143, 176, 122, 0.12), transparent 70%),
      var(--bg-base);
  }

  /* Subtle paper grain texture (uses inline SVG noise — no external asset) */
  .texture-paper {
    background-image:
      url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0.1 0 0 0 0 0.1 0 0 0 0 0.1 0 0 0 0.018 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 200px 200px;
  }

  /* Glowing terracotta gradient — for primary buttons, key CTAs */
  .bg-glow-primary {
    background-image: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%);
    box-shadow:
      0 0 0 1px var(--primary-hover),
      0 8px 24px var(--primary-glow),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }

  /* Animated aurora — for the marketing hero only (respects reduced motion) */
  .bg-aurora-animated {
    background:
      radial-gradient(ellipse 60% 50% at 20% 30%, rgba(204, 120, 92, 0.18), transparent 60%),
      radial-gradient(ellipse 50% 40% at 80% 20%, rgba(201, 152, 70, 0.12), transparent 60%),
      radial-gradient(ellipse 70% 60% at 50% 100%, rgba(107, 142, 90, 0.10), transparent 70%),
      var(--bg-base);
    background-size: 200% 200%;
    animation: aurora-drift 24s ease-in-out infinite alternate;
  }
  @keyframes aurora-drift {
    0%   { background-position: 0% 0%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .bg-aurora-animated { animation: none; }
  }

  /* Glowing dot — for "live", "online", "in progress" indicators */
  .dot-glow      { box-shadow: var(--tw-shadow, 0 0 0 4px rgba(107, 142, 90, 0.18), 0 0 8px rgba(107, 142, 90, 0.45)); }

  /* "Pulse" glow — gentle breathing for active timers, recording states */
  .glow-pulse {
    animation: glow-pulse 2.4s ease-in-out infinite;
  }
  @keyframes glow-pulse {
    0%, 100% { box-shadow: 0 0 0 0 var(--primary-glow); }
    50%      { box-shadow: 0 0 0 8px transparent; }
  }
}
```

### Where to apply glow effects (with restraint)

| Use case | Effect |
|---|---|
| Marketing hero background | `bg-aurora-animated` |
| App home page background (top 30vh) | `bg-aurora` static |
| Primary button (default state) | `shadow-paper-sm` |
| Primary button (hover) | `shadow-glow-sm`, slight scale `1.02` |
| Primary button (active CTA, e.g., "Start free trial" on marketing site) | `bg-glow-primary` + `shadow-glow` |
| Focused inputs / buttons | `shadow-focus` (replaces default outline) |
| Online status dot on Avatar | `shadow-glow-dot` |
| Running-timer chip in topbar | `glow-pulse` (gentle breathing) |
| "Live" / "Recording" indicators | `shadow-glow-dot` + `glow-pulse` |
| Cards on hover | `shadow-paper-md` + `shadow-inner-glow` (very subtle bloom) |
| Notification dot on bell (unread > 0) | `shadow-glow-dot-warn` |
| Critical status pills (At Risk, Overdue) | `shadow-glow-dot-err` (small radius) |
| Modal/Dialog | `shadow-paper-lg` + `texture-paper` overlay at 30% opacity |
| Toast (success) | `shadow-paper-md` + a 2px `border-l` in `accent` |
| AI assistant panel header | `bg-aurora` (radial) — signals "thinking" warmth |

**Do not glow**: standard list rows, table cells, regular sidebar items, body text, secondary buttons, all inputs in their resting state, tooltips. Glow is reserved for hero/CTA/status moments.

---

## 4. Motion language (deliberate, eased, refined)

### Easing curves

```js
transitionTimingFunction: {
  'editorial':    'cubic-bezier(0.25, 0.46, 0.45, 0.94)',  // default for most UI
  'expressive':   'cubic-bezier(0.34, 1.56, 0.64, 1)',     // playful bounce — used sparingly
  'enter':        'cubic-bezier(0, 0, 0.2, 1)',            // ease-out for entrances
  'exit':         'cubic-bezier(0.4, 0, 1, 1)',            // ease-in for exits
}
```

### Durations

- Micro (hover, focus): **180ms** with `editorial`
- Small (chip, tag, button): **220ms`
- Medium (cards, dropdowns, popovers): **280ms**
- Large (modals, page transitions, drawers): **400ms**
- Hero / marketing reveal: **600–900ms** with stagger

### Motion patterns

- **Card hover**: `translateY(-2px)`, shadow elevates from `paper` to `paper-md`, gentle inner glow blooms in.
- **Button hover**: `translateY(-1px)`, brightness `1.02`, shadow grows.
- **Modal entrance**: backdrop fades in 200ms, modal `scale(0.97) → 1` + `translateY(8px) → 0` over 280ms with `enter`.
- **Dropdown/Popover**: `opacity 0 → 1` + `translateY(-4px) → 0` over 200ms.
- **Toast**: slides in from bottom-right with `enter`, dismisses with `exit`.
- **Page transitions** (route changes): a 120ms fade — never jarring slides.
- **Marketing scroll reveals**: elements fade-up (`opacity 0 → 1`, `translateY(24px) → 0`) when they enter viewport, with 60ms stagger between siblings. Use IntersectionObserver. Respect `prefers-reduced-motion: reduce` (do nothing in that case — render fully visible immediately).
- **AI typing indicator**: a row of 3 small terracotta dots with a wave animation (each dot scales 1.0 → 1.3 → 1.0, 0.6s loop, 150ms offset between dots).

### Respect reduced motion

Add `useReducedMotion()` hook (or extend the one from step 29). Globally wrap entrance animations to skip when reduced motion is on. Convert all `animation: aurora-drift` and `glow-pulse` to static states.

---

## 5. Iconography

- Keep **lucide-react** but switch the default `strokeWidth` to **1.5** (lighter, more editorial). 
- Default size 18px in dense UI, 20px in nav/headers, 16px in chips.
- For marketing site illustrations: use **outline style** at strokeWidth 1.25 with subtle terracotta accents.

---

## 6. Component-by-component re-skin

For every component listed below, update visuals only — preserve all props, callbacks, and a11y. Update `src/components/ui/*` and component-level styling across `src/features/*`.

### Buttons (`Button.tsx`)

Variants:

- **Primary**: `bg-glow-primary` text white, `shadow-paper-sm` resting → `shadow-glow-sm` hover; rounded-full for marketing CTAs, rounded-lg (10px) for in-app.
- **Secondary**: `bg-bg-elevated` `text-ink-primary` `border border-default`, `shadow-paper-sm`; hover deepens border to `border-strong`.
- **Ghost**: transparent, `text-ink-secondary`, hover `bg-bg-muted`.
- **Danger**: `bg-danger` text white, hover `shadow-glow-sm` with red glow override.
- **Link**: terracotta `text-primary` with `underline` on hover, no background.

Sizes:
- `sm`: h-8, px-3, ui-sm, gap-1.5
- `md` (default): h-10, px-4, ui, gap-2
- `lg`: h-12, px-6, ui-lg, gap-2
- `xl` (marketing only): h-14, px-8, body-lg

Add a subtle pressed state: `active:translateY(0.5px)` and shadow shrinks.

### Cards

Replace flat cards with **paper cards**:
- `bg-bg-elevated` `border border-subtle` `rounded-xl` (16px) `shadow-paper-sm` `p-6`
- On hover (when interactive): `shadow-paper-md`, `shadow-inner-glow`, `-translate-y-0.5`, `transition-all duration-220 ease-editorial`
- Section dividers inside cards use `border-t border-subtle`, never thick borders.

### Inputs / Textareas

- `bg-bg-elevated` `border border-default` `rounded-lg` `h-10` (input) / `min-h-24` (textarea)
- Padding: `px-3.5`
- Placeholder: `text-ink-faint`
- Focus state: `border-primary` + `shadow-focus`
- Invalid state: `border-danger` + `shadow-focus-soft` with danger glow

### Tabs

- Tabs in the topbar (project views) become **understated**: text-only with a 2px terracotta underline indicator on the active tab. Underline animates between tabs with `transition-all 240ms ease-editorial`. No pills, no background fills.
- Tabs in detail panels (Comments / Activity / Time / Expenses): same understated treatment.

### Dropdown menus / Popovers

- `bg-bg-elevated` `border border-subtle` `rounded-xl` `shadow-paper-md` with `texture-paper` overlay at 20% opacity inside
- Item padding: `px-3 py-2`
- Hover: `bg-bg-muted`
- Selected: `bg-primary-soft` `text-primary`
- Separator: `border-t border-subtle` with `my-1`
- Mount with the popover animation pattern (fade + translate-y-4)

### Dialogs / Modals

- Backdrop: `bg-overlay` with `backdrop-blur-md`
- Modal: `bg-bg-elevated` `rounded-2xl` `shadow-paper-lg` `border border-subtle`
- Header: serif H3 in Fraunces, subdued caption beneath in Inter
- Close button: ghost icon button in top-right
- Footer actions: right-aligned with `gap-2`

### Tooltips

- Dark warm tooltip: `bg-ink-primary` text `ink-inverse`, `text-xs`, `rounded-md`, `px-2 py-1`, `shadow-paper-sm`. Arrow optional.
- Animation: fade + 4px translate.

### Badges / Pills

- **Soft pill** (default): `bg-{tone}-soft` `text-{tone}` `rounded-full` `px-2.5 py-0.5` `text-caption`
- Status pills (On Track / At Risk / Off Track / On Hold):
  - On Track: `bg-accent-soft text-accent` + small accent dot
  - At Risk: `bg-warning-soft text-warning` + dot with `shadow-glow-dot-warn`
  - Off Track: `bg-danger-soft text-danger` + dot with `shadow-glow-dot-err`
  - On Hold: `bg-bg-muted text-ink-muted` + dot in ink-muted
- Numeric badges: `bg-primary-soft text-primary` `font-mono`

### Avatars

- Round, with warm pastel fill colors when no image (10-color palette of muted earth tones: terracotta, sage, dusty rose, ochre, sand, slate, plum, mocha, fern, sky-clay).
- Online dot: `bg-accent` with `shadow-glow-dot`.
- Inside an avatar group (stack): subtle ring `ring-2 ring-bg-elevated`.

### Sidebar (`AppShell`)

- Background: `bg-bg-sunken` (light) / `bg-bg-sunken` (dark — already warm dark)
- Border-right: 1px `border-subtle`
- Workspace switcher button: paper card with `bg-bg-elevated` + warm shadow
- Navigation items: `text-ink-secondary`, hover `bg-bg-muted text-ink-primary`, active `bg-primary-soft text-primary` (no shadow)
- Section labels (Pinned, Insights, Projects, Teams) in `overline` style: small uppercase tracked text in `ink-muted`
- Sidebar logo lockup: serif "Tasklytic" wordmark in Fraunces 500 next to the rounded-square mark
- Bottom user pill: paper card with avatar + name + small online dot
- Collapse handle: subtle terracotta on hover

### Topbar

- `bg-bg-base/80 backdrop-blur-md` (translucent), border-bottom `border-subtle`
- Breadcrumbs in `ui-sm text-ink-secondary`, separators are slim "/" in `ink-faint`
- Search input: ghost style with leading `Search` icon; on focus, expands subtly and gains `shadow-focus-soft`
- `⌘K` shortcut hint inside the search input, right-aligned
- Create button: primary with subtle glow
- Bell, theme toggle, avatar: ghost icon buttons with `hover:bg-bg-muted`
- Theme toggle uses a sun ↔ moon morph animation

### Command palette (⌘K)

- Same paper-card aesthetic with `texture-paper` overlay
- Input: large, serif placeholder "Search Tasklytic…" in Fraunces 400 italic 18px
- Result items: subtle hover bg, matched substrings highlighted with `bg-primary-soft text-primary` (no harsh yellow)
- Group labels in `overline`

### List view (`features/views/list`)

- Header row: `bg-bg-muted` with `border-b border-subtle`, column titles in `caption` uppercase tracked
- Rows: 40px tall (slightly more generous than step 08's 36px to feel less cramped)
- Hover state: `bg-bg-muted` (no harsh blue)
- Selected: `bg-primary-soft` with left 2px `border-l-primary` accent
- Section headers: serif Fraunces 500, paper card style above sections
- Dependency indicators, comment count: small ghost icons in `ink-muted`
- Inline new-task row uses placeholder in italic serif: *"Write a task…"*

### Board view (`features/views/board`)

- Column background: `bg-bg-muted` with `rounded-2xl`
- Column header: paper card, `bg-bg-elevated` with `shadow-paper-sm`, contains section name + count + WIP limit chip + "+" button + "..." menu
- Cards: paper card aesthetic; cover image color strip becomes a 4px terracotta-tinted bar (no harsh saturated color); subtle hover bloom

### Calendar view

- Day cells: `bg-bg-elevated` with hairline `border-subtle`
- Today: terracotta 2px ring instead of background fill, plus a small accent dot
- Weekends: `bg-bg-muted` (subtle warm tint instead of cool gray)
- Event chips: pill-shaped with warm tones, project icon prefix
- Multi-day bars: rounded with the project's color but desaturated to fit the warm palette

### Timeline & Gantt

- Bars get a paper feel: filled with project color (warmed) + 1px `border-strong` + subtle `shadow-paper-sm`
- Today line: terracotta 1px line with a small label chip
- Dependency arrows: 1.25px `ink-muted` strokes with soft endpoint glows on hover
- Critical path bars: 2px terracotta outline + `shadow-glow-sm`
- Time axis text in `caption` `ink-muted`

### Task detail pane

- Slide-in pane background: `bg-bg-elevated`
- Header bar: paper-textured, with subtle `texture-paper`
- Title input: serif Fraunces 500 28px — feels like writing in a journal
- Field rows: 36px tall with `border-b border-subtle` separators
- Field labels: `caption` uppercase tracked
- Field values: refined inputs / pickers with the new design
- The "Time" tab header strip (hours / billable / non-billable) renders as 3 paper-card mini stats with the numeric values in JetBrains Mono and labels in `overline`
- Comments thread: each comment is a small paper card with rounded corners; subtle warm hover

### Charts (reporting)

- Replace electric palettes with a curated warm categorical palette:

```js
chartPalette: [
  '#CC785C',  // terracotta (primary)
  '#6B8E5A',  // sage
  '#C99846',  // amber
  '#5C7A8C',  // dusty blue
  '#B85968',  // dusty rose
  '#8B6F47',  // mocha
  '#A0795B',  // sand
  '#8B5E83',  // plum
  '#5E8A8B',  // teal-sage
  '#A07B3F',  // ochre
]
```

- Axis and grid lines in `ink-faint` (1px, dashed where appropriate).
- Tooltips: dark warm with serif numeric headlines and sans labels.
- Donut center label uses Fraunces.
- All charts gain a subtle inner shadow at the chart canvas edges for depth.

### Empty states

Replace generic SVGs with **editorial illustrations** built inline:
- Minimal line drawings in `ink-muted` strokes at 1.25 stroke width
- A single terracotta accent shape (a small filled circle, an underline, a dot pattern)
- Centered, generous whitespace, serif headline "Nothing here yet", sans subhead, primary CTA below
- Some empty states feature a poetic micro-copy line in italic serif (e.g., on My Tasks empty state: *"A quiet inbox. A good day to start something."*)

### Toasts

- Paper card with `border-l-4` colored by status (`border-l-accent` success, `border-l-warning`, `border-l-danger`, `border-l-info`)
- Title in Inter 500, body in Inter 400 muted
- Icon at left in matching status color
- Auto-dismiss progress bar at bottom (1px terracotta line that shrinks over the duration) — gives a subtle glow feel

### Skeletons

- Use `bg-bg-muted` with a gentle shimmer animation (left → right gradient sweep, 1.4s, infinite)
- Shimmer uses warm cream highlight

---

## 7. Public marketing site (signed-out experience)

Add a new feature folder `src/features/marketing/` with routes that live **outside** `<RequireAuth>`.

### Routes

```
/                          → MarketingHomePage     (when signed out; when signed in, redirect to /w/:wsId/home)
/features                  → FeaturesIndex
/features/list-view
/features/board-view
/features/timeline
/features/reporting
/features/forms
/features/automations
/features/ai
/features/time-tracking
/solutions                 → SolutionsIndex
/solutions/agencies
/solutions/accounting-firms
/solutions/law-firms
/solutions/finance-teams
/solutions/people-teams
/pricing                   → PricingPage
/customers                 → CustomersPage          (logo wall + 3 case studies)
/about                     → AboutPage
/changelog                 → ChangelogPage
/blog                      → BlogIndex              (3 example posts)
/blog/:slug                → BlogPostPage
/security                  → SecurityPage
/legal/terms               → LegalPage
/legal/privacy             → LegalPage
```

All marketing pages share a **marketing chrome**: a transparent-on-top nav that solidifies on scroll, and a deep footer with sitemap, social links, and brand wordmark.

### Marketing nav

- Logo lockup (rounded-square mark + Fraunces wordmark "Tasklytic")
- Menu items: Features (mega-menu), Solutions (mega-menu), Pricing, Customers, Changelog
- Right side: "Sign in" ghost link + "Start free" primary button
- Transparent at top with backdrop-blur appearing on scroll past 24px
- Mega-menus: paper card dropdowns with grouped feature links, each row has an icon and a short tagline

### Marketing home page (`/`)

A long, scrolling, editorial page with these sections (in order):

1. **Hero**
   - Full-bleed `bg-aurora-animated` background
   - Display Fraunces 300 headline (left-aligned, 7xl on desktop):
     > *Where ambitious teams do their best work.*
   - Subhead (Inter body-lg, ink-secondary, max-w-prose):
     > A modern home for projects, goals, and the people who deliver them.
   - Primary CTA "Start free" + secondary "Watch the product tour (2 min)" with a tiny "▶" icon
   - Below CTAs: small caption with avatar stack — "Trusted by 8,000+ teams"
   - On the right side of the hero: an angled product screenshot (rendered as an inline SVG illustration of the Board view inside a paper card with `shadow-paper-lg` and `shadow-glow` underneath). The screenshot floats with a subtle 6s y-axis sway (respects reduced motion).

2. **Logo wall**
   - Quiet section: `bg-bg-base`, caption "Loved by teams at…"
   - Row of 8 grayscale logo SVGs (invent reasonable brand names: Beacon, Crestwood, Hartwell, Atlas Studio, Northwind, Lighthouse, Meridian, Sterling) in `ink-muted`

3. **Feature grid (3×2)**
   - Heading: *"Everything your team needs. Nothing that gets in the way."*
   - 6 paper cards, each with:
     - A small thumbnail (60×60 SVG illustration)
     - Serif H3 title
     - Two-line sans description
     - "Learn more →" link
   - Topics: Five powerful views, Smart automations, Real-time reporting, Goals & OKRs, AI that drafts your work, Time & expenses
   - Hover effect: card lifts, terracotta `shadow-glow-sm` blooms in

4. **Editorial split** (image + prose)
   - Two-column 50/50: left = a quote pull-out in Fraunces 28px italic, attributed
   - Right = a styled product illustration (Timeline view in a paper card)
   - Repeat alternating sides for 3 such splits, each tied to a different feature

5. **Numbers / outcomes strip**
   - 4 columns of big serif Fraunces numerals + sans captions:
     - "3×" — Faster project setup
     - "67%" — Less status-meeting time
     - "8,000+" — Teams onboarded
     - "98%" — User satisfaction

6. **Use cases tiles**
   - 6 paper card tiles linking to `/solutions/*`:
     - Marketing teams, Engineering, Operations, Accounting & Tax, Law firms, Finance — with brief icon + heading + 1-line tagline

7. **Customer testimonials**
   - 3 large quote cards in a horizontal scroller (snap-aligned on mobile)
   - Each: avatar, name, role, company logo (small), Fraunces 22px italic quote, "Read story →"

8. **Pricing teaser**
   - 3 plan cards (Starter / Growth / Enterprise) with prices, key features, CTA
   - Highlighted "Most popular" card uses `bg-glow-primary` border accent
   - Below: "Full pricing →" link

9. **Closing CTA banner**
   - Full-bleed warm card with `bg-aurora` and `texture-paper`
   - Centered Fraunces 5xl: *"Begin building something the team is proud of."*
   - Primary button "Start free" + caption "No credit card · Free forever for up to 10 users"

10. **Footer**
    - Multi-column sitemap (Product, Solutions, Resources, Company, Legal)
    - Newsletter signup (email input + button)
    - Social icons (X, LinkedIn, GitHub, YouTube)
    - Bottom row: wordmark, copyright, region selector
    - Background: `bg-bg-sunken`, top border `border-subtle`

### Features index page

A scrollable, editorial layout listing all major features as full-width sections, each with: serif headline, sans intro paragraph, inline product illustration, 3 bullet points, "Learn more" link. Sections in this order: Views, My Tasks, Goals, Portfolios, Reporting, Forms, Automations, AI, Time & Expenses, Templates, Integrations (overview page that surfaces every adapter from the production-architecture seam table in the README).

### Solutions pages (`/solutions/*`)

Each one (Agencies, Accounting Firms, Law Firms, Finance Teams, People Teams) is a tailored long-form landing page that:
- Opens with hero in industry-relevant language (e.g., accounting: *"Built for the way real CPA firms work."*)
- Shows industry-specific screenshots rendered from the B-series template starter content for accounting and the C-series starter content for law
- Lists 4–6 tailored capabilities
- Has industry-relevant testimonial
- Closes with a CTA

For Accounting Firms and Law Firms, explicitly highlight:
- Time tracking with UTBMS codes
- Trust accounting & retainer balances
- Invoice generation
- WIP, Realization, Utilization dashboards
- B-series / C-series template gallery

### Pricing page

3 plan cards with feature comparison table beneath:
- **Personal** — Free forever, up to 10 users, basic features
- **Business** — $12 per user per month, all features, ideal for growing teams (badge "Most popular")
- **Enterprise** — Contact us, SSO, advanced security, dedicated support
- Toggle Monthly / Annual (annual saves ~20%)
- "FAQs" accordion at bottom
- "Compare plans" full-feature table further below

### Customers page

- Hero: serif headline *"Teams of every shape and size build with Tasklytic."*
- Logo wall (8–12 logos, grayscale)
- 3 detailed case studies as featured cards (image, name, summary, "Read story")
- Each case study page is at `/customers/:slug` (build one example: "How Sterling & Brooks CPA closes month-end 30% faster")

### About page

- Hero: serif headline + 3-paragraph editorial story
- "Our principles" — 4 cards (Craft, Trust, Calm, Together) with serif title + sans body
- "Built by people who…" — team grid with avatars and short bios
- "We're hiring" — link to `/careers` (lives in the marketing site; renders a careers index page)

### Changelog

A timeline of releases. Each entry: date, version tag, serif heading, sans body, screenshots. Use the Feature Log from `Design.md` as source data (generate 8 entries from the actual build steps so the changelog feels real).

### Blog

3 launch posts (the first wave of real blog content; expand from here):
- "Why we built Tasklytic"
- "From 100 emails to 1 dashboard: How modern teams report"
- "Five views, one team: A pattern language for collaboration"

Layout per post: full-width cover image (warm gradient SVG cover generated from the post slug for visual consistency), Fraunces title 5xl, byline + date + read-time, prose with `max-w-prose`, pull quotes, code blocks where relevant, share buttons.

### Security page

Editorial single-page covering: SOC 2 status (claim "in progress" honestly), encryption, data residency options, SSO, audit logs, customer-managed encryption keys (CMEK). Designed cleanly with small badges.

### Legal pages

`/legal/terms` and `/legal/privacy` as long-form pages with table of contents sidebar; serif headings, prose body, anchor-linked sections.

---

## 8. Sign-in / sign-up redesign (step 03)

Reskin the auth pages to feel like a continuation of the marketing site:
- Left 60%: paper card with the form
  - Serif welcome headline ("Welcome back" / "Create your account")
  - Inputs with the new aesthetic
  - Primary CTA with subtle glow
  - "Continue as Guest" ghost button
  - Tiny terracotta link to the other auth mode
- Right 40%: `bg-aurora-animated` panel with a quote and a tiny attribution
  - Quote rotates between 3 (random on each visit), all in serif italic 22px
  - Bottom: small wordmark

---

## 9. Light/dark mode toggle UX

- Theme toggle becomes a sun ↔ moon icon that morphs smoothly on click (180ms rotation + scale dip)
- Add a "System" tri-state cycle (Light → Dark → System → Light)
- On theme change, animate the body background color over 280ms with `ease-editorial` to prevent flashing

---

## 10. AI assistant visual refresh

- The AI panel (step 28) gets a refined header: serif "Tasklytic AI" wordmark, a small terracotta sparkles icon with a subtle `glow-pulse`
- Background of the panel: `bg-bg-base` with `bg-aurora` at the top 30% (radial warmth)
- AI typing indicator: 3-dot wave in terracotta with the wave animation noted in motion section
- Proposal cards: paper cards with the inner-glow on hover; "Apply" button uses subtle glow
- When the AI is processing, the panel header gets a 1px animated terracotta line at the bottom border (left-to-right shimmer, 1.6s loop)

---

## 11. Accessibility checks (don't break what step 29 will solidify)

- Contrast: verify every text-on-background combination at WCAG AA. Most-watched: `ink-muted` on `bg-base` (must be ≥ 4.5:1), `text-primary` on `bg-bg-elevated` (verify, may need a slightly darker primary in light mode).
- Glow effects must never be the *only* indicator (always pair with shape/border/text).
- Focus rings: always visible, never `outline: none` without a replacement.
- Respect `prefers-reduced-motion` for all aurora animations, scroll reveals, hover lifts, and AI dots.
- Underlines on links restored for in-prose contexts (marketing pages, blog, legal).

---

## 12. Component implementation map

Files to create or substantially update:

```
src/styles/globals.css                          (overhaul tokens, utilities, fonts)
src/styles/marketing.css                        (marketing-specific resets and prose styles)
tailwind.config.ts                              (extend theme as specified)

src/components/ui/*.tsx                         (every UI primitive updated — Button, Input, Card, Dialog, Tabs, Badge, Avatar, Tooltip, DropdownMenu, Popover, Toast, Skeleton)
src/components/branding/Logo.tsx                (rounded-square + Fraunces wordmark)

src/features/shell/AppShell.tsx                 (sidebar bg, topbar translucency)
src/features/shell/Sidebar.tsx
src/features/shell/Topbar.tsx
src/features/shell/CommandPalette.tsx

src/features/marketing/MarketingChrome.tsx      (nav + footer)
src/features/marketing/MarketingHomePage.tsx
src/features/marketing/FeaturesIndex.tsx
src/features/marketing/FeatureDetailPage.tsx
src/features/marketing/SolutionsIndex.tsx
src/features/marketing/SolutionAgenciesPage.tsx
src/features/marketing/SolutionAccountingPage.tsx
src/features/marketing/SolutionLawPage.tsx
src/features/marketing/SolutionFinancePage.tsx
src/features/marketing/SolutionPeoplePage.tsx
src/features/marketing/PricingPage.tsx
src/features/marketing/CustomersPage.tsx
src/features/marketing/CaseStudyPage.tsx
src/features/marketing/AboutPage.tsx
src/features/marketing/ChangelogPage.tsx
src/features/marketing/BlogIndex.tsx
src/features/marketing/BlogPostPage.tsx
src/features/marketing/SecurityPage.tsx
src/features/marketing/LegalPage.tsx
src/features/marketing/components/Hero.tsx
src/features/marketing/components/AuroraBackground.tsx
src/features/marketing/components/FeatureCardGrid.tsx
src/features/marketing/components/EditorialSplit.tsx
src/features/marketing/components/NumbersStrip.tsx
src/features/marketing/components/TestimonialCard.tsx
src/features/marketing/components/PricingCard.tsx
src/features/marketing/components/LogoWall.tsx
src/features/marketing/components/CTASection.tsx
src/features/marketing/content/heroQuotes.ts
src/features/marketing/content/testimonials.ts
src/features/marketing/content/featureCards.ts
src/features/marketing/content/changelog.ts
src/features/marketing/content/blogPosts.ts

src/features/auth/SignInPage.tsx                (reskinned per section 8)
src/features/auth/SignUpPage.tsx

src/features/ai/AiPanel.tsx                     (visual refresh per section 10)

src/features/charts/Chart.tsx                   (warm palette + tooltip restyle)
src/features/views/list/*                       (updated table styling)
src/features/views/board/*                      (updated card styling)
src/features/views/calendar/*                   (updated day cells)
src/features/views/timeline/*                   (updated bars, axis)

src/features/tasks/TaskDetailPane.tsx           (paper-textured header, serif title)
src/hooks/useScrollReveal.ts                    (IntersectionObserver hook for marketing)
src/hooks/useReducedMotion.ts                   (or extend existing)
```

---

## 13. Implementation order within this step

The AI agent should perform the work in this order to avoid visual chaos mid-build:

1. Update CSS variables and Tailwind config (palette, fonts, shadow utilities, aurora utilities).
2. Update typography across `globals.css` (default body to Inter, headings serif via component-level classes).
3. Update every UI primitive in `src/components/ui/`.
4. Update `AppShell`, `Sidebar`, `Topbar`, `CommandPalette`.
5. Sweep all feature folders (`features/projects`, `features/tasks`, `features/views/*`, etc.) replacing color tokens and applying glow rules from section 3.
6. Re-skin charts.
7. Reskin auth.
8. Build the marketing site under `src/features/marketing/` and wire routes.
9. Final pass: empty states, toasts, skeletons.
10. Append `Design.md` update.

---

## 14. Success criteria

- The app is unmistakably warm, editorial, and refined. A first-time viewer would describe it as "feeling like Anthropic's site as an app."
- Every primary CTA glows subtly without being garish.
- The home route `/` (when signed out) presents a polished, scrolling marketing site with hero aurora, editorial typography, feature grid, testimonials, pricing teaser, and footer.
- Industry solutions pages exist for Accounting Firms, Law Firms, Finance, Agencies, and People teams, and they reference real capabilities from prior steps (time tracking, UTBMS, WIP, etc.).
- Dark mode is warm — no pure black anywhere.
- WCAG AA is preserved.
- `prefers-reduced-motion` disables auroras and hover lifts.
- The serif/sans pairing reads beautifully on every screen size.
- `Design.md` has the new **Visual identity** section.

**Do not break any business logic.** No data model changes. No behavior changes. Visual + motion + marketing pages only.
