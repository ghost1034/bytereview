/**
 * Shared memo export utility — converts a markdown memo into a downloadable
 * PDF or Word (.docx) file. Designed for reuse across analytics modules
 * (variance, waterfall, reconciliation, amortization).
 *
 * The markdown parser supports a small but sufficient grammar:
 *   # / ## / ### headings, paragraphs, * / - bullets, **bold** inline,
 *   GFM-style pipe tables (one header row, dashes separator, body rows).
 */

import { saveAs } from 'file-saver'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

export interface MemoExportOptions {
  title?: string
  clientName?: string
  generatedAt?: Date
}

// ---------------------------------------------------------------------------
// Markdown → block parser
// ---------------------------------------------------------------------------

type HeadingBlock = { kind: 'heading'; level: 1 | 2 | 3; text: string }
type ParagraphBlock = { kind: 'paragraph'; text: string }
type BulletBlock = { kind: 'bullet'; text: string }
type TableBlock = { kind: 'table'; headers: string[]; rows: string[][] }
type SpacerBlock = { kind: 'spacer' }

export type MemoBlock = HeadingBlock | ParagraphBlock | BulletBlock | TableBlock | SpacerBlock

interface InlineRun {
  text: string
  bold: boolean
}

function parseInline(text: string): InlineRun[] {
  const parts = text.split(/(\*\*.*?\*\*)/g).filter((p) => p.length > 0)
  return parts.map((p) =>
    p.startsWith('**') && p.endsWith('**')
      ? { text: p.slice(2, -2), bold: true }
      : { text: p, bold: false }
  )
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*(:?-{3,}:?\s*\|\s*)*:?-{3,}:?\s*\|?\s*$/.test(line)
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((c) => c.trim())
}

export function parseMemoMarkdown(markdown: string): MemoBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: MemoBlock[] = []
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()

    if (line === '') {
      blocks.push({ kind: 'spacer' })
      i++
      continue
    }

    // Table: header row + separator row + 0+ body rows
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]))
        i++
      }
      blocks.push({ kind: 'table', headers, rows })
      continue
    }

    if (line.startsWith('### ')) {
      blocks.push({ kind: 'heading', level: 3, text: line.slice(4) })
    } else if (line.startsWith('## ')) {
      blocks.push({ kind: 'heading', level: 2, text: line.slice(3) })
    } else if (line.startsWith('# ')) {
      blocks.push({ kind: 'heading', level: 1, text: line.slice(2) })
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      blocks.push({ kind: 'bullet', text: line.slice(2) })
    } else {
      blocks.push({ kind: 'paragraph', text: line })
    }
    i++
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Word (.docx) export
// ---------------------------------------------------------------------------

function inlineToTextRuns(text: string): TextRun[] {
  return parseInline(text).map((run) => new TextRun({ text: run.text, bold: run.bold }))
}

function blocksToDocxChildren(blocks: MemoBlock[], opts: MemoExportOptions) {
  const children: (Paragraph | Table)[] = []

  if (opts.title) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: opts.title, bold: true, size: 32 })],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      })
    )
  }
  if (opts.clientName || opts.generatedAt) {
    const meta = [opts.clientName, opts.generatedAt?.toLocaleDateString()]
      .filter(Boolean)
      .join(' · ')
    children.push(
      new Paragraph({
        children: [new TextRun({ text: meta, italics: true, color: '666666' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    )
  }

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
        children.push(
          new Paragraph({
            children: inlineToTextRuns(block.text),
            heading:
              block.level === 1
                ? HeadingLevel.HEADING_1
                : block.level === 2
                  ? HeadingLevel.HEADING_2
                  : HeadingLevel.HEADING_3,
          })
        )
        break
      case 'paragraph':
        children.push(
          new Paragraph({
            children: inlineToTextRuns(block.text),
            spacing: { after: 200 },
          })
        )
        break
      case 'bullet':
        children.push(
          new Paragraph({
            children: inlineToTextRuns(block.text),
            bullet: { level: 0 },
          })
        )
        break
      case 'spacer':
        children.push(new Paragraph({ text: '', spacing: { after: 100 } }))
        break
      case 'table':
        children.push(buildDocxTable(block))
        break
    }
  }

  return children
}

function buildDocxTable(block: TableBlock): Table {
  const headerCells = block.headers.map(
    (h) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
      })
  )
  const bodyRows = block.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ children: inlineToTextRuns(cell) })],
            })
        ),
      })
  )
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: headerCells, tableHeader: true }), ...bodyRows],
  })
}

export async function exportMemoToWord(
  markdown: string,
  filename: string,
  options: MemoExportOptions = {}
): Promise<void> {
  const blocks = parseMemoMarkdown(markdown)
  const doc = new Document({
    sections: [{ properties: {}, children: blocksToDocxChildren(blocks, options) }],
  })
  const blob = await Packer.toBlob(doc)
  saveAs(blob, filename.endsWith('.docx') ? filename : `${filename}.docx`)
}

// ---------------------------------------------------------------------------
// PDF export (direct draw — no html2canvas dependency required for memos)
// ---------------------------------------------------------------------------

const PDF_MARGIN = 48
const PAGE_WIDTH = 612 // Letter at 72dpi
const PAGE_HEIGHT = 792
const CONTENT_WIDTH = PAGE_WIDTH - PDF_MARGIN * 2

interface PdfCursor {
  doc: jsPDF
  y: number
}

function ensureSpace(cursor: PdfCursor, needed: number) {
  if (cursor.y + needed > PAGE_HEIGHT - PDF_MARGIN) {
    cursor.doc.addPage()
    cursor.y = PDF_MARGIN
  }
}

function drawRichLine(cursor: PdfCursor, text: string, size: number, baseStyle: 'normal' | 'bold') {
  const runs = parseInline(text)
  cursor.doc.setFontSize(size)
  let x = PDF_MARGIN
  const lineHeight = size * 1.25

  for (const run of runs) {
    cursor.doc.setFont('helvetica', run.bold || baseStyle === 'bold' ? 'bold' : 'normal')
    const wrapped = cursor.doc.splitTextToSize(run.text, CONTENT_WIDTH - (x - PDF_MARGIN))
    for (let i = 0; i < wrapped.length; i++) {
      if (i > 0) {
        cursor.y += lineHeight
        ensureSpace(cursor, lineHeight)
        x = PDF_MARGIN
      }
      cursor.doc.text(wrapped[i], x, cursor.y)
      x += cursor.doc.getTextWidth(wrapped[i])
    }
  }
  cursor.y += lineHeight
}

function drawParagraph(cursor: PdfCursor, text: string) {
  ensureSpace(cursor, 16)
  drawRichLine(cursor, text, 11, 'normal')
  cursor.y += 4
}

function drawHeading(cursor: PdfCursor, text: string, level: 1 | 2 | 3) {
  const size = level === 1 ? 20 : level === 2 ? 15 : 12
  ensureSpace(cursor, size + 12)
  cursor.y += level === 1 ? 6 : 4
  drawRichLine(cursor, text, size, 'bold')
  cursor.y += 4
}

function drawBullet(cursor: PdfCursor, text: string) {
  ensureSpace(cursor, 16)
  cursor.doc.setFontSize(11)
  cursor.doc.setFont('helvetica', 'normal')
  cursor.doc.text('•', PDF_MARGIN + 4, cursor.y)
  const wrapped = cursor.doc.splitTextToSize(text.replace(/\*\*/g, ''), CONTENT_WIDTH - 20)
  cursor.doc.text(wrapped, PDF_MARGIN + 16, cursor.y)
  cursor.y += wrapped.length * 13 + 2
}

function drawTable(cursor: PdfCursor, block: TableBlock) {
  autoTable(cursor.doc, {
    startY: cursor.y + 4,
    head: [block.headers],
    body: block.rows,
    margin: { left: PDF_MARGIN, right: PDF_MARGIN },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold' },
    theme: 'grid',
  })
  // jspdf-autotable writes finalY back onto the doc; cast for typing.
  const finalY = (cursor.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY
  cursor.y = (finalY ?? cursor.y) + 8
}

function drawHeader(cursor: PdfCursor, opts: MemoExportOptions) {
  if (opts.title) {
    drawHeading(cursor, opts.title, 1)
  }
  if (opts.clientName || opts.generatedAt) {
    cursor.doc.setFontSize(10)
    cursor.doc.setFont('helvetica', 'italic')
    cursor.doc.setTextColor(100)
    const meta = [opts.clientName, opts.generatedAt?.toLocaleDateString()]
      .filter(Boolean)
      .join(' · ')
    cursor.doc.text(meta, PDF_MARGIN, cursor.y)
    cursor.doc.setTextColor(0)
    cursor.y += 18
  }
}

export async function exportMemoToPdf(
  markdown: string,
  filename: string,
  options: MemoExportOptions = {}
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const cursor: PdfCursor = { doc, y: PDF_MARGIN }

  drawHeader(cursor, options)

  for (const block of parseMemoMarkdown(markdown)) {
    switch (block.kind) {
      case 'heading':
        drawHeading(cursor, block.text, block.level)
        break
      case 'paragraph':
        drawParagraph(cursor, block.text)
        break
      case 'bullet':
        drawBullet(cursor, block.text)
        break
      case 'spacer':
        cursor.y += 6
        break
      case 'table':
        drawTable(cursor, block)
        break
    }
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
