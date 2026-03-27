import type { Editor, JSONContent } from '@tiptap/core'

import type { InkwiseCitation } from '@/lib/api'
import {
  appendCitationAnchorToContent,
  createInkwiseCitationAnchorAttrs,
  extractInsertableContent,
  hasInkwiseCitations,
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

export type InkwiseEditorInsertionMode = 'replace' | 'insert' | 'after' | 'append'

export type InkwiseEditorCitationAnchor = {
  sourceKind: InkwiseCitationAnchorSourceKind
  citations: InkwiseCitation[]
  attemptId?: string | null
  retrievalRunId?: string | null
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

  const baseContent = htmlToContentJson(html)
  if (!citationAnchor || !hasInkwiseCitations(citationAnchor.citations)) {
    return baseContent
  }

  return appendCitationAnchorToContent(
    baseContent,
    createInkwiseCitationAnchorAttrs({
      citations: citationAnchor.citations,
      sourceKind: citationAnchor.sourceKind,
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

  if (resolvedTarget) {
    editor.chain().focus().insertContentAt(resolvedTarget.to, insertableContent).run()
    return 'insert'
  }

  editor.chain().focus().insertContentAt(editor.state.doc.content.size, insertableContent).run()
  return 'append'
}
