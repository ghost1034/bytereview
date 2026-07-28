'use client'

/** Memoized workload matrix from entity stores. */
import { useMemo } from 'react'
import {
  buildTimeBuckets,
  buildWorkloadMatrix,
  resolveDateRange,
  type TimeScale,
  type WorkloadPreset,
  type WorkloadScope,
} from '../../lib/workload'
import {
  useCustomFieldsStore,
  useProjectsStore,
  useTasksStore,
  useTeamsStore,
  useUsersStore,
  useWorkspacesStore,
} from '../../stores/entities'
import type { ISODate } from '../../types'

type Options = {
  workspaceId: string
  scope: WorkloadScope
  preset: WorkloadPreset
  customStart?: ISODate
  customEnd?: ISODate
  scale: TimeScale
  effortFieldId?: string
}

/** Subscribe to tasks/users/projects and compute the workload grid. */
export function useWorkloadEffort(options: Options) {
  const { workspaceId, scope, preset, customStart, customEnd, scale, effortFieldId } = options
  const tasks = useTasksStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const projects = useProjectsStore((s) => s.list())
  const teams = useTeamsStore((s) => s.list())
  const customFields = useCustomFieldsStore((s) => s.list())
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))

  const range = useMemo(
    () => resolveDateRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  )

  const buckets = useMemo(
    () => buildTimeBuckets(range.start, range.end, scale),
    [range.start, range.end, scale]
  )

  const matrix = useMemo(
    () =>
      buildWorkloadMatrix({
        tasks,
        users,
        projects,
        teams,
        customFields,
        buckets,
        scale,
        rangeStart: range.start,
        rangeEnd: range.end,
        scope,
        workspaceMemberIds: workspace?.memberIds ?? [],
        effortFieldId,
      }),
    [
      tasks,
      users,
      projects,
      teams,
      customFields,
      buckets,
      scale,
      range.start,
      range.end,
      scope,
      workspace?.memberIds,
      effortFieldId,
    ]
  )

  return { range, buckets, matrix }
}
