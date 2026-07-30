import { bucketKeyForDay, type TimeBucket, type TimeScale } from './buckets'
import { distributeTaskEffortByDay, findEstimateFieldId, taskOverlapsRange } from './effort'
import {
  effectiveBucketCapacity,
  utilizationForHours,
  userWeeklyCapacity,
} from './utilization'
import { filterTasksForScope, resolveWorkloadPeople, type WorkloadScope } from './scope'
import type { CustomField, Project, Task, Team, User } from '../../types'
import type { ISODate } from '../../types'
import type { UtilizationLevel } from './utilization'

export type WorkloadCell = {
  effortHours: number
  capacityHours: number
  ratio: number
  level: UtilizationLevel
  taskIds: string[]
}

export type WorkloadPersonRow = {
  userId: string
  label: string
  user?: User
  cells: Record<string, WorkloadCell>
  weekTotalHours: number
  overloadBucketCount: number
  utilizationPercent: number
}

export type WorkloadMatrix = {
  rows: WorkloadPersonRow[]
  hasEstimateField: boolean
  estimateFieldId?: string
  totalAssignedTasks: number
  overAllocatedPeople: number
}

type BuildInput = {
  tasks: Task[]
  users: User[]
  projects: Project[]
  teams: Team[]
  customFields: CustomField[]
  buckets: TimeBucket[]
  scale: TimeScale
  rangeStart: ISODate
  rangeEnd: ISODate
  scope: WorkloadScope
  workspaceMemberIds: string[]
  effortFieldId?: string
}

/** Build memoizable workload matrix for the visible range. */
export function buildWorkloadMatrix(input: BuildInput): WorkloadMatrix {
  const estimateFieldId = findEstimateFieldId(
    input.customFields.filter((f) => f.workspaceId === input.scope.workspaceId)
  )
  const scopedTasks = filterTasksForScope(input.tasks, input.projects, input.scope).filter((t) =>
    taskOverlapsRange(t, input.rangeStart, input.rangeEnd)
  )
  const people = resolveWorkloadPeople(
    scopedTasks,
    input.users,
    input.workspaceMemberIds,
    input.teams,
    input.scope
  )

  const effortByUserDay = new Map<string, Map<ISODate, { hours: number; taskIds: Set<string> }>>()

  scopedTasks.forEach((task) => {
    const userId = task.assigneeId ?? '__unassigned__'
    const dayMap = distributeTaskEffortByDay(task, estimateFieldId, input.effortFieldId)
    dayMap.forEach((hours, day) => {
      if (day < input.rangeStart || day > input.rangeEnd) return
      const userDays = effortByUserDay.get(userId) ?? new Map()
      const entry = userDays.get(day) ?? { hours: 0, taskIds: new Set<string>() }
      entry.hours += hours
      entry.taskIds.add(task.id)
      userDays.set(day, entry)
      effortByUserDay.set(userId, userDays)
    })
  })

  let overAllocatedPeople = 0
  const rows: WorkloadPersonRow[] = people.map(({ userId, user, label }) => {
    const cells: Record<string, WorkloadCell> = {}
    let weekTotalHours = 0
    let overloadBucketCount = 0

    input.buckets.forEach((bucket) => {
      let effortHours = 0
      const taskIds = new Set<string>()
      const userDays = effortByUserDay.get(userId)
      if (userDays) {
        userDays.forEach((entry, day) => {
          const key = bucketKeyForDay(day, input.scale)
          if (key !== bucket.key) return
          effortHours += entry.hours
          entry.taskIds.forEach((id) => taskIds.add(id))
        })
      }
      const capacityHours = effectiveBucketCapacity(user, bucket)
      const { ratio, level } = utilizationForHours(effortHours, capacityHours)
      if (level === 'over') overloadBucketCount += 1
      weekTotalHours += effortHours
      cells[bucket.key] = {
        effortHours,
        capacityHours,
        ratio,
        level,
        taskIds: [...taskIds],
      }
    })

    const weeklyCap = userWeeklyCapacity(user)
    const utilizationPercent = weeklyCap > 0 ? Math.round((weekTotalHours / weeklyCap) * 100) : 0
    if (utilizationPercent > 100) overAllocatedPeople += 1

    return {
      userId,
      label,
      user,
      cells,
      weekTotalHours,
      overloadBucketCount,
      utilizationPercent,
    }
  })

  return {
    rows,
    hasEstimateField: Boolean(estimateFieldId),
    estimateFieldId,
    totalAssignedTasks: scopedTasks.length,
    overAllocatedPeople,
  }
}
