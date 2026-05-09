'use client'

import * as React from 'react'
import { UploadCloud } from 'lucide-react'

import { cn } from '@/lib/utils'

interface DropzoneProps {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  className?: string
  title?: React.ReactNode
  description?: React.ReactNode
  hint?: React.ReactNode
  children?: React.ReactNode
  /** Allow folder upload via webkitdirectory in addition to file picker */
  enableFolderPicker?: boolean
}

export function Dropzone({
  onFiles,
  accept,
  multiple = true,
  disabled,
  className,
  title = 'Drop files here or click to upload',
  description = 'Drag and drop, paste, or click to choose files from your computer.',
  hint,
  children,
  enableFolderPicker,
}: DropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const folderRef = React.useRef<HTMLInputElement>(null)
  const liveRef = React.useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = React.useState(false)
  const dragDepth = React.useRef(0)

  const announce = React.useCallback((message: string) => {
    if (liveRef.current) {
      liveRef.current.textContent = message
    }
  }, [])

  const handleFiles = React.useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return
      const arr = Array.from(files)
      if (arr.length === 0) return
      onFiles(arr)
      announce(`${arr.length} file${arr.length === 1 ? '' : 's'} added`)
    },
    [onFiles, announce],
  )

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setIsDragOver(false)
    if (disabled) return
    handleFiles(event.dataTransfer?.files ?? null)
  }

  const onDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    dragDepth.current += 1
    setIsDragOver(true)
  }

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragOver(false)
  }

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const openFilePicker = () => {
    if (disabled) return
    inputRef.current?.click()
  }

  const openFolderPicker = () => {
    if (disabled) return
    folderRef.current?.click()
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-label={typeof title === 'string' ? title : 'File upload'}
        onClick={openFilePicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openFilePicker()
          }
        }}
        onDrop={onDrop}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        className={cn(
          'group relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isDragOver
            ? 'border-primary bg-primary-soft'
            : 'border-border bg-surface',
          disabled && 'opacity-60 pointer-events-none',
        )}
      >
        <span
          className={cn(
            'flex size-12 items-center justify-center rounded-full ring-1 ring-inset transition-colors',
            isDragOver
              ? 'bg-primary text-primary-foreground ring-primary/20'
              : 'bg-surface-muted text-foreground-muted ring-border',
          )}
          aria-hidden
        >
          <UploadCloud className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && (
            <p className="text-xs text-foreground-muted">{description}</p>
          )}
        </div>
        {(hint || enableFolderPicker) && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-foreground-subtle">
            {hint}
            {enableFolderPicker && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  openFolderPicker()
                }}
                className="text-foreground-muted underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Or upload a folder
              </button>
            )}
          </div>
        )}
        {children}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
      {enableFolderPicker && (
        <input
          ref={folderRef}
          type="file"
          // @ts-expect-error webkitdirectory is non-standard but widely supported
          webkitdirectory=""
          // @ts-expect-error directory is the spec name
          directory=""
          multiple
          className="sr-only"
          onChange={(event) => {
            handleFiles(event.target.files)
            event.target.value = ''
          }}
        />
      )}

      <div
        ref={liveRef}
        role="status"
        aria-live="polite"
        className="sr-only"
      />
    </div>
  )
}
