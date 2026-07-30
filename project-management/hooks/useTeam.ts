'use client'

/** Single team by id from the entity store. */
import { useTeamsStore } from '../stores/entities'

export function useTeam(teamId: string | null | undefined) {
  return useTeamsStore((s) => (teamId ? s.getById(teamId) : undefined))
}
