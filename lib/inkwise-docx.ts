import type { JSONContent } from '@tiptap/core'
import mammoth from 'mammoth'

import { htmlToContentJson } from '@/lib/inkwise-tiptap'

export async function docxFileToContentJson(file: File): Promise<JSONContent> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
  return htmlToContentJson(result?.value || '')
}
