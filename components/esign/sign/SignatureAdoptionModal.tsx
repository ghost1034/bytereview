'use client'

import * as React from 'react'
import { Eraser, ImagePlus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export interface AdoptedSignature {
  signatureType: 'drawn' | 'typed' | 'uploaded'
  imageDataUrl?: string
  typedText?: string
  typedFont?: string
  initialsText?: string
  initialsImageDataUrl?: string
}

// Slugs must stay in sync with ALLOWED_TYPED_FONTS (backend signing service)
// and the CSS variables registered in app/layout.tsx.
export const SIGNATURE_FONTS = [
  { slug: 'dancing-script', label: 'Dancing Script', fontFamily: 'var(--font-signature), cursive' },
  { slug: 'caveat', label: 'Caveat', fontFamily: 'var(--font-signature-caveat), cursive' },
  { slug: 'great-vibes', label: 'Great Vibes', fontFamily: 'var(--font-signature-great-vibes), cursive' },
  { slug: 'homemade-apple', label: 'Homemade Apple', fontFamily: 'var(--font-signature-homemade-apple), cursive' },
] as const

export function signatureFontFamily(slug?: string | null): string {
  return SIGNATURE_FONTS.find((f) => f.slug === slug)?.fontFamily ?? SIGNATURE_FONTS[0].fontFamily
}

export function deriveInitials(name: string): string {
  return (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

// Uploaded images are normalized to a bounded PNG so they stay under the
// backend's 1 MB signature-image cap and stamp cleanly onto the PDF.
const UPLOAD_MAX_WIDTH = 600
const UPLOAD_MAX_HEIGHT = 240

async function fileToNormalizedPng(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the selected file'))
    reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The selected file is not a valid image'))
    img.src = dataUrl
  })
  const scale = Math.min(UPLOAD_MAX_WIDTH / image.width, UPLOAD_MAX_HEIGHT / image.height, 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

interface SignatureAdoptionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName: string
  onAdopt: (signature: AdoptedSignature) => void
}

/** Hand-rolled drawing canvas (touch-action: none so strokes work on iOS). */
function DrawCanvas({
  onChange,
  heightClass = 'h-40',
  ariaLabel = 'Signature drawing area',
  hint = 'Draw your signature above',
}: {
  onChange: (dataUrl: string | null) => void
  heightClass?: string
  ariaLabel?: string
  hint?: string
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const drawing = React.useRef(false)
  const hasInk = React.useRef(false)
  const lastPoint = React.useRef<{ x: number; y: number } | null>(null)

  // Size the backing store once mounted (2x for crispness).
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(2, 2)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111827'
    }
  }, [])

  const pointFromEvent = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drawing.current = true
    lastPoint.current = pointFromEvent(e)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    const point = pointFromEvent(e)
    if (ctx && lastPoint.current) {
      ctx.beginPath()
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
      hasInk.current = true
    }
    lastPoint.current = point
  }

  const onPointerUp = () => {
    drawing.current = false
    lastPoint.current = null
    if (hasInk.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      hasInk.current = false
      onChange(null)
    }
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn('w-full rounded-md border border-dashed border-border bg-white', heightClass)}
        style={{ touchAction: 'none' }}
        aria-label={ariaLabel}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-foreground-subtle">{hint}</p>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          <Eraser className="mr-1.5 size-3.5" /> Clear
        </Button>
      </div>
    </div>
  )
}

function UploadDropzone({
  label,
  dataUrl,
  onChange,
  onError,
  heightClass = 'h-32',
}: {
  label: string
  dataUrl: string | null
  onChange: (dataUrl: string | null) => void
  onError: (message: string) => void
  heightClass?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      onChange(await fileToNormalizedPng(file))
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not read the selected image')
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      {dataUrl ? (
        <div
          className={cn(
            'relative flex items-center justify-center rounded-md border border-border bg-white p-2',
            heightClass,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrl} alt={label} className="max-h-full max-w-full object-contain" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1"
            onClick={() => onChange(null)}
            aria-label={`Remove ${label.toLowerCase()}`}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-white text-xs text-foreground-muted transition-colors hover:border-primary hover:text-foreground',
            heightClass,
          )}
        >
          <ImagePlus className="size-5" />
          Choose an image (PNG, JPG)
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function SignatureAdoptionModal({
  open,
  onOpenChange,
  defaultName,
  onAdopt,
}: SignatureAdoptionModalProps) {
  const [tab, setTab] = React.useState<'type' | 'draw' | 'upload'>('type')
  const [fullName, setFullName] = React.useState(defaultName)
  const [initials, setInitials] = React.useState(deriveInitials(defaultName))
  const [initialsTouched, setInitialsTouched] = React.useState(false)
  const [fontSlug, setFontSlug] = React.useState<string>(SIGNATURE_FONTS[0].slug)
  const [drawnDataUrl, setDrawnDataUrl] = React.useState<string | null>(null)
  const [drawnInitialsDataUrl, setDrawnInitialsDataUrl] = React.useState<string | null>(null)
  const [uploadedDataUrl, setUploadedDataUrl] = React.useState<string | null>(null)
  const [uploadedInitialsDataUrl, setUploadedInitialsDataUrl] = React.useState<string | null>(null)
  const [uploadError, setUploadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setFullName(defaultName)
      setInitials(deriveInitials(defaultName))
      setInitialsTouched(false)
    }
  }, [open, defaultName])

  const setName = (value: string) => {
    setFullName(value)
    if (!initialsTouched) setInitials(deriveInitials(value))
  }

  const canAdopt =
    fullName.trim().length > 0 &&
    (tab === 'type' ? true : tab === 'draw' ? !!drawnDataUrl : !!uploadedDataUrl)

  const adopt = () => {
    const base = {
      typedText: fullName.trim(),
      initialsText: initials.trim() || deriveInitials(fullName),
    }
    if (tab === 'type') {
      onAdopt({ ...base, signatureType: 'typed', typedFont: fontSlug })
    } else if (tab === 'draw' && drawnDataUrl) {
      onAdopt({
        ...base,
        signatureType: 'drawn',
        imageDataUrl: drawnDataUrl,
        initialsImageDataUrl: drawnInitialsDataUrl ?? undefined,
      })
    } else if (tab === 'upload' && uploadedDataUrl) {
      onAdopt({
        ...base,
        signatureType: 'uploaded',
        imageDataUrl: uploadedDataUrl,
        initialsImageDataUrl: uploadedInitialsDataUrl ?? undefined,
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Adopt your signature and initials</DialogTitle>
          <DialogDescription>
            Confirm your name and initials, then choose how your signature should look. It will be
            available to apply to each signature, initials, or stamp field you choose.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground-muted">Full name</p>
            <Input
              value={fullName}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground-muted">Initials</p>
            <Input
              value={initials}
              onChange={(e) => {
                setInitialsTouched(true)
                setInitials(e.target.value)
              }}
              placeholder="Initials"
              maxLength={10}
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'type' | 'draw' | 'upload')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="type">Select style</TabsTrigger>
            <TabsTrigger value="draw">Draw</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="type" className="space-y-2 pt-3">
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {SIGNATURE_FONTS.map((font) => {
                const selected = font.slug === fontSlug
                return (
                  <button
                    key={font.slug}
                    type="button"
                    onClick={() => setFontSlug(font.slug)}
                    className={cn(
                      'flex w-full items-center justify-between gap-4 rounded-md border bg-white px-4 py-2.5 text-left transition-colors',
                      selected
                        ? 'border-primary ring-1 ring-primary'
                        : 'border-border hover:border-foreground-subtle',
                    )}
                    aria-pressed={selected}
                  >
                    <span
                      className="min-w-0 truncate text-3xl text-gray-900"
                      style={{ fontFamily: font.fontFamily }}
                    >
                      {fullName.trim() || 'Your signature'}
                    </span>
                    <span
                      className="shrink-0 text-2xl text-gray-900"
                      style={{ fontFamily: font.fontFamily }}
                    >
                      {(initials.trim() || deriveInitials(fullName) || 'IN').toUpperCase()}
                    </span>
                  </button>
                )
              })}
            </div>
          </TabsContent>

          <TabsContent value="draw" className="space-y-4 pt-3">
            <DrawCanvas onChange={setDrawnDataUrl} />
            <DrawCanvas
              onChange={setDrawnInitialsDataUrl}
              heightClass="h-20"
              ariaLabel="Initials drawing area"
              hint="Draw your initials above (optional — typed initials are used otherwise)"
            />
          </TabsContent>

          <TabsContent value="upload" className="space-y-4 pt-3">
            <UploadDropzone
              label="Signature image"
              dataUrl={uploadedDataUrl}
              onChange={(v) => {
                setUploadError(null)
                setUploadedDataUrl(v)
              }}
              onError={setUploadError}
            />
            <UploadDropzone
              label="Initials image (optional)"
              dataUrl={uploadedInitialsDataUrl}
              onChange={(v) => {
                setUploadError(null)
                setUploadedInitialsDataUrl(v)
              }}
              onError={setUploadError}
              heightClass="h-20"
            />
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          </TabsContent>
        </Tabs>

        <p className="text-[11px] leading-4 text-foreground-subtle">
          By selecting Adopt and Sign, I agree that the signature and initials shown here will be
          the electronic representation of my signature and initials for all purposes when I (or my
          agent) use them on documents, including legally binding contracts — just the same as a
          pen-and-paper signature or initial.
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={adopt} disabled={!canAdopt}>
            Adopt and Sign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
