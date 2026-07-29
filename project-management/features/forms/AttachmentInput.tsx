'use client'

/** AttachmentInput — file picker that stores data URLs in form answers. */
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
  const files: AttachmentAnswer[] = Array.isArray(value)
    ? (value as AttachmentAnswer[])
    : value && typeof value === 'object' && ('dataUrl' in (value as object) || 'file' in (value as object))
      ? [value as AttachmentAnswer]
      : []

  const onFiles = (list: FileList | null) => {
    if (!list?.length) return
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
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(file)
          })
      )
    ).then((uploaded) => onChange([...files, ...uploaded]))
  }

  return (
    <div className="space-y-2">
      <Input
        id={fieldId}
        type="file"
        multiple
        required={required && files.length === 0}
        disabled={readOnly}
        className="tl-input"
        onChange={(e) => onFiles(e.target.files)}
      />
      {files.map((f, i) => (
        <p key={i} className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
          {f.name} ({Math.round(f.size / 1024)} KB)
        </p>
      ))}
    </div>
  )
}
