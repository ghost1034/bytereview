'use client'

import * as React from 'react'
import { Eraser } from 'lucide-react'

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
  signatureType: 'drawn' | 'typed'
  imageDataUrl?: string
  typedText?: string
  typedFont?: string
}

interface SignatureAdoptionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName: string
  onAdopt: (signature: AdoptedSignature) => void
}

const SIGNATURE_FONT = 'dancing-script'

/** Hand-rolled drawing canvas (touch-action: none so strokes work on iOS). */
function DrawCanvas({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void
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
        className="h-40 w-full rounded-md border border-dashed border-border bg-white"
        style={{ touchAction: 'none' }}
        aria-label="Signature drawing area"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-foreground-subtle">Draw your signature above</p>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          <Eraser className="mr-1.5 size-3.5" /> Clear
        </Button>
      </div>
    </div>
  )
}

export function SignatureAdoptionModal({
  open,
  onOpenChange,
  defaultName,
  onAdopt,
}: SignatureAdoptionModalProps) {
  const [tab, setTab] = React.useState<'type' | 'draw'>('type')
  const [typedText, setTypedText] = React.useState(defaultName)
  const [drawnDataUrl, setDrawnDataUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) setTypedText(defaultName)
  }, [open, defaultName])

  const canAdopt = tab === 'type' ? typedText.trim().length > 0 : !!drawnDataUrl

  const adopt = () => {
    if (tab === 'type') {
      onAdopt({ signatureType: 'typed', typedText: typedText.trim(), typedFont: SIGNATURE_FONT })
    } else if (drawnDataUrl) {
      onAdopt({ signatureType: 'drawn', imageDataUrl: drawnDataUrl })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adopt your signature</DialogTitle>
          <DialogDescription>
            Your adopted signature will be applied to every signature field assigned to you and
            recorded as legal evidence of your intent to sign.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'type' | 'draw')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="type">Type</TabsTrigger>
            <TabsTrigger value="draw">Draw</TabsTrigger>
          </TabsList>
          <TabsContent value="type" className="space-y-3 pt-3">
            <Input
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder="Your full name"
              maxLength={120}
            />
            <div
              className={cn(
                'flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-white px-4',
              )}
            >
              <span
                className="truncate text-4xl text-gray-900"
                style={{ fontFamily: 'var(--font-signature), cursive' }}
              >
                {typedText || 'Your signature'}
              </span>
            </div>
          </TabsContent>
          <TabsContent value="draw" className="pt-3">
            <DrawCanvas onChange={setDrawnDataUrl} />
          </TabsContent>
        </Tabs>

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
