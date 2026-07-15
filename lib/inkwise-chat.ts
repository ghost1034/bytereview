import type { InkwiseChatMessage, InkwiseCitation } from '@/lib/api'

export type StreamState = {
  text: string
  contentWithCitations?: string | null
  retrievalRunId?: string
  citations?: InkwiseCitation[]
  attemptId?: string
}

export type ChatInsertMode = 'insert' | 'replace' | 'append'

export const assistantMarkdownClassName =
  'prose prose-sm max-w-none break-words text-slate-700 prose-headings:text-slate-900 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-blockquote:border-slate-300 prose-blockquote:text-slate-600 prose-pre:bg-slate-950 prose-pre:text-slate-50 prose-pre:overflow-x-auto prose-inline-code:text-slate-800 prose-a:text-sky-700'

export function messageCitations(message: InkwiseChatMessage): InkwiseCitation[] {
  const raw = message.citations_json?.citations
  return Array.isArray(raw) ? raw : []
}

export function messageDisplayMarkdown(message: InkwiseChatMessage): string {
  return message.content_with_citations || message.citations_json?.content_with_citations || message.content || ''
}
