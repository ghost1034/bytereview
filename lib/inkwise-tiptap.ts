import { generateHTML, generateJSON } from '@tiptap/html'
import type { JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

export const INKWISE_TIPTAP_EXTENSIONS = [StarterKit]

export function contentJsonToHtml(contentJson: JSONContent | null | undefined): string {
  if (!contentJson) return ''
  try {
    return generateHTML(contentJson, INKWISE_TIPTAP_EXTENSIONS)
  } catch {
    return ''
  }
}

export function htmlToContentJson(html: string): JSONContent {
  try {
    return generateJSON(html || '', INKWISE_TIPTAP_EXTENSIONS) as JSONContent
  } catch {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }
}
