'use client'

import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export type ParsedRow = Record<string, unknown>

/** Parse a CSV file into an array of row objects keyed by header. */
export function parseCSV<T = ParsedRow>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error),
    })
  })
}

/** Parse the first sheet of an Excel file (.xlsx, .xls) into row objects. */
export async function parseExcel<T = ParsedRow>(file: File): Promise<T[]> {
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data)
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return []
  const firstSheet = workbook.Sheets[firstSheetName]
  return XLSX.utils.sheet_to_json<T>(firstSheet)
}

/** Load pdfjs lazily — the package must not be imported at module scope (SSR/Turbopack). */
async function loadPdfJs() {
  if (typeof window === 'undefined') {
    throw new Error('PDF parsing is only available in the browser')
  }
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf-worker.min.mjs'
  return pdfjsLib
}

/** Extract text content from a PDF file (client-side only). */
export async function parsePDF(file: File): Promise<string> {
  const pdfjsLib = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    fullText += pageText + '\n'
  }
  return fullText
}

/** Extract text content from a Word document (.docx). */
export async function parseDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value || ''
}
