'use client'

import { useRouter } from 'next/navigation'
import { FilePenLine, MoreHorizontal, FolderInput } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import type { InkwiseDocument, InkwiseDocumentFolder } from '@/lib/api'

const UNFILED_FOLDER_ID = '__unfiled__'

interface DocumentCardProps {
  document: InkwiseDocument
  folders: InkwiseDocumentFolder[]
  showFolderBadge: boolean
  onMove: (documentId: string, folderId: string | null) => void
}

export function DocumentCard({ document, folders, showFolderBadge, onMove }: DocumentCardProps) {
  const router = useRouter()

  const currentFolder = folders.find((f) => f.id === document.folder_id)

  return (
    <Card className="h-full border-slate-200">
      <CardContent className="flex h-full flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <FilePenLine className="h-5 w-5" />
            </div>
            <h3 className="line-clamp-2 text-lg font-semibold text-slate-900">
              {document.title || 'Untitled document'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
              v{document.version}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/dashboard/inkwise/write/${document.id}`)}>
                  Open
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput className="mr-2 h-4 w-4" />
                    Move to...
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      disabled={!document.folder_id}
                      onClick={() => onMove(document.id, null)}
                    >
                      Unfiled
                    </DropdownMenuItem>
                    {folders.map((folder) => (
                      <DropdownMenuItem
                        key={folder.id}
                        disabled={document.folder_id === folder.id}
                        onClick={() => onMove(document.id, folder.id)}
                      >
                        {folder.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {showFolderBadge && (
          <Badge variant="secondary" className="w-fit">
            {currentFolder?.name ?? 'Unfiled'}
          </Badge>
        )}

        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="text-sm text-slate-500">Updated {new Date(document.updated_at).toLocaleString()}</div>
          <Button onClick={() => router.push(`/dashboard/inkwise/write/${document.id}`)}>Open</Button>
        </div>
      </CardContent>
    </Card>
  )
}
