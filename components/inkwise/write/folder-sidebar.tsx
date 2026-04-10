'use client'

import { FileText, Folder, FolderPlus, Inbox, Pencil, Search, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { InkwiseDocumentFolder } from '@/lib/api'

const UNFILED_FOLDER_ID = '__unfiled__'

interface FolderSidebarProps {
  folders: InkwiseDocumentFolder[]
  documentCounts: Map<string, number>
  totalCount: number
  selectedFolderId: string | null
  searchQuery: string
  onSearchChange: (query: string) => void
  onSelectFolder: (folderId: string | null) => void
  onCreateFolder: () => void
  onRenameFolder: (folder: InkwiseDocumentFolder) => void
  onDeleteFolder: (folder: InkwiseDocumentFolder) => void
  isLoading: boolean
}

export function FolderSidebar({
  folders,
  documentCounts,
  totalCount,
  selectedFolderId,
  searchQuery,
  onSearchChange,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  isLoading,
}: FolderSidebarProps) {
  const unfiledCount = documentCounts.get(UNFILED_FOLDER_ID) ?? 0

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Folders</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCreateFolder}>
                <FolderPlus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New folder</TooltipContent>
          </Tooltip>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search documents..."
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              onClick={() => onSearchChange('')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Folder list */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-3">
          {isLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : (
            <>
              {/* All Documents */}
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  selectedFolderId === null
                    ? 'border border-blue-500 bg-blue-50 font-medium'
                    : 'hover:bg-slate-50'
                )}
                onClick={() => onSelectFolder(null)}
              >
                <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="flex-1 truncate">All Documents</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {totalCount}
                </span>
              </button>

              {/* Unfiled */}
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  selectedFolderId === UNFILED_FOLDER_ID
                    ? 'border border-blue-500 bg-blue-50 font-medium'
                    : 'hover:bg-slate-50'
                )}
                onClick={() => onSelectFolder(UNFILED_FOLDER_ID)}
              >
                <Inbox className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="flex-1 truncate">Unfiled</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {unfiledCount}
                </span>
              </button>

              {folders.length > 0 && <Separator className="my-2" />}

              {/* User folders */}
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    selectedFolderId === folder.id
                      ? 'border border-blue-500 bg-blue-50 font-medium'
                      : 'hover:bg-slate-50'
                  )}
                  onClick={() => onSelectFolder(folder.id)}
                >
                  <Folder className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="flex-1 truncate">{folder.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {documentCounts.get(folder.id) ?? 0}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRenameFolder(folder)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteFolder(folder)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
