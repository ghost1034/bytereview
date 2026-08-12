import type { Workspace } from '../../types'

export function matterTerminology(workspace?: Workspace): { singular: string; plural: string; route: string } {
  return workspace?.psaMode === 'legal'
    ? { singular: 'Matter', plural: 'Matters', route: 'matters' }
    : { singular: 'Engagement', plural: 'Engagements', route: 'engagements' }
}
