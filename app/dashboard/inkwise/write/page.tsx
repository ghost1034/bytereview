'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { FolderSidebar } from '@/components/inkwise/write/folder-sidebar'
import { DocumentGrid, type SortKey } from '@/components/inkwise/write/document-grid'
import { CreateFolderDialog, RenameFolderDialog, DeleteFolderDialog } from '@/components/inkwise/write/folder-dialogs'
import { CreateDocumentDialog } from '@/components/inkwise/write/create-document-dialog'
import { useInkwiseDocumentFolders, useInkwiseDocuments } from '@/hooks/useInkwise'
import { useToast } from '@/hooks/use-toast'
import { apiClient, type InkwiseDocumentFolder } from '@/lib/api'

const UNFILED_FOLDER_ID = '__unfiled__'

export default function InkwiseWritePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const documents = useInkwiseDocuments(1, 100)
  const folders = useInkwiseDocumentFolders()

  // UI state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated_at')

  // Dialog state
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false)
  const [createDocumentOpen, setCreateDocumentOpen] = useState(false)
  const [targetFolder, setTargetFolder] = useState<InkwiseDocumentFolder | null>(null)

  const refreshLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document-folders'] })
  }

  // -- Mutations --

  const createDocument = useMutation({
    mutationFn: ({ title, folderId }: { title: string; folderId: string | null }) =>
      apiClient.createInkwiseDocument({ title, folder_id: folderId, content_html: '<p></p>' }),
    onSuccess: async (document) => {
      setCreateDocumentOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
      router.push(`/dashboard/inkwise/write/${document.id}`)
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create document', description: error.message, variant: 'destructive' })
    },
  })

  const createFolder = useMutation({
    mutationFn: (name: string) => apiClient.createInkwiseDocumentFolder({ name }),
    onSuccess: async () => {
      setCreateFolderOpen(false)
      await refreshLists()
      toast({ title: 'Folder created', description: 'Your writing workspace has a new folder.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create folder', description: error.message, variant: 'destructive' })
    },
  })

  const renameFolder = useMutation({
    mutationFn: ({ folderId, name }: { folderId: string; name: string }) =>
      apiClient.updateInkwiseDocumentFolder(folderId, { name }),
    onSuccess: async () => {
      setRenameFolderOpen(false)
      await refreshLists()
      toast({ title: 'Folder renamed', description: 'The folder name was updated.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not rename folder', description: error.message, variant: 'destructive' })
    },
  })

  const deleteFolder = useMutation({
    mutationFn: (folderId: string) => apiClient.deleteInkwiseDocumentFolder(folderId),
    onSuccess: async () => {
      setDeleteFolderOpen(false)
      if (targetFolder && selectedFolderId === targetFolder.id) setSelectedFolderId(null)
      await refreshLists()
      toast({ title: 'Folder deleted', description: 'Documents in that folder were moved to Unfiled.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete folder', description: error.message, variant: 'destructive' })
    },
  })

  const moveDocument = useMutation({
    mutationFn: ({ documentId, folderId }: { documentId: string; folderId: string | null }) =>
      apiClient.moveInkwiseDocument(documentId, folderId),
    onSuccess: async () => {
      await refreshLists()
    },
    onError: (error: Error) => {
      toast({ title: 'Could not move document', description: error.message, variant: 'destructive' })
    },
  })

  // -- Derived data --

  const allDocs = documents.data?.items ?? []
  const allFolders = folders.data?.items ?? []

  const documentCounts = useMemo(() => {
    const counts = new Map<string, number>()
    counts.set(UNFILED_FOLDER_ID, 0)
    for (const folder of allFolders) counts.set(folder.id, 0)
    for (const doc of allDocs) {
      const key = doc.folder_id || UNFILED_FOLDER_ID
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [allDocs, allFolders])

  const filteredAndSorted = useMemo(() => {
    let result = allDocs

    // Filter by folder
    if (selectedFolderId === UNFILED_FOLDER_ID) {
      result = result.filter((d) => !d.folder_id)
    } else if (selectedFolderId) {
      result = result.filter((d) => d.folder_id === selectedFolderId)
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter((d) => (d.title || 'Untitled document').toLowerCase().includes(q))
    }

    // Sort
    const sorted = [...result]
    switch (sortKey) {
      case 'updated_at':
        sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        break
      case 'title_asc':
        sorted.sort((a, b) => (a.title || 'Untitled document').localeCompare(b.title || 'Untitled document'))
        break
      case 'title_desc':
        sorted.sort((a, b) => (b.title || 'Untitled document').localeCompare(a.title || 'Untitled document'))
        break
      case 'created_at_desc':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case 'created_at_asc':
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        break
    }
    return sorted
  }, [allDocs, selectedFolderId, searchQuery, sortKey])

  // Resolve folder name for the grid header
  const folderName = useMemo(() => {
    if (selectedFolderId === null) return 'All Documents'
    if (selectedFolderId === UNFILED_FOLDER_ID) return 'Unfiled'
    return allFolders.find((f) => f.id === selectedFolderId)?.name ?? 'All Documents'
  }, [selectedFolderId, allFolders])

  // Resolve default folder for new document dialog
  const defaultDocFolderId = selectedFolderId === null ? null : selectedFolderId === UNFILED_FOLDER_ID ? null : selectedFolderId

  const isLoading = documents.isLoading || folders.isLoading

  return (
    <>
      <div className="h-[calc(100vh-4rem)]">
        <ResizablePanelGroup direction="horizontal" className="h-full rounded-lg border bg-white">
          <ResizablePanel defaultSize={25} minSize={18} maxSize={35}>
            <FolderSidebar
              folders={allFolders}
              documentCounts={documentCounts}
              totalCount={allDocs.length}
              selectedFolderId={selectedFolderId}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelectFolder={setSelectedFolderId}
              onCreateFolder={() => setCreateFolderOpen(true)}
              onRenameFolder={(folder) => {
                setTargetFolder(folder)
                setRenameFolderOpen(true)
              }}
              onDeleteFolder={(folder) => {
                setTargetFolder(folder)
                setDeleteFolderOpen(true)
              }}
              isLoading={isLoading}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={75}>
            <DocumentGrid
              documents={filteredAndSorted}
              folders={allFolders}
              folderName={folderName}
              sortKey={sortKey}
              onSortChange={setSortKey}
              showFolderBadge={selectedFolderId === null}
              onMoveDocument={(documentId, folderId) => moveDocument.mutate({ documentId, folderId })}
              onCreateDocument={() => setCreateDocumentOpen(true)}
              isCreating={createDocument.isPending}
              isLoading={isLoading}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Dialogs */}
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onSubmit={(name) => createFolder.mutate(name)}
        isPending={createFolder.isPending}
      />
      <RenameFolderDialog
        open={renameFolderOpen}
        onOpenChange={setRenameFolderOpen}
        folder={targetFolder}
        onSubmit={(folderId, name) => renameFolder.mutate({ folderId, name })}
        isPending={renameFolder.isPending}
      />
      <DeleteFolderDialog
        open={deleteFolderOpen}
        onOpenChange={setDeleteFolderOpen}
        folder={targetFolder}
        documentCount={targetFolder ? (documentCounts.get(targetFolder.id) ?? 0) : 0}
        onConfirm={(folderId) => deleteFolder.mutate(folderId)}
        isPending={deleteFolder.isPending}
      />
      <CreateDocumentDialog
        open={createDocumentOpen}
        onOpenChange={setCreateDocumentOpen}
        folders={allFolders}
        defaultFolderId={defaultDocFolderId}
        onSubmit={(title, folderId) => createDocument.mutate({ title, folderId })}
        isPending={createDocument.isPending}
      />
    </>
  )
}
