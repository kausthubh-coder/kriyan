import { describe, expect, test } from 'bun:test'

import { getDemoRepository } from '../lib/demo-repository'
import { createClientId, notificationIntentKey, tipTapDocumentFromText, wordCount } from '../lib/ids'
import { channelForPolicy, NotificationIntentRegistry } from '../lib/notification-intents'

describe('mobile client helpers', () => {
  test('builds stable intent keys and policy channels', () => {
    expect(notificationIntentKey('reminder:1', 42)).toBe('reminder:reminder:1:42')
    expect(channelForPolicy('normal')).toBe('reminders')
    expect(channelForPolicy('persistent')).toBe('persistent-reminders')
    expect(channelForPolicy('critical')).toBe('critical-reminders')
  })

  test('deduplicates local notification records by intent key', () => {
    const registry = new NotificationIntentRegistry()
    registry.remember({ intentKey: 'reminder:r1:42', nativeId: 'native-1', scheduledFor: 42, deliveryPolicy: 'normal' })
    registry.remember({ intentKey: 'reminder:r1:42', nativeId: 'native-1', scheduledFor: 42, deliveryPolicy: 'normal' })
    expect(registry.findByReminder('r1')).toHaveLength(1)
    expect(registry.remove('reminder:r1:42')?.nativeId).toBe('native-1')
  })

  test('creates TipTap-compatible notes and accurate previews', () => {
    const document = JSON.parse(tipTapDocumentFromText('First line\nSecond line'))
    expect(document.type).toBe('doc')
    expect(document.content).toHaveLength(2)
    expect(wordCount(' First line\nSecond line ')).toBe(4)
  })

  test('creates unique client identities with a readable prefix', () => {
    expect(createClientId('task', 123)).toMatch(/^task:3f:/)
  })
})

describe('deterministic demo repository', () => {
  test('supports revision-aware task writes while preserving confirmed data', async () => {
    const repository = await getDemoRepository()
    const id = createClientId('task:test', 999)
    const created = await repository.tasksV1.create({ taskId: id, idempotencyKey: `test:${id}`, title: 'Test task', tags: ['test'] })
    expect(created).toMatchObject({ ok: true, revision: 0 })
    const updated = await repository.tasksV1.update({ taskId: id, expectedRevision: 0, patch: { status: 'completed', description: 'Confirmed' } })
    expect(updated).toMatchObject({ ok: true, revision: 1 })
    expect(await repository.tasksV1.update({ taskId: id, expectedRevision: 0, patch: { title: 'Stale' } })).toMatchObject({ ok: false, reason: 'stale_revision' })
    expect((await repository.tasksV1.list({ status: 'completed' })).items.find((task) => task.taskId === id)?.description).toBe('Confirmed')
  })
})
