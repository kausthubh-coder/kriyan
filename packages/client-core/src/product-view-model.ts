import type {
  CalendarEventItem,
  KnowledgeDocumentItem,
  ReminderDeliveryPolicy,
  ReminderItem,
  TaskItem,
  TaskPriority,
} from './types'

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

const DELIVERY_ORDER: Record<ReminderDeliveryPolicy, number> = {
  critical: 0,
  persistent: 1,
  normal: 2,
}

export interface TaskSections {
  overdue: TaskItem[]
  today: TaskItem[]
  upcoming: TaskItem[]
  unscheduled: TaskItem[]
}

function taskOrder(left: TaskItem, right: TaskItem): number {
  return PRIORITY_ORDER[left.priority ?? 'normal'] - PRIORITY_ORDER[right.priority ?? 'normal']
    || (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER)
    || left.taskId.localeCompare(right.taskId)
}

export function deriveTaskSections(
  tasks: readonly TaskItem[],
  dayStart: number,
  dayEnd: number,
): TaskSections {
  const sections: TaskSections = { overdue: [], today: [], upcoming: [], unscheduled: [] }
  for (const task of tasks) {
    if (task.deletedAt !== undefined || task.status !== 'open') continue
    if (task.dueAt === undefined) sections.unscheduled.push(task)
    else if (task.dueAt < dayStart) sections.overdue.push(task)
    else if (task.dueAt <= dayEnd) sections.today.push(task)
    else sections.upcoming.push(task)
  }
  sections.overdue.sort(taskOrder)
  sections.today.sort(taskOrder)
  sections.upcoming.sort(taskOrder)
  sections.unscheduled.sort(taskOrder)
  return sections
}

export function deriveReminderAttention(reminders: readonly ReminderItem[], now: number): ReminderItem[] {
  return reminders
    .filter((item) => item.deletedAt === undefined)
    .filter((item) => item.status !== 'cancelled' && item.status !== 'dismissed')
    .filter((item) => item.acknowledgedAt === undefined)
    .filter((item) => (item.nextFireAt ?? item.remindAt) <= now)
    .sort((left, right) => DELIVERY_ORDER[left.deliveryPolicy ?? 'normal'] - DELIVERY_ORDER[right.deliveryPolicy ?? 'normal']
      || (left.nextFireAt ?? left.remindAt) - (right.nextFireAt ?? right.remindAt)
      || left.reminderId.localeCompare(right.reminderId))
}

export function deriveCalendarAgenda(
  events: readonly CalendarEventItem[],
  startsAt: number,
  endsAt: number,
): CalendarEventItem[] {
  return events
    .filter((event) => event.deletedAt === undefined && event.lifecycle !== 'cancelled')
    .filter((event) => event.startAt <= endsAt && event.endAt >= startsAt)
    .sort((left, right) => left.startAt - right.startAt
      || left.endAt - right.endAt
      || left.calendarEventId.localeCompare(right.calendarEventId))
}

export interface KnowledgeCard {
  knowledgeDocumentId: string
  title: string
  summary: string
  tags: string[]
  provenanceCount: number
  ready: boolean
}

export function deriveKnowledgeCards(documents: readonly KnowledgeDocumentItem[]): KnowledgeCard[] {
  return documents
    .filter((document) => document.deletedAt === undefined)
    .map((document) => ({
      knowledgeDocumentId: document.knowledgeDocumentId,
      title: document.title,
      summary: document.summary,
      tags: [...document.tags],
      provenanceCount: document.provenanceIds.length,
      ready: document.syncState === 'synced' && document.indexState === 'indexed',
    }))
    .sort((left, right) => left.title.localeCompare(right.title)
      || left.knowledgeDocumentId.localeCompare(right.knowledgeDocumentId))
}
