import { describe, expect, test } from 'bun:test'

import type { ClientRepository } from '../src/repository'

export function repositoryBehaviorContract(
  name: string,
  createRepository: () => ClientRepository,
): void {
  describe(`${name} repository behavior contract`, () => {
    test('submits durable queued activity and keeps newest submissions first', async () => {
      const repository = createRepository()
      await repository.submitCommand('first')
      const second = await repository.submitCommand('second')
      expect(repository.activity.map((item) => item.command.input)).toEqual(['second', 'first'])
      expect(repository.activity[0]).toMatchObject({ state: 'queued', command: { commandId: second.ok ? second.value.commandId : '' } })
    })

    test('creates and transitions tasks with revision protection', async () => {
      const repository = createRepository()
      const result = await repository.createTask({ title: 'Practice Korean' })
      if (!result.ok) throw new Error(result.message)
      expect(await repository.setTaskStatus(result.value, 'completed')).toMatchObject({ ok: true })
      expect(repository.tasks[0]).toMatchObject({ status: 'completed', revision: 1 })
      expect(await repository.updateTask(result.value, { title: 'stale edit' })).toMatchObject({ ok: false, reason: 'stale_revision' })
    })

    test('creates, updates, and cancels reminders', async () => {
      const repository = createRepository()
      const result = await repository.createReminder({ message: 'Practice Korean', remindAt: 10, timezone: 'UTC' })
      if (!result.ok) throw new Error(result.message)
      expect(await repository.updateReminder(result.value, { remindAt: 20 })).toMatchObject({ ok: true })
      const updated = repository.reminders[0]!
      expect(await repository.cancelReminder(updated)).toMatchObject({ ok: true })
      expect(repository.reminders[0]?.status).toBe('cancelled')
    })
  })
}
