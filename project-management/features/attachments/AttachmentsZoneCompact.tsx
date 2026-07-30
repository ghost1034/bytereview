'use client'

/**
 * AttachmentsZoneCompact — minimal attachment picker for comment composers.
 */
import { AttachmentListPanel } from './AttachmentListPanel'
import { useAttachmentScope, type AttachmentScope } from './useAttachmentScope'

type Props = Omit<AttachmentScope, 'kind'> & {
  /** When true, hides the large dropzone once files exist. */
  inline?: boolean
}

/** Compact attachment UI reused by comment composers. */
export function AttachmentsZoneCompact({ inline, ...scopeProps }: Props) {
  const scope = useAttachmentScope({ ...scopeProps, kind: 'comment' })
  return (
    <AttachmentListPanel
      scope={scope}
      compact
      showDropzone={!inline || scope.attachments.length === 0}
    />
  )
}

export type { AttachmentScope }
