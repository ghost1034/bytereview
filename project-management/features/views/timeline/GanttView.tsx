'use client'

/** Distinct section-grouped Gantt view with baseline and today controls. */
import type { Project } from '../../../types'
import { TimelineView } from './TimelineView'

type Props = { project: Project; basePath: string }

export function GanttView(props: Props) {
  return <TimelineView {...props} variant="gantt" />
}
