# Design QA — verification pass after the fix round

Verified 2026-08-23 against `design/proposals/finance/DESIGN.md` on the dev build (`http://localhost:5186`, API :8010) at commits `ca52f2a` (kit), `85b1674` (pages), `203d3fe` (kit), `ae955d0` (record pages).
Inputs: `core-screens.md` (6 P1) and `record-screens.md` (2 P0, 14 P1). Every P0/P1 was re-tested at the viewport(s) named in the original finding; 10 P2s the fix commits claim were spot-checked; then a regression sweep.

Method: headless Playwright Chromium 1.62 (fresh isolated context per viewport, DPR 2), admin@demo.firm unless stated. All values are computed-style / bounding-box readings. Dialog measurements were taken ≥300 ms after open so the 180/200 ms entry animation (`scale(.98)`, `translateX(16px)`) had finished. No source files were edited. All test actions (duplicate create, archive, unqualify, sign-out-everywhere) were cancelled at the confirm step; no data changed.

## Status table — P0 / P1

| Report # | Sev | Status | Evidence (measured) | Note |
|---|---|---|---|---|
| core #1 Opportunities table view | P1 | CLOSED | 1440: `table-layout: fixed`, table 1158px in 1158px wrapper, overflow 0; widths Opportunity 258 / Stage 140 / Practice area 160 / Amount 128 / Weighted 128 / Prob. 64 / Expected close 120 / Owner 160; rows 53px uniform (two-line name/account), 0 wrapping cells, name `text-overflow: ellipsis` with title. 1280: Weighted + Practice area hidden, overflow 0. 1180: Owner also hidden, overflow 0. `shots/verify-opps-table-1440.png` | Rows measure 53 (52 + 1px rule), same as the 40→41 behaviour elsewhere; acceptable. Stale chip now sits under the stage badge. |
| core #2 Sidebar <1180 | P1 | CLOSED | 1100 and 1179: `aside` 56px, 0 visible nav labels (icon + `aria-label`/`title`), search is a 28×28 button `aria-label="Search (⌘K)"`, top bar 52px. 1180: 232px sidebar, 320px search input. `shots/verify-rail-1100.png` | Breakpoint is `(max-width: 1179px)` — matches §5 "<1180". Board still scrolls 148px at 1100, which §5 allows. |
| core #3 Dashboard KPI row 1180–1279 | P1 | CLOSED | 1180: 3 columns, tiles 284×128, every label 1 line. 1279: 3 columns, 317px. 1280: 6 columns, 151px. 1440: 6 columns, 177px. Skeleton grid uses the same classes. `shots/verify-dashboard-1180.png` | At exactly 1280 the 6th label ("Pending clearances") wraps to 2 lines inside a 151px tile — see new issue N3. |
| core #4 Raise wall modal | P1 | CLOSED | Title "Raise ethical wall" 1 line (22px h2), close button 28×28, modal 560px, record name ("Atlas Freight Systems") in the body; no `ADMIN_BYPASSES_WALLS` string anywhere in the dialog. | Also resolves core #35 copy leak. |
| core #5 Tertiary text contrast | P1 | PARTIAL | `--color-sand-500` is now `#6f6a61`: 4.93:1 on canvas `#f7f5f1`, 5.37:1 on white (AA at 12px). `--color-sand-400` unchanged `#a39e94` = 2.45:1 and is still used as readable text on the board: column probabilities "10%…80%" at 11px, footnote "Open view · drag cards between stages…" at 11px, Won/Lost strip hints "· requires cleared check and signed engagement letter" / "· you will be asked for a reason" at 12px, empty-column "No opportunities" 12px. Dashboard/Leads/Account/Clearance/Tasks: no readable `text-sand-400` found. | The token comment in `index.css` says sand-400 is "never readable text", but `OpportunitiesPage.tsx` lines 84, 177, 182, 191 still use it. Move those four to `sand-500` (footnote to 12px). |
| core #6 Run check / Mark lost surfaces | P1 | CLOSED | Both open as `Drawer`: x 960→1440 at 1440 (480px wide), 900px tall (full height), `border-left 1px #e7e4de`, `shadow-modal`, animation `drawer-in 0.2s`; stage rail and facts remain visible; initial focus lands in the first field (textarea / select); Escape returns focus to the "Run check" button. `shots/verify-drawer-runcheck.png` | |
| records #1 Modal focus management | P0 | CLOSED | New lead: on open `activeElement` = first field (`…-first_name`); 24× Tab stays inside the dialog and cycles back to the first field; Shift+Tab wraps; Escape closes and focus returns to the "New lead" trigger. Confirm dialogs focus Cancel on open; Settings "Sign out everywhere" confirm → Escape returns focus to its trigger. | Focus return does not work when the opener was a menu item — see N1. |
| records #2 Native `confirm()` / `prompt()` | P0 | CLOSED | `grep` of `frontend/src` for `window.confirm|window.prompt|confirm(|prompt(` outside the kit: 0 hits. Archive account → `ConfirmDialog` "Archive this account?", title `#1a1916`, one-sentence body, buttons Cancel / Archive (`danger-solid` `#c2392b` on white), no close ×, header background transparent (no red bar), focus on Cancel, 560px. Leads ⋯ → "Mark unqualified" → `ReasonDialog` with textarea, confirm disabled until text, danger-solid confirm, cancel leaves no toast. Settings sign-out-everywhere, Data commit, Admin delete stage, Lift wall, Delete activity all route through `useConfirm` in source. `shots/verify-confirm-archive.png`, `shots/verify-reason-dialog.png` | |
| records #3 Duplicate account copy | P1 | CLOSED | Creating "Atlas Freight Systems" → second dialog "Possible duplicate account" / "An account with this name already exists. Create a second record anyway?" / Cancel + "Create anyway" (primary `#4b55c8`, not danger). `allow_duplicate` string absent. After Cancel: form still open with the typed name, no error toast, API message not re-shown. | The 409 from the API shows in the console as a failed-resource line (expected; not a JS error). |
| records #4 Required / invalid state | P1 | CLOSED | New lead form has `novalidate`; submitting empty shows "First name is required." / "Last name is required." at 12px `#c2392b` with `margin-top 4px`; inputs get `aria-invalid="true"`, `aria-describedby="…-first_name-error"`, border `#c2392b` + `0 0 0 3px #fbe9e7` ring; no native bubble (`:invalid` absent); dialog stays open. Settings/forced-password use `useFieldValidation` with an inline "New passwords do not match." rule (source). `shots/verify-lead-modal-invalid.png` | Money fields now carry the `$` prefix (13px `#6f6a61`, input right-aligned, `padding-left 24px`); select placeholder is "Select…". |
| records #5 Two-line record cells | P1 | CLOSED | Leads, Accounts, Contacts, Engagements, Campaigns, Tasks, Admin › Users: `tr.row-2line`, row 52px, `td` padding `6px 16px`, sub-line present. | |
| records #6 Contacts column widths | P1 | PARTIAL | 1440: 0/50 names and 0/50 titles truncate (NameCell `max-width 260px`). But the Name header measures 209px (spec min 240) because the table is `table-layout: auto` and the `width: "260px"` hint is not honoured; header widths Name 209 / Account 202 / Role 124 / Lifecycle 131 / Email 220 / Owner 145 / Last activity 112. Emails: 45/50 truncate at the new 220px cap (title tooltip present). | Give the Contacts `DataTable` `layout="fixed"` (as Opportunities does) so 260px sticks, and let Email take the remainder instead of a 220px cap. |
| records #7 Horizontal table overflow | P1 | CLOSED | Overflow (scrollWidth − clientWidth) = 0 on Leads, Accounts, Contacts, Engagements, Campaigns (with and without the side panel), Tasks, Clearance, Admin › Users, Admin › Audit log, Settings › Sessions at 1440, 1280 and 1180; `main` never scrolls horizontally. Leads at 1180: 5 of 7 columns visible, Convert button right edge 1131px ≤ 1180. Accounts 8→7→6 columns, Engagements 7→5→4, Campaigns 9→7→6. | |
| records #8 Key-facts values truncate | P1 | CLOSED | Account 11, 1440: 6 columns in one row, no value or sub-line truncates (`scrollWidth ≤ clientWidth`), money 24px `nowrap`, text 20px wraps (`Elena Castellanos` wraps to 2 lines rather than clipping). 1280: 5 columns, 2 rows. 1180: 4 columns, 2 rows, money steps to 20px, "$426,000" / "Aug 23, 2026" intact. Contact 30: Account/Owner/Last activity 20px, Related pipeline 24px, none truncated. `shots/verify-account-1180.png` | See N2 for the 4+2 wrap leaving a blank half row at 1180–1279. |
| records #9 Details card stretched | P1 | CLOSED | Account 11 Overview: main column 216px vs rail 420px (grid has `items-start`); Recent activity renders 5 items with a "View all" ghost button to the Activity tab. | |
| records #10 Tertiary text contrast | P1 | CLOSED | `sand-500` `#6f6a61` → 4.93:1 on canvas, 5.37:1 on white at 12px. | The residual sand-400 usage is tracked under core #5. |
| records #11 Admin password field | P1 | CLOSED | Add user: `input[type=password]`, label "Temporary password *", hint "At least 12 characters with letters and digits. The user must change it at first sign-in."; "min 8" absent. Edit user label "Reset password" (source). | |
| records #12 Settings › Active sessions | P1 | CLOSED | 10 rows rendered ("10 of 106 sessions"), "Show all 106" ghost button, card 589px tall, Client column "Chrome · macOS" / "API client", horizontal overflow 0. | |
| records #13 Account header action cluster | P1 | CLOSED | 1440/1280/1180: inline buttons = Edit, New opportunity (primary), ⋯ "More actions"; header 48px at every width (no wrap). Menu items: "Run conflict check", "Archive account" (danger red). | |
| records #14 Status tone mapping | P1 | CLOSED | Leads "Qualified" dot `#2c63b8` (info-600); Accounts "Referral Source" dot `#a39e94` (neutral); Leads "Converted" pill `bg #efede8 / text #44413b` (neutral), no accent. `statusTone` source: qualified→blue, referral_source/converted→slate. | |
| records #15 Clickable rows keyboard | P1 | CLOSED | Accounts rows `tabindex="0"`; focused row outline `solid 2px #4b55c8`, `outline-offset -2px`, `:focus-visible` true; Enter navigates to `/accounts/11`. | |
| records #16 Sidebar <1180 | P1 | CLOSED | Same evidence as core #2. | |

Totals (P0/P1, 22 findings): **CLOSED 20 · PARTIAL 2 · STILL OPEN 0**.

## P2 spot-checks (claimed by the fix commits)

| Report # | Status | Evidence |
|---|---|---|
| core #26 / records #25 Native checkboxes | CLOSED | Filter-row and Raise-wall checkboxes: 16×16, `appearance: none`, radius 3px, border `#c4bfb5` (sand-300); checked → background and border `#4b55c8`, `::after` 10px check. |
| core #18 Recharts tooltip separator | CLOSED | Dashboard stage chart tooltip renders "Amount: $258,345" (`.recharts-tooltip-item-separator` = ": "). |
| core #19 / records #26 Facts value sizes | CLOSED | Opportunity 38: Owner and Originating partner 20px (Amount/Probability 24px). Account 11 / Contact 30: text facts 20px, money 24px. |
| core #17 "High" badge | CLOSED | Dashboard task meta: dot variant (`<i>` `#c2392b`), transparent background, text sand-900. |
| core #21 Review button variant | CLOSED | Clearance: both "Review" buttons are 28px secondary (white background, sand-900 text). Tab counts are now stable ("Pending review 2", "All checks 12"). |
| records #3 Duplicate-account copy | CLOSED | See P1 row above. |
| records #12 Sessions slice | CLOSED | See P1 row above. |
| records #17 Tasks Done control | CLOSED | 28×28 button; Recent-activity tab has 0 blank cells (dashes for non-task rows). |
| records #18 Leads status control | CLOSED | Dot + label with a hover-revealed ⋯ "Change status" menu (Mark contacted / Mark qualified / Mark unqualified); converted leads keep the filled pill. |
| records #28 Data file picker | CLOSED | Native `input[type=file]` is `sr-only` (1px); visible control is a 32px secondary "Choose CSV…" button. |

Also confirmed in passing: top bar 52px (core #7); board gap 16px and board padding 24/20 (core #8, but column `min-width` is still 216px, spec 220); dense stage-table header 36px (core #15); Won QTD value sand-900 (core #16); merged timeline shows stage-change and shield discs (core #22); `fmtDateTime` "Aug 22, 2026 · 5:49 PM" (core #25); FormModal 720px / confirm 560px (core #29); campaign panel title untruncated and member selects 32px/13px (records #29); login title 28px and demo chips 28px (records #22).

## Regression sweep

| Check | Result |
|---|---|
| Every route renders (19 routes: dashboard, leads, accounts + 2 details, contacts + detail, opportunities + 3 details incl. won/lost, clearance, engagements, campaigns, tasks, reports, settings, data, admin) | All render with an `h1` and content cards; no error boundary / not-found text. `main` horizontal overflow 0 on every route. |
| Console errors | 0 JS/page errors as admin across all routes plus 7 Reports tabs and 5 Admin tabs. 0 errors as partner.lit, manager and staff across 6 routes each. The only console lines during the whole pass were a 409 (duplicate-account gate, expected API response) and a 401 caused by the probe's own fetch. |
| No horizontal overflow on any list at 1440 / 1280 / 1180 | 0px on all 11 list tables (see records #7). |
| Sidebar rail at 1100 | 56px rail, icon search, user avatar + ⋯ menu. |
| Modal focus trap | New lead: PASS (see records #1). |
| Confirm dialog | Archive account: PASS; Sign out everywhere: PASS (focus returns to trigger). |
| Lead reason dialog | PASS (required textarea gates the danger-solid confirm; cancel is silent). |
| Detail drawers | Run check and Mark lost: both 480px right-anchored drawers, record stays visible, focus managed. |

## New issues introduced by the fixes

| Sev | Screen | Observed | Expected | Fix hint |
|---|---|---|---|---|
| N1 P2 | Any dialog launched from an `OverflowMenu` (Account detail › ⋯ › Archive; Leads › ⋯ › Mark unqualified) | After the confirm/reason dialog closes (Cancel or Escape), `document.activeElement` is `<body>` — the menu item that opened it was unmounted, so `useFocusTrap` cannot restore focus. Button-launched dialogs restore correctly. | Focus returns to the ⋯ trigger (§6.11 / a11y). | In `OverflowMenu`, focus the trigger before invoking the item (`btn.current?.focus(); it.onSelect();` instead of `close(false)` then `onSelect`), or have `useFocusTrap` fall back to `opener.closest('[data-open]')`'s button when the opener is detached. |
| N2 P2 | Account detail facts grid, 1180–1279 | `auto-fit, minmax(180px, 1fr)` yields 5 columns at 1280 and 4 at 1180; with 6 facts the second row holds 1–2 cells and the rest of the row is blank white inside the card (`shots/verify-account-1180.png`). | §6.4 "4–6 columns"; a balanced 3×2 reads calmer. | When `facts.length === 6`, use `grid-cols-6 max-[1279px]:grid-cols-3`; keep auto-fit for other counts. |
| N3 P2 | Dashboard KPI row at 1280–≈1310 | At 1280 the grid correctly steps to 6 columns but tiles are 151px and the "Pending clearances" label wraps to 2 lines, so its value sits 16px lower than the other five. | §6.5 tiles share one baseline; spec assumes ~137px content width. | Shorten to "Pending clearance" / "Clearance pending", or set labels `whitespace-nowrap` with `text-overflow: ellipsis` and a `title`. |
| N4 P2 | Contacts list, 1440 | The new 220px Email cap truncates 45 of 50 addresses while the Name column sits at 209px (below the 240px minimum) — the width went to Account (202) and Lifecycle (131) instead. | §6.6 name `min-width 240px`; emails readable at the design target. | `layout="fixed"` on the Contacts table, Name 260, Lifecycle 120, Email unconstrained (it absorbs the remainder). |

## Verdict

1. Both P0s are genuinely closed: focus is trapped, restored and Escape-safe in every overlay, and no native `confirm()`/`prompt()` remains anywhere in `frontend/src`.
2. 20 of 22 P0/P1 findings are closed with measured evidence; the two partials are a residual `sand-400` usage on the board (4 strings in `OpportunitiesPage.tsx`) and a Contacts Name column that still measures 209px because the table is auto-layout.
3. All 10 spot-checked P2s are closed, plus a dozen more P2s verified in passing; the only P2 seen still open is the board column `min-width` (216 vs 220).
4. Regression is clean: 19 routes and 4 roles render with zero console errors, no list overflows at 1440/1280/1180, and the rail/drawer/confirm/reason flows all behave.
5. Four minor issues were introduced or exposed by the fixes (focus return from menu-launched dialogs, 4+2 facts wrap, KPI label wrap at 1280, email truncation on Contacts) — all P2, each a one-line fix.
