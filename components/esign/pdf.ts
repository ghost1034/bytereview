'use client'

/**
 * Lazy pdf.js loader for the e-sign module.
 * pdfjs-dist must never be imported at module scope (SSR/Turbopack) — same
 * pattern as lib/analytics/fileParser.ts.
 */

export type PdfJsLib = typeof import('pdfjs-dist')
export type PdfDocument = import('pdfjs-dist').PDFDocumentProxy

let pdfjsPromise: Promise<PdfJsLib> | null = null

export async function loadPdfJs(): Promise<PdfJsLib> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf-worker.min.mjs'
      return pdfjsLib
    })
  }
  return pdfjsPromise
}

/** Fetch a PDF (e.g. from a signed GCS URL) and open it with pdf.js. */
export async function openPdfFromUrl(url: string): Promise<PdfDocument> {
  const pdfjsLib = await loadPdfJs()
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download PDF (HTTP ${response.status})`)
  }
  const data = await response.arrayBuffer()
  return pdfjsLib.getDocument({ data }).promise
}

export async function openPdfFromFile(file: File): Promise<PdfDocument> {
  const pdfjsLib = await loadPdfJs()
  const data = await file.arrayBuffer()
  return pdfjsLib.getDocument({ data }).promise
}

/** Per-recipient color coding, stable by index. */
const PARTICIPANT_COLORS = [
  { border: '#2563eb', bg: 'rgba(37, 99, 235, 0.14)', text: '#1d4ed8' }, // blue
  { border: '#d97706', bg: 'rgba(217, 119, 6, 0.14)', text: '#b45309' }, // amber
  { border: '#059669', bg: 'rgba(5, 150, 105, 0.14)', text: '#047857' }, // emerald
  { border: '#7c3aed', bg: 'rgba(124, 58, 237, 0.14)', text: '#6d28d9' }, // violet
  { border: '#db2777', bg: 'rgba(219, 39, 119, 0.14)', text: '#be185d' }, // pink
  { border: '#0891b2', bg: 'rgba(8, 145, 178, 0.14)', text: '#0e7490' }, // cyan
]

export function participantColor(index: number) {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length]
}

export async function sha256HexOfFile(file: File): Promise<string> {
  const data = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
