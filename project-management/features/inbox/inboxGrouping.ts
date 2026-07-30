import {
  differenceInCalendarDays,
  isToday,
  isYesterday,
  startOfDay,
} from 'date-fns'
import type { Notification } from '../../types'
import type { InboxDateGroup } from './inboxTypes'
import { INBOX_DATE_LABELS } from './inboxTypes'

/** Assign a notification to a date bucket for list grouping. */
export function inboxDateGroup(createdAt: string): InboxDateGroup {
  const d = new Date(createdAt)
  if (isToday(d)) return 'today'
  if (isYesterday(d)) return 'yesterday'
  const days = differenceInCalendarDays(startOfDay(new Date()), startOfDay(d))
  if (days <= 7) return 'thisWeek'
  return 'earlier'
}

/** Group notifications into ordered date sections. */
export function groupInboxNotifications(
  notifications: Notification[]
): Array<{ key: InboxDateGroup; label: string; items: Notification[] }> {
  const order: InboxDateGroup[] = ['today', 'yesterday', 'thisWeek', 'earlier']
  const buckets: Record<InboxDateGroup, Notification[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  }
  notifications.forEach((n) => {
    buckets[inboxDateGroup(n.createdAt)].push(n)
  })
  return order
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: INBOX_DATE_LABELS[key], items: buckets[key] }))
}
