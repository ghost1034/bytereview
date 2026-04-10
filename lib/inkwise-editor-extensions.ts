'use client'

import type { Editor } from '@tiptap/core'
import { Extension, Mark as TiptapMark, Node as TiptapNode, mergeAttributes } from '@tiptap/core'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import { Fragment, Slice, type Mark as ProseMirrorMark, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export const INKWISE_PAGE_BREAK_NODE = 'inkwisePageBreak'
export const INKWISE_COMMENT_MARK = 'inkwiseComment'
export const INKWISE_INSERTION_MARK = 'inkwiseInsertion'
export const INKWISE_DELETION_MARK = 'inkwiseDeletion'
export const INKWISE_NOTE_REF_NODE = 'inkwiseNoteRef'
export const INKWISE_NOTE_DEFINITION_NODE = 'inkwiseNoteDefinition'

const trackChangesPluginKey = new PluginKey('inkwiseTrackChanges')
export const TRACK_CHANGES_SKIP_META = 'inkwise-track-changes-skip'
const TRACK_CHANGES_PROCESSED_META = 'inkwise-track-changes-processed'

export type InkwiseEditorCommentThread = {
  id: string
  body: string
  quote: string
  from: number
  to: number
  resolved: boolean
  createdAt: string | null
}

export type InkwiseTrackedChange = {
  id: string
  kind: 'insertion' | 'deletion'
  text: string
  from: number
  to: number
  createdAt: string | null
}

function createInkwiseEntityId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function parseStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseBooleanValue(value: unknown): boolean {
  return value === true || value === 'true'
}

function clampSelectionPos(doc: ProseMirrorNode, position: number): number {
  return Math.max(1, Math.min(position, Math.max(1, doc.content.size)))
}

function mapFragmentWithMark(fragment: Fragment, mark: ProseMirrorMark): Fragment {
  const nodes: ProseMirrorNode[] = []
  fragment.forEach((node) => {
    if (node.isText) {
      nodes.push(node.mark(mark.addToSet(node.marks)))
      return
    }
    if (node.isLeaf) {
      nodes.push(node)
      return
    }
    nodes.push(node.copy(mapFragmentWithMark(node.content, mark)))
  })
  return Fragment.fromArray(nodes)
}

function mapSliceWithMark(slice: Slice, mark: ProseMirrorMark): Slice {
  return new Slice(mapFragmentWithMark(slice.content, mark), slice.openStart, slice.openEnd)
}

function resolveAdjacentDeletionRange(editor: EditorView, direction: -1 | 1): { from: number; to: number } | null {
  const { state } = editor
  const { from } = state.selection
  let cursor = from
  while (cursor > 0 && cursor < state.doc.content.size + 1) {
    const next = cursor + direction
    if (next < 0 || next > state.doc.content.size) break
    const rangeFrom = Math.min(cursor, next)
    const rangeTo = Math.max(cursor, next)
    const value = state.doc.textBetween(rangeFrom, rangeTo, '', '')
    if (value) return { from: rangeFrom, to: rangeTo }
    cursor = next
  }
  return null
}

function collectMarkRanges(
  editor: Editor | null,
  markName: string,
  idAttr: 'threadId' | 'changeId',
): Array<{ id: string; text: string; from: number; to: number; attrs: Record<string, any> }> {
  if (!editor) return []
  const markType = editor.state.schema.marks[markName]
  if (!markType) return []

  const collected = new Map<string, { id: string; text: string; from: number; to: number; attrs: Record<string, any> }>()
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const mark = node.marks.find((item) => item.type === markType && parseStringValue(item.attrs?.[idAttr]))
    if (!mark) return

    const id = String(mark.attrs[idAttr])
    const existing = collected.get(id)
    if (!existing) {
      collected.set(id, {
        id,
        text: node.text,
        from: pos,
        to: pos + node.nodeSize,
        attrs: { ...mark.attrs },
      })
      return
    }

    existing.text += node.text
    existing.from = Math.min(existing.from, pos)
    existing.to = Math.max(existing.to, pos + node.nodeSize)
  })

  return [...collected.values()].sort((left, right) => left.from - right.from)
}

function markRangesForId(
  editor: Editor,
  markName: string,
  idAttr: 'threadId' | 'changeId',
  id: string,
): Array<{ from: number; to: number; attrs: Record<string, any> }> {
  const markType = editor.state.schema.marks[markName]
  if (!markType) return []
  const ranges: Array<{ from: number; to: number; attrs: Record<string, any> }> = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const mark = node.marks.find((item) => item.type === markType && item.attrs?.[idAttr] === id)
    if (!mark) return
    ranges.push({ from: pos, to: pos + node.nodeSize, attrs: { ...mark.attrs } })
  })
  return ranges
}

export const InkwisePageBreakNode = TiptapNode.create({
  name: INKWISE_PAGE_BREAK_NODE,
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-inkwise-page-break="true"]' }]
  },

  renderHTML() {
    return [
      'div',
      {
        'data-inkwise-page-break': 'true',
        'data-editor-only': 'false',
        class: 'my-6 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500',
      },
      ['span', { class: 'h-px flex-1 bg-slate-300' }],
      ['span', { contenteditable: 'false' }, 'Page break'],
      ['span', { class: 'h-px flex-1 bg-slate-300' }],
    ]
  },
})

export const InkwiseCommentMark = TiptapMark.create({
  name: INKWISE_COMMENT_MARK,
  inclusive: false,
  excludes: '',

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-inkwise-comment-id')),
      },
      body: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-inkwise-comment-body') || '',
      },
      resolved: {
        default: false,
        parseHTML: (element: HTMLElement) => parseBooleanValue(element.getAttribute('data-inkwise-comment-resolved')),
      },
      createdAt: {
        default: null,
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-inkwise-comment-created-at')),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-inkwise-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const resolved = parseBooleanValue(HTMLAttributes.resolved)
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-inkwise-comment-id': parseStringValue(HTMLAttributes.threadId) || '',
        'data-inkwise-comment-body': String(HTMLAttributes.body || ''),
        'data-inkwise-comment-resolved': resolved ? 'true' : 'false',
        'data-inkwise-comment-created-at': parseStringValue(HTMLAttributes.createdAt) || '',
        class: resolved
          ? 'rounded bg-amber-100/50 px-0.5 decoration-dotted underline underline-offset-4'
          : 'rounded bg-amber-100 px-0.5 decoration-dotted underline underline-offset-4',
      }),
      0,
    ]
  },
})

function buildTrackedChangeMark(name: typeof INKWISE_INSERTION_MARK | typeof INKWISE_DELETION_MARK) {
  const isDeletion = name === INKWISE_DELETION_MARK
  return TiptapMark.create({
    name,
    inclusive: false,
    excludes: '',

    addAttributes() {
      return {
        changeId: {
          default: null,
          parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-inkwise-change-id')),
        },
        createdAt: {
          default: null,
          parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-inkwise-change-created-at')),
        },
        kind: {
          default: isDeletion ? 'deletion' : 'insertion',
          parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-inkwise-change-kind')) || (isDeletion ? 'deletion' : 'insertion'),
        },
      }
    },

    parseHTML() {
      return [{ tag: `span[data-inkwise-change-kind="${isDeletion ? 'deletion' : 'insertion'}"]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          'data-inkwise-change-id': parseStringValue(HTMLAttributes.changeId) || '',
          'data-inkwise-change-created-at': parseStringValue(HTMLAttributes.createdAt) || '',
          'data-inkwise-change-kind': isDeletion ? 'deletion' : 'insertion',
          class: isDeletion
            ? 'rounded bg-rose-100/80 px-0.5 text-rose-700 line-through'
            : 'rounded bg-emerald-100/80 px-0.5 text-emerald-800',
        }),
        0,
      ]
    },
  })
}

export const InkwiseInsertionMark = buildTrackedChangeMark(INKWISE_INSERTION_MARK)
export const InkwiseDeletionMark = buildTrackedChangeMark(INKWISE_DELETION_MARK)

function applyMarkedDeletion(view: EditorView, from: number, to: number, changeId?: string, createdAt?: string): boolean {
  if (from >= to) return false
  const deletionMark = view.state.schema.marks[INKWISE_DELETION_MARK]
  if (!deletionMark) return false
  const slice = view.state.doc.slice(from, to)
  if (!slice.content.size) return false

  const mark = deletionMark.create({
    changeId: changeId || createInkwiseEntityId('change'),
    createdAt: createdAt || new Date().toISOString(),
    kind: 'deletion',
  })
  const deletionSlice = mapSliceWithMark(slice, mark)
  let tr = view.state.tr.replaceRange(from, to, deletionSlice).setMeta(TRACK_CHANGES_SKIP_META, true)
  tr = tr.setSelection(TextSelection.create(tr.doc, clampSelectionPos(tr.doc, from)))

  view.dispatch(tr.scrollIntoView())
  return true
}

export function createTrackChangesExtension(getEnabled: () => boolean) {
  const SESSION_TIMEOUT_MS = 2000
  let session: {
    changeId: string
    createdAt: string
    kind: 'insertion' | 'deletion'
    lastPos: number
    lastTime: number
  } | null = null

  function getOrCreateSession(kind: 'insertion' | 'deletion', pos: number): { changeId: string; createdAt: string } {
    const now = Date.now()
    if (session && session.kind === kind && now - session.lastTime < SESSION_TIMEOUT_MS && Math.abs(pos - session.lastPos) <= 1) {
      session.lastTime = now
      session.lastPos = pos
      return { changeId: session.changeId, createdAt: session.createdAt }
    }
    const changeId = createInkwiseEntityId('change')
    const createdAt = new Date().toISOString()
    session = { changeId, createdAt, kind, lastPos: pos, lastTime: now }
    return { changeId, createdAt }
  }

  return Extension.create({
    name: 'inkwiseTrackChanges',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: trackChangesPluginKey,
          props: {
            handleTextInput(view, from, to, text) {
              if (!getEnabled()) return false
              const insertionMark = view.state.schema.marks[INKWISE_INSERTION_MARK]
              const deletionMark = view.state.schema.marks[INKWISE_DELETION_MARK]
              if (!insertionMark || !deletionMark) return false

              const tr = view.state.tr.setMeta(TRACK_CHANGES_SKIP_META, true)
              let insertAt = from

              if (from !== to) {
                session = null
                const deletionSlice = mapSliceWithMark(
                  view.state.doc.slice(from, to),
                  deletionMark.create({
                    changeId: createInkwiseEntityId('change'),
                    createdAt: new Date().toISOString(),
                    kind: 'deletion',
                  }),
                )
                tr.replaceRange(from, to, deletionSlice)
                insertAt = tr.mapping.map(to, 1)
              }

              const insertionSession = getOrCreateSession('insertion', insertAt)
              tr.insertText(text, insertAt)
              tr.addMark(
                insertAt,
                insertAt + text.length,
                insertionMark.create({
                  changeId: insertionSession.changeId,
                  createdAt: insertionSession.createdAt,
                  kind: 'insertion',
                }),
              )
              if (session) session.lastPos = insertAt + text.length
              tr.setSelection(TextSelection.create(tr.doc, clampSelectionPos(tr.doc, insertAt + text.length)))
              view.dispatch(tr.scrollIntoView())
              return true
            },

            handlePaste(view, _event, slice) {
              session = null
              if (!getEnabled()) return false
              const insertionMark = view.state.schema.marks[INKWISE_INSERTION_MARK]
              const deletionMark = view.state.schema.marks[INKWISE_DELETION_MARK]
              if (!insertionMark || !deletionMark) return false

              const { from, to } = view.state.selection
              const tr = view.state.tr.setMeta(TRACK_CHANGES_SKIP_META, true)
              let insertAt = from
              if (from !== to) {
                const deletionSlice = mapSliceWithMark(
                  view.state.doc.slice(from, to),
                  deletionMark.create({
                    changeId: createInkwiseEntityId('change'),
                    createdAt: new Date().toISOString(),
                    kind: 'deletion',
                  }),
                )
                tr.replaceRange(from, to, deletionSlice)
                insertAt = tr.mapping.map(to, 1)
              }

              const insertionSlice = mapSliceWithMark(
                slice,
                insertionMark.create({
                  changeId: createInkwiseEntityId('change'),
                  createdAt: new Date().toISOString(),
                  kind: 'insertion',
                }),
              )
              tr.replaceRange(insertAt, insertAt, insertionSlice)
              tr.setSelection(TextSelection.create(tr.doc, clampSelectionPos(tr.doc, insertAt + insertionSlice.content.size)))
              view.dispatch(tr.scrollIntoView())
              return true
            },

            handleKeyDown(view, event) {
              if (!getEnabled() || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return false
              if (event.key !== 'Backspace' && event.key !== 'Delete') return false

              const selection = view.state.selection
              if (!selection.empty) {
                session = null
                event.preventDefault()
                return applyMarkedDeletion(view, selection.from, selection.to)
              }

              const adjacent = resolveAdjacentDeletionRange(view, event.key === 'Backspace' ? -1 : 1)
              if (!adjacent) return false
              event.preventDefault()
              const deletionSession = getOrCreateSession('deletion', adjacent.from)
              const result = applyMarkedDeletion(view, adjacent.from, adjacent.to, deletionSession.changeId, deletionSession.createdAt)
              if (result && session) session.lastPos = adjacent.from
              return result
            },
          },

          appendTransaction(transactions, _oldState, newState) {
            if (!getEnabled()) return null
            if (!transactions.some((transaction) => transaction.docChanged)) return null
            if (transactions.some((transaction) => transaction.getMeta(TRACK_CHANGES_SKIP_META) || transaction.getMeta(TRACK_CHANGES_PROCESSED_META))) {
              if (transactions.some((transaction) => transaction.getMeta(TRACK_CHANGES_SKIP_META) && transaction.docChanged)) {
                session = null
              }
              return null
            }

            const insertionMark = newState.schema.marks[INKWISE_INSERTION_MARK]
            if (!insertionMark) return null

            let tr = newState.tr
            let changed = false
            for (const transaction of transactions) {
              for (const map of transaction.mapping.maps) {
                map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                  if (newEnd <= newStart) return
                  tr = tr.addMark(
                    newStart,
                    newEnd,
                    insertionMark.create({
                      changeId: createInkwiseEntityId('change'),
                      createdAt: new Date().toISOString(),
                      kind: 'insertion',
                    }),
                  )
                  changed = true
                })
              }
            }

            if (!changed) return null
            return tr.setMeta(TRACK_CHANGES_PROCESSED_META, true)
          },
        }),
      ]
    },
  })
}

export const InkwiseNoteRefNode = TiptapNode.create({
  name: INKWISE_NOTE_REF_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-note-id')),
      },
      noteKind: {
        default: 'footnote',
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-note-kind')) || 'footnote',
      },
      noteNumber: {
        default: 1,
        parseHTML: (element: HTMLElement) => {
          const value = Number(element.getAttribute('data-note-number'))
          return Number.isFinite(value) ? value : 1
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-inkwise-note-ref="true"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const noteNumber = Number(HTMLAttributes.noteNumber) || 1
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-inkwise-note-ref': 'true',
        'data-note-id': parseStringValue(HTMLAttributes.noteId) || '',
        'data-note-kind': parseStringValue(HTMLAttributes.noteKind) || 'footnote',
        'data-note-number': String(noteNumber),
        class: 'cursor-pointer text-[0.7em] font-semibold text-blue-600 align-super',
        contenteditable: 'false',
      }),
      String(noteNumber),
    ]
  },
})

export const InkwiseNoteDefinitionNode = TiptapNode.create({
  name: INKWISE_NOTE_DEFINITION_NODE,
  group: 'block',
  content: 'inline*',
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-note-id')),
      },
      noteKind: {
        default: 'footnote',
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-note-kind')) || 'footnote',
      },
      noteNumber: {
        default: 1,
        parseHTML: (element: HTMLElement) => {
          const value = Number(element.getAttribute('data-note-number'))
          return Number.isFinite(value) ? value : 1
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-inkwise-note-definition="true"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const noteNumber = Number(HTMLAttributes.noteNumber) || 1
    const noteKind = parseStringValue(HTMLAttributes.noteKind) || 'footnote'
    const isFootnote = noteKind === 'footnote'
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-inkwise-note-definition': 'true',
        'data-note-id': parseStringValue(HTMLAttributes.noteId) || '',
        'data-note-kind': noteKind,
        'data-note-number': String(noteNumber),
        class: isFootnote
          ? 'my-1 flex gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600'
          : 'my-1 flex gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-slate-600',
      }),
      ['span', { contenteditable: 'false', class: 'font-semibold text-slate-400 shrink-0 select-none' }, `${noteNumber}.`],
      ['span', { class: 'flex-1' }, 0],
    ]
  },
})

export const INKWISE_EDITOR_EXTENSIONS = [
  Table.configure({
    resizable: false,
    HTMLAttributes: {
      class: 'w-full table-fixed border-collapse overflow-hidden rounded-xl',
    },
  }),
  TableRow,
  TableHeader.configure({ HTMLAttributes: { class: 'border border-slate-300 bg-slate-100 px-3 py-2 text-left font-semibold' } }),
  TableCell.configure({ HTMLAttributes: { class: 'border border-slate-300 px-3 py-2 align-top' } }),
  InkwisePageBreakNode,
  InkwiseNoteDefinitionNode,
  InkwiseCommentMark,
  InkwiseInsertionMark,
  InkwiseDeletionMark,
]

export function addInkwiseComment(editor: Editor | null, body: string): boolean {
  const value = body.trim()
  if (!editor || !value) return false
  const { from, to, empty } = editor.state.selection
  if (empty || from >= to) return false
  const markType = editor.state.schema.marks[INKWISE_COMMENT_MARK]
  if (!markType) return false

  const tr = editor.state.tr
    .addMark(
      from,
      to,
      markType.create({
        threadId: createInkwiseEntityId('comment'),
        body: value,
        resolved: false,
        createdAt: new Date().toISOString(),
      }),
    )
    .setMeta(TRACK_CHANGES_SKIP_META, true)
  editor.view.dispatch(tr.scrollIntoView())
  editor.commands.focus()
  return true
}

export function getInkwiseComments(editor: Editor | null): InkwiseEditorCommentThread[] {
  return collectMarkRanges(editor, INKWISE_COMMENT_MARK, 'threadId').map((item) => ({
    id: item.id,
    body: String(item.attrs.body || ''),
    quote: item.text.trim(),
    from: item.from,
    to: item.to,
    resolved: Boolean(item.attrs.resolved),
    createdAt: parseStringValue(item.attrs.createdAt),
  }))
}

export function updateInkwiseComment(editor: Editor | null, id: string, updates: { body?: string; resolved?: boolean }): boolean {
  if (!editor) return false
  const markType = editor.state.schema.marks[INKWISE_COMMENT_MARK]
  if (!markType) return false
  const ranges = markRangesForId(editor, INKWISE_COMMENT_MARK, 'threadId', id)
  if (!ranges.length) return false

  let tr = editor.state.tr.setMeta(TRACK_CHANGES_SKIP_META, true)
  for (const range of ranges) {
    tr = tr.removeMark(range.from, range.to, markType)
    tr = tr.addMark(
      range.from,
      range.to,
      markType.create({
        ...range.attrs,
        body: updates.body ?? range.attrs.body ?? '',
        resolved: updates.resolved ?? Boolean(range.attrs.resolved),
      }),
    )
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

export function removeInkwiseComment(editor: Editor | null, id: string): boolean {
  if (!editor) return false
  const markType = editor.state.schema.marks[INKWISE_COMMENT_MARK]
  if (!markType) return false
  const ranges = markRangesForId(editor, INKWISE_COMMENT_MARK, 'threadId', id)
  if (!ranges.length) return false

  let tr = editor.state.tr.setMeta(TRACK_CHANGES_SKIP_META, true)
  for (const range of ranges) {
    tr = tr.removeMark(range.from, range.to, markType)
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

export function getInkwiseTrackedChanges(editor: Editor | null): InkwiseTrackedChange[] {
  const insertions = collectMarkRanges(editor, INKWISE_INSERTION_MARK, 'changeId').map((item) => ({
    id: item.id,
    kind: 'insertion' as const,
    text: item.text,
    from: item.from,
    to: item.to,
    createdAt: parseStringValue(item.attrs.createdAt),
  }))
  const deletions = collectMarkRanges(editor, INKWISE_DELETION_MARK, 'changeId').map((item) => ({
    id: item.id,
    kind: 'deletion' as const,
    text: item.text,
    from: item.from,
    to: item.to,
    createdAt: parseStringValue(item.attrs.createdAt),
  }))
  return [...insertions, ...deletions].sort((left, right) => left.from - right.from)
}

export function acceptInkwiseTrackedChange(editor: Editor | null, changeId: string): boolean {
  if (!editor) return false
  const insertionMark = editor.state.schema.marks[INKWISE_INSERTION_MARK]
  const deletionMark = editor.state.schema.marks[INKWISE_DELETION_MARK]
  const insertionRanges = markRangesForId(editor, INKWISE_INSERTION_MARK, 'changeId', changeId)
  const deletionRanges = markRangesForId(editor, INKWISE_DELETION_MARK, 'changeId', changeId)
  if (!insertionRanges.length && !deletionRanges.length) return false

  let tr = editor.state.tr.setMeta(TRACK_CHANGES_SKIP_META, true)
  if (insertionMark) {
    for (const range of insertionRanges) {
      tr = tr.removeMark(range.from, range.to, insertionMark)
    }
  }
  for (const range of [...deletionRanges].sort((left, right) => right.from - left.from)) {
    tr = tr.delete(range.from, range.to)
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

export function rejectInkwiseTrackedChange(editor: Editor | null, changeId: string): boolean {
  if (!editor) return false
  const insertionMark = editor.state.schema.marks[INKWISE_INSERTION_MARK]
  const deletionMark = editor.state.schema.marks[INKWISE_DELETION_MARK]
  const insertionRanges = markRangesForId(editor, INKWISE_INSERTION_MARK, 'changeId', changeId)
  const deletionRanges = markRangesForId(editor, INKWISE_DELETION_MARK, 'changeId', changeId)
  if (!insertionRanges.length && !deletionRanges.length) return false

  let tr = editor.state.tr.setMeta(TRACK_CHANGES_SKIP_META, true)
  for (const range of [...insertionRanges].sort((left, right) => right.from - left.from)) {
    tr = tr.delete(range.from, range.to)
  }
  if (deletionMark) {
    for (const range of deletionRanges) {
      tr = tr.removeMark(range.from, range.to, deletionMark)
    }
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

export function acceptAllInkwiseTrackedChanges(editor: Editor | null): boolean {
  const changes = getInkwiseTrackedChanges(editor)
  if (!editor || !changes.length) return false
  for (const change of changes) {
    acceptInkwiseTrackedChange(editor, change.id)
  }
  return true
}

export function rejectAllInkwiseTrackedChanges(editor: Editor | null): boolean {
  const changes = getInkwiseTrackedChanges(editor)
  if (!editor || !changes.length) return false
  for (const change of changes) {
    rejectInkwiseTrackedChange(editor, change.id)
  }
  return true
}
