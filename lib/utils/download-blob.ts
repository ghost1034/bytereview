/**
 * Triggers a browser download for an in-memory Blob.
 *
 * Replaces the duplicated blob -> anchor -> click -> revoke pattern that
 * appeared inline in ResultsStep, EditableResultsTable, and form-fill page.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
