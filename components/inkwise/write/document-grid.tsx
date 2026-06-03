'use client'

import { FilePenLine, Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DocumentCard } from './document-card'
import type { InkwiseDocument, InkwiseDocumentFolder } from '@/lib/api'

export type SortKey = 'updated_at' | 'title_asc' | 'title_desc' | 'created_at_desc' | 'created_at_asc'

interface DocumentGridProps {
  documents: InkwiseDocument[]
  folders: InkwiseDocumentFolder[]
  folderName: string
  sortKey: SortKey
  onSortChange: (key: SortKey) => void
  showFolderBadge: boolean
  onMoveDocument: (documentId: string, folderId: string | null) => void
  onCreateDocument: () => void
  isCreating: boolean
  isLoading: boolean
}

export function DocumentGrid({
  documents,
  folders,
  folderName,
  sortKey,
  onSortChange,
  showFolderBadge,
  onMoveDocument,
  onCreateDocument,
  isCreating,
  isLoading,
}: DocumentGridProps) {
  return (
    <div className="flex h-full flex-col" data-tour="inkwise-document-grid">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-lg font-semibold">{folderName}</h2>
        <div className="flex items-center gap-3">
          <Select value={sortKey} onValueChange={(v) => onSortChange(v as SortKey)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_at">Last updated</SelectItem>
              <SelectItem value="title_asc">Title A&ndash;Z</SelectItem>
              <SelectItem value="title_desc">Title Z&ndash;A</SelectItem>
              <SelectItem value="created_at_desc">Newest first</SelectItem>
              <SelectItem value="created_at_asc">Oldest first</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={onCreateDocument} disabled={isCreating} data-tour="inkwise-new-document-button">
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            New document
          </Button>
        </div>
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : documents.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {documents.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  folders={folders}
                  showFolderBadge={showFolderBadge}
                  onMove={onMoveDocument}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                <div className="rounded-full bg-slate-100 p-4 text-slate-500">
                  <FilePenLine className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">No documents found</p>
                  <p className="text-sm text-slate-500">Create a new document to get started.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
