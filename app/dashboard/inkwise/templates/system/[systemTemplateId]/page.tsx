'use client'

import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, Loader2 } from 'lucide-react'

import { InkwiseEditor } from '@/components/inkwise/inkwise-editor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useInkwiseSystemTemplate } from '@/hooks/useInkwise'
import { useToast } from '@/hooks/use-toast'
import { createInkwiseDocumentFromTemplate } from '@/lib/inkwise-template-documents'

export default function InkwiseSystemTemplateDetailPage() {
  const params = useParams<{ systemTemplateId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const templateQuery = useInkwiseSystemTemplate(params.systemTemplateId)
  const template = templateQuery.data

  const createDocument = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error('Template not loaded yet')
      return createInkwiseDocumentFromTemplate(template)
    },
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
      router.push(`/dashboard/inkwise/write/${document.id}`)
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create document', description: error.message, variant: 'destructive' })
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>{template?.title || 'System template'}</CardTitle>
          <CardDescription>{template?.description || 'Read-only starter content provided by Inkwise.'}</CardDescription>
        </div>
        <Button onClick={() => createDocument.mutate()} disabled={createDocument.isPending || !template}>
          {createDocument.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
          Use template
        </Button>
      </CardHeader>
      <CardContent>
        <InkwiseEditor
          contentJson={(template?.content_json as any) ?? { type: 'doc', content: [{ type: 'paragraph' }] }}
          contentHtml={null}
          editable={false}
          onChange={() => {}}
        />
      </CardContent>
    </Card>
  )
}
