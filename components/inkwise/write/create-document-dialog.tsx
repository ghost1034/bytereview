'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { InkwiseDocumentFolder } from '@/lib/api'

const UNFILED_FOLDER_ID = '__unfiled__'

interface CreateDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: InkwiseDocumentFolder[]
  defaultFolderId: string | null
  onSubmit: (title: string, folderId: string | null) => void
  isPending: boolean
}

export function CreateDocumentDialog({
  open,
  onOpenChange,
  folders,
  defaultFolderId,
  onSubmit,
  isPending,
}: CreateDocumentDialogProps) {
  const [title, setTitle] = useState('')
  const [folderId, setFolderId] = useState<string>(UNFILED_FOLDER_ID)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setFolderId(defaultFolderId ?? UNFILED_FOLDER_ID)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, defaultFolderId])

  const handleSubmit = () => {
    const resolvedTitle = title.trim() || 'Untitled document'
    const resolvedFolderId = folderId === UNFILED_FOLDER_ID ? null : folderId
    onSubmit(resolvedTitle, resolvedFolderId)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Document</DialogTitle>
          <DialogDescription>Create a new grounded document.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              ref={inputRef}
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled document"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Folder</Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNFILED_FOLDER_ID}>Unfiled</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create &amp; Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
