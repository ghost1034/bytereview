/**

 * Shared row descriptors for the List view virtualizer and render tree.

 */

import type { Section, Task } from '../../../types'

import {

  LIST_COMPLETE_COLUMN_WIDTH,

  LIST_SELECT_COLUMN_WIDTH,

} from '../../../stores/columns'



export {

  LIST_SELECT_COLUMN_WIDTH,

  LIST_COMPLETE_COLUMN_WIDTH,

  LIST_NAME_MIN_WIDTH,

  LIST_NAME_MAX_WIDTH,

} from '../../../stores/columns'



/** Fixed row height in pixels (spreadsheet-style). */

export const LIST_ROW_HEIGHT = 36



/** Combined sticky offset for the task name column. */

export const LIST_NAME_STICKY_LEFT = LIST_SELECT_COLUMN_WIDTH + LIST_COMPLETE_COLUMN_WIDTH



/** Header band height for column labels. */

export const LIST_HEADER_HEIGHT = 36



/** Virtualize when flat row count exceeds this threshold. */

export const LIST_VIRTUALIZE_THRESHOLD = 200



export type ListRow =

  | {

      kind: 'group-header'

      groupKey: string

      label: string

      section?: Section

      taskIds: string[]

      collapsed: boolean

      isSectionGroup: boolean

    }

  | { kind: 'add-task'; groupKey: string; sectionId?: string }

  | { kind: 'task'; task: Task; depth: number; groupKey: string; sectionId?: string }

  | { kind: 'add-subtask'; parentId: string; groupKey: string; sectionId?: string }

  | { kind: 'add-section' }

  | { kind: 'empty' }



export type ListDragKind = 'task' | 'section'

