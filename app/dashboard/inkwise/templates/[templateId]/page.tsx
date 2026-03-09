'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Trash2 } from 'lucide-react'

import { InkwiseEditor } from '@/components/inkwise/inkwise-editor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useInkwiseTemplate } from '@/hooks/useInkwise'
import { apiClient } from '@/lib/api'

export default function InkwiseTemplateDetailPage() {
  const params = useParams<{ templateId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const templateId = params.templateId
  const templateQuery = useInkwiseTemplate(templateId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [contentJson, setContentJson] = useState<Record<string, any> | null>(null)
  const [contentHtml, setContentHtml] = useState('')

  useEffect(() => {
    if (!templateQuery.data) return
    setTitle(templateQuery.data.title)
    setDescription(templateQuery.data.description || '')
    setIcon(templateQuery.data.icon || '')
    setContentJson(templateQuery.data.content_json ?? { type: 'doc', content: [{ type: 'paragraph' }] })
    setContentHtml('')
  }, [templateQuery.data])

  const saveTemplate = useMutation({
    mutationFn: async () => {
      return apiClient.updateInkwiseTemplate(templateId, {
        title,
        description,
        icon,
        content_json: contentJson ?? { type: 'doc', content: [{ type: 'paragraph' }] },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'template', templateId] })
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'templates'] })
      toast({ title: 'Template saved', description: 'Your Inkwise template changes are now stored.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save template', description: error.message, variant: 'destructive' })
    },
  })

  const deleteTemplate = useMutation({
    mutationFn: () => apiClient.deleteInkwiseTemplate(templateId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'templates'] })
      toast({ title: 'Template deleted', description: 'The template was removed.' })
      router.push('/dashboard/inkwise/templates')
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete template', description: error.message, variant: 'destructive' })
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Edit Template</CardTitle>
          <CardDescription>Adjust the metadata and JSON payload used to seed new Inkwise drafts.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => deleteTemplate.mutate()} disabled={deleteTemplate.isPending}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          <Button onClick={() => saveTemplate.mutate()} disabled={saveTemplate.isPending}>
            {saveTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="inkwise-template-title">Title</Label>
            <Input id="inkwise-template-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inkwise-template-icon">Icon</Label>
            <Input id="inkwise-template-icon" value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="Optional icon name" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inkwise-template-description">Description</Label>
          <Textarea id="inkwise-template-description" value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-[100px]" />
        </div>

        <div className="space-y-2">
          <Label>Template body</Label>
          <InkwiseEditor
            contentJson={contentJson as any}
            contentHtml={contentHtml}
            placeholder="Start building the template body..."
            onChange={(value) => {
              setContentJson(value.json as Record<string, any>)
              setContentHtml(value.html)
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
