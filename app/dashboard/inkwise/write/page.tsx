'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FilePenLine, Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useInkwiseDocuments } from '@/hooks/useInkwise'
import { apiClient } from '@/lib/api'

export default function InkwiseWritePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const documents = useInkwiseDocuments(1, 50)

  const createDocument = useMutation({
    mutationFn: () => apiClient.createInkwiseDocument({ title: 'Untitled document', content_html: '<p></p>' }),
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
      router.push(`/dashboard/inkwise/write/${document.id}`)
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not create document',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Writing Workspace</CardTitle>
            <CardDescription>
              Open an existing draft or start a new grounded document.
            </CardDescription>
          </div>
          <Button onClick={() => createDocument.mutate()} disabled={createDocument.isPending}>
            {createDocument.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            New document
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {documents.isLoading ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading documents...
            </CardContent>
          </Card>
        ) : documents.data?.items.length ? (
          documents.data.items.map((document) => (
            <Link key={document.id} href={`/dashboard/inkwise/write/${document.id}`}>
              <Card className="h-full border-slate-200 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-4 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <FilePenLine className="h-5 w-5" />
                      </div>
                      <h2 className="line-clamp-2 text-lg font-semibold text-slate-900">{document.title || 'Untitled document'}</h2>
                    </div>
                    <div className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      v{document.version}
                    </div>
                  </div>

                  <div className="mt-auto text-sm text-slate-500">
                    Updated {new Date(document.updated_at).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        ) : (
          <Card className="md:col-span-2 xl:col-span-3">
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
    </div>
  )
}
