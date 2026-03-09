'use client'

import { useParams } from 'next/navigation'

import { InkwiseEditor } from '@/components/inkwise/inkwise-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useInkwiseSystemTemplate } from '@/hooks/useInkwise'

export default function InkwiseSystemTemplateDetailPage() {
  const params = useParams<{ systemTemplateId: string }>()
  const templateQuery = useInkwiseSystemTemplate(params.systemTemplateId)
  const template = templateQuery.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>{template?.title || 'System template'}</CardTitle>
        <CardDescription>{template?.description || 'Read-only starter content provided by Inkwise.'}</CardDescription>
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
