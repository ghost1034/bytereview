# 15 — Global Search & Advanced Saved Views

**Goal:** Asana-style **global Advanced Search** with saved searches, plus elevated saved views (project-wide and personal).

---

## Prompt (paste into Google AI Studio Build)

Add a real Advanced Search experience and elevate saved views. New code in `src/features/search/`. Do not break previous steps.

### Three search surfaces (do all three)

1. **Quick find (project-scoped)** — already added in step 13 (`/` shortcut). Just confirm it still works after refactors.
2. **Command palette (⌘K)** — from step 04. Make sure it indexes tasks now that real tasks exist. Limit to top 20 fuzzy matches per category.
3. **Advanced Search page** — new dedicated page at `/w/:workspaceId/search` with a powerful query builder.

### Advanced Search page

Header:
- Title "Search"
- A `<QueryToolbar/>` from step 13 with a giant search input at top.
- Toggle: **Search across** → All tasks (default) / This workspace / A specific portfolio / A specific project / A specific team.

Filter builder reused from step 13, with one extra clause specifically for global search: **In status update / message** (boolean) and **Includes archived** (boolean).

Result list (default to a List-view-style table with these columns: Task, Project(s), Assignee, Due date, Tag(s), Modified). The toggle in the toolbar can switch to a Board grouping by project, or a chart preview that you'd later "Save as a chart" → step 26.

### Saved searches

- The Save button on the toolbar saves the query as either:
  - **Personal saved search** — shows under "Saved searches" in the sidebar under the user's Pinned area (collapsible group).
  - **Workspace saved search** — shows under "Pinned searches" inside the Search page itself.
- Saved searches store `ViewQuery + scope + viewType`. Reuse `useSavedViewsStore` and add an optional `scope?: { type: 'workspace'|'team'|'portfolio'|'project'; id?: ID }` field non-breakingly.

### Sidebar pinned searches

- Add a small collapsible group under "Pinned shortcuts" called **My searches** showing personal saved searches. Each item has a count badge (live: result count of the saved query).

### Search highlighting

- In all result rows, **bold** the matching substrings within task name and (when matched) within description. For description, render a one-line snippet around the match.

### Tasks vs Projects vs Goals vs People (tabs)

The Advanced Search page has 4 tabs:
- **Tasks** (default, described above)
- **Projects** — table with Name, Team, Status, Owner, Due, Members.
- **Goals** — basic table (will be populated once Goals exists in step 23 — render zero-state if no goals yet).
- **People** — searchable workspace users with quick "Open profile" / "Assign to me" / "Compose comment" actions.

### Empty + zero states

- Empty results: a friendly message + the user's last 5 recent searches as suggestions.
- Recent searches stored client-side in `useUiStore.recentSearches: string[]` (capped at 10).

### Performance

- Implement a small in-memory search index: precompute `name.toLowerCase()`, tokenized name words, and assignee/tag/project ids for each task. Update the index reactively to store mutations.
- Use this index for both ⌘K and the Search page.

### Components (one per file)
- `SearchPage.tsx`
- `SearchTabs.tsx`
- `SearchResultsList.tsx`
- `SearchResultsBoard.tsx`
- `SavedSearchesSidebarGroup.tsx`
- `useSearchIndex.ts`
- `highlight.ts`

### Success criteria
- The Search page at `/w/:workspaceId/search` works end-to-end with deep, composable filters.
- ⌘K now resolves real tasks and is fast.
- Saving a search adds it to the sidebar.
- `Design.md` row: `15 | src/features/search | Global search & saved searches | <today>`.

Do not introduce a search backend — keep it client-side.
