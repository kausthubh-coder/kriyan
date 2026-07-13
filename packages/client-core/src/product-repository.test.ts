import { describe, expect, test } from 'bun:test'

import { productRepositoryContract } from '../testing/product-repository-contract'
import { ConvexProductRepository } from './convex-product-repository'
import { InMemoryClientRepository } from './in-memory'
import { InMemoryProductRepository } from './in-memory-product'
import {
  deriveCalendarAgenda,
  deriveKnowledgeCards,
  deriveReminderAttention,
  deriveTaskSections,
} from './product-view-model'

productRepositoryContract('in-memory client', () => new InMemoryClientRepository())
productRepositoryContract('injected Convex adapter', () =>
  new ConvexProductRepository(new InMemoryProductRepository()))

describe('product view models', () => {
  test('groups live tasks and ranks urgency deterministically', () => {
    const base = { status: 'open' as const, revision: 0, createdAt: 0, updatedAt: 0 }
    const sections = deriveTaskSections([
      { ...base, taskId: 'task:today-low', title: 'Low', priority: 'low', dueAt: 150 },
      { ...base, taskId: 'task:today-urgent', title: 'Urgent', priority: 'urgent', dueAt: 175 },
      { ...base, taskId: 'task:overdue', title: 'Overdue', dueAt: 50 },
      { ...base, taskId: 'task:later', title: 'Later', dueAt: 300 },
      { ...base, taskId: 'task:none', title: 'No date' },
      { ...base, taskId: 'task:deleted', title: 'Deleted', deletedAt: 1 },
    ], 100, 200)
    expect(sections.today.map((task) => task.taskId)).toEqual(['task:today-urgent', 'task:today-low'])
    expect(sections.overdue).toHaveLength(1)
    expect(sections.upcoming).toHaveLength(1)
    expect(sections.unscheduled).toHaveLength(1)
  })

  test('derives reminder attention, agenda overlap, and ready knowledge cards', () => {
    const reminderBase = { message: 'One', remindAt: 10, timezone: 'UTC', status: 'scheduled' as const, revision: 0, createdAt: 0, updatedAt: 0 }
    expect(deriveReminderAttention([
      { ...reminderBase, reminderId: 'normal', deliveryPolicy: 'normal' },
      { ...reminderBase, reminderId: 'critical', deliveryPolicy: 'critical' },
      { ...reminderBase, reminderId: 'future', nextFireAt: 30 },
    ], 20).map((item) => item.reminderId)).toEqual(['critical', 'normal'])

    const eventBase = { title: 'Event', timezone: 'UTC', allDay: false, lifecycle: 'confirmed' as const, revision: 0, createdAt: 0, updatedAt: 0 }
    expect(deriveCalendarAgenda([
      { ...eventBase, calendarEventId: 'overlap', startAt: 5, endAt: 15 },
      { ...eventBase, calendarEventId: 'outside', startAt: 30, endAt: 40 },
    ], 10, 20).map((item) => item.calendarEventId)).toEqual(['overlap'])

    expect(deriveKnowledgeCards([{
      knowledgeDocumentId: 'knowledge:1',
      kind: 'project',
      title: 'Kriyan',
      summary: 'Summary',
      tags: ['product'],
      sourceRefIds: ['source:1'],
      provenanceIds: ['source:1'],
      syncState: 'synced',
      indexState: 'indexed',
      revision: 0,
      createdAt: 0,
      updatedAt: 0,
    }])).toEqual([expect.objectContaining({ ready: true, provenanceCount: 1 })])
  })
})
