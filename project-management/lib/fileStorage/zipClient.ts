/**
 * Client-side ZIP builder — caps entries to avoid browser memory pressure.
 */
import JSZip from 'jszip'

const MAX_ZIP_FILES = 100

export type ZipEntry = { name: string; data: Blob | ArrayBuffer | string }

/** Build a ZIP blob from named file entries (max 100 files). */
export async function buildZipBlob(entries: ZipEntry[]): Promise<Blob> {
  if (entries.length === 0) throw new Error('No files to zip')
  if (entries.length > MAX_ZIP_FILES) {
    throw new Error(`Cannot zip more than ${MAX_ZIP_FILES} files at once`)
  }
  const zip = new JSZip()
  entries.forEach((entry, index) => {
    const safeName = entry.name.trim() || `file-${index + 1}`
    zip.file(safeName, entry.data)
  })
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export { MAX_ZIP_FILES }
