'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FilePenLine, Folder, FolderPlus, Loader2, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useInkwiseDocumentFolders, useInkwiseDocuments } from '@/hooks/useInkwise'
import { useToast } from '@/hooks/use-toast'
import { apiClient } from '@/lib/api'

const UNFILED_FOLDER_ID = '__unfiled__'

export default function InkwiseWritePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const documents = useInkwiseDocuments(1, 100)
  const folders = useInkwiseDocumentFolders()
  const [newFolderName, setNewFolderName] = useState('')

  const refreshLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
    await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document-folders'] })
  }

  const createDocument = useMutation({
    mutationFn: () => apiClient.createInkwiseDocument({ title: 'Untitled document', content_html: '<p></p>' }),
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
      router.push(`/dashboard/inkwise/write/${document.id}`)
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create document', description: error.message, variant: 'destructive' })
    },
  })

  const createFolder = useMutation({
    mutationFn: () => apiClient.createInkwiseDocumentFolder({ name: newFolderName.trim() }),
    onSuccess: async () => {
      setNewFolderName('')
      await refreshLists()
      toast({ title: 'Folder created', description: 'Your writing workspace has a new folder.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create folder', description: error.message, variant: 'destructive' })
    },
  })

  const renameFolder = useMutation({
    mutationFn: ({ folderId, name }: { folderId: string; name: string }) => apiClient.updateInkwiseDocumentFolder(folderId, { name }),
    onSuccess: async () => {
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
      await refreshLists()
      toast({ title: 'Folder deleted', description: 'Documents in that folder were moved to Unfiled.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete folder', description: error.message, variant: 'destructive' })
    },
  })

  const moveDocument = useMutation({
    mutationFn: ({ documentId, folderId }: { documentId: string; folderId: string | null }) => apiClient.moveInkwiseDocument(documentId, folderId),
    onSuccess: async () => {
      await refreshLists()
    },
    onError: (error: Error) => {
      toast({ title: 'Could not move document', description: error.message, variant: 'destructive' })
    },
  })

  const groupedDocuments = useMemo(() => {
    const docs = documents.data?.items ?? []
    const groups = new Map<string, typeof docs>()
    groups.set(UNFILED_FOLDER_ID, [])
    for (const folder of folders.data?.items ?? []) groups.set(folder.id, [])
    for (const document of docs) {
      const key = document.folder_id || UNFILED_FOLDER_ID
      const current = groups.get(key) ?? []
      current.push(document)
      groups.set(key, current)
    }
    return groups
  }, [documents.data?.items, folders.data?.items])

  const sections = useMemo(() => {
    const folderSections = (folders.data?.items ?? []).map((folder) => ({
      id: folder.id,
      name: folder.name,
      isUnfiled: false,
      documents: groupedDocuments.get(folder.id) ?? [],
    }))
    return [
      {
        id: UNFILED_FOLDER_ID,
        name: 'Unfiled',
        isUnfiled: true,
        documents: groupedDocuments.get(UNFILED_FOLDER_ID) ?? [],
      },
      ...folderSections,
    ]
  }, [folders.data?.items, groupedDocuments])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Writing Workspace</CardTitle>
            <CardDescription>Open an existing draft, start a new grounded document, and organize documents into flat folders.</CardDescription>
          </div>
          <Button onClick={() => createDocument.mutate()} disabled={createDocument.isPending}>
            {createDocument.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            New document
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderPlus className="h-4 w-4" />
            Create Folder
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 md:flex-row">
          <Input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Folder name" />
          <Button onClick={() => createFolder.mutate()} disabled={createFolder.isPending || !newFolderName.trim()}>
            {createFolder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}
            Add folder
          </Button>
        </CardContent>
      </Card>

      {documents.isLoading || folders.isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading workspace...
          </CardContent>
        </Card>
      ) : sections.some((section) => section.documents.length) ? (
        sections.map((section) => (
          <section key={section.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600">{section.name}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{section.documents.length}</span>
              </div>
              {!section.isUnfiled ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const nextName = window.prompt('Rename folder', section.name)?.trim()
                      if (nextName && nextName !== section.name) {
                        renameFolder.mutate({ folderId: section.id, name: nextName })
                      }
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`Delete the folder "${section.name}"? Documents will move to Unfiled.`)) {
                        deleteFolder.mutate(section.id)
                      }
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>

            {section.documents.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.documents.map((document) => (
                  <Card key={document.id} className="h-full border-slate-200">
                    <CardContent className="flex h-full flex-col gap-4 p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                            <FilePenLine className="h-5 w-5" />
                          </div>
                          <h3 className="line-clamp-2 text-lg font-semibold text-slate-900">{document.title || 'Untitled document'}</h3>
                        </div>
                        <div className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">v{document.version}</div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Folder</div>
                        <Select
                          value={document.folder_id || UNFILED_FOLDER_ID}
                          onValueChange={(value) => moveDocument.mutate({ documentId: document.id, folderId: value === UNFILED_FOLDER_ID ? null : value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNFILED_FOLDER_ID}>Unfiled</SelectItem>
                            {(folders.data?.items ?? []).map((folder) => (
                              <SelectItem key={folder.id} value={folder.id}>
                                {folder.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-500">Updated {new Date(document.updated_at).toLocaleString()}</div>
                        <Button onClick={() => router.push(`/dashboard/inkwise/write/${document.id}`)}>Open</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6 text-sm text-slate-500">No documents in this folder.</CardContent>
              </Card>
            )}
          </section>
        ))
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="rounded-full bg-slate-100 p-4 text-slate-500">
              <FilePenLine className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-slate-900">No documents yet</p>
              <p className="text-sm text-slate-500">Create your first draft to start using Inkwise inside CPAAutomation.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
