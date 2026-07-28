'use client'

/**
 * ListToolbar — QueryToolbar plus column customizer for the List view.
 */
import type { CustomField, Section, Tag, User } from '../../../types'
import type { ViewQuery } from '../../../lib/query/applyQuery'
import { QueryToolbar } from '../../query/QueryToolbar'
import { ColumnCustomizer } from './ColumnCustomizer'
import { TaskUndoButton } from '../../ui/TaskUndoButton'
import type { ColumnDef } from '../../../stores/columns'

type Props = {
  query: ViewQuery
  onChange: (q: ViewQuery) => void
  projectId: string
  customFields: CustomField[]
  members: User[]
  sections: Section[]
  tags: Tag[]
  userId: string | null
  columns: ColumnDef[]
}

/** Top toolbar: filters, sort, group, search, and column customize. */
export function ListToolbar({
  query,
  onChange,
  projectId,
  customFields,
  members,
  sections,
  tags,
  userId,
  columns,
}: Props) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <QueryToolbar
          query={query}
          onChange={onChange}
          projectId={projectId}
          viewType="list"
          customFields={customFields}
          members={members}
          sections={sections}
          tags={tags}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <TaskUndoButton />
        <ColumnCustomizer userId={userId} projectId={projectId} columns={columns} />
      </div>
    </div>
  )
}
