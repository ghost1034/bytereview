'use client'

import type { Editor } from '@tiptap/core'
import { useEffect, useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  TextQuote,
  Undo2,
  Redo2,
  Table as TableIcon,
  TableProperties,
  SeparatorHorizontal,
  StickyNote,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { addInkwiseComment, INKWISE_PAGE_BREAK_NODE } from '@/lib/inkwise-editor-extensions'
import { insertManualReferenceNote, type InkwiseEditorTarget } from '@/lib/inkwise-editor'

export function InkwiseEditorToolbar({
  editor,
  trackChangesEnabled = false,
  onTrackChangesEnabledChange,
  focusMode = false,
}: {
  editor: Editor
  trackChangesEnabled?: boolean
  onTrackChangesEnabledChange?: (enabled: boolean) => void
  focusMode?: boolean
}) {
  const [, setRenderTick] = useState(0)
  const [tableRows, setTableRows] = useState('3')
  const [tableColumns, setTableColumns] = useState('3')
  const [commentText, setCommentText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [commentOpen, setCommentOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const tableTargetRef = useRef<InkwiseEditorTarget | null>(null)

  useEffect(() => {
    const rerender = () => setRenderTick((value) => value + 1)
    editor.on('selectionUpdate', rerender)
    editor.on('transaction', rerender)
    return () => {
      editor.off('selectionUpdate', rerender)
      editor.off('transaction', rerender)
    }
  }, [editor])

  const hasSelection = !editor.state.selection.empty && Boolean(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, '\n').trim())
  const insideTable = editor.isActive('table')

  const items: { icon: LucideIcon; tooltip: string; run: () => boolean; active: boolean; canRun: boolean }[] = [
    { icon: Bold, tooltip: 'Bold', run: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), canRun: editor.can().chain().focus().toggleBold().run() },
    { icon: Italic, tooltip: 'Italic', run: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), canRun: editor.can().chain().focus().toggleItalic().run() },
    { icon: Heading1, tooltip: 'Heading 1', run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive('heading', { level: 1 }), canRun: editor.can().chain().focus().toggleHeading({ level: 1 }).run() },
    { icon: Heading2, tooltip: 'Heading 2', run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }), canRun: editor.can().chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: List, tooltip: 'Bullet list', run: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList'), canRun: editor.can().chain().focus().toggleBulletList().run() },
    { icon: ListOrdered, tooltip: 'Numbered list', run: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList'), canRun: editor.can().chain().focus().toggleOrderedList().run() },
    { icon: TextQuote, tooltip: 'Blockquote', run: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote'), canRun: editor.can().chain().focus().toggleBlockquote().run() },
    { icon: Undo2, tooltip: 'Undo', run: () => editor.chain().focus().undo().run(), active: false, canRun: editor.can().chain().focus().undo().run() },
    { icon: Redo2, tooltip: 'Redo', run: () => editor.chain().focus().redo().run(), active: false, canRun: editor.can().chain().focus().redo().run() },
  ]

  function preventEditorBlur(event: { preventDefault: () => void }) {
    event.preventDefault()
  }

  function captureTableTarget() {
    const { from, to, empty } = editor.state.selection
    tableTargetRef.current = {
      from,
      to,
      text: empty ? '' : editor.state.doc.textBetween(from, to, '\n'),
      hasSelection: !empty,
    }
  }

  function handleTableOpenChange(open: boolean) {
    if (open) {
      captureTableTarget()
    } else {
      tableTargetRef.current = null
    }
    setTableOpen(open)
  }

  function insertTable() {
    const rows = Math.max(1, Number.parseInt(tableRows, 10) || 3)
    const cols = Math.max(1, Number.parseInt(tableColumns, 10) || 3)
    const target = tableTargetRef.current
    const chain = editor.chain().focus()
    if (target) {
      chain.setTextSelection({ from: target.from, to: target.to })
      if (target.hasSelection) {
        chain.deleteSelection()
      }
    }
    chain.insertTable({ rows, cols, withHeaderRow: true }).run()
    tableTargetRef.current = null
    setTableOpen(false)
  }

  function insertComment() {
    if (!addInkwiseComment(editor, commentText)) return
    setCommentText('')
    setCommentOpen(false)
  }

  function insertNote(mode: 'footnote' | 'endnote') {
    if (!insertManualReferenceNote({ editor, noteText, mode })) return
    setNoteText('')
    setNoteOpen(false)
  }

  return (
    <div
      className={focusMode
        ? 'flex flex-wrap items-center gap-2 rounded-t-xl border-b border-white/20 bg-white/35 p-3 backdrop-blur-xl'
        : 'flex flex-wrap items-center gap-2 rounded-t-xl border-b bg-slate-50 p-3'}
    >
      {items.map((item) => (
        <Tooltip key={item.tooltip}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              className="h-8 w-8 p-0"
              variant={item.active ? 'default' : 'outline'}
              onMouseDown={(event) => {
                event.preventDefault()
                item.run()
              }}
              disabled={!item.canRun}
              aria-label={item.tooltip}
            >
              <item.icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{item.tooltip}</TooltipContent>
        </Tooltip>
      ))}

      <Popover open={tableOpen} onOpenChange={handleTableOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                className="h-8 w-8 p-0"
                variant="outline"
                onMouseDown={(event) => {
                  preventEditorBlur(event)
                  captureTableTarget()
                }}
                aria-label="Table"
              >
                <TableIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Table</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-72 space-y-3">
          <div>
            <div className="text-sm font-medium text-slate-900">Insert table</div>
            <div className="text-xs text-slate-500">Add a table, then manage rows and columns from the menu.</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inkwise-table-rows">Rows</Label>
              <Input id="inkwise-table-rows" value={tableRows} onChange={(event) => setTableRows(event.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inkwise-table-columns">Columns</Label>
              <Input id="inkwise-table-columns" value={tableColumns} onChange={(event) => setTableColumns(event.target.value)} inputMode="numeric" />
            </div>
          </div>
          <Button type="button" size="sm" onMouseDown={preventEditorBlur} onClick={insertTable}>
            Insert table
          </Button>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" className="h-8 w-8 p-0" variant="outline" onMouseDown={preventEditorBlur} disabled={!insideTable} aria-label="Table tools">
                <TableProperties className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Table tools</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Rows</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => editor.chain().focus().addRowBefore().run()}>Add row above</DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>Add row below</DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()}>Delete row</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => editor.chain().focus().addColumnBefore().run()}>Add column left</DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>Add column right</DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>Delete column</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            className="h-8 w-8 p-0"
            variant="outline"
            onMouseDown={preventEditorBlur}
            onClick={() => editor.chain().focus().insertContent({ type: INKWISE_PAGE_BREAK_NODE }).run()}
            aria-label="Page break"
          >
            <SeparatorHorizontal className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Page break</TooltipContent>
      </Tooltip>

      <Popover open={noteOpen} onOpenChange={setNoteOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" className="h-8 w-8 p-0" variant="outline" onMouseDown={preventEditorBlur} aria-label="Notes">
                <StickyNote className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Notes</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-80 space-y-3">
          <div>
            <div className="text-sm font-medium text-slate-900">Insert footnote or endnote</div>
            <div className="text-xs text-slate-500">The marker is inserted at the cursor or after the current selection.</div>
          </div>
          <Textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="Add the note text..."
            className="min-h-[110px]"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onMouseDown={preventEditorBlur} onClick={() => insertNote('footnote')} disabled={!noteText.trim()}>
              Footnote
            </Button>
            <Button type="button" size="sm" onMouseDown={preventEditorBlur} onClick={() => insertNote('endnote')} disabled={!noteText.trim()}>
              Endnote
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={commentOpen} onOpenChange={setCommentOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" className="h-8 w-8 p-0" variant="outline" onMouseDown={preventEditorBlur} disabled={!hasSelection} aria-label="Comment">
                <MessageSquare className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Comment</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-80 space-y-3">
          <div>
            <div className="text-sm font-medium text-slate-900">Add comment</div>
            <div className="text-xs text-slate-500">Comments stay inside the editor review workflow for this document.</div>
          </div>
          <Textarea
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder="Describe the revision or follow-up..."
            className="min-h-[110px]"
          />
          <Button type="button" size="sm" onMouseDown={preventEditorBlur} onClick={insertComment} disabled={!commentText.trim() || !hasSelection}>
            Save comment
          </Button>
        </PopoverContent>
      </Popover>

      <div className={focusMode ? 'ml-auto flex items-center gap-3 rounded-xl border border-white/20 bg-white/50 px-3 py-2 backdrop-blur' : 'ml-auto flex items-center gap-3 rounded-xl border bg-white px-3 py-2'}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Track changes</div>
          <div className="text-[11px] text-slate-500">Single-user review mode</div>
        </div>
        <Switch checked={trackChangesEnabled} onCheckedChange={(checked) => onTrackChangesEnabledChange?.(Boolean(checked))} />
      </div>
    </div>
  )
}
