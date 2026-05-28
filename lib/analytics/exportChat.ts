// Chat-transcript and citation export for the research bots / AI assistant.
// Ported from CPAAnalytics' ResearchBot `handleExport`:
//   - PDF: jsPDF text layout (lazy-imported to stay out of the main bundle)
//   - Word: HTML -> `.doc` blob, rendering markdown via the existing
//     unified/remark/rehype pipeline (CPAAnalytics used `marked`; we reuse the
//     deps already in this app instead of adding another markdown lib)
//   - Excel: Role / Message / Timestamp rows via `exportRows`
//   - Markdown: plain `.md` download (port-only convenience format)
//   - Citations: regex-extracted to a two-column Excel sheet via `exportRows`

import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

import { exportRows } from '@/lib/analytics/exportData'
import type { AnalyticsChatMessage } from '@/lib/analytics/types'

export type ChatTranscriptFormat = 'md' | 'pdf' | 'word' | 'excel'

// Matches CPAAnalytics: e.g. "IRC §162(a)", "ASC 606-10-25-1", "Rev. Rul. 2019-11".
const CITATION_REGEX = /([A-Z][a-zA-Z.]+\s+\S*\d+\S*)/g

interface ExportOptions {
  /** Label used for model turns, e.g. "IRS BOT" / "GAAP BOT" / "ASSISTANT". */
  botLabel?: string
  /** Filename prefix, e.g. "IRS_Research". */
  filenamePrefix?: string
}

function downloadBlob(fileName: string, content: BlobPart, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function transcriptMarkdown(messages: AnalyticsChatMessage[], botLabel: string): string {
  return messages
    .map((m) => `### ${m.role === 'user' ? 'YOU' : botLabel}\n${m.content}`)
    .join('\n\n---\n\n')
}

function markdownToHtml(markdown: string): string {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(markdown)
    .toString()
}

/** Distinct citation strings found across all message contents. */
export function extractCitations(messages: AnalyticsChatMessage[]): string[] {
  const text = messages.map((m) => m.content).join('\n')
  const matches = text.match(CITATION_REGEX) || []
  return [...new Set(matches)]
}

/** Export the conversation's citations as a two-column Excel sheet. */
export async function exportCitations(
  messages: AnalyticsChatMessage[],
  filenamePrefix = 'Research',
): Promise<void> {
  const citations = extractCitations(messages)
  const rows = citations.length
    ? citations.map((c) => ({ Citation: c, Context: 'Extracted from conversation' }))
    : [{ Citation: 'No citations found', Context: '' }]
  await exportRows(rows, 'excel', `${filenamePrefix}_Citations`, 'Citations')
}

/** Export the full chat transcript as Markdown, PDF, or Word. */
export async function exportTranscript(
  messages: AnalyticsChatMessage[],
  format: ChatTranscriptFormat,
  opts: ExportOptions = {},
): Promise<void> {
  const botLabel = opts.botLabel ?? 'ASSISTANT'
  const prefix = opts.filenamePrefix ?? 'Research'
  const dateStr = new Date().toISOString().split('T')[0]
  const fileBase = `${prefix}_${dateStr}`
  const markdown = transcriptMarkdown(messages, botLabel)

  if (format === 'md') {
    downloadBlob(`${fileBase}.md`, markdown, 'text/markdown;charset=utf-8;')
    return
  }

  if (format === 'excel') {
    // AnalyticsChatMessage has no per-message timestamp, so stamp the row at
    // export time — matches what CPAAnalytics produced when timestamps were
    // missing.
    const ts = new Date().toLocaleString()
    const rows = messages.map((m) => ({
      Role: m.role === 'user' ? 'YOU' : botLabel,
      Message: m.content,
      Timestamp: ts,
    }))
    // `exportRows` adds its own `_<date>` suffix — pass `prefix` (without the
    // one we built into `fileBase` above) to avoid double-stamping the file.
    await exportRows(rows, 'excel', prefix, 'Transcript')
    return
  }

  if (format === 'word') {
    const html = markdownToHtml(markdown)
    const header =
      "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
      "xmlns:w='urn:schemas-microsoft-com:office:word' " +
      "xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'>" +
      '<title>Export</title><style>' +
      "body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; color: #333; }" +
      'h1, h2, h3 { color: #2C3E50; margin-top: 12pt; margin-bottom: 6pt; }' +
      'p { margin-bottom: 10pt; }' +
      'table { border-collapse: collapse; width: 100%; margin-bottom: 10pt; }' +
      'th, td { border: 1px solid #ccc; padding: 6pt; text-align: left; }' +
      'code { background: #f4f4f4; padding: 2px 4px; border-radius: 4px; font-family: monospace; }' +
      '</style></head><body>'
    const footer = '</body></html>'
    downloadBlob(`${fileBase}.doc`, '﻿' + header + html + footer, 'application/msword')
    return
  }

  // PDF — lazy-load jsPDF; basic markdown-stripped text layout (matches CPAAnalytics).
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(`${prefix.replace(/_/g, ' ')} Export`, 10, 10)
  doc.setFontSize(10)

  const plainText = markdown.replace(/#/g, '').replace(/\*/g, '')
  const splitText = doc.splitTextToSize(plainText, 190)

  let y = 20
  for (let i = 0; i < splitText.length; i++) {
    if (y > 280) {
      doc.addPage()
      y = 10
    }
    doc.text(splitText[i], 10, y)
    y += 5
  }
  doc.save(`${fileBase}.pdf`)
}
