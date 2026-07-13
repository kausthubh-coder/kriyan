import { InMemoryProductRepository, type ProductRepository } from '@kriyan/client-core'

let repository: ProductRepository | undefined

async function seedDemo(next: ProductRepository): Promise<void> {
  const now = Date.now()
  await next.tasksV1.create({
    taskId: 'task:welcome', idempotencyKey: 'demo:task:welcome', title: 'Shape the week',
    description: 'Choose the three outcomes that matter most.', tags: ['weekly'], priority: 'high',
    dueAt: now + 86_400_000, projectId: 'project:kriyan', entityId: 'entity:weekly-review',
  })
  await next.tasksV1.create({
    taskId: 'task:notes', idempotencyKey: 'demo:task:notes', title: 'Review captured notes',
    tags: ['inbox'], priority: 'normal', dueAt: now + 172_800_000,
  })
  await next.remindersV1.create({
    reminderId: 'reminder:standup', idempotencyKey: 'demo:reminder:standup', message: 'Prepare tomorrow’s focus',
    remindAt: now + 7_200_000, nextFireAt: now + 7_200_000, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deliveryPolicy: 'normal', scheduleKey: 'demo:standup', linkedTaskId: 'task:welcome',
  })
  await next.calendarV1.create({
    calendarEventId: 'event:focus', idempotencyKey: 'demo:event:focus', title: 'Focus block',
    description: 'Protected work on the current priority.', startAt: now + 3_600_000, endAt: now + 7_200_000,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, allDay: false, lifecycle: 'confirmed',
  })
  await next.notesV1.create({
    noteId: 'note:welcome', idempotencyKey: 'demo:note:welcome', title: 'Welcome to Kriyan',
    contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Capture what matters. Kriyan keeps the confirmed version close, even while reconnecting.' }] }] }),
    plainTextPreview: 'Capture what matters. Kriyan keeps the confirmed version close, even while reconnecting.',
    wordCount: 13, tags: ['start'], entityId: 'entity:kriyan',
  })
  await next.sourceRefsV1.put({
    sourceRefId: 'source:core', idempotencyKey: 'demo:source:core', kind: 'document', displayName: 'Kriyan product contract',
    sourceUrl: 'https://github.com/', syncState: 'synced', indexState: 'indexed', provenanceIds: ['provenance:demo'], lastSyncedAt: now,
  })
  await next.knowledgeV1.put({
    knowledgeDocumentId: 'knowledge:weekly', idempotencyKey: 'demo:knowledge:weekly', kind: 'topic', title: 'Weekly planning',
    summary: 'A short ritual for turning captured material into a deliberate week.', tags: ['planning'],
    sourceRefIds: ['source:core'], provenanceIds: ['provenance:demo'], syncState: 'synced', indexState: 'indexed',
  })
}

export async function getDemoRepository(): Promise<ProductRepository> {
  if (repository) return repository
  const next = new InMemoryProductRepository()
  await seedDemo(next)
  repository = next
  return next
}
