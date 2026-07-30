/** Reject executable and other unsafe upload types. */
const BLOCKED_EXTENSIONS = /\.(exe|bat|sh|dll|com|cmd|msi|scr|ps1)$/i

const BLOCKED_MIMES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-bat',
  'application/vnd.microsoft.portable-executable',
])

/** Returns an error message when the file must be rejected, otherwise null. */
export function validateUploadMime(file: File): string | null {
  if (BLOCKED_EXTENSIONS.test(file.name)) {
    return `"${file.name}" is not an allowed file type.`
  }
  const mime = (file.type || '').toLowerCase()
  if (mime && BLOCKED_MIMES.has(mime)) {
    return `"${file.name}" is not an allowed file type.`
  }
  return null
}
