import { describe, expect, test } from 'bun:test'

import type { TodaySnapshot } from './types'
import { deriveConnectionMode, mergeOptimistic, reconcilePatches } from './optimistic'
import { conflictMessage, deriveActivity, isNodeAvailable } from './view-model'

const base: TodaySnapshot = { tasks: [], reminders: [], commands: [], jobs: [], runs: [], nodes: [] }

describe('client-core view models', () => {
  test('derives queued honestly when no node has claimed the job', () => {
    const activity = deriveActivity({
      ...base,
      commands: [{ commandId: 'command:1', input: 'remind me', status: 'accepted', revision: 0, createdAt: 1, updatedAt: 1 }],
      jobs: [{ jobId: 'job:1', commandId: 'command:1', status: 'queued', attempt: 0, maxAttempts: 3, revision: 0, createdAt: 1, updatedAt: 1 }],
    })
    expect(activity[0]?.state).toBe('queued')
  })

  test('labels fake execution and completed state from the run', () => {
    const activity = deriveActivity({
      ...base,
      commands: [{ commandId: 'command:1', input: 'remind me', status: 'completed', revision: 1, createdAt: 1, updatedAt: 2 }],
      jobs: [{ jobId: 'job:1', commandId: 'command:1', status: 'succeeded', attempt: 1, maxAttempts: 3, revision: 2, createdAt: 1, updatedAt: 2 }],
      runs: [{ runId: 'run:1', jobId: 'job:1', nodeId: 'fake-node:1', status: 'succeeded', revision: 1, startedAt: 1, finishedAt: 2 }],
    })
    expect(activity[0]).toMatchObject({ state: 'completed', isFake: true })
  })

  test('requires both online status and a fresh heartbeat', () => {
    const node = { nodeId: 'node:1', displayName: 'Node', capabilities: [], status: 'online' as const, lastHeartbeatAt: 100_000, revision: 0 }
    expect(isNodeAvailable(node, 130_000)).toBe(true)
    expect(isNodeAvailable(node, 161_000)).toBe(false)
  })

  test('explains revision rollback without blaming the user', () => {
    expect(conflictMessage('stale_revision')).toContain('rolled back')
  })

  test('merges an optimistic patch until a newer server revision arrives', () => {
    const tasks = [{ taskId: 'task:1', title: 'Old', status: 'open' as const, revision: 2, createdAt: 1, updatedAt: 1 }]
    const patches = { 'task:1': { value: { title: 'New' }, baseRevision: 2 } }
    expect(mergeOptimistic(tasks, patches, (task) => task.taskId)[0]?.title).toBe('New')
    expect(Object.keys(reconcilePatches([{ ...tasks[0]!, revision: 3 }], patches, (task) => task.taskId))).toHaveLength(0)
  })

  test('distinguishes first connection, reconnect, and browser offline', () => {
    expect(deriveConnectionMode(true, false, false)).toBe('connecting')
    expect(deriveConnectionMode(true, false, true)).toBe('reconnecting')
    expect(deriveConnectionMode(false, true, true)).toBe('offline')
  })
})
