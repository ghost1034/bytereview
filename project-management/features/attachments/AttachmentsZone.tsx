'use client'

/**
 * AttachmentsZone — task detail drop zone with upload, link, and cloud drive sources.
 */
import type { Task } from '../../types'
import { AttachmentListPanel } from './AttachmentListPanel'
import { useTaskAttachmentScope } from './useAttachmentScope'

type Props = { task: Task }

/** Full attachments block for the task detail pane. */
export function AttachmentsZone({ task }: Props) {
  const scope = useTaskAttachmentScope(task)
  return <AttachmentListPanel scope={scope} />
}
