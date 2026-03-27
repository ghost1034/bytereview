import { apiClient, type InkwiseDocument, type InkwiseSystemTemplate, type InkwiseTemplate } from '@/lib/api'
import { contentJsonToHtml } from '@/lib/inkwise-tiptap'

type InkwiseTemplateSeed = Pick<InkwiseTemplate, 'title' | 'content_json'> | Pick<InkwiseSystemTemplate, 'title' | 'content_json'>

export async function createInkwiseDocumentFromTemplate(template: InkwiseTemplateSeed): Promise<InkwiseDocument> {
  const contentJson = template.content_json ?? { type: 'doc', content: [{ type: 'paragraph' }] }

  return apiClient.createInkwiseDocument({
    title: (template.title || 'Untitled document').trim() || 'Untitled document',
    content_json: contentJson,
    content_html: contentJsonToHtml(contentJson),
  })
}
