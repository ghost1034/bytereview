// Reusable client-side export for analytics tables.
// Ported from CPAAnalytics' per-module export logic (PapaParse + xlsx) into a
// single helper shared across analytics modules. CSV/JSON download in-browser;
// Excel uses a dynamic xlsx import to keep it out of the main bundle.

import Papa from 'papaparse'

import type { ExportFormat } from '@/components/analytics/ExportButton'

type ExportRow = Record<string, string | number | boolean | null | undefined>

function triggerDownload(fileName: string, content: string, type: 'csv' | 'json') {
  const blob = new Blob([content], {
    type: type === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', fileName)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export an array of flat rows in the requested format. Rows should already be
 * shaped with human-readable column headers as keys.
 */
export async function exportRows(
  rows: ExportRow[],
  format: ExportFormat,
  filenamePrefix: string,
  sheetName = 'Sheet1',
): Promise<void> {
  const dateStr = new Date().toISOString().split('T')[0]
  const fileBase = `${filenamePrefix}_${dateStr}`

  if (format === 'csv') {
    triggerDownload(`${fileBase}.csv`, Papa.unparse(rows), 'csv')
    return
  }

  if (format === 'json') {
    triggerDownload(`${fileBase}.json`, JSON.stringify(rows, null, 2), 'json')
    return
  }

  // Excel — load xlsx lazily, fall back to CSV on failure.
  try {
    const XLSX = await import('xlsx')
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    XLSX.writeFile(workbook, `${fileBase}.xlsx`)
  } catch {
    triggerDownload(`${fileBase}.csv`, Papa.unparse(rows), 'csv')
  }
}

/**
 * Export multiple named row-sets. Excel writes one sheet per section; CSV/JSON
 * concatenate the sections with a separator/wrapper. Used by Reconciliation's
 * Full Reconciliation Report (Summary / Matched / Unmatched / Exceptions sheets).
 */
export async function exportRowsMultiSheet(
  sections: { sheetName: string; rows: ExportRow[] }[],
  format: ExportFormat,
  filenamePrefix: string,
): Promise<void> {
  const dateStr = new Date().toISOString().split('T')[0]
  const fileBase = `${filenamePrefix}_${dateStr}`

  if (format === 'csv') {
    const parts = sections.map(
      (s) => `# ${s.sheetName}\n${Papa.unparse(s.rows)}`,
    )
    triggerDownload(`${fileBase}.csv`, parts.join('\n\n'), 'csv')
    return
  }

  if (format === 'json') {
    const payload: Record<string, ExportRow[]> = {}
    for (const s of sections) payload[s.sheetName] = s.rows
    triggerDownload(`${fileBase}.json`, JSON.stringify(payload, null, 2), 'json')
    return
  }

  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    for (const s of sections) {
      const ws = XLSX.utils.json_to_sheet(s.rows)
      XLSX.utils.book_append_sheet(workbook, ws, s.sheetName.slice(0, 31))
    }
    XLSX.writeFile(workbook, `${fileBase}.xlsx`)
  } catch {
    const parts = sections.map(
      (s) => `# ${s.sheetName}\n${Papa.unparse(s.rows)}`,
    )
    triggerDownload(`${fileBase}.csv`, parts.join('\n\n'), 'csv')
  }
}
