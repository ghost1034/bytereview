'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, FileUp, Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const [activeTab, setActiveTab] = useState<string>('my')
  const categoryOptions = useMemo(() => categories.data?.items ?? [], [categories.data])
  const activeCategoryId = activeTab.startsWith('category:') ? Number(activeTab.split(':')[1]) : undefined
  const activeCategory = categoryOptions.find((category) => category.id === activeCategoryId)
  const systemTemplates = useInkwiseSystemTemplates(activeCategoryId)

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

  return (
    <Card data-tour="inkwise-templates">
      <CardHeader>
        <div>
          <CardTitle>Templates</CardTitle>
          <CardDescription>Switch between your personal templates and system template categories from a single top-level menu bar.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">
            <TabsTrigger value="my" className="rounded-xl px-4 py-2">My Templates</TabsTrigger>
            {categoryOptions.map((category) => (
              <TabsTrigger key={category.id} value={`category:${category.id}`} className="rounded-xl px-4 py-2">
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="my" className="mt-0">
            <div className="space-y-4">
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-slate-900">My Templates</div>
                  <div className="mt-1 text-sm text-slate-500">Create reusable document starters for recurring work.</div>
                </div>
                <div className="flex flex-wrap gap-2">
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
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {templates.isLoading ? (
                  <div className="col-span-full flex items-center gap-3 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading templates...
                  </div>
                ) : myTemplates.length ? (
                  myTemplates.map((template) => (
                    <Link key={template.id} href={`/dashboard/inkwise/templates/${template.id}`}>
                      <div className="h-full rounded-2xl border border-slate-200 p-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40">
                        <div className="font-semibold text-slate-900">{template.title}</div>
                        {template.description ? <div className="mt-1 text-sm text-slate-500">{template.description}</div> : null}
                        <div className="mt-3 text-xs text-slate-400">Updated {new Date(template.updated_at).toLocaleString()}</div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="col-span-full rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                    No personal templates yet.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {categoryOptions.map((category) => (
            <TabsContent key={category.id} value={`category:${category.id}`} className="mt-0">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-sky-50/50 p-4">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <Sparkles className="h-5 w-5 text-sky-600" />
                    {category.name}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Browse read-only system templates for the {category.name.toLowerCase()} category.
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {systemTemplates.isLoading && activeCategory?.id === category.id ? (
                    <div className="col-span-full flex items-center gap-3 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading system templates...
                    </div>
                  ) : activeCategory?.id === category.id && systemItems.length ? (
                    systemItems.map((template) => (
                      <Link key={template.id} href={`/dashboard/inkwise/templates/system/${template.id}`}>
                        <div className="h-full rounded-2xl border border-slate-200 p-4 transition-colors hover:border-sky-300 hover:bg-sky-50/40">
                          <div className="font-semibold text-slate-900">{template.title}</div>
                          {template.description ? <div className="mt-1 text-sm text-slate-500">{template.description}</div> : null}
                        </div>
                      </Link>
                    ))
                  ) : activeCategory?.id === category.id ? (
                    <div className="col-span-full rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                      No system templates are available in this category yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}
