'use client'

/** Context-aware quick prompt chips for the AI panel input area. */
import type { AiContextScope } from '../../lib/ai/types'

const BASE = [
  "What's overdue?",
  "What's blocked?",
  'Suggest custom fields',
  'Find risks',
]

export function getQuickPrompts(scope: AiContextScope | null): string[] {
  if (!scope) return BASE
  if (scope.type === 'project') {
    return ['Summarize this project', 'Draft a status update', "What's blocked?", 'Find risks']
  }
  if (scope.type === 'task') {
    return ['Summarize this task', 'Suggest subtasks', 'Improve description', 'Suggest priority & due date']
  }
  if (scope.type === 'goal') {
    return ['Summarize goal progress', 'Draft status update', 'Find risks']
  }
  if (scope.type === 'portfolio') {
    return ['Summarize portfolio', "What's at risk?", 'Draft status update']
  }
  return ['Summarize workspace', "What's overdue?", "What's blocked?", 'Find risks']
}
