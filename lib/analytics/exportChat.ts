// Chat-transcript and citation export for the research bots / AI assistant.
// Ported from CPAAnalytics' ResearchBot `handleExport`:
//   - PDF: jsPDF text layout (lazy-imported to stay out of the main bundle)
//   - Word: markdown -> `.docx` via shared `exportMemoToWord`
//   - Excel: Role / Message / Timestamp rows via `exportRows`
//   - Markdown: plain `.md` download (port-only convenience format)
//   - Citations: regex-extracted to a two-column Excel sheet via `exportRows`

import { exportRows } from '@/lib/analytics/exportData'
import { exportMemoToWord } from '@/lib/analytics/memoExport'
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
    await exportMemoToWord(markdown, fileBase, {
      title: prefix.replace(/_/g, ' '),
      generatedAt: new Date(),
    })
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
