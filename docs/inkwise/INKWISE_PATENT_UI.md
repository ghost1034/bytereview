# Inkwise Patent UI

This document defines the target Inkwise UI needed to achieve parity with the patent-oriented experience. It complements `docs/INKWISE_PATENT_FEATURES.md`, which defines the product behavior and backend-facing requirements.

## Scope

This UI doc covers the required interface changes called out for Inkwise:

- top menu bar with `Write`, `References`, `Templates`, `Help`
- a writing-first editor workspace with a collapsible sidebar
- document-level prompt engineering via a settings popup
- delayed inline tools entrypoint after text selection
- template navigation with `My Templates` and system categories as first-class tabs

It also defines the layout rules needed to surface the newly implemented patent features:

- multimodal references
- citation bubbles and evidence viewer
- retry/regenerate actions
- version history
- grounded predictive writing

## Product Goals

- Make Inkwise feel like a dedicated writing environment, not a stack of utility cards.
- Give the editor the majority of the screen and treat auxiliary tools as contextual support.
- Keep references, chat, settings, citations, and history accessible without breaking writing flow.
- Preserve a strong desktop experience while remaining usable on smaller screens.

## Non-Goals

- This doc does not define typography, color palette, or final motion language in exhaustive detail.
- This doc does not require full real-time multiplayer collaboration.
- This doc does not redesign unrelated CPAAutomation pages outside Inkwise.

## Current UI Gaps

Compared with the target patent experience, current Inkwise still has these mismatches:

- the module shell is still hero-card oriented instead of app-shell oriented
- the write page is a multi-card layout rather than a full-screen writing workspace
- document settings are in the visible form area rather than behind a settings affordance
- inline writing tools appear as a selection-driven bubble menu rather than a delayed icon trigger
- templates are split into two columns instead of top-level category navigation

## Global Inkwise Shell

## Top Menu Bar

### Requirement

Inkwise should have a persistent top menu bar with these primary destinations:

- `Write`
- `References`
- `Templates`
- `Help`

### Layout behavior

- The top bar should function like application navigation, not a marketing header.
- Inkwise branding may appear at the left, but the main emphasis should be destination switching.
- The active section must be visually obvious.
- On mobile, the same destinations should remain accessible through a compact overflow or sheet navigation.

### Secondary controls

Depending on the page, the top bar can also host:

- current document title context
- save state
- settings icon
- export actions
- version history access

## Shared UI Patterns

## Right-Side Supporting Panels

The patent-style Inkwise experience should use right-side contextual panels for secondary tasks instead of stacking everything inline below the editor.

Recommended panel uses:

- AI Chat
- References bound to the current document
- version history
- citation/evidence viewing when a side sheet is more appropriate than a modal

## Popups And Sheets

Use popups or sheets for:

- document settings
- citation evidence viewing
- version history
- mobile sidebars

The core writing canvas should remain visible as much as possible.

## Feedback States

All key Inkwise surfaces should expose clear state for:

- saving
- ingestion / reference readiness
- grounded vs ungrounded AI output
- retry in progress
- prediction groundedness

## Write Page

## Primary Goal

The `Write` workspace should be a writing-first application shell in which the editor takes up as much screen space as possible while still supporting contextual AI tools and references.

## Target Layout

Desktop target:

- full-width top app bar
- main writing canvas centered and dominant
- collapsible right sidebar
- minimal chrome around the editor

The page should feel closer to a document editor than a dashboard.

### Main regions

#### Top bar

Should include:

- document title
- save state / save action
- settings icon
- export actions
- version history access

#### Editor canvas

- TipTap editor occupies the majority of the viewport height and width
- document text should not be visually boxed into a small card if avoidable
- margins should support comfortable long-form writing
- grounded prediction and accepted text should appear directly in the editor flow

#### Collapsible sidebar

The right sidebar should be collapsible and contain two tabs:

- `AI Chat`
- `References`

When collapsed, the editor expands to reclaim the space.

## Sidebar Details

### AI Chat tab

Should contain:

- thread switching
- message list
- grounded citations inside chat
- retry / fresh evidence actions for the latest assistant response
- composer for new grounded chat prompts

### References tab

Should contain:

- currently bound references
- grounding readiness state
- quick bind/unbind actions
- source type badges
- a fast way to inspect or open references

This tab should focus on the document’s active reference set, not the entire source library.

## Document Settings Popup

### Requirement

Document-level prompt engineering should be configurable through a settings popup opened from a settings icon.

### Settings content

At minimum, the settings popup should include:

- document title
- initial prompt / document guidance
- language
- possibly future generation defaults if Inkwise adds them later

### Interaction

- the settings icon sits in the write page top bar
- clicking it opens a compact dialog or sheet
- changes can be saved without leaving the editor

The key UI change is that guidance belongs in a dedicated configuration surface, not as a permanent inline field consuming editor space.

## Inline Tools Trigger

### Requirement

When the user highlights text, the inline tools menu should not pop up immediately.

Instead:

- a small action icon should appear near the selection
- the user clicks the icon to open the inline tools menu

### Rationale

This reduces visual interruption and keeps selection behavior closer to normal document editing.

### Target interaction sequence

1. user selects text
2. small contextual icon appears near selection
3. user clicks icon
4. inline tools panel opens with actions like Improve, Concise, Longer, Custom
5. results, citations, and retry controls stay associated with that panel

### Panel contents

The inline tools panel should support:

- writing action buttons
- source scope controls
- grounded / ungrounded status
- citation bubbles
- retry and fresh-evidence actions
- insert / replace controls

## Grounded Prediction UI

### Requirement

Grounded prediction should remain lightweight in the editor, but the UI needs to reveal when the suggestion is grounded.

### Target behavior

- ghost text still appears inline and tabbable
- subtle supporting UI near the editor indicates grounded prediction when active
- grounded prediction evidence is inspectable through citation bubbles or a compact evidence row below the editor

### UX constraints

- prediction UI must not dominate the editor
- grounded evidence should be discoverable, not noisy
- dismissing a prediction should also dismiss its visible evidence affordances

## Citation Bubbles And Evidence Viewer

### Chat and writing tools

Citation bubbles should appear directly under grounded output blocks.

The visual treatment should communicate:

- clickable evidence
- compact citation identity
- source linkage without overwhelming the text

### Evidence viewer

The evidence viewer can remain a side sheet or modal, but it should consistently show:

- source title
- locator
- excerpt
- preview or snapshot
- navigation among sibling evidence items

### Prediction citations

Prediction evidence should appear adjacent to the active suggestion context, not permanently embedded in document content before acceptance.

## Retry And Regenerate UI

### Chat

For the latest assistant response in a thread, show:

- `Retry`
- `Fresh evidence`

These controls should be visually secondary to the message text but easy to reach.

### Writing tools

For the active tool output, show:

- `Retry`
- `Fresh evidence`

These controls should sit alongside insert/replace actions.

### Future consistency rule

Any Inkwise AI surface that produces a discrete output should expose retry controls in the same general location as other action affordances.

## Version History UI

### Requirement

The write page should provide access to a revision timeline similar in spirit to Google Docs.

### Entry point

- version history button in the write page top bar

### Target presentation

Recommended structure:

- revision list on the left
- selected revision preview on the right
- restore action for the selected revision

### Revision metadata to show

- revision number
- timestamp
- revision source kind such as Created / Saved / Restored
- document version number

### Preview behavior

- preview should show enough content to understand the revision
- restoring should feel explicit and deliberate
- restoring should not silently discard later history

## References Page

## Goal

The `References` page should act as a multimodal source library for Inkwise.

### Required content

- upload PDF and DOCX
- capture webpage snapshot
- show source type clearly
- show ingestion and readiness state clearly
- preview or open stored sources

### Layout direction

The page can remain a library view, but it should move toward:

- a compact action bar for adding sources
- clearer source cards or rows
- visible source-type badges
- readiness and ingestion metadata that is useful for grounding workflows

### Future-friendly expectations

The UI should be able to accommodate more modalities later without redesigning the whole page.

That suggests source cards/rows should treat modality as data, not as a PDF-only assumption.

## Templates Page

## Requirement

The templates page should have a menu bar with:

- `My Templates`
- all system template categories as first-class options

### Target interaction

- `My Templates` is one tab / menu item
- each system category is another tab / menu item
- selecting a category updates the visible template list below

### Why this changes

The current split-column layout with a dropdown is functional, but it does not match the patented navigation style. Categories need to feel like top-level destinations within the Templates page.

### Target content behavior

#### My Templates

- create template
- import DOCX
- browse/edit personal templates

#### System categories

- browse read-only starter templates by category
- category switching should be fast and prominent

## Help Page

The `Help` page can remain more conventional, but it should align with the new workflow and terminology:

- references can be PDF, DOCX, or webpage snapshots
- grounded prediction exists
- citations are clickable
- version history and retry are available

## Responsive Behavior

## Desktop

- top bar remains horizontal
- write page shows full editor + collapsible sidebar
- settings and history use dialogs/sheets without displacing the main canvas too aggressively

## Tablet

- sidebar may default narrower or partially collapsed
- top-bar actions may condense into icon buttons or compact menus

## Mobile

- navigation can collapse into a sheet or overflow menu
- write page should prioritize editor first
- sidebar functions become a tabbed sheet rather than a permanently visible panel
- evidence viewer and version history should use full-height sheets

## Interaction Rules Summary

- `Write`, `References`, `Templates`, `Help` are always the primary module destinations
- the editor is the dominant surface on the write page
- AI Chat and References live in a collapsible sidebar with tabs
- settings open from an icon-triggered popup
- selection first shows an icon, then opens inline tools on click
- templates categories are shown as first-class menu items, not only in a dropdown

## Recommended Implementation Order

1. replace the Inkwise hero shell with an app-style top navigation shell
2. refactor the write page into editor + collapsible sidebar
3. move document guidance into a settings popup
4. change selection behavior to icon-first inline tools
5. refactor templates into top-level category navigation
6. polish references and help to match the new terminology and flow

## Definition Of Done

Inkwise achieves the patent UI target for this scope when:

- the module shell uses a clear top menu bar with `Write`, `References`, `Templates`, `Help`
- the write page is a writing-first layout with a collapsible `AI Chat` / `References` sidebar
- document prompt engineering is configured from a settings popup
- text selection shows an icon first, then opens inline tools on click
- the templates page exposes `My Templates` and all system categories as first-class menu items
