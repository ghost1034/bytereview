'use client'

/** AttachmentInput — file picker that stores data URLs in form answers. */
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import type { AttachmentAnswer } from '../../lib/forms/answerFormat'

type Props = {
  fieldId: string
  value: unknown
  onChange: (v: unknown) => void
  readOnly?: boolean
  required: boolean
  directUpload?: boolean
}

/** Multi-file attachment control for public and preview forms. */
export function AttachmentInput({ fieldId, value, onChange, readOnly, required, directUpload }: Props) {
  const [readError, setReadError] = useState<string | null>(null)
  const files: AttachmentAnswer[] = Array.isArray(value)
    ? (value as AttachmentAnswer[])
    : value && typeof value === 'object' && ('dataUrl' in (value as object) || 'file' in (value as object))
      ? [value as AttachmentAnswer]
      : []

  const onFiles = (list: FileList | null) => {
    if (!list?.length) return
    setReadError(null)
    if (directUpload) {
      const selected: AttachmentAnswer[] = Array.from(list).map((file) => ({
        file,
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
      }))
      onChange([...files, ...selected])
      return
    }
    void Promise.all(
      Array.from(list).map(
        (file) =>
          new Promise<AttachmentAnswer>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () =>
              resolve({
                name: file.name,
                mime: file.type || 'application/octet-stream',
                size: file.size,
                dataUrl: String(reader.result),
              })
            reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`))
            reader.onabort = () => reject(new Error(`Reading ${file.name} was cancelled`))
            reader.readAsDataURL(file)
          })
      )
    )
      .then((uploaded) => onChange([...files, ...uploaded]))
      .catch((cause) => {
        console.error('Tasklytic attachment read failed:', cause)
        setReadError('One or more files could not be read. Please try again.')
      })
  }

  return (
    <div className="space-y-2">
      <Input
        id={fieldId}
        type="file"
        multiple
        required={required && files.length === 0}
        disabled={readOnly}
        className="rounded-md border border-input bg-background text-foreground"
        onChange={(e) => onFiles(e.target.files)}
      />
      {readError ? (
        <p className="text-xs text-destructive" role="alert">
          {readError}
        </p>
      ) : null}
      {files.map((f, i) => (
        <p key={i} className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {f.name} ({Math.round(f.size / 1024)} KB)
        </p>
      ))}
    </div>
  )
}
