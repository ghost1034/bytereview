'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Loader2, Plus, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Dropzone } from '@/components/ui/dropzone'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import {
  useCreateEsignTemplate,
  useDeleteEsignTemplate,
  useEsignTemplates,
} from '@/hooks/useEnvelopes'

export default function EsignTemplatesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const templatesQuery = useEsignTemplates()
  const createTemplate = useCreateEsignTemplate()
  const deleteTemplate = useDeleteEsignTemplate()

  const [createOpen, setCreateOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [signerLabels, setSignerLabels] = React.useState<string[]>(['Signer 1'])
  const [files, setFiles] = React.useState<File[]>([])

  const resetCreate = () => {
    setName('')
    setSignerLabels(['Signer 1'])
    setFiles([])
  }

  const handleCreate = async () => {
    try {
      const template = await createTemplate.mutateAsync({
        name: name.trim(),
        recipientRoles: signerLabels.map((label, index) => ({
          label: label.trim() || `Signer ${index + 1}`,
          role: 'signer',
          routing_order: index + 1,
        })),
        files,
      })
      setCreateOpen(false)
      resetCreate()
      router.push(`/dashboard/esign/templates/${template.id}`)
    } catch (error) {
      toast({
        title: 'Failed to create template',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Signature"
        title="Templates"
        description="Reusable document layouts — place fields once for signer roles, then send to new recipients in seconds."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link href="/dashboard/esign">
                <ArrowLeft className="mr-1.5 size-4" /> Envelopes
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 size-4" /> New template
            </Button>
          </div>
        }
      />

      <div className="rounded-lg border border-border bg-surface">
        {templatesQuery.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (templatesQuery.data?.templates.length ?? 0) === 0 ? (
          <EmptyState
            icon={FileText}
            title="No templates yet"
            description="Create a template from PDFs, or save an envelope as a template from its review step."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 size-4" /> New template
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Fields</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templatesQuery.data!.templates.map((template) => (
                <TableRow
                  key={template.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/esign/templates/${template.id}`)}
                >
                  <TableCell className="font-medium">{template.name}</TableCell>
                  <TableCell className="text-foreground-muted">{template.documents.length}</TableCell>
                  <TableCell className="text-foreground-muted">
                    {(template.recipient_roles as { label?: string }[])
                      .map((r) => r.label)
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-foreground-muted">{template.fields.length}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        onClick={async (e) => {
                          e.stopPropagation()
                          router.push(`/dashboard/esign/new?template=${template.id}`)
                        }}
                      >
                        Use
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-foreground-muted hover:text-destructive"
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            await deleteTemplate.mutateAsync(template.id)
                            toast({ title: 'Template deleted' })
                          } catch (error) {
                            toast({
                              title: 'Failed to delete template',
                              description: error instanceof Error ? error.message : undefined,
                              variant: 'destructive',
                            })
                          }
                        }}
                        aria-label={`Delete ${template.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) resetCreate()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
            <DialogDescription>
              Upload the PDFs and name the signer roles. You&apos;ll place fields next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard engagement letter"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Signer roles (in signing order)</Label>
              {signerLabels.map((label, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={label}
                    onChange={(e) =>
                      setSignerLabels((prev) => prev.map((l, i) => (i === index ? e.target.value : l)))
                    }
                    placeholder={`Signer ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={signerLabels.length === 1}
                    onClick={() => setSignerLabels((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Remove role"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSignerLabels((prev) => [...prev, `Signer ${prev.length + 1}`])}
              >
                <Plus className="mr-1.5 size-4" /> Add role
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Documents</Label>
              <Dropzone
                onFiles={(incoming) =>
                  setFiles((prev) => [...prev, ...incoming.filter((f) => f.name.toLowerCase().endsWith('.pdf'))])
                }
                accept="application/pdf,.pdf"
                title="Drop PDFs here or click to upload"
                description=""
              />
              {files.length > 0 && (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <FileText className="size-4 shrink-0 text-foreground-muted" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                        className="text-foreground-muted hover:text-destructive"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || files.length === 0 || createTemplate.isPending}
            >
              {createTemplate.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create & place fields
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
