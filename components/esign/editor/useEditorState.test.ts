import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState } from './useEditorState'
import type { EditorField } from './PdfFieldEditor'

const field: EditorField = { id: 'a', documentId: 'd', participantId: 'p', fieldType: 'text', pageNumber: 0, posX: 0, posY: 0, width: .2, height: .03, required: true }

describe('editorReducer', () => {
  it('undoes and redoes commits', () => {
    let state = initialEditorState([field])
    state = editorReducer(state, { type: 'commit', fields: [{ ...field, posX: .2 }] })
    state = editorReducer(state, { type: 'undo' })
    expect(state.fields[0].posX).toBe(0)
    state = editorReducer(state, { type: 'redo' })
    expect(state.fields[0].posX).toBe(.2)
  })
})
