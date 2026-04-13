import type { Editor, JSONContent } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'

import type { InkwiseCitation, InkwiseCitationStyle, InkwiseGroundedSegment } from '@/lib/api'
import { formatInlineCitationText, formatNoteCitationText, normalizeInkwiseCitationStyle } from '@/lib/inkwise-citation-format'
import { INKWISE_INLINE_CITATION_NODE, INKWISE_NOTE_DEFINITION_NODE, INKWISE_NOTE_REF_NODE, TRACK_CHANGES_SKIP_META } from '@/lib/inkwise-editor-extensions'
import {
  appendCitationAnchorToContent,
  createInkwiseCitationAnchorAttrs,
  extractInsertableContent,
  hasInkwiseCitations,
  injectCitationAnchorsFromMarkedContent,
  type InkwiseCitationAnchorSourceKind,
} from '@/lib/inkwise-citation-anchor'
import { markdownToSafeHtml } from '@/lib/inkwise-markdown'
import { htmlToContentJson } from '@/lib/inkwise-tiptap'

export type InkwiseEditorTarget = {
  from: number
  to: number
  text: string
  hasSelection: boolean
}

export type InkwiseEditorInsertionMode = 'replace' | 'insert' | 'inline' | 'after' | 'append'

export type InkwiseCitationReferenceMode = 'inline' | 'footnote' | 'endnote'

export type InkwiseReferenceNoteMode = Exclude<InkwiseCitationReferenceMode, 'inline'>

export type InkwiseEditorCitationAnchor = {
  sourceKind: InkwiseCitationAnchorSourceKind
  citations: InkwiseCitation[]
  citationStyle?: InkwiseCitationStyle | null
  attemptId?: string | null
  retrievalRunId?: string | null
  contentWithCitations?: string | null
  segments?: InkwiseGroundedSegment[] | null
}

export function getInkwiseEditorTarget(editor: Editor | null): InkwiseEditorTarget | null {
  if (!editor) return null

  const { from, to, empty } = editor.state.selection
  if (!empty) {
    const text = editor.state.doc.textBetween(from, to, '\n')
    if (!text.trim()) return null
    return { from, to, text, hasSelection: true }
  }

  return { from, to, text: '', hasSelection: false }
}

function normalizeCitationText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function buildInlineReferenceText(citations: InkwiseCitation[], citationStyle?: string | null): string {
  return formatInlineCitationText(citations, citationStyle)
}

function buildNoteReferenceText(citations: InkwiseCitation[], citationStyle?: string | null): string {
  return formatNoteCitationText(citations, citationStyle)
}

function createNoteId(): string {
  return globalThis.crypto?.randomUUID?.() || `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getNextCitationReferenceNumber(editor: Editor): number {
  let maxValue = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === INKWISE_NOTE_REF_NODE) {
      const value = Number(node.attrs.noteNumber)
      if (Number.isFinite(value) && value > maxValue) maxValue = value
    }
  })
  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n')
  for (const pattern of [/\[\^(\d+)\]/g, /^\[\^(\d+)\]:/gm, /\[(\d+)\]/g, /^(\d+)\.\s/gm]) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1])
      if (Number.isFinite(value) && value > maxValue) {
        maxValue = value
      }
    }
  }
  return maxValue + 1
}

function resolveTextblockDepth(editor: Editor, pos: number): number | null {
  const resolvedPos = editor.state.doc.resolve(pos)
  for (let depth = resolvedPos.depth; depth >= 0; depth -= 1) {
    if (resolvedPos.node(depth).isTextblock) return depth
  }
  return null
}

function buildParagraphNode(editor: Editor, text: string): ProseMirrorNode {
  return editor.state.schema.nodes.paragraph.create(null, text ? editor.state.schema.text(text) : undefined)
}

function hasTopLevelSection(editor: Editor, title: string): boolean {
  const normalizedTitle = normalizeCitationText(title).toLowerCase()
  for (let index = 0; index < editor.state.doc.childCount; index += 1) {
    const child = editor.state.doc.child(index)
    if (!child.isTextblock) continue
    if (normalizeCitationText(child.textContent).toLowerCase() === normalizedTitle) {
      return true
    }
  }
  return false
}

function dispatchCitationTransaction(editor: Editor, transaction: Transaction): boolean {
  editor.commands.focus()
  editor.view.dispatch(transaction.scrollIntoView())
  return true
}

function buildNoteRefNode(editor: Editor, noteId: string, noteKind: 'footnote' | 'endnote', noteNumber: number): ProseMirrorNode {
  return editor.state.schema.nodes[INKWISE_NOTE_REF_NODE].create({ noteId, noteKind, noteNumber })
}

function buildInlineCitationNode(editor: Editor, citations: InkwiseCitation[], citationStyle?: string | null): ProseMirrorNode | null {
  const label = buildInlineReferenceText(citations, citationStyle).trim()
  if (!label) return null
  return editor.state.schema.nodes[INKWISE_INLINE_CITATION_NODE].create({
    citations,
    citationStyle: normalizeInkwiseCitationStyle(citationStyle),
    label,
  })
}

function buildNoteDefinitionNode(
  editor: Editor,
  noteId: string,
  noteKind: 'footnote' | 'endnote',
  noteNumber: number,
  text: string,
  citations: InkwiseCitation[] = [],
  citationStyle?: string | null,
): ProseMirrorNode {
  return editor.state.schema.nodes[INKWISE_NOTE_DEFINITION_NODE].create(
    {
      noteId,
      noteKind,
      noteNumber,
      citations,
      citationStyle: normalizeInkwiseCitationStyle(citationStyle),
    },
    text ? editor.state.schema.text(text) : undefined,
  )
}

export function convertCitationAnchorReference({
  editor,
  from,
  to,
  citations,
  mode,
  citationStyle,
}: {
  editor: Editor | null
  from: number
  to: number
  citations: InkwiseCitation[]
  mode: InkwiseCitationReferenceMode
  citationStyle?: string | null
}): boolean {
  if (!editor || !citations.length) return false

  if (mode === 'inline') {
    const inlineNode = buildInlineCitationNode(editor, citations, citationStyle)
    if (!inlineNode) return false
    return dispatchCitationTransaction(editor, editor.state.tr.replaceWith(from, to, inlineNode))
  }

  const noteText = buildNoteReferenceText(citations, citationStyle)
  if (!noteText) return false

  const noteId = createNoteId()
  const referenceNumber = getNextCitationReferenceNumber(editor)

  if (mode === 'footnote') {
    const refNode = buildNoteRefNode(editor, noteId, 'footnote', referenceNumber)
    const defNode = buildNoteDefinitionNode(editor, noteId, 'footnote', referenceNumber, noteText, citations, citationStyle)
    const textblockDepth = resolveTextblockDepth(editor, from)
    const insertAfter = textblockDepth == null ? editor.state.doc.content.size : editor.state.doc.resolve(from).after(textblockDepth)
    let transaction = editor.state.tr.replaceWith(from, to, refNode).setMeta(TRACK_CHANGES_SKIP_META, true)
    transaction = transaction.insert(transaction.mapping.map(insertAfter), defNode)
    return dispatchCitationTransaction(editor, transaction)
  }

  const refNode = buildNoteRefNode(editor, noteId, 'endnote', referenceNumber)
  const defNode = buildNoteDefinitionNode(editor, noteId, 'endnote', referenceNumber, noteText, citations, citationStyle)
  const endnoteNodes: ProseMirrorNode[] = []
  if (!hasTopLevelSection(editor, 'Endnotes')) {
    endnoteNodes.push(buildParagraphNode(editor, 'Endnotes'))
  }
  endnoteNodes.push(defNode)
  let transaction = editor.state.tr.replaceWith(from, to, refNode).setMeta(TRACK_CHANGES_SKIP_META, true)
  transaction = transaction.insert(transaction.mapping.map(editor.state.doc.content.size), Fragment.fromArray(endnoteNodes))
  return dispatchCitationTransaction(editor, transaction)
}

export function insertManualReferenceNote({
  editor,
  noteText,
  mode,
  target,
}: {
  editor: Editor | null
  noteText: string
  mode: InkwiseReferenceNoteMode
  target?: InkwiseEditorTarget | null
}): boolean {
  if (!editor) return false
  const normalizedNoteText = normalizeCitationText(noteText)
  if (!normalizedNoteText) return false

  const resolvedTarget = target ?? getInkwiseEditorTarget(editor)
  const markerPosition = resolvedTarget?.to ?? editor.state.selection.to
  const noteId = createNoteId()
  const referenceNumber = getNextCitationReferenceNumber(editor)

  if (mode === 'footnote') {
    const refNode = buildNoteRefNode(editor, noteId, 'footnote', referenceNumber)
    const defNode = buildNoteDefinitionNode(editor, noteId, 'footnote', referenceNumber, normalizedNoteText)
    const textblockDepth = resolveTextblockDepth(editor, markerPosition)
    const insertAfter = textblockDepth == null ? editor.state.doc.content.size : editor.state.doc.resolve(markerPosition).after(textblockDepth)
    let transaction = editor.state.tr.insert(markerPosition, refNode).setMeta(TRACK_CHANGES_SKIP_META, true)
    transaction = transaction.insert(transaction.mapping.map(insertAfter), defNode)
    return dispatchCitationTransaction(editor, transaction)
  }

  const refNode = buildNoteRefNode(editor, noteId, 'endnote', referenceNumber)
  const defNode = buildNoteDefinitionNode(editor, noteId, 'endnote', referenceNumber, normalizedNoteText)
  const endnoteNodes: ProseMirrorNode[] = []
  if (!hasTopLevelSection(editor, 'Endnotes')) {
    endnoteNodes.push(buildParagraphNode(editor, 'Endnotes'))
  }
  endnoteNodes.push(defNode)
  let transaction = editor.state.tr.insert(markerPosition, refNode).setMeta(TRACK_CHANGES_SKIP_META, true)
  transaction = transaction.insert(transaction.mapping.map(editor.state.doc.content.size), Fragment.fromArray(endnoteNodes))
  return dispatchCitationTransaction(editor, transaction)
}

export function stripInkwiseChatCitationMarkers(markdown: string): string {
  return (markdown || '')
    .replace(/\s*\[E\d{2}\]/g, '')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function buildInkwiseDocumentContentFromMarkdown({
  markdown,
  citationAnchor,
}: {
  markdown: string
  citationAnchor?: InkwiseEditorCitationAnchor | null
}): Promise<JSONContent | null> {
  const value = (markdown || '').trim()
  if (!value) return null

  const html = await markdownToSafeHtml(value)
  if (!html) return null

  let baseContent = htmlToContentJson(html)
  if (!citationAnchor || !hasInkwiseCitations(citationAnchor.citations)) {
    return baseContent
  }

  const markedValue = (citationAnchor.contentWithCitations || '').trim()
  if (markedValue) {
    const markedHtml = await markdownToSafeHtml(markedValue)
    if (markedHtml) {
      const markedContent = htmlToContentJson(markedHtml)
      const injected = injectCitationAnchorsFromMarkedContent({
        content: markedContent,
        citations: citationAnchor.citations,
        sourceKind: citationAnchor.sourceKind,
        citationStyle: citationAnchor.citationStyle,
        attemptId: citationAnchor.attemptId,
        retrievalRunId: citationAnchor.retrievalRunId,
      })
      if (injected.inserted) {
        return injected.content
      }
    }
  }

  return appendCitationAnchorToContent(
    baseContent,
    createInkwiseCitationAnchorAttrs({
      citations: citationAnchor.citations,
      sourceKind: citationAnchor.sourceKind,
      citationStyle: citationAnchor.citationStyle,
      attemptId: citationAnchor.attemptId,
      retrievalRunId: citationAnchor.retrievalRunId,
    }),
  )
}

export async function replaceEditorDocumentWithMarkdown({
  editor,
  markdown,
  citationAnchor,
}: {
  editor: Editor | null
  markdown: string
  citationAnchor?: InkwiseEditorCitationAnchor | null
}): Promise<boolean> {
  if (!editor) return false

  const content = await buildInkwiseDocumentContentFromMarkdown({ markdown, citationAnchor })
  if (!content) return false

  editor.commands.setContent(content, false)
  return true
}

export async function insertMarkdownIntoEditor({
  editor,
  markdown,
  mode,
  target,
  citationAnchor,
}: {
  editor: Editor | null
  markdown: string
  mode: InkwiseEditorInsertionMode
  target?: InkwiseEditorTarget | null
  citationAnchor?: InkwiseEditorCitationAnchor | null
}): Promise<InkwiseEditorInsertionMode | null> {
  if (!editor) return null

  const content = await buildInkwiseDocumentContentFromMarkdown({ markdown, citationAnchor })
  if (!content) return null

  const resolvedTarget = target ?? getInkwiseEditorTarget(editor)
  const insertableContent = extractInsertableContent(content)
  if (mode === 'append') {
    editor.chain().focus().insertContentAt(editor.state.doc.content.size, insertableContent).run()
    return 'append'
  }

  if (mode === 'replace' && resolvedTarget?.hasSelection) {
    editor.chain().focus().insertContentAt({ from: resolvedTarget.from, to: resolvedTarget.to }, insertableContent).run()
    return 'replace'
  }

  if (mode === 'after' && resolvedTarget) {
    editor.chain().focus().insertContentAt(resolvedTarget.to, [{ type: 'paragraph' }, ...(Array.isArray(insertableContent) ? insertableContent : [insertableContent])]).run()
    return 'after'
  }

  if (mode === 'inline' && resolvedTarget) {
    const inlineContent = Array.isArray(insertableContent)
      ? insertableContent.flatMap((node) => (node.type === 'paragraph' && Array.isArray(node.content) ? node.content : [node]))
      : insertableContent.type === 'paragraph' && Array.isArray(insertableContent.content)
        ? insertableContent.content
        : [insertableContent]
    editor.chain().focus().insertContentAt(resolvedTarget.to, inlineContent).run()
    return 'inline'
  }

  if (resolvedTarget) {
    editor.chain().focus().insertContentAt(resolvedTarget.to, insertableContent).run()
    return 'insert'
  }

  editor.chain().focus().insertContentAt(editor.state.doc.content.size, insertableContent).run()
  return 'append'
}
