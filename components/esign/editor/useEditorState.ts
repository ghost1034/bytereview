import type { EditorField } from './PdfFieldEditor'

export interface EditorHistoryState {
  fields: EditorField[]
  selectedIds: string[]
  clipboard: EditorField[]
  past: EditorField[][]
  future: EditorField[][]
}

export type EditorAction =
  | { type: 'sync'; fields: EditorField[] }
  | { type: 'select'; ids: string[] }
  | { type: 'commit'; fields: EditorField[]; selectedIds?: string[] }
  | { type: 'preview'; fields: EditorField[] }
  | { type: 'copy' }
  | { type: 'undo' }
  | { type: 'redo' }

export function initialEditorState(fields: EditorField[]): EditorHistoryState {
  return { fields, selectedIds: [], clipboard: [], past: [], future: [] }
}

export function editorReducer(state: EditorHistoryState, action: EditorAction): EditorHistoryState {
  if (action.type === 'sync') return state.fields === action.fields ? state : { ...state, fields: action.fields }
  if (action.type === 'select') return { ...state, selectedIds: action.ids }
  if (action.type === 'preview') return { ...state, fields: action.fields }
  if (action.type === 'copy') return {
    ...state,
    clipboard: state.fields.filter((field) => state.selectedIds.includes(field.id)).map((field) => ({ ...field })),
  }
  if (action.type === 'commit') return {
    ...state,
    past: [...state.past, state.fields],
    fields: action.fields,
    selectedIds: action.selectedIds ?? state.selectedIds,
    future: [],
  }
  if (action.type === 'undo' && state.past.length) return {
    ...state,
    fields: state.past[state.past.length - 1],
    past: state.past.slice(0, -1),
    future: [state.fields, ...state.future],
  }
  if (action.type === 'redo' && state.future.length) return {
    ...state,
    fields: state.future[0],
    past: [...state.past, state.fields],
    future: state.future.slice(1),
  }
  return state
}
