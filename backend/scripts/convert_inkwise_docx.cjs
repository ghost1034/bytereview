#!/usr/bin/env node

const fs = require('fs/promises')
const path = require('path')

const mammoth = require('mammoth')
const { generateJSON } = require('@tiptap/html')
const StarterKit = require('@tiptap/starter-kit').default

function htmlToContentJson(html) {
  try {
    return generateJSON(html || '', [StarterKit])
  } catch {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }
}

async function convertDocx(filePath) {
  const absolutePath = path.resolve(filePath)
  const buffer = await fs.readFile(absolutePath)
  const result = await mammoth.convertToHtml({ buffer })
  return {
    path: absolutePath,
    content_json: htmlToContentJson(result?.value || ''),
    warnings: Array.isArray(result?.messages)
      ? result.messages.map((message) => ({
          type: String(message?.type || 'warning'),
          message: String(message?.message || '').trim(),
        }))
      : [],
  }
}

async function main() {
  const filePaths = process.argv.slice(2)
  if (!filePaths.length) {
    console.error('Usage: node backend/scripts/convert_inkwise_docx.cjs <file.docx> [more.docx ...]')
    process.exit(1)
  }

  const output = []
  for (const filePath of filePaths) {
    output.push(await convertDocx(filePath))
  }
  process.stdout.write(JSON.stringify(output))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
