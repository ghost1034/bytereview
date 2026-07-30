import type React from 'react'

/** Rich-text formatting helpers for contentEditable editors. */

export type RichTextCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bulletList'
  | 'numberedList'
  | 'blockquote'
  | 'code'
  | 'link'
  | 'clear'

/** Apply a formatting command inside the active contentEditable surface. */
export function applyRichTextCommand(command: RichTextCommand, value?: string): void {
  switch (command) {
    case 'bold':
      document.execCommand('bold')
      break
    case 'italic':
      document.execCommand('italic')
      break
    case 'underline':
      document.execCommand('underline')
      break
    case 'strikeThrough':
      document.execCommand('strikeThrough')
      break
    case 'h1':
      document.execCommand('formatBlock', false, 'h2')
      wrapSelectionHeading('tl-h1')
      break
    case 'h2':
      document.execCommand('formatBlock', false, 'h2')
      break
    case 'h3':
      document.execCommand('formatBlock', false, 'h3')
      break
    case 'bulletList':
      document.execCommand('insertUnorderedList')
      break
    case 'numberedList':
      document.execCommand('insertOrderedList')
      break
    case 'blockquote':
      document.execCommand('formatBlock', false, 'blockquote')
      break
    case 'code':
      document.execCommand('formatBlock', false, 'pre')
      break
    case 'link':
      if (value) document.execCommand('createLink', false, value)
      break
    case 'clear':
      document.execCommand('removeFormat')
      document.execCommand('unlink')
      break
    default:
      break
  }
}

function wrapSelectionHeading(className: string): void {
  const sel = window.getSelection()
  if (!sel?.rangeCount) return
  let node: Node | null = sel.anchorNode
  while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode
  const block = (node as Element | null)?.closest('h2,h3,blockquote,pre,p,div')
  if (block instanceof HTMLElement && !block.classList.contains(className)) {
    block.classList.add(className)
  }
}

/** Handle ⌘/Ctrl+B/I/U shortcuts while editing rich text. */
export function handleRichTextShortcut(event: React.KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false
  const key = event.key.toLowerCase()
  if (key === 'b') {
    event.preventDefault()
    applyRichTextCommand('bold')
    return true
  }
  if (key === 'i') {
    event.preventDefault()
    applyRichTextCommand('italic')
    return true
  }
  if (key === 'u') {
    event.preventDefault()
    applyRichTextCommand('underline')
    return true
  }
  return false
}
