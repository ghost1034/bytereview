'use client'

/**
 * Shared memo export utility — converts a markdown memo into a downloadable
 * PDF or Word (.docx) file. Designed for reuse across analytics modules
 * (variance, waterfall, reconciliation, amortization).
 *
 * jspdf and docx are loaded lazily — Turbopack mishandles their top-level
 * imports (Worker eval:true / class syntax) and crashes with
 * "'super' keyword unexpected here".
 */

import { saveAs } from 'file-saver'

export interface MemoExportOptions {
  title?: string
  clientName?: string
  generatedAt?: Date
}

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
      : { text: p, bold: false },
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

export async function exportMemoToWord(
  markdown: string,
  filename: string,
  options: MemoExportOptions = {},
): Promise<void> {
  const {
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
  } = await import('docx')

  const inlineToTextRuns = (text: string) =>
    parseInline(text).map((run) => new TextRun({ text: run.text, bold: run.bold }))

  const buildDocxTable = (block: TableBlock) => {
    const headerCells = block.headers.map(
      (h) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        }),
    )
    const bodyRows = block.rows.map(
      (row) =>
        new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                children: [new Paragraph({ children: inlineToTextRuns(cell) })],
              }),
          ),
        }),
    )
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: headerCells, tableHeader: true }), ...bodyRows],
    })
  }

  const blocks = parseMemoMarkdown(markdown)
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = []

  if (options.title) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: options.title, bold: true, size: 32 })],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
    )
  }
  if (options.clientName || options.generatedAt) {
    const meta = [options.clientName, options.generatedAt?.toLocaleDateString()]
      .filter(Boolean)
      .join(' · ')
    children.push(
      new Paragraph({
        children: [new TextRun({ text: meta, italics: true, color: '666666' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
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
          }),
        )
        break
      case 'paragraph':
        children.push(
          new Paragraph({
            children: inlineToTextRuns(block.text),
            spacing: { after: 200 },
          }),
        )
        break
      case 'bullet':
        children.push(
          new Paragraph({
            children: inlineToTextRuns(block.text),
            bullet: { level: 0 },
          }),
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

  const doc = new Document({
    sections: [{ properties: {}, children }],
  })
  const blob = await Packer.toBlob(doc)
  saveAs(blob, filename.endsWith('.docx') ? filename : `${filename}.docx`)
}

export async function exportMemoToPdf(
  markdown: string,
  filename: string,
  options: MemoExportOptions = {},
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const PDF_MARGIN = 48
  const PAGE_WIDTH = 612
  const PAGE_HEIGHT = 792
  const CONTENT_WIDTH = PAGE_WIDTH - PDF_MARGIN * 2

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  let y = PDF_MARGIN

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_HEIGHT - PDF_MARGIN) {
      doc.addPage()
      y = PDF_MARGIN
    }
  }

  const drawRichLine = (text: string, size: number, baseStyle: 'normal' | 'bold') => {
    const runs = parseInline(text)
    doc.setFontSize(size)
    let x = PDF_MARGIN
    const lineHeight = size * 1.25

    for (const run of runs) {
      doc.setFont('helvetica', run.bold || baseStyle === 'bold' ? 'bold' : 'normal')
      const wrapped = doc.splitTextToSize(run.text, CONTENT_WIDTH - (x - PDF_MARGIN))
      for (let i = 0; i < wrapped.length; i++) {
        if (i > 0) {
          y += lineHeight
          ensureSpace(lineHeight)
          x = PDF_MARGIN
        }
        doc.text(wrapped[i], x, y)
        x += doc.getTextWidth(wrapped[i])
      }
    }
    y += lineHeight
  }

  const drawParagraph = (text: string) => {
    ensureSpace(16)
    drawRichLine(text, 11, 'normal')
    y += 4
  }

  const drawHeading = (text: string, level: 1 | 2 | 3) => {
    const size = level === 1 ? 20 : level === 2 ? 15 : 12
    ensureSpace(size + 12)
    y += level === 1 ? 6 : 4
    drawRichLine(text, size, 'bold')
    y += 4
  }

  const drawBullet = (text: string) => {
    ensureSpace(16)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text('•', PDF_MARGIN + 4, y)
    const wrapped = doc.splitTextToSize(text.replace(/\*\*/g, ''), CONTENT_WIDTH - 20)
    doc.text(wrapped, PDF_MARGIN + 16, y)
    y += wrapped.length * 13 + 2
  }

  const drawTable = (block: TableBlock) => {
    autoTable(doc, {
      startY: y + 4,
      head: [block.headers],
      body: block.rows,
      margin: { left: PDF_MARGIN, right: PDF_MARGIN },
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold' },
      theme: 'grid',
    })
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
    y = (finalY ?? y) + 8
  }

  if (options.title) {
    drawHeading(options.title, 1)
  }
  if (options.clientName || options.generatedAt) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(100)
    const meta = [options.clientName, options.generatedAt?.toLocaleDateString()]
      .filter(Boolean)
      .join(' · ')
    doc.text(meta, PDF_MARGIN, y)
    doc.setTextColor(0)
    y += 18
  }

  for (const block of parseMemoMarkdown(markdown)) {
    switch (block.kind) {
      case 'heading':
        drawHeading(block.text, block.level)
        break
      case 'paragraph':
        drawParagraph(block.text)
        break
      case 'bullet':
        drawBullet(block.text)
        break
      case 'spacer':
        y += 6
        break
      case 'table':
        drawTable(block)
        break
    }
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
