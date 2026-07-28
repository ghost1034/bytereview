# 11 — Timeline / Gantt View & Dependencies

**Goal:** The "best-in-class" Gantt that Asana is known for: draggable bars, dependency arrows that auto-shift dependents, zoom levels, baselines, critical path highlight, and a left-rail task list.

---

## Prompt (paste into Google AI Studio Build)

Implement the **Timeline view** and the **Gantt view** for projects, plus task **dependencies**. New code in `src/features/views/timeline/` and `src/features/dependencies/`. Reuse existing models. Do not break previous steps.

### Shared core

Both Timeline and Gantt use the same underlying renderer in `TimelineRenderer.tsx`. Their toolbars and side rails differ.

**Renderer**:
- A left rail of tasks (rows match List view height, 36px) — sticky vertical scroll synced with the chart.
- A horizontal time axis at top.
- Task bars rendered at the row's vertical position spanning `startOn`..`dueOn`.
- Today line: vertical red `primary` line with a small label "Today".
- Weekends shaded.

**Time axis & zoom**
- Zoom levels: **Day / Week / Month / Quarter / Year**.
- The header shows two rows: a coarse band (e.g., "May 2026") and a fine band (e.g., week numbers or day numbers).
- Wheel + ⌘/Ctrl to zoom in/out. Pinch on touchpad.
- Horizontal pan via drag on empty axis area.

**Bar interactions**
- Drag the bar body to shift dates (preserves duration).
- Drag left edge to move `startOn`. Drag right edge to move `dueOn`. Snaps to day at Day/Week zooms; to week at Month zoom; to month at Quarter/Year zoom.
- Hover: tooltip with task name + dates + assignee.
- Click bar → opens detail pane.

**Bar appearance**
- Color: assigned to the same "Color by" logic as Calendar (Section / Assignee / Tag / Priority).
- Tasks with no dates render in the left rail with an "+ Add date" inline button.
- Milestones render as diamonds at their date.
- Completed tasks render with a check + slightly desaturated fill.
- Overdue & incomplete tasks render with a red border.

### Dependencies

- Add `dependencyIds`/`dependentIds` arrays to Task (already in step 02 — keep using them).
- Render arrows between dependent tasks: from the end of the predecessor to the start of the successor. Different stroke for **Finish-to-Start** (default), **Start-to-Start**, **Finish-to-Finish**, **Start-to-Finish**. Default to FS in this step; expose a small dependency-type picker on the arrow itself in a popover.
- Create dependency: hover a bar's right edge → a small "→" knob appears. Drag from it onto another bar to create a dependency.
- Delete dependency: click the arrow → small popover with "Remove dependency".
- **Auto-shift dependents**: when a predecessor moves later, its FS dependents shift forward by the same delta so the gap stays the same. Toggleable via a "Auto-shift dependents" switch in the toolbar (on by default).
- **Cycle prevention**: when attempting to create a cycle, show a tooltip "This would create a circular dependency".
- Add a small `<DependencyManager/>` block to the task detail pane (from step 07) showing predecessors and dependents in two lists with add/remove.

### Critical path highlight

Toolbar toggle "Highlight critical path":
- Compute the longest chain of dependent tasks by `dueOn - startOn`. Render those bars with a 2px primary outline and bolden their arrows. Refresh on any date change.

### Baselines

- Toolbar action "Save baseline" snapshots all current tasks' dates into a `baseline` object stored under the project (extend `Project` non-breakingly with `baseline?: { snappedAt: ISODateTime; tasks: Record<ID, { startOn?: ISODate; dueOn?: ISODate }> }`).
- Toolbar toggle "Show baseline" renders a thin ghost bar above each current bar showing the baseline range.
- "Clear baseline" removes it.

### Group by sections (Gantt only)

In **Gantt view**, the left rail and bar area render section headers as collapsible group rows (similar to List view). In **Timeline view**, ungrouped flat list with optional swimlanes ("Rows by" Assignee / Section / Tag).

### Toolbars

- **Timeline toolbar**: Zoom controls, "Rows by" dropdown, "Color by" dropdown, "Auto-shift dependents" toggle, "Highlight critical path" toggle, Filter & Search.
- **Gantt toolbar**: same plus "Save baseline" / "Show baseline" / "Clear baseline" and a "Today" jump button.

### Left rail (Gantt)

A simplified column set (Name, Assignee, Due date). Columns resizable. The rail can be collapsed to focus on the chart.

### Components (one per file)
- `TimelineView.tsx`
- `GanttView.tsx`
- `TimelineRenderer.tsx`
- `TimeAxis.tsx`
- `TaskBar.tsx`
- `Milestone.tsx`
- `DependencyArrow.tsx`
- `useTimelineDnd.ts`
- `useDependencies.ts`
- `BaselineLayer.tsx`
- `CriticalPathLayer.tsx`

### Performance
- Render only bars in the visible viewport range.
- Use CSS transforms (`translateX`) for panning — do not relay out per scroll.
- Use a Map for adjacency lookup when running critical path.

### Success criteria
- Both Timeline and Gantt tabs work and persist zoom/pan/baseline state.
- Dependencies can be created by dragging from a bar's right knob; auto-shift works.
- Critical path highlights correctly across a representative project.
- Detail pane shows the predecessor/dependent lists; adding/removing there updates the graph.
- `Design.md` row: `11 | src/features/views/timeline, src/features/dependencies | Timeline, Gantt & dependencies | <today>`.

Do not skip dependency cycle prevention. Keep components ≤ 200 lines.
