import type { Notification } from '../../types'

/** Primary inbox / archive / snoozed view. */
export type InboxViewTab = 'inbox' | 'archive' | 'snoozed'

/** Quick filter tabs on the active inbox list. */
export type InboxFilterTab = 'all' | 'unread' | 'mentions' | 'assigned'

/** Date bucket labels for grouped lists. */
export type InboxDateGroup = 'today' | 'yesterday' | 'thisWeek' | 'earlier'

export const INBOX_DATE_LABELS: Record<InboxDateGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This week',
  earlier: 'Earlier',
}

export const NOTIFICATION_TYPE_LABELS: Record<Notification['type'], string> = {
  mention: 'Mentions',
  assigned: 'Assigned',
  due_soon: 'Due soon',
  comment_on_task: 'Comments',
  status_update: 'Status updates',
  project_message: 'Project messages',
  rule_action: 'Automations',
  form_submission: 'Form submissions',
  approval_request: 'Approvals',
  team_join_request: 'Team requests',
}
