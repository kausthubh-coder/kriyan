import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000) })
afterEach(() => vi.useRealTimers())

test('snapshot revision advances when deleting the newest and last visible rows', async () => {
  const t = convexTest(schema, modules)
  const installationId = 'installation:snapshot-delete'
  await t.mutation(api.installations.create, { installationId, timezone: 'UTC', protocolVersion: '1' })
  for (const taskId of ['task:older', 'task:newest']) {
    await t.mutation(api.projections.createTask, { installationId, taskId, idempotencyKey: taskId, title: taskId, status: 'open' })
    vi.advanceTimersByTime(1)
  }
  const before = await t.query(api.read.clientSnapshot, { installationId })
  expect(before.transactionRevision).toBe(2)
  expect(before.productivity.tasks.map((task) => task.taskId)).toEqual(['task:newest', 'task:older'])

  await t.mutation(api.projections.tombstoneTask, { installationId, taskId: 'task:newest', expectedRevision: 0 })
  const afterNewest = await t.query(api.read.clientSnapshot, { installationId })
  expect(afterNewest.transactionRevision).toBe(3)
  expect(afterNewest.productivity.tasks.map((task) => task.taskId)).toEqual(['task:older'])

  await t.mutation(api.projections.tombstoneTask, { installationId, taskId: 'task:older', expectedRevision: 0 })
  const afterLast = await t.query(api.read.clientSnapshot, { installationId })
  expect(afterLast.transactionRevision).toBe(4)
  expect(afterLast.productivity.tasks).toEqual([])
})
