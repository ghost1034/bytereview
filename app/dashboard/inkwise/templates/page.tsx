'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, FileUp, Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useInkwiseSystemTemplateCategories, useInkwiseSystemTemplates, useInkwiseTemplates } from '@/hooks/useInkwise'
import { apiClient } from '@/lib/api'
import { docxFileToContentJson } from '@/lib/inkwise-docx'

export default function InkwiseTemplatesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const importRef = useRef<HTMLInputElement | null>(null)
  const templates = useInkwiseTemplates(1, 50)
  const categories = useInkwiseSystemTemplateCategories()
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const systemTemplates = useInkwiseSystemTemplates(categoryId)

  const createTemplate = useMutation({
    mutationFn: () => apiClient.createInkwiseTemplate({
      title: 'Untitled template',
      description: '',
      content_json: { type: 'doc', content: [{ type: 'paragraph' }] },
    }),
    onSuccess: async (template) => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'templates'] })
      toast({ title: 'Template created', description: 'You can now edit the new Inkwise template.' })
      router.push(`/dashboard/inkwise/templates/${template.id}`)
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create template', description: error.message, variant: 'destructive' })
    },
  })

  const importTemplate = useMutation({
    mutationFn: async (file: File) => {
      const contentJson = await docxFileToContentJson(file)
      const title = file.name.replace(/\.docx$/i, '').trim() || 'Imported template'
      return apiClient.createInkwiseTemplate({
        title,
        description: '',
        content_json: contentJson as Record<string, any>,
      })
    },
    onSuccess: async (template) => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'templates'] })
      toast({ title: 'Template imported', description: 'The DOCX file is now available as an Inkwise template.' })
      router.push(`/dashboard/inkwise/templates/${template.id}`)
    },
    onError: (error: Error) => {
      toast({ title: 'Could not import template', description: error.message, variant: 'destructive' })
    },
  })

  const myTemplates = templates.data?.items ?? []
  const systemItems = systemTemplates.data?.items ?? []
  const categoryOptions = useMemo(() => categories.data?.items ?? [], [categories.data])

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>My Templates</CardTitle>
            <CardDescription>Create reusable document starters for recurring work.</CardDescription>
          </div>
          <div className="flex gap-2">
            <input
              ref={importRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) importTemplate.mutate(file)
              }}
            />
            <Button variant="outline" onClick={() => importRef.current?.click()} disabled={importTemplate.isPending}>
              {importTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              Import DOCX
            </Button>
            <Button onClick={() => createTemplate.mutate()} disabled={createTemplate.isPending}>
              {createTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
              New template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.isLoading ? (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading templates...
            </div>
          ) : myTemplates.length ? (
            myTemplates.map((template) => (
              <Link key={template.id} href={`/dashboard/inkwise/templates/${template.id}`}>
                <div className="rounded-2xl border border-slate-200 p-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40">
                  <div className="font-semibold text-slate-900">{template.title}</div>
                  {template.description ? <div className="mt-1 text-sm text-slate-500">{template.description}</div> : null}
                  <div className="mt-3 text-xs text-slate-400">Updated {new Date(template.updated_at).toLocaleString()}</div>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
              No personal templates yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            System Templates
          </CardTitle>
          <CardDescription>Browse read-only template starters shipped with Inkwise.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inkwise-system-category">Category</Label>
            <select
              id="inkwise-system-category"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={categoryId ? String(categoryId) : ''}
              onChange={(event) => {
                const next = Number(event.target.value)
                setCategoryId(Number.isFinite(next) && next > 0 ? next : undefined)
              }}
            >
              <option value="">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {systemTemplates.isLoading ? (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading system templates...
              </div>
            ) : systemItems.length ? (
              systemItems.map((template) => (
                <Link key={template.id} href={`/dashboard/inkwise/templates/system/${template.id}`}>
                  <div className="rounded-2xl border border-slate-200 p-4 transition-colors hover:border-sky-300 hover:bg-sky-50/40">
                    <div className="font-semibold text-slate-900">{template.title}</div>
                    {template.description ? <div className="mt-1 text-sm text-slate-500">{template.description}</div> : null}
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                Pick a category to explore system templates.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
