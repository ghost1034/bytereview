import { unified } from 'unified'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'

export async function markdownToSafeHtml(markdown: string): Promise<string> {
  const value = (markdown || '').trim()
  if (!value) return ''

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize, {
      ...defaultSchema,
      attributes: {
        ...(defaultSchema.attributes || {}),
        a: [
          ...((((defaultSchema.attributes || {}) as Record<string, string[] | undefined>).a) || []),
          'href',
          'title',
          'target',
          'rel',
        ],
      },
    })
    .use(rehypeStringify)
    .process(value)

  return String(file)
}
