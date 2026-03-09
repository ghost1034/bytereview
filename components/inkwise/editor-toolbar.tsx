'use client'

import type { Editor } from '@tiptap/core'

import { Button } from '@/components/ui/button'

export function InkwiseEditorToolbar({ editor }: { editor: Editor }) {
  const items = [
    { label: 'B', run: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), canRun: editor.can().chain().focus().toggleBold().run() },
    { label: 'I', run: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), canRun: editor.can().chain().focus().toggleItalic().run() },
    { label: 'H1', run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive('heading', { level: 1 }), canRun: editor.can().chain().focus().toggleHeading({ level: 1 }).run() },
    { label: 'H2', run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }), canRun: editor.can().chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Bullet', run: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList'), canRun: editor.can().chain().focus().toggleBulletList().run() },
    { label: 'Ordered', run: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList'), canRun: editor.can().chain().focus().toggleOrderedList().run() },
    { label: 'Quote', run: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote'), canRun: editor.can().chain().focus().toggleBlockquote().run() },
    { label: 'Undo', run: () => editor.chain().focus().undo().run(), active: false, canRun: editor.can().chain().focus().undo().run() },
    { label: 'Redo', run: () => editor.chain().focus().redo().run(), active: false, canRun: editor.can().chain().focus().redo().run() },
  ]

  return (
    <div className="flex flex-wrap gap-2 rounded-t-xl border-b bg-slate-50 p-3">
      {items.map((item) => (
        <Button
          key={item.label}
          type="button"
          size="sm"
          variant={item.active ? 'default' : 'outline'}
          onMouseDown={(event) => {
            event.preventDefault()
            item.run()
          }}
          disabled={!item.canRun}
        >
          {item.label}
        </Button>
      ))}
    </div>
  )
}
